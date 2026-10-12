'use strict';
// CSV serialization, checkpoint durability, and the temp-then-rename write.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const o = require('../lib/output');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'seeding-out-'));

test('csv: UTF-8 BOM, every field quoted, embedded quotes doubled, CRLF rows', () => {
  const csv = o.toCsv(['a', 'b'], [{ a: 'plain', b: 'say "hi"' }, { a: '', b: null }]);
  assert.ok(csv.startsWith('﻿'));
  assert.strictEqual(csv, '﻿"a","b"\r\n"plain","say ""hi"""\r\n"",""\r\n');
  assert.ok(Buffer.from(csv, 'utf8').subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])));
});

test('csv: tags starting with = + - @ are written verbatim inside quotes (gamer_tag "as on start.gg")', () => {
  const tags = ['=SUM(1,2)', '+P', '-x-', '@Kid', 'a,b', 'line\nbreak', 'ünïcødé 日本'];
  const csv = o.toCsv(['t'], tags.map((t) => ({ t })));
  for (const t of tags) assert.ok(csv.includes('"' + t + '"'), t);
  assert.deepStrictEqual(o.parseCsv(csv).map((r) => r.t), tags);
});

test('csv: booleans and numbers serialize as text', () => {
  const csv = o.toCsv(['x', 'y', 'z'], [{ x: true, y: false, z: 0 }]);
  assert.ok(csv.endsWith('"true","false","0"\r\n'));
});

test('checkpoint: append, read back, and a torn last line is ignored (that player is refetched)', () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, o.WORK_DIR));
  o.appendCheckpoint(dir, { player_id: '1', status: 'complete', rows: [] });
  o.appendCheckpoint(dir, { player_id: '2', status: 'limited', rows: [] });
  fs.appendFileSync(o.workPath(dir, 'checkpoint.jsonl'), '{"player_id":"3","sta');
  const { done, torn } = o.readCheckpoint(dir);
  assert.deepStrictEqual([...done.keys()], ['1', '2']);
  assert.strictEqual(torn, 1);
});

test('writeOutputs: leaves no .tmp files and writes all three', () => {
  const dir = tmp();
  o.writeOutputs(dir, { playersCsv: 'p', resultsCsv: 'r', meta: { a: 1 } });
  assert.deepStrictEqual(fs.readdirSync(dir).sort(), ['meta.json', 'players.csv', 'results.csv']);
});

test('runFolderName: <tournament>__<event>__YYYYMMDD-HHMM', () => {
  const at = new Date(2026, 9, 12, 9, 5).getTime(); // local time
  assert.strictEqual(o.runFolderName('tournament/combo-breaker-2026/event/mbaacc', at), 'combo-breaker-2026__mbaacc__20261012-0905');
});

test('createRunFolder: a same-minute second run gets its own folder', () => {
  const root = tmp();
  const a = o.createRunFolder(root, 'x__y__20261012-0905');
  const b = o.createRunFolder(root, 'x__y__20261012-0905');
  assert.notStrictEqual(a, b);
  assert.ok(fs.existsSync(path.join(b, o.WORK_DIR)));
});

test('buildOutputs refuses to write when any player has no outcome', () => {
  const state = { players: [{ player_id: '1' }], event: {}, window: { startMs: 0, endMs: 1 }, registrant_counts: {} };
  assert.throws(() => o.buildOutputs(state, new Map(), { requests: 0 }), /no outcome/);
});
