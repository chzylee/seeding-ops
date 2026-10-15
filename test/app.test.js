'use strict';
// app/server.js + app/jobs.js against run folders made by the real pull (lib/run.js) on the fake
// start.gg. Requests go through the handler in memory (testlib/inject.js). Offline.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { run } = require('../lib/run');
const { parseCsv } = require('../lib/output');
const pacing = require('../lib/pacing');
const M = require('../lib/view/model');
const { createApp, main } = require('../app/server');
const { inject } = require('../testlib/inject');
const { buildWorld, createFakeFetch, virtualClock, sink, fakeSets, EVENT_SLUG } = require('../testlib/fake-api');

const TOKEN = 'TOKEN-SENTINEL-c0ffee';
const START = Date.UTC(2026, 9, 12, 15, 0, 0);
const HOUR = 3_600_000;
const [, T, , E] = EVENT_SLUG.split('/');
const EV = `/e/${T}/${E}`;
const API = `/api/e/${T}/${E}`;

const tmpOut = () => fs.mkdtempSync(path.join(os.tmpdir(), 'seeding-app-'));
async function pullAt(outRoot, atMs, world = buildWorld(START / 1000)) {
  const clock = virtualClock(atMs);
  const code = await run({ url: 'https://www.start.gg/' + EVENT_SLUG, token: TOKEN, outRoot, fetchImpl: createFakeFetch(world), now: clock.now, sleep: clock.sleep, stderr: sink(), stdout: sink() });
  assert.strictEqual(code, 0);
  return fs.readdirSync(outRoot).map((d) => path.join(outRoot, d))
    .find((d) => fs.existsSync(path.join(d, 'meta.json')) && JSON.parse(fs.readFileSync(path.join(d, 'meta.json'), 'utf8')).run_at === new Date(atMs).toISOString());
}
const opOf = (init) => (/query\s+(\w+)/.exec(JSON.parse(init.body).query) || [])[1];

test('app: GET / lists each event once; the event URL always serves the latest finished run (two folders -> the newer wins)', async () => {
  const outRoot = tmpOut();
  const older = await pullAt(outRoot, START);
  const newer = await pullAt(outRoot, START + 2 * HOUR);
  // An unfinished, even newer folder (a pull still running or killed) is ignored.
  fs.mkdirSync(path.join(outRoot, `${T}__${E}__20991231-2359`, '_work'), { recursive: true });
  const app = createApp({ outRoot, getToken: () => TOKEN });

  const idx = await inject(app.handler, { url: '/' });
  assert.strictEqual(idx.status, 200);
  assert.strictEqual(idx.text.split(`href="${EV}"`).length - 1, 1, 'one entry per event');

  const page = await inject(app.handler, { url: EV });
  assert.strictEqual(page.status, 200);
  assert.match(page.text, /\/static\/app\.js/);

  let d = (await inject(app.handler, { url: `${API}/data` })).json();
  assert.strictEqual(d.run.folder, path.basename(newer));
  assert.notStrictEqual(d.run.folder, path.basename(older));
  assert.strictEqual(d.players.length, 15);
  assert.deepStrictEqual(d.cols.slice(-1), ['s']);
  assert.strictEqual(d.rows.length, parseCsv(fs.readFileSync(path.join(newer, 'results.csv'), 'utf8')).length);

  // The view model is computed per request: a cache written after start-up shows on the next request.
  const results = parseCsv(fs.readFileSync(path.join(newer, 'results.csv'), 'utf8'));
  const r0 = results.find(M.isGame);
  fs.mkdirSync(path.join(newer, 'views'), { recursive: true });
  fs.writeFileSync(path.join(newer, 'views', 'set-records.json'), JSON.stringify({ [M.key(r0)]: { w: 9, l: 1, dq: 0 } }));
  d = (await inject(app.handler, { url: `${API}/data` })).json();
  assert.deepStrictEqual(d.records[M.key(r0)], { w: 9, l: 1, dq: 0 });
  assert.strictEqual(d.wl.known, 1);

  // A third, newer pull becomes the page's data with no URL change.
  const newest = await pullAt(outRoot, START + 5 * HOUR);
  d = (await inject(app.handler, { url: `${API}/data` })).json();
  assert.strictEqual(d.run.folder, path.basename(newest));

  // Unknown event -> 404 page and 404 data.
  assert.strictEqual((await inject(app.handler, { url: '/e/nope/nada' })).status, 404);
  assert.strictEqual((await inject(app.handler, { url: '/api/e/nope/nada/data' })).status, 404);
});

