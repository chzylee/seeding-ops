// app/public/tournament.js — the tournament page's shell (docs/design-tool.md, Pages and Lifecycle):
// the header (title, computed status, the live pull's facts), the seeded-events picker (singles only),
// the tabs (one per seeded game, plus Schedule), Refresh when no game tab is open, and the lifecycle
// controls (Mark done, Archive standings, Delete tournament data). It then loads the open tab's own
// script: app.js for a game (window.SEED_TAB) or schedule.js for the Schedule tab (window.SCHEDULE_T).
// Before the first pool exists the page shows the picker and a Pull button with status; no tabs.
(function () {
  'use strict';
  const T = decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] || '').toLowerCase();
  const q = new URLSearchParams(location.search);
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const tapi = (w) => `/api/t/${encodeURIComponent(T)}${w ? `/${w}` : ''}`;
  let info = null, active = null, polling = null;

  async function post(url, body) {
    let res, out;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'X-Seeding-App': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
      out = await res.json().catch(() => ({}));
    } catch (err) { return { ok: false, status: 0, body: { error: err.message } }; }
    return { ok: res.ok, status: res.status, body: out };
  }
  function line(text, err) { const el = $('tline'); el.textContent = text || ''; el.classList.toggle('err', !!err); }

  function jobText(st) {
    if (!st) return '';
    if (st.running && st.pulling) return `Pulling… ${st.message || ''}`;
    if (st.running && st.kind === 'archive') return `Archiving standings… ${st.message || ''}`;
    if (st.running) return `W-L ${st.wl ? `${st.wl.done} / ${st.wl.total}` : '…'}`;
    if (st.busy) return `Another tournament is busy (${st.busy}).`;
    if (st.phase === 'error') return `Failed: ${st.error}`;
    if (st.phase === 'done') return st.message || 'Done.';
    return '';
  }

  function renderHeader() {
    const t = info.tournament || {};
    document.title = `${t.name || T} — seeding`;
    $('title').textContent = t.name || T;
    const pill = $('tstatus');
    pill.textContent = info.status + (info.marked_done && !info.archived ? ' (marked)' : '');
    pill.className = `pill st-${info.status}`;
    const p = info.pull;
    const facts = [];
    if (t.start_at) facts.push(`starts ${new Date(t.start_at).toLocaleString()}`);
    if (p) facts.push(`pool: ${p.registrant_count} players, pulled ${new Date(p.run_at).toLocaleString()}${p.incremental ? ` (+${p.incremental.fetched} added ${new Date(p.incremental.at).toLocaleString()})` : ''}`);
    else facts.push('not pulled yet');
    if (info.pushes && info.pushes.length) { const last = info.pushes[info.pushes.length - 1]; facts.push(`last push: ${last.event} at ${new Date(last.at).toLocaleString()} (${last.seed_count} seeds)`); }
    if (info.standings) facts.push('standings archived');
    if (active !== 'game') $('sub').textContent = facts.join(' · ');
    else $('sub').title = facts.join(' · ');
    const c = info.controls;
    $('markDone').hidden = !c.markDone;
    $('unmarkDone').hidden = !c.unmarkDone;
    $('archive').hidden = !c.archive;
    $('delete').hidden = !c.delete;
  }

  function renderPicker() {
    const pre = q.get('tick');
    const rows = info.events.map((e) => {
      const ticked = info.ticked.includes(e.slug) || (!info.pull && pre === e.slug);
      const when = e.start_at ? new Date(e.start_at).toLocaleString() : 'no start time';
      const facts = `${esc(e.game ? e.game.name : '?')} · ${e.num_entrants ?? '?'} entrants · ${esc(when)}`;
      if (!e.singles) return `<label class="pick off" title="Teams events have no player-to-seed mapping and cannot be seeded"><input type="checkbox" disabled> ${esc(e.name)} <span class="dim">· teams, not seedable</span></label>`;
      return `<label class="pick"><input type="checkbox" value="${esc(e.slug)}"${ticked ? ' checked' : ''}> ${esc(e.name)} <span class="dim">· ${facts}</span></label>`;
    });
    $('picker').innerHTML = rows.join('') || '<p class="dim">This tournament has no events on start.gg.</p>';
  }
  const pickedSlugs = () => [...$('picker').querySelectorAll('input[type=checkbox]:checked')].map((b) => b.value).filter(Boolean);

  function renderTabs() {
    const tabs = info.pull ? info.tabs : [];
    const links = tabs.map((tab) => ({ key: String(tab.game.id), label: tab.game.name }));
    if (info.pull || active === 'schedule') links.push({ key: 'schedule', label: 'Schedule' });
    $('tabs').innerHTML = links.map((l) => `<a href="/t/${encodeURIComponent(T)}?tab=${encodeURIComponent(l.key)}"${l.key === activeKey ? ' aria-current="page" class="on"' : ''}>${esc(l.label)}</a>`).join('');
    $('tabs').hidden = !links.length;
  }

  let activeKey = null;
  function choose() {
    const want = q.get('tab');
    const tabs = info.pull ? info.tabs : [];
    if (want === 'schedule') { active = 'schedule'; activeKey = 'schedule'; return null; }
    const tab = tabs.find((x) => String(x.game.id) === want) || (want ? null : tabs[0]);
    if (tab) { active = 'game'; activeKey = String(tab.game.id); return tab; }
    active = 'setup'; activeKey = null;
    return null;
  }

  function loadScript(src) { const s = document.createElement('script'); s.src = src; document.body.appendChild(s); }

  function openTab(tab) {
    if (active === 'game') {
      $('seedBar').hidden = false;
      $('pane').hidden = false;
      const eventInfo = Object.fromEntries(info.events.map((e) => [e.slug, { name: e.name }]));
      window.SEED_TAB = { t: T, game: tab.game, events: tab.events, eventInfo };
      loadScript('/static/app.js');
      return;
    }
    if (active === 'schedule') {
      $('schedulePanel').hidden = false;
      window.SCHEDULE_T = T;
      window.SCHEDULE_LINKED = info.linked || [];
      loadScript('/static/schedule.js');
      return;
    }
    // Setup: no pool yet (or nothing ticked): the picker and a Pull button, no tabs.
    $('setup').hidden = false;
    $('eventsBox').open = true;
    $('setupMsg').textContent = info.pull
      ? (q.get('tab') ? 'That game is not a seeded tab of this tournament. Pick a tab above, or tick its event.' : 'No events are ticked. Tick the singles events to seed above, then Pull.')
      : 'Nothing pulled yet. Tick the singles events to seed above, then Pull: it fetches every registrant\'s results once for the whole tournament.';
    $('pullFirst').hidden = !!(info.pull && q.get('tab'));
  }

  // ---- Jobs: Refresh (when no game tab owns it), the first Pull, a newly ticked event, Archive ----
  function poll({ reloadWhenDone = false } = {}) {
    if (polling) return;
    polling = setInterval(async () => {
      let st;
      try { st = await (await fetch(tapi('status'), { cache: 'no-store' })).json(); } catch { return; }
      line(jobText(st), st.phase === 'error');
      if (st.running || st.busy) return;
      clearInterval(polling); polling = null;
      if (reloadWhenDone && st.phase !== 'error') { location.reload(); return; }
      await refreshInfo();
    }, 1500);
  }
  async function refreshInfo() {
    const r = await fetch(tapi(''), { cache: 'no-store' });
    if (!r.ok) return;
    info = await r.json();
    renderHeader();
  }

  $('pullFirst').addEventListener('click', async () => {
    const ticked = pickedSlugs();
    if (!ticked.length) { $('setupMsg').textContent = 'Tick at least one singles event first.'; return; }
    $('pullFirst').disabled = true;
    const a = await post(tapi('events'), { ticked });
    if (!a.ok) { $('setupMsg').textContent = a.body.error || 'Could not save the events.'; $('pullFirst').disabled = false; return; }
    if (!a.body.started) {
      const r = await post(tapi('refresh'));
      if (!r.ok && r.status !== 409) { $('setupMsg').textContent = r.body.error || 'Could not start the pull.'; $('pullFirst').disabled = false; return; }
    }
    $('setupMsg').textContent = 'Pulling. This page switches to the tabs when the pull is in.';
    line('Pulling…');
    poll({ reloadWhenDone: true });
  });

  $('pickerSave').addEventListener('click', async () => {
    const r = await post(tapi('events'), { ticked: pickedSlugs() });
    if (!r.ok) { line(r.body.error || 'Not saved.', true); return; }
    if (r.body.started) { line('Saved. Pulling the players of the newly ticked event(s)…'); poll({ reloadWhenDone: true }); return; }
    if (!info.pull) { line(`Saved ${r.body.ticked.length} event(s). Press Pull to fetch them.`); return; }
    location.reload();
  });

  // On a game tab app.js owns Refresh and its status line; elsewhere the header handles it here.
  function bindRefresh() {
    $('refresh').addEventListener('click', async () => {
      $('refresh').disabled = true;
      const r = await post(tapi('refresh'));
      $('refresh').disabled = false;
      if (!r.ok && r.status !== 409) { line(r.body.error || 'Could not start the refresh.', true); return; }
      line(r.status === 409 ? 'A refresh is already running.' : 'Pulling…');
      poll({ reloadWhenDone: active === 'setup' });
    });
  }

  async function lifecycle(action, extra) {
    const r = await post(tapi('lifecycle'), { action, ...extra });
    if (!r.ok) { line(r.body.error || 'Not done.', true); return null; }
    return r.body;
  }
  $('markDone').addEventListener('click', async () => { if (await lifecycle('mark-done')) { line('Marked done.'); refreshInfo(); } });
  $('unmarkDone').addEventListener('click', async () => { if (await lifecycle('unmark-done')) { line('Back to computed status.'); refreshInfo(); } });
  $('archive').addEventListener('click', async () => {
    if (await lifecycle('archive')) { line('Archiving standings…'); poll(); }
  });
  $('delete').addEventListener('click', async () => {
    const name = (info.tournament && info.tournament.name) || T;
    if (!window.confirm(`Delete all pulled data for ${name}?\n\nThis removes out/${T}/: the player pool, W-L, schedule, standings and pushes. Your tiers, notes and reviews (registry/tiers.csv) are kept. This cannot be undone.`)) return;
    if (await lifecycle('delete', { confirm: T })) location.href = '/';
  });

  // ---- Start ----------------------------------------------------------------------------------------
  (async function start() {
    let r;
    try { r = await fetch(tapi(''), { cache: 'no-store' }); } catch (err) { $('title').textContent = `Could not reach the app server (${err.message}).`; return; }
    if (!r.ok) { $('title').textContent = (await r.json().catch(() => ({}))).error || `Error ${r.status}`; return; }
    info = await r.json();
    const tab = choose();
    renderHeader();
    renderPicker();
    renderTabs();
    openTab(tab);
    if (active !== 'game') {
      bindRefresh();
      const st = info.job;
      line(jobText(st), st && st.phase === 'error');
      if (st && (st.running || st.busy)) poll({ reloadWhenDone: active === 'setup' });
    }
  }());
}());
