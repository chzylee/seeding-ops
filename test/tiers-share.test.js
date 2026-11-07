'use strict';
// Amendment A2.2 (docs/design-tool.md): sharing one game's tiers. Export keeps what a receiver needs to
// match a player and read the tier, never the private columns. Import is a review step (new players,
// conflicts side by side, per-row or bulk choices), applied to the chosen game's rows only, with the
// import recorded in `source`.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const out = require('../lib/output');
const data = require('../lib/view/data');
const S = require('../lib/tiers-share');
const M = require('../lib/view/model');
const R = require('../lib/view/render');
const { createApp } = require('../app/server');
const { inject } = require('../testlib/inject');

const A = { id: '22407', name: 'MBAACC' };
const B = { id: '39281', name: 'MBTL' };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'seeding-share-'));
const row = (game, o) => ({ game_id: game.id, game_name: game.name, player_id: '', discriminator: '', startgg_tag: '', sheet_tag: '', tier: '', notes: '', decided_on: '', last_reviewed_on: '', last_reviewed_tournament: '', source: 'app', sheet_region: '', sheet_placements: '', sheet_notes: '', ...o });
const NOW = new Date('2026-11-06T12:00:00Z');
const read = (f) => out.parseCsv(fs.readFileSync(f, 'utf8'));

function mine() {
  const dir = tmp();
  const tiersFile = path.join(dir, 'tiers.csv');
  fs.writeFileSync(tiersFile, out.toCsv(data.TIER_COLS, [
    row(A, { player_id: '1', discriminator: 'aaaa0001', startgg_tag: 'Alpha', sheet_tag: 'Alpha', tier: '9', notes: 'private note', decided_on: '2026-10-01', last_reviewed_on: '2026-10-16', last_reviewed_tournament: 'eclipse-1st-cour', sheet_region: 'NY', sheet_placements: 'CoN: 1st', sheet_notes: 'sheet note' }),
    row(A, { player_id: '2', startgg_tag: 'Bravo', tier: '5', notes: 'keep me' }),
    row(A, { sheet_tag: 'Charlie', tier: '3', source: 'sheet import' }),            // unlinked, tag only
    row(A, { player_id: '4', startgg_tag: 'Delta', last_reviewed_on: '2026-10-16', last_reviewed_tournament: 'x' }), // a review, no tier
    row(A, { player_id: '6', startgg_tag: 'Foxtrot', tier: '' }),
    row(B, { player_id: '1', startgg_tag: 'Alpha', tier: '2', notes: 'mbtl note' }),
  ]));
  return { dir, tiersFile };
}
// Another organizer's export for game A.
const theirs = (lines) => '﻿"game_id","game_name","player_id","discriminator","startgg_tag","sheet_tag","tier"\r\n' + lines.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n') + '\r\n';

test('A2.2 export: one game\'s tiered rows, shareable columns only (tier, ids, tags), no notes / reviews / decided_on / source / sheet extras; T1\'s file shape', () => {
  const { tiersFile } = mine();
  const x = S.exportTiers(A.id, { tiersFile, now: NOW });
  assert.strictEqual(x.filename, 'tiers-mbaacc-2026-11-06.csv');
  assert.ok(x.csv.startsWith('﻿"game_id","game_name","player_id","discriminator","startgg_tag","sheet_tag","tier"\r\n'), 'BOM, every field quoted, CRLF');
  for (const c of S.PRIVATE_COLS) assert.ok(!x.csv.includes(`"${c}"`), `no ${c} column`);
  for (const v of ['private note', 'keep me', 'eclipse-1st-cour', '2026-10-01', 'CoN: 1st', 'sheet note', 'NY', 'sheet import']) assert.ok(!x.csv.includes(v), `no "${v}"`);
  const rows = out.parseCsv(x.csv);
  assert.deepStrictEqual(rows.map((r) => [r.player_id, r.startgg_tag || r.sheet_tag, r.tier]), [['1', 'Alpha', '9'], ['2', 'Bravo', '5'], ['', 'Charlie', '3']], 'tier descending; untiered rows (a review only, a blank tier) left out; MBTL left out');
  assert.ok(rows.every((r) => r.game_id === A.id));
  assert.throws(() => S.exportTiers('99999', { tiersFile }), (e) => e.status === 404);
  assert.deepStrictEqual(S.gamesInTable({ tiersFile }).map((g) => [g.id, g.tiered]), [[A.id, 3], [B.id, 1]]);
});

