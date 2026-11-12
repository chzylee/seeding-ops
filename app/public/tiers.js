// app/public/tiers.js — the Tiers view, /tiers (docs/design-tool.md, Amendment A3). One game at a time
// (the game tabs are links the server renders); this script draws that game's sheet and runs it:
//   sort      every header is a button: a new column sorts ascending, the same column again flips it
//             (lib/view/model.js sortTierRows; the header carries aria-sort)
//   edit      Tier, Alias and Notes: click a cell (or Enter / F2 on it) for an input; Enter or leaving
//             the cell saves, Esc cancels. Each save is POST /api/tiers/row: the same registry/tiers.csv,
//             the same atomic write and the same rule as an edit while seeding (lib/view/data.js)
//   export    this game's tiers as a shareable file (GET /api/tiers/export.csv)
//   import    a file for this game: when the game has no row here at all it is taken as it is, with
//             no review (the message says what was skipped); otherwise a diff, one row per player whose tier would change (current left,
//             incoming right), approved one row, a selection, or every row listed (the search
//             applied). Each approval is the A2.2 apply (lib/tiers-share.js): the fingerprint, the
//             ambiguous-match rules and the game-scoped write all hold.
(function () {
  'use strict';
  const M = window.SeedModel, R = window.SeedRender;
  const $ = (id) => document.getElementById(id);
  const tools = $('tierTools');
  if (!tools || !M || !R) return;
  const game = tools.dataset.game || '';
  const gameName = tools.dataset.gameName || '';
  const table = $('tierTable'), empty = $('tierEmpty'), msg = $('tierMsg');
  const H = { 'X-Seeding-App': '1', 'Content-Type': 'application/json' };
  const say = (t, err) => { msg.textContent = t || ''; msg.classList.toggle('err', !!err); };
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many || `${one}s`}`;
  async function postJson(url, payload) {
    try {
      const res = await fetch(url, { method: 'POST', headers: H, body: JSON.stringify(payload) });
      return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})) };
    } catch (err) { return { ok: false, status: 0, body: { error: err.message } }; }
  }

  // Another game: its own tab (it has no rows until something is tiered or imported).
  const more = $('tierNewGame');
  if (more) more.addEventListener('change', () => { if (more.value) location.href = `/tiers?game=${encodeURIComponent(more.value)}`; });

  // ---- The sheet ----
  let rows = [];
  let sort = { col: 'tier', dir: 'desc' };   // as the seeding table opens: highest tier first
  let editing = null;
  function draw() {
    table.innerHTML = R.tiersTable(M.sortTierRows(rows, sort.col, sort.dir), sort);
    empty.hidden = rows.length > 0;
    empty.textContent = rows.length ? '' : `No ${gameName || 'tiers'} players yet.`;
  }
  async function load() {
    if (!game) return;
    let res, body;
    try {
      res = await fetch(`/api/tiers?game=${encodeURIComponent(game)}`, { cache: 'no-store', headers: { 'X-Seeding-App': '1' } });
      body = await res.json().catch(() => ({}));
    } catch (err) { res = { ok: false }; body = { error: err.message }; }
    if (!res.ok) { say(body.error || 'The tiers could not be read.', true); return; }
    rows = body.rows || [];
    draw();
  }
  const cellOf = (ev) => (ev.target && ev.target.closest ? ev.target.closest('td[data-edit]') : null);
  table.addEventListener('click', (ev) => {
    const b = ev.target && ev.target.closest ? ev.target.closest('button.sort') : null;
    if (b) {
      const col = b.dataset.col;
      sort = { col, dir: sort.col === col && sort.dir === 'asc' ? 'desc' : 'asc' };
      draw();
      return;
    }
    const td = cellOf(ev);
    if (td && !editing) startEdit(td);
  });
  table.addEventListener('keydown', (ev) => {
    if (editing || (ev.target && ev.target.tagName === 'INPUT')) return;
    const td = cellOf(ev);
    if (td && (ev.key === 'Enter' || ev.key === 'F2')) { ev.preventDefault(); startEdit(td); }
  });

  function startEdit(td) {
    const tr = td.closest('tr');
    const key = tr && tr.dataset.key;
    const field = td.dataset.edit;
    const row = rows.find((r) => r.key === key);
    if (!row || !['tier', 'alias', 'notes'].includes(field)) return;
    const old = field === 'tier' ? (row.tier == null ? '' : String(row.tier)) : String(row[field] || '');
    const label = `${field === 'tier' ? 'Tier' : field === 'alias' ? 'Alias' : 'Notes'} for ${row.tag}`;
    // Notes are multi-line (the seeding editor's and the sheet import's line breaks are kept): a
    // textarea, where Shift+Enter is a new line, as in the seeding table's editor.
    td.innerHTML = field === 'tier' ? '<input class="ed" type="number" min="0" step="1" inputmode="numeric">'
      : field === 'notes' ? '<textarea class="ed" rows="3"></textarea>'
        : '<input class="ed" type="text" maxlength="60">';
    const input = td.querySelector('.ed');
    input.setAttribute('aria-label', label);
    input.value = old;
    editing = { key, field, old, input };
    // The keys stop here: Enter bubbling on to the table would open the editor again on the old cell.
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); return; }
      if (e.key !== 'Enter') return;
      e.stopPropagation();
      if (field === 'notes' && e.shiftKey) return;   // a new line
      e.preventDefault();
      commit();
    });
    input.addEventListener('blur', () => { commit(); });
    input.focus();
    input.select();
  }
  // After a save or a cancel the sheet is redrawn; focus goes back to the cell that was edited.
  const refocus = (e) => {
    const q = (s) => String(s).replace(/["\\]/g, '\\$&');
    const td = table.querySelector(`tr[data-key="${q(e.key)}"] td[data-edit="${q(e.field)}"]`);
    if (td && td.focus) td.focus();
  };
  function cancel() { const e = editing; editing = null; draw(); if (e) refocus(e); }
  async function commit() {
    const e = editing;
    if (!e) return null;
    editing = null;
    // Notes are compared and sent exactly as typed (a textarea reports line breaks as \n, so only
    // that is evened out for the comparison); tier and alias are trimmed, as the server stores them.
    // Nothing changed: nothing is sent, so a click in and out never rewrites a row or its source.
    const raw = String(e.input.value ?? '');
    const value = e.field === 'notes' ? raw : raw.trim();
    const lf = (s) => String(s).replace(/\r\n?/g, '\n');
    if (lf(value) === lf(e.old)) { draw(); refocus(e); return null; }
    say('Saving…');
    const r = await postJson('/api/tiers/row', { game_id: game, key: e.key, [e.field]: value });
    if (!r.ok) { say(r.body.error || 'Not saved.', true); draw(); refocus(e); return r; }
    // Keys are unique among the rows the server lets you edit (a shared key is a 409), so exactly one
    // row is replaced.
    const at = rows.findIndex((x) => x.key === e.key);
    if (at >= 0 && r.body.row) rows = [...rows.slice(0, at), r.body.row, ...rows.slice(at + 1)];
    draw();
    refocus(e);
    say('Saved.');
    return r;
  }

  // ---- Export ----
  $('tierExport').addEventListener('click', async () => {
    say('Exporting…');
    let res;
    try { res = await fetch(`/api/tiers/export.csv?game=${encodeURIComponent(game)}`, { cache: 'no-store' }); } catch (err) { say(err.message, true); return; }
    if (!res.ok) { const b = await res.json().catch(() => ({})); say(b.error || `The server answered ${res.status}.`, true); return; }
    const name = (/filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '') || [])[1] || 'tiers.csv';
    const blob = new Blob([await res.arrayBuffer()], { type: 'text/csv;charset=utf-8' });
    try {
      if (window.showSaveFilePicker) {
        let handle;
        try { handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'CSV', accept: { 'text/csv': ['.csv'] } }] }); } catch (err) { if (err && err.name === 'AbortError') { say(''); return; } handle = null; }
        if (handle) { const w = await handle.createWritable(); await w.write(blob); await w.close(); say(`Saved ${handle.name || name}.`); return; }
      }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      say(`Saved ${name} to your downloads.`);
    } catch (err) { say(`Not saved: ${err.message}`, true); }
  });

  // ---- Import ----
  const panel = $('importPanel'), impBody = $('impBody'), impNotes = $('impNotes'), impMsg = $('impMsg');
  const search = $('impSearch'), approveSel = $('impApproveSel'), approveAll = $('impApproveAll');
  const fileInput = $('tierFile');
  let upload = null, review = null, selected = new Set(), query = '';
  const impSay = (t, err) => { impMsg.textContent = t || ''; impMsg.classList.toggle('err', !!err); };
  const diffRows = () => M.importDiffRows(review);
  const shownRows = () => M.filterImportRows(diffRows(), query);

  async function preview() {
    const r = await postJson('/api/tiers/import/preview', { game_id: game, ...upload });
    if (!r.ok) { say(r.body.error || 'Could not read that file.', true); return null; }
    review = r.body;
    return review;
  }
  function drawImport() {
    const all = diffRows();
    const shown = M.filterImportRows(all, query);
    const keys = new Set(all.map((r) => r.key));
    selected = new Set([...selected].filter((k) => keys.has(k)));
    $('impTitle').textContent = `Import ${review.file_name || 'file'} into ${review.game.name}`;
    impBody.innerHTML = shown.length ? R.importDiff(shown, selected)
      : `<p>${all.length ? 'No player matches the search.' : 'Nothing to approve: every player in the file has the same tier here.'}</p>`;
    impNotes.innerHTML = R.importNotes(review);
    approveSel.textContent = `Approve selected (${selected.size})`;
    approveSel.disabled = !selected.size;
    approveAll.textContent = `Approve all (${shown.length})`;
    approveAll.disabled = !shown.length;
  }
  function openPanel() {
    selected = new Set(); query = ''; search.value = '';
    impSay('');
    drawImport();
    panel.hidden = false;
    table.hidden = true;
    search.focus();
  }
  function closePanel() { panel.hidden = true; table.hidden = false; review = null; upload = null; }

  // Applies the rows `take` (keys of the diff) with the review's fingerprint. The tiers table changed
  // since (another window, a seeding edit): 409, and the fresh diff is shown to approve again.
  async function apply(take) {
    return postJson('/api/tiers/import/apply', { game_id: game, ...upload, fingerprint: review.fingerprint, take });
  }
  async function approve(take) {
    if (!take.length) return null;
    approveSel.disabled = true; approveAll.disabled = true;
    impSay('Saving…');
    const r = await apply(take);
    if (!r.ok) {
      if (r.status === 409 && await preview()) { drawImport(); impSay('Your tiers changed since this list was made; here it is again. Check it and approve again.', true); return r; }
      impSay(r.body.error || 'Not saved.', true);
      drawImport();
      return r;
    }
    const s = r.body;
    selected = new Set([...selected].filter((k) => !take.includes(k)));
    await load();
    if (await preview()) drawImport();
    impSay(`Approved ${plural(take.length, 'player')}: ${s.added} added, ${s.updated} changed.${s.linked_by_tag.length ? ` Matched by tag only, now carrying the file's ids: ${s.linked_by_tag.map((x) => x.row_tag).join(', ')}.` : ''}`);
    return r;
  }
  // What the file had that was not taken (lib/tiers-share.js previewImport counts), for the direct
  // import's message: "Skipped: 1 unreadable, 2 repeated, …" or ''.
  function skipped(p) {
    const c = p.counts;
    const parts = [[c.malformed, 'unreadable'], [c.ambiguous, 'ambiguous'], [c.duplicates, 'repeated'], [c.no_tier, 'without a tier'], [c.other_games, 'for other games']]
      .filter(([n]) => n).map(([n, what]) => `${n} ${what}`);
    return parts.length ? ` Skipped: ${parts.join(', ')}.` : '';
  }
  // A game with no row here at all: the file is its tiers, taken at once (no row of Noah's can be
  // matched, so nothing is linked or changed without him seeing it).
  async function importDirect() {
    const take = diffRows().map((r) => r.key);
    if (!take.length) { say(`Nothing to import: the file has no ${review.game.name} players with a tier that can be added.${skipped(review)}`, true); return null; }
    say('Importing…');
    const r = await apply(take);
    if (!r.ok) { say(r.body.error || 'Not imported.', true); return r; }
    await load();
    say(`${plural(r.body.added + r.body.updated, 'player')} added to ${review.game.name}.${skipped(review)}`);
    review = null; upload = null;
    return r;
  }

  $('tierImport').addEventListener('click', () => { fileInput.value = ''; fileInput.click(); });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return null;
    say('Reading the file…');
    const csv = await file.text().catch((err) => { say(err.message, true); return null; });
    if (csv == null) return null;
    // The size that counts is the request's (the file as a JSON string, UTF-8: escaping adds up to
    // ~30%), against the server's cap for these routes (data-max-bytes), less room for the keys sent.
    const max = Number(fileInput.dataset.maxBytes) || 2000000;
    const json = JSON.stringify({ game_id: game, csv, file_name: file.name });
    const bytes = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(json).length : json.length * 3;
    if (bytes + 16 * csv.split('\n').length + 1000 > max) { say(`That file is too large to import (${Math.round(bytes / 1024)} KB as sent; the limit is ${Math.round(max / 1024)} KB).`, true); return null; }
    upload = { csv, file_name: file.name };
    if (!await preview()) return null;
    if (!review.rows_here) return importDirect();
    say('');
    openPanel();
    return review;
  });
  search.addEventListener('input', () => { query = search.value; drawImport(); });
  impBody.addEventListener('change', (ev) => {
    const box = ev.target && ev.target.closest ? ev.target.closest('input.imp-sel') : null;
    if (!box) return;
    if (box.checked) selected.add(box.dataset.key); else selected.delete(box.dataset.key);
    approveSel.textContent = `Approve selected (${selected.size})`;
    approveSel.disabled = !selected.size;
  });
  impBody.addEventListener('click', (ev) => {
    const b = ev.target && ev.target.closest ? ev.target.closest('button.imp-one') : null;
    return b ? approve([b.dataset.key]) : null;
  });
  approveSel.addEventListener('click', () => approve([...selected]));
  approveAll.addEventListener('click', () => approve(shownRows().map((r) => r.key)));
  $('impClose').addEventListener('click', closePanel);

  window.TiersView = { load, state: () => ({ rows, sort, review, selected: [...selected], query }) };
  load();
}());
