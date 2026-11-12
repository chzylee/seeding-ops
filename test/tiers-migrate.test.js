'use strict';
// lib/tiers-migrate.js and scripts/migrate-tiers.js — the T1 migration of registry/tiers.csv
// (docs/design-tool.md, T1; dispatch-contract-tool.md, Acceptance 2). Offline. Every file written
// here lives in this test's temp folder; the real registry/tiers.csv is only read.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { migrateTiersT1, migrateTiersDiscriminator, migrateTiers, splitRaw, unquote } = require('../lib/tiers-migrate');
const { parseCsv } = require('../lib/output');
const script = require('../scripts/migrate-tiers');

const BOM = '﻿';
const OLD_COLS = ['game_id', 'game_name', 'player_id', 'startgg_tag', 'sheet_tag', 'tier', 'justification', 'notes', 'decided_on', 'source', 'sheet_region', 'sheet_placements', 'sheet_notes'];
const NEW_COLS = ['game_id', 'game_name', 'player_id', 'startgg_tag', 'sheet_tag', 'tier', 'notes', 'decided_on', 'last_reviewed_on', 'last_reviewed_tournament', 'source', 'sheet_region', 'sheet_placements', 'sheet_notes'];
// Build C (Amendment A1.1): the discriminator column right after player_id.
const C_COLS = [...NEW_COLS.slice(0, 3), 'discriminator', ...NEW_COLS.slice(3)];
const REAL = path.join(__dirname, '..', 'registry', 'tiers.csv');
const q = (v) => `"${String(v).replace(/"/g, '""')}"`;

// A file with the real registry/tiers.csv's shape as of the Eclipse snapshot (commit 643a698):
// BOM, every field quoted, CRLF, 13 columns, 712 rows of MBAACC, 107 with source "app" and a
// decided_on, 605 sheet-import rows with none, no justification values. Fields carry the kinds of
// text the real file has (commas, embedded quotes, non-ASCII tags, empty fields) plus a few it
// doesn't yet (a newline inside a field), so byte-identity is tested on the hard cases.
function realShape({ eol = '\r\n', rows = 712, app = 107 } = {}) {
  const lines = [OLD_COLS.map(q).join(',')];
  for (let k = 0; k < rows; k++) {
    const isApp = k % Math.floor(rows / app) === 0 && lines.length - 1 < rows && countApp(lines) < app;
    const tag = ['Kouryuu', 'Mr. "Q", the 2nd', 'ナナシ', 'A,B', ''][k % 5] + (k % 5 === 4 ? '' : ` ${k}`);
    lines.push([
      '22407', 'Melty Blood Actress Again Current Code', isApp ? String(10000 + k) : (k % 7 ? '' : String(20000 + k)),
      isApp ? tag : '', tag, String(k % 11), '', isApp && k % 3 ? `note ${k}, with "quotes"` : '',
      isApp ? `2026-10-${String(10 + (k % 7)).padStart(2, '0')}` : '', isApp ? 'app' : 'sheet import 2026-10-15 (All Players/Seeds)',
      ['NY', 'NJ, USA', '', 'Ontario'][k % 4], k % 9 ? '' : '1st @ X\nline two', k % 13 ? '' : 'sheet "note"',
    ].map(q).join(','));
  }
  return BOM + lines.join(eol) + eol;
  function countApp(ls) { return ls.slice(1).filter((l) => l.includes('"app"')).length; }
}

function rawRows(text) {
  const recs = splitRaw(text.replace(/^﻿/, ''));
  const head = recs[0].fields.map(unquote);
  return { head, rows: recs.slice(1), eols: recs.map((r) => r.eol) };
}

