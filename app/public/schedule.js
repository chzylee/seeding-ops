// app/public/schedule.js — the Schedule tab (T3, docs/design-tool.md): every player's pools and start
// times across the tournament's events, side tournaments included. Visibility only: it never fixes a
// conflict. Moved from conflicts/public/schedule.html in build B (same table, block view and
// conflicts-first sort); tournament.js loads it with window.SCHEDULE_T set. Data: GET
// /api/t/<t>/schedule (out/<t>/schedule.json); the pull goes through the app's one request queue.
(function () {
'use strict';
const slug = window.SCHEDULE_T;
const API = '/api/t/' + encodeURIComponent(slug);
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shortName = (name) => { const m = String(name).match(/\]\s*([A-Z0-9]{2,})\b/); return m ? m[1] : String(name); };
let D = null;
let fmt = (s) => '';

function columns(d) {
  // One column per wave (in start order); pools with a time but no wave get a column per time;
  // anything without a time goes last.
  const cols = new Map();
  const add = (key, wave, startAt) => { if (!cols.has(key)) cols.set(key, { key, wave, startAt }); };
  for (const b of d.blocks) if (b.startAt) add(b.wave ? 'w' + b.wave : 't' + b.startAt, b.wave, b.startAt);
  for (const p of d.players) for (const e of p.entries) {
    if (e.startAt) add(e.wave ? 'w' + e.wave : 't' + e.startAt, e.wave, e.startAt);
    else add(colKey(e), null, null);
  }
  const last = { side: 1, none: 2 };
  return [...cols.values()].sort((a, b) => (a.startAt ?? Infinity) - (b.startAt ?? Infinity) || (last[a.key] || 0) - (last[b.key] || 0));
}
// p.conflict comes from the pull (conflicts/lib/schedule.js conflictOf): 'main', 'side' or null.
const RANK = { main: 2, side: 1 };
let clashFirst = false;

const colKey = (e) => (e.startAt ? (e.wave ? 'w' + e.wave : 't' + e.startAt) : e.side ? 'side' : 'none');

function filteredRows(d) {
  const evF = $('eventFilter').value;
  const q = $('find').value.trim().toLowerCase();
  return d.players.filter((p) => (!evF || p.entries.some((e) => e.eventId === evF))
    && (!q || p.tag.toLowerCase().includes(q) || (p.prefix || '').toLowerCase().includes(q)));
}

function headHtml(cols, opts = {}) {
  // opts.sort: { key, dir } marks the sorted column; opts.counts: Map(colKey -> players in it).
  const arrow = (key) => (opts.sort && opts.sort.key === key ? (opts.sort.dir > 0 ? ' ▲' : ' ▼') : '');
  const count = (key) => (opts.counts && key !== 'player' ?` <span class="cnt">(${opts.counts.get(key) || 0})</span>` : '');
  const th = (key, label, sub, cls = '') => `<th data-key="${esc(key)}"${cls ? ` class="${cls}"` : ''}>${label}${count(key)}${arrow(key)}${sub ? `<span class="t">${sub}</span>` : ''}</th>`;
  return '<tr>' + th('player', 'Player', '', 'player') + cols.map((c) =>
    c.key === 'none' ? th(c.key, 'No time set', '')
      : c.key === 'side' ? th(c.key, 'Side games', 'no time on start.gg')
      : th(c.key, c.wave ? 'Wave ' + esc(c.wave) : 'No wave', esc(fmt(c.startAt)))).join('') + '</tr>';
}

function byColumn(p) {
  const by = new Map();
  for (const e of p.entries) { const k = colKey(e); if (!by.has(k)) by.set(k, []); by.get(k).push(e); }
  return by;
}

function rowHtml(p, cols, ctx) {
  const by = byColumn(p);
  const nEv = new Set(p.entries.filter((e) => !e.side).map((e) => e.eventId)).size;
  const nSideEv = new Set(p.entries.filter((e) => e.side).map((e) => e.eventId)).size;
  const cells = cols.map((c) => '<td>' + (by.get(c.key) || []).map((e) => e.side
    ? `<span class="chip side" title="Side game: ${esc(e.eventName)}${e.pool ? ' · ' + esc(e.phaseName || '') + ' ' + esc(e.pool) : ' · no bracket yet'}">${esc(e.eventName)}${e.pool ? ' ' + esc(e.pool) : ''}</span>`
    : `<span class="chip ev${(ctx.evIdx.get(e.eventId) ?? 4) % 6}" title="${esc(e.eventName)} · ${esc(e.phaseName || '')} ${esc(e.pool || '(no pool)')}${e.seedNum ? ' · seed ' + e.seedNum : ''}${e.poolSeedNum ? ' (' + e.poolSeedNum + ' in pool)' : ''}${e.team ? ' · team ' + esc(e.team) : ''}">`
    + `${esc(ctx.evShort.get(e.eventId))} ${esc(e.pool ?? '(no pool)')}${e.seedNum ? `<span class="seed">#${e.seedNum}</span>` : ''}</span>`).join('') + '</td>').join('');
  const who = (p.prefix ? `<span class="pre">${esc(p.prefix)} | </span>` : '') + esc(p.tag);
  const link = p.userSlug ? `<a href="https://www.start.gg/${esc(p.userSlug)}" target="_blank" rel="noopener">${who}</a>` : who;
  const cls = clashFirst && p.conflict ? (p.conflict === 'main' ? ' class="clash"' : ' class="clash-side"') : '';
  const n = `${nEv} event${nEv === 1 ? '' : 's'}${nSideEv ? ` + ${nSideEv} side` : ''}`;
  return `<tr${cls}><td class="player">${link}<span class="n">${n}</span></td>${cells}</tr>`;
}

// Block view sort. Player: by tag. A block column: everyone with something in that block first,
// grouped by event, pool, then seed (the arrow flips that order); everyone else after, by tag.
const byTag = (a, b) => a.tag.localeCompare(b.tag, undefined, { sensitivity: 'base' });
function cmpEntry(x, y, ctx) {
  return (x.side - y.side)
    || String(ctx.evShort.get(x.eventId)).localeCompare(String(ctx.evShort.get(y.eventId)))
    || String(x.pool ?? '').localeCompare(String(y.pool ?? ''))
    || (x.seedNum ?? Infinity) - (y.seedNum ?? Infinity);
}
function sortForBlock(rows, sort, ctx) {
  if (sort.key === 'player') return rows.sort((a, b) => sort.dir * byTag(a, b));
  const first = (p) => (byColumn(p).get(sort.key) || []).slice().sort((x, y) => cmpEntry(x, y, ctx))[0];
  const keyed = rows.map((p) => ({ p, e: first(p) }));
  keyed.sort((a, b) => {
    if (!a.e || !b.e) return (!a.e - !b.e) || byTag(a.p, b.p);
    return sort.dir * cmpEntry(a.e, b.e, ctx) || byTag(a.p, b.p);
  });
  return keyed.map((k) => k.p);
}

// Per-viewer conveniences: whether the block view is open and how it's sorted.
const store = {
  get(k, dflt) { try { const v = localStorage.getItem('schedule:' + slug + ':' + k); return v == null ? dflt : JSON.parse(v); } catch { return dflt; } },
  set(k, v) { try { localStorage.setItem('schedule:' + slug + ':' + k, JSON.stringify(v)); } catch { /* fine without it */ } },
};
let lowerOpen = store.get('lowerOpen', false);
let lowerSort = store.get('lowerSort', { key: 'player', dir: 1 });

function render() {
  const d = D;
  const ctx = {
    evIdx: new Map(d.events.map((e, i) => [e.id, i])),
    evShort: new Map(d.events.map((e) => [e.id, e.short || shortName(e.name)])),
  };
  const cols = columns(d);
  const rows = filteredRows(d);

  // Top table: tag order, or conflicts first. Stable: main conflicts, then side-only, then everyone else.
  const top = rows.slice();
  if (clashFirst) top.sort((a, b) => (RANK[b.conflict] || 0) - (RANK[a.conflict] || 0));
  const nMain = rows.filter((p) => p.conflict === 'main').length;
  const nSide = rows.filter((p) => p.conflict === 'side').length;
  $('clashToggle').textContent = `Conflicts first (${nMain} + ${nSide} side-only)`;
  $('sched').tHead.innerHTML = headHtml(cols);
  $('sched').tBodies[0].innerHTML = top.map((p) => rowHtml(p, cols, ctx)).join('');
  $('count').textContent = `${rows.length} of ${d.players.length} players`;

  $('lower').hidden = !lowerOpen;
  $('lowerToggle').setAttribute('aria-pressed', String(lowerOpen));
  if (!lowerOpen) return;
  if (lowerSort.key !== 'player' && !cols.some((c) => c.key === lowerSort.key)) lowerSort = { key: 'player', dir: 1 };
  const counts = new Map(cols.map((c) => [c.key, rows.filter((p) => p.entries.some((e) => colKey(e) === c.key)).length]));
  const bottom = sortForBlock(rows.slice(), lowerSort, ctx);
  $('sched2').tHead.innerHTML = headHtml(cols, { sort: lowerSort, counts });
  $('sched2').tBodies[0].innerHTML = bottom.map((p) => rowHtml(p, cols, ctx)).join('');
  const col = cols.find((c) => c.key === lowerSort.key);
  const colName = !col ? '' : col.key === 'side' ? 'side games' : col.key === 'none' ? 'no time set'
    : (col.wave ? 'Wave ' + col.wave : 'start') + ' (' + fmt(col.startAt) + ')';
  $('lowerNote').textContent = !col ? 'Sorted by player. Click a block header to list everyone in it first.'
    : `Sorted by ${colName}: ${counts.get(col.key) || 0} of ${rows.length} players have something there, listed first by event, pool and seed.`;
}

async function load() {
  const r = await fetch(API + '/schedule', { cache: 'no-store' });
  const body = await r.json();
  if (!r.ok) {
    $('sMsg').textContent = body.error + ' Click "Refresh schedule" to pull it.';
    return body.status;
  }
  D = body;
  $('sMsg').textContent = '';
  const tz = D.tournament.timezone || 'UTC';
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  fmt = (s) => (s ? f.format(new Date(s * 1000)) : '');
  const when = (iso) => new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' });
  const pulled = when(D.pulled_at);
  const inSide = D.players.filter((p) => p.entries.some((e) => e.side)).length;
  const sides = (D.side_tournaments || []).map((s) => s.name).join(', ');
  $('sSub').textContent = `${D.players.length} players · ${D.events.filter((e) => e.numEntrants && !e.side).map((e) => `${e.short || shortName(e.name)} ${e.numEntrants}`).join(' · ')}`
    + (sides ? ` · ${inSide} also in side games (${sides})` : '') + ` · pulled ${pulled}`
    + (D.sides_pulled_at && D.sides_pulled_at !== D.pulled_at ? ` (side games ${when(D.sides_pulled_at)})` : '') + ` · times in ${tz}`;
  const sel = $('eventFilter');
  const keep = sel.value;
  sel.innerHTML = '<option value="">any event</option>' + D.events.filter((e) => e.numEntrants && !e.side)
    .map((e) => `<option value="${esc(e.id)}">${esc(e.short || shortName(e.name))}</option>`).join('');
  sel.value = keep;
  render();
  return body.status;
}

function showStatus(st) {
  const s = $('sStatus');
  s.classList.toggle('err', !!(st && st.error));
  $('sRefresh').disabled = $('sRefreshSeeds').disabled = !!(st && st.running);
  s.textContent = st && st.running ? (st.kind === 'seeds' ? 'Pulling seeds from start.gg…' : 'Pulling from start.gg…') : st && st.error ? 'Refresh failed: ' + st.error : '';
}

async function poll() {
  const st = (await (await fetch(API + '/status', { cache: 'no-store' })).json()).schedule;
  showStatus(st);
  if (st.running) return setTimeout(poll, 1500);
  if (!st.error) { await load(); $('sStatus').textContent = 'Updated.'; }
}

async function startRefresh(query, kind) {
  const r = await fetch(API + '/schedule/refresh' + query, { method: 'POST', headers: { 'X-Seeding-App': '1' } });
  const st = await r.json();
  if (r.status === 400 || r.status === 404) return showStatus({ error: st.error });
  showStatus({ running: true, kind: st.kind || kind });
  setTimeout(poll, 1000);
}
$('sRefresh').addEventListener('click', () => startRefresh('', 'full'));
$('sRefreshSeeds').addEventListener('click', () => startRefresh('?only=seeds', 'seeds'));

// Side tournaments linked to this one (T3: state.json `linked`, joined on the next full refresh).
$('linked').value = (window.SCHEDULE_LINKED || []).join(', ');
$('linkedForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const linked = $('linked').value.split(/[\s,]+/).map((x) => (x.match(/tournament\/([^/?#\s]+)/i) || [null, x])[1]).filter(Boolean);
  const r = await fetch(API + '/linked', { method: 'POST', headers: { 'X-Seeding-App': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ linked }) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) return showStatus({ error: body.error || 'Not saved.' });
  $('linked').value = body.linked.join(', ');
  $('sStatus').textContent = `Side tournaments saved (${body.linked.length}). Refresh schedule to pull them.`;
});
$('eventFilter').addEventListener('change', () => D && render());
$('find').addEventListener('input', () => D && render());
function setLower(open) { lowerOpen = open; store.set('lowerOpen', open); if (D) render(); }
$('lowerToggle').addEventListener('click', () => setLower(!lowerOpen));
$('lowerClose').addEventListener('click', () => setLower(false));
$('sched2').tHead.addEventListener('click', (ev) => {
  const th = ev.target.closest('th[data-key]');
  if (!th) return;
  const key = th.dataset.key;
  lowerSort = lowerSort.key === key ? { key, dir: -lowerSort.dir } : { key, dir: 1 };
  store.set('lowerSort', lowerSort);
  render();
});
$('clashToggle').addEventListener('click', () => {
  clashFirst = !clashFirst;
  $('clashToggle').setAttribute('aria-pressed', String(clashFirst));
  if (D) render();
});

load().then((st) => { if (st && st.running) { showStatus(st); setTimeout(poll, 1500); } })
  .catch((err) => { $('sMsg').textContent = 'Could not load: ' + err.message; });
}());
