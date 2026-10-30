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

  // ---- Upload a player list (A1.3) ----
  const up = document.getElementById('upload');
  if (!up) return;
  const $ = (id) => document.getElementById(id);
  const upMsg = $('upMsg');
  const game = $('upGame');
  const showOther = () => { $('upOtherWrap').hidden = game.value !== 'other'; $('upGameId').required = game.value === 'other'; };
  game.addEventListener('change', showOther);
  showOther();
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
      game_name: other ? $('upGameName').value.trim() : game.options[game.selectedIndex].text,
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