test('T1 migration on the real file\'s shape (712 rows, 107 app): justification dropped, review columns added and backfilled, every other field byte-identical', () => {
  const input = realShape();
  const before = rawRows(input);
  assert.strictEqual(before.rows.length, 712);
  assert.strictEqual(parseCsv(input).filter((r) => r.source === 'app' && r.decided_on).length, 107, 'fixture has the real file\'s 107 app rows');

  const { text, changed, stats } = migrateTiersT1(input);
  assert.strictEqual(changed, true);
  assert.deepStrictEqual(stats, { rows: 712, app: 107, backfilled: 107, columnsBefore: 13, columnsAfter: 14 });
  assert.ok(text.startsWith(BOM) && !text.startsWith(BOM + BOM), 'BOM kept, once');

  const after = rawRows(text);
  assert.deepStrictEqual(after.head, NEW_COLS);
  assert.deepStrictEqual(after.eols, before.eols, 'every record keeps its line ending');
  assert.strictEqual(after.rows.length, 712);
  // Every column other than justification: the same raw field text, quotes and all, row by row.
  for (let k = 0; k < 712; k++) {
    for (const c of OLD_COLS) {
      if (c === 'justification') continue;
      assert.strictEqual(after.rows[k].fields[NEW_COLS.indexOf(c)], before.rows[k].fields[OLD_COLS.indexOf(c)], `row ${k + 1} ${c}`);
    }
  }
  // Backfill: source=app with decided_on -> reviewed that day at Eclipse; everyone else blank.
  const parsed = parseCsv(text);
  for (const r of parsed) {
    if (r.source === 'app' && r.decided_on) {
      assert.strictEqual(r.last_reviewed_on, r.decided_on);
      assert.strictEqual(r.last_reviewed_tournament, 'eclipse-1st-cour');
    } else {
      assert.strictEqual(r.last_reviewed_on, '');
      assert.strictEqual(r.last_reviewed_tournament, '');
    }
    assert.ok(!('justification' in r));
  }
  // New fields are quoted like every other field (Sheets-portable, as the writer emits).
  assert.ok(after.rows.every((r) => r.fields.every((f) => f.startsWith('"'))));
});

test('T1 migration is idempotent: running it on its own output changes nothing', () => {
  const once = migrateTiersT1(realShape()).text;
  const twice = migrateTiersT1(once);
  assert.strictEqual(twice.changed, false);
  assert.strictEqual(twice.text, once);
});

test('T1 migration keeps LF line endings (a clean clone checks the file out with LF, per .gitattributes)', () => {
  const input = realShape({ eol: '\n', rows: 30, app: 5 });
  const { text } = migrateTiersT1(input);
  assert.ok(!text.includes('\r\n'), 'no CRLF introduced');
  assert.deepStrictEqual(rawRows(text).eols, rawRows(input).eols);
});

test('T1 migration refuses, writing nothing, when a justification has a value or the shape is unknown', () => {
  const withJust = realShape({ rows: 10, app: 2 }).replace(/^(﻿[^\r]*\r\n(?:"[^"]*",){6})""/, '$1"kept for a reason"');
  assert.notStrictEqual(withJust, realShape({ rows: 10, app: 2 }), 'fixture really has one justification value');
  assert.throws(() => migrateTiersT1(withJust), /1 rows have a justification/);
  const partial = `${BOM}"game_id","justification","last_reviewed_on","source","decided_on"\r\n"1","","","app","2026-10-01"\r\n`;
  assert.throws(() => migrateTiersT1(partial), /some of the T1 columns/);
  const ragged = `${BOM}"game_id","justification","source","decided_on"\r\n"1","","app"\r\n`;
  assert.throws(() => migrateTiersT1(ragged), /Row 1 has 3 fields/);
});

test('scripts/migrate-tiers.js on a copy: keeps a .bak of the original, migrates atomically, then says "already migrated"; --dry-run writes nothing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seeding-migrate-'));
  const file = path.join(dir, 'tiers.csv');
  const original = realShape();
  fs.writeFileSync(file, original);
  const logs = [];
  const out = { log: (s) => logs.push(s), error: (s) => logs.push(`ERR ${s}`) };

  assert.strictEqual(script.main([file, '--dry-run'], out), 0);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), original, 'dry run left the file alone');
  assert.ok(!fs.existsSync(`${file}.bak`));

  assert.strictEqual(script.main([file], out), 0);
  assert.strictEqual(fs.readFileSync(`${file}.bak`, 'utf8'), original, '.bak is the original, byte for byte');
  // Build C: the script brings the file to the current shape, T1 then the discriminator column.
  assert.strictEqual(fs.readFileSync(file, 'utf8'), migrateTiersDiscriminator(migrateTiersT1(original).text).text);
  assert.deepStrictEqual(rawRows(fs.readFileSync(file, 'utf8')).head, C_COLS);
  assert.ok(!fs.existsSync(`${file}.tmp`));

  const migrated = fs.readFileSync(file, 'utf8');
  assert.strictEqual(script.main([file], out), 0);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), migrated, 'second run changes nothing');
  assert.match(logs[logs.length - 1], /already migrated/);
  assert.ok(logs.every((l) => !/Kouryuu|ナナシ/.test(l)), 'prints counts, never row contents');
});

