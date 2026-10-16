'use strict';
// lib/view/data.js — updatePlayer (the tier/justification/notes write path behind the app's
// POST /api/e/<t>/<e>/player/<id>) and the route itself.
//
// A2-1 (build-record-webapp.md, pass 2): updatePlayer's tag-normalizer was missing a backslash
// (`/s+/g` instead of `/\s+/g`), so a tag whose whitespace wasn't byte-identical to the stored
// sheet_tag/startgg_tag never matched, and the edit forked a second, orphaned row instead of
// updating the first — the exact "tag matching to the wrong row, duplicate rows" failure mode the
// dispatch named. The regex itself was hotfixed upstream (commit 4eb8241); this file is the
// regression net that didn't exist for it (the auditor's A2-1 finding: `grep -rn
// "TIERS_FILE|updatePlayer|tiers.csv" test/` returned nothing). It also makes the tiers file path
// injectable (`tiersFile`, threaded through readNotes/viewModel/summaryExport/updatePlayer, and
// createApp({ tiersFile }) on the server) so these tests — and any future ones — never read or
// write the real registry/tiers.csv, never POST to Noah's running app, and never touch his
// working tree's registry/ at all. Every tiers file here lives under this test's own temp folder.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { toCsv, parseCsv } = require('../lib/output');
const data = require('../lib/view/data');
const { createApp } = require('../app/server');
const { inject } = require('../testlib/inject');

const PLAYER_COLS = ['player_id', 'gamer_tag', 'prefix', 'user_slug', 'region_state', 'region_country', 'result_count', 'history_status', 'team_entry'];
const RESULT_COLS = ['player_id', 'gamer_tag', 'event_date', 'game_id', 'game_name', 'is_event_game', 'tournament_name', 'event_name', 'event_slug', 'event_id', 'num_entrants', 'placement', 'is_online'];
const TIER_COLS = ['game_id', 'game_name', 'player_id', 'startgg_tag', 'sheet_tag', 'tier', 'justification', 'notes', 'decided_on', 'source', 'sheet_region', 'sheet_placements', 'sheet_notes'];

const tmpDir = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

// A minimal FINISHED run folder: just enough for loadRun/viewModel (updatePlayer only needs
// players.csv and meta.json's game id/name; results.csv can be empty).
function makeRun(outRoot, { t = 'tour', e = 'ev', players, game = { id: '1', name: 'MBTL' } }) {
  const dir = path.join(outRoot, `${t}__${e}__20261015-0000`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'players.csv'), toCsv(PLAYER_COLS, players));
  fs.writeFileSync(path.join(dir, 'results.csv'), toCsv(RESULT_COLS, []));
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({
    event: { id: '9', slug: `tournament/${t}/event/${e}`, name: 'Ev', tournament_name: 'Tour' },
    game, run_at: '2026-10-15T00:00:00.000Z',
    window: { start: '2024-10-15T00:00:00.000Z', end: '2026-10-15T00:00:00.000Z', days: 730 },
    registrant_count: players.length, history_status: { complete: players.length, limited: 0, failed: 0 },
  }, null, 2));
  return dir;
}

function seedTiers(file, rows) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, toCsv(TIER_COLS, rows));
}
function readTiersFile(file) {
  return parseCsv(fs.readFileSync(file, 'utf8'));
}
const player = (id, tag, extra = {}) => ({ player_id: String(id), gamer_tag: tag, prefix: '', user_slug: `u${id}`, region_state: 'NY', region_country: 'United States', result_count: '0', history_status: 'complete', team_entry: 'false', ...extra });

test('updatePlayer: a multi-word tag matches the existing sheet-imported row by tag — no duplicate', () => {
  const outRoot = tmpDir('seeding-tiers-match-');
  const tiersFile = path.join(outRoot, 'registry', 'tiers.csv');
  const dir = makeRun(outRoot, { players: [player(101, 'Mrs Smith')] });
  // Pre-link state: no player_id yet, exactly how every sheet-imported row starts.
  seedTiers(tiersFile, [{ game_id: '1', game_name: 'MBTL', player_id: '', startgg_tag: '', sheet_tag: 'Mrs  Smith', tier: '7', justification: 'sheet seed', notes: '', decided_on: '', source: 'sheet import', sheet_region: '', sheet_placements: '', sheet_notes: '' }]);

  const result = data.updatePlayer(dir, '101', { tier: 9, justification: 'retest' }, { now: new Date('2026-10-15T00:00:00Z'), tiersFile });

  const rows = readTiersFile(tiersFile);
  assert.strictEqual(rows.length, 1, 'the edit updated the existing row instead of forking a duplicate');
  assert.strictEqual(rows[0].player_id, '101');
  assert.strictEqual(rows[0].tier, '9');
  assert.strictEqual(rows[0].justification, 'retest');
  assert.strictEqual(rows[0].source, 'app');
  assert.strictEqual(result.tier, 9);
  assert.strictEqual(result.player_id, '101');
});

