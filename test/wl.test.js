'use strict';
// lib/wl.js (W-L fetch) against the fake start.gg, and views/major-table.js end to end on a fake
// run with a fake global fetch. Offline.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { run } = require('../lib/run');
const { parseCsv } = require('../lib/output');
const { createClient } = require('../lib/startgg');
const M = require('../lib/view/model');
const wl = require('../lib/wl');
const { buildWorld, createFakeFetch, virtualClock, sink, fakeSets, EVENT_SLUG } = require('../testlib/fake-api');

const ROOT = path.join(__dirname, '..');
const START = Date.UTC(2026, 9, 12, 15, 0, 0);
const TOKEN = 'TOKEN-SENTINEL-c0ffee';
const slash = (p) => p.replace(/\\/g, '/'); // NODE_OPTIONS reads backslashes as escapes

async function fakeRun() {
  const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'seeding-wl-'));
  const world = buildWorld(START / 1000);
  const clock = virtualClock(START);
  const code = await run({ url: 'https://www.start.gg/' + EVENT_SLUG, token: TOKEN, outRoot, fetchImpl: createFakeFetch(world), now: clock.now, sleep: clock.sleep, stderr: sink(), stdout: sink() });
  assert.strictEqual(code, 0);
  const runDir = path.join(outRoot, fs.readdirSync(outRoot)[0]);
  const read = (f) => parseCsv(fs.readFileSync(path.join(runDir, f), 'utf8'));
  return { world, runDir, players: read('players.csv'), results: read('results.csv') };
}
const userOf = (world, playerId) => world.players.find((p) => String(p.id) === String(playerId)).user;

// A2-2 (usage-log.md 2026-10-15): the live server-time-budget error showed up at 3-in-flight
// batched fetching; the workaround that cleared it was 1 request in flight. WORKERS (and
// fetchSetRecords' default when no `workers` option is passed — exactly how app/jobs.js and
// views/major-table.js call it) must default to 1, not the old 3.
test('wl: default concurrency is 1 in flight, not 3 (A2-2)', () => {
  assert.strictEqual(wl.WORKERS, 1);
});

test('wl: every fetchable row gets the record its sets tally to; DQs and byes excluded; long brackets paged alone', async () => {
  const { world, players, results } = await fakeRun();
  const clock = virtualClock(START);
  const order = [];
  const fetchImpl = createFakeFetch(world, { onSets: (op, v) => order.push([op, v]) });
  const client = createClient({ token: TOKEN, fetchImpl, now: clock.now, sleep: clock.sleep });
  const rows = results.filter(M.isGame);
  const cache = {};
  const chunks = [];
  const progress = await wl.fetchSetRecords({ client, players, rows, cache, onChunk: (p) => chunks.push(p) });

  const fetchable = rows.filter((r) => userOf(world, r.player_id));
  assert.ok(fetchable.length > 40, 'enough rows to need many batches');
  assert.strictEqual(progress.total, fetchable.length);
  assert.strictEqual(progress.noUser, rows.length - fetchable.length);
  assert.strictEqual(progress.done, fetchable.length);
  for (const r of fetchable) {
    const ev = world.players.find((p) => String(p.id) === r.player_id).events.find((e) => String(e.id) === r.event_id);
    const want = ev._noEntrant ? { missing: true } : fakeSets(r.event_id, userOf(world, r.player_id).id).record;
    assert.deepStrictEqual(cache[M.key(r)], want, `${M.key(r)}`);
  }
  assert.ok(fetchable.some((r) => Number(r.event_id) % 7 === 0), 'a >12-set bracket is in the data');
  assert.ok(order.some(([op]) => op === 'Sets'), 'brackets with more than one small page are refetched alone');
  assert.ok(fetchable.some((r) => Number(r.event_id) % 5 === 0 && cache[M.key(r)].dq === 1), 'a DQ was seen and excluded');
  assert.strictEqual(chunks[chunks.length - 1].done, fetchable.length);
  // Batches of at most 4 events per request.
  assert.ok(order.filter(([op]) => op === 'SetsBatch').every(([, v]) => Object.keys(v).length <= 2 * wl.BATCH));

  // A second pass with the cache fetches nothing.
  const before = fetchImpl.calls.length;
  const again = await wl.fetchSetRecords({ client, players, rows, cache });
  assert.strictEqual(again.total, 0);
  assert.strictEqual(fetchImpl.calls.length, before);
});

