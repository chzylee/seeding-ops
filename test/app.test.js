'use strict';
// app/server.js + app/jobs.js against tournament pools made by the real pull (lib/run.js) on the fake
// start.gg. Requests go through the handler in memory (testlib/inject.js). Offline.
//
// Retargeted for increment 3 (docs/design-tool.md, T2 and Pages): the app serves one page per
// tournament (/t/<t>) with a tab per seeded game, reading the live pull through out/<t>/current; a
// Refresh writes a new pull beside it and swaps it in (the old pull is deleted after the swap); the
// W-L cache is out/<t>/set-records.json, shared and carried by event id. Each test keeps its
// increment 2 assertion where the spec did not change the behavior.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { run } = require('../lib/run');
const { parseCsv } = require('../lib/output');
const out = require('../lib/output');
const pacing = require('../lib/pacing');
const M = require('../lib/view/model');
const http = require('node:http');
const { createApp, main, resolvePort, DEFAULT_PORT } = require('../app/server');
const { inject } = require('../testlib/inject');
const { addTournament } = require('../testlib/pool-fixture');
const { buildWorld, createFakeFetch, virtualClock, sink, fakeSets, T_SLUG, E_SLUG, GAME } = require('../testlib/fake-api');

const TOKEN = 'TOKEN-SENTINEL-c0ffee';
const START = Date.UTC(2026, 9, 12, 15, 0, 0);
const HOUR = 3_600_000;
const T = T_SLUG;
const PAGE = `/t/${T}`;
const TAPI = `/api/t/${T}`;
const API = `${TAPI}/g/${GAME.id}`;

const tmpOut = () => fs.mkdtempSync(path.join(os.tmpdir(), 'seeding-app-'));
// One full pull of the tournament (the MBAACC event ticked), as the app's first Pull would make it.
async function pullAt(outRoot, atMs, world = buildWorld(START / 1000)) {
  const tDir = addTournament(outRoot, world, [E_SLUG]);
  const clock = virtualClock(atMs);
  const code = await run({ tournament: T, events: [E_SLUG], token: TOKEN, outRoot, fetchImpl: createFakeFetch(world), now: clock.now, sleep: clock.sleep, stderr: sink(), stdout: sink() });
  assert.strictEqual(code, 0);
  return path.join(tDir, out.readCurrent(tDir));
}
const opOf = (init) => (/query\s+(\w+)/.exec(JSON.parse(init.body).query) || [])[1];
const gameRows = (rows) => rows.filter((r) => r.game_id === String(GAME.id));

test('app: GET / lists each tournament once; its tab always serves the live pull (a newer pull swapped in wins, an unfinished one is ignored)', async () => {
  const outRoot = tmpOut();
  const older = await pullAt(outRoot, START);
  const newer = await pullAt(outRoot, START + 2 * HOUR);
  assert.ok(!fs.existsSync(older), 'T2: the replaced pull is deleted after the swap');
  // An unfinished, even newer pull (one still running or killed) is not the page's data.
  fs.mkdirSync(path.join(outRoot, T, 'pull-20991231-235900', '_work'), { recursive: true });
  const app = createApp({ outRoot, getToken: () => TOKEN });

  const idx = await inject(app.handler, { url: '/' });
  assert.strictEqual(idx.status, 200);
  assert.strictEqual(idx.text.split(`href="${PAGE}"`).length - 1, 1, 'one entry per tournament');

  const page = await inject(app.handler, { url: PAGE });
  assert.strictEqual(page.status, 200);
  assert.match(page.text, /\/static\/tournament\.js/);

  let d = (await inject(app.handler, { url: `${API}/data` })).json();
  assert.strictEqual(d.run.folder, path.basename(newer));
  assert.strictEqual(d.players.length, 15);
  assert.deepStrictEqual(d.cols.slice(-1), ['s']);
  assert.strictEqual(d.rows.length, parseCsv(fs.readFileSync(path.join(newer, 'results.csv'), 'utf8')).length);

  // The view model is computed per request: a cache written after start-up shows on the next request.
  const results = parseCsv(fs.readFileSync(path.join(newer, 'results.csv'), 'utf8'));
  const r0 = gameRows(results)[0];
  fs.writeFileSync(path.join(outRoot, T, 'set-records.json'), JSON.stringify({ [M.key(r0)]: { w: 9, l: 1, dq: 0 } }));
  d = (await inject(app.handler, { url: `${API}/data` })).json();
  assert.deepStrictEqual(d.records[M.key(r0)], { w: 9, l: 1, dq: 0 });
  assert.strictEqual(d.wl.known, 1);

  // A third, newer pull becomes the page's data with no URL change.
  const newest = await pullAt(outRoot, START + 5 * HOUR);
  d = (await inject(app.handler, { url: `${API}/data` })).json();
  assert.strictEqual(d.run.folder, path.basename(newest));

  // Unknown tournament -> 404 page and 404 data.
  assert.strictEqual((await inject(app.handler, { url: '/t/nope' })).status, 404);
  assert.strictEqual((await inject(app.handler, { url: '/api/t/nope/g/1/data' })).status, 404);
});

