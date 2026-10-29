'use strict';
// The tournament page and its jobs (docs/design-tool.md Pages, T3 and Lifecycle;
// dispatch-contract-tool-b.md Acceptance 4, 5, 6, 7 and 10), through the app's handler in memory
// against the fake start.gg. Offline.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { run } = require('../lib/run');
const out = require('../lib/output');
const pool = require('../lib/pool');
const data = require('../lib/view/data');
const M = require('../lib/view/model');
const { createApp } = require('../app/server');
const { inject } = require('../testlib/inject');
const { addTournament, makePool } = require('../testlib/pool-fixture');
const { buildWorld, createFakeFetch, virtualClock, sink, T_SLUG, E_SLUG, E2_SLUG, GAME, OTHER_GAME, EVENT_SLUG } = require('../testlib/fake-api');

const TOKEN = 'TOKEN-SENTINEL-c0ffee';
const START = Date.UTC(2026, 9, 12, 15, 0, 0);
const HOUR = 3_600_000;
const DAY = 86_400_000;
const H = { 'X-Seeding-App': '1' };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'seeding-t-'));
const opOf = (init) => (/(?:query|mutation)\s+(\w+)/.exec(JSON.parse(init.body).query) || [])[1];
const sha = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
const TAPI = `/api/t/${T_SLUG}`;
const post = (app, url, body) => inject(app.handler, { url, method: 'POST', headers: H, body: JSON.stringify(body || {}) });

// A pulled pool of both events (state.json ticked as the app would leave it).
async function pooled(outRoot, world = buildWorld(START / 1000), events = [E_SLUG, E2_SLUG]) {
  addTournament(outRoot, world, events);
  const clock = virtualClock(START);
  assert.strictEqual(await run({ tournament: T_SLUG, events, token: TOKEN, outRoot, fetchImpl: createFakeFetch(world), now: clock.now, sleep: clock.sleep, stderr: sink(), stdout: sink() }), 0);
  return path.join(outRoot, T_SLUG);
}

// ---- Acceptance 4: pages --------------------------------------------------------------------

test('add a tournament: an event URL makes ONE synchronous events request; state.json gets the catalog, teams events marked not seedable, nothing ticked', async () => {
  const outRoot = tmp();
  const world = buildWorld(START / 1000);
  const fake = createFakeFetch(world);
  const app = createApp({ outRoot, getToken: () => TOKEN, fetchImpl: fake });
  assert.strictEqual((await inject(app.handler, { url: '/api/tournaments', method: 'POST', body: '{}' })).status, 403);
  assert.strictEqual((await post(app, '/api/tournaments', { url: 'not a link' })).status, 400);
  assert.strictEqual(fake.calls.length, 0);
  const r = await post(app, '/api/tournaments', { url: `https://www.start.gg/${EVENT_SLUG}/overview` });
  assert.strictEqual(r.status, 200, r.text);
  assert.deepStrictEqual(r.json(), { t: T_SLUG, added: true, page: `/t/${T_SLUG}?tick=${E_SLUG}` });
  assert.deepStrictEqual(fake.calls.map((c) => c.op), ['TournamentEvents']);
  const st = pool.readState(path.join(outRoot, T_SLUG));
  assert.deepStrictEqual(st.events.map((e) => [e.slug, e.singles]), [[E_SLUG, true], [E2_SLUG, true], ['mbaacc-2v2', false]]);
  assert.deepStrictEqual(st.ticked, [], 'Noah ticks; adding ticks nothing');
  // The picker is singles-only: a teams event cannot be ticked.
  const bad = await post(app, `${TAPI}/events`, { ticked: ['mbaacc-2v2'] });
  assert.strictEqual(bad.status, 400);
  assert.match(bad.json().error, /not a singles event/);
  assert.strictEqual((await post(app, `${TAPI}/events`, { ticked: ['nope'] })).status, 400);
  const ok = await post(app, `${TAPI}/events`, { ticked: [E2_SLUG, E_SLUG] });
  // Build B pass 3 (D2-1): the response also names the added events and says whether a pull was queued.
  assert.deepStrictEqual(ok.json(), { ticked: [E_SLUG, E2_SLUG], added: [E_SLUG, E2_SLUG], addedNames: ['Melty Blood: Actress Again Current Code', 'Melee Singles'], started: null, queued: false }, 'catalog order; no pool yet, so no pull');
  // Re-adding refreshes the catalog and keeps every decision.
  await post(app, '/api/tournaments', { url: `https://start.gg/tournament/${T_SLUG}` });
  assert.deepStrictEqual(pool.readState(path.join(outRoot, T_SLUG)).ticked, [E_SLUG, E2_SLUG]);
  // Before the first pool: the page, the picker, no tabs.
  const info = (await inject(app.handler, { url: TAPI })).json();
  assert.strictEqual(info.pull, null);
  assert.deepStrictEqual(info.tabs.map((t) => t.game.id), [String(GAME.id), String(OTHER_GAME.id)]);
  assert.strictEqual((await inject(app.handler, { url: `/t/${T_SLUG}` })).status, 200);
});

