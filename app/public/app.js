// app/public/app.js — the event page. Fetches the view model from /api/e/<t>/<e>/data and renders
// it with SeedRender (lib/view/render.js, the same cells as views/major-table.js).
//   - Summary first; per-player detail renders as it scrolls near the viewport.
//   - 📌 pins rows into a block frozen under the sticky header (localStorage, per event).
//   - ⇅ Compare opens the lower half: two players' summary rows, events both entered, series side by side.
//   - Refresh re-pulls on the server; this page polls /status and shows the new run when it lands.
(function () {
  'use strict';
  const M = window.SeedModel, R = window.SeedRender;
  const parts = location.pathname.split('/').filter(Boolean); // e, <t>, <e>
  const T = parts[1], E = parts[2], SLUG = `${T}/${E}`;
  const api = (what) => `/api/e/${encodeURIComponent(T)}/${encodeURIComponent(E)}/${what}`;
  const $ = (id) => document.getElementById(id);
  const pane = $('pane'), table = $('summary'), thead = table.tHead, pinnedBody = table.tBodies[0], mainBody = table.tBodies[1];
  const details = $('details'), compare = $('compare'), cmpBody = $('cmpBody');
  const perf = (window.__seedPerf = { marks: {} });
  const mark = (k) => { perf.marks[k] = Math.round(performance.now()); };

  // localStorage is a convenience: any failure (private mode, quota, bad JSON) falls back to defaults.
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
  };
  const PIN_KEY = `seeding:pins:${SLUG}`, CMP_KEY = `seeding:compare:${SLUG}`;
  let pins = store.get(PIN_KEY, []);
  if (!Array.isArray(pins)) pins = [];
  let cmp = store.get(CMP_KEY, { on: false, a: null, b: null });
  if (!cmp || typeof cmp !== 'object') cmp = { on: false, a: null, b: null };

  let vm = null, ctx = null, byId = new Map(), ordered = [], observer = null;

  // ---- Data ------------------------------------------------------------------------------------
  function hydrate(model) {
    const cols = model.cols;
    const rows = model.rows.map((a) => { const o = {}; for (let i = 0; i < cols.length; i++) o[cols[i]] = a[i]; return o; });
    const players = model.players;
    const c = R.summaryContext({ meta: model.meta, players, rows, records: model.records, notes: model.notes || {},
      columns: model.columns, index: M.indexFromKeys(model.labels) });
    c.otherNote = '; W-L not fetched for other games';
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
    document.title = `${ev.name || 'Event'} — seeding`;
    $('title').textContent = [ev.tournament_name, ev.name].filter(Boolean).join(' · ');
    const w = vm.meta.window || {};
    const runAt = new Date(vm.run.run_at);
    $('sub').textContent = `${vm.meta.game.name} · ${vm.meta.registrant_count} registrants · results ${String(w.start).slice(0, 10)} to ${String(w.end).slice(0, 10)}`
      + ` · pulled ${runAt.toLocaleString()} · W-L known for ${vm.wl.known.toLocaleString()} of ${vm.wl.total.toLocaleString()} ${vm.meta.game.name} results`;
  }

  // ---- Summary + pins --------------------------------------------------------------------------
  let rowHtml = new Map();
  function renderSummary() {
    thead.innerHTML = R.summaryHeadRow(ctx);
    rowHtml = new Map(ordered.map((p) => [String(p.player_id), R.summaryRow(p, ctx, { app: true })]));
    pins = pins.filter((id) => byId.has(String(id))).map(String);
    const pinned = new Set(pins);
    pinnedBody.innerHTML = pins.map((id) => rowHtml.get(id)).join('');
    mainBody.innerHTML = ordered.map((p, i) => (pinned.has(String(p.player_id)) ? '' : rowHtml.get(String(p.player_id)).replace('<tr ', `<tr data-i="${i}" `))).join('');
    for (const tr of pinnedBody.rows) tr.dataset.i = String(ordered.findIndex((p) => String(p.player_id) === tr.dataset.pid));
    layoutPins();
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
    const p = byId.get(sec.dataset.pid);
    const body = sec.querySelector('.body');
    body.innerHTML = R.playerBody(p, ctx, { lazy: true });
    body.style.minHeight = '';
    sec.classList.add('rendered');
    if (observer) observer.unobserve(sec);
  }
  function renderDetails(eager) {
    if (observer) observer.disconnect();
    details.innerHTML = ordered.map((p) => `<section class="player" data-pid="${R.esc(p.player_id)}">${R.playerTitle(p)}`
      + `<div class="body" style="min-height:${estimate(p)}px"></div></section>`).join('');
    const want = new Set(eager);
    observer = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) renderSection(en.target);
    }, { root: pane, rootMargin: '1200px 0px' }) : null;
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
    sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---- Sorting (any table.sortable, including ones rendered later) ------------------------------
  document.addEventListener('click', (ev) => {
    const pinBtn = ev.target.closest('button.pin');
    if (pinBtn) { togglePin(pinBtn.closest('tr')); return; }
    const link = ev.target.closest('a[href^="#p"]');
    if (link) { ev.preventDefault(); goToPlayer(link.getAttribute('href').slice(2)); return; }
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
    $('pickA').value = cmp.a && idToLabel.get(cmp.a) || '';
    $('pickB').value = cmp.b && idToLabel.get(cmp.b) || '';
  }
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
  function pick(which, value, final = false) {
    const r = resolve(value, final);
    if (!r) return; // still typing, or ambiguous
    const id = r.id;
    if (final && id) $(which === 'a' ? 'pickA' : 'pickB').value = idToLabel.get(id);
    if (cmp[which] === id) return;
    cmp[which] = id || null;
    store.set(CMP_KEY, cmp);
    renderCompare();
  }
  for (const [el, which] of [[$('pickA'), 'a'], [$('pickB'), 'b']]) {
    el.addEventListener('input', () => pick(which, el.value));
    el.addEventListener('change', () => pick(which, el.value, true));
    el.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') pick(which, el.value, true); });
    el.addEventListener('focus', () => el.select());
  }
  $('swap').addEventListener('click', () => {
    [cmp.a, cmp.b] = [cmp.b, cmp.a];
    store.set(CMP_KEY, cmp);
    fillPickers();
    renderCompare();
  });

  function setCompare(on) {
    const t0 = performance.now();
    cmp.on = on;
    store.set(CMP_KEY, cmp);
    compare.hidden = !on;
    $('compareToggle').setAttribute('aria-pressed', String(on));
    if (on) {
      renderCompare();
      requestAnimationFrame(() => setTimeout(() => { perf.compareOpenMs = Math.round(performance.now() - t0); }, 0));
      if (!cmp.a) $('pickA').focus(); else if (!cmp.b) $('pickB').focus();
    }
    layoutPins();
  }
  $('compareToggle').addEventListener('click', () => setCompare(!cmp.on));
  $('compareClose').addEventListener('click', () => setCompare(false));

  function renderCompare() {
    if (!vm || !cmp.on) return;
    const t0 = performance.now();
    const A = cmp.a && byId.get(cmp.a), B = cmp.b && byId.get(cmp.b);
    if (!A || !B) {
      cmpBody.innerHTML = `<p class="hint">Pick two players above (type part of a tag). ${A || B ? 'One more to go.' : ''}</p>`;
      return;
    }
    cmpBody.innerHTML = `<h3>Summary</h3><div class="cmp-sum-wrap"><table class="summary"><colgroup></colgroup><thead>${R.summaryHeadRow(ctx)}</thead>`
      + `<tbody>${R.summaryRow(A, ctx)}${R.summaryRow(B, ctx)}</tbody></table></div>`
      + `<h3>Events both entered</h3><p class="dim">Placement and W-L of each at the same event. This is not head-to-head sets.</p>${R.bothEnteredTable(A, B, ctx)}`
      + `<h3>Series</h3><p class="dim">${R.esc(vm.meta.game.name)} only. A series both have played is on one row (shaded).</p>${R.compareSeriesTable(A, B, ctx)}`;
    alignCompare();
    perf.compareRenderMs = Math.round(performance.now() - t0);
  }

  // The compare panel's summary rows use the main table's column widths, and follow its sideways scroll.
  function alignCompare() {
    const wrap = cmpBody.querySelector('.cmp-sum-wrap');
    if (!wrap) return;
    const widths = [...thead.rows[0].cells].map((th) => th.getBoundingClientRect().width);
    const t = wrap.querySelector('table');
    t.querySelector('colgroup').innerHTML = widths.map((w) => `<col style="width:${w}px">`).join('');
    t.style.width = `${widths.reduce((a, b) => a + b, 0)}px`;
    wrap.scrollLeft = pane.scrollLeft;
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

  window.addEventListener('resize', () => { layoutPins(); if (cmp.on) alignCompare(); });

  // ---- Refresh + status --------------------------------------------------------------------------
  let polling = null;
  function statusText(st) {
    if (!st) return '';
    if (st.running && st.pulling) return `Pulling… ${st.message || ''}`;
    if (st.running && st.wl) return `W-L ${st.wl.done.toLocaleString()} / ${st.wl.total.toLocaleString()} (summary ${st.wl.summaryDone.toLocaleString()} / ${st.wl.summaryTotal.toLocaleString()})`;
    if (st.busy) return `Another event is refreshing (${st.busy}).`;
    if (st.phase === 'error') return `Refresh failed: ${st.error}`;
    if (st.phase === 'done') return `Refreshed. ${st.message || ''}`;
    return '';
  }
  function showStatus(st) {
    const el = $('status');
    el.textContent = statusText(st);
    el.classList.toggle('err', !!(st && st.phase === 'error'));
    $('refresh').disabled = !!(st && (st.running || st.busy));
    if (st && (st.running || st.busy)) startPolling();
  }
  function startPolling() {
    if (polling) return;
    let lastDone = -1;
    polling = setInterval(async () => {
      let st;
      try { st = await (await fetch(api('status'), { cache: 'no-store' })).json(); } catch { return; }
      showStatus(st);
      const newRun = vm && st.run && st.run !== vm.run.folder;
      if (newRun) { load({ keep: true }); return; } // the pull finished: show the new run now
      if (st.running && st.wl && st.wl.done !== lastDone && st.wl.done > 0) {
        lastDone = st.wl.done;
        const b = $('update');
        b.hidden = false;
        b.textContent = `Show W-L so far (${st.wl.done.toLocaleString()} new)`;
      }
      if (!st.running && !st.busy) {
        clearInterval(polling); polling = null;
        if (st.phase === 'done') load({ keep: true });
      }
    }, 2000);
  }
  $('refresh').addEventListener('click', async () => {
    $('refresh').disabled = true;
    let res;
    try { res = await fetch(api('refresh'), { method: 'POST', headers: { 'X-Seeding-App': '1' } }); } catch (err) { showMsg(err.message); $('refresh').disabled = false; return; }
    const st = await res.json().catch(() => null);
    if (res.status === 409) $('status').textContent = `A refresh is already running${st && st.busy ? ` (${st.busy})` : ''}.`;
    if (st) showStatus(st);
    startPolling();
  });
  $('update').addEventListener('click', () => load({ keep: true }));

  // ---- Start --------------------------------------------------------------------------------------
  if (cmp.on) { compare.hidden = false; $('compareToggle').setAttribute('aria-pressed', 'true'); }
  load().then(() => { if (cmp.on) renderCompare(); });
}());
