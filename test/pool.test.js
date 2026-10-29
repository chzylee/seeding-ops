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

test('T3: side tournaments linked before increment 3 (conflicts/linked.json) seed a newly added tournament\'s state.json `linked`; the picker\'s singles test', () => {
  const dir = tmp();
  const legacy = path.join(dir, 'linked.json');
  fs.writeFileSync(legacy, JSON.stringify({ 'eclipse-1st-cour': ['2-on-block-presents-eclipse-community-games', '../bad'] }));
  const cat = (slug) => pool.catalogOf({ id: 1, slug: `tournament/${slug}`, name: 'X', startAt: 1, timezone: 'UTC', events: [] });
  assert.deepStrictEqual(pool.newState(cat('eclipse-1st-cour'), { linkedFile: legacy }).linked, ['2-on-block-presents-eclipse-community-games']);
  assert.deepStrictEqual(pool.newState(cat('other'), { linkedFile: legacy }).linked, []);
  // The shipped file still names Eclipse's side games, so adding Eclipse keeps that link.
  assert.deepStrictEqual(pool.legacyLinked('eclipse-1st-cour'), ['2-on-block-presents-eclipse-community-games']);
  assert.strictEqual(pool.isSingles({ type: 1, name: 'MBAACC Singles' }), true);
  assert.strictEqual(pool.isSingles({ type: 5, name: 'Crew Battle' }), false);
  assert.strictEqual(pool.isSingles({ type: 1, name: 'MBAACC 2v2' }), false, 'a 2v2 named event is not seedable even if typed 1');
  assert.strictEqual(pool.isSingles({ name: 'UNI2 Singles' }), true, 'no type: by name');
});

// ---- Build B pass 3 (repairs) --------------------------------------------------------------------

const metaOf = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
const rowsOf = (dir, pid) => csv(dir, 'results.csv').filter((x) => x.player_id === pid).map((x) => x.event_id).sort();
// The fake world plus: the no-account player (104) also entered the Melee event, with one Melee
// standing in the window and one out of it (D2-13).
function worldGuestInBoth() {
  const w = buildWorld(START / 1000);
  const guest = w.players.find((p) => p.id === 104);
  w.entrantsByEvent[2000].push({ id: 79999, participants: [guest] });
  const melee = (id, daysAgo) => ({ __typename: 'Event', id, slug: `tournament/t-${id}/event/e-${id}`, name: `Melee ${id}`, startAt: START / 1000 - daysAgo * 86400,
    numEntrants: 12, isOnline: false, videogame: OTHER_GAME, tournament: { name: `Melee T ${id}` } });
  guest.standings.push({ placement: 2, container: melee(98765, 15) }, { placement: 5, container: melee(98766, 800) });
  return w;
}