test('GET / lists tournaments live first, then done, then archived; old run folders are never listed or read', async () => {
  const outRoot = tmp();
  const now = Date.UTC(2026, 10, 1);
  const mk = (t, startAt, extra = {}) => {
    makePool(outRoot, { t, name: `Name ${t}`, startAt, events: [{ slug: 'singles', game: { id: '1', name: 'G' }, start_at: startAt }], players: [] });
    if (Object.keys(extra).length) pool.updateState(path.join(outRoot, t), (s) => Object.assign(s, extra));
  };
  mk('a-archived', '2026-09-01T00:00:00.000Z', { archived: '2026-10-01T00:00:00.000Z' });
  mk('b-done', '2026-10-01T00:00:00.000Z');
  mk('c-live', '2026-11-08T00:00:00.000Z');
  mk('d-marked', '2026-11-20T00:00:00.000Z', { marked_done: '2026-10-30T00:00:00.000Z' });
  // An increment 1 folder whose meta.json would break a reader: never opened.
  const old = path.join(outRoot, 'b-done__singles__20261015-0925');
  fs.mkdirSync(old);
  fs.writeFileSync(path.join(old, 'meta.json'), '{not json');
  const app = createApp({ outRoot, getToken: () => TOKEN, now: () => now });
  const html = (await inject(app.handler, { url: '/' })).text;
  const order = [...html.matchAll(/href="\/t\/([^"]+)"/g)].map((m) => m[1]);
  // Within done, the most recent start first.
  assert.deepStrictEqual(order, ['c-live', 'd-marked', 'b-done', 'a-archived']);
  assert.ok(!html.includes('__singles__'));
  assert.match(html, /<form id="add"/);
});

test('GET /e/<t>/<e> redirects to the tournament page with that game\'s tab only when out/<t>/ exists, else 404 with an add link; old run folders are not read', async () => {
  const outRoot = tmp();
  await pooled(outRoot);
  const old = path.join(outRoot, 'eclipse-1st-cour__bloody-fights-mbaacc-singles__20261015-0925');
  fs.mkdirSync(old);
  fs.writeFileSync(path.join(old, 'meta.json'), JSON.stringify({ event: { name: 'x' }, game: { id: '1' }, run_at: '2026-10-15T00:00:00.000Z' }));
  const app = createApp({ outRoot, getToken: () => TOKEN });
  const r = await inject(app.handler, { url: `/e/${T_SLUG}/${E2_SLUG}` });
  assert.strictEqual(r.status, 302);
  assert.strictEqual(r.headers.Location, `/t/${T_SLUG}?tab=${OTHER_GAME.id}`);
  const missing = await inject(app.handler, { url: '/e/eclipse-1st-cour/bloody-fights-mbaacc-singles' });
  assert.strictEqual(missing.status, 404, 'the old run folder is not read');
  assert.match(missing.text, /href="\/\?add=eclipse-1st-cour"/);
  assert.strictEqual((await inject(app.handler, { url: '/t/eclipse-1st-cour' })).status, 404);
});

