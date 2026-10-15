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

  // The stat cells of one series row (best placement, best W-L, average W-L, and each event unless
  // each: false), with data-v sort keys. Shared by the per-player series table and the compare panel.
  function seriesStatCells(s, records, { each: withEach = true } = {}) {
    if (!s) return '<td class="num" data-v="9"></td><td class="num" data-v="-1"></td><td class="num" data-v="-1"></td>' + (withEach ? '<td class="each"></td>' : '');
    const { bestPlaced, best, avg } = s.st;
    const each = s.rows.map((r) => `<div class="line">${place(r)} · ${wlText(wlOf(records, r))} <span class="dim">${esc(r.event_date.slice(0, 7))}${r.event_name && r.event_name !== r.tournament_name ? ` · ${esc(r.event_name)}` : ''}</span></div>`).join('');
    return `<td class="num" data-v="${bestPlaced ? (+bestPlaced.placement / +bestPlaced.num_entrants).toFixed(4) : 9}">${bestPlaced ? `<b>${place(bestPlaced)}</b> · ${wlText(wlOf(records, bestPlaced))}` : '—'}</td>`
      + `<td class="num" data-v="${best ? (best.rec.w / (best.rec.w + best.rec.l)).toFixed(4) : -1}">${best ? `<b>${best.rec.w}-${best.rec.l}</b> <span class="dim">(${place(best.r)})</span>` : '—'}</td>`
      + `<td class="num" data-v="${avg ? (avg.w / (avg.w + avg.l || 1)).toFixed(4) : -1}">${avg && avg.n > 1 ? `<b>${avg.w.toFixed(1)}-${avg.l.toFixed(1)}</b>` : '<span class="dim">—</span>'}</td>`
      + (withEach ? `<td class="each">${s.rows.length > 4 ? `<details><summary>${s.rows.length} events</summary>${each}</details>` : each}</td>` : '');
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

  // ---- Notes: free-text notes + other games -----------------------------------------------------
  // Per Noah (2026-10-15): "a notes column that also includes results from other games … organizing
  // by game, then by event series, then best placement out of entrants, best win-loss, average
  // win-loss, and the date of the best placement." Games in order of how many events the player
  // entered; series within a game by largest field (sortedSeries). The cell is collapsed to one
  // line (notesCell); notesTable(limit=true) would cap it at NOTES_SERIES series per game.
  const NOTES_SERIES = 3;
  function otherGameSeries(rows, records, index) {
    const other = rows.filter((r) => !M.isGame(r));
    const byGame = {};
    for (const r of other) (byGame[r.game_name] ??= []).push(r);
    return Object.entries(byGame)
      .map(([game, rs]) => ({ game, n: M.mainBrackets(rs).length, series: M.sortedSeries(rs, records, index) }))
      .sort((a, b) => b.n - a.n || a.game.localeCompare(b.game));
  }
  function notesTable(games, records, limit) {
    const body = games.map((g) => {
      const series = limit ? g.series.slice(0, NOTES_SERIES) : g.series;
      return series.map((s, i) => {
        const { bestPlaced, best, avg } = s.st;
        return `<tr>${i === 0 ? `<th class="game" rowspan="${series.length}">${esc(g.game)}</th>` : ''}`
          + `<td>${esc(s.label)}</td>`
          + `<td class="num">${bestPlaced ? `<b>${place(bestPlaced)}</b> · ${wlText(wlOf(records, bestPlaced))}` : '—'}</td>`
          + `<td class="num">${best ? `${best.rec.w}-${best.rec.l}` : '—'}</td>`
          + `<td class="num">${avg && avg.n > 1 ? `${avg.w.toFixed(1)}-${avg.l.toFixed(1)}` : dim('—')}</td>`
          + `<td class="date">${bestPlaced ? esc(bestPlaced.event_date) : ''}</td></tr>`;
      }).join('');
    }).join('');
    return '<table class="mini"><thead><tr><th>Game</th><th>Series</th><th>Best placement</th><th>Best W-L</th><th>Avg W-L</th><th>Date of best</th></tr></thead>'
      + `<tbody>${body}</tbody></table>`;
  }
  // Collapsed to one line so summary rows stay short (Noah, 2026-10-15: "notes should be expandable
  // so rows arent so tall"): the summary line is the note (truncated) and the other games' names;
  // expanding shows the full note and every other game's series table.
  function notesCell(p, ctx) {
    const n = ctx.notes[p.player_id] || {};
    const games = otherGameSeries(ctx.rowsBy[p.player_id] || [], ctx.records, ctx.index);
    if (!games.length && !n.notes) return dim('No other games');
    const note = n.notes ? String(n.notes) : '';
    const short = note.length > 60 ? `${note.slice(0, 57)}…` : note;
    const gameNames = games.map((g) => g.game).join(', ');
    const line = [short && `<span class="note-short">${esc(short)}</span>`, gameNames && dim(esc(gameNames))].filter(Boolean).join(' · ');
    return `<details class="notes-x"><summary>${line}</summary>`
      + (note ? `<div class="note-text">${esc(note)}</div>` : '')
      + (games.length ? notesTable(games, ctx.records, false) : dim('No other games'))
      + '</details>';
  }
  function notesText(p, ctx) {
    const n = ctx.notes[p.player_id] || {};
    const games = otherGameSeries(ctx.rowsBy[p.player_id] || [], ctx.records, ctx.index);
    const parts = games.flatMap((g) => g.series.map((s) => {
      const { bestPlaced, best, avg } = s.st;
      return `${g.game} / ${s.label}: best ${bestPlaced ? `${place(bestPlaced)} · ${wlText(wlOf(ctx.records, bestPlaced))} (${bestPlaced.event_date})` : '—'}`
        + `${best ? `, best W-L ${best.rec.w}-${best.rec.l}` : ''}${avg && avg.n > 1 ? `, avg W-L ${avg.w.toFixed(1)}-${avg.l.toFixed(1)}` : ''}`;
    }));
    return [String(n.notes || '').replace(/\s*\n\s*/g, ' '), ...parts].filter(Boolean).join('; ');
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
    return { meta, players, rowsBy, gameBy, records, notes, hasNotes: players.some((p) => notes[p.player_id]?.seed != null),
      hasTiers: players.some((p) => Number.isFinite(notes[p.player_id]?.tier)),
      majors, shared: columns.shared, groupsBy, index };
  }

  // The summary's columns, in order: a stable key (survives a refresh that changes the shared
  // series), the header HTML, and the header as plain text (the CSV export).
  function summaryColumns(ctx) {
    const of = ctx.players.length;
    return [
      ...(ctx.hasNotes ? [{ key: 'seed', html: 'Seed', text: 'Seed' }] : []),
      { key: 'player', html: 'Player', text: 'Player' },
      ...(ctx.hasTiers ? [{ key: 'tier', html: 'Tier', text: 'Tier' }] : []),
      { key: 'region', html: 'Region', text: 'Region' },
      ...ctx.majors.map((m) => ({ key: `major:${m.label}`, html: m.label, text: m.label })),
      ...ctx.shared.map((s) => ({ key: `series:${s.key}`, html: `${esc(s.label)} <span class="dim">(${s.n} of ${of})</span>`, text: `${s.label} (${s.n} of ${of})` })),
      { key: 'notes', html: 'Notes <span class="dim">(other games)</span>', text: 'Notes (other games)' },
    ];
  }
  function summaryHead(ctx) { return summaryColumns(ctx).map((c) => c.html); }
  // opts.app: each header carries data-col and a freeze toggle (the app's freeze-columns control).
  function summaryHeadRow(ctx, opts = {}) {
    return `<tr>${summaryColumns(ctx).map((c) => {
      const cls = c.key === 'player' ? ' class="who"' : '';
      if (!opts.app) return `<th${cls}>${c.html}</th>`;
      const fz = c.key === 'player' ? '' : `<button class="freeze" type="button" aria-pressed="false" title="Freeze this column when scrolling sideways">❄</button>`;
      return `<th${cls} data-col="${esc(c.key)}">${c.html}${fz}</th>`;
    }).join('')}</tr>`;
  }

  // opts.app: the app's row (data-pid on the row, a pin button, the player link handled by the app).
  function summaryRow(p, ctx, opts = {}) {
    const rows = ctx.rowsBy[p.player_id] || [];
    const n = ctx.notes[p.player_id] || {};
    const reg = M.region(p);
    const pin = opts.app ? `<button class="pin" type="button" title="Pin this row under the header" aria-label="Pin ${esc(p.gamer_tag)}">📌</button>` : '';
    const tiered = Number.isFinite(n.tier);
    return `<tr${opts.app ? ` data-pid="${esc(p.player_id)}"` : ''}${ctx.hasTiers && !tiered ? ' class="untiered"' : ''}>${ctx.hasNotes ? `<td class="seed">${esc(n.seed ?? '')}</td>` : ''}`
      + `<td class="who">${pin}<a href="#p${p.player_id}"><b>${esc(p.gamer_tag)}</b></a>${p.prefix ? ` <span class="dim">${esc(p.prefix)}</span>` : ''}`
      + `${(ctx.gameBy[p.player_id] || []).length ? '' : `<div class="dim">no ${esc(ctx.meta.game.name)} results</div>`}</td>`
      + (ctx.hasTiers ? `<td class="tier">${tiered ? `<b>${n.tier}</b>` : '<span class="tag needs">needs tier</span>'}</td>` : '')
      + `<td${opts.app ? ' class="region"' : ''}>${esc(reg) || '<span class="dim">—</span>'}</td>`
      + ctx.majors.map((m) => `<td>${majorCell(rows, m, ctx.records)}</td>`).join('')
      + ctx.shared.map((s) => `<td>${seriesCell(ctx.groupsBy[p.player_id][s.key], ctx.records)}</td>`).join('')
      + `<td class="notes">${notesCell(p, ctx)}</td></tr>`;
  }

  // ---- The summary as plain text (the Google Sheets export) ------------------------------------
  // Same content as the HTML cells, each cell on one line: a cell's lines are joined with "; ".
  const majorText = (rows, major, records) => {
    const hits = rows.filter((r) => r.is_event_game === 'true' && major.re.test(r.tournament_name));
    return M.mainBrackets(hits).sort((a, b) => b.event_date.localeCompare(a.event_date))
      .map((r) => `${place(r)} · ${wlText(wlOf(records, r))} ('${r.event_date.slice(2, 4)})`).join('; ') || '—';
  };
  function seriesText(group, records) {
    if (!group) return '—';
    const { bestPlaced, best, avg } = M.seriesStats(group.rows, records);
    const parts = [];
    if (bestPlaced) parts.push(`Best placement ${place(bestPlaced)} · ${wlText(wlOf(records, bestPlaced))}`);
    if (best) parts.push(`Best W-L ${best.rec.w}-${best.rec.l} (${place(best.r)})`);
    if (avg && avg.n > 1) parts.push(`Average W-L ${avg.w.toFixed(1)}-${avg.l.toFixed(1)} over ${avg.n} events`);
    else if (group.rows.length === 1) parts.push('1 event');
    return parts.join('; ') || 'no placement or W-L';
  }
  // [header, ...one row per player] as plain strings, in the page's row order. Adds Prefix and
  // the start.gg player_id (the join key for a tiers/registry sheet) as their own columns.
  function summaryTextTable(ctx, ordered) {
    const cols = summaryColumns(ctx);
    const head = [];
    for (const c of cols) { head.push(c.text); if (c.key === 'player') head.push('Prefix'); }
    head.push('start.gg player id');
    const body = ordered.map((p) => {
      const rows = ctx.rowsBy[p.player_id] || [];
      const n = ctx.notes[p.player_id] || {};
      const out = [];
      for (const c of cols) {
        if (c.key === 'seed') out.push(String(n.seed ?? ''));
        else if (c.key === 'player') out.push(p.gamer_tag, p.prefix || '');
        else if (c.key === 'tier') out.push(Number.isFinite(n.tier) ? String(n.tier) : '');
        else if (c.key === 'region') out.push(M.region(p));
        else if (c.key === 'notes') out.push(notesText(p, ctx));
        else if (c.key.startsWith('major:')) out.push(majorText(rows, ctx.majors.find((m) => `major:${m.label}` === c.key), ctx.records));
        else out.push(seriesText(ctx.groupsBy[p.player_id][c.key.slice('series:'.length)], ctx.records));
      }
      out.push(String(p.player_id));
      return out;
    });
    return [head, ...body];
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
    const sub = ['Best placement', 'Best W-L', 'Average W-L'];
    const body = rows.map((x) => `<tr class="${x.a && x.b ? 'both' : ''}"><td><b>${esc(x.label)}</b>${seriesBadges(x.a || x.b)}</td>`
      + `${seriesStatCells(x.a, ctx.records, { each: false })}${seriesStatCells(x.b, ctx.records, { each: false })}</tr>`).join('');
    return '<table class="res cmp-series"><thead>'
      + `<tr><th rowspan="2">Series</th><th colspan="3" class="side">${tagOf(pA)}</th><th colspan="3" class="side">${tagOf(pB)}</th></tr>`
      + `<tr>${[...sub, ...sub].map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
  }

  return {
    esc, dim, majorCell, seriesCell, seriesStatCells, seriesTable, resultsTable,
    summaryContext, summaryColumns, summaryHead, summaryHeadRow, summaryRow, playerTitle, playerBody, renderLazy,
    majorText, seriesText, summaryTextTable, otherGameSeries, notesCell, notesText,
    bothEnteredTable, compareSeriesTable,
  };
}));
