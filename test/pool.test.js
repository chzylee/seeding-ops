'use strict';
// The tournament pool (docs/design-tool.md T2; dispatch-contract-tool-b.md Acceptance 2 and 3):
// the layout, the `current` swap, a crash mid-pull, resume from the new pull's _work/, one pull per
// tournament (the union of registrants, a player in two events fetched once), Refresh carrying the
// W-L cache by event id, and ticking a new event pulling only the new players. Offline, fake start.gg.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { run } = require('../lib/run');
const out = require('../lib/output');
const pool = require('../lib/pool');
const { reconcile } = require('../scripts/reconcile');
const { checkRequests } = require('../scripts/check-requests');
const { createApp } = require('../app/server');
const { inject } = require('../testlib/inject');
const { addTournament } = require('../testlib/pool-fixture');
const { buildWorld, createFakeFetch, virtualClock, sink, T_SLUG, E_SLUG, E2_SLUG, GAME, OTHER_GAME } = require('../testlib/fake-api');

const TOKEN = 'TOKEN-SENTINEL-c0ffee';
const START = Date.UTC(2026, 9, 12, 15, 0, 0);
const HOUR = 3_600_000;
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'seeding-pool-'));
const H = { 'X-Seeding-App': '1' };
const opOf = (init) => (/(?:query|mutation)\s+(\w+)/.exec(JSON.parse(init.body).query) || [])[1];

async function pull(outRoot, { events = [E_SLUG, E2_SLUG], at = START, world = buildWorld(START / 1000), mode, fetchOpts } = {}) {
  const clock = virtualClock(at);
  const fetchImpl = createFakeFetch(world, fetchOpts);
  const err = sink();
  const code = await run({ tournament: T_SLUG, events, mode, token: TOKEN, outRoot, fetchImpl, now: clock.now, sleep: clock.sleep, stderr: err, stdout: sink() });
  const tDir = path.join(outRoot, T_SLUG);
  const live = out.readCurrent(tDir);
  return { code, tDir, dir: live && path.join(tDir, live), fetchImpl, world, err: err.text() };
}
const csv = (dir, f) => out.parseCsv(fs.readFileSync(path.join(dir, f), 'utf8'));

test('pool layout: out/<t>/pull-<stamp>/ (players.csv with events, results.csv without is_event_game, meta.json, _work/) and current; W-L, state and schedule stay outside every pull', async () => {
  const outRoot = tmp();
  const r = await pull(outRoot);
  assert.strictEqual(r.code, 0, r.err);
  assert.match(path.basename(r.dir), /^pull-\d{8}-\d{6}$/);
  assert.strictEqual(fs.readFileSync(path.join(r.tDir, 'current'), 'utf8'), `${path.basename(r.dir)}\n`);
  assert.deepStrictEqual(fs.readdirSync(r.dir).sort(), ['_work', 'meta.json', 'players.csv', 'results.csv']);
  const players = csv(r.dir, 'players.csv');
  const results = csv(r.dir, 'results.csv');
  assert.deepStrictEqual(Object.keys(players[0]), out.PLAYER_COLUMNS);
  assert.ok(Object.keys(players[0]).includes('events'));
  assert.ok(!Object.keys(results[0]).includes('is_event_game'));
  assert.deepStrictEqual(reconcile(r.dir).checks.filter((c) => !c.ok), []);
  const meta = JSON.parse(fs.readFileSync(path.join(r.dir, 'meta.json'), 'utf8'));
  assert.deepStrictEqual(meta.tournament, { id: '77', slug: T_SLUG, name: 'Combo Breaker 2026', start_at: new Date((START / 1000 - 140 * 86400) * 1000).toISOString(), timezone: 'America/Chicago' });
  assert.deepStrictEqual(meta.seeded_events.map((e) => [e.slug, e.game.id, e.phases.length]), [[E_SLUG, String(GAME.id), 2], [E2_SLUG, String(OTHER_GAME.id), 1]]);
  // The pull never writes state.json, set-records.json or schedule.json, and none sits in a pull.
  assert.deepStrictEqual(fs.readdirSync(r.tDir).sort(), ['current', path.basename(r.dir)].sort());
  const files = fs.readdirSync(r.dir, { recursive: true });
  assert.ok(!files.some((f) => /state\.json|set-records|schedule\.json|standings/.test(f)), files.join(', '));
});