test('tabs: one per seeded game, each increment 2\'s table sliced by game_id (players who entered that game\'s events; is_event_game per tab)', async () => {
  const outRoot = tmp();
  await pooled(outRoot);
  const app = createApp({ outRoot, getToken: () => TOKEN });
  const info = (await inject(app.handler, { url: TAPI })).json();
  assert.deepStrictEqual(info.tabs.map((t) => [t.game.id, t.events]), [[String(GAME.id), [E_SLUG]], [String(OTHER_GAME.id), [E2_SLUG]]]);
  const mb = (await inject(app.handler, { url: `${TAPI}/g/${GAME.id}/data` })).json();
  const ml = (await inject(app.handler, { url: `${TAPI}/g/${OTHER_GAME.id}/data` })).json();
  assert.strictEqual(mb.players.length, 15);
  assert.deepStrictEqual(ml.players.map((p) => p.player_id).sort(), ['101', '108', '116']);
  assert.deepStrictEqual([mb.meta.game.id, ml.meta.game.id], [String(GAME.id), String(OTHER_GAME.id)]);
  assert.deepStrictEqual([mb.tab.events, ml.tab.events], [[E_SLUG], [E2_SLUG]]);
  assert.strictEqual(mb.tournament, T_SLUG);
  const col = (vm, c) => vm.cols.indexOf(c);
  for (const [vm, gid] of [[mb, GAME.id], [ml, OTHER_GAME.id]]) {
    assert.ok(vm.rows.length > 0);
    assert.ok(vm.rows.every((r) => (r[col(vm, 'is_event_game')] === 'true') === (r[col(vm, 'game_name')] === (gid === GAME.id ? GAME.name : OTHER_GAME.name))));
  }
  // Player 101's Melee results are "this game" on the Melee tab and "other games" on the MBAACC tab.
  const melee101 = (vm) => vm.rows.filter((r) => r[col(vm, 'player_id')] === '101' && r[col(vm, 'game_name')] === OTHER_GAME.name);
  assert.ok(melee101(ml).length > 0 && melee101(ml).every((r) => r[col(ml, 'is_event_game')] === 'true'));
  assert.ok(melee101(mb).every((r) => r[col(mb, 'is_event_game')] === 'false'));
  // Increment 2's page features ride along: the Sheets export per tab.
  assert.strictEqual((await inject(app.handler, { url: `${TAPI}/g/${OTHER_GAME.id}/export.csv` })).status, 200);
});

test('Acceptance 10: a ✓ on a tournament page writes T1 through the existing writer with the tournament slug (build A\'s semantics); edits use the same row', async () => {
  const outRoot = tmp();
  await pooled(outRoot);
  const tiersFile = path.join(outRoot, 'tiers.csv');
  fs.writeFileSync(tiersFile, out.toCsv(data.TIER_COLS, [{ game_id: String(GAME.id), game_name: GAME.name, startgg_tag: 'Quiet', sheet_tag: 'Quiet', tier: '5', source: 'sheet import' }]));
  const app = createApp({ outRoot, getToken: () => TOKEN, tiersFile, now: () => Date.UTC(2026, 10, 2, 15) });
  const r = await post(app, `${TAPI}/g/${GAME.id}/player/103/review`, { reviewed: true });
  assert.strictEqual(r.status, 200, r.text);
  assert.deepStrictEqual([r.json().last_reviewed_on, r.json().last_reviewed_tournament], ['2026-11-02', T_SLUG]);
  const rows = out.parseCsv(fs.readFileSync(tiersFile, 'utf8'));
  assert.strictEqual(rows.length, 1, 'the shared matcher found the sheet row by tag');
  assert.deepStrictEqual([rows[0].player_id, rows[0].tier, rows[0].last_reviewed_tournament], ['103', '5', T_SLUG]);
  assert.ok(fs.readFileSync(tiersFile, 'utf8').startsWith('﻿'), 'the writer keeps the BOM');
  const vm = (await inject(app.handler, { url: `${TAPI}/g/${GAME.id}/data` })).json();
  assert.strictEqual(vm.notes['103'].last_reviewed_tournament, T_SLUG);
  // A player of the other game's tab writes that game's row.
  const e = await post(app, `${TAPI}/g/${OTHER_GAME.id}/player/116`, { tier: 3 });
  assert.strictEqual(e.status, 200);
  assert.strictEqual(out.parseCsv(fs.readFileSync(tiersFile, 'utf8')).find((x) => x.player_id === '116').game_id, String(OTHER_GAME.id));
  // A player not in this tab is a 404, and so is a game that is not a tab.
  assert.strictEqual((await post(app, `${TAPI}/g/${OTHER_GAME.id}/player/103`, { tier: 3 })).status, 404);
  assert.strictEqual((await post(app, `${TAPI}/g/999/player/103`, { tier: 3 })).status, 404);
});

