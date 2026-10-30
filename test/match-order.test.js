'use strict';
// Match order and the tag-only color (docs/design-tool.md Amendment A1.2; dispatch-contract-tool-c.md,
// Acceptance 3): a player is matched to a tiers row by id first (player_id, then discriminator), then by
// tag only among rows with neither id; one matcher for the reader and the writer (A4-2). A tag-only
// match is marked in the view model and drawn in its own Tier-cell color in the table, the compare
// panel and the CLI view; a ✓ or an edit on such a row writes player_id and discriminator into it.
// Offline; every tiers file is a scratch file in this test's temp folder.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const out = require('../lib/output');
const data = require('../lib/view/data');
const R = require('../lib/view/render');
const { createApp } = require('../app/server');
const { inject } = require('../testlib/inject');
const { makePool } = require('../testlib/pool-fixture');

const G = { id: '22407', name: 'MBAACC' };
const T = 'tour';
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'seeding-match-'));
const tierRow = (o) => ({ game_id: G.id, game_name: G.name, player_id: '', discriminator: '', startgg_tag: '', sheet_tag: '', tier: '', notes: '', decided_on: '', last_reviewed_on: '', last_reviewed_tournament: '', source: 'sheet import', sheet_region: '', sheet_placements: '', sheet_notes: '', ...o });
const player = (id, tag, disc, extra = {}) => ({ player_id: String(id), gamer_tag: tag, prefix: '', user_slug: disc ? `user/${disc}` : '', region_state: '', region_country: '', result_count: '0', history_status: 'complete', team_entry: 'false', ...extra });
const readRows = (f) => out.parseCsv(fs.readFileSync(f, 'utf8'));

function world(players, rows) {
  const outRoot = tmp();
  makePool(outRoot, { t: T, events: [{ slug: 'ev', game: G }], players });
  const tiersFile = path.join(outRoot, 'tiers.csv');
  fs.writeFileSync(tiersFile, out.toCsv(data.TIER_COLS, rows.map(tierRow)));
  const src = data.tabSource(outRoot, T, G.id);
  const vm = () => data.viewModel(src, { tiersFile, today: '2026-11-03' });
  return { outRoot, tiersFile, src, vm };
}

test('match order: player_id first, then the discriminator, then the tag among rows with neither id; the matcher says which', () => {
  const rows = [
    tierRow({ player_id: '1', sheet_tag: 'Alpha', tier: '9' }),
    tierRow({ discriminator: 'bbbb0002', sheet_tag: 'Somebody Else', tier: '8' }), // id by discriminator only
    tierRow({ sheet_tag: 'Gamma', tier: '7' }),                                   // no id: tag only
    tierRow({ sheet_tag: 'Bravo', tier: '1' }),                                   // a tag decoy for player 2
  ];
  const index = data.indexTierRows(rows);
  const by = (p) => { const m = data.matchTierRowBy(index, p); return m && [m.by, m.row.tier]; };
  assert.deepStrictEqual(by(player(1, 'Gamma', 'aaaa0001')), ['player_id', '9'], 'player_id beats a tag that also matches');
  assert.deepStrictEqual(by(player(2, 'Bravo', 'bbbb0002')), ['discriminator', '8'], 'the discriminator beats a tag that also matches');
  assert.deepStrictEqual(by(player(2, 'Bravo', 'BBBB0002')), ['discriminator', '8'], 'discriminators compare case-insensitively');
  assert.deepStrictEqual(by({ ...player(2, 'Bravo'), discriminator: 'bbbb0002' }), ['discriminator', '8'], 'a discriminator field works as well as user_slug');
  assert.deepStrictEqual(by(player(3, 'Gamma', 'cccc0003')), ['tag', '7']);
  // A row linked by discriminator never answers to a tag; one whose player_id names someone else
  // never answers to that person's discriminator either.
  assert.strictEqual(data.matchTierRowBy(index, player(4, 'Somebody Else', 'dddd0004')), null);
  const other = data.indexTierRows([tierRow({ player_id: '50', discriminator: 'eeee0005', tier: '3' })]);
  assert.strictEqual(data.matchTierRowBy(other, player(51, 'X', 'eeee0005')), null);
  // matchTierRow (push's dry run uses it) returns the same row.
  assert.strictEqual(data.matchTierRow(index, player(3, 'Gamma', 'cccc0003')), rows[2]);
  assert.strictEqual(data.discriminatorOf({ user_slug: 'user/2D17CCCD' }), '2d17cccd');
  assert.strictEqual(data.discriminatorOf({ user_slug: 'u3' }), '', 'not a discriminator: no id');
});