test('D2-2 / D2-13: an incremental pull reports the same skip and request counts as a fresh pull of the same players, and asks a carried no-account player about the newly seeded game only', async () => {
  const fresh = await pull(tmp(), { world: worldGuestInBoth() });
  assert.strictEqual(fresh.code, 0, fresh.err);
  const outRoot = tmp();
  const world = worldGuestInBoth();
  const first = await pull(outRoot, { world, events: [E_SLUG] });
  assert.strictEqual(first.code, 0, first.err);
  const inc = await pull(outRoot, { world, events: [E_SLUG, E2_SLUG], mode: 'incremental', at: START + HOUR });
  assert.strictEqual(inc.code, 0, inc.err);
  const rs = inc.fetchImpl.calls.filter((c) => /^RecentStandings/.test(c.op)).map((c) => [String(c.variables.playerId), String(c.variables.videogameId)]);
  assert.deepStrictEqual(rs, [['104', String(OTHER_GAME.id)]], 'the guest is asked about Melee only; the MBAACC answer is carried');
  assert.deepStrictEqual(inc.fetchImpl.calls.filter((c) => c.op === 'UserEvents').map((c) => String(c.variables.userId)), ['9016']);
  assert.deepStrictEqual(rowsOf(inc.dir, '104'), rowsOf(fresh.dir, '104'), "the guest's rows are those of a fresh pull of both games");
  assert.ok(rowsOf(inc.dir, '104').includes('98765'));
  const [m, f] = [metaOf(inc.dir), metaOf(fresh.dir)];
  assert.strictEqual(m.mode, 'incremental');
  assert.deepStrictEqual([m.incremental.carried, m.incremental.fetched, m.incremental.topped_up], [15, 1, 1]);
  assert.deepStrictEqual(m.skipped, f.skipped, 'skips of carried players are still counted (design.md: nothing dropped without being counted)');
  assert.ok(f.skipped.out_of_window > 0 && f.skipped.no_event_container > 0);
  assert.deepStrictEqual([m.registrant_count, m.result_count, m.history_status], [f.registrant_count, f.result_count, f.history_status]);
  assert.strictEqual(m.request_count, f.request_count, "request_count covers the carried players' requests");
  assert.strictEqual(m.requests_this_pull, inc.fetchImpl.calls.length, "requests_this_pull is this pull's own sends");
  assert.ok(m.requests_this_pull < m.request_count);
  assert.strictEqual(f.requests_this_pull, f.request_count, 'equal for a full pull');
  assert.deepStrictEqual(reconcile(inc.dir).checks.filter((c) => !c.ok), []);
  // And the counts survive a second incremental step: carried entries keep their skips and requests.
  const again = await pull(outRoot, { world, events: [E_SLUG, E2_SLUG], mode: 'incremental', at: START + 2 * HOUR });
  assert.deepStrictEqual([metaOf(again.dir).skipped, metaOf(again.dir).request_count], [f.skipped, f.request_count]);
  assert.deepStrictEqual(again.fetchImpl.calls.filter((c) => /^(RecentStandings|UserEvents)/.test(c.op)), [], 'nothing left to fetch');
});

test("D2-2: a retry pull (resume of a finished pull with a failed player) reports the same skips as a fresh pull; its request_count counts the carried players' requests", async () => {
  const clean = await pull(tmp());
  const outRoot = tmp();
  const failed = await pull(outRoot, { fetchOpts: { serverErrorPlayer: 9003 } });
  assert.strictEqual(failed.code, 1);
  const clock = virtualClock(START + HOUR);
  const fetchImpl = createFakeFetch(buildWorld(START / 1000));
  assert.strictEqual(await run({ resumeDir: failed.dir, token: TOKEN, fetchImpl, now: clock.now, sleep: clock.sleep, stderr: sink(), stdout: sink() }), 0);
  const tDir = path.join(outRoot, T_SLUG);
  const m = metaOf(path.join(tDir, out.readCurrent(tDir)));
  const f = metaOf(clean.dir);
  assert.strictEqual(m.mode, 'retry');
  assert.deepStrictEqual(m.skipped, f.skipped);
  assert.deepStrictEqual(m.history_status, f.history_status);
  assert.strictEqual(m.requests_this_pull, 1, 'one UserEvents page for the retried player');
  // The registrant list (1 TournamentEvents + 2 EventEntrants) is reused, not re-read, so a retry
  // counts the players' requests only: the clean pull's count less those three.
  const registrantRequests = clean.fetchImpl.calls.filter((c) => c.op === 'TournamentEvents' || c.op === 'EventEntrants').length;
  assert.strictEqual(registrantRequests, 3);
  assert.strictEqual(m.request_count, f.request_count - registrantRequests);
});

