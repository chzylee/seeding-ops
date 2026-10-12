'use strict';
// End-to-end against the fake API: output shape, reconciliation, token hygiene, the setup
// failures (exit 2, no folder), a real kill + --resume, and the no-account fallback.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { run, EXIT_OK, EXIT_INCOMPLETE, EXIT_SETUP } = require('../lib/run');
const out = require('../lib/output');
const { reconcile } = require('../scripts/reconcile');
const { checkRequests } = require('../scripts/check-requests');
const { buildWorld, createFakeFetch, virtualClock, sink, EVENT_SLUG } = require('../testlib/fake-api');

const TOKEN = 'TOKEN-SENTINEL-c0ffee';
const URL = 'https://www.start.gg/' + EVENT_SLUG;
const START = Date.UTC(2026, 9, 12, 15, 0, 0);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'seeding-run-'));

async function freshRun(fetchOpts = {}, extra = {}) {
  const outRoot = tmp();
  const world = buildWorld(START / 1000);
  const clock = virtualClock(START);
  const fetchImpl = createFakeFetch(world, fetchOpts);
  const err = sink();
  const std = sink();
  const code = await run({ url: URL, token: TOKEN, outRoot, fetchImpl, now: clock.now, sleep: clock.sleep, stderr: err, stdout: std, ...extra });
  const dirs = fs.existsSync(outRoot) ? fs.readdirSync(outRoot) : [];
  return { code, outRoot, dirs, runDir: dirs[0] && path.join(outRoot, dirs[0]), world, fetchImpl, err: err.text(), std: std.text() };
}

function allFiles(dir) {
  const res = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) res.push(...allFiles(p)); else res.push(p);
  }
  return res;
}

test('run: full fake run writes players.csv, results.csv, meta.json that reconcile', async () => {
  const r = await freshRun();
  assert.strictEqual(r.code, EXIT_OK, r.err);
  assert.strictEqual(r.dirs.length, 1);
  assert.match(r.dirs[0], /^combo-breaker-2026__melty-blood-actress-again-current-code__\d{8}-\d{4}$/);
  const rec = reconcile(r.runDir);
  const failed = rec.checks.filter((c) => !c.ok);
  assert.deepStrictEqual(failed, [], JSON.stringify(failed));

  const { players, results, meta } = rec;
  assert.deepStrictEqual(Object.keys(players[0]), out.PLAYER_COLUMNS);
  assert.deepStrictEqual(Object.keys(results[0]), out.RESULT_COLUMNS);
  assert.strictEqual(players.length, 15);
  assert.strictEqual(meta.team_entries_split, 1);
  assert.deepStrictEqual(meta.history_status, { complete: 14, limited: 1, failed: 0 });

  // P1 (GeneralMidwest): 129 events over 2 pages, 83 in window (incl. the exact 730-day edge).
  const gm = players.find((p) => p.player_id === '101');
  assert.strictEqual(gm.result_count, '83');
  assert.strictEqual(gm.history_status, 'complete');
  const gmRows = results.filter((r) => r.player_id === '101');
  assert.ok(gmRows.some((r) => r.is_event_game === 'false'), 'other games kept, flagged');
  assert.ok(gmRows.every((r, i) => i === 0 || gmRows[i - 1].event_date >= r.event_date), 'newest first');

  // Skipped totals across the world: P1 46, P2 1, P4 1 out of window + 1 phase, P8..15 1 each.
  assert.deepStrictEqual(meta.skipped, { out_of_window: 46 + 1 + 1 + 8, no_event_container: 1 });
  // Pending player: no standing -> blank; null userEntrant -> blank, still kept.
  const pend = results.filter((r) => r.player_id === '107');
  assert.deepStrictEqual(pend.map((r) => r.placement), ['', '']);
  assert.strictEqual(meta.request_count, r.fetchImpl.calls.length);
  assert.ok(meta.query_complexity_max > 0 && meta.query_complexity_max < 1000);
  assert.ok(r.std.includes('Done:'));
  assert.ok(r.err.includes('player 1/15 · page 1/2'), 'progress on stderr');
  assert.ok(!fs.readdirSync(r.runDir).some((f) => f.endsWith('.tmp')));
});

test('run: region columns and region_coverage (hidden, partial, no account)', async () => {
  const r = await freshRun();
  const { players, meta } = reconcile(r.runDir);
  const by = Object.fromEntries(players.map((p) => [p.player_id, p]));
  assert.deepStrictEqual([by['101'].region_state, by['101'].region_country], ['IL', 'United States']);
  assert.deepStrictEqual([by['102'].region_state, by['102'].region_country], ['', 'Japan']);
  assert.deepStrictEqual([by['103'].region_state, by['103'].region_country], ['', '']);
  assert.deepStrictEqual([by['104'].region_state, by['104'].region_country], ['', '']);
  assert.deepStrictEqual(meta.region_coverage, { with_state: 12, with_country: 13, neither: 2 });
});