test('app: .env is never served; nothing under out/ is served as a file (state.json and current included); foreign hosts are refused', async () => {
  const outRoot = tmpOut();
  await pullAt(outRoot, START);
  const app = createApp({ outRoot, getToken: () => TOKEN });
  const cur = out.readCurrent(path.join(outRoot, T));
  const probes = ['/.env', '/static/.env', '/static/../.env', '/static/..%2f.env', '/%2e%2e/.env', '/..%2f..%2f.env',
    '/static/server.js', '/static/jobs.js', '/static/queue.js', '/lib/view/model.js', '/app/server.js', '/package.json', '/out/', '/out',
    `/${path.basename(outRoot)}`, `${PAGE}/../../../.env`, '/api/t/../../.env', '/api/t/%2e%2e/%2e%2e/data', `/t/${T}/..%2f..%2f.env`,
    '/static/model.js/../../.env', '/e/x/y/z', '/static/APP.JS', '/%ZZ', '/\\.env',
    // Acceptance 11: state.json, current and the pool's files are never served raw.
    `/out/${T}/state.json`, `/${T}/state.json`, `/t/${T}/state.json`, `/t/${T}/current`, `/out/${T}/current`, `${TAPI}/state.json`,
    `${TAPI}/current`, `/api/t/${T}/state`, `/t/${T}/${cur}/players.csv`, `${TAPI}/${cur}/meta.json`, `${TAPI}/set-records.json`,
    `${API}/../../state.json`, `/api/t/${T}/g/${GAME.id}/players.csv`, '/registry/tiers.csv', '/config/majors.json'];
  for (const url of probes) {
    const r = await inject(app.handler, { url });
    assert.strictEqual(r.status, 404, `${url} -> ${r.status}`);
    assert.ok(!r.text.includes('STARTGG_TOKEN') && !r.text.includes(TOKEN), url);
    assert.ok(!r.text.includes('"ticked"') && !r.text.includes(cur + '\n'), `${url} leaked pool state`);
  }
  for (const f of ['model.js', 'render.js', 'app.js', 'app.css', 'tournament.js', 'schedule.js', 'index.js']) {
    const r = await inject(app.handler, { url: `/static/${f}` });
    assert.strictEqual(r.status, 200, f);
  }
  // The tournament route returns a projection of state.json, not the file: no raw catalog phases.
  const info = (await inject(app.handler, { url: TAPI })).json();
  assert.ok(info.events.every((e) => !('phases' in e) && !('id' in e)));
  const env = await inject(app.handler, { url: '/.env', headers: { host: 'evil.example:8765' } });
  assert.strictEqual(env.status, 403);
  assert.strictEqual((await inject(app.handler, { url: '/', headers: { host: 'localhost:8765' } })).status, 200);
  assert.strictEqual((await inject(app.handler, { url: `${API}/data`, method: 'DELETE' })).status, 405);
});