// ---- Acceptance 5: W-L summary-first across the union of every tab's summary columns ------------

test('W-L is fetched summary-first across the union of all tabs\' summary columns', async () => {
  const outRoot = tmp();
  const cfg = path.join(outRoot, 'majors.json');
  fs.writeFileSync(cfg, JSON.stringify({ exclude: [], games: { default: { majors: [{ label: 'Big', pattern: '^Big Major', kind: 'known' }] } } }));
  const saved = process.env.SEED_MAJORS_FILE;
  process.env.SEED_MAJORS_FILE = cfg;
  try {
    const world = buildWorld(START / 1000);
    // Distinct series names (the fake's "Tournament <id>" all normalize to one shared series, which
    // would make every row a summary row): one series per event, every fifth a configured major in either game.
    const letters = (n) => String(n).replace(/\d/g, (d) =>'abcdefghij'[d]);
    for (const p of world.players) for (const e of p.events || []) e.tournament = { name: `${e.id % 5 === 1 ? 'Big Major' : 'Local'} ${letters(e.id)}` };
    await pooled(outRoot, world);
    const fake = createFakeFetch(world);
    const order = [];
    const fetchImpl = async (u, init) => {
      const v = JSON.parse(init.body).variables;
      if (opOf(init) === 'SetsBatch') for (let j = 0; `e${j}` in v; j++) order.push(`${v[`e${j}`]}:${v[`u${j}`]}`);
      return fake(u, init);
    };
    const clock = virtualClock(START + HOUR);
    const app = createApp({ outRoot, getToken: () => TOKEN, fetchImpl, now: clock.now, sleep: clock.sleep });
    await post(app, `${TAPI}/refresh`);
    await app.jobs.last.get(T_SLUG).promise;
    const st = app.jobs.status(T_SLUG);
    assert.strictEqual(st.phase, 'done', st.error);
    const uid = (pid) => { const p = world.players.find((x) => String(x.id) === pid); return p && p.user && p.user.id; };
    const summary = new Set();
    for (const g of [GAME.id, OTHER_GAME.id]) {
      const r = data.loadRun(data.tabSource(outRoot, T_SLUG, g));
      for (const row of r.fetchRows) if (r.inSummary(row)) summary.add(`${row.event_id}:${uid(row.player_id)}`);
    }
    const inS = order.map((k) => summary.has(k));
    assert.ok(inS.includes(true) && inS.includes(false), 'both kinds were fetched');
    const firstRest = inS.indexOf(false);
    assert.ok(inS.slice(firstRest).every((x) => !x), 'no summary row after the first non-summary row');
    assert.strictEqual(inS.filter(Boolean).length, [...summary].filter((k) => !k.endsWith(':undefined')).length);
    assert.strictEqual(st.wl.summaryDone, st.wl.summaryTotal);
    // Both tabs' summary rows are in the first stretch: the union, not one tab's.
    const games = new Set(order.slice(0, firstRest).map((k) => world.players.flatMap((p) => p.events || []).find((e) => `${e.id}` === k.split(':')[0]).videogame.id));
    assert.deepStrictEqual([...games].sort(), [OTHER_GAME.id, GAME.id].sort());
  } finally {
    if (saved === undefined) delete process.env.SEED_MAJORS_FILE; else process.env.SEED_MAJORS_FILE = saved;
  }
});