test('D2-7: if the old pull folder cannot be deleted after the swap, the pull still counts as done, the W-L runs, the leftover is reported, and the next pull deletes it', async () => {
  const outRoot = tmp();
  const world = buildWorld(START / 1000);
  const first = await pull(outRoot, { world });
  addTournament(outRoot, world, [E_SLUG, E2_SLUG]);
  const oldName = path.basename(first.dir);
  const realRm = fs.rmSync;
  fs.rmSync = function (p, o) {
    if (path.basename(String(p)) === oldName) throw Object.assign(new Error(`EBUSY: resource busy or locked, rmdir '${p}'`), { code: 'EBUSY' });
    return realRm.call(this, p, o);
  };
  const clock = virtualClock(START + HOUR);
  const app = createApp({ outRoot, getToken: () => TOKEN, fetchImpl: createFakeFetch(world), now: clock.now, sleep: clock.sleep });
  try {
    assert.strictEqual((await inject(app.handler, { url: `/api/t/${T_SLUG}/refresh`, method: 'POST', headers: H })).status, 202);
    await app.jobs.last.get(T_SLUG).promise;
  } finally { fs.rmSync = realRm; }
  const st = app.jobs.status(T_SLUG);
  assert.strictEqual(st.phase, 'done', st.error);
  assert.ok(st.wl.done > 0, 'the W-L ran');
  assert.match(st.message, new RegExp(`old pull folder ${oldName} could not be deleted yet`));
  assert.notStrictEqual(out.readCurrent(first.tDir), oldName, 'the new pull is live');
  assert.ok(fs.existsSync(first.dir), 'the leftover is still there');
  // The next pull's sweep of older folders removes it.
  const report = {};
  const c2 = virtualClock(START + 2 * HOUR);
  assert.strictEqual(await run({ tournament: T_SLUG, events: [E_SLUG, E2_SLUG], token: TOKEN, outRoot, fetchImpl: createFakeFetch(world), now: c2.now, sleep: c2.sleep, stderr: sink(), stdout: sink(), report }), 0);
  assert.ok(report.swap.removed.includes(oldName), report.swap.removed.join(','));
  assert.deepStrictEqual(report.swap.leftover, []);
  assert.ok(!fs.existsSync(first.dir));
  assert.deepStrictEqual(out.listPulls(first.tDir).map((p) => p.name), [path.basename(report.pullDir)]);
});

test("D2-5: the CLI's tick merges into state.json as it is at write time; the app's fields saved meanwhile survive, and a state.json is created only when none exists", async () => {
  const { tickFromUrls } = require('../pull');
  const outRoot = tmp();
  const world = buildWorld(START / 1000);
  const tDir = addTournament(outRoot, world, [E_SLUG]);
  // A stale catalog (no Melee event yet), so the CLI must ask start.gg for the events; while that
  // request is out, the app saves a lifecycle mark, a link and a push record.
  pool.updateState(tDir, (s) => { s.events = s.events.filter((e) => e.slug !== E2_SLUG); });
  const fake = createFakeFetch(world);
  const appWrites = { marked_done: '2026-10-29T12:00:00.000Z', linked: ['cb-side-games'], pushes: [{ event: E_SLUG, phase_id: '5001', at: '2026-10-29T12:00:00.000Z', seed_count: 16 }] };
  const fetchImpl = async (u, init) => {
    if (opOf(init) === 'TournamentEvents') pool.updateState(tDir, (s) => Object.assign(s, appWrites));
    return fake(u, init);
  };
  const picked = await tickFromUrls({ urls: [`https://www.start.gg/tournament/${T_SLUG}/event/${E2_SLUG}`], token: TOKEN, outRoot, fetchImpl, stderr: sink() });
  assert.deepStrictEqual(picked.events, [E_SLUG, E2_SLUG]);
  assert.ok(picked.apiT, 'the catalog response goes on to the pull (D2-9)');
  const s = pool.readState(tDir);
  assert.deepStrictEqual([s.marked_done, s.linked, s.pushes], [appWrites.marked_done, appWrites.linked, appWrites.pushes], "the app's fields are never overwritten");
  assert.deepStrictEqual(s.ticked, [E_SLUG, E2_SLUG]);
  assert.strictEqual(s.events.length, 3, 'the catalog is refreshed');
  // No state.json yet: the CLI creates it.
  const o2 = tmp();
  const p2 = await tickFromUrls({ urls: [`https://www.start.gg/tournament/${T_SLUG}/event/${E_SLUG}`], token: TOKEN, outRoot: o2, fetchImpl: createFakeFetch(world), stderr: sink() });
  assert.deepStrictEqual(p2.events, [E_SLUG]);
  assert.deepStrictEqual(pool.readState(path.join(o2, T_SLUG)).ticked, [E_SLUG]);
});