test('app: refresh makes a new pull, carries the pool\'s W-L cache, fetches W-L summary-first in the background, and a second refresh is 409', async () => {
  const outRoot = tmpOut();
  const world = buildWorld(START / 1000);
  const prev = await pullAt(outRoot, START, world);
  const prevResults = parseCsv(fs.readFileSync(path.join(prev, 'results.csv'), 'utf8'));
  // The pool already has W-L for one row (a sentinel value the fake would never produce); it must
  // carry into the new pull's page, and that row must not be fetched again.
  const known = gameRows(prevResults).find((r) => r.player_id === '101');
  fs.writeFileSync(path.join(outRoot, T, 'set-records.json'), JSON.stringify({ [M.key(known)]: { w: 42, l: 0, dq: 0 } }));

  const fake = createFakeFetch(world);
  let release;
  const gate = new Promise((r) => { release = r; });
  const sent = [];
  const fetchImpl = async (u, init) => {
    await gate;
    const op = opOf(init);
    const v = JSON.parse(init.body).variables;
    if (op === 'SetsBatch') for (let j = 0; `e${j}` in v; j++) sent.push(String(v[`e${j}`]) + ':' + String(v[`u${j}`]));
    return fake(u, init);
  };
  const clock = virtualClock(START + 3 * HOUR);
  const app = createApp({ outRoot, getToken: () => TOKEN, fetchImpl, now: clock.now, sleep: clock.sleep });

  assert.strictEqual((await inject(app.handler, { url: `${TAPI}/refresh`, method: 'POST' })).status, 403, 'no app header');
  const first = await inject(app.handler, { url: `${TAPI}/refresh`, method: 'POST', headers: { 'X-Seeding-App': '1' } });
  assert.strictEqual(first.status, 202, 'returns immediately, before any start.gg request is answered');
  assert.strictEqual(first.json().running, true);
  const second = await inject(app.handler, { url: `${TAPI}/refresh`, method: 'POST', headers: { 'X-Seeding-App': '1' } });
  assert.strictEqual(second.status, 409);
  assert.strictEqual(second.json().running, true);
  // Any tournament: one job per server.
  addTournament(outRoot, { tournament: { ...world.tournament, slug: 'tournament/other-t' } }, []);
  const other = await inject(app.handler, { url: '/api/t/other-t/refresh', method: 'POST', headers: { 'X-Seeding-App': '1' } });
  assert.strictEqual(other.status, 409);
  assert.strictEqual(other.json().busy, T);
  let st = (await inject(app.handler, { url: `${TAPI}/status` })).json();
  assert.strictEqual(st.pulling, true);
  // While pulling, the page still shows the previous pull.
  assert.strictEqual((await inject(app.handler, { url: `${API}/data` })).json().run.folder, path.basename(prev));

  release();
  await app.jobs.last.get(T).promise;
  st = (await inject(app.handler, { url: `${TAPI}/status` })).json();
  assert.strictEqual(st.running, false);
  assert.strictEqual(st.phase, 'done', st.error);
  assert.strictEqual(st.error, null);
  assert.ok(st.wl.total > 20);
  assert.strictEqual(st.wl.done, st.wl.total);
  assert.strictEqual(st.wl.summaryDone, st.wl.summaryTotal);

  const d = (await inject(app.handler, { url: `${API}/data` })).json();
  assert.notStrictEqual(d.run.folder, path.basename(prev), 'a new pull');
  assert.strictEqual(st.run, d.run.folder);
  const newDir = path.join(outRoot, T, d.run.folder);
  assert.ok(!fs.existsSync(prev), 'T2: the old pull is deleted after the swap');
  assert.deepStrictEqual(d.records[M.key(known)], { w: 42, l: 0, dq: 0 }, 'the pool cache carried');
  assert.ok(!sent.includes(known.event_id + ':' + world.players.find((p) => p.id === 101).user.id), 'cached row not refetched');
  const onDisk = JSON.parse(fs.readFileSync(path.join(outRoot, T, 'set-records.json'), 'utf8'));
  const other101 = gameRows(prevResults).find((r) => r.player_id === '101' && r !== known && !world.players[0].events.find((e) => String(e.id) === r.event_id)._noEntrant);
  assert.deepStrictEqual(onDisk[M.key(other101)], fakeSets(other101.event_id, 9001).record);
  // Summary-first: the job fetched in the order lib/view/model.fetchOrder gives for the tab.
  const data = require('../lib/view/data');
  const vmRun = data.loadRun(data.tabSource(outRoot, T, GAME.id));
  const uidOf = (pid) => { const p = world.players.find((x) => String(x.id) === pid); return p && p.user ? p.user.id : null; };
  const expected = vmRun.fetchRows.filter((r) => M.key(r) !== M.key(known) && uidOf(r.player_id) != null).map((r) => r.event_id + ':' + uidOf(r.player_id));
  assert.deepStrictEqual(sent, expected);
  // Every send went through the app's queue and was logged without the token.
  const log = fs.readFileSync(path.join(newDir, '_work', 'wl-requests.jsonl'), 'utf8');
  assert.ok(!log.includes(TOKEN));
  assert.ok(pacing.maxInAnyWindow(log.trim().split('\n').map((l) => JSON.parse(l).ms)) <= pacing.MAX_REQUESTS);
});