// ---- Acceptance 6: T3 on the single request queue ---------------------------------------------

test('T3: the schedule pull writes out/<t>/schedule.json with the side tournaments linked in state.json, through the same single request queue as the pool pull (never two in flight)', async () => {
  const outRoot = tmp();
  const world = buildWorld(START / 1000);
  const tDir = await pooled(outRoot, world);
  pool.updateState(tDir, (s) => { s.linked = ['cb-side-games']; });
  const fake = createFakeFetch(world);
  let inFlight = 0, maxInFlight = 0;
  const ops = [];
  const fetchImpl = async (u, init) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
      ops.push(opOf(init));
      return await fake(u, init);
    } finally { inFlight--; }
  };
  const clock = virtualClock(START + HOUR);
  const app = createApp({ outRoot, getToken: () => TOKEN, fetchImpl, now: clock.now, sleep: clock.sleep });
  assert.strictEqual((await post(app, `${TAPI}/refresh`)).status, 202);
  assert.strictEqual((await post(app, `${TAPI}/schedule/refresh`)).status, 202, 'a schedule pull may start beside the pool job');
  await Promise.all([app.jobs.last.get(T_SLUG).promise, app.jobs.schedules.get(T_SLUG).promise]);
  assert.strictEqual(app.jobs.status(T_SLUG).phase, 'done', app.jobs.status(T_SLUG).error);
  assert.strictEqual(app.jobs.status(T_SLUG).schedule.error, null);
  assert.strictEqual(maxInFlight, 1, 'never two requests in flight');
  assert.strictEqual(app.queue.stats.maxInFlight, 1);
  const firstSched = ops.indexOf('TournamentSchedule');
  const lastPool = ops.lastIndexOf('UserEvents');
  assert.ok(firstSched > 0 && firstSched < lastPool, 'the two jobs ran at the same time, interleaved in one queue');
  assert.strictEqual(app.queue.stats.sends, fake.calls.length, 'every start.gg call went through the queue');
  const sched = JSON.parse(fs.readFileSync(path.join(tDir, 'schedule.json'), 'utf8'));
  assert.deepStrictEqual(sched.side_tournaments.map((x) => x.slug), ['tournament/cb-side-games']);
  const p101 = sched.players.find((p) => p.playerId === '101');
  assert.ok(p101.entries.some((e) => e.side && e.eventName === 'Tekken 8'), 'the linked side game is on the player\'s schedule');
  assert.ok(!fs.readdirSync(path.join(tDir, out.readCurrent(tDir))).includes('schedule.json'), 'outside any pull folder');
  const tab = (await inject(app.handler, { url: `${TAPI}/schedule` })).json();
  assert.strictEqual(tab.players.length, sched.players.length);
  // Linking is a state.json edit, never a pull.
  const l = await post(app, `${TAPI}/linked`, { linked: ['cb-side-games', 'other-side', T_SLUG] });
  assert.deepStrictEqual(l.json().linked, ['cb-side-games', 'other-side']);
  assert.strictEqual((await post(app, `${TAPI}/linked`, { linked: ['../x'] })).status, 400);
});

// ---- Acceptance 7: lifecycle ------------------------------------------------------------------

