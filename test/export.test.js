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
const { buildWorld, createFakeFetch, virtualClock, sink, EVENT_SLUG } = require('../testlib/fake-api');

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

test('export: GET /api/e/<t>/<e>/export.csv serves the latest run\'s summary as an attachment, tags guarded', async () => {
  const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'seeding-export-'));
  const START = Date.UTC(2026, 9, 12, 15, 0, 0);
  const world = buildWorld(START / 1000);
  const clock = virtualClock(START);
  assert.strictEqual(await run({ url: 'https://www.start.gg/' + EVENT_SLUG, token: 'T', outRoot, fetchImpl: createFakeFetch(world), now: clock.now, sleep: clock.sleep, stderr: sink(), stdout: sink() }), 0);
  const [, t, , e] = EVENT_SLUG.split('/');
  const app = createApp({ outRoot, getToken: () => '' });
  const r = await inject(app.handler, { url: `/api/e/${t}/${e}/export.csv` });
  assert.strictEqual(r.status, 200);
  assert.match(r.headers['Content-Type'], /^text\/csv; charset=utf-8/);
  assert.match(r.headers['Content-Disposition'], /^attachment; filename="combo-breaker-2026-melty-blood-actress-again-current-code-seeding-\d{8}-\d{4}\.csv"$/);
  const rows = parseCsv(r.text);
  assert.strictEqual(rows.length, 15, 'one row per player');
  const tricky = rows.find((x) => x['start.gg player id'] === '102');
  assert.strictEqual(tricky.Player, `'=SUM(1,2) "the" @Kid, -x`);
  assert.strictEqual(tricky.Team, `'+P`);
  assert.ok(Object.keys(rows[0]).includes('Region'));
  assert.strictEqual((await inject(app.handler, { url: '/api/e/nope/nada/export.csv' })).status, 404);
});