test('A2.2 round trip: my own export imports into an empty table as all new, and into my table as all the same', () => {
  const { tiersFile } = mine();
  const csv = S.exportTiers(A.id, { tiersFile, now: NOW }).csv;
  const p = S.previewImport({ csv, gameId: A.id, tiersFile });
  assert.deepStrictEqual([p.counts.new, p.counts.conflicts, p.counts.same], [0, 0, 3]);
  const empty = path.join(tmp(), 'tiers.csv');
  const q = S.previewImport({ csv, gameId: A.id, tiersFile: empty, gameName: A.name });
  assert.deepStrictEqual([q.counts.new, q.counts.conflicts], [3, 0]);
  const res = S.applyImport({ csv, gameId: A.id, fileName: 'tiers-mbaacc.csv', fingerprint: q.fingerprint, take: q.new.map((x) => x.key), tiersFile: empty, now: NOW });
  assert.strictEqual(res.added, 3);
  assert.deepStrictEqual(read(empty).map((r) => [r.player_id, r.discriminator, r.startgg_tag, r.tier, r.source, r.decided_on, r.last_reviewed_on]),
    [['1', 'aaaa0001', 'Alpha', '9', 'import 2026-11-06 from tiers-mbaacc.csv', '2026-11-06', ''], ['2', '', 'Bravo', '5', 'import 2026-11-06 from tiers-mbaacc.csv', '2026-11-06', ''], ['', '', 'Charlie', '3', 'import 2026-11-06 from tiers-mbaacc.csv', '2026-11-06', '']]);
});

test('A2.2 review: new players and conflicts side by side, matched by id, then discriminator, then tag; ambiguous, repeated, malformed and other-game rows reported', () => {
  const { tiersFile } = mine();
  const csv = theirs([
    [A.id, A.name, '1', '', 'Alpha', '', '10'],          // conflict by player_id (mine 9)
    [A.id, A.name, '', 'user/AAAA0001', 'Alpha', '', '9'], // repeats line 2's player by discriminator: duplicate
    [A.id, A.name, '2', '', 'Bravo', '', '5'],           // same
    [A.id, A.name, '', '', 'Team | Charlie', '', '6'],    // conflict by tag (mine 3, unlinked); the prefix is stripped
    [A.id, A.name, '4', '', 'Delta', '', '7'],           // new: my row has a review and no tier
    [A.id, A.name, '5', 'eeee0005', 'Echo', '', '8'],    // new: no row here
    [A.id, A.name, '', '', 'Ghost', '', '11'],           // new by tag only (no id, no row)
    [A.id, A.name, '7', '', 'Golf', '', 'high'],          // malformed tier
    [A.id, A.name, 'x9', '', 'Hotel', '', '4'],           // malformed player id
    [A.id, A.name, '', 'nope', 'India', '', '4'],         // malformed discriminator
    [A.id, A.name, '', '', '', '', '4'],                  // nothing to match by
    [A.id, A.name, '8', '', 'Juliet', '', ''],            // no tier: counted, skipped
    [B.id, B.name, '1', '', 'Alpha', '', '1'],            // other game: counted only
    [B.id, B.name, '9', '', 'Kilo', '', '1'],
  ]);
  const p = S.previewImport({ csv, gameId: A.id, tiersFile, fileName: 'theirs.csv' });
  assert.deepStrictEqual(p.conflicts.map((x) => [x.tag, x.by, x.mine, x.theirs]), [['Alpha', 'player_id', 9, 10], ['Team | Charlie', 'tag', 3, 6]]);
  assert.deepStrictEqual(p.new.map((x) => [x.tag, x.has_row, x.theirs]), [['Delta', true, 7], ['Echo', false, 8], ['Ghost', false, 11]]);
  assert.strictEqual(p.counts.same, 1);
  assert.deepStrictEqual(p.duplicates.map((d) => [d.line, d.kept_line]), [[3, 2]]);
  assert.deepStrictEqual(p.malformed.map((m) => m.line), [9, 10, 11, 12]);
  assert.strictEqual(p.counts.no_tier, 1);
  assert.deepStrictEqual(p.other_games, [{ id: B.id, name: B.name, rows: 2 }]);
  assert.strictEqual(p.conflicts[0].mine_notes, 'private note', 'my own note helps me decide; it is mine, on my screen');
  // Two of the file's rows on one row here (A6-1's "one tag, two people"): neither is applied.
  const amb = S.previewImport({ csv: theirs([[A.id, A.name, '', '', 'Charlie', '', '6'], [A.id, A.name, '', 'cccc0003', 'charlie', '', '7']]), gameId: A.id, tiersFile });
  assert.deepStrictEqual([amb.counts.ambiguous, amb.counts.conflicts, amb.counts.new], [2, 0, 0]);
});