// The real registry/tiers.csv, read only. Before the one-time migration it must migrate cleanly
// with the counts the spec states; after it, it must be in the T1 shape and a re-run must be a
// no-op. (Its review values change with use, so only the shape is pinned once migrated.)
test('the real registry/tiers.csv: pre-T1 it migrates with 712 rows / 107 backfilled; once migrated it is T1-shaped and a re-run is a no-op', () => {
  const real = fs.readFileSync(REAL, 'utf8');
  const head = rawRows(real).head;
  if (head.includes('justification')) {
    const { stats } = migrateTiersT1(real);
    assert.deepStrictEqual(stats, { rows: 712, app: 107, backfilled: 107, columnsBefore: 13, columnsAfter: 14 });
  } else if (!head.includes('discriminator')) {
    // T1-shaped, before build C's one-time discriminator migration.
    assert.deepStrictEqual(head, NEW_COLS);
    const again = migrateTiersT1(real);
    assert.strictEqual(again.changed, false);
    assert.strictEqual(again.text, real);
    assert.ok(real.startsWith(BOM));
    assert.deepStrictEqual(rawRows(migrateTiersDiscriminator(real).text).head, C_COLS);
  } else {
    // Build C: the current shape. Both migrations are no-ops on it.
    assert.deepStrictEqual(head, C_COLS);
    const again = migrateTiers(real);
    assert.strictEqual(again.changed, false);
    assert.strictEqual(again.text, real);
    assert.ok(real.startsWith(BOM));
  }
  // While the pre-migration copy is kept (until the closing review approves; it is not committed),
  // it must still be the file the migration started from: 712 rows, 107 app rows backfilled.
  const bak = `${REAL}.bak`;
  if (fs.existsSync(bak)) {
    const bakText = fs.readFileSync(bak, 'utf8');
    if (rawRows(bakText).head.includes('justification')) {
      const fromBak = migrateTiersT1(bakText);
      assert.deepStrictEqual(fromBak.stats, { rows: 712, app: 107, backfilled: 107, columnsBefore: 13, columnsAfter: 14 });
    } else {
      // Build C's .bak: the T1-shaped file the discriminator migration started from.
      assert.deepStrictEqual(rawRows(bakText).head, NEW_COLS);
      assert.deepStrictEqual(migrateTiersDiscriminator(bakText).stats, { rows: 712, columnsBefore: 14, columnsAfter: 15 });
    }
  }
});

// ---- Build C (dispatch-contract-tool-c.md, Acceptance 2): the discriminator column ----------------

test('discriminator migration on the real file\'s T1 shape: one blank quoted column after player_id, every other byte identical (BOM, quoting, CRLF, fields with newlines)', () => {
  const input = migrateTiersT1(realShape()).text;
  const { text, changed, stats } = migrateTiersDiscriminator(input);
  assert.strictEqual(changed, true);
  assert.deepStrictEqual(stats, { rows: 712, columnsBefore: 14, columnsAfter: 15 });
  assert.ok(text.startsWith(BOM) && !text.startsWith(BOM + BOM));
  const before = rawRows(input), after = rawRows(text);
  assert.deepStrictEqual(after.head, C_COLS);
  assert.deepStrictEqual(after.eols, before.eols, 'every record keeps its line ending');
  for (let k = 0; k < before.rows.length; k++) {
    const b = before.rows[k].fields, a = after.rows[k].fields;
    assert.strictEqual(a[3], '""', `row ${k + 1}: the new field is quoted and blank`);
    assert.deepStrictEqual([...a.slice(0, 3), ...a.slice(4)], b, `row ${k + 1}: every other raw field identical`);
  }
  // Taking the inserted field out of every record gives the input back, byte for byte.
  const recs = splitRaw(text.slice(1));
  const back = BOM + recs.map((r) => [...r.fields.slice(0, 3), ...r.fields.slice(4)].join(',') + r.eol).join('');
  assert.strictEqual(back, input);
});

