// app/public/index.js — the tournaments list's "Add a tournament" form (docs/design-tool.md, Pages):
// paste a tournament URL or any of its event URLs; the server makes one request for the tournament's
// events and saves them; the tournament's page then shows the singles-only picker.
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
}());