test('run: a no-account registrant is limited, from recentStandings for the event game', async () => {
  const r = await freshRun();
  const { players, results } = reconcile(r.runDir);
  const guest = players.find((p) => p.player_id === '104');
  assert.strictEqual(guest.history_status, 'limited');
  assert.strictEqual(guest.user_slug, '');
  assert.strictEqual(guest.result_count, '1');
  assert.strictEqual(results.find((x) => x.player_id === '104').placement, '3');
  const rs = r.fetchImpl.calls.filter((c) => c.op === 'RecentStandings');
  assert.strictEqual(rs.length, 1);
  assert.strictEqual(String(rs[0].variables.videogameId), '22');
  assert.ok(!r.fetchImpl.calls.some((c) => c.op === 'UserEvents' && c.variables.userId == null));
});

test('run: tags with = + - @ , and quotes survive to players.csv and results.csv verbatim', async () => {
  const r = await freshRun();
  const { players, results } = reconcile(r.runDir);
  const tag = '=SUM(1,2) "the" @Kid, -x';
  assert.strictEqual(players.find((p) => p.player_id === '102').gamer_tag, tag);
  assert.strictEqual(players.find((p) => p.player_id === '102').prefix, '+P');
  assert.ok(results.filter((x) => x.player_id === '102').every((x) => x.gamer_tag === tag));
  const raw = fs.readFileSync(path.join(r.runDir, 'players.csv'));
  assert.ok(raw.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), 'BOM');
});

test('run: the token appears in no file the run writes (outputs, checkpoint, request log)', async () => {
  const r = await freshRun();
  const files = allFiles(r.runDir);
  assert.ok(files.length >= 6, files.join(', '));
  for (const f of files) assert.ok(!fs.readFileSync(f, 'utf8').includes(TOKEN), f);
  assert.ok(!r.err.includes(TOKEN) && !r.std.includes(TOKEN));
});

test('run: backoff is exercised and logged when start.gg answers 429', async () => {
  const r = await freshRun({ rateLimitFirst: 2 });
  assert.strictEqual(r.code, EXIT_OK, r.err);
  const chk = checkRequests(r.runDir);
  assert.strictEqual(chk.backoffs, 2);
  assert.ok(chk.maxWindow <= 75);
  const meta = JSON.parse(fs.readFileSync(path.join(r.runDir, 'meta.json'), 'utf8'));
  assert.strictEqual(meta.retries, 2);
  assert.deepStrictEqual(reconcile(r.runDir).checks.filter((c) => !c.ok), []);
});

test('run: a player whose requests keep failing ends "failed", is listed in meta, and the run exits 1', async () => {
  const r = await freshRun({ serverErrorPlayer: 9003 });
  assert.strictEqual(r.code, EXIT_INCOMPLETE);
  const { players, meta, checks } = reconcile(r.runDir);
  assert.deepStrictEqual(checks.filter((c) => !c.ok), []);
  assert.strictEqual(players.find((p) => p.player_id === '103').history_status, 'failed');
  assert.strictEqual(meta.failed_players.length, 1);
  assert.match(meta.failed_players[0].error, /gave up after 5 tries/);
  assert.strictEqual(r.fetchImpl.calls.filter((c) => c.op === 'UserEvents' && String(c.variables.userId) === '9003').length, 5);
});

test('run: missing token -> plain message, exit 2, no output folder, no request', async () => {
  const r = await freshRun({}, { token: '' });
  assert.strictEqual(r.code, EXIT_SETUP);
  assert.deepStrictEqual(r.dirs, []);
  assert.strictEqual(r.fetchImpl.calls.length, 0);
  assert.match(r.err, /No start\.gg token found/);
});

test('run: bad token (recorded 400 body) -> plain message, exit 2, no output folder, one request, no retry', async () => {
  const r = await freshRun({ badToken: true });
  assert.strictEqual(r.code, EXIT_SETUP);
  assert.deepStrictEqual(r.dirs, []);
  assert.strictEqual(r.fetchImpl.calls.length, 1);
  assert.match(r.err, /rejected the token/);
  assert.ok(!r.err.includes(TOKEN));
});

