'use strict';
// The ✓ review mark and tier recency (docs/design-tool.md, T1 Rules and display rule 9;
// dispatch-contract-tool.md, Acceptance 3, 4 and 5): data.reviewPlayer through the shared tier-row
// matcher, the route, persistence across two app instances (two browsers see server state), the
// recency bands and hover, the ✓ column's sort key, and the editor without a reason prompt.
// Every tiers file lives in this test's temp folder.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { toCsv, parseCsv } = require('../lib/output');
const data = require('../lib/view/data');
const M = require('../lib/view/model');
const R = require('../lib/view/render');
const { createApp } = require('../app/server');
const { inject } = require('../testlib/inject');

const PLAYER_COLS = ['player_id', 'gamer_tag', 'prefix', 'user_slug', 'region_state', 'region_country', 'result_count', 'history_status', 'team_entry'];
const RESULT_COLS = ['player_id', 'gamer_tag', 'event_date', 'game_id', 'game_name', 'is_event_game', 'tournament_name', 'event_name', 'event_slug', 'event_id', 'num_entrants', 'placement', 'is_online'];
const T = 'eclipse-1st-cour', E = 'bloody-fights-mbaacc-singles';
const GAME = { id: '22407', name: 'Melty Blood Actress Again Current Code' };
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const player = (id, tag) => ({ player_id: String(id), gamer_tag: tag, prefix: '', user_slug: `u${id}`, region_state: '', region_country: '', result_count: '0', history_status: 'complete', team_entry: 'false' });
const tierRow = (o) => ({ game_id: GAME.id, game_name: GAME.name, player_id: '', startgg_tag: '', sheet_tag: '', tier: '', notes: '', decided_on: '', last_reviewed_on: '', last_reviewed_tournament: '', source: 'sheet import', sheet_region: '', sheet_placements: '', sheet_notes: '', ...o });

function makeRun(outRoot, { t = T, e = E, players }) {
  const dir = path.join(outRoot, `${t}__${e}__20261015-0925`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'players.csv'), toCsv(PLAYER_COLS, players));
  fs.writeFileSync(path.join(dir, 'results.csv'), toCsv(RESULT_COLS, []));
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({
    event: { id: '1635293', slug: `tournament/${t}/event/${e}`, name: 'MBAACC Singles', tournament_name: 'Eclipse [1st Cour]' },
    game: GAME, run_at: '2026-10-15T14:25:07.889Z',
    window: { start: '2024-10-15T00:00:00.000Z', end: '2026-10-15T00:00:00.000Z', days: 730 },
    registrant_count: players.length, history_status: { complete: players.length, limited: 0, failed: 0 },
  }));
  return dir;
}
function setup(rows, players = [player(1, 'Kouryuu'), player(2, 'Ono'), player(3, 'Fresh')]) {
  const outRoot = tmp('seeding-review-');
  const tiersFile = path.join(outRoot, 'registry', 'tiers.csv');
  fs.mkdirSync(path.dirname(tiersFile), { recursive: true });
  fs.writeFileSync(tiersFile, toCsv(data.TIER_COLS, rows));
  return { outRoot, tiersFile, dir: makeRun(outRoot, { players }) };
}
const readRows = (f) => parseCsv(fs.readFileSync(f, 'utf8'));
const day = (s) => new Date(`${s}T15:00:00Z`);

test('✓ sets last_reviewed_on = today and last_reviewed_tournament = this tournament, through the shared tier-row matcher (no duplicate, tier/decided_on/source untouched)', () => {
  // An unlinked sheet-import row, matched by tag, exactly as an edit would match it.
  const { tiersFile, dir } = setup([tierRow({ sheet_tag: 'Kouryuu', tier: '8', decided_on: '' })]);
  const out = data.reviewPlayer(dir, '1', { reviewed: true, now: day('2026-11-03'), tiersFile });
  assert.deepStrictEqual(out, { player_id: '1', tier: 8, notes: '', decided_on: '', last_reviewed_on: '2026-11-03', last_reviewed_tournament: T, changed: true });
  const rows = readRows(tiersFile);
  assert.strictEqual(rows.length, 1, 'the matched row was updated, not forked');
  assert.strictEqual(rows[0].player_id, '1', 'and linked to the player');
  assert.strictEqual(rows[0].tier, '8');
  assert.strictEqual(rows[0].decided_on, '', 'a review is not a tier change');
  assert.strictEqual(rows[0].source, 'sheet import', 'the tier\'s source is unchanged by a review');
  // The reader (what the page shows) picks the same row and sees the review.
  const notes = data.readNotes(dir, data.loadRun(dir).players, GAME.id, tiersFile);
  assert.strictEqual(notes['1'].last_reviewed_tournament, T);
  assert.strictEqual(M.recency(notes['1'], { tournament: T, today: '2026-11-03' }), 'here');
  // The file keeps its shape: BOM, every field quoted.
  const text = fs.readFileSync(tiersFile, 'utf8');
  assert.ok(text.startsWith('﻿"game_id",'));
});

