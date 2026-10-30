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

  $('export').href = api('export.csv');

  // ---- Export seeds CSV (docs/design-tool.md, Outputs 1): the table's current order, as shown ------
  // (pinned rows at their place in the sort), numbered by tier on the server with the same function
  // the push uses (lib/view/model.js seedSequence). No start.gg request.
  function tableOrder() {
    return [...table.querySelectorAll('tbody tr[data-pid]')].sort((a, b) => Number(a.dataset.i) - Number(b.dataset.i)).map((tr) => tr.dataset.pid);
  }
  $('exportSeeds').addEventListener('click', () => { $('exportSeeds').href = api(`seeds.csv?order=${tableOrder().join(',')}`); });

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
  async function runDry(e) {
    dry = null;
    pushLine(`Dry run for ${e}: reading start.gg's seeds…`);
    $('pushBody').innerHTML = '';
    const r = await postJson(tapi(`push/${encodeURIComponent(e)}/dry-run`));
    if (!r.ok) { pushLine(r.body.error || 'Dry run failed.', true); return; }
    dry = r.body;
    pushLine(`Dry run: ${dry.event.name}, phase "${dry.phase.name || dry.phase.id}". Nothing has been sent.`);
    $('pushBody').innerHTML = R.pushDiffTable(dry)
      + `<p><button type="button" id="pushPost" class="danger">Post this seeding to start.gg</button> <span class="dim">Sets all ${dry.summary.seeds} seeds of phase "${R.esc(dry.phase.name || dry.phase.id)}" as proposed.</span></p>`;
  }
  async function postSeeding() {
    if (!dry) return;
    const flagged = dry.summary.crosses_tier ? ` ${dry.summary.crosses_tier} seed(s) move across a tier boundary relative to start.gg's current order: a conflict fix made by hand there would be reverted.` : '';
    if (!window.confirm(`Post the proposed seeding for ${dry.event.name} (phase "${dry.phase.name || dry.phase.id}") to start.gg?${flagged}`)) return;
    const btn = $('pushPost');
    if (btn) btn.disabled = true;
    pushLine('Posting to start.gg…');
    const r = await postJson(tapi(`push/${encodeURIComponent(dry.event.slug)}/post`), { fingerprint: dry.fingerprint, confirm: true });
    if (!r.ok) { pushLine(r.body.error || 'Not posted.', true); if (btn) btn.disabled = false; return; }
    pushLine(`Posted: ${r.body.seed_count} seeds for ${dry.event.name} at ${r.body.at}. Recorded in this tournament's pushes.`);
    if (btn) btn.remove();
    dry = null;
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
    rerenderRow(pid, kind);
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