test('app: the data endpoint during a W-L fetch returns the W-L fetched so far (a reload shows partial W-L)', async () => {
  const outRoot = tmpOut();
  const world = buildWorld(START / 1000);
  await pullAt(outRoot, START, world);
  const fake = createFakeFetch(world);
  let batches = 0, release;
  const hold = new Promise((r) => { release = r; });
  const fetchImpl = async (u, init) => {
    if (opOf(init) === 'SetsBatch' && ++batches > 2) await hold; // two batches through, then stall
    return fake(u, init);
  };
  const clock = virtualClock(START + HOUR);
  const app = createApp({ outRoot, getToken: () => TOKEN, fetchImpl, now: clock.now, sleep: clock.sleep });
  await inject(app.handler, { url: `${TAPI}/refresh`, method: 'POST', headers: { 'X-Seeding-App': '1' } });
  // Wait until the job has stored its first batches.
  for (let i = 0; i < 400; i++) {
    const s = app.jobs.status(T);
    if (s.phase === 'wl' && s.wl.done >= 4) break;
    await new Promise((r) => setTimeout(r, 5));
  }
  const st = (await inject(app.handler, { url: `${TAPI}/status` })).json();
  assert.strictEqual(st.running, true);
  assert.strictEqual(st.phase, 'wl');
  const d = (await inject(app.handler, { url: `${API}/data` })).json();
  assert.strictEqual(d.run.folder, st.run, 'the new pull is shown as soon as it is swapped in');
  assert.ok(d.wl.known >= 4 && d.wl.known < d.wl.total, `partial: ${d.wl.known} of ${d.wl.total}`);
  assert.strictEqual(d.status.wl.done, st.wl.done);
  release();
  await app.jobs.last.get(T).promise;
  const done = (await inject(app.handler, { url: `${API}/data` })).json();
  assert.ok(done.wl.known > d.wl.known);
});

test('app: a pull that cannot start leaves the previous pull on the page and reports the error', async () => {
  const outRoot = tmpOut();
  const world = buildWorld(START / 1000);
  const prev = await pullAt(outRoot, START, world);
  const clock = virtualClock(START + HOUR);
  const app = createApp({ outRoot, getToken: () => TOKEN, fetchImpl: createFakeFetch(world, { badToken: true }), now: clock.now, sleep: clock.sleep });
  assert.strictEqual((await inject(app.handler, { url: `${TAPI}/refresh`, method: 'POST', headers: { 'X-Seeding-App': '1' } })).status, 202);
  await app.jobs.last.get(T).promise;
  const st = (await inject(app.handler, { url: `${TAPI}/status` })).json();
  assert.strictEqual(st.phase, 'error');
  assert.match(st.error, /token/i);
  assert.ok(!JSON.stringify(st).includes(TOKEN));
  assert.strictEqual((await inject(app.handler, { url: `${API}/data` })).json().run.folder, path.basename(prev));
  // No token at all: an error, no request.
  const calls = createFakeFetch(world);
  const app2 = createApp({ outRoot, getToken: () => '', fetchImpl: calls, now: clock.now, sleep: clock.sleep });
  await inject(app2.handler, { url: `${TAPI}/refresh`, method: 'POST', headers: { 'X-Seeding-App': '1' } });
  await app2.jobs.last.get(T).promise;
  assert.match(app2.jobs.status(T).error, /No start\.gg token/);
  assert.strictEqual(calls.calls.length, 0);
});

