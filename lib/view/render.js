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
  const { place, wlOf, wlText, eventLabel, BBB } = M;

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const dim = (s) => `<span class="dim">${s}</span>`;

  // A row is a major result when the run's index keyed it to a major (lib/view/model.js
  // mainEventMajors: the seeded game's main event at that tournament, one per year per column).
  const isMajorRow = (r, index) => !!(index && index.isMajorKey && M.isGame(r) && index.isMajorKey(index.keyOf(r)));
  // One major column's results for a player, newest first: at most one per year, by construction.
  const majorHits = (rows, major, index) => (index ? rows.filter((r) => M.isGame(r) && index.keyOf(r) === major.label) : [])
    .sort((a, b) => b.event_date.localeCompare(a.event_date));

  // One major column's cell: the player's result at that major's main event, one line per year,
  // newest first, as "placement / entrants · W-L 'YY".
  function majorCell(rows, major, records, index) {
    const hits = majorHits(rows, major, index);
    if (!hits.length) return '<span class="dim">—</span>';
    return hits.map((r) => `<div class="line"><b>${place(r)}</b> · ${wlText(wlOf(records, r))} <span class="dim">'${r.event_date.slice(2, 4)}</span></div>`).join('');
  }

  // Sort keys for summary cells (the app sorts on data-v): best placement relative to field size,
  // so a 9th of 300 ranks above a 2nd of 12. Lower is better; 9 = no placement.
  const ratio = (r) => (r && r.placement ? +r.placement / +r.num_entrants : 9);
  function majorSortKey(rows, major, index) {
    const hits = majorHits(rows, major, index);
    return hits.length ? Math.min(...hits.map(ratio)) : 9;
  }
  function seriesSortKey(group, records) {
    return group ? ratio(M.seriesStats(group.rows, records).bestPlaced) : 9;
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
  const seriesBadges = (s, index) => (index && index.isMajorKey && index.isMajorKey(s.key) ? ' <span class="tag major">major</span>' : '')
    + (s.rows.every((r) => r.is_online === 'true') ? ' <span class="tag">online</span>' : '');

  function seriesTable(rows, records, { withGame = false, index } = {}) {
    const series = M.sortedSeries(rows, records, index);
    const head = ['Series', ...(withGame ? ['Game'] : []), 'Events', 'Best placement', 'Best W-L', 'Average W-L', 'Each event (placement · W-L)'];
    const body = series.map((s) => {
      const games = [...new Set(s.rows.map((r) => r.game_name))].join(', ');
      return `<tr><td><b>${esc(s.label)}</b>${seriesBadges(s, index)}</td>${withGame ? `<td>${esc(games)}</td>` : ''}`
        + `<td class="num" data-v="${s.rows.length}">${s.rows.length}</td>`
        + seriesStatCells(s, records) + '</tr>';
    }).join('');
    return `<table class="res sortable"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
  }

  function resultsTable(rs, records, { withGame = false, index } = {}) {
    const head = ['Event', ...(withGame ? ['Game'] : []), 'Placement', 'W-L', 'Date'];
    const sorted = [...rs].sort((a, b) => +b.num_entrants - +a.num_entrants || b.event_date.localeCompare(a.event_date));
    const body = sorted.map((r) => {
      const rec = wlOf(records, r);
      const badge = isMajorRow(r, index) ? ' <span class="tag major">major</span>'
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
  // Other games, its own column before Notes (Noah, 2026-10-15): collapsed to the game names so rows
  // stay short; expand for game > series > best placement · W-L, best W-L, avg W-L, date of best.
  // Other series in THIS game (Noah, 2026-10-16: "include a column for results for the game outside of
  // just the specific events"): every series of the event's game that isn't already a major or
  // shared-series column, collapsed to their names (largest field first); expand for series >
  // best placement · W-L, best W-L, avg W-L, date of best. Same format as Other games.
  function otherSeriesOf(p, ctx) {
    const shown = new Set([...ctx.majors.map((m) => m.label), ...ctx.shared.map((s) => s.key)]);
    return M.sortedSeries(ctx.gameBy[p.player_id] || [], ctx.records, ctx.index).filter((s) => !shown.has(s.key));
  }
  function seriesMiniTable(series, records) {
    const body = series.map((s) => {
      const { bestPlaced, best, avg } = s.st;
      return `<tr><td>${esc(s.label)}</td>`
        + `<td class="num">${bestPlaced ? `<b>${place(bestPlaced)}</b> · ${wlText(wlOf(records, bestPlaced))}` : '—'}</td>`
        + `<td class="num">${best ? `${best.rec.w}-${best.rec.l}` : '—'}</td>`
        + `<td class="num">${avg && avg.n > 1 ? `${avg.w.toFixed(1)}-${avg.l.toFixed(1)}` : dim('—')}</td>`
        + `<td class="date">${bestPlaced ? esc(bestPlaced.event_date) : ''}</td></tr>`;
    }).join('');
    return '<table class="mini"><thead><tr><th>Series</th><th>Best placement</th><th>Best W-L</th><th>Avg W-L</th><th>Date of best</th></tr></thead>'
      + `<tbody>${body}</tbody></table>`;
  }
  function otherSeriesCell(p, ctx) {
    const series = otherSeriesOf(p, ctx);
    if (!series.length) return dim('—');
    return `<details class="notes-x"><summary>${esc(series.map((s) => s.label).join(', '))}</summary>${seriesMiniTable(series, ctx.records)}</details>`;
  }
  function otherSeriesText(p, ctx) {
    return otherSeriesOf(p, ctx).map((s) => {
      const { bestPlaced, best, avg } = s.st;
      return `${s.label}: best ${bestPlaced ? `${place(bestPlaced)} · ${wlText(wlOf(ctx.records, bestPlaced))} (${bestPlaced.event_date})` : '—'}`
        + `${best ? `, best W-L ${best.rec.w}-${best.rec.l}` : ''}${avg && avg.n > 1 ? `, avg W-L ${avg.w.toFixed(1)}-${avg.l.toFixed(1)}` : ''}`;
    }).join('; ');
  }
  const otherSeriesSortKey = (p, ctx) => {
    const r = otherSeriesOf(p, ctx).map((s) => s.st.bestPlaced).filter(Boolean).map(ratio);
    return r.length ? Math.min(...r) : 9;
  };

  function otherGamesCell(p, ctx) {
    const games = otherGameSeries(ctx.rowsBy[p.player_id] || [], ctx.records, ctx.index);
    if (!games.length) return dim('—');
    return `<details class="notes-x"><summary>${esc(games.map((g) => g.game).join(', '))}</summary>${notesTable(games, ctx.records, false)}</details>`;
  }
  function otherGamesText(p, ctx) {
    const games = otherGameSeries(ctx.rowsBy[p.player_id] || [], ctx.records, ctx.index);
    return games.flatMap((g) => g.series.map((s) => {
      const { bestPlaced, best, avg } = s.st;
      return `${g.game} / ${s.label}: best ${bestPlaced ? `${place(bestPlaced)} · ${wlText(wlOf(ctx.records, bestPlaced))} (${bestPlaced.event_date})` : '—'}`
        + `${best ? `, best W-L ${best.rec.w}-${best.rec.l}` : ''}${avg && avg.n > 1 ? `, avg W-L ${avg.w.toFixed(1)}-${avg.l.toFixed(1)}` : ''}`;
    })).join('; ');
  }
  // Notes: Noah's note (editable in the app). Long notes are clamped by CSS. There is no tier
  // reason: increment 3 dropped the justification field (docs/design-tool.md, T1: the results are
  // the justification).
  function notesCell(p, ctx) {
    const n = ctx.notes[p.player_id] || {};
    if (!n.notes) return dim('—');
    return `<div class="note-text" title="${esc(n.notes)}">${esc(n.notes)}</div>`;
  }
  function notesText(p, ctx) {
    const n = ctx.notes[p.player_id] || {};
    return String(n.notes || '').replace(/\s*\n\s*/g, ' ');
  }

  // ---- Review mark and tier recency (T1 rules; display rule 9) -------------------------------
  // The Tier cell's hover text: when and where this player was last reviewed.
  function recencyTitle(n, ctx) {
    const band = M.recency(n, ctx);
    if (!band) return '';
    // B4-3 (build A pass 4): name the sheet only when the tier came from it; a tier set in the app
    // and never ✓'d is "never reviewed" too, but not "from the sheet import".
    if (band === 'never') return n.source === 'app' ? 'Never reviewed' : 'Never reviewed (tier from the sheet import)';
    return `Last reviewed ${n.last_reviewed_on || '?'} at ${n.last_reviewed_tournament || '?'}`
      + (band === 'here' ? ' (this tournament)' : band === 'old' ? ` (over ${M.RECENT_MONTHS} months ago)` : '');
  }

  // ---- Tag-only match (Amendment A1.2) --------------------------------------------------------
  // A tiers row found by tag only (lib/view/data.js readNotes tag_only: the row has no start.gg id
  // yet) gets its own Tier-cell color, light blue (app.css --tag-only-*; views/major-table.js), in
  // place of the recency color, and this hover text before the recency one. The table, the compare
  // panel and the CLI view all draw the cell through tierCellClass/tierCellTitle.
  const TAG_ONLY_TITLE = 'Matched by tag only: this tiers row has no start.gg id yet. A ✓ or an edit links it to this player.';
  function tierCellClass(n, ctx) {
    if (n && n.tag_only) return 'tier match-tag';
    const band = M.recency(n, ctx);
    return `tier${band ? ` rec-${band}` : ''}`;
  }
  function tierCellTitle(n, ctx) {
    const rec = recencyTitle(n, ctx);
    return n && n.tag_only ? [TAG_ONLY_TITLE, rec].filter(Boolean).join(' · ') : rec;
  }

  // ---- The summary --------------------------------------------------------------------------
  // ctx (build with summaryContext): meta, players, rowsBy, gameBy, records, notes, hasNotes,
  // majors ([{label}], the run's major columns), shared ([{key,label,n}]), groupsBy (player ->
  // series key -> group), index, tournament (the page's tournament slug) and today (YYYY-MM-DD);
  // the last two drive the review mark and the tier recency color.
  function summaryContext({ meta, players, rows, records, notes, columns, index, tournament, today }) {
    const rowsBy = M.rowsByPlayer(rows);
    const gameBy = M.rowsByPlayer(rows.filter(M.isGame));
    const majors = columns.majors.map((m) => (typeof m === 'string' ? { label: m } : m));
    const groupsBy = columns.groupsBy || Object.fromEntries(players.map((p) => [p.player_id,
      Object.fromEntries(M.groupSeries(gameBy[p.player_id] || [], index).map((g) => [g.key, g]))]));
    return { meta, players, rowsBy, gameBy, records, notes, hasNotes: players.some((p) => notes[p.player_id]?.seed != null),
      hasTiers: players.some((p) => Number.isFinite(notes[p.player_id]?.tier)),
      majors, shared: columns.shared, groupsBy, index, tournament, today };
  }

  // The context for the view model the server sends (lib/view/data.js viewModel): rows arrive as
  // arrays in model.cols order, each with its series key in 's'. The app (app/public/app.js) and
  // the CLI view (views/major-table.js) both build their context here, so both render the same
  // cells from the same data. opts.app: the app's page (the Tier and Seeded columns always show;
  // no "W-L not fetched" note on other games).
  function contextFromViewModel(model, { app = true } = {}) {
    const cols = model.cols;
    const rows = model.rows.map((a) => { const o = {}; for (let i = 0; i < cols.length; i++) o[cols[i]] = a[i]; return o; });
    const c = summaryContext({ meta: model.meta, players: model.players, rows, records: model.records, notes: model.notes || {},
      columns: model.columns, index: M.indexFromKeys(model.labels, model.columns.majors), tournament: model.tournament, today: model.today });
    if (app) { c.app = true; c.otherNote = ''; }
    return c;
  }

  // The summary's columns, in order: a stable key (survives a refresh that changes the shared
  // series), the header HTML, and the header as plain text (the CSV export).
  function summaryColumns(ctx) {
    const of = ctx.players.length;
    return [
      // Noah (2026-10-16): a leftmost column with a button to mark the row as seeded (app only).
      ...(ctx.app ? [{ key: 'seeded', html: 'Seeded', text: 'Seeded' }] : []),
      ...(ctx.hasNotes ? [{ key: 'seed', html: 'Seed', text: 'Seed' }] : []),
      // Noah (2026-10-15): team tag in its own column before the player; region before tier.
      { key: 'team', html: 'Team', text: 'Team' },
      { key: 'player', html: 'Player', text: 'Player' },
      { key: 'region', html: 'Region', text: 'Region' },
      ...(ctx.hasTiers || ctx.app ? [{ key: 'tier', html: 'Tier', text: 'Tier' }] : []),
      ...ctx.majors.map((m) => ({ key: `major:${m.label}`, html: m.label, text: m.label })),
      ...ctx.shared.map((s) => ({ key: `series:${s.key}`, html: `${esc(s.label)} <span class="dim">(${s.n} of ${of})</span>`, text: `${s.label} (${s.n} of ${of})` })),
      { key: 'more', html: 'Other series <span class="dim">(this game)</span>', text: 'Other series (this game)' },
      { key: 'other', html: 'Other games', text: 'Other games' },
      { key: 'notes', html: 'Notes', text: 'Notes' },
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
    const pin = opts.app ? `<input type="checkbox" class="sel" title="Select to compare (pick two)" aria-label="Select ${esc(p.gamer_tag)} to compare">`
      + `<button class="pin" type="button" title="Pin this row under the header" aria-label="Pin ${esc(p.gamer_tag)}">📌</button>` : '';
    const tiered = Number.isFinite(n.tier);
    // The ✓ is the review mark (T1): on when this player was last reviewed at the page's
    // tournament. It is registry/tiers.csv state, so every browser shows the same.
    const here = M.reviewedHere(n, ctx.tournament);
    const markTitle = here ? `Reviewed here ${esc(n.last_reviewed_on || '')}. Click to undo (the same day only).` : 'Mark as reviewed at this tournament';
    const seededCell = ctx.app ? `<td class="seeded" data-v="${here ? 1 : 0}">${opts.app ? `<button class="seed-btn" type="button" aria-pressed="${here}" title="${markTitle}" aria-label="${here ? 'Reviewed' : 'Mark reviewed'}: ${esc(p.gamer_tag)}">✓</button>` : ''}</td>` : '';
    const trClass = [ctx.hasTiers && !tiered ? 'untiered' : '', here ? 'reviewed-row' : ''].filter(Boolean).join(' ');
    const tierTitle = tierCellTitle(n, ctx);
    return `<tr${opts.app ? ` data-pid="${esc(p.player_id)}"` : ''}${trClass ? ` class="${trClass}"` : ''}>${seededCell}${ctx.hasNotes ? `<td class="seed">${esc(n.seed ?? '')}</td>` : ''}`
      + `<td class="team" data-v="${esc((p.prefix || '~').toLowerCase())}">${esc(p.prefix || '')}</td>`
      + `<td class="who" data-v="${esc(String(p.gamer_tag).toLowerCase())}">${pin}<a href="#p${p.player_id}"><b>${esc(p.gamer_tag)}</b></a>`
      + `${(ctx.gameBy[p.player_id] || []).length ? '' : `<div class="dim">no ${esc(ctx.meta.game.name)} results</div>`}</td>`
      + `<td${opts.app ? ' class="region"' : ''} data-v="${esc((reg || '~').toLowerCase())}">${esc(reg) || '<span class="dim">—</span>'}</td>`
      // A4-1 (build-record-webapp.md, pass 4): this must be the SAME test summaryColumns uses to
      // decide the header has a Tier <th> (ctx.hasTiers || ctx.app), not opts.app — opts.app only
      // toggles the cell's *editable* affordance (tabindex/data-edit) below, which the compare
      // panel's read-only rows correctly omit. Using opts.app here too made the compare panel
      // (which calls summaryRow with no opts, but shares the same app ctx) render one fewer <td>
      // than the header's <th> count whenever no registrant had a tier yet.
      + (ctx.hasTiers || ctx.app ? `<td class="${tierCellClass(n, ctx)}" data-v="${tiered ? n.tier : -1}"${opts.app ? ' tabindex="0" data-edit="tier"' : ''}${tierTitle ? ` title="${esc(tierTitle)}"` : ''}>${tiered ? `<b>${n.tier}</b>` : '<span class="tag needs">needs tier</span>'}</td>` : '')
      + ctx.majors.map((m) => `<td data-v="${majorSortKey(rows, m, ctx.index).toFixed(4)}">${majorCell(rows, m, ctx.records, ctx.index)}</td>`).join('')
      + ctx.shared.map((s) => `<td data-v="${seriesSortKey(ctx.groupsBy[p.player_id][s.key], ctx.records).toFixed(4)}">${seriesCell(ctx.groupsBy[p.player_id][s.key], ctx.records)}</td>`).join('')
      + `<td class="more" data-v="${otherSeriesSortKey(p, ctx).toFixed(4)}">${otherSeriesCell(p, ctx)}</td>`
      + `<td class="other">${otherGamesCell(p, ctx)}</td>`
      + `<td class="notes"${opts.app ? ' tabindex="0" data-edit="notes"' : ''}>${notesCell(p, ctx)}</td></tr>`;
  }

  // ---- The summary as plain text (the Google Sheets export) ------------------------------------
  // Same content as the HTML cells, each cell on one line: a cell's lines are joined with "; ".
  const majorText = (rows, major, records, index) => {
    return majorHits(rows, major, index)
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
    for (const c of cols) head.push(c.text);
    head.push('start.gg player id');
    const body = ordered.map((p) => {
      const rows = ctx.rowsBy[p.player_id] || [];
      const n = ctx.notes[p.player_id] || {};
      const out = [];
      for (const c of cols) {
        if (c.key === 'seeded') out.push('');
        else if (c.key === 'seed') out.push(String(n.seed ?? ''));
        else if (c.key === 'team') out.push(p.prefix || '');
        else if (c.key === 'player') out.push(p.gamer_tag);
        else if (c.key === 'tier') out.push(Number.isFinite(n.tier) ? String(n.tier) : '');
        else if (c.key === 'region') out.push(M.region(p));
        else if (c.key === 'more') out.push(otherSeriesText(p, ctx));
        else if (c.key === 'other') out.push(otherGamesText(p, ctx));
        else if (c.key === 'notes') out.push(notesText(p, ctx));
        else if (c.key.startsWith('major:')) out.push(majorText(rows, ctx.majors.find((m) => `major:${m.label}` === c.key), ctx.records, ctx.index));
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
    return `<h2 id="p${p.player_id}">${p.prefix ? `<span class="dim">${esc(p.prefix)}</span> ` : ''}${esc(p.gamer_tag)}`
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
      + `<details><summary>Every ${gameName} result (${game.length})</summary>${lazy('game', () => resultsTable(game, ctx.records, { index: ctx.index }))}</details>`
      : `<p class="dim">No ${gameName} results.</p>`)
      + (other.length ? `<details><summary>Other games (${other.length} results${ctx.allGames ? '' : (ctx.otherNote ?? '; W-L not fetched, run with --all-games')})</summary>${lazy('other', () => seriesTable(other, ctx.records, { withGame: true, index: ctx.index }))}</details>` : '');
  }
  function renderLazy(which, p, ctx) {
    const rows = ctx.rowsBy[p.player_id] || [];
    return which === 'game' ? resultsTable(rows.filter(M.isGame), ctx.records, { index: ctx.index })
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
      const badge = isMajorRow(a, ctx.index) ? ' <span class="tag major">major</span>' : '';
      return `<tr><td>${esc(eventLabel(a))}${badge}${other}</td>${cell(a)}${cell(b)}<td class="date" data-v="${a.event_date}">${a.event_date}</td></tr>`;
    }).join('');
    return `<table class="res sortable"><thead><tr><th>Event</th><th>${tagOf(pA)}: placement · W-L</th><th>${tagOf(pB)}: placement · W-L</th><th>Date</th></tr></thead><tbody>${body}</tbody></table>`;
  }
  function compareSeriesTable(pA, pB, ctx) {
    const game = (p) => (ctx.rowsBy[p.player_id] || []).filter(M.isGame);
    const rows = M.alignSeries(M.sortedSeries(game(pA), ctx.records, ctx.index), M.sortedSeries(game(pB), ctx.records, ctx.index));
    if (!rows.length) return `<p class="dim">Neither player has ${esc(ctx.meta.game.name)} results.</p>`;
    const sub = ['Best placement', 'Best W-L', 'Average W-L'];
    const body = rows.map((x) => `<tr class="${x.a && x.b ? 'both' : ''}"><td><b>${esc(x.label)}</b>${seriesBadges(x.a || x.b, ctx.index)}</td>`
      + `${seriesStatCells(x.a, ctx.records, { each: false })}${seriesStatCells(x.b, ctx.records, { each: false })}</tr>`).join('');
    return '<table class="res cmp-series"><thead>'
      + `<tr><th rowspan="2">Series</th><th colspan="3" class="side">${tagOf(pA)}</th><th colspan="3" class="side">${tagOf(pB)}</th></tr>`
      + `<tr>${[...sub, ...sub].map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
  }

  // ---- Compare, up to 3 players ---------------------------------------------------------------
  function sharedEventsTable(ps, ctx) {
    const list = M.eventsSharedBy(ps.map((p) => ctx.rowsBy[p.player_id] || []));
    const who = ps.map(tagOf);
    if (!list.length) return `<p class="dim">${ps.length === 2 ? `${who[0]} and ${who[1]}` : 'No two of them'} entered no event in common in the window.</p>`;
    const cell = (r) => (r
      ? `<td class="num" data-v="${r.placement ? (+r.placement / +r.num_entrants).toFixed(4) : 9}"><b>${place(r)}</b> · ${wlText(wlOf(ctx.records, r))}</td>`
      : '<td class="num" data-v="10"><span class="dim">—</span></td>');
    const body = list.map(({ rows }) => {
      const a = rows.find(Boolean);
      const other = a.is_event_game !== 'true' ? ` <span class="tag">${esc(a.game_name)}</span>` : '';
      const badge = isMajorRow(a, ctx.index) ? ' <span class="tag major">major</span>' : '';
      return `<tr><td>${esc(eventLabel(a))}${badge}${other}</td>${rows.map(cell).join('')}<td class="date" data-v="${a.event_date}">${a.event_date}</td></tr>`;
    }).join('');
    return `<table class="res sortable"><thead><tr><th>Event</th>${who.map((w) => `<th>${w}: placement · W-L</th>`).join('')}<th>Date</th></tr></thead><tbody>${body}</tbody></table>`;
  }
  function compareSeriesTableN(ps, ctx) {
    const game = (p) => (ctx.rowsBy[p.player_id] || []).filter(M.isGame);
    const rows = M.alignSeriesN(ps.map((p) => M.sortedSeries(game(p), ctx.records, ctx.index)));
    if (!rows.length) return `<p class="dim">None of them has ${esc(ctx.meta.game.name)} results.</p>`;
    const sub = ['Best placement', 'Best W-L', 'Average W-L'];
    const body = rows.map((x) => `<tr class="${x.n >= 2 ? 'both' : ''}"><td><b>${esc(x.label)}</b>${seriesBadges(x.sides.find(Boolean), ctx.index)}</td>`
      + x.sides.map((s) => seriesStatCells(s, ctx.records, { each: false })).join('') + '</tr>').join('');
    return '<table class="res cmp-series"><thead>'
      + `<tr><th rowspan="2">Series</th>${ps.map((p) => `<th colspan="3" class="side">${tagOf(p)}</th>`).join('')}</tr>`
      + `<tr>${ps.flatMap(() => sub).map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
  }

  // ---- The push dry run (docs/design-tool.md, Outputs: "Dry run first, always") -----------------
  // dry: lib/push.js buildDryRun's result. One table, grouped as the sequence is: (a) tiered, (b) no
  // tier, (c) unmappable; current seed -> proposed seed, a move across a tier boundary flagged, a
  // seed whose player is not in the pool marked (it suggests a Refresh).
  const PUSH_GROUPS = [['tiered', 'Tiered (tier descending, start.gg\'s order within a tier)'], ['untiered', 'No tier (start.gg\'s order)'], ['unmappable', 'Unmappable: no entrant or no single player (start.gg\'s order)']];
  function pushDiffTable(dry) {
    const s = dry.summary;
    const head = `<p class="push-sum">${s.seeds} seeds: ${s.tiered} tiered, ${s.untiered} without a tier, ${s.unmappable} unmappable. `
      + `${s.moved} would move${s.crosses_tier ? `; <b class="flag">${s.crosses_tier} cross a tier boundary</b> relative to start.gg's current order (a conflict fix made by hand there would be reverted)` : ''}.`
      + `${s.not_in_pool ? ` ${s.not_in_pool} seed(s) are not in this tournament's pool: Refresh to pull them.` : ''}</p>`;
    const body = PUSH_GROUPS.map(([g, label]) => {
      const rows = dry.rows.filter((r) => r.group === g);
      if (!rows.length) return '';
      return `<tr class="grp"><th colspan="5">${esc(label)} <span class="dim">(${rows.length})</span></th></tr>` + rows.map((r) => {
        const marks = [r.crosses_tier ? '<span class="tag flag" title="Moves across a tier boundary relative to start.gg\'s current order">crosses tier</span>' : '',
          r.not_in_pool ? '<span class="tag" title="This player is not in the pool: Refresh to pull them">not in pool</span>' : ''].join('');
        return `<tr class="${r.moved ? 'moved' : ''}${r.crosses_tier ? ' crosses' : ''}"><td class="num">${r.current}</td><td class="num"><b>${r.proposed}</b></td>`
          + `<td>${esc(r.tag)}</td><td class="num">${r.tier == null ? '<span class="dim">—</span>' : r.tier}</td><td>${marks}</td></tr>`;
      }).join('');
    }).join('');
    return head + `<table class="res push-diff"><thead><tr><th>Current seed</th><th>Proposed</th><th>Player</th><th>Tier</th><th></th></tr></thead><tbody>${body}</tbody></table>`;
  }

  return {
    pushDiffTable,
    sharedEventsTable, compareSeriesTableN,
    esc, dim, majorCell, seriesCell, seriesStatCells, seriesTable, resultsTable,
    summaryContext, contextFromViewModel, recencyTitle, TAG_ONLY_TITLE, tierCellClass, tierCellTitle, summaryColumns, summaryHead, summaryHeadRow, summaryRow, playerTitle, playerBody, renderLazy,
    majorText, seriesText, summaryTextTable, otherGameSeries, otherGamesCell, otherGamesText, otherSeriesOf, otherSeriesCell, otherSeriesText, notesCell, notesText,
    bothEnteredTable, compareSeriesTable,
  };
}));
