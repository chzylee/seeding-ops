'use strict';
// lib/view/render.js — the four ratified display rules (docs/usage-log.md, "Requirements
// surfaced", rows marked Ratified) checked on every table the app and the CLI render, including
// the compare panel:
//   1. per result: event name, placement out of entrants, W-L (date secondary)
//   2. no aggregate counts (number of results, wins, top-3s)
//   3. every series: best placement (with its W-L), best W-L, average W-L (average only for 2+), no totals
//   4. tables, not bullets
const { test } = require('node:test');
const assert = require('node:assert');
const M = require('../lib/view/model');
const R = require('../lib/view/render');
// The game's majors list (increment 3: majors are per-game config, not built into model.js).
const { majorsFor } = require('../testlib/majors-fixture');

let ev = 100;
const row = (pid, t, extra = {}) => ({ player_id: String(pid), gamer_tag: `P${pid}`, event_date: '2026-03-01', game_id: '1', game_name: 'MBTL',
  is_event_game: 'true', tournament_name: t, event_name: t, event_slug: '', event_id: String(ev++), num_entrants: '32', placement: '5', is_online: 'false', ...extra });

function fixture() {
  const shared1 = row(1, 'Blood Moon LX', { event_id: '9001', placement: '1', num_entrants: '20', event_date: '2026-06-01' });
  const shared2 = row(2, 'Blood Moon LX', { event_id: '9001', placement: '4', num_entrants: '20', event_date: '2026-06-01' });
  const rows = [
    shared1, shared2,
    row(1, 'Blood Moon LXI', { placement: '2', num_entrants: '18' }),
    row(1, 'CEO 2026', { placement: '33', num_entrants: '400', event_name: 'MBTL' }),
    row(1, 'CEO 2026', { placement: '3', num_entrants: '24', event_name: 'MBTL side' }),
    row(1, 'Lunar Exam #3', { placement: '', num_entrants: '12' }),
    row(1, 'Other Game Cup', { is_event_game: 'false', game_name: 'GGST' }),
    row(2, 'Melty Sweep 87', { placement: '9', num_entrants: '40' }),
    row(2, 'Blood Moon L', { placement: '7', num_entrants: '22' }),
    row(3, 'Blood Moon XX'),
  ];
  const records = {};
  rows.forEach((r, i) => { if (i % 4 !== 3) records[M.key(r)] = { w: 2 + (i % 3), l: 1 + (i % 2), dq: 0 }; });
  const players = [1, 2, 3, 4].map((id) => ({ player_id: String(id), gamer_tag: `P${id}`, prefix: '', region_state: 'NY', region_country: 'United States' }));
  const index = M.buildSeriesIndex(rows, { majors: majorsFor() });
  const columns = M.chooseColumns(players, rows.filter(M.isGame), index);
  const meta = { game: { name: 'MBTL' } };
  const ctx = R.summaryContext({ meta, players, rows, records, notes: {}, columns, index });
  return { ctx, players, rows, records };
}