test('app: .env is never served; paths outside the app\'s routes and static files are 404; foreign hosts are refused', async () => {
  const outRoot = tmpOut();
  await pullAt(outRoot, START);
  const app = createApp({ outRoot, getToken: () => TOKEN });
  const probes = ['/.env', '/static/.env', '/static/../.env', '/static/..%2f.env', '/%2e%2e/.env', '/..%2f..%2f.env',
    '/static/server.js', '/static/jobs.js', '/lib/view/model.js', '/app/server.js', '/package.json', '/out/', '/out',
    `/${path.basename(outRoot)}`, `${EV}/../../../.env`, '/api/e/../../.env', '/api/e/%2e%2e/%2e%2e/data', `/e/${T}/..%2f..%2f.env`,
    '/static/model.js/../../.env', '/e/x/y/z', '/static/APP.JS', '/%ZZ', '/\\.env'];
  for (const url of probes) {
    const r = await inject(app.handler, { url });
    assert.strictEqual(r.status, 404, `${url} -> ${r.status}`);
    assert.ok(!r.text.includes('STARTGG_TOKEN') && !r.text.includes(TOKEN), url);
  }
  for (const f of ['model.js', 'render.js', 'app.js', 'app.css']) {
    const r = await inject(app.handler, { url: `/static/${f}` });
    assert.strictEqual(r.status, 200, f);
  }
  const env = await inject(app.handler, { url: '/.env', headers: { host: 'evil.example:8765' } });
  assert.strictEqual(env.status, 403);
  assert.strictEqual((await inject(app.handler, { url: '/', headers: { host: 'localhost:8765' } })).status, 200);
  assert.strictEqual((await inject(app.handler, { url: `${API}/data`, method: 'DELETE' })).status, 405);
});

test('app: refresh makes a new run, merges the previous cache, fetches W-L summary-first in the background, and a second refresh is 409', async () => {
  const outRoot = tmpOut();
  const world = buildWorld(START / 1000);
  const prev = await pullAt(outRoot, START, world);
  const prevResults = parseCsv(fs.readFileSync(path.join(prev, 'results.csv'), 'utf8'));
  // The previous run already has W-L for one row (a sentinel value the fake would never produce)
  // and notes; both must carry into the new run, and that row must not be fetched again.
  const known = prevResults.find((r) => M.isGame(r) && r.player_id === '101');
  fs.mkdirSync(path.join(prev, 'views'));
  fs.writeFileSync(path.join(prev, 'views', 'set-records.json'), JSON.stringify({ [M.key(known)]: { w: 42, l: 0, dq: 0 } }));
  fs.writeFileSync(path.join(prev, 'views', 'notes.json'), JSON.stringify({ 101: { seed: 1, notes: 'top seed' } }));

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

  assert.strictEqual((await inject(app.handler, { url: `${API}/refresh`, method: 'POST' })).status, 403, 'no app header');
  const first = await inject(app.handler, { url: `${API}/refresh`, method: 'POST', headers: { 'X-Seeding-App': '1' } });
  assert.strictEqual(first.status, 202, 'returns immediately, before any start.gg request is answered');
  assert.strictEqual(first.json().running, true);
  const second = await inject(app.handler, { url: `${API}/refresh`, method: 'POST', headers: { 'X-Seeding-App': '1' } });
  assert.strictEqual(second.status, 409);
  assert.strictEqual(second.json().running, true);
  // Any event: one job per server.
  const other = await inject(app.handler, { url: '/api/e/other-t/other-e/refresh', method: 'POST', headers: { 'X-Seeding-App': '1' } });
  assert.strictEqual(other.status, 409);
  assert.strictEqual(other.json().busy, `${T}/${E}`);
  let st = (await inject(app.handler, { url: `${API}/status` })).json();
  assert.strictEqual(st.pulling, true);
  // While pulling, the page still shows the previous run.
  assert.strictEqual((await inject(app.handler, { url: `${API}/data` })).json().run.folder, path.basename(prev));

  release();
  await app.jobs.last.get(`${T}/${E}`).promise;
  st = (await inject(app.handler, { url: `${API}/status` })).json();
  assert.strictEqual(st.running, false);
  assert.strictEqual(st.phase, 'done', st.error);
  assert.strictEqual(st.error, null);
  assert.ok(st.wl.total > 20);
  assert.strictEqual(st.wl.done, st.wl.total);
  assert.strictEqual(st.wl.summaryDone, st.wl.summaryTotal);

  const d = (await inject(app.handler, { url: `${API}/data` })).json();
  assert.notStrictEqual(d.run.folder, path.basename(prev), 'a new run folder');
  assert.strictEqual(st.run, d.run.folder);
  const newDir = path.join(outRoot, d.run.folder);
  assert.ok(fs.existsSync(path.join(prev, 'meta.json')), 'the old run is kept');
  assert.deepStrictEqual(d.records[M.key(known)], { w: 42, l: 0, dq: 0 }, 'previous cache merged');
  assert.ok(!sent.includes(known.event_id + ':' + world.players.find((p) => p.id === 101).user.id), 'cached row not refetched');
  assert.deepStrictEqual(d.notes, { 101: { seed: 1, notes: 'top seed' } }, 'notes carried forward');
  const onDisk = JSON.parse(fs.readFileSync(path.join(newDir, 'views', 'set-records.json'), 'utf8'));
  const other101 = prevResults.find((r) => M.isGame(r) && r.player_id === '101' && r !== known && !world.players[0].events.find((e) => String(e.id) === r.event_id)._noEntrant);
  assert.deepStrictEqual(onDisk[M.key(other101)], fakeSets(other101.event_id, 9001).record);
  // Summary-first: the job fetched in the order lib/view/model.fetchOrder gives.
  const vmRun = require('../lib/view/data').loadRun(newDir);
  const uidOf = (pid) => { const p = world.players.find((x) => String(x.id) === pid); return p && p.user ? p.user.id : null; };
  const expected = vmRun.fetchRows.filter((r) => M.key(r) !== M.key(known) && uidOf(r.player_id) != null).map((r) => r.event_id + ':' + uidOf(r.player_id));
  assert.deepStrictEqual(sent, expected);
  // Every send went through the app's limiter and was logged without the token.
  const log = fs.readFileSync(path.join(newDir, 'views', 'wl-requests.jsonl'), 'utf8');
  assert.ok(!log.includes(TOKEN));
  assert.ok(pacing.maxInAnyWindow(log.trim().split('\n').map((l) => JSON.parse(l).ms)) <= pacing.MAX_REQUESTS);
});