test('run: bad URL and unknown event -> exit 2, no output folder', async () => {
  const a = await freshRun({}, { url: 'https://www.start.gg/tournament/combo-breaker-2026' });
  assert.strictEqual(a.code, EXIT_SETUP);
  assert.deepStrictEqual(a.dirs, []);
  assert.strictEqual(a.fetchImpl.calls.length, 0);
  const b = await freshRun({}, { url: 'https://www.start.gg/tournament/nope/event/nope' });
  assert.strictEqual(b.code, EXIT_SETUP);
  assert.deepStrictEqual(b.dirs, []);
  assert.match(b.err, /No event found/);
});

test('run: a schema error mid-run stops the run with no final output, resumable', async () => {
  const r = await freshRun({ schemaErrorOn: 'UserEvents' });
  assert.strictEqual(r.code, EXIT_INCOMPLETE);
  assert.strictEqual(r.dirs.length, 1);
  assert.deepStrictEqual(out.outputsPresent(r.runDir), []);
  assert.match(r.err, /--resume/);
  assert.strictEqual(r.fetchImpl.calls.filter((c) => c.op === 'UserEvents').length, 1, 'no retry on a schema error');
});

test('kill + resume: SIGKILL after 13 players leaves no output files; --resume finishes without refetching and matches a clean run', () => {
  const outRoot = tmp();
  const harness = path.join(__dirname, '..', 'testlib', 'fake-pull.js');
  // UserEvents call 14 = P1 takes 2 pages, then P2..P13 one each (P4 uses recentStandings)
  // -> P1..P13 (13 players, P4 via recentStandings) checkpointed before the kill.
  const killed = spawnSync(process.execPath, [harness, outRoot, String(START), String(START), '--kill-at', '14'], { encoding: 'utf8' });
  assert.notStrictEqual(killed.status, 0, 'killed run must not exit 0');
  const [dir] = fs.readdirSync(outRoot);
  const runDir = path.join(outRoot, dir);
  // Acceptance 8: no fake-complete output.
  assert.deepStrictEqual(out.outputsPresent(runDir), []);
  const before = out.readCheckpoint(runDir).done;
  assert.ok(before.size >= 10, `checkpointed ${before.size}`);

  const resumed = spawnSync(process.execPath, [harness, outRoot, String(START), String(START + 600_000), '--resume', runDir], { encoding: 'utf8' });
  assert.strictEqual(resumed.status, 0, resumed.stderr);
  assert.match(resumed.stderr, new RegExp(`Resuming: ${before.size} of 15 players already checkpointed`));

  // Acceptance 7: log shows checkpointed players were not refetched.
  const chk = checkRequests(runDir);
  assert.strictEqual(chk.resumes, 1);
  assert.deepStrictEqual(chk.refetched, []);
  assert.strictEqual(chk.sessions[1].players.size, 15 - before.size);
  assert.deepStrictEqual(reconcile(runDir).checks.filter((c) => !c.ok), []);

  // Matches a clean run's player set and row counts.
  const clean = spawnSync(process.execPath, [harness, outRoot, String(START), String(START)], { encoding: 'utf8' });
  assert.strictEqual(clean.status, 0, clean.stderr);
  const cleanDir = fs.readdirSync(outRoot).map((d) => path.join(outRoot, d)).find((d) => d !== runDir);
  const a = reconcile(runDir);
  const b = reconcile(cleanDir);
  const summary = (x) => x.players.map((p) => `${p.player_id}:${p.result_count}:${p.history_status}`).join(',');
  assert.strictEqual(summary(a), summary(b));
  assert.strictEqual(a.results.length, b.results.length);
  assert.strictEqual(a.meta.sessions, 2);
});

test('resume: a finished run with no failures is left alone', async () => {
  const r = await freshRun();
  const err = sink();
  const code = await run({ resumeDir: r.runDir, token: TOKEN, fetchImpl: r.fetchImpl, stderr: err, stdout: sink() });
  assert.strictEqual(code, EXIT_OK);
  assert.match(err.text(), /already finished/);
});

test('resume: a finished run with a failed player retries just that player', async () => {
  const r = await freshRun({ serverErrorPlayer: 9003 });
  const world = buildWorld(START / 1000);
  const clock = virtualClock(START + 900_000);
  const fetchImpl = createFakeFetch(world);
  const code = await run({ resumeDir: r.runDir, token: TOKEN, fetchImpl, now: clock.now, sleep: clock.sleep, stderr: sink(), stdout: sink() });
  assert.strictEqual(code, EXIT_OK);
  // Ids travel as strings (GraphQL ID accepts either).
  assert.deepStrictEqual(fetchImpl.calls.map((c) => c.variables.userId), ['9003']);
  const { meta, checks } = reconcile(r.runDir);
  assert.deepStrictEqual(checks.filter((c) => !c.ok), []);
  assert.deepStrictEqual(meta.history_status, { complete: 14, limited: 1, failed: 0 });
});