test('one pull per tournament: registrants are the union across the ticked events; a player in two events is fetched once', async () => {
  const outRoot = tmp();
  const r = await pull(outRoot);
  const players = csv(r.dir, 'players.csv');
  // 15 in the MBAACC event + MeleeOnly; Player101 and Player108 entered both.
  assert.strictEqual(players.length, 16);
  const by = Object.fromEntries(players.map((p) => [p.player_id, p]));
  assert.strictEqual(by['101'].events, `${E_SLUG};${E2_SLUG}`);
  assert.strictEqual(by['108'].events, `${E_SLUG};${E2_SLUG}`);
  assert.strictEqual(by['116'].events, E2_SLUG);
  assert.strictEqual(by['103'].events, E_SLUG);
  const ue = r.fetchImpl.calls.filter((c) => c.op === 'UserEvents');
  for (const uid of ['9001', '9008']) {
    const pages = ue.filter((c) => String(c.variables.userId) === uid).map((c) => c.variables.page);
    assert.deepStrictEqual(pages, uid === '9001' ? [1, 2] : [1], `user ${uid} fetched once (pages ${pages})`);
  }
  assert.strictEqual(new Set(ue.map((c) => String(c.variables.userId))).size, 15, 'every linked player once');
  const meta = JSON.parse(fs.readFileSync(path.join(r.dir, 'meta.json'), 'utf8'));
  assert.strictEqual(meta.registrant_anomalies.cross_event_repeats, 2);
  assert.deepStrictEqual(r.fetchImpl.calls.filter((c) => c.op === 'EventEntrants').map((c) => String(c.variables.eventId)), ['1000', '2000']);
  assert.strictEqual(r.fetchImpl.calls.filter((c) => c.op === 'TournamentEvents').length, 1);
});

test('the swap: a second pull is written beside the live one, current moves to it, and only then is the old pull deleted', async () => {
  const outRoot = tmp();
  const first = await pull(outRoot);
  // While the second pull runs, current still names the first: check at its last request.
  let seenDuring = null;
  const world = buildWorld(START / 1000);
  const fake = createFakeFetch(world);
  const clock = virtualClock(START + HOUR);
  const fetchImpl = async (u, init) => {
    if (opOf(init) === 'UserEvents') seenDuring = { current: out.readCurrent(first.tDir), firstExists: fs.existsSync(first.dir), pulls: out.listPulls(first.tDir).length };
    return fake(u, init);
  };
  const report = {};
  assert.strictEqual(await run({ tournament: T_SLUG, events: [E_SLUG, E2_SLUG], token: TOKEN, outRoot, fetchImpl, now: clock.now, sleep: clock.sleep, stderr: sink(), stdout: sink(), report }), 0);
  assert.deepStrictEqual(seenDuring, { current: path.basename(first.dir), firstExists: true, pulls: 2 });
  assert.strictEqual(out.readCurrent(first.tDir), path.basename(report.pullDir));
  assert.deepStrictEqual(report.swap.removed, [path.basename(first.dir)]);
  assert.ok(!fs.existsSync(first.dir));
  assert.ok(!fs.existsSync(path.join(first.tDir, 'current.tmp')));
});

