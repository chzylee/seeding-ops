'use strict';
// lib/tiers-migrate.js and scripts/migrate-tiers.js — the T1 migration of registry/tiers.csv
// (docs/design-tool.md, T1; dispatch-contract-tool.md, Acceptance 2). Offline. Every file written
// here lives in this test's temp folder; the real registry/tiers.csv is only read.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { migrateTiersT1, splitRaw, unquote } = require('../lib/tiers-migrate');
const { parseCsv } = require('../lib/output');
const script = require('../scripts/migrate-tiers');

const BOM = '﻿';
const OLD_COLS = ['game_id', 'game_name', 'player_id', 'startgg_tag', 'sheet_tag', 'tier', 'justification', 'notes', 'decided_on', 'source', 'sheet_region', 'sheet_placements', 'sheet_notes'];
const NEW_COLS = ['game_id', 'game_name', 'player_id', 'startgg_tag', 'sheet_tag', 'tier', 'notes', 'decided_on', 'last_reviewed_on', 'last_reviewed_tournament', 'source', 'sheet_region', 'sheet_placements', 'sheet_notes'];
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
  assert.strictEqual(fs.readFileSync(file, 'utf8'), migrateTiersT1(original).text);
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
  } else {
    assert.deepStrictEqual(head, NEW_COLS);
    const again = migrateTiersT1(real);
    assert.strictEqual(again.changed, false);
    assert.strictEqual(again.text, real);
    assert.ok(real.startsWith(BOM));
  }
  // While the pre-migration copy is kept (until the closing review approves; it is not committed),
  // it must still be the file the migration started from: 712 rows, 107 app rows backfilled.
  const bak = `${REAL}.bak`;
  if (fs.existsSync(bak)) {
    const fromBak = migrateTiersT1(fs.readFileSync(bak, 'utf8'));
    assert.deepStrictEqual(fromBak.stats, { rows: 712, app: 107, backfilled: 107, columnsBefore: 13, columnsAfter: 14 });
  }
});
