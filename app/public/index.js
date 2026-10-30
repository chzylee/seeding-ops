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

  // ---- Right-click a tournament: Delete (Noah, 2026-10-30), always behind a confirmation ----
  const list = document.querySelector('ul.events');
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
  const game = $('upGame');
  const pickBtn = $('upGameBtn');
  const grid = $('upGameGrid');
  const showOther = () => { $('upOtherWrap').hidden = game.value !== 'other'; $('upGameId').required = game.value === 'other'; };
  const choose = (btn) => {
    game.value = btn.dataset.id;
    game.dataset.name = btn.dataset.name || '';
    grid.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', b === btn ? 'true' : 'false'));
    const img = btn.querySelector('img');
    pickBtn.innerHTML = (img ? `<img src="${img.getAttribute('src')}" alt="">` : '') + `<span>${btn.dataset.name || btn.textContent.trim()}</span><span class="caret">▾</span>`;
    showOther();
  };
  pickBtn.addEventListener('click', (ev) => { ev.preventDefault(); grid.hidden = !grid.hidden; if (!grid.hidden) (grid.querySelector('[aria-selected="true"]') || grid.querySelector('button')).focus(); });
  grid.addEventListener('click', (ev) => { const b = ev.target.closest('button[data-id]'); if (!b) return; ev.preventDefault(); choose(b); grid.hidden = true; pickBtn.focus(); });
  document.addEventListener('click', (ev) => { if (!grid.hidden && !grid.contains(ev.target) && ev.target !== pickBtn && !pickBtn.contains(ev.target)) grid.hidden = true; });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !grid.hidden) { grid.hidden = true; pickBtn.focus(); } });
  choose(grid.querySelector('[aria-selected="true"]') || grid.querySelector('button[data-id]'));
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
    if (file.size > 150000) { upMsg.textContent = 'That file is larger than a player list should be (150 KB).'; upMsg.classList.add('err'); return; }
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
      upMsg.textContent = 'Checking the list…';
      res = await fetch('/api/uploads', { method: 'POST', headers: { 'X-Seeding-App': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      body = await res.json().catch(() => ({}));
    } catch (err) { res = { ok: false }; body = { error: err.message }; }
    up.querySelector('button').disabled = false;
    if (!res.ok) { upMsg.textContent = body.error || 'Could not upload it.'; upMsg.classList.add('err'); return; }
    location.href = body.page;
  });
}());
