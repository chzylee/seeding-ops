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

// Retargeted for increment 3 (docs/design-tool.md T2): increment 1's per-event run folder
// (<tournament>__<event>__YYYYMMDD-HHMM) is retired; a pull is out/<t>/pull-YYYYMMDD-HHMMSS/.
test('pullFolderName: pull-YYYYMMDD-HHMMSS', () => {
  const at = new Date(2026, 9, 12, 9, 5, 7).getTime(); // local time
  assert.strictEqual(o.pullFolderName(at), 'pull-20261012-090507');
  assert.ok(o.PULL_RE.test(o.pullFolderName(at)));
});

test('createPullFolder: a same-second second pull gets its own folder', () => {
  const root = tmp();
  const a = o.createPullFolder(root, 'pull-20261012-090507');
  const b = o.createPullFolder(root, 'pull-20261012-090507');
  assert.notStrictEqual(a, b);
  assert.ok(o.PULL_RE.test(path.basename(b)));
  assert.ok(fs.existsSync(path.join(b, o.WORK_DIR)));
});

test('current: written atomically, names only a finished pull, and a bad pointer reads as none', () => {
  const root = tmp();
  const a = o.createPullFolder(root, 'pull-20261012-090507');
  assert.throws(() => o.writeCurrent(root, 'pull-20261012-090507'), /unfinished/);
  assert.throws(() => o.writeCurrent(root, '../x'), /not a pull folder/);
  fs.writeFileSync(path.join(a, 'meta.json'), '{}');
  o.writeCurrent(root, 'pull-20261012-090507');
  assert.strictEqual(o.readCurrent(root), 'pull-20261012-090507');
  assert.deepStrictEqual(fs.readdirSync(root).sort(), ['current', 'pull-20261012-090507'], 'no .tmp left behind');
  fs.writeFileSync(path.join(root, 'current'), '../../etc\n');
  assert.strictEqual(o.readCurrent(root), null);
  fs.writeFileSync(path.join(root, 'current'), 'pull-20991231-000000\n');
  assert.strictEqual(o.readCurrent(root), null, 'a pointer to a missing pull is none');
});

test('buildOutputs refuses to write when any player has no outcome', () => {
  const state = { players: [{ player_id: '1' }], event: {}, window: { startMs: 0, endMs: 1 }, registrant_counts: {} };
  assert.throws(() => o.buildOutputs(state, new Map(), { requests: 0 }), /no outcome/);
});