test('the view model marks a tag-only match (tag_only), not an id match; the reader and the writer pick the same row', () => {
  const w = world([player(1, 'Alpha', 'aaaa0001'), player(2, 'Bravo', 'bbbb0002'), player(3, 'Gamma', 'cccc0003')], [
    { player_id: '1', sheet_tag: 'Alpha', tier: '9', source: 'app' },
    { discriminator: 'bbbb0002', sheet_tag: 'Bravo', tier: '8' },
    { sheet_tag: 'Gamma', tier: '7' },
  ]);
  const notes = w.vm().notes;
  assert.deepStrictEqual(['1', '2', '3'].map((id) => [notes[id].tier, !!notes[id].tag_only]), [[9, false], [8, false], [7, true]]);
});

test('the tag-only color: the table and the compare panel draw it with its hover text; the CLI view carries the same class and color', () => {
  const w = world([player(1, 'Alpha', 'aaaa0001'), player(3, 'Gamma', 'cccc0003')], [
    { player_id: '1', sheet_tag: 'Alpha', tier: '9', source: 'app', last_reviewed_on: '2026-10-16', last_reviewed_tournament: 'x' },
    { sheet_tag: 'Gamma', tier: '7' },
  ]);
  const vm = w.vm();
  const ctx = R.contextFromViewModel(vm, { app: true });
  const p3 = vm.players.find((p) => p.player_id === '3');
  const p1 = vm.players.find((p) => p.player_id === '1');
  const want = `class="tier match-tag" data-v="7" title="${R.TAG_ONLY_TITLE} · Never reviewed (tier from the sheet import)"`;
  assert.ok(R.summaryRow(p3, ctx, { app: true }).includes(want.replace('data-v="7"', 'data-v="7" tabindex="0" data-edit="tier"')), 'the table');
  assert.ok(R.summaryRow(p3, ctx).includes(want), 'the compare panel (same row function, read-only)');
  assert.match(R.summaryRow(p1, ctx), /class="tier rec-recent"/, 'an id match keeps its recency color');
  assert.ok(!R.summaryRow(p1, ctx).includes('match-tag'));
  // The colors: one rule for the table and the compare panel's table.summary, tokens in both themes.
  const css = fs.readFileSync(path.join(__dirname, '..', 'app', 'public', 'app.css'), 'utf8');
  assert.match(css, /#summary td\.tier\.match-tag, table\.summary td\.tier\.match-tag \{ background: var\(--tag-only-bg\); color: var\(--tag-only-fg\); \}/);
  const cli = fs.readFileSync(path.join(__dirname, '..', 'views', 'major-table.js'), 'utf8');
  assert.match(cli, /table\.summary td\.tier\.match-tag\{background:#cfe2ff;color:#12357a\}/, 'the CLI view uses the light theme\'s values');
  assert.match(css, /--tag-only-bg: #cfe2ff; --tag-only-fg: #12357a;/);
});

test('both dark blocks (the saved choice and the OS preference) carry the same values, the new tag-only and badge tokens included', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'app', 'public', 'app.css'), 'utf8');
  const saved = /:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/.exec(css)[1];
  const os_ = /:root:not\(\[data-theme="light"\]\) \{([\s\S]*?)\n\}/.exec(css)[1];
  const vars = (b) => Object.fromEntries([...b.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  assert.deepStrictEqual(vars(os_), vars(saved));
  for (const k of ['--tag-only-bg', '--tag-only-fg', '--src-startgg-bg', '--src-startgg-fg', '--src-upload-bg', '--src-upload-fg']) {
    assert.ok(k in vars(saved), `dark has ${k}`);
    assert.ok(new RegExp(`${k}:`).test(css.split(':root[data-theme="dark"]')[0]), `light has ${k}`);
  }
});

test('a ✓ on a tag-only row writes player_id and discriminator into it (the link becomes real); the next read matches by id', () => {
  const w = world([player(3, 'Gamma', 'cccc0003')], [{ sheet_tag: 'Gamma', tier: '7' }]);
  const r = data.reviewPlayer(w.src, '3', { reviewed: true, now: new Date('2026-11-03T12:00:00Z'), tiersFile: w.tiersFile });
  assert.strictEqual(r.linked, true);
  const rows = readRows(w.tiersFile);
  assert.strictEqual(rows.length, 1, 'no second row');
  assert.deepStrictEqual([rows[0].player_id, rows[0].discriminator, rows[0].tier, rows[0].last_reviewed_tournament], ['3', 'cccc0003', '7', T]);
  assert.ok(!w.vm().notes['3'].tag_only, 'matched by id now');
});

test('an edit on a tag-only row writes player_id and discriminator into it, and answers linked', () => {
  const w = world([player(3, 'Gamma', 'cccc0003')], [{ sheet_tag: 'Gamma', tier: '7' }]);
  const r = data.updatePlayer(w.src, '3', { notes: 'seen live' }, { now: new Date('2026-11-03T12:00:00Z'), tiersFile: w.tiersFile });
  assert.strictEqual(r.linked, true);
  const rows = readRows(w.tiersFile);
  assert.deepStrictEqual([rows.length, rows[0].player_id, rows[0].discriminator, rows[0].notes, rows[0].tier], [1, '3', 'cccc0003', 'seen live', '7']);
  assert.ok(!w.vm().notes['3'].tag_only);
});

test('a discriminator already on a row is kept by a write; a player with no discriminator links by player_id alone', () => {
  const w = world([player(5, 'Echo', ''), player(6, 'Fox', 'ffff0006')], [
    { sheet_tag: 'Echo', tier: '4' },
    { player_id: '6', discriminator: '0000beef', sheet_tag: 'Fox', tier: '2' },
  ]);
  data.updatePlayer(w.src, '5', { notes: 'n' }, { tiersFile: w.tiersFile });
  data.updatePlayer(w.src, '6', { notes: 'n' }, { tiersFile: w.tiersFile });
  const rows = readRows(w.tiersFile);
  assert.deepStrictEqual(rows.map((r) => [r.player_id, r.discriminator]), [['5', ''], ['6', '0000beef']]);
});

test('A6-1, two players one tag: both show the row as tag-only; a ✓ links it to the one clicked, never both; the other then reads as untiered and its own edit makes its own row', () => {
  const w = world([player(7, 'Twin', 'aaaa0007'), player(8, 'Twin', 'aaaa0008')], [{ sheet_tag: 'Twin', tier: '6' }]);
  const before = w.vm().notes;
  assert.deepStrictEqual([before['7'].tag_only, before['8'].tag_only], [true, true], 'both inferred, both colored');
  data.reviewPlayer(w.src, '8', { reviewed: true, now: new Date('2026-11-03T12:00:00Z'), tiersFile: w.tiersFile });
  let rows = readRows(w.tiersFile);
  assert.deepStrictEqual(rows.map((r) => [r.player_id, r.discriminator, r.tier]), [['8', 'aaaa0008', '6']], 'linked to the one clicked');
  const after = w.vm().notes;
  assert.strictEqual(after['7'], undefined, 'the other no longer borrows the row');
  assert.ok(!after['8'].tag_only);
  data.updatePlayer(w.src, '7', { tier: '3' }, { tiersFile: w.tiersFile });
  rows = readRows(w.tiersFile);
  assert.deepStrictEqual(rows.map((r) => [r.player_id, r.discriminator, r.tier]), [['8', 'aaaa0008', '6'], ['7', 'aaaa0007', '3']]);
});

test('route: a ✓ through the app answers linked, and the page drops the tag-only color on it', async () => {
  const w = world([player(3, 'Gamma', 'cccc0003')], [{ sheet_tag: 'Gamma', tier: '7' }]);
  const app = createApp({ outRoot: w.outRoot, getToken: () => '', tiersFile: w.tiersFile, now: () => Date.parse('2026-11-03T12:00:00Z') });
  const d = (await inject(app.handler, { url: `/api/t/${T}/g/${G.id}/data` })).json();
  assert.strictEqual(d.notes['3'].tag_only, true);
  const r = await inject(app.handler, { url: `/api/t/${T}/g/${G.id}/player/3/review`, method: 'POST', headers: { 'X-Seeding-App': '1' }, body: '{"reviewed":true}' });
  assert.strictEqual(r.json().linked, true);
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'public', 'app.js'), 'utf8');
  assert.strictEqual(src.split('tag_only: body.linked ? undefined : n.tag_only').length, 3, 'both the ✓ and the edit handlers drop it');
});
