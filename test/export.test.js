'use strict';
// lib/view/export.js — the Google Sheets CSV: quoting, one line per cell, and the formula guard
// for cells starting with = + - @ (tab / CR too). And the app's GET .../export.csv end to end.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { sheetsCell, toSheetsCsv } = require('../lib/view/export');
const { parseCsv } = require('../lib/output');
const { run } = require('../lib/run');
const { createApp } = require('../app/server');
const { inject } = require('../testlib/inject');
const { buildWorld, createFakeFetch, virtualClock, sink, EVENT_SLUG, T_SLUG, E_SLUG, GAME } = require('../testlib/fake-api');
const { addTournament } = require('../testlib/pool-fixture');

test('export: a cell starting with = + - @ tab or CR gets a leading apostrophe; nothing else changes', () => {
  assert.strictEqual(sheetsCell('=SUM(1,2)'), `"'=SUM(1,2)"`);
  assert.strictEqual(sheetsCell('+P'), `"'+P"`);
  assert.strictEqual(sheetsCell('-x'), `"'-x"`);
  assert.strictEqual(sheetsCell('@Kid'), `"'@Kid"`);
  assert.strictEqual(sheetsCell('\tx'), `"'\tx"`);
  assert.strictEqual(sheetsCell('=HYPERLINK("http://x","y")'), `"'=HYPERLINK(""http://x"",""y"")"`);
  assert.strictEqual(sheetsCell('Dr. Brainless'), '"Dr. Brainless"');
  assert.strictEqual(sheetsCell('a=b'), '"a=b"', 'only a leading character counts');
  assert.strictEqual(sheetsCell('3'), '"3"', 'a seed stays a number');
  assert.strictEqual(sheetsCell('9th / 196 · 4-2 (\'26)'), `"9th / 196 · 4-2 ('26)"`);
  assert.strictEqual(sheetsCell('line one\nline two'), '"line one line two"');
  assert.strictEqual(sheetsCell(null), '""');
});

test('export: the CSV parses back to the same table (after the guard), CRLF, no BOM', () => {
  const table = [['Player', 'Notes'], ['=SUM(1,2) "the" @Kid, -x', 'says "hi", twice'], ['愛', '']];
  const csv = toSheetsCsv(table);
  assert.ok(!csv.startsWith('﻿'));
  assert.ok(csv.endsWith('\r\n'));
  assert.strictEqual(csv.split('\r\n').length, 4);
  assert.deepStrictEqual(parseCsv(csv), [{ Player: `'=SUM(1,2) "the" @Kid, -x`, Notes: 'says "hi", twice' }, { Player: '愛', Notes: '' }]);
});

// Retargeted for increment 3 (docs/design-tool.md, Pages): the export is a game tab's, at
// /api/t/<t>/g/<game>/export.csv, over the tournament's live pull.
test('export: GET /api/t/<t>/g/<game>/export.csv serves the live pull\'s tab summary as an attachment, tags guarded', async () => {
  const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'seeding-export-'));
  const START = Date.UTC(2026, 9, 12, 15, 0, 0);
  const world = buildWorld(START / 1000);
  const clock = virtualClock(START);
  assert.strictEqual(await run({ url: 'https://www.start.gg/' + EVENT_SLUG, token: 'T', outRoot, fetchImpl: createFakeFetch(world), now: clock.now, sleep: clock.sleep, stderr: sink(), stdout: sink() }), 0);
  addTournament(outRoot, world, [E_SLUG]);
  const app = createApp({ outRoot, getToken: () => '' });
  const r = await inject(app.handler, { url: `/api/t/${T_SLUG}/g/${GAME.id}/export.csv` });
  assert.strictEqual(r.status, 200);
  assert.match(r.headers['Content-Type'], /^text\/csv; charset=utf-8/);
  assert.match(r.headers['Content-Disposition'], /^attachment; filename="combo-breaker-2026-melty-blood-actress-again-current-code-seeding-\d{8}-\d{6}\.csv"$/);
  const rows = parseCsv(r.text);
  assert.strictEqual(rows.length, 15, 'one row per player');
  const tricky = rows.find((x) => x['start.gg player id'] === '102');
  assert.strictEqual(tricky.Player, `'=SUM(1,2) "the" @Kid, -x`);
  assert.strictEqual(tricky.Team, `'+P`);
  assert.ok(Object.keys(rows[0]).includes('Region'));
  assert.strictEqual((await inject(app.handler, { url: '/api/t/nope/g/1/export.csv' })).status, 404);
  assert.strictEqual((await inject(app.handler, { url: `/api/t/${T_SLUG}/g/999/export.csv` })).status, 404, 'a game that is not a tab');
});

// Noah, 2026-10-30: one export. The table in seed order with a Seed column first; ?order= keeps the
// table's order within a tier, like the seeds.csv the page no longer offers.
test('export: the CSV carries a leading Seed column (the page\'s Seed column: tier order, by tag within a tier, unless arranged) and sets Content-Length', async () => {
  const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'seeding-export-'));
  const START = Date.UTC(2026, 9, 12, 15, 0, 0);
  const world = buildWorld(START / 1000);
  const clock = virtualClock(START);
  assert.strictEqual(await run({ url: 'https://www.start.gg/' + EVENT_SLUG, token: 'T', outRoot, fetchImpl: createFakeFetch(world), now: clock.now, sleep: clock.sleep, stderr: sink(), stdout: sink() }), 0);
  addTournament(outRoot, world, [E_SLUG]);
  const app = createApp({ outRoot, getToken: () => '' });
  const r = await inject(app.handler, { url: `/api/t/${T_SLUG}/g/${GAME.id}/export.csv` });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(Number(r.headers['Content-Length']), Buffer.byteLength(r.text), 'Content-Length matches the body (the page draws a progress bar from it)');
  const rows = parseCsv(r.text);
  assert.strictEqual(Object.keys(rows[0])[0], 'Seed', 'Seed is the first column');
  assert.deepStrictEqual(rows.map((x) => Number(x.Seed)), rows.map((_, i) => i + 1), 'seeds are 1..N in file order');
  // Build D pass 2 (Noah, 2026-11-07: the Seed column is what the push and the export number with):
  // no tiers in this world, so the column is by tag; ?order= (the table's sort) no longer reorders it.
  const ids = rows.map((x) => x['start.gg player id']);
  const tags = rows.map((x) => x.Player);
  assert.deepStrictEqual(tags, [...tags].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })), 'by tag: the column\'s tie-break');
  const rev = await inject(app.handler, { url: `/api/t/${T_SLUG}/g/${GAME.id}/export.csv?order=${[...ids].reverse().join(',')}` });
  assert.deepStrictEqual(parseCsv(rev.text).map((x) => x['start.gg player id']), ids, 'the table order does not renumber the Seed column');
});