const tables = (html) => html.match(/<table[\s\S]*?<\/table>/g) || [];
const headers = (t) => [...t.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim());
const bodyRows = (t) => (t.split('<tbody>')[1] || '').match(/<tr[\s\S]*?<\/tr>/g) || [];
const cells = (tr) => [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
const PLACE = /(\d+(st|nd|rd|th)|—) \/ \d+/;
const WL = /(\d+-\d+|—)/;

function everyTable({ ctx, players }) {
  const [A, B] = players;
  const html = {
    summary: `<table class="summary"><thead>${R.summaryHeadRow(ctx)}</thead><tbody>${players.map((p) => R.summaryRow(p, ctx, { app: true })).join('')}</tbody></table>`,
    detail: players.map((p) => R.playerTitle(p) + R.playerBody(p, ctx)).join(''),
    lazyGame: R.renderLazy('game', A, ctx),
    lazyOther: R.renderLazy('other', A, ctx),
    compareSummary: `<table class="summary"><thead>${R.summaryHeadRow(ctx)}</thead><tbody>${R.summaryRow(A, ctx)}${R.summaryRow(B, ctx)}</tbody></table>`,
    bothEntered: R.bothEnteredTable(A, B, ctx),
    compareSeries: R.compareSeriesTable(A, B, ctx),
  };
  return html;
}

test('render rule 4: tables, not bullets — no list markup anywhere', () => {
  for (const [name, html] of Object.entries(everyTable(fixture()))) {
    assert.ok(!/<(ul|ol|li)\b/i.test(html), name);
    assert.ok(tables(html).length >= 1, `${name} renders a table`);
  }
});

test('render rule 2: no aggregate count columns or cells (results, wins, top-N, totals)', () => {
  const COUNT = /\b(total|wins|losses|top[- ]?\d+|results?|win rate|sets)\b/i;
  for (const [name, html] of Object.entries(everyTable(fixture()))) {
    for (const t of tables(html)) {
      for (const h of headers(t)) assert.ok(!COUNT.test(h), `${name}: header "${h}"`);
      for (const tr of bodyRows(t)) for (const c of cells(tr)) assert.ok(!/\b\d+ (wins|results|top)/i.test(c), `${name}: cell "${c}"`);
    }
  }
});

test('render rule 1: every per-result row shows event name, placement out of entrants and W-L; date last', () => {
  const f = fixture();
  const html = everyTable(f);
  // Every result (this game and the lazy copy).
  let checked = 0;
  for (const t of [...tables(html.detail).filter((x) => headers(x)[0] === 'Event'), ...tables(html.lazyGame)]) {
    assert.deepStrictEqual(headers(t), ['Event', 'Placement', 'W-L', 'Date']);
    for (const tr of bodyRows(t)) {
      const [name, placement, wl, date] = cells(tr);
      assert.ok(name.length > 0);
      assert.match(placement, PLACE);
      assert.match(wl, WL);
      assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
      checked++;
    }
  }
  assert.ok(checked >= 8, `checked ${checked} result rows`);
  // Events both entered: event, each side's placement · W-L, date.
  const both = tables(html.bothEntered)[0];
  assert.deepStrictEqual(headers(both), ['Event', 'P1: placement · W-L', 'P2: placement · W-L', 'Date']);
  const rows = bodyRows(both);
  assert.strictEqual(rows.length, 1);
  const [name, a, b] = cells(rows[0]);
  assert.match(name, /Blood Moon LX/);
  assert.match(a, /^1st \/ 20 · \d+-\d+$/);
  assert.match(b, /^4th \/ 20 · (\d+-\d+|—)$/);
  // Major cells in the summary: placement / entrants · W-L per tournament (main bracket only).
  assert.match(html.summary, /<b>33rd \/ 400<\/b> · (\d+-\d+|—)/);
  assert.ok(!/3rd \/ 24/.test(html.summary), 'the side bracket is not the major cell');
});

test('render rule 3: every series row = best placement (with W-L), best W-L, average W-L (only for 2+ events)', () => {
  const f = fixture();
  const html = everyTable(f);
  const seriesTables = [...tables(html.detail).filter((x) => headers(x)[0] === 'Series'), ...tables(html.lazyOther)];
  assert.ok(seriesTables.length >= 3);
  let checked = 0;
  for (const t of seriesTables) {
    const h = headers(t);
    const i = h.indexOf('Best placement');
    assert.deepStrictEqual(h.slice(i, i + 3), ['Best placement', 'Best W-L', 'Average W-L']);
    for (const tr of bodyRows(t)) {
      const c = cells(tr);
      assert.match(c[i], new RegExp(`^(${PLACE.source} · ${WL.source}|—)$`));
      assert.match(c[i + 1], /^(\d+-\d+ \(.+\)|—)$/);
      assert.match(c[i + 2], /^(\d+\.\d-\d+\.\d|—)$/);
      checked++;
    }
  }
  assert.ok(checked >= 5, `checked ${checked} series rows`);
  // Average shown only for 2+ events with W-L: P1's Blood Moon has 2 events with W-L, Lunar Exam 1.
  const p1 = tables(R.playerBody(f.players[0], f.ctx))[0];
  const bm = bodyRows(p1).map(cells).find((c) => c[0].startsWith('Blood Moon'));
  assert.match(bm[4], /^\d+\.\d-\d+\.\d$/);
  const le = bodyRows(p1).map(cells).find((c) => c[0].startsWith('Lunar Exam'));
  assert.strictEqual(le[4], '—');
  // Summary series cells use the same three lines.
  assert.match(html.summary, /Best placement: <b>1st \/ 20<\/b>/);
  assert.match(html.summary, /Best W-L: <b>\d+-\d+<\/b>/);
  // Compare: one row per series, both sides' three stats, shared series on one row.
  const cs = tables(html.compareSeries)[0];
  assert.deepStrictEqual(headers(cs), ['Series', 'P1', 'P2', 'Best placement', 'Best W-L', 'Average W-L', 'Best placement', 'Best W-L', 'Average W-L']);
  const bmRow = bodyRows(cs).find((tr) => tr.includes('Blood Moon'));
  assert.match(bmRow, /class="both"/);
  assert.strictEqual(bodyRows(cs).filter((tr) => tr.includes('>Blood Moon<')).length, 1);
});

// A2-4 (build-record-webapp.md, pass 2): sharedEventsTable and compareSeriesTableN — the N-player
// compare's rendering (acceptance 7/8, "Compare up to 3", built out-of-band in bc93955) — had no
// render-level tests either, so the ratified display rules were never checked against them the
// way bothEnteredTable/compareSeriesTable are above.
test('render: sharedEventsTable — 2 players renders the same rows as bothEnteredTable, same ratified columns', () => {
  const { ctx, players } = fixture();
  const [A, B] = players;
  const two = tables(R.bothEnteredTable(A, B, ctx))[0];
  const nway = tables(R.sharedEventsTable([A, B], ctx))[0];
  assert.deepStrictEqual(headers(nway), ['Event', `${A.gamer_tag}: placement · W-L`, `${B.gamer_tag}: placement · W-L`, 'Date']);
  assert.deepStrictEqual(bodyRows(nway).map(cells), bodyRows(two).map(cells));
});

test('render: sharedEventsTable — 3 players: an event only 2 of 3 entered still shows, with a dash for the missing side; no bullets, no counts', () => {
  const { ctx, players } = fixture();
  const [A, B, C] = players; // C (player 3) shares no event_id with A or B in the fixture
  const html = R.sharedEventsTable([A, B, C], ctx);
  const t = tables(html)[0];
  assert.deepStrictEqual(headers(t), ['Event', `${A.gamer_tag}: placement · W-L`, `${B.gamer_tag}: placement · W-L`, `${C.gamer_tag}: placement · W-L`, 'Date']);
  const rows = bodyRows(t);
  assert.strictEqual(rows.length, 1, 'only the Blood Moon LX bracket (event_id 9001), shared by A and B, qualifies (n >= 2)');
  const [name, a, b, c, date] = cells(rows[0]);
  assert.match(name, /Blood Moon LX/);
  assert.match(a, PLACE);
  assert.match(b, PLACE);
  assert.strictEqual(c, '—', 'the 3rd player has no row at this event');
  assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(!/<(ul|ol|li)\b/i.test(html), 'rule 4: tables, not bullets');
  assert.ok(!/\b(total|wins|results?)\b/i.test(html), 'rule 2: no aggregate counts');
});

test('render: compareSeriesTableN — 2 players covers the same series with the same per-cell content as compareSeriesTable (row order can differ: alignSeriesN tie-breaks only-one-side rows by field size across both sides together, not per-side)', () => {
  const { ctx, players } = fixture();
  const [A, B] = players;
  const two = tables(R.compareSeriesTable(A, B, ctx))[0];
  const nway = tables(R.compareSeriesTableN([A, B], ctx))[0];
  assert.deepStrictEqual(headers(nway), headers(two));
  const byKey = (t) => Object.fromEntries(bodyRows(t).map((tr) => cells(tr)).map((c) => [c[0], c]));
  assert.deepStrictEqual(byKey(nway), byKey(two), 'same series, same stat cells per series, regardless of row order');
});

test('render: compareSeriesTableN — 3 players: one stat group per player; a series only one of them played still appears, blank for the others', () => {
  const { ctx, players } = fixture();
  const [A, B, C] = players;
  const html = R.compareSeriesTableN([A, B, C], ctx);
  const t = tables(html)[0];
  const head = headers(t);
  assert.strictEqual(head[0], 'Series');
  assert.deepStrictEqual(head.slice(1), [A.gamer_tag, B.gamer_tag, C.gamer_tag, ...Array(3).fill(['Best placement', 'Best W-L', 'Average W-L']).flat()]);
  const rows = bodyRows(t).map(cells);
  // "Lunar Exam" is only player A's; its B and C stat groups are present but empty.
  const lunar = rows.find((c) => c[0].startsWith('Lunar Exam'));
  assert.ok(lunar, 'a series only one player has still gets a row');
  assert.notStrictEqual(lunar[1], '', 'A\'s best-placement cell is filled');
  assert.strictEqual(lunar[4], '', 'B has no data for this series');
  assert.strictEqual(lunar[7], '', 'C has no data for this series');
  // "Melty Sweep" is only player B's.
  const melty = rows.find((c) => c[0].startsWith('Melty Sweep'));
  assert.ok(melty);
  assert.strictEqual(melty[1], '', 'A has no data for this series');
  assert.notStrictEqual(melty[4], '');
  // Blood Moon is shared by all three (rule 3's average-only-for-2+ still applies per side).
  const bm = rows.find((c) => c[0].startsWith('Blood Moon'));
  assert.ok(bm);
  for (const i of [1, 4, 7]) assert.notStrictEqual(bm[i], '', `Blood Moon best placement filled for player at cell ${i}`);
  assert.ok(!/<(ul|ol|li)\b/i.test(html));
  assert.ok(!/\b(total|wins|top[- ]?\d+|results?)\b/i.test(html.replace(/Best W-L|Average W-L/gi, '')));
});

test('render: the app row adds a pin button and data-pid; the CLI row does not', () => {
  const { ctx, players } = fixture();
  // The real app (app.js hydrate()) always sets ctx.app alongside the { app: true } row option —
  // that's what keeps the Tier column showing (A4-1) even before any registrant has one. The CLI
  // (views/major-table.js) never sets either.
  const app = R.summaryRow(players[0], { ...ctx, app: true }, { app: true });
  const cli = R.summaryRow(players[0], ctx);
  assert.match(app, /^<tr data-pid="1">/);
  assert.match(app, /<button class="pin"/);
  assert.ok(!cli.includes('button') && cli.startsWith('<tr><td class="team"'));
  // The app row: a compare checkbox and editable Tier/Notes cells; the static (CLI) row has neither.
  assert.match(app, /<input type="checkbox" class="sel"/);
  assert.match(app, /data-edit="tier"/);
  assert.match(app, /data-edit="notes"/);
  assert.ok(!/data-edit|class="sel"/.test(cli));
  // Lazy bodies leave the collapsed tables empty until opened.
  const lazy = R.playerBody(players[0], ctx, { lazy: true });
  assert.match(lazy, /data-lazy="game"/);
  assert.ok(tables(lazy).length < tables(R.playerBody(players[0], ctx)).length);
});

// A4-1 (build-record-webapp.md, pass 4): summaryHeadRow's Tier <th> and summaryRow's Tier <td>
// used to come from two different predicates (header: ctx.hasTiers || ctx.app; row: ctx.hasTiers
// || opts.app), so a context with ctx.app true but no opts.app -- exactly the compare panel's call
// (R.summaryRow(p, ctx), no opts, on the same ctx the main table already set .app on) -- got a
// header with one more <th> than every row has <td>s whenever no registrant had a tier yet. Both
// now read ctx.hasTiers || ctx.app (one source of truth, no opts fallback). This pins header cell
// count == row cell count for every context the app renders, with and without tiers.
function cellCounts({ ctx, players }) {
  // Strip nested tables (the "Other games" cell embeds its own <table class="mini"> of series
  // rows, per-player) before counting, so only the row's OWN top-level <td>s are counted.
  const topLevel = (html) => html.replace(/<table[\s\S]*?<\/table>/g, '');
  const headCount = (headHtml) => (topLevel(headHtml).match(/<th\b/g) || []).length;
  const rowCount = (rowHtml) => (topLevel(rowHtml).match(/<td\b/g) || []).length;
  return {
    cli: { head: headCount(R.summaryHeadRow(ctx)), row: rowCount(R.summaryRow(players[0], ctx)) },
    app: { head: headCount(R.summaryHeadRow({ ...ctx, app: true }, { app: true })), row: rowCount(R.summaryRow(players[0], { ...ctx, app: true }, { app: true })) },
    // The compare panel: ctx.app true (set once, by app.js's hydrate()), but no opts on either call
    // -- the exact shape of app.js's R.summaryHeadRow(ctx) / R.summaryRow(p, ctx) in the compare panel.
    compare: { head: headCount(R.summaryHeadRow({ ...ctx, app: true })), row: rowCount(R.summaryRow(players[0], { ...ctx, app: true })) },
  };
}
test('render: A4-1 — summary header and row cell counts always agree (app row, CLI row, compare row), with and without tiers', () => {
  const f = fixture(); // notes: {} -> ctx.hasTiers is false
  for (const [name, c] of Object.entries(cellCounts(f))) assert.strictEqual(c.row, c.head, `${name}: row cells vs header cells, no tiers yet`);

  // With a tier on one player (ctx.hasTiers true), every context must still agree -- and the CLI
  // and app contexts must now show the SAME columns as each other too (hasTiers alone is enough).
  const { ctx, players, rows, records } = f;
  const notes = { [players[0].player_id]: { tier: 5 } };
  const index = M.buildSeriesIndex(rows, { majors: majorsFor() });
  const columns = M.chooseColumns(players, rows.filter(M.isGame), index);
  const tieredCtx = R.summaryContext({ meta: ctx.meta, players, rows, records, notes, columns, index });
  const withTiers = cellCounts({ ctx: tieredCtx, players });
  for (const [name, c] of Object.entries(withTiers)) assert.strictEqual(c.row, c.head, `${name}: row cells vs header cells, with a tier present`);
  // Same columns, by key, in app and CLI once a tier exists. The only app-only column is "Seeded"
  // (Noah, 2026-10-16: the leftmost mark-as-seeded button), which must come first and never appear in the CLI.
  const cliKeys = R.summaryColumns(tieredCtx).map((c) => c.key);
  const appKeys = R.summaryColumns({ ...tieredCtx, app: true }).map((c) => c.key);
  assert.strictEqual(appKeys[0], 'seeded', 'Seeded is the leftmost column in the app');
  assert.ok(!cliKeys.includes('seeded'), 'no Seeded column outside the app');
  assert.deepStrictEqual(appKeys.slice(1), cliKeys, 'the Tier column (and every other column) is the same once a tier exists, app or not');
  assert.strictEqual(withTiers.app.head, withTiers.cli.head + 1, 'the app header has exactly one extra cell: Seeded');
});

test('render: summary text table (Sheets export) — same columns plus Prefix and player id, one line per cell, same rules', () => {
  const { ctx, players } = fixture();
  const ordered = M.orderPlayers(players, ctx.notes);
  const [head, ...body] = R.summaryTextTable(ctx, ordered);
  assert.deepStrictEqual(head.slice(0, 3), ['Team', 'Player', 'Region']);
  assert.strictEqual(head[head.length - 1], 'start.gg player id');
  assert.strictEqual(body.length, players.length);
  const p1 = body.find((r) => r[r.length - 1] === '1');
  const ceo = p1[head.indexOf('CEO')];
  assert.match(ceo, /^33rd \/ 400 · (\d+-\d+|—) \('26\)$/, 'major cell = placement / entrants · W-L (year)');
  const bm = p1[head.findIndex((h) => h.startsWith('Blood Moon'))];
  assert.match(bm, /^Best placement 1st \/ 20 · \d+-\d+; Best W-L \d+-\d+ \(.+\); Average W-L \d+\.\d-\d+\.\d over 2 events$/);
  for (const row of body) for (const c of row) assert.ok(!/[\r\n]/.test(c));
  // Columns in the export are the page's columns, in the page's order.
  assert.deepStrictEqual(head.filter((h) => h !== 'start.gg player id'), R.summaryColumns(ctx).map((c) => c.text));
});

test('notes: always a Notes column; other games grouped game > series with best placement · W-L, best W-L, avg W-L, date of best', () => {
  const { ctx, players } = fixture();
  assert.ok(R.summaryColumns(ctx).some((c) => c.key === 'notes'), 'Notes column present even with no notes.json');
  const keys = R.summaryColumns(ctx).map((c) => c.key);
  assert.ok(keys.indexOf('other') === keys.indexOf('notes') - 1, 'Other games is its own column, right before Notes');
  const extra = [
    row(1, 'OKSL Gear Grinds #84', { is_event_game: 'false', game_name: 'GGST', placement: '9', num_entrants: '12', event_date: '2025-01-18' }),
    row(1, 'OKSL Gear Grinds #85', { is_event_game: 'false', game_name: 'GGST', placement: '3', num_entrants: '12', event_date: '2025-02-01' }),
    row(1, 'Fight Night 9', { is_event_game: 'false', game_name: 'SF6', placement: '5', num_entrants: '30', event_date: '2025-05-05' }),
  ];
  const rows = [...Object.values(ctx.rowsBy).flat(), ...extra];
  const index = M.buildSeriesIndex(rows, { majors: majorsFor() });
  const c2 = R.summaryContext({ meta: ctx.meta, players, rows, records: ctx.records, notes: {}, columns: { majors: ctx.majors, shared: ctx.shared }, index });
  const games = R.otherGameSeries(c2.rowsBy['1'], c2.records, c2.index);
  assert.strictEqual(games[0].game, 'GGST', 'games ordered by events entered (GGST 3 > SF6 1)');
  const gear = games[0].series.find((s) => /OKSL Gear Grinds/.test(s.label));
  assert.ok(gear, 'OKSL Gear Grinds #84/#85 grouped as one series');
  const html = R.otherGamesCell(players[0], c2);
  assert.match(html, /<table class="mini">/, 'a table, not bullets');
  assert.match(html, /3rd \/ 12/, 'best placement out of entrants');
  assert.match(html, /2025-02-01/, 'date of the best placement');
  assert.doesNotMatch(html, /<ul|<li/, 'no bullets');
  const text = R.otherGamesText(players[0], c2);
  assert.match(text, /GGST \/ OKSL Gear Grinds: best 3rd \/ 12/);
  assert.match(R.otherGamesCell(players[3], c2), /—/);
  assert.match(R.notesCell(players[3], c2), /—/);
});

test('other series (this game): own column before Other games; excludes majors and shared-series columns', () => {
  const { ctx, players } = fixture();
  const keys = R.summaryColumns(ctx).map((c) => c.key);
  assert.strictEqual(keys.indexOf('more'), keys.indexOf('other') - 1, 'Other series sits right before Other games');
  const shown = new Set([...ctx.majors.map((m) => m.label), ...ctx.shared.map((s) => s.key)]);
  for (const p of players) {
    for (const s of R.otherSeriesOf(p, ctx)) assert.ok(!shown.has(s.key), `${s.label} is already a column`);
    const all = M.sortedSeries(ctx.gameBy[p.player_id] || [], ctx.records, ctx.index);
    assert.strictEqual(R.otherSeriesOf(p, ctx).length, all.filter((s) => !shown.has(s.key)).length, 'every other series of this game is listed');
  }
  const html = R.otherSeriesCell(players[1], ctx);
  assert.doesNotMatch(html, /<ul|<li/, 'no bullets');
  if (R.otherSeriesOf(players[1], ctx).length) assert.match(html, /<table class="mini">/);
});
