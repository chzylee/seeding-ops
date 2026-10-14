#!/usr/bin/env node
'use strict';
// views/major-table.js — a seeding view built from one run folder. This is not part of the pull.
//   node views/major-table.js <run folder>
// Writes <run folder>/views/major-table.html:
//   1. Summary: one row per player. Configured majors (this game, main bracket = largest field) as
//      "placement / entrants · W-L" per year; Boston Blue Beat best placement and best/average W-L; notes.
//   2. One results table per player: Event | Placement | W-L | Date (+ Online), click headers to sort.
//      Other games go in a separate collapsed table.
// Per Noah (2026-10-14): what matters per result is event name, placement out of entrants and W-L;
// the date is secondary; no aggregate counts (placements only mean something relative to the event).
// W-L needs sets, which the pull doesn't fetch. They're fetched here through lib/startgg's paced,
// retrying client and cached in <run>/views/set-records.json, so re-rendering costs nothing.

const fs = require('node:fs');
const path = require('node:path');
const { parseCsv } = require('../lib/output');
const { createClient } = require('../lib/startgg');
const { loadToken } = require('../lib/token');

const MAJORS = [
  { label: 'CEO', re: /^CEO \d{4}\b/i },            // not "CEOtaku"
  { label: 'Evo', re: /^EVO \d{4}\b/i },
  { label: 'Combo Breaker', re: /combo breaker/i },
  { label: 'Frosty Faustings', re: /frosty faustings/i },
  { label: 'Climax of Night', re: /climax of night/i }, // not "Crescendo of Night"
];
const BBB = /boston blue beat/i;

const Q_SETS = `query($eid:ID!,$uid:ID!,$page:Int!){ event(id:$eid){ userEntrant(userId:$uid){ id
  paginatedSets(page:$page, perPage:40){ pageInfo{ totalPages }
    nodes{ winnerId slots{ entrant{ id } standing{ stats{ score{ value } } } } } } } } }`;
const Q_USER_ID = 'query($s:String!){ user(slug:$s){ id } }';

const readCsv = (f) => parseCsv(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ord = (n) => { n = +n; const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const place = (r) => (r.placement ? `${ord(r.placement)} / ${r.num_entrants}` : `— / ${r.num_entrants}`);
const key = (r) => `${r.player_id}:${r.event_id}`;
const isMajor = (r) => MAJORS.some((m) => m.re.test(r.tournament_name));
const eventLabel = (r) => (r.event_name && r.event_name !== r.tournament_name ? `${r.tournament_name} — ${r.event_name}` : r.tournament_name);

// Set record for one entrant. DQ rule copied from startgg-results/core.js tallyRecords (D-6/D-7):
// a set with any slot score of exactly -1 is a DQ and counts for neither side; a set without a
// clean winner and a distinct opponent (a bye) is skipped.
function recordFor(entrantId, sets) {
  let w = 0, l = 0, dq = 0;
  for (const s of sets) {
    const slots = s.slots || [];
    if (slots.some((x) => x && x.standing && x.standing.stats && x.standing.stats.score && x.standing.stats.score.value === -1)) { dq++; continue; }
    const ids = slots.map((x) => x && x.entrant && x.entrant.id).filter((x) => x != null).map(String);
    if (!ids.includes(String(entrantId)) || ids.length < 2 || s.winnerId == null || !ids.includes(String(s.winnerId))) continue;
    if (String(s.winnerId) === String(entrantId)) w++; else l++;
  }
  return { w, l, dq };
}

async function fetchSetRecords(runDir, players, rows) {
  const cacheFile = path.join(runDir, 'views', 'set-records.json');
  const legacy = path.join(runDir, 'views', 'bbb-records.json');
  const cache = {
    ...(fs.existsSync(legacy) ? JSON.parse(fs.readFileSync(legacy, 'utf8')) : {}),
    ...(fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {}),
  };
  const todo = rows.filter((r) => !cache[key(r)]);
  if (todo.length) {
    const { token } = loadToken({ envFile: path.join(__dirname, '..', '.env') });
    if (!token) throw new Error('No STARTGG_TOKEN in .env; needed to fetch set records.');
    const client = createClient({ token });
    const userIds = {};
    const save = () => fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 1));
    for (const [i, r] of todo.entries()) {
      const p = players.find((x) => x.player_id === r.player_id);
      if (!p || !p.user_slug) continue;
      userIds[p.user_slug] ??= (await client.request('UserId', Q_USER_ID, { s: p.user_slug })).user.id;
      let sets = [], entrantId = null;
      for (let page = 1, total = 1; page <= total; page++) {
        const d = await client.request('Sets', Q_SETS, { eid: r.event_id, uid: userIds[p.user_slug], page });
        const ue = d && d.event && d.event.userEntrant;
        if (!ue) break;
        entrantId = ue.id; total = ue.paginatedSets.pageInfo.totalPages || 1;
        sets = sets.concat(ue.paginatedSets.nodes || []);
      }
      cache[key(r)] = entrantId ? recordFor(entrantId, sets) : { missing: true };
      if (i % 20 === 19) save(); // a killed render keeps what it fetched
      process.stderr.write(`sets ${i + 1}/${todo.length} · ${r.gamer_tag} · ${eventLabel(r)}\n`);
    }
    save();
  }
  return cache;
}