test('A2.2 apply: per-row picks; "take theirs" changes only the tier (+ decided_on, source, missing ids); "keep mine" and untaken new rows change nothing; game B is never touched', () => {
  const { tiersFile } = mine();
  const csv = theirs([
    [A.id, A.name, '1', '', 'Alpha', '', '10'],
    [A.id, A.name, '', 'cccc0003', 'Charlie', '', '6'],
    [A.id, A.name, '2', '', 'Bravo', '', '1'],
    [A.id, A.name, '4', '', 'Delta', '', '7'],
    [A.id, A.name, '5', 'eeee0005', 'Echo', '', '8'],
  ]);
  const before = read(tiersFile);
  const p = S.previewImport({ csv, gameId: A.id, tiersFile, fileName: 'theirs.csv' });
  // Choices: take Charlie (tag) and Alpha, keep my Bravo; add Delta, skip Echo.
  const choices = { 2: 'theirs', 3: 'theirs', 4: 'mine', 5: 'theirs', 6: 'mine' };
  const take = M.importTake(p, choices);
  assert.deepStrictEqual(take.sort(), ['2', '3', '5']);
  const res = S.applyImport({ csv, gameId: A.id, fileName: 'theirs.csv', fingerprint: p.fingerprint, take, tiersFile, now: NOW });
  assert.deepStrictEqual([res.added, res.updated, res.kept, res.skipped_new], [0, 3, 1, 1]);
  assert.deepStrictEqual(res.linked_by_tag.map((x) => x.row_tag), ['Charlie'], 'a tag-only match that was applied is reported for review');
  const after = read(tiersFile);
  assert.deepStrictEqual(after.filter((r) => r.game_id === B.id), before.filter((r) => r.game_id === B.id), 'MBTL rows identical');
  const by = (pidOrTag) => after.find((r) => r.game_id === A.id && (r.player_id === pidOrTag || r.sheet_tag === pidOrTag));
  const src = 'import 2026-11-06 from theirs.csv';
  assert.deepStrictEqual([by('1').tier, by('1').notes, by('1').last_reviewed_on, by('1').last_reviewed_tournament, by('1').decided_on, by('1').source, by('1').sheet_placements],
    ['10', 'private note', '2026-10-16', 'eclipse-1st-cour', '2026-11-06', src, 'CoN: 1st'], 'only the tier moved, with its provenance');
  assert.deepStrictEqual([by('Charlie').tier, by('Charlie').discriminator, by('Charlie').source], ['6', 'cccc0003', src], 'the tag row now carries the file\'s discriminator');
  assert.deepStrictEqual([by('2').tier, by('2').source], ['5', 'app'], 'kept mine');
  assert.deepStrictEqual([by('4').tier, by('4').last_reviewed_tournament], ['7', 'x'], 'filled the tier on the review-only row, review kept');
  assert.ok(!after.some((r) => r.player_id === '5'), 'Echo was not added');
  assert.strictEqual(after.length, before.length);
});

