#!/usr/bin/env node
'use strict';
// views/major-table.js — a seeding view built from one run folder. This is not part of the pull.
//   node views/major-table.js <run folder>
// Writes <run folder>/views/major-table.html. Columns: one per configured major (event game only;
// main bracket = the largest field in that tournament, other brackets shown as "side"), Boston
// Blue Beat (best placement + best and average set W-L), every other result, and notes from
// <run folder>/views/notes.json.
// The W-L needs sets, which the pull doesn't fetch. They're fetched here through lib/startgg's paced,
// retrying client and cached in <run folder>/views/bbb-records.json, so re-rendering costs nothing.

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

const Q_BBB_SETS = `query($eid:ID!,$uid:ID!,$page:Int!){ event(id:$eid){ userEntrant(userId:$uid){ id
  paginatedSets(page:$page, perPage:40){ pageInfo{ totalPages }
    nodes{ winnerId slots{ entrant{ id } standing{ stats{ score{ value } } } } } } } } }`;
const Q_USER_ID = 'query($s:String!){ user(slug:$s){ id } }';

const readCsv = (f) => parseCsv(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ord = (n) => { n = +n; const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const pl = (r) => (r.placement ? `${ord(r.placement)} / ${r.num_entrants}` : `— / ${r.num_entrants} (no standing)`);
const yr = (r) => `'${r.event_date.slice(2, 4)}`;

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

async function fetchBbbRecords(runDir, players, bbbRows) {
  const cacheFile = path.join(runDir, 'views', 'bbb-records.json');
  const cache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {};
  const todo = bbbRows.filter((r) => !cache[`${r.player_id}:${r.event_id}`]);
  if (todo.length) {
    const { token } = loadToken({ envFile: path.join(__dirname, '..', '.env') });
    if (!token) throw new Error('No STARTGG_TOKEN in .env; needed to fetch Boston Blue Beat set records.');
    const client = createClient({ token });
    const userIds = {};
    for (const [i, r] of todo.entries()) {
      const p = players.find((x) => x.player_id === r.player_id);
      if (!p || !p.user_slug) continue;
      userIds[p.user_slug] ??= (await client.request('UserId', Q_USER_ID, { s: p.user_slug })).user.id;
      let sets = [], entrantId = null;
      for (let page = 1, total = 1; page <= total; page++) {
        const d = await client.request('BbbSets', Q_BBB_SETS, { eid: r.event_id, uid: userIds[p.user_slug], page });
        const ue = d && d.event && d.event.userEntrant;
        if (!ue) break;
        entrantId = ue.id; total = ue.paginatedSets.pageInfo.totalPages || 1;
        sets = sets.concat(ue.paginatedSets.nodes || []);
      }
      cache[`${r.player_id}:${r.event_id}`] = entrantId ? recordFor(entrantId, sets) : { missing: true };
      process.stderr.write(`BBB sets ${i + 1}/${todo.length} · ${r.gamer_tag} · ${r.event_name || r.tournament_name}\n`);
    }
    fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
  }
  return cache;
}

function majorCell(rows, major) {
  const hits = rows.filter((r) => r.is_event_game === 'true' && major.re.test(r.tournament_name));
  if (!hits.length) return '<span class="dim">—</span>';
  const byT = {};
  for (const r of hits) (byT[r.tournament_name] ??= []).push(r);
  return Object.values(byT)
    .sort((a, b) => b[0].event_date.localeCompare(a[0].event_date))
    .map((group) => {
      const [main, ...side] = [...group].sort((a, b) => +b.num_entrants - +a.num_entrants);
      const sideTxt = side.length ? ` <span class="dim">(+ side: ${side.map((s) => `${esc(s.event_name)} ${pl(s)}`).join('; ')})</span>` : '';
      return `<div><b>${pl(main)}</b> <span class="dim">${yr(main)}</span>${sideTxt}</div>`;
    }).join('');
}

function bbbCell(rows, records) {
  const bbb = rows.filter((r) => r.is_event_game === 'true' && BBB.test(r.tournament_name));
  if (!bbb.length) return '<span class="dim">—</span>';
  const placed = bbb.filter((r) => r.placement).sort((a, b) => +a.placement - +b.placement || +b.num_entrants - +a.num_entrants);
  const recs = bbb.map((r) => ({ r, rec: records[`${r.player_id}:${r.event_id}`] })).filter((x) => x.rec && !x.rec.missing && x.rec.w + x.rec.l > 0);
  let wl = '<span class="dim">no set records</span>';
  if (recs.length) {
    const best = [...recs].sort((a, b) => b.rec.w / (b.rec.w + b.rec.l) - a.rec.w / (a.rec.w + a.rec.l) || b.rec.w - a.rec.w)[0];
    const W = recs.reduce((n, x) => n + x.rec.w, 0), L = recs.reduce((n, x) => n + x.rec.l, 0);
    wl = `best W-L <b>${best.rec.w}-${best.rec.l}</b> <span class="dim">(${best.r.event_date})</span><br>`
      + `avg <b>${(W / recs.length).toFixed(1)}-${(L / recs.length).toFixed(1)}</b> per event · total ${W}-${L} (${Math.round(100 * W / (W + L))}%)`;
  }
  const bestP = placed[0] ? `best <b>${pl(placed[0])}</b> <span class="dim">(${placed[0].event_date})</span>` : 'no placements';
  return `<div>${bbb.length} events · ${bestP}</div><div>${wl}</div>`;
}

function otherCell(rows) {
  const used = (r) => r.is_event_game === 'true' && (BBB.test(r.tournament_name) || MAJORS.some((m) => m.re.test(r.tournament_name)));
  const rest = rows.filter((r) => !used(r));
  if (!rest.length) return '<span class="dim">—</span>';
  const line = (r) => `<li>${r.event_date} · ${esc(r.tournament_name)}${r.event_name && r.event_name !== r.tournament_name ? ` <span class="dim">— ${esc(r.event_name)}</span>` : ''} · <b>${pl(r)}</b>${r.is_online === 'true' ? ' <span class="tag">online</span>' : ''}</li>`;
  const game = rest.filter((r) => r.is_event_game === 'true');
  const others = rest.filter((r) => r.is_event_game !== 'true');
  const wins = game.filter((r) => r.placement === '1').length;
  const top3 = game.filter((r) => r.placement && +r.placement <= 3).length;
  const notable = [...game].filter((r) => r.placement).sort((a, b) => +b.num_entrants - +a.num_entrants).slice(0, 5);
  const byGame = {};
  for (const r of others) (byGame[r.game_name] ??= []).push(r);
  return `<div>${game.length} in this game · ${wins} wins · ${top3} top-3</div>`
    + (notable.length ? `<div class="dim">Largest fields:</div><ul>${notable.map(line).join('')}</ul>` : '')
    + `<details><summary>All ${game.length} in this game</summary><ul>${game.map(line).join('')}</ul></details>`
    + Object.entries(byGame).sort((a, b) => b[1].length - a[1].length)
      .map(([g, rs]) => `<details><summary>${esc(g)} (${rs.length})</summary><ul>${rs.map(line).join('')}</ul></details>`).join('');
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
  const bbbRows = results.filter((r) => r.is_event_game === 'true' && BBB.test(r.tournament_name));
  const records = await fetchBbbRecords(runDir, players, bbbRows);

  const ordered = [...players].sort((a, b) => (notes[a.player_id]?.seed ?? 99) - (notes[b.player_id]?.seed ?? 99) || +b.result_count - +a.result_count);
  const head = ['Seed', 'Player', 'Region', ...MAJORS.map((m) => m.label), 'Boston Blue Beat', 'Other results', 'Notes'];
  const body = ordered.map((p) => {
    const rows = results.filter((r) => r.player_id === p.player_id);
    const n = notes[p.player_id] || {};
    const region = [p.region_state, p.region_country].filter(Boolean).join(', ') || '<span class="dim">—</span>';
    const who = `<b>${esc(p.gamer_tag)}</b>${p.prefix ? ` <span class="dim">(${esc(p.prefix)})</span>` : ''}<div class="dim">${p.result_count} results · ${p.history_status}</div>`;
    return `<tr><td class="seed">${esc(n.seed ?? '')}</td><td>${who}</td><td>${region}</td>`
      + MAJORS.map((m) => `<td>${majorCell(rows, m)}</td>`).join('')
      + `<td>${bbbCell(rows, records)}</td><td class="other">${otherCell(rows)}</td><td class="notes">${esc(n.notes || '')}</td></tr>`;
  }).join('\n');

  const ev = meta.event;
  const html = `<!doctype html><meta charset="utf-8"><title>${esc(ev.name)} — seeding view</title>
<style>
body{font:13px/1.4 system-ui,sans-serif;margin:16px;background:#fafafa;color:#1a1a1a}
h1{font-size:18px;margin:0 0 4px}.sub{color:#666;margin-bottom:12px}
.wrap{overflow-x:auto}table{border-collapse:collapse;background:#fff;min-width:1400px}
th,td{border:1px solid #ddd;padding:6px 8px;vertical-align:top;text-align:left}
th{background:#f0f0f0;position:sticky;top:0;font-weight:600}
td.seed{font-size:18px;font-weight:700;text-align:center}td.other{min-width:320px;max-width:420px}
td.notes{min-width:260px;max-width:360px}.dim{color:#888}ul{margin:4px 0;padding-left:16px}
li{margin:1px 0}.tag{font-size:10px;background:#eef;border-radius:3px;padding:0 3px;color:#446}
details{margin-top:4px}summary{cursor:pointer;color:#2459a6}
</style>
<h1>${esc(ev.tournament_name)} · ${esc(ev.name)}</h1>
<div class="sub">${esc(meta.game && meta.game.name)} · ${meta.registrant_count} registrants · results ${meta.window.start.slice(0, 10)} to ${meta.window.end.slice(0, 10)} ·
majors and Boston Blue Beat = this game only, main bracket = largest field (other brackets marked "side") ·
W-L = sets won and lost at that event, DQs excluded · seed and notes are suggestions</div>
<div class="wrap"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>
${body}
</tbody></table></div>`;
  const out = path.join(runDir, 'views', 'major-table.html');
  fs.writeFileSync(out, html);
  console.log(out);
  return 0;
}

main().then((c) => { process.exitCode = c; }, (e) => { console.error(e.stack || e); process.exitCode = 1; });