test('status is computed from the latest ticked event\'s startAt, with marked_done and archived overriding', () => {
  const st = { tournament: { start_at: '2026-11-01T00:00:00.000Z' }, events: [
    { slug: 'a', start_at: '2026-11-07T15:00:00.000Z' }, { slug: 'b', start_at: '2026-11-08T15:00:00.000Z' }], ticked: ['a', 'b'] };
  const at = (iso) => Date.parse(iso);
  assert.strictEqual(pool.statusOf(st, null, at('2026-11-08T14:59:59.000Z')), 'live', 'until the LATEST ticked event starts');
  assert.strictEqual(pool.statusOf(st, null, at('2026-11-08T15:00:00.000Z')), 'done');
  assert.strictEqual(pool.statusOf({ ...st, ticked: ['a'] }, null, at('2026-11-07T16:00:00.000Z')), 'done', 'unticking changes what counts');
  // The pull's meta.json (fresher) wins over the catalog for a seeded event's startAt.
  assert.strictEqual(pool.statusOf(st, { seeded_events: [{ slug: 'b', start_at: '2026-11-09T00:00:00.000Z' }] }, at('2026-11-08T16:00:00.000Z')), 'live');
  assert.strictEqual(pool.statusOf({ ...st, marked_done: '2026-11-02' }, null, at('2026-11-02T00:00:00.000Z')), 'done');
  assert.strictEqual(pool.statusOf({ ...st, marked_done: '2026-11-02', archived: '2026-11-10' }, null, 0), 'archived');
  assert.strictEqual(pool.statusOf({ ...st, ticked: [] }, null, at('2026-10-31T00:00:00.000Z')), 'live', 'nothing ticked: the tournament\'s own start');
  assert.deepStrictEqual(pool.controlsFor(st, 'live'), { markDone: true, unmarkDone: false, archive: false, delete: false });
  assert.deepStrictEqual(pool.controlsFor({ ...st, marked_done: 'x' }, 'done'), { markDone: false, unmarkDone: true, archive: true, delete: true });
});