test('A2.2 bulk choices: "keep all mine" / "take all theirs" set every conflict; "add all" / "add none" every new row; defaults add new, keep mine', () => {
  const p = { new: [{ key: '1' }, { key: '2' }], conflicts: [{ key: '3' }, { key: '4' }] };
  assert.deepStrictEqual(M.importTake(p, {}), ['1', '2'], 'default: new rows added, conflicts kept');
  assert.deepStrictEqual(M.importTake(p, M.importBulk(p, {}, 'conflicts', 'theirs')).sort(), ['1', '2', '3', '4']);
  assert.deepStrictEqual(M.importTake(p, M.importBulk(p, { 3: 'theirs' }, 'conflicts', 'mine')), ['1', '2']);
  assert.deepStrictEqual(M.importTake(p, M.importBulk(p, {}, 'new', 'mine')), []);
  const first = M.importBulk(p, {}, 'new', 'mine');
  const c = M.importBulk(p, first, 'conflicts', 'theirs');
  assert.deepStrictEqual(M.importTake(p, c), ['3', '4'], 'one section\'s bulk choice keeps the other section\'s');
  assert.deepStrictEqual(first, { 1: 'mine', 2: 'mine' }, 'importBulk returns a new object; the one given is not changed');
  // A per-row pick after a bulk one wins for that row.
  assert.deepStrictEqual(M.importTake(p, { ...c, 4: 'mine' }), ['3']);
});

test('A2.2 a file for another game, a file that is not a tiers file, a stale review, and keys that cannot be applied are refused', () => {
  const { tiersFile } = mine();
  const csvB = theirs([[B.id, B.name, '1', '', 'Alpha', '', '3'], [B.id, B.name, '2', '', 'Bravo', '', '3']]);
  assert.throws(() => S.previewImport({ csv: csvB, gameId: A.id, tiersFile }), (e) => e.status === 400 && /no tiers for this game\. It has tiers for MBTL \(2 rows\)/.test(e.message));
  assert.throws(() => S.previewImport({ csv: 'name,discriminator\r\nAlpha,aaaa0001\r\n', gameId: A.id, tiersFile }), /not a tiers file/);
  assert.throws(() => S.previewImport({ csv: '"game_id","tier\r\n', gameId: A.id, tiersFile }), /never closed/);
  assert.throws(() => S.previewImport({ csv: '', gameId: A.id, tiersFile }), /empty/);
  const csv = theirs([[A.id, A.name, '1', '', 'Alpha', '', '10'], [A.id, A.name, '2', '', 'Bravo', '', '5']]);
  const p = S.previewImport({ csv, gameId: A.id, tiersFile });
  const text = fs.readFileSync(tiersFile, 'utf8');
  assert.throws(() => S.applyImport({ csv, gameId: A.id, fingerprint: p.fingerprint, take: ['3'], tiersFile }), /already has the same tier/);
  assert.throws(() => S.applyImport({ csv, gameId: A.id, fingerprint: p.fingerprint, take: ['99'], tiersFile }), /not a row of this review/);
  assert.throws(() => S.applyImport({ csv, gameId: A.id, fingerprint: p.fingerprint, take: 'all', tiersFile }), /must be a list/);
  assert.strictEqual(fs.readFileSync(tiersFile, 'utf8'), text, 'nothing written by a refused apply');
});

test('A2.2 a stale review (my tiers changed after it) is refused with nothing written', () => {
  const { tiersFile } = mine();
  const csv = theirs([[A.id, A.name, '1', '', 'Alpha', '', '10']]);
  const p = S.previewImport({ csv, gameId: A.id, tiersFile });
  const rows = read(tiersFile);
  rows[0].tier = '8';
  fs.writeFileSync(tiersFile, out.toCsv(data.TIER_COLS, rows));
  const text = fs.readFileSync(tiersFile, 'utf8');
  assert.throws(() => S.applyImport({ csv, gameId: A.id, fingerprint: p.fingerprint, take: ['2'], tiersFile }), (e) => e.status === 409 && e.failure === 'stale');
  assert.strictEqual(fs.readFileSync(tiersFile, 'utf8'), text);
});

