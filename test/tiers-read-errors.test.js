'use strict';
// The tiers table is only "empty" when the file does not exist. Before this, any read error (a
// transient EBUSY while another program held the file) read as an empty table, and an edit then
// wrote that empty table plus its one row over the real one: 50 rows became 1 (reproduced with a
// probe on 4e35890). Now the edit fails, says why, and writes nothing.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { toCsv, parseCsv } = require('../lib/output');
const data = require('../lib/view/data');
const { createApp } = require('../app/server');
const { inject } = require('../testlib/inject');
const { makePool } = require('../testlib/pool-fixture');

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const rows = Array.from({ length: 50 }, (_, i) => Object.fromEntries(data.TIER_COLS.map((c) => [c,
  c === 'game_id' ? '1' : c === 'game_name' ? 'MBTL' : c === 'startgg_tag' || c === 'sheet_tag' ? `P${i}` : c === 'player_id' ? String(5000 + i) : c === 'tier' ? '3' : ''])));

function world() {
  const outRoot = tmp('seeding-tiers-err-');
  const tiersFile = path.join(tmp('seeding-tiers-err-t-'), 'tiers.csv');
  fs.writeFileSync(tiersFile, toCsv(data.TIER_COLS, rows));
  makePool(outRoot, { t: 'tour', events: [{ slug: 'ev', name: 'Ev', game: { id: '1', name: 'MBTL' } }], players: [{ player_id: '101', gamer_tag: 'Alpha' }] });
  return { outRoot, tiersFile, src: data.tabSource(outRoot, 'tour', '1') };
}

// Make the next read of `file` fail with `code`, as a held lock does on Windows.
function failNextRead(file, code) {
  const real = fs.readFileSync;
  fs.readFileSync = function (p, ...rest) {
    if (path.resolve(String(p)) === path.resolve(file)) { fs.readFileSync = real; throw Object.assign(new Error(`${code}: resource busy or locked`), { code }); }
    return real.call(this, p, ...rest);
  };
  return () => { fs.readFileSync = real; };
}

for (const code of ['EBUSY', 'EPERM', 'EACCES']) {
  test(`tiers: a ${code} while reading the table fails the edit (status 503) and leaves all 50 rows; nothing is written`, () => {
    const { tiersFile, src } = world();
    const before = fs.readFileSync(tiersFile);
    const restore = failNextRead(tiersFile, code);
    try {
      assert.throws(() => data.updatePlayer(src, '101', { tier: 2 }, { now: new Date('2026-11-06T00:00:00Z'), tiersFile }),
        (err) => err.status === 503 && new RegExp(code).test(err.message) && /nothing was saved/.test(err.message));
    } finally { restore(); }
    assert.ok(fs.readFileSync(tiersFile).equals(before), 'the file is byte-for-byte unchanged');
    assert.strictEqual(parseCsv(fs.readFileSync(tiersFile, 'utf8').replace(/^﻿/, '')).length, 50);
    assert.ok(!fs.existsSync(tiersFile + '.tmp'), 'no temp file was written either');
  });
}

test('tiers: the ✓ review and the push dry run read the same way: a locked table is an error, never "no tiers"', () => {
  const { tiersFile, src } = world();
  let restore = failNextRead(tiersFile, 'EBUSY');
  try { assert.throws(() => data.reviewPlayer(src, '101', { reviewed: true, now: new Date('2026-11-06T00:00:00Z'), tiersFile }), (e) => e.status === 503); } finally { restore(); }
  assert.strictEqual(parseCsv(fs.readFileSync(tiersFile, 'utf8').replace(/^﻿/, '')).length, 50);
  restore = failNextRead(tiersFile, 'EBUSY');
  try { assert.throws(() => data.readTiers('1', tiersFile), (e) => e.status === 503); } finally { restore(); }
});

test('tiers: no file yet is still an empty table, and the first edit creates it', () => {
  const { src } = world();
  const tiersFile = path.join(tmp('seeding-tiers-new-'), 'registry', 'tiers.csv');
  assert.deepStrictEqual(data.readTiers('1', tiersFile), []);
  data.updatePlayer(src, '101', { tier: 2 }, { now: new Date('2026-11-06T00:00:00Z'), tiersFile });
  const got = parseCsv(fs.readFileSync(tiersFile, 'utf8').replace(/^﻿/, ''));
  assert.strictEqual(got.length, 1);
  assert.strictEqual(got[0].tier, '2');
});

test('tiers: through the app, a locked table answers 503 with the reason and the file is untouched', async () => {
  const { outRoot, tiersFile } = world();
  const app = createApp({ outRoot, tiersFile, getToken: () => 't', fetchImpl: async () => { throw new Error('offline'); } });
  const before = fs.readFileSync(tiersFile);
  const restore = failNextRead(tiersFile, 'EBUSY');
  let r;
  try {
    r = await inject(app.handler, { url: '/api/t/tour/g/1/player/101', method: 'POST', headers: { 'X-Seeding-App': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ tier: 2 }) });
  } finally { restore(); }
  assert.strictEqual(r.status, 503, r.text);
  assert.match(r.json().error, /could not be read \(EBUSY\)/);
  assert.ok(fs.readFileSync(tiersFile).equals(before));
});
