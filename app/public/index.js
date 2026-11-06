// app/public/index.js — the tournaments list's two forms (docs/design-tool.md, Pages; Amendment A1.3):
//   "Add a tournament": paste a tournament URL or any of its event URLs; the server makes one request
//   for the tournament's events and saves them; the tournament's page then shows the singles-only picker.
//   "Upload a player list": a page name, a game, a date and a CSV file (name, discriminator); the file is
//   read here and sent as text; the server checks it with no start.gg request, creates the page and
//   starts its job (one lookup per row, then the pull); the page shows the progress.
(function () {
  'use strict';
  const form = document.getElementById('add');
  const input = document.getElementById('addUrl');
  const msg = document.getElementById('addMsg');

  // ---- Connect to start.gg (Noah, 2026-11-05): the token screen, shown when there is no token or
  // start.gg rejects the saved one; one line "connected as …" otherwise. The token never comes back
  // from the server; the page only learns whether it works and whose it is.
  const connect = document.getElementById('connect');
  const connectLine = document.getElementById('connectLine');
  const connectMsg = document.getElementById('connectMsg');
  async function tokenState(check) {
    let st = null;
    try { st = await (await fetch(`/api/token${check ? '?check=1' : ''}`, { cache: 'no-store' })).json(); } catch { st = null; }
    if (!st) { connectLine.textContent = 'start.gg: the app server did not answer.'; return; }
    if (st.ok) {
      connect.hidden = true;
      connectLine.textContent = '';   // the account bar (account.js) shows who is signed in
      return;
    }
    connect.hidden = false;
    connectLine.textContent = '';
    document.getElementById('connectWhy').textContent = st.kind === 'missing'
      ? 'This app reads results from start.gg with a personal API token of yours. The key never leaves your machine.'
      : st.kind === 'network' ? `start.gg could not be reached (${st.message}). Check the connection, or paste a token to try again.`
      : `The saved token was rejected by start.gg (${st.message}). Paste a new one.`;
    document.getElementById('connectToken').focus();
  }
  document.getElementById('connectForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const box = document.getElementById('connectToken');
    const btn = ev.target.querySelector('button');
    btn.disabled = true; connectMsg.classList.remove('err'); connectMsg.textContent = 'Checking with start.gg…';
    let res, body;
    try {
      res = await fetch('/api/token', { method: 'POST', headers: { 'X-Seeding-App': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ token: box.value }) });
      body = await res.json().catch(() => ({}));
    } catch (err) { res = { ok: false }; body = { error: err.message }; }
    btn.disabled = false;
    if (!res.ok) { connectMsg.textContent = body.error || 'Could not save it.'; connectMsg.classList.add('err'); return; }
    box.value = '';
    connectMsg.textContent = `Connected as ${body.as}. Saved to ${body.saved}.${body.note ? ' ' + body.note : ''}`;
    setTimeout(() => tokenState(false), body.env_wins ? 6000 : 1200);
  });
  tokenState(false);
  // A token saved from the account bar's dialog (account.js) refreshes this card too.
  if (window.Account) window.Account.onChange = () => tokenState(false);
  else document.addEventListener('DOMContentLoaded', () => { if (window.Account) window.Account.onChange = () => tokenState(false); });
  const pre = new URLSearchParams(location.search).get('add');
  if (pre) input.value = `https://www.start.gg/tournament/${pre}`;
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    msg.textContent = 'Asking start.gg for the tournament\'s events…';
    msg.classList.remove('err');
    form.querySelector('button').disabled = true;
    let res, body;
    try {
      res = await fetch('/api/tournaments', { method: 'POST', headers: { 'X-Seeding-App': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ url: input.value }) });
      body = await res.json().catch(() => ({}));
    } catch (err) { res = { ok: false }; body = { error: err.message }; }
    form.querySelector('button').disabled = false;
    if (!res.ok) { msg.textContent = body.error || 'Could not add it.'; msg.classList.add('err'); return; }
    location.href = body.page;
  });

  // ---- The whole row opens the tournament (Noah, 2026-10-30), not only its name ----
  const list = document.querySelector('ul.events');
  if (list) {
    list.querySelectorAll('li[data-t]').forEach((li) => { li.tabIndex = 0; li.setAttribute('role', 'link'); });
    const openRow = (li) => { location.href = `/t/${encodeURIComponent(li.dataset.t)}`; };
    list.addEventListener('click', (ev) => {
      const li = ev.target.closest('li[data-t]');
      if (!li || ev.target.closest('a, button')) return;   // the name link and any control keep their own behavior
      if (ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
      openRow(li);
    });
    list.addEventListener('keydown', (ev) => {
      const li = ev.target.closest('li[data-t]');
      if (li && ev.target === li && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); openRow(li); }
    });
  }

  // ---- Right-click a tournament: Delete (Noah, 2026-10-30), always behind a confirmation ----
  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  menu.innerHTML = '<button type="button" role="menuitem" class="danger" data-act="delete">Delete tournament data…</button>';
  document.body.appendChild(menu);
  let target = null;
  const hide = () => { menu.hidden = true; target = null; };
  if (list) list.addEventListener('contextmenu', (ev) => {
    const li = ev.target.closest('li[data-t]');
    if (!li) return;
    ev.preventDefault();
    target = li;
    menu.hidden = false;
    const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = Math.min(ev.clientX, window.innerWidth - w - 8) + 'px';
    menu.style.top = Math.min(ev.clientY, window.innerHeight - h - 8) + 'px';
    menu.querySelector('button').focus();
  });
  document.addEventListener('click', (ev) => { if (!menu.contains(ev.target)) hide(); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') hide(); });
  window.addEventListener('blur', hide);
  menu.querySelector('[data-act="delete"]').addEventListener('click', async () => {
    const li = target; hide();
    if (!li) return;
    const t = li.dataset.t, name = li.dataset.name || t;
    // The approval step: nothing is deleted until this is accepted. The tiers table is never touched.
    const ok = window.confirm(`Delete all data for "${name}"?\n\nThis removes its pulls, W-L, schedule and standings (out/${t}/). Your tiers table (registry/tiers.csv) is kept. This cannot be undone.`);
    if (!ok) return;
    let res, body;
    try {
      res = await fetch(`/api/t/${encodeURIComponent(t)}/lifecycle`, { method: 'POST', headers: { 'X-Seeding-App': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', confirm: t }) });
      body = await res.json().catch(() => ({}));
    } catch (err) { res = { ok: false }; body = { error: err.message }; }
    if (!res.ok) { msg.textContent = body.error || 'Could not delete it.'; msg.classList.add('err'); return; }
    location.reload();
  });

  // ---- Upload a player list (A1.3) ----
  const up = document.getElementById('upload');
  if (!up) return;
  const $ = (id) => document.getElementById(id);
  const upMsg = $('upMsg');
  // The game picker (Noah, 2026-10-30): a button with the chosen game's logo and a grid of logos from
  // config/games.json (copied from find-my-fgc). The hidden input #upGame carries the chosen id;
  // "other" reveals the free id fields.
  // ---- The modal (Noah, 2026-10-30): "Import from CSV" is a button; the whole form lives in a dialog.
  const modal = $('uploadModal');
  $('uploadOpen').addEventListener('click', () => { modal.showModal(); $('upName').focus(); });
  $('uploadCancel').addEventListener('click', () => modal.close());

  // ---- The game combobox: type to filter, scroll, pick. Small logos; nothing pops up large.
  const game = $('upGame');            // hidden: the chosen id ("other" for a free id)
  const search = $('upGameSearch');    // the text box: filter while open, the chosen game's name when closed
  const gameList = $('upGameList');        // role=listbox; <li role=option data-id data-name data-short data-img>
  const chip = $('upGameChip');        // the chosen game's small logo beside the box
  const options = [...gameList.querySelectorAll('[role="option"]')];
  const showOther = () => { $('upOtherWrap').hidden = game.value !== 'other'; $('upGameId').required = game.value === 'other'; };
  const open = () => { gameList.hidden = false; filter(search.value); };
  const close = () => { gameList.hidden = true; search.value = game.dataset.label || ''; };
  const filter = (q) => {
    const needle = q.trim().toLowerCase();
    let shown = 0;
    for (const o of options) {
      const hit = !needle || o.dataset.id === 'other' || (o.dataset.name + ' ' + o.dataset.short).toLowerCase().includes(needle);
      o.hidden = !hit; if (hit) shown++;
    }
    const active = options.find((o) => !o.hidden && o.getAttribute('aria-selected') === 'true') || options.find((o) => !o.hidden);
    options.forEach((o) => o.classList.toggle('active', o === active));
    $('upGameNone').hidden = shown > 0;
  };
  const choose = (o) => {
    game.value = o.dataset.id;
    game.dataset.name = o.dataset.name || '';
    game.dataset.label = o.dataset.id === 'other' ? 'Other (start.gg game id)…' : o.dataset.short || o.dataset.name;
    options.forEach((x) => x.setAttribute('aria-selected', x === o ? 'true' : 'false'));
    chip.innerHTML = o.dataset.img ? `<img src="${o.dataset.img}" alt="">` : '';
    close();
    showOther();
  };
  search.addEventListener('focus', () => { search.select(); open(); });
  search.addEventListener('input', () => { if (gameList.hidden) gameList.hidden = false; filter(search.value); });
  search.addEventListener('keydown', (ev) => {
    const visible = options.filter((o) => !o.hidden);
    const i = visible.findIndex((o) => o.classList.contains('active'));
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault(); if (gameList.hidden) open();
      const n = ev.key === 'ArrowDown' ? Math.min(i + 1, visible.length - 1) : Math.max(i - 1, 0);
      options.forEach((o) => o.classList.remove('active')); if (visible[n]) { visible[n].classList.add('active'); visible[n].scrollIntoView({ block: 'nearest' }); }
    } else if (ev.key === 'Enter') { if (!gameList.hidden) { ev.preventDefault(); const a = visible[i] || visible[0]; if (a) choose(a); } }
    else if (ev.key === 'Escape') { if (!gameList.hidden) { ev.preventDefault(); ev.stopPropagation(); close(); } }
  });
  gameList.addEventListener('mousedown', (ev) => { const o = ev.target.closest('[role="option"]'); if (!o) return; ev.preventDefault(); choose(o); });
  search.addEventListener('blur', () => setTimeout(() => { if (!gameList.hidden) close(); }, 120));
  choose(options.find((o) => o.getAttribute('aria-selected') === 'true') || options[0]);
  const readText = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(r.error || new Error('Could not read the file.'));
    r.readAsText(file, 'utf-8');
  });
  up.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    upMsg.classList.remove('err');
    const file = $('upFile').files[0];
    if (!file) { upMsg.textContent = 'Pick a CSV file.'; upMsg.classList.add('err'); return; }
    if (file.size > 150000) { upMsg.textContent = 'That file is larger than a player gameList should be (150 KB).'; upMsg.classList.add('err'); return; }
    const other = game.value === 'other';
    const payload = {
      name: $('upName').value, date: $('upDate').value, file_name: file.name,
      game_id: other ? $('upGameId').value.trim() : game.value,
      game_name: other ? $('upGameName').value.trim() : (game.dataset.name || ''),
    };
    up.querySelector('button').disabled = true;
    upMsg.textContent = 'Reading the file…';
    let res, body;
    try {
      payload.csv = await readText(file);
      upMsg.textContent = 'Checking the gameList…';
      res = await fetch('/api/uploads', { method: 'POST', headers: { 'X-Seeding-App': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      body = await res.json().catch(() => ({}));
    } catch (err) { res = { ok: false }; body = { error: err.message }; }
    up.querySelector('button').disabled = false;
    if (!res.ok) { upMsg.textContent = body.error || 'Could not upload it.'; upMsg.classList.add('err'); return; }
    location.href = body.page;
  });
}());
