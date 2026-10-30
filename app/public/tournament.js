// app/public/tournament.js — the tournament page's shell (docs/design-tool.md, Pages and Lifecycle):
// the header (title, computed status, the live pull's facts), the seeded-events picker (singles only),
// the tabs (one per seeded game, plus Schedule), Refresh when no game tab is open, and the lifecycle
// controls (Mark done, Archive standings, Delete tournament data). It then loads the open tab's own
// script: app.js for a game (window.SEED_TAB) or schedule.js for the Schedule tab (window.SCHEDULE_T).
// Before the first pool exists the page shows the picker and a Pull button with status; no tabs.
// An uploaded list (Amendment A1.3, info.source "upload") has one tab and no picker, no Push and no
// Schedule; its page shows the upload's summary (the newest one open the first time, then folded).
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

  const isUpload = () => !!info && info.source === 'upload';

  function jobText(st) {
    if (!st) return '';
    if (st.running && st.resolving) return `Looking up players on start.gg… ${st.message || ''}`;
    if (st.running && st.pulling) return `Pulling… ${st.message || ''}`;
    if (st.running && st.kind === 'archive') return `Archiving standings… ${st.message || ''}`;
    if (st.running) return `W-L ${st.wl ? `${st.wl.done} / ${st.wl.total}` : '…'}`;
    if (st.queued) return `Pulling the newly ticked event's players after the current job${st.busy ? ` (${st.busy})` : ''}.`;
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
    if (isUpload()) {
      const u = info.upload;
      facts.push(`uploaded list${u.file_name ? ` (${u.file_name})` : ''}: ${u.rows} players, ${u.found} found on start.gg${u.not_found ? `, ${u.not_found} not found` : ''}${u.errors ? `, ${u.errors} lookups failed (Refresh asks again)` : ''}${u.pending ? `, ${u.pending} not looked up yet` : ''}`);
      if (t.start_at) facts.push(`event day ${u.date || new Date(t.start_at).toLocaleDateString()}`);
    } else if (t.start_at) facts.push(`starts ${new Date(t.start_at).toLocaleString()}`);
    if (p) facts.push(`pool: ${p.registrant_count} players, pulled ${new Date(p.run_at).toLocaleString()}${p.incremental ? ` (+${p.incremental.fetched} added ${new Date(p.incremental.at).toLocaleString()})` : ''}`);
    else facts.push('not pulled yet');
    if (info.pushes && info.pushes.length) { const last = info.pushes[info.pushes.length - 1]; facts.push(`last push: ${last.event} at ${new Date(last.at).toLocaleString()} (${last.seed_count} seeds)`); }
    if (info.standings) facts.push('standings archived');
    if (active !== 'game') $('sub').textContent = facts.join(' · ');
    else $('sub').title = facts.join(' · ');
    if (isUpload()) {
      // No start.gg event behind it: nothing to pick, push or schedule (A1.3).
      $('eventsBox').hidden = true;
      $('pushToggle').hidden = true;
      $('refresh').title = 'Pull these players\' results again (and look up any row whose lookup failed), then fetch W-L';
    }
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
    if (!isUpload() && (info.pull || active === 'schedule')) links.push({ key: 'schedule', label: 'Schedule' });
    $('tabs').innerHTML = links.map((l) => `<a href="/t/${encodeURIComponent(T)}?tab=${encodeURIComponent(l.key)}"${l.key === activeKey ? ' aria-current="page" class="on"' : ''}>${esc(l.label)}</a>`).join('');
    $('tabs').hidden = !links.length;
  }

  let activeKey = null;
  function choose() {
    const want = q.get('tab');
    const tabs = info.pull ? info.tabs : [];
    if (want === 'schedule' && !isUpload()) { active = 'schedule'; activeKey = 'schedule'; return null; }
    const tab = tabs.find((x) => String(x.game.id) === want) || (want && !isUpload() ? null : tabs[0]);
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
    if (isUpload()) {
      const st = info.job || {};
      const busy = st.running || st.queued;
      $('setupMsg').textContent = busy
        ? 'Looking up the list\'s players on start.gg, then pulling their results. This page switches to the tab when the pull is in.'
        : 'This list has not been pulled yet (the job stopped or has not started). Look up and pull resumes where it left off.';
      $('pullFirst').textContent = 'Look up and pull';
      $('pullFirst').hidden = !!busy;
      return;
    }
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
      if (st.running || st.busy || st.queued) return;
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
    if (isUpload()) {
      $('pullFirst').disabled = true;
      const r = await post(tapi('refresh'));
      if (!r.ok && r.status !== 409) { $('setupMsg').textContent = r.body.error || 'Could not start it.'; $('pullFirst').disabled = false; return; }
      $('setupMsg').textContent = 'Looking up and pulling. This page switches to the tab when the pull is in.';
      line('Starting…');
      poll({ reloadWhenDone: true });
      return;
    }
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
    if (r.body.queued) {
      // D2-1: another job is running; the pull is queued behind it and starts by itself.
      const names = r.body.addedNames.join(', ');
      line(`${names} ticked; pulling ${r.body.addedNames.length > 1 ? 'their' : 'its'} players after the current job.`);
      poll({ reloadWhenDone: true });
      return;
    }
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

  // ---- The upload's summary (A1.3, Acceptance 8) ----------------------------------------------------
  // Each run that looked players up records a summary in state.json `uploads`. The newest is shown
  // open once (then marked seen on the server); afterwards it stays here, folded.
  function summaryHtml(x) {
    const li = (items) => `<ul>${items.join('')}</ul>`;
    const parts = [`<p>${esc(new Date(x.at).toLocaleString())}: ${x.rows} rows, ${x.found} found on start.gg (${x.asked} looked up this time).</p>`];
    if (x.not_found.length) parts.push(`<h4>Not found on start.gg (kept on the page, flagged)</h4>${li(x.not_found.map((r) => `<li>line ${r.line}: ${esc(r.name || '(no name)')} · ${esc(r.discriminator)} — ${esc(r.reason)}</li>`))}`);
    if (x.errors.length) parts.push(`<h4>Lookups that failed (Refresh asks again)</h4>${li(x.errors.map((r) => `<li>line ${r.line}: ${esc(r.name)} · ${esc(r.discriminator)} — ${esc(r.reason)}</li>`))}`);
    if (x.duplicates.length) parts.push(`<h4>Repeated discriminators (kept once)</h4>${li(x.duplicates.map((d) => `<li>line ${d.line} repeats line ${d.kept_line} (${esc(d.discriminator)})</li>`))}`);
    if (x.malformed.length) parts.push(`<h4>Rows not read</h4>${li(x.malformed.map((m) => `<li>line ${m.line}: <code>${esc(m.text)}</code> — ${esc(m.reason)}</li>`))}`);
    if (x.ignored_columns.length) parts.push(`<p class="dim">Values after the second column were ignored on line(s) ${x.ignored_columns.join(', ')}.</p>`);
    const t = x.tiers || {};
    if (t.error) parts.push(`<p class="err">The tiers file was not updated: ${esc(t.error)}</p>`);
    else {
      parts.push(`<h4>Tiers file (registry/tiers.csv)</h4><p>${t.matched_by_id} matched by start.gg id; ${t.discriminators_written} discriminator(s) and ${t.player_ids_written} player id(s) written; ${t.unmatched} with no tiers row.</p>`);
      if (t.linked_by_tag && t.linked_by_tag.length) {
        parts.push(`<p><b>Linked by tag — please review.</b> These rows had no start.gg id; they matched by tag, and now carry this player's ids.</p>`
          + li(t.linked_by_tag.map((r) => `<li>${esc(r.gamer_tag)}${r.alias && r.alias !== r.gamer_tag ? ` (listed as ${esc(r.alias)})` : ''} → tiers row "${esc(r.row_tag)}"${r.tier !== '' ? `, tier ${esc(r.tier)}` : ''}</li>`)));
      }
      if (t.ambiguous && t.ambiguous.length) {
        parts.push(`<p><b>Not linked: one tag, several players.</b></p>`
          + li(t.ambiguous.map((a) => `<li>tiers row "${esc(a.row_tag)}"${a.tier !== '' ? ` (tier ${esc(a.tier)})` : ''}: ${a.players.map((q) => esc(q.gamer_tag) + ' · ' + esc(q.discriminator)).join(', ')}</li>`)));
      }
    }
    return parts.join('');
  }
  function renderUploadNote() {
    const el = $('uploadNote');
    const all = (info.upload && info.upload.summaries) || [];
    if (!isUpload() || !all.length) { el.hidden = true; return; }
    const last = all[all.length - 1];
    const fresh = !last.shown_at;
    el.innerHTML = `<details${fresh ? ' open' : ''}><summary>Upload summary${fresh ? ' (new)' : ''}</summary><div class="about-body">${summaryHtml(last)}</div></details>`;
    el.hidden = false;
    if (fresh) post(tapi('upload/seen'));
  }

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
    renderUploadNote();
    openTab(tab);
    if (active !== 'game') {
      bindRefresh();
      const st = info.job;
      line(jobText(st), st && st.phase === 'error');
      if (st && (st.running || st.busy || st.queued)) poll({ reloadWhenDone: active === 'setup' });
    }
  }());
}());