test('un-✓ is a same-day undo only: it clears a review made today at this tournament, and does nothing otherwise', () => {
  const { tiersFile, dir } = setup([
    tierRow({ player_id: '1', sheet_tag: 'Kouryuu', tier: '8', source: 'app', decided_on: '2026-10-16', last_reviewed_on: '2026-10-16', last_reviewed_tournament: T }),
    tierRow({ player_id: '2', sheet_tag: 'Ono', tier: '6', source: 'app', decided_on: '2026-09-01', last_reviewed_on: '2026-11-03', last_reviewed_tournament: 'another-tournament' }),
  ]);
  const before = fs.readFileSync(tiersFile, 'utf8');
  // A review from an earlier day at this tournament: the click does nothing; the file is untouched.
  let out = data.reviewPlayer(dir, '1', { reviewed: false, now: day('2026-11-03'), tiersFile });
  assert.strictEqual(out.changed, false);
  assert.strictEqual(out.last_reviewed_on, '2026-10-16');
  // A review from another tournament (even today) is never cleared from this page.
  out = data.reviewPlayer(dir, '2', { reviewed: false, now: day('2026-11-03'), tiersFile });
  assert.strictEqual(out.changed, false);
  assert.strictEqual(out.last_reviewed_tournament, 'another-tournament');
  assert.strictEqual(fs.readFileSync(tiersFile, 'utf8'), before, 'neither no-op wrote the file');

  // ✓ then un-✓ on the same day at this tournament: a misclick, undone; both fields cleared.
  out = data.reviewPlayer(dir, '2', { reviewed: true, now: day('2026-11-03'), tiersFile });
  assert.strictEqual(out.last_reviewed_tournament, T, '✓ records this tournament (replacing the older review is a new review, not a destroyed one)');
  out = data.reviewPlayer(dir, '2', { reviewed: false, now: day('2026-11-03'), tiersFile });
  assert.strictEqual(out.changed, true);
  assert.strictEqual(out.last_reviewed_on, '');
  assert.strictEqual(out.last_reviewed_tournament, '');
  // ✓ again the next day, then un-✓ the day after: the earlier day's review stays.
  data.reviewPlayer(dir, '2', { reviewed: true, now: day('2026-11-04'), tiersFile });
  out = data.reviewPlayer(dir, '2', { reviewed: false, now: day('2026-11-05'), tiersFile });
  assert.strictEqual(out.changed, false);
  assert.strictEqual(out.last_reviewed_on, '2026-11-04');
  // ✓ twice on one day writes once (the second is a no-op).
  const mid = fs.readFileSync(tiersFile, 'utf8');
  assert.strictEqual(data.reviewPlayer(dir, '2', { reviewed: true, now: day('2026-11-04'), tiersFile }).changed, false);
  assert.strictEqual(fs.readFileSync(tiersFile, 'utf8'), mid);
});

test('✓ for a player with no tiers row creates one (source app, no tier); un-✓ for such a player writes nothing; "reviewed" must be a boolean', () => {
  const { tiersFile, dir } = setup([tierRow({ sheet_tag: 'Someone Else', tier: '3' })]);
  const before = fs.readFileSync(tiersFile, 'utf8');
  const none = data.reviewPlayer(dir, '3', { reviewed: false, now: day('2026-11-03'), tiersFile });
  assert.deepStrictEqual(none, { player_id: '3', tier: null, notes: '', decided_on: '', last_reviewed_on: '', last_reviewed_tournament: '', changed: false });
  assert.strictEqual(fs.readFileSync(tiersFile, 'utf8'), before);
  data.reviewPlayer(dir, '3', { reviewed: true, now: day('2026-11-03'), tiersFile });
  const rows = readRows(tiersFile);
  assert.strictEqual(rows.length, 2);
  const mine = rows.find((r) => r.player_id === '3');
  assert.deepStrictEqual([mine.tier, mine.source, mine.startgg_tag, mine.last_reviewed_on, mine.last_reviewed_tournament], ['', 'app', 'Fresh', '2026-11-03', T]);
  for (const bad of [undefined, 'true', 1, null]) {
    assert.throws(() => data.reviewPlayer(dir, '3', { reviewed: bad, tiersFile }), (err) => err.status === 400);
  }
  assert.throws(() => data.reviewPlayer(dir, '999', { reviewed: true, tiersFile }), (err) => err.status === 404);
});