test("D2-9: a CLI pull uses one client (one limiter) for the catalog request and the pull, asks for the tournament's events once, and logs that request in the pull's request log", async () => {
  const { main } = require('../pull');
  const sgg = require('../lib/startgg');
  const world = buildWorld(START / 1000);
  for (const withState of [false, true]) {
    const outRoot = tmp();
    if (withState) addTournament(outRoot, world, []); // the catalog is known: the pull asks once
    const fake = createFakeFetch(world);
    const real = sgg.createClient;
    let made = 0;
    sgg.createClient = (o) => { made++; return real(o); };
    let code;
    try {
      code = await main([`https://www.start.gg/tournament/${T_SLUG}/event/${E_SLUG}`, `https://www.start.gg/tournament/${T_SLUG}/event/${E2_SLUG}`],
        { outRoot, token: TOKEN, fetchImpl: fake, stderr: sink(), stdout: sink() });
    } finally { sgg.createClient = real; }
    assert.strictEqual(code, 0, `withState ${withState}`);
    assert.strictEqual(made, 1, `one client for the whole run (withState ${withState})`);
    assert.strictEqual(fake.calls.filter((c) => c.op === 'TournamentEvents').length, 1, `the events asked for once (withState ${withState})`);
    const tDir = path.join(outRoot, T_SLUG);
    const dir = path.join(tDir, out.readCurrent(tDir));
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
    assert.strictEqual(m.request_count, fake.calls.length, 'every request of the run is counted, the catalog request included');
    assert.strictEqual(out.readRequestLog(dir)[0].op, 'TournamentEvents');
    assert.deepStrictEqual(pool.readState(tDir).ticked, [E_SLUG, E2_SLUG]);
  }
});

test('D2-1: ticking a new event while a job runs saves the tick, queues the incremental pull behind the job and says so; the pull runs when the job ends and fills the new tab', async () => {
  const outRoot = tmp();
  const world = buildWorld(START / 1000);
  await pull(outRoot, { world, events: [E_SLUG] });
  addTournament(outRoot, world, [E_SLUG]);
  const fake = createFakeFetch(world);
  // Hold the Refresh's W-L open (its first set lookup waits) so the tick lands mid-job.
  let release;
  const gate = new Promise((r) => { release = r; });
  let held = false;
  const order = [];
  const fetchImpl = async (u, init) => {
    const op = opOf(init);
    order.push(op);
    if (/^Sets/.test(op) && !held) { held = true; await gate; }
    return fake(u, init);
  };
  const clock = virtualClock(START + HOUR);
  const app = createApp({ outRoot, getToken: () => TOKEN, fetchImpl, now: clock.now, sleep: clock.sleep });
  assert.strictEqual((await inject(app.handler, { url: `/api/t/${T_SLUG}/refresh`, method: 'POST', headers: H })).status, 202);
  while (!held) await new Promise((r) => setImmediate(r));
  assert.strictEqual(app.jobs.status(T_SLUG).phase, 'wl');
  const r = await inject(app.handler, { url: `/api/t/${T_SLUG}/events`, method: 'POST', headers: H, body: JSON.stringify({ ticked: [E_SLUG, E2_SLUG] }) });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual([r.json().added, r.json().addedNames, r.json().started, r.json().queued], [[E2_SLUG], ['Melee Singles'], false, true]);
  assert.deepStrictEqual(pool.readState(path.join(outRoot, T_SLUG)).ticked, [E_SLUG, E2_SLUG], 'the tick is saved');
  assert.strictEqual(app.jobs.status(T_SLUG).queued, true, 'the status says a pull is queued');
  // A second tick of the same tournament while queued adds no second entry.
  await inject(app.handler, { url: `/api/t/${T_SLUG}/events`, method: 'POST', headers: H, body: JSON.stringify({ ticked: [E_SLUG] }) });
  await inject(app.handler, { url: `/api/t/${T_SLUG}/events`, method: 'POST', headers: H, body: JSON.stringify({ ticked: [E_SLUG, E2_SLUG] }) });
  assert.strictEqual(app.jobs.waiting.length, 1);
  assert.ok(!order.includes('EventEntrants') || order.lastIndexOf('EventEntrants') < order.indexOf('SetsBatch'), 'nothing of the queued pull ran yet');
  release();
  await app.jobs.idle();
  const st = app.jobs.status(T_SLUG);
  assert.strictEqual(st.phase, 'done', st.error);
  assert.strictEqual(st.queued, false);
  const tDir = path.join(outRoot, T_SLUG);
  const m = JSON.parse(fs.readFileSync(path.join(tDir, out.readCurrent(tDir), 'meta.json'), 'utf8'));
  assert.strictEqual(m.mode, 'incremental');
  assert.deepStrictEqual(m.seeded_events.map((e) => e.slug), [E_SLUG, E2_SLUG]);
  // The new game's tab: its three players, including the two already in the pool.
  const d = (await inject(app.handler, { url: `/api/t/${T_SLUG}/g/${OTHER_GAME.id}/data` })).json();
  assert.deepStrictEqual(d.players.map((p) => p.player_id).sort(), ['101', '108', '116']);
  // The page's status line and polling know the queued state.
  const js = fs.readFileSync(path.join(__dirname, '..', 'app', 'public', 'tournament.js'), 'utf8');
  assert.match(js, /ticked; pulling \$\{[^}]+\} players after the current job/);
  assert.match(js, /st\.running \|\| st\.busy \|\| st\.queued/);
});

