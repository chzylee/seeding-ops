'use strict';
// The live-check instruments, offline (build B pass 3, ahead of increment 1's live legs C2-1/C2-2):
// scripts/ground-truth.js, scripts/reconcile.js's --live checks and scripts/record-fixtures.js, each
// driven through ONE lib/startgg client against the fake start.gg, the way the live run drives them
// against the real one. A failing instrument here would make the live result meaningless.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sgg = require('../lib/startgg');
const out = require('../lib/output');
const { run } = require('../lib/run');
const { groundTruth } = require('../scripts/ground-truth');
const { reconcile, liveCheck } = require('../scripts/reconcile');
const { recordFixtures, capturing } = require('../scripts/record-fixtures');
const { buildWorld, createFakeFetch, virtualClock, sink, T_SLUG, E_SLUG, E2_SLUG, EVENT_SLUG } = require('../testlib/fake-api');

const TOKEN = 'TOKEN-SENTINEL-c0ffee';
const START = Date.UTC(2026, 9, 12, 15, 0, 0);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'seeding-instr-'));

async function fakePool() {
  const outRoot = tmp();
  const world = buildWorld(START / 1000);
  const clock = virtualClock(START);
  assert.strictEqual(await run({ tournament: T_SLUG, events: [E_SLUG, E2_SLUG], token: TOKEN, outRoot, fetchImpl: createFakeFetch(world), now: clock.now, sleep: clock.sleep, stderr: sink(), stdout: sink() }), 0);
  const tDir = path.join(outRoot, T_SLUG);
  return { world, dir: path.join(tDir, out.readCurrent(tDir)) };
}
const clientOn = (fake) => { const c = virtualClock(START); return sgg.createClient({ token: TOKEN, fetchImpl: fake, now: c.now, sleep: c.sleep }); };

test('ground-truth: the independent count of GeneralMidwest (user/14364d39) matches the pull, at any page size; a missing row and a wrong placement are caught', async () => {
  const { world, dir } = await fakePool();
  for (const perPage of [50, 100]) {
    const fake = createFakeFetch(world);
    const r = await groundTruth({ client: clientOn(fake), runDir: dir, samples: 3, perPage, log: () => {}, random: () => 0.5 });
    assert.strictEqual(r.failures, 0, r.lines.join('\n'));
    assert.strictEqual(r.count, 83, '82 in 0..729 days + the 730-day boundary');
    assert.strictEqual(r.rows, r.count);
    assert.strictEqual(fake.calls.filter((c) => c.op === 'GTUserEvents').length, Math.ceil(129 / perPage));
    assert.strictEqual(fake.calls.filter((c) => c.op === 'GTEvent').length, 3);
  }
  // Drop one of GeneralMidwest's rows and change another player's placement: both are caught.
  const results = out.parseCsv(fs.readFileSync(path.join(dir, 'results.csv'), 'utf8'));
  const i = results.findIndex((x) => x.player_id === '101');
  results.splice(i, 1);
  for (const x of results) if (x.player_id !== '101' && x.placement) x.placement = String(Number(x.placement) + 100);
  fs.writeFileSync(path.join(dir, 'results.csv'), out.toCsv(out.RESULT_COLUMNS, results));
  const bad = await groundTruth({ client: clientOn(createFakeFetch(world)), runDir: dir, samples: 3, log: () => {}, random: () => 0.99 });
  assert.match(bad.lines[0], /^FAIL /);
  assert.ok(bad.failures >= 2, bad.lines.join('\n'));
});

test('reconcile --live (liveCheck): a fresh participant count per seeded event through the given client', async () => {
  const { world, dir } = await fakePool();
  const fake = createFakeFetch(world);
  const res = await liveCheck(reconcile(dir), clientOn(fake));
  assert.deepStrictEqual(res.checks.filter((c) => !c.ok), []);
  assert.deepStrictEqual(fake.calls.map((c) => c.op), ['ReconcileCount', 'ReconcileCount'], 'one request per seeded event');
});

test('record-fixtures: four requests, deterministic files (data, variables, the recording date, queryComplexity only), no token', async () => {
  const world = buildWorld(START / 1000);
  const dir = tmp();
  const capture = capturing(createFakeFetch(world));
  const client = clientOn(capture);
  const r = await recordFixtures({ client, capture, url: `https://www.start.gg/${EVENT_SLUG}`, userId: '9001', dir, recordedOn: '2026-10-29', log: () => {} });
  assert.deepStrictEqual(r.written, ['event.json', 'entrants-page.json', 'user-events-page.json', 'recent-standings.json']);
  assert.strictEqual(client.stats.requests, 4);
  assert.strictEqual(r.userEventsTotal, 129);
  for (const f of r.written) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    const j = JSON.parse(text);
    assert.deepStrictEqual(Object.keys(j), ['_source', '_recorded_on', '_variables', 'data', 'extensions'], f);
    assert.deepStrictEqual(Object.keys(j.extensions), ['queryComplexity']);
    assert.strictEqual(j._recorded_on, '2026-10-29');
    assert.ok(!text.includes(TOKEN), `${f}: no token`);
  }
});

test('token-absent: finds a token in a file by value and in git history, and prints nothing but paths and counts', () => {
  const { scan } = require('../scripts/token-absent');
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'a', 'b'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'a', 'clean.csv'), 'nothing here\n');
  fs.writeFileSync(path.join(dir, 'a', 'b', 'leak.json'), `{"auth":"Bearer ${TOKEN}"}`);
  const r = scan({ token: TOKEN, paths: [path.join(dir, 'a')] });
  assert.deepStrictEqual(r.files, [path.join(dir, 'a', 'b', 'leak.json')]);
  assert.strictEqual(r.scanned, 2);
  assert.strictEqual(r.gitHits, null);
  assert.deepStrictEqual(scan({ token: 'not-present-anywhere-zz9', paths: [path.join(dir, 'a')] }).files, []);
  assert.throws(() => scan({ token: '', paths: [] }), /no token/);
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'token-absent.js'), 'utf8');
  assert.ok(!/console\.(log|error)\([^)]*\btoken\b[^)]*\)/.test(src.replace(/No STARTGG_TOKEN[^']*'/, '')), 'the token is never an argument to a print');
});