test('route: POST …/player/<id>/review — header guard, JSON body, the URL\'s tournament; the mark reads back from a second app instance (another browser)', async () => {
  const { outRoot, tiersFile } = setup([tierRow({ sheet_tag: 'Kouryuu', tier: '8' })]);
  const clock = () => day('2026-11-03').getTime();
  const app1 = createApp({ outRoot, tiersFile, getToken: () => 'unused', now: clock });
  const URL = `/api/e/${T}/${E}/player/1/review`;
  assert.strictEqual((await inject(app1.handler, { url: URL, method: 'POST', body: '{"reviewed":true}' })).status, 403);
  assert.strictEqual((await inject(app1.handler, { url: URL, method: 'POST', headers: { 'X-Seeding-App': '1' }, body: 'nope' })).status, 400);
  assert.strictEqual((await inject(app1.handler, { url: URL, method: 'POST', headers: { 'X-Seeding-App': '1' }, body: '{"reviewed":"yes"}' })).status, 400);
  assert.strictEqual((await inject(app1.handler, { url: URL, method: 'GET' })).status, 405);
  const res = await inject(app1.handler, { url: URL, method: 'POST', headers: { 'X-Seeding-App': '1' }, body: JSON.stringify({ reviewed: true, last_reviewed_tournament: 'spoofed' }) });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.json().last_reviewed_tournament, T, 'the tournament is the URL\'s, never the body\'s');

  // "Another browser": a separate app instance over the same files sees the mark in its data and
  // renders the row reviewed (green) with the Eclipse recency color.
  const app2 = createApp({ outRoot, tiersFile, getToken: () => 'unused', now: clock });
  const vm = (await inject(app2.handler, { url: `/api/e/${T}/${E}/data` })).json();
  assert.strictEqual(vm.tournament, T);
  assert.strictEqual(vm.today, '2026-11-03');
  assert.strictEqual(vm.notes['1'].last_reviewed_on, '2026-11-03');
  const ctx = R.contextFromViewModel(vm, { app: true });
  const tr = R.summaryRow(vm.players.find((p) => p.player_id === '1'), ctx, { app: true });
  assert.match(tr, /^<tr data-pid="1" class="reviewed-row">/);
  assert.match(tr, /<td class="seeded" data-v="1"><button class="seed-btn" type="button" aria-pressed="true"/);
  assert.match(tr, /<td class="tier rec-here" data-v="8"[^>]*title="Last reviewed 2026-11-03 at eclipse-1st-cour \(this tournament\)"/);
  // Un-✓ the same day through the route clears it.
  const undo = await inject(app2.handler, { url: URL, method: 'POST', headers: { 'X-Seeding-App': '1' }, body: '{"reviewed":false}' });
  assert.strictEqual(undo.json().changed, true);
  assert.strictEqual(readRows(tiersFile)[0].last_reviewed_on, '');
});

test('recency bands from today (display rule 9 defaults): here green, within 6 months none, older amber, never-reviewed tier grey; hover gives date and tournament', () => {
  const ctx = { tournament: T, today: '2026-11-03' };
  const n = (o) => ({ tier: 5, last_reviewed_on: '', last_reviewed_tournament: '', ...o });
  assert.strictEqual(M.recency(n({ last_reviewed_on: '2025-01-01', last_reviewed_tournament: T }), ctx), 'here', 'this tournament wins over age');
  assert.strictEqual(M.recency(n({ last_reviewed_on: '2026-05-03', last_reviewed_tournament: 'x' }), ctx), 'recent', 'exactly 6 months ago is within');
  assert.strictEqual(M.recency(n({ last_reviewed_on: '2026-05-02', last_reviewed_tournament: 'x' }), ctx), 'old');
  assert.strictEqual(M.recency(n({}), ctx), 'never');
  assert.strictEqual(M.recency({ notes: 'x' }, ctx), null, 'no tier, no review: nothing to color');
  assert.strictEqual(M.recency(undefined, ctx), null);
  assert.strictEqual(M.monthsBefore('2026-08-31', 6), '2026-02-28', 'clamped to the month\'s last day');
  assert.strictEqual(M.monthsBefore('2026-01-15', 6), '2025-07-15', 'across a year boundary');
  assert.strictEqual(M.monthsBefore('2024-08-31', 6), '2024-02-29', 'leap year');
  // The Tier cell carries the band as a class and the hover text. "recent" is "no color": its class
  // exists as a hook, and the stylesheet gives it no rule.
  const css = fs.readFileSync(path.join(__dirname, '..', 'app', 'public', 'app.css'), 'utf8');
  assert.ok(/rec-here/.test(css) && /rec-old/.test(css) && /rec-never/.test(css) && !/rec-recent/.test(css));
  const p = { player_id: '1', gamer_tag: 'K', prefix: '', region_state: '', region_country: '' };
  const cell = (note) => {
    const c = R.summaryContext({ meta: { game: { name: 'G' } }, players: [p], rows: [], records: {}, notes: { 1: note }, columns: { majors: [], shared: [] }, index: M.indexFromKeys({}), ...ctx });
    return /<td class="tier[^"]*"[^>]*>/.exec(R.summaryRow(p, c))[0];
  };
  assert.match(cell(n({ last_reviewed_on: '2026-04-01', last_reviewed_tournament: 'climax-x' })), /class="tier rec-old".*title="Last reviewed 2026-04-01 at climax-x \(over 6 months ago\)"/);
  assert.match(cell(n({ last_reviewed_on: '2026-10-01', last_reviewed_tournament: 'climax-x' })), /class="tier rec-recent" .*title="Last reviewed 2026-10-01 at climax-x"/);
  assert.match(cell(n({})), /class="tier rec-never".*title="Never reviewed \(tier from the sheet import\)"/);
});