test('a crash mid-pull leaves the old pull live and the app serving it; --resume finishes from the new pull\'s _work/ without refetching, then swaps', async () => {
  const outRoot = tmp();
  const first = await pull(outRoot);
  addTournament(outRoot, first.world, [E_SLUG, E2_SLUG]);
  const harness = path.join(__dirname, '..', 'testlib', 'fake-pull.js');
  const killed = spawnSync(process.execPath, [harness, outRoot, String(START), String(START + HOUR), '--events', `${E_SLUG},${E2_SLUG}`, '--kill-at', '9'], { encoding: 'utf8' });
  assert.notStrictEqual(killed.status, 0, 'the second pull was killed');
  const tDir = first.tDir;
  const pulls = out.listPulls(tDir);
  assert.strictEqual(pulls.length, 2);
  const crashed = pulls.find((p) => !p.finished);
  assert.ok(crashed && crashed.resumable, 'the new pull is unfinished and resumable');
  assert.deepStrictEqual(out.outputsPresent(crashed.dir), [], 'no final output in the crashed pull');
  assert.strictEqual(out.readCurrent(tDir), path.basename(first.dir), 'the old pull is still live');
  const app = createApp({ outRoot, getToken: () => TOKEN });
  const d = (await inject(app.handler, { url: `/api/t/${T_SLUG}/g/${GAME.id}/data` })).json();
  assert.strictEqual(d.run.folder, path.basename(first.dir));
  assert.strictEqual(d.players.length, 15);

  const before = out.readCheckpoint(crashed.dir).done.size;
  assert.ok(before >= 5, `checkpointed ${before}`);
  const resumed = spawnSync(process.execPath, [harness, outRoot, String(START), String(START + 2 * HOUR), '--resume', tDir], { encoding: 'utf8' });
  assert.strictEqual(resumed.status, 0, resumed.stderr);
  assert.match(resumed.stderr, new RegExp(`Resuming: ${before} of 16 players already checkpointed`));
  const chk = checkRequests(crashed.dir);
  assert.strictEqual(chk.resumes, 1);
  assert.deepStrictEqual(chk.refetched, []);
  assert.strictEqual(out.readCurrent(tDir), crashed.name, 'the resumed pull is swapped in');
  assert.ok(!fs.existsSync(first.dir), 'and the old pull deleted after the swap');
  assert.deepStrictEqual(reconcile(crashed.dir).checks.filter((c) => !c.ok), []);
});

test('Refresh re-pulls everyone and carries the W-L cache by event id: the second refresh repeats no set lookup', async () => {
  const outRoot = tmp();
  const world = buildWorld(START / 1000);
  await pull(outRoot, { world });
  addTournament(outRoot, world, [E_SLUG, E2_SLUG]);
  const fake = createFakeFetch(world);
  const sets = [];
  const fetchImpl = async (u, init) => {
    const op = opOf(init);
    const v = JSON.parse(init.body).variables;
    if (op === 'SetsBatch') for (let j = 0; `e${j}` in v; j++) sets.push(`${v[`e${j}`]}:${v[`u${j}`]}`);
    if (op === 'Sets') sets.push(`${v.eid}:${v.uid}`);
    return fake(u, init);
  };
  const clock = virtualClock(START + HOUR);
  const app = createApp({ outRoot, getToken: () => TOKEN, fetchImpl, now: clock.now, sleep: clock.sleep });
  const refresh = async () => {
    assert.strictEqual((await inject(app.handler, { url: `/api/t/${T_SLUG}/refresh`, method: 'POST', headers: H })).status, 202);
    await app.jobs.last.get(T_SLUG).promise;
    assert.strictEqual(app.jobs.status(T_SLUG).phase, 'done', app.jobs.status(T_SLUG).error);
  };
  await refresh();
  const firstSets = sets.length;
  const firstUE = fake.calls.filter((c) => c.op === 'UserEvents').length;
  assert.ok(firstSets > 20);
  await refresh();
  assert.strictEqual(sets.length, firstSets, 'no set lookup repeated: every W-L came from out/<t>/set-records.json');
  assert.strictEqual(fake.calls.filter((c) => c.op === 'UserEvents').length, 2 * firstUE, 'but every player\'s results were re-pulled (Refresh means everything)');
  const cache = JSON.parse(fs.readFileSync(path.join(outRoot, T_SLUG, 'set-records.json'), 'utf8'));
  for (const k of new Set(sets)) { const [eid, uid] = k.split(':'); const pid = String(world.players.find((p) => p.user && String(p.user.id) === uid).id); assert.ok(cache[`${pid}:${eid}`], k); }
});