test('updatePlayer: player_id match — once a row is linked, a second edit matches by id, not tag, and still does not duplicate', () => {
  const outRoot = tmpDir('seeding-tiers-pid-');
  const tiersFile = path.join(outRoot, 'registry', 'tiers.csv');
  const dir = makeRun(outRoot, { players: [player(202, 'Kyuseishu')] });
  seedTiers(tiersFile, [{ game_id: '1', game_name: 'MBTL', player_id: '202', startgg_tag: 'Kyuseishu', sheet_tag: 'Kyuseishu', tier: '3', justification: '', notes: '', decided_on: '2026-09-01', source: 'app', sheet_region: '', sheet_placements: '', sheet_notes: '' }]);

  // The player's displayed tag has since drifted from what's on file (casing/spacing); the
  // player_id match must still win over any tag lookup.
  data.updatePlayer(dir, '202', { notes: 'strong neutral game' }, { tiersFile });

  const rows = readTiersFile(tiersFile);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].player_id, '202');
  assert.strictEqual(rows[0].notes, 'strong neutral game');
  assert.strictEqual(rows[0].tier, '3', 'tier untouched by a notes-only edit');
});

test('updatePlayer: a player with no tiers row at all gets a new one created, linked by player_id', () => {
  const outRoot = tmpDir('seeding-tiers-new-');
  const tiersFile = path.join(outRoot, 'registry', 'tiers.csv');
  const dir = makeRun(outRoot, { players: [player(303, 'Freshmeat')] });
  seedTiers(tiersFile, [{ game_id: '1', game_name: 'MBTL', player_id: '', startgg_tag: '', sheet_tag: 'Someone Else', tier: '5', justification: '', notes: '', decided_on: '', source: 'sheet import', sheet_region: '', sheet_placements: '', sheet_notes: '' }]);

  const result = data.updatePlayer(dir, '303', { tier: 2 }, { now: new Date('2026-10-15T00:00:00Z'), tiersFile });

  const rows = readTiersFile(tiersFile);
  assert.strictEqual(rows.length, 2, 'the unrelated row is untouched, and one new row was added');
  const mine = rows.find((r) => r.player_id === '303');
  assert.ok(mine, 'a new row was created for the player');
  assert.strictEqual(mine.tier, '2');
  assert.strictEqual(mine.startgg_tag, 'Freshmeat');
  assert.strictEqual(mine.source, 'app');
  assert.strictEqual(result.tier, 2);
});

test('updatePlayer: tier must be a whole number 0-20 — non-integer and out-of-range both -> 400, and nothing is written', () => {
  const outRoot = tmpDir('seeding-tiers-validate-');
  const tiersFile = path.join(outRoot, 'registry', 'tiers.csv');
  const dir = makeRun(outRoot, { players: [player(404, 'Tagless')] });
  seedTiers(tiersFile, []);

  for (const bad of ['abc', 3.5, -1, 21, '7.2']) {
    assert.throws(() => data.updatePlayer(dir, '404', { tier: bad }, { tiersFile }),
      (err) => err.status === 400, `tier ${JSON.stringify(bad)} should 400`);
  }
  // Nothing was written: the validation throws before any file touch.
  assert.ok(!fs.existsSync(tiersFile) || readTiersFile(tiersFile).length === 0);

  // A valid edit afterward still works (the earlier failures didn't corrupt anything).
  const ok = data.updatePlayer(dir, '404', { tier: 0 }, { tiersFile });
  assert.strictEqual(ok.tier, 0);
  const okHigh = data.updatePlayer(dir, '404', { tier: 20 }, { tiersFile });
  assert.strictEqual(okHigh.tier, 20);
});

test('updatePlayer: decided_on is stamped only when the tier value actually changes', () => {
  const outRoot = tmpDir('seeding-tiers-decided-');
  const tiersFile = path.join(outRoot, 'registry', 'tiers.csv');
  const dir = makeRun(outRoot, { players: [player(505, 'Stoic')] });
  seedTiers(tiersFile, []);

  const first = data.updatePlayer(dir, '505', { tier: 4 }, { now: new Date('2026-10-01T00:00:00Z'), tiersFile });
  assert.strictEqual(first.decided_on, '2026-10-01');

  // Same tier again, later: decided_on must not move.
  const same = data.updatePlayer(dir, '505', { tier: 4 }, { now: new Date('2026-10-10T00:00:00Z'), tiersFile });
  assert.strictEqual(same.decided_on, '2026-10-01', 'unchanged tier does not re-stamp decided_on');

  // A justification/notes-only edit, no tier field at all: decided_on untouched either.
  const notesOnly = data.updatePlayer(dir, '505', { notes: 'x' }, { now: new Date('2026-10-11T00:00:00Z'), tiersFile });
  assert.strictEqual(notesOnly.decided_on, '2026-10-01');

  // A real tier change: decided_on moves to the new date.
  const changed = data.updatePlayer(dir, '505', { tier: 9 }, { now: new Date('2026-10-12T00:00:00Z'), tiersFile });
  assert.strictEqual(changed.decided_on, '2026-10-12');
});

