// lib/view/render.js — HTML for the seeding view's cells and tables, from the model in
// lib/view/model.js. Pure functions: data in, HTML string out.
//
// Shared by views/major-table.js (one static HTML file per run) and the app's browser code
// (served as /static/render.js, where it becomes window.SeedRender), so both show the same
// cells. Display rules (docs/usage-log.md, Ratified): per result show event name, placement out
// of entrants and W-L, date secondary; no aggregate counts; every series characterized by best
// placement (with W-L), best W-L and average W-L (average only for 2+ events); tables, not bullets.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./model'));
  else root.SeedRender = factory(root.SeedModel);
}(typeof self !== 'undefined' ? self : this, function (M) {
  'use strict';
  const { place, wlOf, wlText, eventLabel, BBB, MAJORS } = M;

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const dim = (s) => `<span class="dim">${s}</span>`;

  // One major column's cell: each of the player's tournaments in that major (main bracket),
  // newest first, as "placement / entrants · W-L 'YY".
  function majorCell(rows, major, records) {
    const hits = rows.filter((r) => r.is_event_game === 'true' && major.re.test(r.tournament_name));
    if (!hits.length) return '<span class="dim">—</span>';
    return M.mainBrackets(hits)
      .sort((a, b) => b.event_date.localeCompare(a.event_date))
      .map((r) => `<div class="line"><b>${place(r)}</b> · ${wlText(wlOf(records, r))} <span class="dim">'${r.event_date.slice(2, 4)}</span></div>`)
      .join('');
  }

  // A summary cell for one series, in the format Noah ratified on the BBB column (2026-10-14).
  function seriesCell(group, records) {
    if (!group) return '<span class="dim">—</span>';
    const { bestPlaced, best, avg } = M.seriesStats(group.rows, records);
    const lines = [];
    if (bestPlaced) lines.push(`Best placement: <b>${place(bestPlaced)}</b> · ${wlText(wlOf(records, bestPlaced))}`);
    if (best) lines.push(`Best W-L: <b>${best.rec.w}-${best.rec.l}</b> <span class="dim">(${place(best.r)})</span>`);
    if (avg && avg.n > 1) lines.push(`Average W-L: <b>${avg.w.toFixed(1)}-${avg.l.toFixed(1)}</b> <span class="dim">over ${avg.n} events</span>`);
    else if (group.rows.length === 1) lines.push('<span class="dim">1 event</span>');
    return lines.map((l) => `<div class="line">${l}</div>`).join('') || '<span class="dim">no placement or W-L</span>';
  }

  // The stat cells of one series row (best placement, best W-L, average W-L, each event), with
  // data-v sort keys. Shared by the per-player series table and the compare panel.
  function seriesStatCells(s, records) {
    if (!s) return '<td class="num" data-v="9"></td><td class="num" data-v="-1"></td><td class="num" data-v="-1"></td><td class="each"></td>';
    const { bestPlaced, best, avg } = s.st;
    const each = s.rows.map((r) => `<div class="line">${place(r)} · ${wlText(wlOf(records, r))} <span class="dim">${esc(r.event_date.slice(0, 7))}${r.event_name && r.event_name !== r.tournament_name ? ` · ${esc(r.event_name)}` : ''}</span></div>`).join('');
    return `<td class="num" data-v="${bestPlaced ? (+bestPlaced.placement / +bestPlaced.num_entrants).toFixed(4) : 9}">${bestPlaced ? `<b>${place(bestPlaced)}</b> · ${wlText(wlOf(records, bestPlaced))}` : '—'}</td>`
      + `<td class="num" data-v="${best ? (best.rec.w / (best.rec.w + best.rec.l)).toFixed(4) : -1}">${best ? `<b>${best.rec.w}-${best.rec.l}</b> <span class="dim">(${place(best.r)})</span>` : '—'}</td>`
      + `<td class="num" data-v="${avg ? (avg.w / (avg.w + avg.l || 1)).toFixed(4) : -1}">${avg && avg.n > 1 ? `<b>${avg.w.toFixed(1)}-${avg.l.toFixed(1)}</b>` : '<span class="dim">—</span>'}</td>`
      + `<td class="each">${s.rows.length > 4 ? `<details><summary>${s.rows.length} events</summary>${each}</details>` : each}</td>`;
  }
  const seriesBadges = (s) => (M.isMajorLabel(s.key) ? ' <span class="tag major">major</span>' : '')
    + (s.rows.every((r) => r.is_online === 'true') ? ' <span class="tag">online</span>' : '');

  function seriesTable(rows, records, { withGame = false, index } = {}) {
    const series = M.sortedSeries(rows, records, index);
    const head = ['Series', ...(withGame ? ['Game'] : []), 'Events', 'Best placement', 'Best W-L', 'Average W-L', 'Each event (placement · W-L)'];
    const body = series.map((s) => {
      const games = [...new Set(s.rows.map((r) => r.game_name))].join(', ');
      return `<tr><td><b>${esc(s.label)}</b>${seriesBadges(s)}</td>${withGame ? `<td>${esc(games)}</td>` : ''}`
        + `<td class="num" data-v="${s.rows.length}">${s.rows.length}</td>`
        + seriesStatCells(s, records) + '</tr>';
    }).join('');
    return `<table class="res sortable"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
  }

  function resultsTable(rs, records, { withGame = false } = {}) {
    const head = ['Event', ...(withGame ? ['Game'] : []), 'Placement', 'W-L', 'Date'];
    const sorted = [...rs].sort((a, b) => +b.num_entrants - +a.num_entrants || b.event_date.localeCompare(a.event_date));
    const body = sorted.map((r) => {
      const rec = wlOf(records, r);
      const badge = r.is_event_game === 'true' && M.isMajor(r) ? ' <span class="tag major">major</span>'
        : r.is_event_game === 'true' && BBB.test(r.tournament_name) ? ' <span class="tag">BBB</span>' : '';
      const online = r.is_online === 'true' ? ' <span class="tag">online</span>' : '';
      return `<tr><td>${esc(eventLabel(r))}${badge}${online}</td>${withGame ? `<td>${esc(r.game_name)}</td>` : ''}`
        + `<td class="num" data-v="${r.placement ? (+r.placement / +r.num_entrants).toFixed(4) : 9}" data-n="${r.num_entrants}"><b>${place(r)}</b></td>`
        + `<td class="num" data-v="${rec ? (rec.w / (rec.w + rec.l)).toFixed(4) : -1}">${wlText(rec)}</td>`
        + `<td class="date" data-v="${r.event_date}">${r.event_date}</td></tr>`;
    }).join('');
    return `<table class="res sortable"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
  }

  // ---- The summary --------------------------------------------------------------------------
  // ctx (build with summaryContext): meta, players, rowsBy, gameBy, records, notes, hasNotes,
  // majors (MAJORS entries), shared ([{key,label,n}]), groupsBy (player -> series key -> group).
  function summaryContext({ meta, players, rows, records, notes, columns, index }) {
    const rowsBy = M.rowsByPlayer(rows);
    const gameBy = M.rowsByPlayer(rows.filter(M.isGame));
    const majors = columns.majors.map((m) => (typeof m === 'string' ? MAJORS.find((x) => x.label === m) : m));
    const groupsBy = columns.groupsBy || Object.fromEntries(players.map((p) => [p.player_id,
      Object.fromEntries(M.groupSeries(gameBy[p.player_id] || [], index).map((g) => [g.key, g]))]));
    return { meta, players, rowsBy, gameBy, records, notes, hasNotes: players.some((p) => notes[p.player_id]),
      majors, shared: columns.shared, groupsBy, index };
  }

  function summaryHead(ctx) {
    return [...(ctx.hasNotes ? ['Seed'] : []), 'Player', 'Region', ...ctx.majors.map((m) => m.label),
      ...ctx.shared.map((s) => `${esc(s.label)} <span class="dim">(${s.n} of ${ctx.players.length})</span>`), ...(ctx.hasNotes ? ['Notes'] : [])];
  }
  const summaryHeadRow = (ctx) => `<tr>${summaryHead(ctx).map((h) => `<th${h === 'Player' ? ' class="who"' : ''}>${h}</th>`).join('')}</tr>`;

  // opts.app: the app's row (data-pid on the row, a pin button, the player link handled by the app).
  function summaryRow(p, ctx, opts = {}) {
    const rows = ctx.rowsBy[p.player_id] || [];
    const n = ctx.notes[p.player_id] || {};
    const reg = M.region(p);
    const pin = opts.app ? `<button class="pin" type="button" title="Pin this row under the header" aria-label="Pin ${esc(p.gamer_tag)}">📌</button>` : '';
    return `<tr${opts.app ? ` data-pid="${esc(p.player_id)}"` : ''}>${ctx.hasNotes ? `<td class="seed">${esc(n.seed ?? '')}</td>` : ''}`
      + `<td class="who">${pin}<a href="#p${p.player_id}"><b>${esc(p.gamer_tag)}</b></a>${p.prefix ? ` <span class="dim">${esc(p.prefix)}</span>` : ''}`
      + `${(ctx.gameBy[p.player_id] || []).length ? '' : `<div class="dim">no ${esc(ctx.meta.game.name)} results</div>`}</td>`
      + `<td>${esc(reg) || '<span class="dim">—</span>'}</td>`
      + ctx.majors.map((m) => `<td>${majorCell(rows, m, ctx.records)}</td>`).join('')
      + ctx.shared.map((s) => `<td>${seriesCell(ctx.groupsBy[p.player_id][s.key], ctx.records)}</td>`).join('')
      + `${ctx.hasNotes ? `<td class="notes">${esc(n.notes || '')}</td>` : ''}</tr>`;
  }

  // ---- One player's detail --------------------------------------------------------------------
  function playerTitle(p) {
    const reg = M.region(p);
    return `<h2 id="p${p.player_id}">${esc(p.gamer_tag)}${p.prefix ? ` <span class="dim">${esc(p.prefix)}</span>` : ''}`
      + `${reg ? ` <span class="dim">· ${esc(reg)}</span>` : ''}</h2>`;
  }
  // The body under the title. opts.lazy leaves the two collapsed tables empty, marked
  // data-lazy="game" / "other"; the app fills them when they are opened (renderLazy).
  function playerBody(p, ctx, opts = {}) {
    const rows = ctx.rowsBy[p.player_id] || [];
    const game = rows.filter(M.isGame);
    const other = rows.filter((r) => !M.isGame(r));
    const gameName = esc(ctx.meta.game.name);
    if (!rows.length) return '<p class="dim">No results on start.gg in the last two years.</p>';
    const lazy = (which, html) => (opts.lazy ? `<div data-lazy="${which}" data-pid="${esc(p.player_id)}"></div>` : html());
    return (game.length ? seriesTable(game, ctx.records, { index: ctx.index })
      + `<details><summary>Every ${gameName} result (${game.length})</summary>${lazy('game', () => resultsTable(game, ctx.records))}</details>`
      : `<p class="dim">No ${gameName} results.</p>`)
      + (other.length ? `<details><summary>Other games (${other.length} results${ctx.allGames ? '' : (ctx.otherNote ?? '; W-L not fetched, run with --all-games')})</summary>${lazy('other', () => seriesTable(other, ctx.records, { withGame: true, index: ctx.index }))}</details>` : '');
  }
  function renderLazy(which, p, ctx) {
    const rows = ctx.rowsBy[p.player_id] || [];
    return which === 'game' ? resultsTable(rows.filter(M.isGame), ctx.records)
      : seriesTable(rows.filter((r) => !M.isGame(r)), ctx.records, { withGame: true, index: ctx.index });
  }

  // ---- Compare --------------------------------------------------------------------------------
  const tagOf = (p) => esc(p ? p.gamer_tag : '');
  function bothEnteredTable(pA, pB, ctx) {
    const pairs = M.eventsBothEntered(ctx.rowsBy[pA.player_id] || [], ctx.rowsBy[pB.player_id] || []);
    if (!pairs.length) return `<p class="dim">${tagOf(pA)} and ${tagOf(pB)} entered no event in common in the window.</p>`;
    const cell = (r) => {
      const rec = wlOf(ctx.records, r);
      return `<td class="num" data-v="${r.placement ? (+r.placement / +r.num_entrants).toFixed(4) : 9}"><b>${place(r)}</b> · ${wlText(rec)}</td>`;
    };
    const body = pairs.map(({ a, b }) => {
      const other = a.is_event_game !== 'true' ? ` <span class="tag">${esc(a.game_name)}</span>` : '';
      const badge = a.is_event_game === 'true' && M.isMajor(a) ? ' <span class="tag major">major</span>' : '';
      return `<tr><td>${esc(eventLabel(a))}${badge}${other}</td>${cell(a)}${cell(b)}<td class="date" data-v="${a.event_date}">${a.event_date}</td></tr>`;
    }).join('');
    return `<table class="res sortable"><thead><tr><th>Event</th><th>${tagOf(pA)}: placement · W-L</th><th>${tagOf(pB)}: placement · W-L</th><th>Date</th></tr></thead><tbody>${body}</tbody></table>`;
  }
  function compareSeriesTable(pA, pB, ctx) {
    const game = (p) => (ctx.rowsBy[p.player_id] || []).filter(M.isGame);
    const rows = M.alignSeries(M.sortedSeries(game(pA), ctx.records, ctx.index), M.sortedSeries(game(pB), ctx.records, ctx.index));
    if (!rows.length) return `<p class="dim">Neither player has ${esc(ctx.meta.game.name)} results.</p>`;
    const sub = ['Best placement', 'Best W-L', 'Average W-L', 'Each event (placement · W-L)'];
    const body = rows.map((x) => `<tr class="${x.a && x.b ? 'both' : ''}"><td><b>${esc(x.label)}</b>${seriesBadges(x.a || x.b)}</td>`
      + `${seriesStatCells(x.a, ctx.records)}${seriesStatCells(x.b, ctx.records)}</tr>`).join('');
    return '<table class="res cmp-series"><thead>'
      + `<tr><th rowspan="2">Series</th><th colspan="4" class="side">${tagOf(pA)}</th><th colspan="4" class="side">${tagOf(pB)}</th></tr>`
      + `<tr>${[...sub, ...sub].map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
  }

  return {
    esc, dim, majorCell, seriesCell, seriesStatCells, seriesTable, resultsTable,
    summaryContext, summaryHead, summaryHeadRow, summaryRow, playerTitle, playerBody, renderLazy,
    bothEnteredTable, compareSeriesTable,
  };
}));