test('A2.2 parsing is the upload\'s: BOM, CRLF / LF / CR, quoted commas, quotes and line breaks, any column order and case, a full tiers.csv', () => {
  const { tiersFile } = mine();
  const csv = '﻿TIER,startgg_tag,Game_ID,player_id,notes\n"10","Al, ""the"" pha","22407","1","their\nprivate"\r"6","New One","22407","77",""';
  const p = S.previewImport({ csv, gameId: A.id, tiersFile });
  assert.deepStrictEqual(p.conflicts.map((x) => [x.tag, x.theirs]), [['Al, "the" pha', 10]]);
  assert.deepStrictEqual(p.new.map((x) => [x.player_id, x.theirs]), [['77', 6]]);
  // My own registry/tiers.csv shape (every column) is a tiers file too; private columns are ignored.
  const own = fs.readFileSync(tiersFile, 'utf8');
  const q = S.previewImport({ csv: own, gameId: A.id, tiersFile: path.join(tmp(), 'none.csv') });
  assert.strictEqual(q.counts.new, 3);
  assert.ok(!JSON.stringify(q).includes('private note'));
});

test('A2.2 provenance: an imported tier\'s grey hover names the import, not the sheet', () => {
  const ctx = { tournament: 't', today: '2026-11-06' };
  assert.strictEqual(R.recencyTitle({ tier: 5, source: 'import 2026-11-06 from theirs.csv' }, ctx), 'Never reviewed (tier from import 2026-11-06 from theirs.csv)');
  assert.strictEqual(R.recencyTitle({ tier: 5, source: 'sheet import' }, ctx), 'Never reviewed (tier from the sheet import)');
});

test('A2.2 routes: export download, preview, apply; X-Seeding-App on the POSTs; the home page has the Tiers controls', async () => {
  const { dir, tiersFile } = mine();
  const app = createApp({ outRoot: path.join(dir, 'out'), tiersFile, getToken: () => 'T', fetchImpl: async () => { throw new Error('no start.gg request expected'); } });
  let r = await inject(app.handler, { url: `/api/tiers/export.csv?game=${A.id}` });
  assert.strictEqual(r.status, 200, r.text);
  assert.match(r.headers['Content-Disposition'], /attachment; filename="tiers-mbaacc-\d{4}-\d{2}-\d{2}\.csv"/);
  assert.ok(!r.text.includes('private note'));
  assert.strictEqual((await inject(app.handler, { url: '/api/tiers/export.csv?game=abc' })).status, 400);
  const csv = theirs([[A.id, A.name, '1', '', 'Alpha', '', '10'], [A.id, A.name, '5', '', 'Echo', '', '8']]);
  const post = (url, body, headers = { 'X-Seeding-App': '1' }) => inject(app.handler, { url, method: 'POST', headers, body: JSON.stringify(body) });
  assert.strictEqual((await post('/api/tiers/import/preview', { game_id: A.id, csv }, {})).status, 403);
  r = await post('/api/tiers/import/preview', { game_id: A.id, csv, file_name: 'theirs.csv' });
  assert.strictEqual(r.status, 200, r.text);
  const p = r.json();
  assert.deepStrictEqual([p.counts.new, p.counts.conflicts], [1, 1]);
  r = await post('/api/tiers/import/apply', { game_id: A.id, csv, file_name: 'theirs.csv', fingerprint: p.fingerprint, take: ['3'] });
  assert.strictEqual(r.status, 200, r.text);
  assert.deepStrictEqual([r.json().added, r.json().updated], [1, 0]);
  assert.ok(read(tiersFile).some((x) => x.player_id === '5' && x.source === 'import ' + data.todayOf() + ' from theirs.csv'));
  r = await post('/api/tiers/import/apply', { game_id: A.id, csv, fingerprint: p.fingerprint, take: ['3'] });
  assert.strictEqual(r.status, 409, 'the same review again is stale: the table changed');
  const home = (await inject(app.handler, { url: '/' })).text;
  for (const id of ['tierGame', 'tierExport', 'tierImport', 'tierModal']) assert.match(home, new RegExp(`id="${id}"`));
  assert.match(home, new RegExp(`<option value="${A.id}"[^>]*>MBAACC \\(4 tiered\\)`), 'three of mine plus the one just imported');
  // The review renders new players and conflicts side by side, with the bulk buttons.
  const html = R.importReview(S.previewImport({ csv: theirs([[A.id, A.name, '1', '', 'Alpha', '', '10'], [A.id, A.name, '6', '', 'New', '', '2']]), gameId: A.id, tiersFile }), {});
  for (const s of ['Keep all mine', 'Take all theirs', 'Add all', 'Add none', 'Your tier', 'Their tier']) assert.ok(html.includes(s), s);
});