test('updatePlayer: the write is atomic (temp file + rename) — no .tmp left behind, and the full table round-trips', () => {
  const outRoot = tmpDir('seeding-tiers-atomic-');
  const tiersFile = path.join(outRoot, 'registry', 'tiers.csv');
  const dir = makeRun(outRoot, { players: [player(606, 'Anvil'), player(607, 'Breeze')] });
  seedTiers(tiersFile, [{ game_id: '1', game_name: 'MBTL', player_id: '', startgg_tag: '', sheet_tag: 'Breeze', tier: '12', justification: 'carry', notes: 'n', decided_on: '2026-08-01', source: 'sheet import', sheet_region: 'NY', sheet_placements: '', sheet_notes: '' }]);

  data.updatePlayer(dir, '606', { tier: 1 }, { tiersFile });
  assert.ok(!fs.existsSync(tiersFile + '.tmp'), 'no leftover temp file');
  let rows = readTiersFile(tiersFile);
  assert.strictEqual(rows.length, 2);
  // The untouched row's other columns survive byte for byte.
  const breeze = rows.find((r) => r.sheet_tag === 'Breeze');
  assert.strictEqual(breeze.tier, '12');
  assert.strictEqual(breeze.sheet_region, 'NY');

  data.updatePlayer(dir, '607', { tier: 2 }, { tiersFile });
  assert.ok(!fs.existsSync(tiersFile + '.tmp'));
  rows = readTiersFile(tiersFile);
  assert.strictEqual(rows.length, 2, 'the second edit matched Breeze by player_id/tag, not a third row');
});

// ---- The route: POST /api/e/<t>/<e>/player/<id> ------------------------------------------------
test('route: POST player edit — X-Seeding-App guard, JSON body, field allow-list, against a temp tiers file', async () => {
  const outRoot = tmpDir('seeding-tiers-route-');
  const tiersFile = path.join(outRoot, 'registry', 'tiers.csv');
  makeRun(outRoot, { t: 'tour', e: 'ev', players: [player(1, 'Alice'), player(2, 'Bob')] });
  seedTiers(tiersFile, []);
  const app = createApp({ outRoot, tiersFile, getToken: () => 'unused' });
  const API = '/api/e/tour/ev/player/1';

  // No X-Seeding-App header -> 403, nothing written.
  const noHeader = await inject(app.handler, { url: API, method: 'POST', body: JSON.stringify({ tier: 5 }) });
  assert.strictEqual(noHeader.status, 403);
  assert.ok(!fs.existsSync(tiersFile) || readTiersFile(tiersFile).length === 0);

  // Malformed JSON body -> 400.
  const badJson = await inject(app.handler, { url: API, method: 'POST', headers: { 'X-Seeding-App': '1' }, body: 'not json' });
  assert.strictEqual(badJson.status, 400);
  assert.match(badJson.json().error, /JSON/);

  // A field not on the allow-list (tier, justification, notes) is dropped before it ever reaches
  // updatePlayer — it cannot override startgg_tag, source, or anything else on the row.
  const withExtra = await inject(app.handler, {
    url: API, method: 'POST', headers: { 'X-Seeding-App': '1' },
    body: JSON.stringify({ tier: 8, justification: 'solid', source: 'hacked', startgg_tag: 'EVIL', player_id: '999' }),
  });
  assert.strictEqual(withExtra.status, 200);
  const body = withExtra.json();
  assert.strictEqual(body.tier, 8);
  assert.strictEqual(body.justification, 'solid');
  assert.strictEqual(body.player_id, '1', 'the URL\'s player id wins, not a body-supplied one');
  const rows = readTiersFile(tiersFile);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].source, 'app', 'source is server-assigned, never client-supplied');
  assert.strictEqual(rows[0].startgg_tag, 'Alice', 'the real player tag, not the body\'s "EVIL"');

  // Unknown player id -> 404 (updatePlayer's own error, surfaced through the route).
  const unknown = await inject(app.handler, { url: '/api/e/tour/ev/player/999', method: 'POST', headers: { 'X-Seeding-App': '1' }, body: JSON.stringify({ tier: 1 }) });
  assert.strictEqual(unknown.status, 404);

  // Invalid tier through the route -> 400, same as the direct unit test.
  const badTier = await inject(app.handler, { url: '/api/e/tour/ev/player/2', method: 'POST', headers: { 'X-Seeding-App': '1' }, body: JSON.stringify({ tier: 99 }) });
  assert.strictEqual(badTier.status, 400);

  // Still exactly one row: Alice's, untouched by the 404/400 attempts.
  assert.strictEqual(readTiersFile(tiersFile).length, 1);
});

test('route and unit path both resolve to the SAME default (registry/tiers.csv) when no tiersFile is given — proven without touching it', () => {
  // defaultTiersFile() must point at the real repo path by default (the contract: "defaulting to
  // registry/tiers.csv"), and nothing in this file calls updatePlayer without an explicit
  // tiersFile override, so the real file is never written by this suite.
  assert.strictEqual(data.defaultTiersFile(), data.TIERS_FILE);
  assert.match(data.defaultTiersFile().replace(/\\/g, '/'), /registry\/tiers\.csv$/);
});
