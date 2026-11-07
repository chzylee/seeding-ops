// app/public/app.js — one game's tab on the tournament page (docs/design-tool.md, Pages): the seeding
// table, increment 2's page sliced by game. Fetches the view model from /api/t/<t>/g/<game>/data and
// renders it with SeedRender (lib/view/render.js, the same cells as views/major-table.js).
// app/public/tournament.js loads this script when a game tab is open, with window.SEED_TAB set.
//   - Summary first; per-player detail renders as it scrolls near the viewport.
//   - 📌 pins rows into a block frozen under the sticky header (localStorage, per event).
//   - ⇅ Compare opens the lower half: two players' summary rows, events both entered, series side by side.
//   - Refresh re-pulls the tournament on the server; this tab polls /status and shows the new pull when
//     it lands (the pull is swapped in through out/<t>/current, so it is never half new).
//   - Export seeds CSV numbers the table's current order by tier; Push to start.gg runs a dry run first.
(function () {
  'use strict';
  const M = window.SeedModel, R = window.SeedRender;
  const TAB = window.SEED_TAB; // { t, game: { id, name }, events: [slug] } from tournament.js
  const T = TAB.t, G = String(TAB.game.id), SLUG = `${T}/${G}`;
  // The tab's own routes (data, exports, the T1 writes), and the tournament's (refresh, status, push).
  const api = (what) => `/api/t/${encodeURIComponent(T)}/g/${encodeURIComponent(G)}/${what}`;
  const tapi = (what) => `/api/t/${encodeURIComponent(T)}/${what}`;
  const $ = (id) => document.getElementById(id);
  const pane = $('pane'), table = $('summary'), thead = table.tHead, pinnedBody = table.tBodies[0], mainBody = table.tBodies[1];
  const details = $('details'), compare = $('compare'), cmpBody = $('cmpBody');
  const perf = (window.__seedPerf = { marks: {} });
  const mark = (k) => { perf.marks[k] = Math.round(performance.now()); };
  // Main-thread tasks over 50 ms (Chrome's Long Tasks API), kept for the performance check.
  perf.longTasks = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) perf.longTasks.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch { /* not supported */ }

  // localStorage is a convenience: any failure (private mode, quota, bad JSON) falls back to defaults.
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
  };
  const PIN_KEY = `seeding:pins:${SLUG}`, CMP_KEY = `seeding:compare:${SLUG}`, FREEZE_KEY = `seeding:freeze2:${SLUG}`;
  let pins = store.get(PIN_KEY, []);
  if (!Array.isArray(pins)) pins = [];
  // Compare: up to CMP_MAX selected rows (Noah, 2026-10-15: "up to 3 selectable"; no automatic
  // overwrite — at the cap the other boxes grey out until one is deselected).
  const CMP_MAX = 3;
  let cmp = store.get(CMP_KEY, { on: false, ids: [] });
  if (!cmp || typeof cmp !== 'object') cmp = { on: false, ids: [] };
  if (!Array.isArray(cmp.ids)) cmp.ids = [cmp.a, cmp.b].filter(Boolean).map(String);
  delete cmp.a; delete cmp.b;
  cmp.ids = cmp.ids.slice(0, CMP_MAX);

  // Frozen columns by key (lib/view/render.js summaryColumns); Player is always frozen.
  // Default: the Seed column (when notes.json gives seeds) and Tier (registry/tiers.csv) stay with Player.
  // Default: everything through Tier (Team | Player | Region | Tier), plus Seed when notes.json gives seeds.
  let frozen = store.get(FREEZE_KEY, ['seed', 'team', 'region', 'tier']);
  frozen = new Set(Array.isArray(frozen) ? frozen : []);
  let vm = null, ctx = null, byId = new Map(), ordered = [], observer = null;

  // ---- Data ------------------------------------------------------------------------------------
  // The context is built by lib/view/render.js contextFromViewModel, the same function the CLI view
  // (views/major-table.js) uses, so the two render the same cells. app: the Tier column shows (and
  // is editable) even before any tier exists.
  function hydrate(model) {
    const players = model.players;
    const c = R.contextFromViewModel(model, { app: true });
    return { ctx: c, byId: new Map(players.map((p) => [String(p.player_id), p])), ordered: M.orderPlayers(players, c.notes) };
  }

  async function load({ keep = false } = {}) {
    mark('fetchStart');
    let res;
    try { res = await fetch(api('data'), { cache: 'no-store' }); } catch (err) { return showMsg(`Could not reach the app server (${err.message}). Is it still running?`); }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showMsg(body.error || `Error ${res.status}`);
      if (body.status) showStatus(body.status);
      return;
    }
    const model = await res.json();
    mark('dataReceived');
    const scroll = keep ? { top: pane.scrollTop, left: pane.scrollLeft } : null;
    const rendered = keep ? [...details.querySelectorAll('section.player.rendered')].map((s) => s.dataset.pid) : [];
    const samePlayers = vm && model.players.length === vm.players.length && model.players.every((p, i) => p.player_id === vm.players[i].player_id);
    vm = model;
    ({ ctx, byId, ordered } = hydrate(model));
    // A2.3: the Seed column's numbers, and the table's first order is the seed order (which, with
    // nothing arranged, is the tier order the table always had).
    pickSeedEvent();
    computeSeeds();
    ordered = seedOrdered();
    sortedBy = null;
    showMsg('');
    renderHeader();
    renderSummary();
    mark('summaryInDom');
    requestAnimationFrame(() => setTimeout(() => {
      mark('summaryPainted');
      perf.summaryMs = perf.marks.summaryPainted - perf.marks.fetchStart;
    }, 0));
    renderDetails(samePlayers ? rendered : []);
    fillPickers();
    renderSeedBar();
    redrawPush();
    if (cmp.on) renderCompare();
    if (scroll) { pane.scrollTop = scroll.top; pane.scrollLeft = scroll.left; }
    showStatus(model.status);
    $('update').hidden = true;
  }

  function showMsg(s) { $('msg').textContent = s; }

  function renderHeader() {
    const ev = vm.meta.event || {};
    document.title = `${vm.meta.game.name} — ${ev.tournament_name || T} — seeding`;
    const w = vm.meta.window || {};
    const runAt = new Date(vm.run.run_at);
    // Two units (event facts, then W-L progress) so the line wraps between them, not mid-phrase.
    const facts = document.createElement('span'), wl = document.createElement('span');
    facts.textContent = `${ev.name || vm.meta.game.name} · ${vm.meta.registrant_count} registrants · results ${String(w.start).slice(0, 10)} to ${String(w.end).slice(0, 10)}`
      + ` · pulled ${runAt.toLocaleString()}`;
    wl.textContent = `W-L known for ${vm.wl.known.toLocaleString()} of ${vm.wl.total.toLocaleString()} ${vm.meta.game.name} results`;
    $('sub').replaceChildren(facts, wl);
  }

  // ---- Summary + pins --------------------------------------------------------------------------
  let rowHtml = new Map();
  function renderSummary() {
    thead.innerHTML = R.summaryHeadRow(ctx, { app: true });
    rowHtml = new Map(ordered.map((p) => [String(p.player_id), R.summaryRow(p, ctx, { app: true })]));
    pins = pins.filter((id) => byId.has(String(id))).map(String);
    const pinned = new Set(pins);
    pinnedBody.innerHTML = pins.map((id) => rowHtml.get(id)).join('');
    mainBody.innerHTML = ordered.map((p, i) => (pinned.has(String(p.player_id)) ? '' : rowHtml.get(String(p.player_id)).replace('<tr ', `<tr data-i="${i}" `))).join('');
    for (const tr of pinnedBody.rows) tr.dataset.i = String(ordered.findIndex((p) => String(p.player_id) === tr.dataset.pid));
    fillFreeze();
    applyFreeze();
    layoutPins();
    syncSel();
  }

  // ---- ✓ review mark (T1): POST …/player/<id>/review writes last_reviewed_on and
  // last_reviewed_tournament to registry/tiers.csv. The row's green state is rendered from the
  // server's data (lib/view/render.js summaryRow), so every browser shows the same marks. The old
  // per-browser seeded marks (localStorage, increment 2) are not read; their key is removed once.
  try { localStorage.removeItem(`seeding:seeded:${SLUG}`); } catch { /* per-viewer storage only */ }
  const reviewing = new Set();
  // The review each ✓ in this page replaced, so its un-✓ can put it back (B2-1, ruled option (a)):
  // the server restores the pair only over a review made here today. After a reload the page no
  // longer knows it, and an un-✓ clears today's review instead.
  const replaced = new Map();
  async function toggleReviewed(pid) {
    if (!pid || reviewing.has(pid)) return;
    const n = ctx.notes[pid] || {};
    const on = !M.reviewedHere(n, ctx.tournament);
    reviewing.add(pid);
    showNote('');
    for (const td of table.querySelectorAll(`tbody tr[data-pid="${CSS.escape(pid)}"] > td.seeded`)) td.classList.add('saving');
    const shown = { last_reviewed_on: n.last_reviewed_on || '', last_reviewed_tournament: n.last_reviewed_tournament || '' };
    const payload = on ? { reviewed: true } : { reviewed: false, ...(replaced.get(pid) || {}) };
    let res, body;
    try {
      res = await fetch(api(`player/${encodeURIComponent(pid)}/review`), { method: 'POST', headers: { 'X-Seeding-App': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      body = await res.json().catch(() => ({}));
    } catch (err) { body = { error: err.message }; res = { ok: false }; }
    reviewing.delete(pid);
    for (const td of table.querySelectorAll(`tbody tr[data-pid="${CSS.escape(pid)}"] > td.seeded`)) td.classList.remove('saving');
    if (!res.ok) { notSaved(body, table.querySelectorAll(`tbody tr[data-pid="${CSS.escape(pid)}"] > td.seeded`)); return; }
    if (on && body.changed) replaced.set(pid, shown);
    if (!on && body.changed) replaced.delete(pid);
    // An un-✓ only undoes a review made today at this tournament (T1 rules); the status line says
    // so when it kept a review, and when it put an earlier one back. The note stays until the next action.
    const tag = byId.get(pid) ? byId.get(pid).gamer_tag : pid;
    showMsg('');
    showNote(M.reviewNote(tag, on, body, ctx.tournament));
    ctx.notes[pid] = { ...n, tier: body.tier == null ? undefined : body.tier, notes: body.notes,
      last_reviewed_on: body.last_reviewed_on, last_reviewed_tournament: body.last_reviewed_tournament,
      // A1.2: a write that linked the row (both ids written) ends the tag-only color.
      tag_only: body.linked ? undefined : n.tag_only };
    rerenderRow(pid, null);
    const btn = table.querySelector(`tbody tr[data-pid="${CSS.escape(pid)}"] button.seed-btn`);
    if (btn) btn.focus({ preventScroll: true });
  }

  // ---- Seeds (docs/design-tool.md, Amendment A2.3) ------------------------------------------------
  // The Seed column numbers one event's entrants (the tab's first event; a select picks another when
  // the tab has several). Nothing arranged: tier order (lib/view/model.js seedOrder 'tiers', the
  // table's own tie-break), recomputed after every tier edit. A drag, or the arrow keys on a row's ⠿
  // handle, arranges it: the whole order is saved for the event at once, every move (no debounce),
  // through one serialized chain (seedWrites), and is what the push posts. Rows stay draggable while
  // the push panel is open and after a push; an open dry run is redrawn after every move.
  let seedEvent = null;           // the event slug the Seed column shows
  let seedState = null;           // { mode, order, at } for that event (M.seedOrder)
  let seedWrites = Promise.resolve();
  let sortedBy = null;            // null: the table is in its first order (the seed order); else { key, dir }
  const SEED_EVENT_KEY = `seeding:seedEvent:${SLUG}`;
  const seedEvents = () => (vm && vm.seeding && vm.seeding.events) || [];
  const seedInfo = (slug = seedEvent) => seedEvents().find((e) => e.slug === slug) || null;
  const tierOfId = (id) => (ctx && ctx.notes[id] && Number.isFinite(ctx.notes[id].tier) ? ctx.notes[id].tier : null);
  const entrantsOf = (ev) => ev.entrants.filter((id) => byId.has(id)).map((id) => ({ id, tier: tierOfId(id), tag: byId.get(id).gamer_tag }));
  function pickSeedEvent() {
    const evs = seedEvents();
    const want = store.get(SEED_EVENT_KEY, null);
    seedEvent = evs.some((e) => e.slug === want) ? want : (evs[0] ? evs[0].slug : null);
    const sel = $('seedEvent');
    sel.innerHTML = evs.map((e) => `<option value="${R.esc(e.slug)}"${e.slug === seedEvent ? ' selected' : ''}>${R.esc(e.name)}</option>`).join('');
    $('seedEventWrap').hidden = evs.length < 2;
  }
  function computeSeeds() {
    const ev = seedInfo();
    if (!ev || !ctx) { if (ctx) ctx.seeds = null; seedState = null; return; }
    seedState = M.seedOrder(entrantsOf(ev), ev.saved);
    ctx.seeds = new Map(seedState.order.map((id, i) => [id, i + 1]));
    ctx.seedMode = seedState.mode;
    ctx.seedEventName = ev.name;
  }
  // The table in seed order: the event's entrants by seed, then the tab's other players in tier order.
  function seedOrdered() {
    const base = M.orderPlayers([...byId.values()], ctx.notes);
    if (!seedState) return base;
    const inIt = new Set(seedState.order);
    return [...seedState.order.map((id) => byId.get(id)), ...base.filter((p) => !inIt.has(String(p.player_id)))];
  }
  // The seeding a push uses for one event, as the page shows it right now (ev.saved is updated on
  // every move before the save is sent).
  function currentSeeding(slug) {
    const ev = seedInfo(slug);
    if (!ev || !ev.saved) return { mode: 'tiers' };
    return { mode: 'arranged', order: M.seedOrder(entrantsOf(ev), ev.saved).order };
  }
  function renderSeedBar() {
    const has = !!seedState;
    $('seedMode').hidden = !has; $('seedSort').hidden = !has;
    if (!has) { $('seedReset').hidden = true; return; }
    const arranged = seedState.mode === 'arranged';
    const when = arranged && seedState.at ? new Date(seedState.at).toLocaleString() : '';
    $('seedMode').textContent = arranged ? 'Seeds: arranged by hand' : 'Seeds: tier order';
    $('seedMode').classList.toggle('arranged', arranged);
    $('seedMode').title = arranged
      ? `Push to start.gg posts this order exactly${when ? ` (saved ${when})` : ''}. New registrants slot in by tier; withdrawn ones close the gap.`
      : 'Nothing arranged: seeds follow tiers. Push to start.gg sets tiers and keeps start.gg\'s current order within each tier. Drag a row by its ⠿ handle (or focus it and use the arrow keys) to fix an exact order.';
    $('seedReset').hidden = !arranged;
  }
  // The Seed cells, every row (and the compare panel), after the numbers change; in seed order the
  // rows move too.
  function refreshSeeds() {
    for (const td of table.querySelectorAll('tbody tr[data-pid] > td.seed')) {
      const p = byId.get(td.parentElement.dataset.pid);
      if (p) td.outerHTML = R.seedCell(p, ctx, { app: true });
    }
    if (!sortedBy) {
      ordered = seedOrdered();
      const at = new Map(ordered.map((p, i) => [String(p.player_id), i]));
      const rows = [...mainBody.rows].sort((a, b) => at.get(a.dataset.pid) - at.get(b.dataset.pid));
      mainBody.append(...rows);
      for (const tr of table.querySelectorAll('tbody tr[data-pid]')) tr.dataset.i = String(at.get(tr.dataset.pid));
    }
    applyFreeze();
    layoutPins();
    if (cmp.on) renderCompare();
  }
  // Moving needs the rows on screen in seed order; any other sort is undone first. (Sorting by the Seed
  // header, ascending, IS the seed order: sortSummary sets sortedBy back to null for it.)
  function ensureSeedOrder() {
    if (!sortedBy) return;
    for (const h of thead.rows[0].cells) delete h.dataset.dir;
    sortedBy = null;
    refreshSeeds();
  }
  function announce(id) {
    const n = ctx.seeds && ctx.seeds.get(String(id));
    const p = byId.get(String(id));
    $('seedLive').textContent = n ? `${p ? p.gamer_tag : id}: seed ${n} of ${ctx.seeds.size}` : '';
  }
  function saveSeeds(body) {
    const slug = seedEvent;
    seedWrites = seedWrites.then(async () => {
      const r = await postJson(api('seeds'), { event: slug, ...body });
      if (!r.ok) { showNote(`Seed order not saved: ${r.body.error || 'error'}`, { err: true }); return; }
      // Only the save time comes back into the page: a later move's order is already in ev.saved.
      const ev = seedInfo(slug);
      if (ev && ev.saved && r.body.saved && ev.saved.order.join(',') === r.body.saved.order.join(',')) ev.saved.at = r.body.saved.at;
      if (slug === seedEvent) { computeSeeds(); renderSeedBar(); }
    });
    return seedWrites;
  }
  function applySeedMove(id, targetId, where) {
    const ev = seedInfo();
    if (!seedState || !ev) return;
    const next = M.moveSeed(seedState.order, id, targetId, where);
    if (next.join(',') === seedState.order.join(',')) return;
    ev.saved = { order: next, at: new Date().toISOString() };
    computeSeeds();
    refreshSeeds();
    renderSeedBar();
    announce(id);
    saveSeeds({ mode: 'arranged', order: next });
    redrawPush();
  }
  function focusHandle(id) {
    const b = table.querySelector(`tbody tr[data-pid="${CSS.escape(String(id))}"] button.drag`);
    if (b) { b.focus({ preventScroll: true }); b.closest('tr').scrollIntoView({ block: 'nearest' }); }
  }
  // The rows a keyboard move steps over: seeded and shown (Needs tier only hides tiered rows).
  function visibleSeedIds() {
    const needsOnly = document.body.classList.contains('needs-only');
    return seedState.order.filter((id) => !needsOnly || !Number.isFinite(tierOfId(id)));
  }
  // Keyboard reordering on the ⠿ handle (WAI-ARIA practice for a reorderable list): Arrow Up / Down
  // one row, Page Up / Down ten, Home / End to the first / last seed; focus stays on the moved row.
  const MOVE_KEYS = { 'ArrowUp': -1, 'ArrowDown': 1, 'PageUp': -10, 'PageDown': 10, 'Home': -Infinity, 'End': Infinity };
  function onHandleKey(ev) {
    const btn = ev.target.closest && ev.target.closest('button.drag');
    if (!btn || !(ev.key in MOVE_KEYS) || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    ev.preventDefault();
    const id = btn.closest('tr').dataset.pid;   // read before ensureSeedOrder redraws the Seed cells
    ensureSeedOrder();
    const vis = visibleSeedIds();
    const i = vis.indexOf(id);
    if (i < 0) return;
    const step = MOVE_KEYS[ev.key];
    const j = Math.max(0, Math.min(vis.length - 1, Number.isFinite(step) ? i + step : step > 0 ? vis.length - 1 : 0));
    if (j !== i) applySeedMove(id, vis[j], j > i ? 'after' : 'before');
    focusHandle(id);
  }
  table.addEventListener('keydown', onHandleKey);
  // Drag with the pointer (pointer events, not HTML5 drag-and-drop, so it works the same in the
  // desktop app's webview and in a browser): press the handle, move, release. A line shows where the
  // row lands; the table scrolls near its edges.
  let drag = null;
  function dropTargets() {
    return [...table.querySelectorAll('tbody tr[data-pid]')].filter((tr) => tr.querySelector('button.drag') && tr.getClientRects().length && tr.dataset.pid !== drag.id);
  }
  function clearDropMark() { for (const tr of table.querySelectorAll('tr.drop-before, tr.drop-after')) tr.classList.remove('drop-before', 'drop-after'); }
  table.addEventListener('pointerdown', (ev) => {
    const btn = ev.target.closest('button.drag');
    if (!btn || ev.button !== 0) return;
    ev.preventDefault();
    const pid = btn.closest('tr').dataset.pid;   // read before ensureSeedOrder redraws the Seed cells
    ensureSeedOrder();
    const tr = table.querySelector(`tbody tr[data-pid="${CSS.escape(pid)}"]`);
    const handle = tr.querySelector('button.drag');
    drag = { id: tr.dataset.pid, tr, target: null, where: null };
    try { handle.setPointerCapture(ev.pointerId); } catch { /* the move still works while the pointer stays over the table */ }
    tr.classList.add('dragging');
    document.body.classList.add('seed-dragging');
    handle.focus({ preventScroll: true });
  });
  table.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const y = ev.clientY;
    const box = pane.getBoundingClientRect();
    if (y < box.top + 48) pane.scrollTop -= 14; else if (y > box.bottom - 48) pane.scrollTop += 14;
    let hit = null;
    for (const tr of dropTargets()) {
      const r = tr.getBoundingClientRect();
      if (y >= r.top && y < r.bottom) { hit = { tr, where: y < r.top + r.height / 2 ? 'before' : 'after' }; break; }
    }
    clearDropMark();
    if (!hit) { drag.target = null; return; }
    drag.target = hit.tr.dataset.pid; drag.where = hit.where;
    hit.tr.classList.add(hit.where === 'before' ? 'drop-before' : 'drop-after');
  });
  function endDrag(commit) {
    if (!drag) return;
    const { id, tr, target, where } = drag;
    drag = null;
    clearDropMark();
    tr.classList.remove('dragging');
    document.body.classList.remove('seed-dragging');
    if (commit && target) applySeedMove(id, target, where);
    focusHandle(id);
  }
  table.addEventListener('pointerup', () => endDrag(true));
  table.addEventListener('pointercancel', () => endDrag(false));
  document.addEventListener('keydown', (ev) => { if (drag && ev.key === 'Escape') endDrag(false); });
  $('seedSort').addEventListener('click', () => {
    const th = thead.querySelector('th[data-col="seed"]');
    for (const h of thead.rows[0].cells) delete h.dataset.dir;
    if (th) th.dataset.dir = '1';
    sortedBy = null;
    refreshSeeds();
  });
  $('seedReset').addEventListener('click', () => {
    const ev = seedInfo();
    if (!ev || !ev.saved) return;
    if (!window.confirm(`Reset the seeds of ${ev.name} to tier order?\n\nYour arranged order for this event is discarded; seeds follow tiers again, and the push keeps start.gg's order within each tier.`)) return;
    ev.saved = null;
    computeSeeds();
    refreshSeeds();
    renderSeedBar();
    saveSeeds({ mode: 'tiers' });
    redrawPush();
    showNote(`${ev.name}: seeds reset to tier order.`);
  });
  $('seedEvent').addEventListener('change', (ev) => {
    seedEvent = ev.target.value;
    store.set(SEED_EVENT_KEY, seedEvent);
    computeSeeds();
    refreshSeeds();
    renderSeedBar();
  });

  // ---- Freeze columns --------------------------------------------------------------------------
  // A frozen column is sticky at the left edge plus the widths of the frozen columns before it, so
  // it stays put while the others scroll under it. The same offsets go on the pinned block (same
  // table) and on the compare panel's summary rows (same columns, same widths).
  const colKeys = () => [...thead.rows[0].cells].map((th) => th.dataset.col);
  const isFrozen = (k) => k === 'player' || k === 'seeded' || frozen.has(k);
  function freezeOffsets() {
    const ths = [...thead.rows[0].cells];
    let x = 0;
    return ths.map((th) => {
      if (!isFrozen(th.dataset.col)) return null;
      const at = x;
      x += th.getBoundingClientRect().width;
      return at;
    });
  }
  function applyFreezeTo(t, lefts) {
    const last = lefts.reduce((m, v, i) => (v != null ? i : m), -1);
    for (const tr of t.rows) {
      for (let i = 0; i < tr.cells.length; i++) {
        const c = tr.cells[i];
        if (lefts[i] != null) {
          c.classList.add('frozen');
          c.style.left = `${lefts[i]}px`;
          c.classList.toggle('frozen-edge', i === last);
        } else if (c.classList.contains('frozen')) {
          c.classList.remove('frozen', 'frozen-edge');
          c.style.left = '';
        }
      }
    }
  }
  function applyFreeze() {
    if (!thead.rows[0]) return;
    const lefts = freezeOffsets();
    applyFreezeTo(table, lefts);
    const cmpTable = cmp.on && cmpBody.querySelector('.cmp-sum-wrap table');
    if (cmpTable) applyFreezeTo(cmpTable, lefts);
    for (const b of thead.querySelectorAll('button.freeze')) {
      const on = frozen.has(b.closest('th').dataset.col);
      b.setAttribute('aria-pressed', String(on));
      b.title = on ? 'Unfreeze this column' : 'Freeze this column when scrolling sideways';
    }
    const keys = colKeys();
    const lead = keys.findIndex((k) => !isFrozen(k));
    const n = lead < 0 ? keys.length : lead;
    const exact = keys.every((k, i) => (i < n) === isFrozen(k) || k === 'player');
    $('freezeN').value = exact ? String(n) : 'custom';
  }
  // "Freeze: first N columns" — through Player at the least.
  function fillFreeze() {
    const keys = colKeys(), names = [...thead.rows[0].cells].map((th) => th.childNodes[0].textContent.trim());
    const p = keys.indexOf('player');
    const opts = [];
    for (let n = p + 1; n <= Math.min(keys.length - 1, p + 6); n++) {
      opts.push(`<option value="${n}">${n === p + 1 ? (p === 0 ? 'Player only' : names.slice(0, n).join(' + ')) : `Through ${R.esc(names[n - 1])}`}</option>`);
    }
    opts.push('<option value="custom" disabled>Custom (❄ in headers)</option>');
    $('freezeN').innerHTML = opts.join('');
  }
  $('freezeN').addEventListener('change', (ev) => {
    const n = Number(ev.target.value);
    if (!Number.isFinite(n)) return;
    frozen = new Set(colKeys().slice(0, n).filter((k) => k !== 'player'));
    store.set(FREEZE_KEY, [...frozen]);
    applyFreeze();
  });
  function toggleFreeze(th) {
    const k = th.dataset.col;
    if (!k || k === 'player') return;
    if (frozen.has(k)) frozen.delete(k); else frozen.add(k);
    store.set(FREEZE_KEY, [...frozen]);
    applyFreeze();
  }

  // Each pinned row's cells stick at the header's height plus the rows pinned above it.
  function layoutPins() {
    // Measured from the cells (a row's own box can differ by a pixel), floored so consecutive
    // pinned rows overlap by a sub-pixel rather than leave a gap the scrolled rows show through.
    let top = thead.rows[0] ? thead.rows[0].cells[0].getBoundingClientRect().height : 0;
    const rows = [...pinnedBody.rows];
    rows.forEach((tr, k) => {
      const at = Math.floor(top);
      for (const td of tr.cells) td.style.top = `${at}px`;
      top = at + tr.cells[0].getBoundingClientRect().height;
      tr.classList.toggle('last-pin', k === rows.length - 1);
      const b = tr.querySelector('button.pin');
      if (b) { b.title = 'Unpin this row'; b.setAttribute('aria-pressed', 'true'); }
    });
    for (const tr of mainBody.rows) {
      if (tr.classList.contains('last-pin')) tr.classList.remove('last-pin');
      for (const td of tr.cells) if (td.style.top) td.style.top = '';
      const b = tr.querySelector('button.pin');
      if (b && b.getAttribute('aria-pressed') === 'true') { b.title = 'Pin this row under the header'; b.setAttribute('aria-pressed', 'false'); }
    }
  }

  function togglePin(tr) {
    const id = tr.dataset.pid;
    if (tr.parentElement === pinnedBody) {
      pins = pins.filter((x) => x !== id);
      const i = Number(tr.dataset.i);
      const next = [...mainBody.rows].find((r) => Number(r.dataset.i) > i) || null;
      mainBody.insertBefore(tr, next);
    } else {
      pins.push(id);
      pinnedBody.appendChild(tr);
    }
    store.set(PIN_KEY, pins);
    layoutPins();
  }

  // ---- Per-player detail, rendered on demand ---------------------------------------------------
  function estimate(p) {
    const n = Object.keys(ctx.groupsBy[p.player_id] || {}).length;
    return 90 + 36 * n;
  }
  function renderSection(sec) {
    if (sec.classList.contains('rendered')) return;
    const t0 = performance.now();
    const p = byId.get(sec.dataset.pid);
    const body = sec.querySelector('.body');
    body.innerHTML = R.playerBody(p, ctx, { lazy: true });
    body.style.minHeight = '';
    sec.classList.add('rendered');
    if (observer) observer.unobserve(sec);
    (perf.sectionMs ||= []).push(Math.round(performance.now() - t0));
  }
  // Sections near the viewport queue up and render a few per frame (about 12 ms of work), so a
  // fast scroll past many players never builds them all in one long task.
  const queue = new Set();
  let queued = false;
  function enqueue(sec) {
    queue.add(sec);
    if (queued) return;
    queued = true;
    requestAnimationFrame(function drain() {
      const t0 = performance.now();
      for (const s of queue) {
        queue.delete(s);
        if (s.isConnected) renderSection(s);
        if (performance.now() - t0 > 12) break;
      }
      if (queue.size) requestAnimationFrame(drain); else queued = false;
    });
  }
  function renderDetails(eager) {
    if (observer) observer.disconnect();
    queue.clear();
    details.innerHTML = ordered.map((p) => `<section class="player" data-pid="${R.esc(p.player_id)}">${R.playerTitle(p)}`
      + `<div class="body" style="min-height:${estimate(p)}px"></div></section>`).join('');
    const want = new Set(eager);
    observer = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (en.isIntersecting) enqueue(en.target); else queue.delete(en.target);
      }
    }, { root: pane, rootMargin: '800px 0px' }) : null;
    for (const sec of details.children) {
      if (want.has(sec.dataset.pid) || !observer) renderSection(sec);
      else observer.observe(sec);
    }
  }
  // The collapsed "every result" / "other games" tables render when first opened.
  document.addEventListener('toggle', (ev) => {
    const d = ev.target;
    if (!(d instanceof HTMLDetailsElement) || !d.open) return;
    const slot = d.querySelector(':scope > [data-lazy]');
    if (!slot || slot.childElementCount) return;
    slot.innerHTML = R.renderLazy(slot.dataset.lazy, byId.get(slot.dataset.pid), ctx);
  }, true);

  function goToPlayer(id) {
    const sec = details.querySelector(`section.player[data-pid="${CSS.escape(id)}"]`);
    if (!sec) return;
    // Render it and the sections just above it first, so the jump lands where it should.
    const all = [...details.children];
    const i = all.indexOf(sec);
    for (const s of all.slice(Math.max(0, i - 3), i + 2)) renderSection(s);
    const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    sec.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
  }

  // ---- Sorting (any table.sortable, including ones rendered later) ------------------------------
  document.addEventListener('click', (ev) => {
    const seedBtn = ev.target.closest('button.seed-btn');
    if (seedBtn) { toggleReviewed(seedBtn.closest('tr').dataset.pid); return; }
    const pinBtn = ev.target.closest('button.pin');
    if (pinBtn) { togglePin(pinBtn.closest('tr')); return; }
    const fzBtn = ev.target.closest('button.freeze');
    if (fzBtn) { toggleFreeze(fzBtn.closest('th')); return; }
    const link = ev.target.closest('a[href^="#p"]');
    if (link) { ev.preventDefault(); goToPlayer(link.getAttribute('href').slice(2)); return; }
    const sth = ev.target.closest('#summary thead th');
    if (sth) { sortSummary(sth); return; }
    const th = ev.target.closest('table.sortable th');
    if (!th) return;
    const t = th.closest('table'), tb = t.tBodies[0], i = th.cellIndex;
    const dir = th.dataset.dir === '1' ? -1 : 1;
    th.dataset.dir = String(dir);
    const rows = [...tb.rows];
    rows.sort((a, b) => {
      const x = a.cells[i], y = b.cells[i];
      const xv = x.dataset.v != null ? x.dataset.v : x.innerText, yv = y.dataset.v != null ? y.dataset.v : y.innerText;
      const nx = parseFloat(xv), ny = parseFloat(yv);
      const c = (!isNaN(nx) && !isNaN(ny) && !/-\d\d-/.test(xv)) ? nx - ny : String(xv).localeCompare(String(yv));
      return c * dir;
    });
    tb.append(...rows);
  });

  // ---- Compare ---------------------------------------------------------------------------------
  let labelToId = new Map(), idToLabel = new Map();
  function fillPickers() {
    const count = {};
    for (const p of ordered) count[p.gamer_tag.toLowerCase()] = (count[p.gamer_tag.toLowerCase()] || 0) + 1;
    labelToId = new Map(); idToLabel = new Map();
    for (const p of ordered) {
      const label = count[p.gamer_tag.toLowerCase()] > 1 ? `${p.gamer_tag} (#${p.player_id})` : p.gamer_tag;
      labelToId.set(label.toLowerCase(), String(p.player_id));
      idToLabel.set(String(p.player_id), label);
    }
    $('playerList').innerHTML = [...idToLabel.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      .map((l) => `<option value="${R.esc(l)}"></option>`).join('');
    renderChips();
  }
  // The compare bar: one chip per selected player (✕ deselects), and Clear.
  function renderChips() {
    const letters = ['A', 'B', 'C'];
    $('cmpChips').innerHTML = cmp.ids.length
      ? cmp.ids.map((id, i) => `<span class="chip"><span class="chip-k">${letters[i]}</span>${R.esc(idToLabel.get(id) || id)}`
        + `<button type="button" class="chip-x" data-rm="${R.esc(id)}" title="Deselect" aria-label="Deselect ${R.esc(idToLabel.get(id) || id)}">✕</button></span>`).join('')
      : '<span class="dim">Tick up to 3 players in the table.</span>';
    $('cmpClear').disabled = !cmp.ids.length;
  }
  function setSelection(ids) {
    cmp.ids = ids.slice(0, CMP_MAX);
    store.set(CMP_KEY, cmp);
    syncSel();
    if (cmp.ids.length >= 2 && !cmp.on) setCompare(true); else renderCompare();
  }
  $('cmpChips').addEventListener('click', (ev) => {
    const x = ev.target.closest('button[data-rm]');
    if (x) setSelection(cmp.ids.filter((id) => id !== x.dataset.rm));
  });
  $('cmpClear').addEventListener('click', () => setSelection([]));
  // An exact tag picks at once. On Enter / leaving the box, a partial tag picks the one player it
  // matches (start of tag first, then anywhere in it); with several matches, the list stays open.
  function resolve(value, final) {
    const v = String(value).trim().toLowerCase();
    if (!v) return { id: null };
    if (labelToId.has(v)) return { id: labelToId.get(v) };
    if (!final) return null;
    const labels = [...labelToId.keys()];
    const starts = labels.filter((l) => l.startsWith(v));
    const hits = starts.length ? starts : labels.filter((l) => l.includes(v));
    return hits.length === 1 ? { id: labelToId.get(hits[0]) } : null;
  }

  function setCompare(on) {
    const t0 = performance.now();
    cmp.on = on;
    store.set(CMP_KEY, cmp);
    compare.hidden = !on;
    $('compareToggle').setAttribute('aria-pressed', String(on));
    if (on) {
      renderCompare();
      requestAnimationFrame(() => setTimeout(() => { perf.compareOpenMs = Math.round(performance.now() - t0); }, 0));
    }
    layoutPins();
  }
  $('compareToggle').addEventListener('click', () => setCompare(!cmp.on));
  $('compareClose').addEventListener('click', () => setCompare(false));

  function renderCompare() {
    if (!vm || !cmp.on) return;
    const t0 = performance.now();
    const ps = cmp.ids.map((id) => byId.get(id)).filter(Boolean);
    if (ps.length < 2) {
      cmpBody.innerHTML = `<p class="hint">Tick the box next to 2 or 3 players in the table above to compare them. ${ps.length ? 'One more to go.' : ''}</p>`;
      return;
    }
    const two = ps.length === 2;
    cmpBody.innerHTML = `<h3>Summary</h3><div class="cmp-sum-wrap"><table class="summary"><colgroup></colgroup><thead>${R.summaryHeadRow(ctx)}</thead>`
      + `<tbody>${ps.map((p) => R.summaryRow(p, ctx)).join('')}</tbody></table></div>`
      + `<h3>${two ? 'Events both entered' : 'Events 2 or more of them entered'}</h3><p class="dim">Placement and W-L of each at the same event. This is not head-to-head sets.</p>${R.sharedEventsTable(ps, ctx)}`
      + `<h3>Series</h3><p class="dim">${R.esc(vm.meta.game.name)} only. A series ${two ? 'both have' : '2 or more of them have'} played is shaded; series more of them played come first.</p>${R.compareSeriesTableN(ps, ctx)}`;
    const keys = R.summaryColumns(ctx).map((c) => c.key);
    const cmpHead = cmpBody.querySelector('.cmp-sum-wrap thead tr');
    if (cmpHead) [...cmpHead.cells].forEach((th, i) => { th.dataset.col = keys[i]; });
    alignCompare();
    applyFreeze();
    stickCompareHeads();
    perf.compareRenderMs = Math.round(performance.now() - t0);
  }

  // The compare panel's summary rows use the main table's column widths, and follow its sideways scroll.
  function alignCompare() {
    const wrap = cmpBody.querySelector('.cmp-sum-wrap');
    if (!wrap) return;
    const widths = [...thead.rows[0].cells].filter((th) => getComputedStyle(th).display !== 'none').map((th) => th.getBoundingClientRect().width);
    const t = wrap.querySelector('table');
    t.querySelector('colgroup').innerHTML = widths.map((w) => `<col style="width:${w}px">`).join('');
    t.style.width = `${widths.reduce((a, b) => a + b, 0)}px`;
    wrap.scrollLeft = pane.scrollLeft;
  }
  // The panel's table heads stick under its picker bar (whose height changes when it wraps), and
  // the series table's second head row under its first.
  function stickCompareHeads() {
    const bar = compare.querySelector('.cmp-bar');
    if (!bar || compare.hidden) return;
    const top = Math.floor(bar.getBoundingClientRect().height);
    compare.style.setProperty('--cmp-top', `${top}px`);
    const cs = cmpBody.querySelector('table.cmp-series');
    const side = cs && cs.tHead && cs.tHead.rows[0] && cs.tHead.rows[0].cells[1];
    if (side) compare.style.setProperty('--cmp-top2', `${top + Math.floor(side.getBoundingClientRect().height)}px`);
  }
  let syncing = false;
  pane.addEventListener('scroll', () => {
    const wrap = cmp.on && cmpBody.querySelector('.cmp-sum-wrap');
    if (!wrap || syncing) return;
    syncing = true; wrap.scrollLeft = pane.scrollLeft; requestAnimationFrame(() => { syncing = false; });
  }, { passive: true });
  cmpBody.addEventListener('scroll', (ev) => {
    if (!ev.target.classList || !ev.target.classList.contains('cmp-sum-wrap') || syncing) return;
    syncing = true; pane.scrollLeft = ev.target.scrollLeft; requestAnimationFrame(() => { syncing = false; });
  }, { passive: true, capture: true });

  window.addEventListener('resize', () => { layoutPins(); if (cmp.on) { alignCompare(); stickCompareHeads(); } applyFreeze(); });

  // ---- Refresh + status --------------------------------------------------------------------------
  let polling = null;
  function statusText(st) {
    if (!st) return '';
    if (st.running && st.resolving) return `Looking up players on start.gg… ${st.message || ''}`;
    if (st.running && st.pulling) return `Pulling… ${st.message || ''}`;
    if (st.running && st.kind === 'archive') return `Archiving standings… ${st.message || ''}`;
    if (st.running && st.wl) return `W-L ${st.wl.done.toLocaleString()} / ${st.wl.total.toLocaleString()} (summary ${st.wl.summaryDone.toLocaleString()} / ${st.wl.summaryTotal.toLocaleString()})`;
    if (st.busy) return `Another tournament is refreshing (${st.busy}).`;
    if (st.phase === 'error') return `Refresh failed: ${st.error}`;
    if (st.phase === 'done') return `Refreshed. ${st.message || ''}`;
    return '';
  }
  // The status line also carries a short note from the last click (the ✓'s explanation). A note
  // stays until the next action replaces it (another ✓, an edit, a refresh); a refresh's own
  // progress text takes the line over while it runs.
  let note = '', noteErr = false, lastSt = null;
  function showNote(s, { err = false } = {}) {
    note = s || '';
    noteErr = !!note && err;
    const el = $('status');
    el.textContent = note || statusText(lastSt);
    el.classList.toggle('err', noteErr || (!note && !!(lastSt && lastSt.phase === 'error')));
  }
  // B4-2 (build A pass 4): a failed ✓ or edit says "Not saved" in the status line, which stays in view
  // when the table is scrolled (#msg sits above the table), and the cells that did not save flash red.
  function notSaved(body, cells) {
    showNote(`Not saved: ${(body && body.error) || 'error'}`, { err: true });
    for (const c of cells) { c.classList.add('save-failed'); setTimeout(() => c.classList.remove('save-failed'), 2500); }
  }
  function showStatus(st) {
    lastSt = st;
    const el = $('status');
    const t = statusText(st);
    if (t) note = '';
    el.textContent = t || note;
    el.classList.toggle('err', t ? !!(st && st.phase === 'error') : noteErr);
    $('refresh').disabled = !!(st && (st.running || st.busy));
    // The shared loading indicator (busy.js) follows the job: label, and W-L progress when known.
    if (window.Busy) Busy.job(st && (st.running || st.busy) ? (t || 'Working…') : null, st && st.running && st.wl && st.wl.total ? st.wl : null);
    if (window.showStopJob) window.showStopJob(st);   // the header's Stop button (tournament.js) follows this poll too
    if (st && (st.running || st.busy)) startPolling();
  }
  function startPolling() {
    if (polling) return;
    let lastDone = -1;
    polling = setInterval(async () => {
      let st;
      try { st = await (await fetch(tapi('status'), { cache: 'no-store' })).json(); } catch { return; }
      showStatus(st);
      const finished = !st.running && !st.busy;
      if (finished) { clearInterval(polling); polling = null; }
      // A new pull (swapped in as current) shows at once; the finished W-L shows when the job ends.
      const newRun = vm && st.run && st.run !== vm.run.folder;
      if (newRun || (finished && st.phase === 'done')) { load({ keep: true }); return; }
      if (st.running && st.wl && st.wl.done !== lastDone && st.wl.done > 0) {
        lastDone = st.wl.done;
        const b = $('update');
        b.hidden = false;
        b.textContent = `Show W-L so far (${st.wl.done.toLocaleString()} new)`;
      }
    }, 2000);
  }
  $('refresh').addEventListener('click', async () => {
    $('refresh').disabled = true;
    let res;
    try { res = await fetch(tapi('refresh'), { method: 'POST', headers: { 'X-Seeding-App': '1' } }); } catch (err) { showMsg(err.message); $('refresh').disabled = false; return; }
    const st = await res.json().catch(() => null);
    if (res.status === 409) $('status').textContent = `A refresh is already running${st && st.busy ? ` (${st.busy})` : ''}.`;
    if (st) showStatus(st);
    startPolling();
  });
  $('update').addEventListener('click', () => load({ keep: true }));

  // ---- Export to CSV (Noah, 2026-10-30): one export. The summary table in seed order with a Seed
  // column first (numbered by tier with the push's sequence; this table's current order within a
  // tier). A save dialog first (the File System Access API, which the app's webview and Chromium
  // browsers have; a plain download elsewhere), then a small progress card that goes away by itself.
  function tableOrder() {
    return [...table.querySelectorAll('tbody tr[data-pid]')].sort((a, b) => Number(a.dataset.i) - Number(b.dataset.i)).map((tr) => tr.dataset.pid);
  }
  const exportUi = {
    show(title, detail) { $('exportTitle').textContent = title; $('exportDetail').textContent = detail || ''; $('exportBar').style.width = '0%'; $('exportModal').classList.remove('done', 'err'); $('exportModal').hidden = false; },
    progress(frac) { $('exportBar').style.width = `${Math.round(100 * Math.max(0, Math.min(1, frac)))}%`; },
    finish(title, detail, err) {
      $('exportTitle').textContent = title; $('exportDetail').textContent = detail || ''; $('exportBar').style.width = '100%';
      $('exportModal').classList.toggle('done', !err); $('exportModal').classList.toggle('err', !!err);
      clearTimeout(exportUi.t); exportUi.t = setTimeout(() => { $('exportModal').hidden = true; }, err ? 6000 : 3000);
    },
  };
  function suggestedName() {
    const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    return `${slug(T)}-${slug(vm && vm.tab && vm.tab.game && vm.tab.game.name)}-seeding.csv`;
  }
  async function fetchCsvWithProgress(url, onProgress, order) {
    // The table order goes in the body: every registrant's id does not fit in a URL (431 past ~2000).
    const res = await fetch(url, { method: 'POST', cache: 'no-store', headers: { 'X-Seeding-App': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ order }) });
    if (!res.ok) throw new Error(`The server answered ${res.status}.`);
    const total = Number(res.headers.get('Content-Length')) || 0;
    const fromHeader = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '');
    const chunks = []; let got = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); got += value.length;
      onProgress(total ? got / total : 0.5);
    }
    return { blob: new Blob(chunks, { type: 'text/csv;charset=utf-8' }), filename: fromHeader ? fromHeader[1] : suggestedName(), bytes: got };
  }
  $('exportCsv').addEventListener('click', async () => {
    const url = api('export.csv');
    const order = tableOrder();
    let handle = null;
    if (window.showSaveFilePicker) {
      try {
        handle = await window.showSaveFilePicker({ suggestedName: suggestedName(), types: [{ description: 'CSV', accept: { 'text/csv': ['.csv'] } }] });
      } catch (err) { if (err && err.name === 'AbortError') return; handle = null; }   // cancelled: nothing happens; unavailable: plain download
    }
    exportUi.show('Exporting…', 'Building the table');
    $('exportCsv').disabled = true;
    try {
      const { blob, filename, bytes } = await fetchCsvWithProgress(url, exportUi.progress, order);
      if (handle) {
        exportUi.progress(0.95); $('exportDetail').textContent = 'Saving';
        const w = await handle.createWritable(); await w.write(blob); await w.close();
        exportUi.finish('Exported', `${handle.name || filename} · ${(bytes / 1024).toFixed(0)} KB`);
      } else {
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
        exportUi.finish('Exported', `${filename} · ${(bytes / 1024).toFixed(0)} KB (to your downloads)`);
      }
    } catch (err) {
      exportUi.finish('Export failed', err.message, true);
    } finally { $('exportCsv').disabled = false; }
  });

  // ---- Push to start.gg (docs/design-tool.md, Outputs 2): dry run first, always --------------------
  // A dry run reads the phase's seeds (start.gg's current order) and shows current -> proposed. The
  // post needs a click on that dry run and a confirm; the server re-reads the seeds and refuses if
  // anything changed since (the fingerprint). Failures are one status line, no retry.
  const pushPanel = $('push');
  let dry = null;
  function pushLine(text, err) { const el = $('pushStatus'); el.textContent = text || ''; el.classList.toggle('err', !!err); }
  function renderPushEvents() {
    $('pushEvents').innerHTML = (TAB.events || []).map((slug) => {
      const ev = (TAB.eventInfo || {})[slug] || { name: slug };
      return `<button type="button" class="push-dry" data-e="${R.esc(slug)}">Dry run: ${R.esc(ev.name)}</button>`;
    }).join('');
  }
  function setPush(on) {
    pushPanel.hidden = !on;
    $('pushToggle').setAttribute('aria-pressed', String(on));
    if (on) renderPushEvents();
  }
  $('pushToggle').addEventListener('click', () => setPush(pushPanel.hidden));
  $('pushClose').addEventListener('click', () => setPush(false));
  async function postJson(url, body) {
    let res, out;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'X-Seeding-App': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
      out = await res.json().catch(() => ({}));
    } catch (err) { return { ok: false, body: { error: err.message } }; }
    return { ok: res.ok, body: out };
  }
  // A2.3 (Noah, 2026-11-06: rows stay draggable right up to the push). The dry run sends the order on
  // screen and is redrawn in the page after every move or tier edit (M.pushPlan over the dry run's
  // entries: start.gg's seeds, with this page's tiers), so it never shows a stale order and dragging
  // is never paused. Post waits for every seed save in flight, then sends the order as it is at the
  // click; the server saves it and posts it. After a post the panel stays: drag and post again.
  const postButton = () => `<p><button type="button" id="pushPost" class="danger">Post this seeding to start.gg</button> <span class="dim">Sets all ${dry.summary.seeds} seeds of phase "${R.esc(dry.phase.name || dry.phase.id)}" as proposed, in the order shown when you click.</span></p>`;
  async function runDry(e) {
    dry = null;
    pushLine(`Dry run for ${e}: reading start.gg's seeds…`);
    $('pushBody').innerHTML = '';
    await seedWrites;
    const r = await postJson(tapi(`push/${encodeURIComponent(e)}/dry-run`), { seeding: currentSeeding(e) });
    if (!r.ok) { pushLine(r.body.error || 'Dry run failed.', true); return; }
    dry = r.body;
    pushLine(`Dry run: ${dry.event.name}, phase "${dry.phase.name || dry.phase.id}". Nothing has been sent.`);
    $('pushBody').innerHTML = R.pushDiffTable(dry) + postButton();
  }
  // The dry run's start.gg seeds with the tiers this page shows now (a tier edited since the dry run).
  function liveEntries(entries) {
    return entries.map((e) => (e.mappable && byId.has(String(e.player_id)) ? { ...e, tier: tierOfId(String(e.player_id)) } : e));
  }
  function redrawPush() {
    if (!dry || !dry.entries || pushPanel.hidden) return;
    const s = currentSeeding(dry.event.slug);
    const plan = M.pushPlan(liveEntries(dry.entries), { arrangement: s.mode === 'arranged' ? s.order : null });
    dry = { ...dry, mode: plan.mode, rows: plan.rows, summary: plan.summary };
    const keep = document.activeElement && document.activeElement.id === 'pushPost';
    const disabled = $('pushPost') && $('pushPost').disabled;
    $('pushBody').innerHTML = R.pushDiffTable(dry) + postButton();
    if (disabled) $('pushPost').disabled = true;
    if (keep) $('pushPost').focus({ preventScroll: true });
  }
  async function postSeeding() {
    if (!dry) return;
    const btn = $('pushPost');
    if (btn) btn.disabled = true;
    await seedWrites;   // every drag saved, in order, before anything is posted
    redrawPush();       // the confirm counts from the order as it is now
    const flagged = dry.summary.crosses_tier ? ` ${dry.summary.crosses_tier} seed(s) move across a tier boundary relative to start.gg's current order: a conflict fix made by hand there would be reverted.` : '';
    const order = dry.mode === 'arranged' ? 'your arranged seed order' : 'tier order (start.gg\'s order within each tier)';
    if (!window.confirm(`Post the proposed seeding for ${dry.event.name} (phase "${dry.phase.name || dry.phase.id}") to start.gg, in ${order}?${flagged}`)) { if ($('pushPost')) $('pushPost').disabled = false; return; }
    pushLine('Posting to start.gg…');
    // The order is read here, after the confirm: the one on screen at the click.
    const r = await postJson(tapi(`push/${encodeURIComponent(dry.event.slug)}/post`), { fingerprint: dry.fingerprint, confirm: true, seeding: currentSeeding(dry.event.slug) });
    if (!r.ok) {
      if (r.body && r.body.failure === 'stale') {
        // start.gg's side changed (not this page's order): a fresh dry run, then Noah posts again.
        const slug = dry.event.slug;
        await runDry(slug);
        pushLine('start.gg\'s seeding changed since the dry run, so nothing was posted. This is a fresh dry run: check it and post again.', true);
        return;
      }
      pushLine(r.body.error || 'Not posted.', true); if ($('pushPost')) $('pushPost').disabled = false; return;
    }
    // start.gg now has the posted order: the dry run's "current" becomes it, so a re-push needs no new dry run.
    dry = { ...dry, entries: r.body.entries, fingerprint: r.body.fingerprint };
    redrawPush();
    if ($('pushPost')) $('pushPost').disabled = false;   // a re-push is one click away
    pushLine(`Posted: ${r.body.seed_count} seeds for ${dry.event.name} in ${r.body.seed_order === 'arranged' ? 'your arranged order' : 'tier order'} at ${new Date(r.body.at).toLocaleString()}. Recorded in this tournament's pushes. Rows stay draggable: drag and post again to update start.gg.`);
  }
  pushPanel.addEventListener('click', (ev) => {
    const d = ev.target.closest('button.push-dry');
    if (d) { runDry(d.dataset.e); return; }
    if (ev.target.closest('#pushPost')) postSeeding();
  });

  // ---- Sorting the summary: click a header (again to reverse). Pinned rows stay put. ------------
  // Cells carry data-v (lib/view/render.js): tier number, tag/region text, or best placement /
  // field size for majors/series (lower = better). Tier sorts high-first on the first click.
  function sortSummary(th) {
    const key = th.dataset.col;
    if (!key || key === 'notes') return;
    const i = th.cellIndex;
    const first = key === 'tier' ? -1 : 1;
    const dir = th.dataset.dir ? -Number(th.dataset.dir) : first;
    for (const h of thead.rows[0].cells) delete h.dataset.dir;
    th.dataset.dir = String(dir);
    // A2.3: Seed ascending is the seed order itself (the order rows move in when dragged).
    if (key === 'seed' && dir === 1) { sortedBy = null; refreshSeeds(); return; }
    sortedBy = { key, dir };
    const val = (tr) => { const c = tr.cells[i]; return c && c.dataset.v != null ? c.dataset.v : (c ? c.innerText : ''); };
    const rows = [...mainBody.rows];
    rows.sort((a, b) => {
      const x = val(a), y = val(b), nx = parseFloat(x), ny = parseFloat(y);
      const c = (!isNaN(nx) && !isNaN(ny)) ? nx - ny : String(x).localeCompare(String(y));
      return c * dir || Number(a.dataset.i) - Number(b.dataset.i);
    });
    mainBody.append(...rows);
    rows.forEach((tr, k) => { tr.dataset.i = String(k); });
  }

  // ---- Editing Tier and Notes: double-click a cell, or focus it and press Enter (or F2). ---------
  // Enter saves, Esc cancels, clicking away saves (spreadsheet conventions). Notes: Shift+Enter is
  // a new line. Saves go to registry/tiers.csv via POST .../player/<id>; only that row re-renders.
  let editing = null;
  function openEditor(td) {
    if (editing || !td || !td.dataset.edit) return;
    const tr = td.closest('tr'), pid = tr.dataset.pid, n = ctx.notes[pid] || {};
    const kind = td.dataset.edit;
    const box = document.createElement('div');
    box.className = `editor editor-${kind}`;
    if (kind === 'tier') {
      box.innerHTML = '<label>Tier <input class="ed-tier" type="number" min="0" max="20" step="1"></label>'
        + '<div class="ed-hint">Enter saves · Esc cancels</div>';
      box.querySelector('.ed-tier').value = Number.isFinite(n.tier) ? n.tier : '';
    } else {
      box.innerHTML = '<textarea class="ed-notes" rows="4" placeholder="notes"></textarea><div class="ed-hint">Enter saves · Shift+Enter new line · Esc cancels</div>';
      box.querySelector('.ed-notes').value = n.notes || '';
    }
    td.classList.add('editing');
    td.appendChild(box);
    // Near the window's right edge the popover hangs left from the cell instead of running off-screen.
    const edge = document.documentElement.clientWidth - 8;
    if (td.getBoundingClientRect().left + box.offsetWidth > edge) box.classList.add('flip');
    editing = { td, tr, pid, kind, box };
    const first = box.querySelector('input,textarea');
    first.focus();
    if (first.select) first.select();
    box.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { ev.preventDefault(); closeEditor(false); }
      else if (ev.key === 'Enter' && !(kind === 'notes' && ev.shiftKey)) { ev.preventDefault(); closeEditor(true); }
    });
    box.addEventListener('focusout', (ev) => { if (!box.contains(ev.relatedTarget)) closeEditor(true); });
    box.addEventListener('dblclick', (ev) => ev.stopPropagation());
    box.addEventListener('click', (ev) => ev.stopPropagation());
  }
  async function closeEditor(save) {
    if (!editing) return;
    const { td, pid, kind, box } = editing;
    editing = null;
    const fields = kind === 'tier'
      ? { tier: box.querySelector('.ed-tier').value.trim() }
      : { notes: box.querySelector('.ed-notes').value };
    box.remove();
    td.classList.remove('editing');
    if (!save) { td.focus(); return; }
    showNote('');
    const n = ctx.notes[pid] || {};
    const same = kind === 'tier'
      ? String(Number.isFinite(n.tier) ? n.tier : '') === fields.tier
      : (n.notes || '') === fields.notes;
    if (same) { td.focus(); return; }
    td.classList.add('saving');
    let res, body;
    try {
      res = await fetch(api(`player/${encodeURIComponent(pid)}`), { method: 'POST', headers: { 'X-Seeding-App': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(fields) });
      body = await res.json().catch(() => ({}));
    } catch (err) { body = { error: err.message }; res = { ok: false }; }
    td.classList.remove('saving');
    if (!res.ok) { notSaved(body, [td]); return; }
    showMsg('');
    ctx.notes[pid] = { ...n, tier: body.tier == null ? undefined : body.tier, notes: body.notes,
      last_reviewed_on: body.last_reviewed_on, last_reviewed_tournament: body.last_reviewed_tournament,
      // A1.2: a write that linked the row (both ids written) ends the tag-only color.
      tag_only: body.linked ? undefined : n.tag_only };
    ctx.hasTiers = true;
    // A2.3: in tier order a tier edit moves the player's seed (an arranged order keeps its place).
    computeSeeds();
    rerenderRow(pid, kind);
    if (kind === 'tier') {
      refreshSeeds();
      renderSeedBar();
      redrawPush();
      const cell = table.querySelector(`tbody tr[data-pid="${CSS.escape(pid)}"] td[data-edit="tier"]`);
      if (cell && document.activeElement !== cell) { cell.focus({ preventScroll: true }); cell.scrollIntoView({ block: 'nearest' }); }
    }
  }
  function rerenderRow(pid, focusKind) {
    const p = byId.get(String(pid));
    const html = R.summaryRow(p, ctx, { app: true });
    rowHtml.set(String(pid), html);
    for (const tr of table.querySelectorAll(`tbody tr[data-pid="${CSS.escape(String(pid))}"]`)) {
      const tmp = document.createElement('tbody');
      tmp.innerHTML = html;
      const fresh = tmp.firstElementChild;
      fresh.dataset.i = tr.dataset.i;
      tr.replaceWith(fresh);
      const cell = fresh.querySelector(`td[data-edit="${focusKind}"]`);
      if (cell) { cell.classList.add('saved'); setTimeout(() => cell.classList.remove('saved'), 1200); cell.focus(); }
    }
    applyFreeze();
    layoutPins();
    syncSel();
    if (cmp.on && cmp.ids.includes(String(pid))) renderCompare();
  }
  table.addEventListener('dblclick', (ev) => {
    const td = ev.target.closest('td[data-edit]');
    if (td) { ev.preventDefault(); openEditor(td); }
  });
  table.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== 'F2') return;
    const td = ev.target.closest && ev.target.closest('td[data-edit]');
    if (td && ev.target === td) { ev.preventDefault(); openEditor(td); }
  });

  // ---- Compare by selecting rows: tick two rows' boxes. A third tick replaces the older pick. ----
  function syncSel() {
    for (const tr of table.querySelectorAll('tbody tr[data-pid]')) {
      const at = cmp.ids.indexOf(tr.dataset.pid), on = at >= 0;
      const full = !on && cmp.ids.length >= CMP_MAX;
      tr.classList.toggle('selected', on);
      const box = tr.querySelector('input.sel');
      if (box) {
        box.checked = on;
        box.disabled = full;
        box.title = on ? `Selected as ${'ABC'[at]} (untick to deselect)`
          : full ? `${CMP_MAX} players selected — deselect one to pick another` : `Select to compare (up to ${CMP_MAX})`;
      }
    }
    fillPickers();
  }
  table.addEventListener('change', (ev) => {
    const box = ev.target.closest('input.sel');
    if (!box) return;
    const pid = box.closest('tr').dataset.pid;
    if (box.checked) {
      if (cmp.ids.length >= CMP_MAX) { box.checked = false; return; } // the cap: no automatic overwrite
      setSelection([...cmp.ids, pid]);
    } else setSelection(cmp.ids.filter((id) => id !== pid));
  });

  // ---- Jump to a player: type a tag, Enter (or pick from the list) scrolls to the row. ----------
  function jumpTo(value) {
    const r = resolve(value, true);
    if (!r || !r.id) return false;
    const tr = table.querySelector(`tbody tr[data-pid="${CSS.escape(r.id)}"]`);
    if (!tr) return false;
    if (getComputedStyle(tr).display === 'none') { $('needsOnly').checked = false; $('needsOnly').dispatchEvent(new Event('change')); }
    tr.scrollIntoView({ block: 'center' });
    tr.classList.add('flash');
    setTimeout(() => tr.classList.remove('flash'), 1600);
    const cell = tr.querySelector('td[data-edit="tier"]');
    if (cell) cell.focus({ preventScroll: true });
    return true;
  }
  const jump = $('jump');
  if (jump) {
    jump.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); if (jumpTo(jump.value)) jump.select(); } });
    jump.addEventListener('change', () => { if (jumpTo(jump.value)) jump.select(); });
  }

  // ---- Start --------------------------------------------------------------------------------------
  if (cmp.on) { compare.hidden = false; $('compareToggle').setAttribute('aria-pressed', 'true'); }
  load().then(() => { if (cmp.on) renderCompare(); });
}());

// "Needs tier only": hide summary rows that have a tier (rows without one carry class="untiered").
(function () {
  const box = document.getElementById('needsOnly');
  if (!box) return;
  const KEY = 'seeding:needsOnly:' + location.pathname;
  try { box.checked = localStorage.getItem(KEY) === '1'; } catch { /* per-viewer convenience only */ }
  const apply = () => { document.body.classList.toggle('needs-only', box.checked); try { localStorage.setItem(KEY, box.checked ? '1' : '0'); } catch { /* ignore */ } };
  box.addEventListener('change', apply);
  apply();
})();

// "Show team": hide or show the Team column (main table + compare panel). Per viewer, remembered.
(function () {
  const box = document.getElementById('showTeam');
  if (!box) return;
  const KEY = 'seeding:showTeam';
  try { box.checked = localStorage.getItem(KEY) !== '0'; } catch { /* per-viewer convenience only */ }
  const apply = () => {
    document.body.classList.toggle('hide-team', !box.checked);
    try { localStorage.setItem(KEY, box.checked ? '1' : '0'); } catch { /* ignore */ }
    window.dispatchEvent(new Event('resize')); // re-measure frozen columns, pinned rows and the compare panel
  };
  box.addEventListener('change', apply);
  apply();
})();