test('wl: summary rows are fetched first and counted separately', async () => {
  const { world, players, results } = await fakeRun();
  const clock = virtualClock(START);
  const seen = [];
  const fetchImpl = createFakeFetch(world, { onSets: (op, v) => { if (op === 'SetsBatch') for (let j = 0; `e${j}` in v; j++) seen.push(String(v[`e${j}`])); } });
  const client = createClient({ token: TOKEN, fetchImpl, now: clock.now, sleep: clock.sleep });
  const rows = results.filter(M.isGame).filter((r) => userOf(world, r.player_id));
  const summaryIds = new Set(rows.filter((r, i) => i % 5 === 0).map((r) => r.event_id + ':' + r.player_id));
  const isSummary = (r) => summaryIds.has(r.event_id + ':' + r.player_id);
  const ordered = [...rows.filter(isSummary), ...rows.filter((r) => !isSummary(r))];
  const p = await wl.fetchSetRecords({ client, players, rows: ordered, cache: {}, isSummary, workers: 1 });
  assert.strictEqual(p.summaryTotal, summaryIds.size);
  assert.strictEqual(p.summaryDone, summaryIds.size);
  const firstSummaryEvents = new Set(ordered.filter(isSummary).map((r) => r.event_id));
  assert.ok(seen.slice(0, firstSummaryEvents.size).every((id) => firstSummaryEvents.has(id)), 'the first batches are summary rows');
});

test('wl: saveCache writes atomically and loadCache merges the legacy bbb-records.json', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seeding-cache-'));
  fs.mkdirSync(path.join(dir, 'views'));
  fs.writeFileSync(path.join(dir, 'views', 'bbb-records.json'), JSON.stringify({ '1:2': { w: 1, l: 0, dq: 0 }, '1:3': { w: 0, l: 1, dq: 0 } }));
  wl.saveCache(dir, { '1:3': { w: 5, l: 5, dq: 0 } });
  assert.deepStrictEqual(wl.loadCache(dir), { '1:2': { w: 1, l: 0, dq: 0 }, '1:3': { w: 5, l: 5, dq: 0 } });
  assert.ok(!fs.existsSync(path.join(dir, 'views', 'set-records.json.tmp')));
});

test('views/major-table.js: renders a fake run end to end, fetching W-L through a fake start.gg', async () => {
  const { runDir, results } = await fakeRun();
  const calls = path.join(runDir, 'calls.jsonl');
  const env = { ...process.env, STARTGG_TOKEN: TOKEN, FAKE_WORLD_AT: String(START), FAKE_CALLS_FILE: calls,
    NODE_OPTIONS: `--require "${slash(path.join(ROOT, 'testlib', 'no-network.js'))}" --require "${slash(path.join(ROOT, 'testlib', 'fake-global-fetch.js'))}"` };
  const r = spawnSync(process.execPath, [path.join(ROOT, 'views', 'major-table.js'), runDir], { env, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(!r.stdout.includes(TOKEN) && !r.stderr.includes(TOKEN));
  const html = fs.readFileSync(path.join(runDir, 'views', 'major-table.html'), 'utf8');
  assert.match(html, /<table class="summary">/);
  assert.match(html, /GeneralMidwest/);
  const cache = JSON.parse(fs.readFileSync(path.join(runDir, 'views', 'set-records.json'), 'utf8'));
  assert.ok(Object.keys(cache).length >= results.filter(M.isGame).length - 5);
  const ops = fs.readFileSync(calls, 'utf8').trim().split('\n').map((l) => JSON.parse(l).op);
  assert.strictEqual(ops[0], 'UserIds');
  assert.ok(ops.includes('SetsBatch'));
  // --no-fetch with a full cache makes no requests and writes the same file.
  fs.rmSync(calls);
  const r2 = spawnSync(process.execPath, [path.join(ROOT, 'views', 'major-table.js'), runDir, '--no-fetch'], { env, encoding: 'utf8' });
  assert.strictEqual(r2.status, 0, r2.stderr);
  assert.ok(!fs.existsSync(calls));
  assert.strictEqual(fs.readFileSync(path.join(runDir, 'views', 'major-table.html'), 'utf8'), html);
});