// ---- Build D pass 2 ------------------------------------------------------------------------------

test('finding 4: a file row with only a tag finds a player already linked by id (a conflict, by tag), so the default Apply never adds a tag-only duplicate of him', () => {
  const { tiersFile } = mine();
  const before = read(tiersFile);
  // Alpha is linked here (player_id 1, discriminator aaaa0001, tier 9). The friend's file names him by tag only.
  const csv = theirs([[A.id, A.name, '', '', 'Alpha', '', '10'], [A.id, A.name, '', '', 'Team | Bravo', '', '5'], [A.id, A.name, '', '', 'Nobody', '', '4']]);
  const p = S.previewImport({ csv, gameId: A.id, tiersFile });
  assert.deepStrictEqual(p.conflicts.map((x) => [x.tag, x.by, x.mine, x.theirs]), [['Alpha', 'tag', 9, 10]], 'shown as a conflict with his tier, matched by tag');
  assert.deepStrictEqual(p.new.map((x) => x.tag), ['Nobody'], 'only a player with no row here is new');
  assert.strictEqual(p.counts.same, 1, 'Bravo (linked, tier 5) is the same');
  // The default picks: new rows added, conflicts kept. No row for Alpha is added.
  const res = S.applyImport({ csv, gameId: A.id, fingerprint: p.fingerprint, take: M.importTake(p, {}), tiersFile, now: NOW });
  assert.deepStrictEqual([res.added, res.updated], [1, 0]);
  const after = read(tiersFile);
  assert.strictEqual(after.filter((r) => r.game_id === A.id && /alpha/i.test(r.startgg_tag + r.sheet_tag)).length, 1, 'still one Alpha row');
  assert.strictEqual(after.length, before.length + 1, 'only Nobody was added');
  // Taking theirs changes his linked row (and lists it for checking: it was matched by tag).
  const q = S.previewImport({ csv, gameId: A.id, tiersFile });
  const t = S.applyImport({ csv, gameId: A.id, fingerprint: q.fingerprint, take: [q.conflicts[0].key], tiersFile, now: NOW });
  assert.deepStrictEqual(t.linked_by_tag.map((x) => x.row_tag), ['Alpha']);
  assert.strictEqual(read(tiersFile).find((r) => r.game_id === A.id && r.player_id === '1').tier, '10');
});