test('app: the data endpoint during a W-L fetch returns the W-L fetched so far', async () => {
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
  await inject(app.handler, { url: `${API}/refresh`, method: 'POST', headers: { 'X-Seeding-App': '1' } });
  // Wait until the job has stored its first batches.
  for (let i = 0; i < 200; i++) {
    const s = app.jobs.status(T, E);
    if (s.phase === 'wl' && s.wl.done >= 4) break;
    await new Promise((r) => setTimeout(r, 5));
  }
  const st = (await inject(app.handler, { url: `${API}/status` })).json();
  assert.strictEqual(st.running, true);
  assert.strictEqual(st.phase, 'wl');
  const d = (await inject(app.handler, { url: `${API}/data` })).json();
  assert.strictEqual(d.run.folder, st.run, 'the new run is shown as soon as its pull finished');
  assert.ok(d.wl.known >= 4 && d.wl.known < d.wl.total, `partial: ${d.wl.known} of ${d.wl.total}`);
  assert.strictEqual(d.status.wl.done, st.wl.done);
  release();
  await app.jobs.last.get(`${T}/${E}`).promise;
  const done = (await inject(app.handler, { url: `${API}/data` })).json();
  assert.ok(done.wl.known > d.wl.known);
});

test('app: a pull that cannot start leaves the previous run on the page and reports the error', async () => {
  const outRoot = tmpOut();
  const world = buildWorld(START / 1000);
  const prev = await pullAt(outRoot, START, world);
  const clock = virtualClock(START + HOUR);
  const app = createApp({ outRoot, getToken: () => TOKEN, fetchImpl: createFakeFetch(world, { badToken: true }), now: clock.now, sleep: clock.sleep });
  assert.strictEqual((await inject(app.handler, { url: `${API}/refresh`, method: 'POST', headers: { 'X-Seeding-App': '1' } })).status, 202);
  await app.jobs.last.get(`${T}/${E}`).promise;
  const st = (await inject(app.handler, { url: `${API}/status` })).json();
  assert.strictEqual(st.phase, 'error');
  assert.match(st.error, /token/i);
  assert.ok(!JSON.stringify(st).includes(TOKEN));
  assert.strictEqual((await inject(app.handler, { url: `${API}/data` })).json().run.folder, path.basename(prev));
  // No token at all: an error, no request.
  const calls = createFakeFetch(world);
  const app2 = createApp({ outRoot, getToken: () => '', fetchImpl: calls, now: clock.now, sleep: clock.sleep });
  await inject(app2.handler, { url: `${API}/refresh`, method: 'POST', headers: { 'X-Seeding-App': '1' } });
  await app2.jobs.last.get(`${T}/${E}`).promise;
  assert.match(app2.jobs.status(T, E).error, /No start\.gg token/);
  assert.strictEqual(calls.calls.length, 0);
});

test('app: a refresh never sends more than SEED_APP_MAX_PER_MIN in any rolling 60 s (actual sends, recorded in the run)', async () => {
  const outRoot = tmpOut();
  const world = buildWorld(START / 1000);
  await pullAt(outRoot, START, world);
  const fake = createFakeFetch(world);
  const clock = virtualClock(START + HOUR);
  const app = createApp({ outRoot, getToken: () => TOKEN, fetchImpl: fake, now: clock.now, sleep: clock.sleep, maxPerMinute: 10 });
  await inject(app.handler, { url: `${API}/refresh`, method: 'POST', headers: { 'X-Seeding-App': '1' } });
  await app.jobs.last.get(`${T}/${E}`).promise;
  assert.strictEqual(app.jobs.status(T, E).phase, 'done');
  const st = app.jobs.status(T, E);
  const rec = JSON.parse(fs.readFileSync(path.join(outRoot, st.run, 'views', 'refresh-sends.json'), 'utf8'));
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

test('app: the server binds 127.0.0.1', async () => {
  const outRoot = tmpOut();
  const log = console.log;
  console.log = () => {};
  try {
    const server = main(['--port', '0', '--out', outRoot]);
    await new Promise((r) => server.once('listening', r));
    assert.strictEqual(server.address().address, '127.0.0.1');
    await new Promise((r) => server.close(r));
  } finally { console.log = log; }
});