test('ticking a new event is incremental: only players not yet in the pool are pulled; the pool keeps its window', async () => {
  const outRoot = tmp();
  const world = buildWorld(START / 1000);
  const first = await pull(outRoot, { world, events: [E_SLUG] });
  assert.strictEqual(csv(first.dir, 'players.csv').length, 15);
  const rows101 = csv(first.dir, 'results.csv').filter((x) => x.player_id === '101');
  addTournament(outRoot, world, [E_SLUG]);
  const fake = createFakeFetch(world);
  const clock = virtualClock(START + HOUR);
  const app = createApp({ outRoot, getToken: () => TOKEN, fetchImpl: fake, now: clock.now, sleep: clock.sleep });
  const r = await inject(app.handler, { url: `/api/t/${T_SLUG}/events`, method: 'POST', headers: H, body: JSON.stringify({ ticked: [E_SLUG, E2_SLUG] }) });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.json().added, [E2_SLUG]);
  assert.strictEqual(r.json().started, true, 'a newly ticked event with a pool present starts the incremental pull');
  await app.jobs.last.get(T_SLUG).promise;
  assert.strictEqual(app.jobs.status(T_SLUG).phase, 'done', app.jobs.status(T_SLUG).error);
  const ue = fake.calls.filter((c) => c.op === 'UserEvents').map((c) => String(c.variables.userId));
  assert.deepStrictEqual(ue, ['9016'], 'only MeleeOnly (116), the one player not yet in the pool');
  const tDir = path.join(outRoot, T_SLUG);
  const dir = path.join(tDir, out.readCurrent(tDir));
  assert.notStrictEqual(dir, first.dir);
  const players = csv(dir, 'players.csv');
  assert.strictEqual(players.length, 16);
  assert.strictEqual(players.find((p) => p.player_id === '101').events, `${E_SLUG};${E2_SLUG}`, 'carried players get the new event in `events`');
  assert.deepStrictEqual(csv(dir, 'results.csv').filter((x) => x.player_id === '101'), rows101, 'a carried player\'s rows are kept as they were');
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  assert.strictEqual(meta.mode, 'incremental');
  assert.deepStrictEqual([meta.incremental.carried, meta.incremental.fetched], [15, 1]);
  assert.strictEqual(meta.run_at, new Date(START).toISOString(), 'one window for the pool: the live pull\'s');
  assert.deepStrictEqual(reconcile(dir).checks.filter((c) => !c.ok), []);
  // A tab per ticked game now; the Melee tab holds the Melee event's three players.
  const d = (await inject(app.handler, { url: `/api/t/${T_SLUG}/g/${OTHER_GAME.id}/data` })).json();
  assert.deepStrictEqual(d.players.map((p) => p.player_id).sort(), ['101', '108', '116']);
  // Unticking hides the tab; no pull.
  const calls = fake.calls.length;
  const u = await inject(app.handler, { url: `/api/t/${T_SLUG}/events`, method: 'POST', headers: H, body: JSON.stringify({ ticked: [E_SLUG] }) });
  assert.strictEqual(u.json().started, null);
  assert.strictEqual(fake.calls.length, calls);
  assert.strictEqual((await inject(app.handler, { url: `/api/t/${T_SLUG}/g/${OTHER_GAME.id}/data` })).status, 404);
  assert.deepStrictEqual(pool.tabsOf(pool.readState(tDir), meta).map((t) => t.game.id), [String(GAME.id)]);
});