function wlOf(records, r) {
  const rec = records[key(r)];
  return rec && !rec.missing && rec.w + rec.l > 0 ? rec : null;
}
const wlText = (rec) => (rec ? `${rec.w}-${rec.l}` : '—');

function majorCell(rows, major, records) {
  const hits = rows.filter((r) => r.is_event_game === 'true' && major.re.test(r.tournament_name));
  if (!hits.length) return '<span class="dim">—</span>';
  const byT = {};
  for (const r of hits) (byT[r.tournament_name] ??= []).push(r);
  return Object.values(byT)
    .map((g) => [...g].sort((a, b) => +b.num_entrants - +a.num_entrants)[0]) // main bracket
    .sort((a, b) => b.event_date.localeCompare(a.event_date))
    .map((r) => `<div class="line"><b>${place(r)}</b> · ${wlText(wlOf(records, r))} <span class="dim">'${r.event_date.slice(2, 4)}</span></div>`)
    .join('');
}

function bbbCell(rows, records) {
  const bbb = rows.filter((r) => r.is_event_game === 'true' && BBB.test(r.tournament_name));
  if (!bbb.length) return '<span class="dim">—</span>';
  const placed = bbb.filter((r) => r.placement).sort((a, b) => +a.placement - +b.placement || +b.num_entrants - +a.num_entrants);
  const withWl = bbb.map((r) => ({ r, rec: wlOf(records, r) })).filter((x) => x.rec);
  const lines = [];
  if (placed[0]) lines.push(`Best placement: <b>${place(placed[0])}</b> · ${wlText(wlOf(records, placed[0]))}`);
  if (withWl.length) {
    const best = [...withWl].sort((a, b) => b.rec.w / (b.rec.w + b.rec.l) - a.rec.w / (a.rec.w + a.rec.l) || b.rec.w - a.rec.w)[0];
    const W = withWl.reduce((n, x) => n + x.rec.w, 0), L = withWl.reduce((n, x) => n + x.rec.l, 0);
    lines.push(`Best W-L: <b>${best.rec.w}-${best.rec.l}</b> <span class="dim">(${place(best.r)})</span>`);
    lines.push(`Average W-L: <b>${(W / withWl.length).toFixed(1)}-${(L / withWl.length).toFixed(1)}</b> <span class="dim">over ${withWl.length} events</span>`);
  }
  return lines.map((l) => `<div class="line">${l}</div>`).join('');
}