test('lifecycle: Mark done; done blocks nothing; Archive standings makes one standings fetch per ticked event; Delete (confirmed) removes out/<t>/ only and never touches T1', async () => {
  const outRoot = tmp();
  const world = buildWorld(START / 1000);
  const tDir = await pooled(outRoot, world);
  // The fake events started 140 days before START: move them to the future so the pool is live.
  pool.updateState(tDir, (s) => { for (const e of s.events) e.start_at = '2026-12-01T00:00:00.000Z'; });
  const cur = out.readCurrent(tDir);
  const meta = JSON.parse(fs.readFileSync(path.join(tDir, cur, 'meta.json'), 'utf8'));
  for (const e of meta.seeded_events) e.start_at = '2026-12-01T00:00:00.000Z';
  fs.writeFileSync(path.join(tDir, cur, 'meta.json'), JSON.stringify(meta));
  const tiersFile = path.join(outRoot, 'tiers.csv');
  fs.writeFileSync(tiersFile, out.toCsv(data.TIER_COLS, [{ game_id: String(GAME.id), game_name: GAME.name, startgg_tag: 'Quiet', sheet_tag: 'Quiet', tier: '5', source: 'sheet import' }]));
  const other = path.join(outRoot, 'crescendo-of-night-3-episode-0__allegro-mbtl-pc__20261014-1909');
  fs.mkdirSync(other);
  fs.writeFileSync(path.join(other, 'meta.json'), '{"old":true}');
  makePool(outRoot, { t: 'another-t', events: [{ slug: 's', game: { id: '1', name: 'G' } }], players: [] });

  const fake = createFakeFetch(world);
  let now = Date.UTC(2026, 10, 1);
  const clock = virtualClock(now);
  const app = createApp({ outRoot, getToken: () => TOKEN, tiersFile, fetchImpl: fake, now: () => now, sleep: clock.sleep });
  const info = async () => (await inject(app.handler, { url: TAPI })).json();
  assert.strictEqual((await info()).status, 'live');
  assert.strictEqual((await post(app, `${TAPI}/lifecycle`, { action: 'archive' })).status, 409, 'Archive is surfaced once done');
  assert.strictEqual((await post(app, `${TAPI}/lifecycle`, { action: 'delete', confirm: T_SLUG })).status, 409, 'Delete is surfaced once done');

  // Mark done (and undo it).
  assert.strictEqual((await post(app, `${TAPI}/lifecycle`, { action: 'mark-done' })).status, 200);
  assert.strictEqual((await info()).status, 'done');
  assert.ok(pool.readState(tDir).marked_done);
  assert.strictEqual((await post(app, `${TAPI}/lifecycle`, { action: 'unmark-done' })).status, 200);
  assert.strictEqual((await info()).status, 'live');

  // Computed done (the last ticked event has started): nothing is blocked.
  now = Date.UTC(2026, 11, 2);
  assert.strictEqual((await info()).status, 'done');
  assert.deepStrictEqual((await info()).controls, { markDone: false, unmarkDone: false, archive: true, delete: true });
  assert.strictEqual((await post(app, `${TAPI}/g/${GAME.id}/player/103`, { tier: 6 })).status, 200, 'tier edits stay available');
  assert.strictEqual((await post(app, `${TAPI}/g/${GAME.id}/player/103/review`, { reviewed: true })).status, 200, '✓ stays available');
  assert.strictEqual((await inject(app.handler, { url: `${TAPI}/g/${GAME.id}/seeds.csv` })).status, 200, 'export stays available');
  assert.strictEqual((await post(app, `${TAPI}/refresh`)).status, 202, 'Refresh stays available');
  await app.jobs.last.get(T_SLUG).promise;

  // Archive standings: on request, one standings fetch per ticked event.
  const before = fake.calls.length;
  assert.strictEqual((await post(app, `${TAPI}/lifecycle`, { action: 'archive' })).status, 200);
  await app.jobs.last.get(T_SLUG).promise;
  assert.strictEqual(app.jobs.status(T_SLUG).phase, 'done', app.jobs.status(T_SLUG).error);
  const calls = fake.calls.slice(before);
  assert.deepStrictEqual(calls.map((c) => [c.op, String(c.variables.eventId)]), [['EventStandings', '1000'], ['EventStandings', '2000']]);
  const standings = JSON.parse(fs.readFileSync(path.join(tDir, 'standings.json'), 'utf8'));
  assert.deepStrictEqual(Object.keys(standings.events), [E_SLUG, E2_SLUG]);
  assert.strictEqual(standings.events[E_SLUG].standings.length, 14);
  assert.deepStrictEqual(standings.events[E2_SLUG].standings[0], { placement: 1, entrant_id: String(world.entrantsByEvent[2000][0].id), name: 'GeneralMidwest', player_ids: ['101'] });
  assert.strictEqual((await info()).status, 'archived');
  assert.ok(fs.existsSync(path.join(tDir, out.readCurrent(tDir), 'players.csv')), 'the pool is still present until deleted');

  // Delete: confirmed with the slug; out/<t>/ only.
  const tiersBefore = sha(tiersFile);
  const otherBefore = fs.readFileSync(path.join(other, 'meta.json'), 'utf8');
  assert.strictEqual((await post(app, `${TAPI}/lifecycle`, { action: 'delete' })).status, 400, 'no confirm, no delete');
  assert.strictEqual((await post(app, `${TAPI}/lifecycle`, { action: 'delete', confirm: 'another-t' })).status, 400);
  assert.ok(fs.existsSync(tDir));
  assert.strictEqual((await post(app, `${TAPI}/lifecycle`, { action: 'delete', confirm: T_SLUG })).status, 200);
  assert.ok(!fs.existsSync(tDir), 'out/<t>/ removed entirely');
  assert.strictEqual(sha(tiersFile), tiersBefore, 'T1 untouched');
  assert.strictEqual(fs.readFileSync(path.join(other, 'meta.json'), 'utf8'), otherBefore, 'an old run folder is untouched');
  assert.ok(fs.existsSync(path.join(outRoot, 'another-t', 'state.json')), 'another tournament is untouched');
  assert.strictEqual((await inject(app.handler, { url: `/t/${T_SLUG}` })).status, 404);
  assert.ok(!(await inject(app.handler, { url: '/' })).text.includes(`/t/${T_SLUG}"`));
});