test('app: a refresh never sends more than SEED_APP_MAX_PER_MIN in any rolling 60 s (actual sends, recorded in the pull)', async () => {
  const outRoot = tmpOut();
  const world = buildWorld(START / 1000);
  await pullAt(outRoot, START, world);
  const fake = createFakeFetch(world);
  const clock = virtualClock(START + HOUR);
  const app = createApp({ outRoot, getToken: () => TOKEN, fetchImpl: fake, now: clock.now, sleep: clock.sleep, maxPerMinute: 10 });
  await inject(app.handler, { url: `${TAPI}/refresh`, method: 'POST', headers: { 'X-Seeding-App': '1' } });
  await app.jobs.last.get(T).promise;
  assert.strictEqual(app.jobs.status(T).phase, 'done');
  const st = app.jobs.status(T);
  const rec = JSON.parse(fs.readFileSync(path.join(outRoot, T, st.run, '_work', 'refresh-sends.json'), 'utf8'));
  assert.strictEqual(rec.max_per_60s, 10);
  assert.strictEqual(rec.requests, fake.calls.length, 'every HTTP call is recorded');
  assert.ok(rec.requests > 30, 'enough requests to need throttling');
  assert.strictEqual(pacing.maxInAnyWindow(rec.sent_at_ms), 10);
});

test('app: the limiter keeps any rolling 60 s at or under its ceiling, across concurrent callers', async () => {
  const { limitFetch } = require('../app/limit-fetch');
  const clock = virtualClock(START);
  const times = [];
  const f = limitFetch(async () => { times.push(clock.now()); return { ok: true }; }, { max: 18, now: clock.now, sleep: clock.sleep });
  await Promise.all(Array.from({ length: 60 }, () => f('x', {})));
  assert.strictEqual(times.length, 60);
  assert.strictEqual(pacing.maxInAnyWindow(times), 18);
});

// A2-3: `Number(arg('--port') || env) || DEFAULT_PORT` can't distinguish a literal "0" (let the
// OS pick) from an absent/empty one (use the default) — both are falsy, so "0" always fell
// through to 8765. resolvePort fixes that; these are its own unit tests, pure and fast.
test('resolvePort: "0" is a real port request (the OS picks); missing/empty means the default', () => {
  assert.strictEqual(resolvePort('0'), 0);
  assert.strictEqual(resolvePort(0), 0);
  assert.strictEqual(resolvePort(null), DEFAULT_PORT);
  assert.strictEqual(resolvePort(undefined), DEFAULT_PORT);
  assert.strictEqual(resolvePort(''), DEFAULT_PORT);
  assert.strictEqual(resolvePort('8080'), 8080);
  assert.strictEqual(resolvePort('not-a-port'), DEFAULT_PORT);
});

test('app: the server binds 127.0.0.1', async () => {
  const outRoot = tmpOut();
  const log = console.log;
  console.log = () => {};
  try {
    const server = main(['--port', '0', '--out', outRoot]);
    await new Promise((r) => server.once('listening', r));
    assert.strictEqual(server.address().address, '127.0.0.1');
    assert.notStrictEqual(server.address().port, 0, 'the OS assigned a real ephemeral port');
    await new Promise((r) => server.close(r));
  } finally { console.log = log; }
});

// A2-3's own acceptance test: this must pass even while something else holds the default port —
// exactly Noah's situation, his own app live on 8765 — the whole point of "0" meaning "let the OS
// pick." If 8765 is free here, a dummy listener simulates the occupied port; if it's already
// taken (Noah's app, running this suite on his machine), that real contention stands in for it
// and this test never touches or closes that other server.
test('app: "--port 0" binds a fresh ephemeral port even while DEFAULT_PORT is already taken', async () => {
  const busy = http.createServer(() => {});
  let weOwnBusy = true;
  await new Promise((resolve, reject) => {
    busy.once('error', (err) => {
      if (err.code !== 'EADDRINUSE') return reject(err);
      weOwnBusy = false; // something else (plausibly Noah's own app) already holds it
      resolve();
    });
    busy.listen(DEFAULT_PORT, '127.0.0.1', resolve);
  });
  const outRoot = tmpOut();
  const log = console.log;
  console.log = () => {};
  try {
    const server = main(['--port', '0', '--out', outRoot]);
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    assert.strictEqual(server.address().address, '127.0.0.1');
    assert.notStrictEqual(server.address().port, DEFAULT_PORT);
    await new Promise((r) => server.close(r));
  } finally {
    console.log = log;
    if (weOwnBusy) await new Promise((r) => busy.close(r));
  }
});
