'use strict';
// Amendment A2.1 (docs/design-tool.md): a tier belongs to one (player, game). Every read, match and
// write of registry/tiers.csv keys on the pair, game = the event's start.gg videogame id. One player,
// two games, two different tiers; each path is exercised and must never see or touch the other game's
// row. The one deliberate exception (the discriminator fill: a fact about the player, not a tier) is
// pinned too.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const out = require('../lib/output');
const data = require('../lib/view/data');
const push = require('../lib/push');
const { makePool } = require('../testlib/pool-fixture');

const A = { id: '22407', name: 'MBAACC' };
const B = { id: '39281', name: 'MBTL' };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'seeding-keying-'));
const row = (game, o) => ({ game_id: game.id, game_name: game.name, player_id: '', discriminator: '', startgg_tag: '', sheet_tag: '', tier: '', notes: '', decided_on: '', last_reviewed_on: '', last_reviewed_tournament: '', source: 'app', sheet_region: '', sheet_placements: '', sheet_notes: '', ...o });
const player = (id, tag, events, extra = {}) => ({ player_id: String(id), gamer_tag: tag, prefix: '', user_slug: `user/0000000${id}`, region_state: '', region_country: '', result_count: '0', history_status: 'complete', team_entry: 'false', events, ...extra });

// One tournament with an MBAACC event and an MBTL event; player 1 entered both.
function world() {
  const outRoot = tmp();
  makePool(outRoot, { t: 'tour', events: [{ slug: 'mb', game: A }, { slug: 'tl', game: B }],
    players: [player(1, 'Both', ['mb', 'tl']), player(2, 'OnlyA', ['mb']), player(3, 'Foo', ['mb', 'tl'])] });
  const tiersFile = path.join(outRoot, 'tiers.csv');
  fs.writeFileSync(tiersFile, out.toCsv(data.TIER_COLS, [
    row(A, { player_id: '1', tier: '9', notes: 'A note' }),
    row(B, { player_id: '1', tier: '4', notes: 'B note' }),
    // Game B only: an unlinked sheet row for the tag "Foo". Tab A must never answer to it.
    row(B, { sheet_tag: 'Foo', tier: '7', source: 'sheet import' }),
  ]));
  return { outRoot, tiersFile, srcA: data.tabSource(outRoot, 'tour', A.id), srcB: data.tabSource(outRoot, 'tour', B.id) };
}
const rowsOf = (file) => out.parseCsv(fs.readFileSync(file, 'utf8'));
const find = (rows, game, pid) => rows.filter((r) => r.game_id === game.id && r.player_id === pid);

test('A2.1 read: each game\'s tab shows that game\'s tier for the same player, and a tag-only row of another game never matches', () => {
  const { srcA, srcB, tiersFile } = world();
  const vmA = data.viewModel(srcA, { tiersFile, today: '2026-11-06' });
  const vmB = data.viewModel(srcB, { tiersFile, today: '2026-11-06' });
  assert.strictEqual(vmA.notes['1'].tier, 9);
  assert.strictEqual(vmA.notes['1'].notes, 'A note');
  assert.strictEqual(vmB.notes['1'].tier, 4);
  assert.strictEqual(vmB.notes['1'].notes, 'B note');
  assert.strictEqual(vmA.notes['3'], undefined, 'Foo has a tier in MBTL only; the MBAACC tab shows none');
  assert.strictEqual(vmB.notes['3'].tier, 7);
  assert.strictEqual(vmB.notes['3'].tag_only, true);
});

test('A2.1 read: a missing game reads as no rows (before A2 it read every game\'s rows)', () => {
  const { tiersFile } = world();
  for (const g of [undefined, null, '', 'undefined']) assert.deepStrictEqual(data.readTiers(g, tiersFile), [], String(g));
  assert.strictEqual(data.readTiers(A.id, tiersFile).length, 1);
  assert.strictEqual(data.readTiers(B.id, tiersFile).length, 2);
});

test('A2.1 write: a tier edit, a notes edit and a ✓ in game A touch only game A\'s row; a new row is created in A, never by borrowing B\'s', () => {
  const { srcA, tiersFile } = world();
  const before = rowsOf(tiersFile).filter((r) => r.game_id === B.id);
  data.updatePlayer(srcA, '1', { tier: '10', notes: 'changed' }, { tiersFile, now: new Date('2026-11-06T12:00:00Z') });
  data.reviewPlayer(srcA, '1', { reviewed: true, tiersFile, now: new Date('2026-11-06T12:00:00Z') });
  // Foo: no MBAACC row. The edit creates one in MBAACC; MBTL's unlinked "Foo" row stays unlinked.
  data.updatePlayer(srcA, '3', { tier: '2' }, { tiersFile, now: new Date('2026-11-06T12:00:00Z') });
  const after = rowsOf(tiersFile);
  assert.deepStrictEqual(after.filter((r) => r.game_id === B.id), before, 'every MBTL row is exactly as it was');
  assert.deepStrictEqual(find(after, A, '1').map((r) => [r.tier, r.notes, r.last_reviewed_tournament]), [['10', 'changed', 'tour']]);
  assert.deepStrictEqual(find(after, A, '3').map((r) => [r.tier, r.game_name]), [['2', A.name]]);
});