test('D2-7 (Windows partial delete, observed in pass 3): a leftover the delete stopped partway is never resumed; --resume never swaps an older pull in over the live one', async () => {
  const outRoot = tmp();
  const world = buildWorld(START / 1000);
  const first = await pull(outRoot, { world });
  const oldName = path.basename(first.dir);
  // What a locked players.csv did to a recursive delete on Windows: meta.json went, then EBUSY.
  const realRm = fs.rmSync;
  fs.rmSync = function (p, o) {
    if (path.basename(String(p)) === oldName) {
      realRm.call(this, path.join(String(p), 'meta.json'), { force: true });
      throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
    }
    return realRm.call(this, p, o);
  };
  const report = {};
  try {
    const c = virtualClock(START + HOUR);
    assert.strictEqual(await run({ tournament: T_SLUG, events: [E_SLUG, E2_SLUG], token: TOKEN, outRoot, fetchImpl: createFakeFetch(world), now: c.now, sleep: c.sleep, stderr: sink(), stdout: sink(), report }), 0);
  } finally { fs.rmSync = realRm; }
  const live = path.basename(report.pullDir);
  assert.deepStrictEqual(report.swap.leftover.map((l) => l.name), [oldName]);
  assert.ok(!fs.existsSync(path.join(first.dir, 'meta.json')) && fs.existsSync(path.join(first.dir, 'players.csv')), 'partly deleted');
  assert.ok(!fs.existsSync(path.join(first.dir, '_work', 'run.json')), 'the resume marker went first');
  // Neither a tournament-folder resume nor naming the leftover finishes it.
  const err = sink();
  assert.strictEqual(await run({ resumeDir: first.tDir, token: TOKEN, fetchImpl: createFakeFetch(world), stderr: err, stdout: sink() }), 2);
  assert.match(err.text(), /Nothing to resume/);
  assert.strictEqual(out.readCurrent(first.tDir), live);
  // Even a leftover that kept its run.json (put back by hand here) is refused, by name or by folder.
  fs.mkdirSync(path.join(first.dir, '_work'), { recursive: true });
  fs.copyFileSync(path.join(first.tDir, live, '_work', 'run.json'), path.join(first.dir, '_work', 'run.json'));
  const e2 = sink();
  assert.strictEqual(await run({ resumeDir: first.dir, token: TOKEN, fetchImpl: createFakeFetch(world), stderr: e2, stdout: sink() }), 2);
  assert.match(e2.text(), new RegExp(`${oldName} is older than the live pull ${live}`));
  assert.strictEqual(await run({ resumeDir: first.tDir, token: TOKEN, fetchImpl: createFakeFetch(world), stderr: sink(), stdout: sink() }), 2);
  assert.strictEqual(out.readCurrent(first.tDir), live, 'the live pull never went back');
  assert.ok(fs.existsSync(path.join(first.tDir, live, 'meta.json')));
});