// ---- Event series --------------------------------------------------------------------------
// start.gg has no series field, so a series is inferred from the tournament name: configured
// series (MAJORS, BBB) by regex; everything else by a normalized name (numbering, dates, years,
// seasons/weeks, bracketed notes, prize tags and trailing roman numerals stripped), then merged
// into a shorter name it extends word-for-word ("bracket about nothing uni 2 open" -> "bracket
// about nothing"). Heuristic: the view lists each series' events so a bad merge is visible.
const PRIZE = /^(\$\d+\+?|\d[\d,]*\s*(jpy|usd|yen)\+?.*prize.*|.*prize pool!?)$/i;
// The series part of a tournament name: bracketed notes removed first (they can hold " | "),
// then the first " - " / " | " segment that isn't a prize tag.
function seriesPart(name) {
  const s = String(name).replace(/[\[({][^\])}]*[\])}]/g, ' ');   // [Week 9] (PC) {UNI 2}
  const parts = s.split(/\s+[-|–—]\s+/);
  return parts.find((p) => p.trim() && !PRIZE.test(p.trim())) || parts[0];
}
// Display form: original casing, numbering/dates/years/seasons stripped.
function prettyLabel(name) {
  return seriesPart(name)
    .replace(/^\s*\$\d+\+?\s*/, '')
    .replace(/\b\d{1,2}\/\d{1,2}(\s*(to|-)\s*\d{1,2}\/\d{1,2})?\b/g, ' ')
    .replace(/\b\d{1,2}\.\d{2}\b/g, ' ')                          // 4.25
    .replace(/\b(season|week|vol\.?|volume|episode|ep\.?)\s*\d+\b/gi, ' ')
    .replace(/#\s*\d+/g, ' ')
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/\s+(i{1,3}|iv|v|vi{1,3}|ix|x{1,3}(ix|iv|v?i{0,3})?|\d+)\s*$/i, ' ')
    .replace(/\s+/g, ' ').replace(/^[\s:|-]+|[\s:|-]+$/g, '').trim() || String(name);
}
function normalizeName(name) {
  let s = seriesPart(name);
  s = s.toLowerCase()
    .replace(/^\$\d+\+?\s*/, ' ')                                // leading $25+
    .replace(/\b\d{1,2}\/\d{1,2}(\s*(to|-)\s*\d{1,2}\/\d{1,2})?\b/g, ' ') // 10/5 to 10/8
    .replace(/\b(season|week|vol\.?|volume|episode|ep\.?|part|s)\s*\d+\b/g, ' ')
    .replace(/#\s*\d+/g, ' ')
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/\b\d+(st|nd|rd|th)?\b/g, ' ')
    .replace(/[®™©]/g, ' ')
    .replace(/\s+(i{1,3}|iv|v|vi{1,3}|ix|x{1,3}|x{0,3}(ix|iv|v?i{0,3}))\s*$/i, ' ')
    .replace(/[^a-z0-9:'&+ ]+/g, ' ')
    .replace(/\s+/g, ' ').replace(/^[\s:-]+|[\s:-]+$/g, '').trim();
  return s || String(name).toLowerCase();
}
function seriesKeyFor(r) {
  const m = MAJORS.find((x) => x.re.test(r.tournament_name));
  if (m) return m.label;
  if (BBB.test(r.tournament_name)) return 'Boston Blue Beat';
  return normalizeName(r.tournament_name);
}
// Main bracket per tournament (largest field), grouped into series; shorter keys absorb longer ones.
function groupSeries(rows) {
  const byT = {};
  for (const r of rows) (byT[r.tournament_name] ??= []).push(r); // brackets of one tournament can span days
  const mains = Object.values(byT).map((g) => [...g].sort((a, b) => +b.num_entrants - +a.num_entrants)[0]);
  const groups = {};
  for (const r of mains) (groups[seriesKeyFor(r)] ??= []).push(r);
  const keys = Object.keys(groups).sort((a, b) => a.length - b.length);
  for (const k of keys) {
    if (!groups[k]) continue;
    for (const k2 of keys) {
      if (k2 !== k && groups[k2] && k.split(' ').length >= 2 && (k2 + ' ').startsWith(k + ' ')) {
        groups[k].push(...groups[k2]); delete groups[k2];
      }
    }
  }
  return Object.entries(groups).map(([k, rs]) => {
    const pretty = MAJORS.some((m) => m.label === k) || k === 'Boston Blue Beat' ? k
      : prettyLabel(rs.map((r) => r.tournament_name).sort((a, b) => a.length - b.length)[0]);
    return { key: k, label: pretty, rows: rs.sort((a, b) => b.event_date.localeCompare(a.event_date)) };
  });
}

function seriesStats(rows, records) {
  const placed = rows.filter((r) => r.placement).sort((a, b) => +a.placement - +b.placement || +b.num_entrants - +a.num_entrants);
  const withWl = rows.map((r) => ({ r, rec: wlOf(records, r) })).filter((x) => x.rec);
  const best = withWl.length ? [...withWl].sort((a, b) => b.rec.w / (b.rec.w + b.rec.l) - a.rec.w / (a.rec.w + a.rec.l) || b.rec.w - a.rec.w)[0] : null;
  const W = withWl.reduce((n, x) => n + x.rec.w, 0), L = withWl.reduce((n, x) => n + x.rec.l, 0);
  return {
    bestPlaced: placed[0] || null,
    best,
    avg: withWl.length ? { w: W / withWl.length, l: L / withWl.length, n: withWl.length } : null,
  };
}

function seriesTable(rows, records, { withGame = false } = {}) {
  const series = groupSeries(rows).map((s) => ({ ...s, st: seriesStats(s.rows, records), maxN: Math.max(...s.rows.map((r) => +r.num_entrants)) }))
    .sort((a, b) => b.maxN - a.maxN || b.rows.length - a.rows.length);
  const head = ['Series', ...(withGame ? ['Game'] : []), 'Events', 'Best placement', 'Best W-L', 'Average W-L', 'Each event (placement · W-L)'];
  const body = series.map((s) => {
    const { bestPlaced, best, avg } = s.st;
    const games = [...new Set(s.rows.map((r) => r.game_name))].join(', ');
    const each = s.rows.map((r) => `<div class="line">${place(r)} · ${wlText(wlOf(records, r))} <span class="dim">${esc(r.event_date.slice(0, 7))}${r.event_name && r.event_name !== r.tournament_name ? ` · ${esc(r.event_name)}` : ''}</span></div>`).join('');
    const badge = MAJORS.some((m) => m.label === s.key) ? ' <span class="tag major">major</span>' : '';
    const online = s.rows.every((r) => r.is_online === 'true') ? ' <span class="tag">online</span>' : '';
    return `<tr><td><b>${esc(s.label)}</b>${badge}${online}</td>${withGame ? `<td>${esc(games)}</td>` : ''}`
      + `<td class="num" data-v="${s.rows.length}">${s.rows.length}</td>`
      + `<td class="num" data-v="${bestPlaced ? (+bestPlaced.placement / +bestPlaced.num_entrants).toFixed(4) : 9}">${bestPlaced ? `<b>${place(bestPlaced)}</b> · ${wlText(wlOf(records, bestPlaced))}` : '—'}</td>`
      + `<td class="num" data-v="${best ? (best.rec.w / (best.rec.w + best.rec.l)).toFixed(4) : -1}">${best ? `<b>${best.rec.w}-${best.rec.l}</b> <span class="dim">(${place(best.r)})</span>` : '—'}</td>`
      + `<td class="num" data-v="${avg ? (avg.w / (avg.w + avg.l || 1)).toFixed(4) : -1}">${avg && avg.n > 1 ? `<b>${avg.w.toFixed(1)}-${avg.l.toFixed(1)}</b>` : '<span class="dim">—</span>'}</td>`
      + `<td class="each">${s.rows.length > 4 ? `<details><summary>${s.rows.length} events</summary>${each}</details>` : each}</td></tr>`;
  }).join('');
  return `<table class="res sortable"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
}

function resultsTable(rs, records, { withGame = false } = {}) {
  const head = ['Event', ...(withGame ? ['Game'] : []), 'Placement', 'W-L', 'Date'];
  const sorted = [...rs].sort((a, b) => +b.num_entrants - +a.num_entrants || b.event_date.localeCompare(a.event_date));
  const body = sorted.map((r) => {
    const rec = wlOf(records, r);
    const badge = r.is_event_game === 'true' && isMajor(r) ? ' <span class="tag major">major</span>'
      : r.is_event_game === 'true' && BBB.test(r.tournament_name) ? ' <span class="tag">BBB</span>' : '';
    const online = r.is_online === 'true' ? ' <span class="tag">online</span>' : '';
    return `<tr><td>${esc(eventLabel(r))}${badge}${online}</td>${withGame ? `<td>${esc(r.game_name)}</td>` : ''}`
      + `<td class="num" data-v="${r.placement ? (+r.placement / +r.num_entrants).toFixed(4) : 9}" data-n="${r.num_entrants}"><b>${place(r)}</b></td>`
      + `<td class="num" data-v="${rec ? (rec.w / (rec.w + rec.l)).toFixed(4) : -1}">${wlText(rec)}</td>`
      + `<td class="date" data-v="${r.event_date}">${r.event_date}</td></tr>`;
  }).join('');
  return `<table class="res sortable"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
}

async function main() {
  const runDir = path.resolve(process.argv[2] || '');
  if (!fs.existsSync(path.join(runDir, 'meta.json'))) { console.error('Usage: node views/major-table.js <finished run folder>'); return 2; }
  fs.mkdirSync(path.join(runDir, 'views'), { recursive: true });
  const meta = JSON.parse(fs.readFileSync(path.join(runDir, 'meta.json'), 'utf8'));
  const players = readCsv(path.join(runDir, 'players.csv'));
  const results = readCsv(path.join(runDir, 'results.csv'));
  const notesFile = path.join(runDir, 'views', 'notes.json');
  const notes = fs.existsSync(notesFile) ? JSON.parse(fs.readFileSync(notesFile, 'utf8')) : {};
  const records = await fetchSetRecords(runDir, players, results);

  const ordered = [...players].sort((a, b) => (notes[a.player_id]?.seed ?? 99) - (notes[b.player_id]?.seed ?? 99) || +b.result_count - +a.result_count);
  const region = (p) => [p.region_state, p.region_country].filter(Boolean).join(', ');
  const summaryHead = ['Seed', 'Player', 'Region', ...MAJORS.map((m) => m.label), 'Boston Blue Beat', 'Notes'];
  const summary = ordered.map((p) => {
    const rows = results.filter((r) => r.player_id === p.player_id);
    const n = notes[p.player_id] || {};
    return `<tr><td class="seed">${esc(n.seed ?? '')}</td>`
      + `<td><a href="#p${p.player_id}"><b>${esc(p.gamer_tag)}</b></a>${p.prefix ? ` <span class="dim">${esc(p.prefix)}</span>` : ''}</td>`
      + `<td>${esc(region(p)) || '<span class="dim">—</span>'}</td>`
      + MAJORS.map((m) => `<td>${majorCell(rows, m, records)}</td>`).join('')
      + `<td>${bbbCell(rows, records)}</td><td class="notes">${esc(n.notes || '')}</td></tr>`;
  }).join('\n');

  const details = ordered.map((p) => {
    const rows = results.filter((r) => r.player_id === p.player_id);
    const game = rows.filter((r) => r.is_event_game === 'true');
    const other = rows.filter((r) => r.is_event_game !== 'true');
    const title = `<h2 id="p${p.player_id}">${esc(p.gamer_tag)}${p.prefix ? ` <span class="dim">${esc(p.prefix)}</span>` : ''}`
      + `${region(p) ? ` <span class="dim">· ${esc(region(p))}</span>` : ''}</h2>`;
    if (!rows.length) return `${title}<p class="dim">No results on start.gg in the last two years.</p>`;
    return title
      + (game.length ? seriesTable(game, records)
        + `<details><summary>Every ${esc(meta.game.name)} result (${game.length})</summary>${resultsTable(game, records)}</details>`
        : `<p class="dim">No ${esc(meta.game.name)} results.</p>`)
      + (other.length ? `<details><summary>Other games (${other.length} results)</summary>${seriesTable(other, records, { withGame: true })}</details>` : '');
  }).join('\n');

  const ev = meta.event;
  const html = `<!doctype html><meta charset="utf-8"><title>${esc(ev.name)} — seeding view</title>
<style>
body{font:14px/1.45 system-ui,sans-serif;margin:16px;background:#fafafa;color:#1a1a1a}
h1{font-size:19px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 6px}.sub{color:#666;margin-bottom:14px;max-width:900px}
.wrap{overflow-x:auto}table{border-collapse:collapse;background:#fff}
th,td{border:1px solid #ddd;padding:5px 9px;vertical-align:top;text-align:left}
th{background:#f0f0f0;font-weight:600;white-space:nowrap}
table.summary td.seed{font-size:18px;font-weight:700;text-align:center}table.summary td.notes{min-width:260px;max-width:380px}
table.summary .line{white-space:nowrap}
table.res td.num{white-space:nowrap;text-align:right}table.res td.date{color:#888;white-space:nowrap}
table.res td.each{min-width:240px}table.res td.each .line{white-space:nowrap}
table.sortable th{cursor:pointer}table.sortable th:hover{background:#e6e6e6}
.dim{color:#888}a{color:#2459a6;text-decoration:none}
.tag{font-size:11px;background:#eef;border-radius:3px;padding:0 4px;color:#446;margin-left:4px}.tag.major{background:#fde8c8;color:#7a4a00}
details{margin-top:8px}summary{cursor:pointer;color:#2459a6}
</style>
<h1>${esc(ev.tournament_name)} · ${esc(ev.name)}</h1>
<div class="sub">${esc(meta.game && meta.game.name)} · ${meta.registrant_count} registrants · results from ${meta.window.start.slice(0, 10)} to ${meta.window.end.slice(0, 10)}.
Placement is out of the event's entrants. W-L counts sets won and lost at that event, with DQs excluded.
Major columns count this game only, using the main bracket (largest field).
Seed and notes are suggestions. Click a column header in a player's table to sort it.</div>
<div class="wrap"><table class="summary"><thead><tr>${summaryHead.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>
${summary}
</tbody></table></div>
${details}
<script>
document.querySelectorAll('table.sortable').forEach(function (t) {
  t.querySelectorAll('th').forEach(function (th, i) {
    var dir = 1;
    th.addEventListener('click', function () {
      var tb = t.tBodies[0], rows = Array.prototype.slice.call(tb.rows);
      rows.sort(function (a, b) {
        var x = a.cells[i], y = b.cells[i];
        var xv = x.dataset.v != null ? x.dataset.v : x.innerText, yv = y.dataset.v != null ? y.dataset.v : y.innerText;
        var nx = parseFloat(xv), ny = parseFloat(yv);
        var c = (!isNaN(nx) && !isNaN(ny) && !/-\\d\\d-/.test(xv)) ? nx - ny : String(xv).localeCompare(String(yv));
        return c * dir;
      });
      rows.forEach(function (r) { tb.appendChild(r); });
      dir = -dir;
    });
  });
});
</script>`;
  const out = path.join(runDir, 'views', 'major-table.html');
  fs.writeFileSync(out, html);
  console.log(out);
  return 0;
}

main().then((c) => { process.exitCode = c; }, (e) => { console.error(e.stack || e); process.exitCode = 1; });