test('finding 4: a tag match that the ids contradict is someone else; one tag on two rows here is ambiguous', () => {
  const { tiersFile } = mine();
  // Same tag, a different player_id or discriminator: a different person, so new (and it has its own id).
  let p = S.previewImport({ csv: theirs([[A.id, A.name, '77', '', 'Alpha', '', '3'], [A.id, A.name, '', 'ffff0099', 'Alpha', '', '3']]), gameId: A.id, tiersFile });
  assert.deepStrictEqual(p.new.map((x) => [x.player_id, x.discriminator]), [['77', ''], ['', 'ffff0099']]);
  assert.strictEqual(p.conflicts.length, 0);
  // Two rows here answer to "Delta" (one linked, one unlinked from the sheet): the file's tag-only row is ambiguous.
  const rows = read(tiersFile);
  rows.push(row(A, { sheet_tag: 'delta', tier: '2', source: 'sheet import' }));
  fs.writeFileSync(tiersFile, out.toCsv(data.TIER_COLS, rows));
  p = S.previewImport({ csv: theirs([[A.id, A.name, '', '', 'Delta', '', '6']]), gameId: A.id, tiersFile });
  assert.deepStrictEqual([p.counts.ambiguous, p.counts.new, p.counts.conflicts], [1, 0, 0]);
  assert.match(p.ambiguous[0].mine_tag, /Delta \/ delta/);
  // A tag-only file row and an id row for the same linked player: the id row is used, the other is a repeat.
  p = S.previewImport({ csv: theirs([[A.id, A.name, '', '', 'Alpha', '', '10'], [A.id, A.name, '1', '', 'Alpha', '', '10']]), gameId: A.id, tiersFile });
  assert.deepStrictEqual(p.conflicts.map((x) => [x.line, x.by]), [[3, 'player_id']]);
  assert.deepStrictEqual(p.duplicates.map((d) => [d.line, d.kept_line]), [[2, 3]]);
});

test('finding 2 (with main\'s readTiersText): a tiers table that cannot be read is said on the page and in the import, never shown as "none yet" or treated as empty', async () => {
  const dir = tmp();
  const tiersFile = path.join(dir, 'tiers.csv');
  fs.mkdirSync(tiersFile);   // exists, but cannot be read as a file (EISDIR): like a file held open elsewhere
  assert.throws(() => S.previewImport({ csv: theirs([[A.id, A.name, '1', '', 'Alpha', '', '10']]), gameId: A.id, tiersFile }), (e) => e.status === 503 && /could not be read/.test(e.message));
  assert.throws(() => S.exportTiers(A.id, { tiersFile }), (e) => e.status === 503);
  const app = createApp({ outRoot: path.join(dir, 'out'), tiersFile, getToken: () => 'T', fetchImpl: async () => { throw new Error('no start.gg request expected'); } });
  const home = (await inject(app.handler, { url: '/' })).text;
  assert.match(home, /id="tierReadError"[^>]*>The tiers table could not be read/);
  assert.doesNotMatch(home, /\(none yet\)/, 'no game is shown as having no tiers');
  assert.match(home, /id="tierExport" disabled/);
  assert.match(home, /id="tierImport" disabled/);
  const r = await inject(app.handler, { url: '/api/tiers/import/preview', method: 'POST', headers: { 'X-Seeding-App': '1' }, body: JSON.stringify({ game_id: A.id, csv: theirs([[A.id, A.name, '1', '', 'Alpha', '', '10']]) }) });
  assert.strictEqual(r.status, 503);
  assert.match(r.json().error, /could not be read/);
});

test('finding 8: the import\'s request cap is the server\'s for these routes (2 MB, sent to the page), and a file past the old 200 KB cap goes through', async () => {
  const { dir, tiersFile } = mine();
  const app = createApp({ outRoot: path.join(dir, 'out'), tiersFile, getToken: () => 'T', fetchImpl: async () => { throw new Error('no start.gg request expected'); } });
  assert.match((await inject(app.handler, { url: '/' })).text, /id="tierFile"[^>]*data-max-bytes="2000000"/);
  // ~4,000 rows of quote-heavy tags: well over 200 KB once JSON-escaped.
  const lines = Array.from({ length: 4000 }, (_, i) => [A.id, A.name, String(100000 + i), '', `"Q" "${i}" "tag"`, '', '3']);
  const csv = theirs(lines);
  assert.ok(Buffer.byteLength(JSON.stringify({ csv })) > 250000);
  const r = await inject(app.handler, { url: '/api/tiers/import/preview', method: 'POST', headers: { 'X-Seeding-App': '1' }, body: JSON.stringify({ game_id: A.id, csv }) });
  assert.strictEqual(r.status, 200, r.text.slice(0, 200));
  assert.strictEqual(r.json().counts.new, 4000);
});