test('the ✓ column sorts reviewed and unreviewed apart (data-v 1 / 0 from T1), and the row is green only for this tournament', () => {
  const ps = [1, 2, 3].map((id) => ({ player_id: String(id), gamer_tag: `P${id}`, prefix: '', region_state: '', region_country: '' }));
  const notes = { 1: { tier: 5, last_reviewed_on: '2026-11-03', last_reviewed_tournament: T }, 2: { tier: 4, last_reviewed_on: '2026-11-03', last_reviewed_tournament: 'other' } };
  const ctx = { ...R.summaryContext({ meta: { game: { name: 'G' } }, players: ps, rows: [], records: {}, notes, columns: { majors: [], shared: [] }, index: M.indexFromKeys({}), tournament: T, today: '2026-11-03' }), app: true };
  const rows = ps.map((p) => R.summaryRow(p, ctx, { app: true }));
  const v = rows.map((tr) => /<td class="seeded" data-v="(\d)">/.exec(tr)[1]);
  assert.deepStrictEqual(v, ['1', '0', '0']);
  assert.deepStrictEqual(rows.map((tr) => /class="[^"]*reviewed-row/.test(tr)), [true, false, false]);
  // The app's header sort is a numeric sort on data-v (app/public/app.js sortSummary): reviewed rows group together.
  const sorted = rows.map((tr, i) => ({ v: Number(v[i]), i })).sort((a, b) => a.v - b.v || a.i - b.i).map((x) => x.i);
  assert.deepStrictEqual(sorted, [1, 2, 0]);
});

test('the editor: tier and notes only, no reason prompt; the ✓ no longer reads browser storage', () => {
  // app/public/app.js runs in a browser; this pins its source (the orchestrator's browser check
  // covers the behavior). The tier popover has one input; nothing posts a justification.
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'public', 'app.js'), 'utf8');
  assert.ok(!/ed-just|Reason|justification/.test(src), 'no reason field anywhere in the page code');
  assert.match(src, /<label>Tier <input class="ed-tier"/);
  assert.ok(!/store\.(get|set)\(SEEDED_KEY|seeding:seeded:\$\{SLUG\}`, \[/.test(src), 'the seeded marks are not read from or written to localStorage');
  assert.match(src, /localStorage\.removeItem\(`seeding:seeded:\$\{SLUG\}`\)/, 'the old key is removed once');
  assert.match(src, /player\/\$\{encodeURIComponent\(pid\)\}\/review/, 'the ✓ posts to the review route');
});

test('a tier edit still stamps decided_on when the tier changes, through the route, and a review does not', async () => {
  const { outRoot, tiersFile } = setup([tierRow({ player_id: '1', sheet_tag: 'Kouryuu', tier: '8', decided_on: '2026-10-16', source: 'app' })]);
  const app = createApp({ outRoot, tiersFile, getToken: () => 'unused', now: () => day('2026-11-03').getTime() });
  const post = (url, body) => inject(app.handler, { url, method: 'POST', headers: { 'X-Seeding-App': '1' }, body: JSON.stringify(body) });
  await post(`/api/e/${T}/${E}/player/1/review`, { reviewed: true });
  assert.strictEqual(readRows(tiersFile)[0].decided_on, '2026-10-16');
  const r = await post(`/api/e/${T}/${E}/player/1`, { tier: 9, justification: 'ignored' });
  assert.strictEqual(r.json().decided_on, '2026-11-03');
  assert.ok(!('justification' in readRows(tiersFile)[0]));
});