test('A2.1 write: with no game there is nothing to write (409), never a row with game_id "undefined"', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ event: { slug: 'tournament/x/event/y', name: 'Y' }, game: null, run_at: '2026-11-01T00:00:00Z', window: {} }));
  fs.writeFileSync(path.join(dir, 'players.csv'), out.toCsv(out.PLAYER_COLUMNS, [player(1, 'Both', '')]));
  fs.writeFileSync(path.join(dir, 'results.csv'), out.toCsv(out.RESULT_COLUMNS, []));
  const tiersFile = path.join(dir, 'tiers.csv');
  fs.writeFileSync(tiersFile, out.toCsv(data.TIER_COLS, [row(A, { player_id: '1', tier: '9' })]));
  const text = fs.readFileSync(tiersFile, 'utf8');
  assert.throws(() => data.updatePlayer(dir, '1', { tier: '3' }, { tiersFile }), (e) => e.status === 409);
  assert.strictEqual(fs.readFileSync(tiersFile, 'utf8'), text, 'the file is untouched');
  assert.deepStrictEqual(data.viewModel(dir, { tiersFile }).notes, {}, 'and the read shows no tier from MBAACC');
});

test('A2.1 linking: an upload for game A links A\'s rows only; the discriminator fill is the one cross-game write, by design', () => {
  const { tiersFile } = world();
  const uploaded = [{ player_id: '1', gamer_tag: 'Both', user_slug: 'user/aaaa1111' }, { player_id: '3', gamer_tag: 'Foo', user_slug: 'user/bbbb2222' }];
  const s = data.linkPlayers(uploaded, { gameId: A.id, tiersFile });
  assert.strictEqual(s.matched_by_id, 1);
  assert.deepStrictEqual(s.linked_by_tag, [], 'Foo\'s only unlinked row is MBTL\'s: not linked from MBAACC');
  const rows = rowsOf(tiersFile);
  const foo = rows.find((r) => r.sheet_tag === 'Foo');
  assert.strictEqual(foo.player_id, '', 'MBTL\'s tag row stays unlinked');
  // Identity, not tier: player 1's discriminator is written on both games' rows, tiers untouched.
  assert.deepStrictEqual(rows.filter((r) => r.player_id === '1').map((r) => [r.game_id, r.tier, r.discriminator]),
    [[A.id, '9', 'aaaa1111'], [B.id, '4', 'aaaa1111']]);
  assert.throws(() => data.linkPlayers(uploaded, { tiersFile }), /needs the game/);
});

test('A2.1 push: the dry run uses the event\'s own game\'s tiers; an event with no game is refused', async () => {
  const { tiersFile } = world();
  const seeds = [1, 3].map((id, i) => ({ id: `s${id}`, seedNum: i + 1, entrant: { id, participants: [{ player: { id, gamerTag: id === 1 ? 'Both' : 'Foo' } }] } }));
  const dryA = push.buildDryRun({ phase: { id: 'P' }, seeds, poolIds: new Set(['1', '3']), tierRows: data.readTiers(A.id, tiersFile) });
  const dryB = push.buildDryRun({ phase: { id: 'P' }, seeds, poolIds: new Set(['1', '3']), tierRows: data.readTiers(B.id, tiersFile) });
  assert.deepStrictEqual(dryA.rows.map((r) => [r.player_id, r.tier]), [['1', 9], ['3', null]]);
  assert.deepStrictEqual(dryB.rows.map((r) => [r.player_id, r.tier]), [['3', 7], ['1', 4]]);
  let asked = 0;
  const client = { request: async () => { asked++; throw new Error('no request expected'); } };
  await assert.rejects(push.dryRun({ client, event: { slug: 'x', name: 'X', game: null, phases: [{ id: '1' }] }, poolIds: new Set(), tiersFile }), (e) => e.status === 409);
  assert.strictEqual(asked, 0, 'refused before any start.gg request');
});

test('A2.1 export: the CSV export of a tab numbers with that game\'s tiers', () => {
  const { srcA, srcB, tiersFile } = world();
  const seqA = data.summaryExport(srcA, { tiersFile, today: '2026-11-06' }).sequence.map((x) => [x.id, x.tier]);
  const seqB = data.summaryExport(srcB, { tiersFile, today: '2026-11-06' }).sequence.map((x) => [x.id, x.tier]);
  assert.deepStrictEqual(seqA[0], ['1', 9]);
  assert.deepStrictEqual(seqB.slice(0, 2), [['3', 7], ['1', 4]]);
});