test('discriminator migration: idempotent, keeps LF, follows bare quoting, refuses unknown shapes; migrateTiers chains T1 then the column', () => {
  const t1 = migrateTiersT1(realShape({ rows: 20, app: 4 })).text;
  const once = migrateTiersDiscriminator(t1).text;
  const twice = migrateTiersDiscriminator(once);
  assert.strictEqual(twice.changed, false);
  assert.strictEqual(twice.text, once);
  const lf = migrateTiersT1(realShape({ eol: '\n', rows: 20, app: 4 })).text;
  const lfOut = migrateTiersDiscriminator(lf).text;
  assert.ok(!lfOut.includes('\r\n'));
  assert.deepStrictEqual(rawRows(lfOut).eols, rawRows(lf).eols);
  // A bare (unquoted) file gets a bare blank field and a bare header name.
  assert.strictEqual(migrateTiersDiscriminator('game_id,player_id,tier\n1,55,3\n2,,1\n').text, 'game_id,player_id,discriminator,tier\n1,55,,3\n2,,,1\n');
  assert.throws(() => migrateTiersDiscriminator('"game_id","tier"\r\n"1","3"\r\n'), /no player_id column/);
  assert.throws(() => migrateTiersDiscriminator('"game_id","player_id"\r\n"1"\r\n'), /Row 1 has 1 fields/);
  // The chain: pre-T1 -> T1 -> discriminator in one call; a current file is untouched.
  const all = migrateTiers(realShape({ rows: 20, app: 4 }));
  assert.strictEqual(all.text, once);
  assert.deepStrictEqual(all.stats.steps, ['T1', 'discriminator']);
  assert.deepStrictEqual([all.stats.columnsBefore, all.stats.columnsAfter], [13, 15]);
  const none = migrateTiers(all.text);
  assert.strictEqual(none.changed, false);
  assert.deepStrictEqual(none.stats.steps, []);
});

test('discriminator migration: the reader/writer round-trip keeps the column in place (an edit on a migrated file writes it back, filled for the linked player)', () => {
  const data = require('../lib/view/data');
  const { toCsv } = require('../lib/output');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seeding-disc-rt-'));
  const tiers = path.join(dir, 'tiers.csv');
  fs.writeFileSync(tiers, migrateTiers(realShape({ rows: 20, app: 4 })).text);
  const run = path.join(dir, 'run');
  fs.mkdirSync(run);
  const cols = ['player_id', 'gamer_tag', 'prefix', 'user_slug', 'region_state', 'region_country', 'result_count', 'history_status', 'team_entry'];
  // Row 0 of the fixture is an app row linked to player 10000.
  fs.writeFileSync(path.join(run, 'players.csv'), toCsv(cols, [{ player_id: '10000', gamer_tag: 'Kouryuu 0', prefix: '', user_slug: 'user/abcd1234', region_state: '', region_country: '', result_count: '0', history_status: 'complete', team_entry: 'false' }]));
  fs.writeFileSync(path.join(run, 'results.csv'), toCsv(['player_id', 'event_date', 'game_id', 'game_name', 'tournament_name', 'event_name', 'event_id', 'num_entrants', 'placement', 'is_online'], []));
  fs.writeFileSync(path.join(run, 'meta.json'), JSON.stringify({ event: { slug: 'tournament/rt/event/x', name: 'x' }, game: { id: '22407', name: 'Melty Blood Actress Again Current Code' }, run_at: '2026-10-30T00:00:00.000Z' }));
  const before = parseCsv(fs.readFileSync(tiers, 'utf8'));
  data.updatePlayer(run, '10000', { notes: 'round trip' }, { tiersFile: tiers });
  const text = fs.readFileSync(tiers, 'utf8');
  // Amendment A3: the write also appends the `alias` column (blank) LAST; every other column in place.
  assert.deepStrictEqual(rawRows(text).head, [...C_COLS, 'alias'], 'the writer keeps the column, in place, and appends alias');
  const after = parseCsv(text);
  assert.strictEqual(after.length, before.length);
  assert.ok(after.every((x) => x.alias === ''), 'alias is blank on every row');
  const r = after.find((x) => x.player_id === '10000');
  assert.strictEqual(r.discriminator, 'abcd1234', 'the edit writes the discriminator of the player it saved');
  assert.strictEqual(r.notes, 'round trip');
  // Every other row reads back as before (but for the new, blank alias).
  const noAlias = ({ alias, ...x }) => x;
  assert.deepStrictEqual(after.filter((x) => x.player_id !== '10000').map(noAlias), before.filter((x) => x.player_id !== '10000'));
});
