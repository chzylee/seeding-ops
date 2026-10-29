#!/usr/bin/env node
'use strict';
// views/major-table.js — the seeding view as one static HTML file per run folder. This is not part
// of the pull. The app (npm run app) shows the same view live, with pin, compare and refresh;
// this CLI stays for a file you can keep or send, and for rendering from the cache alone.
//   node views/major-table.js <run folder> [--no-fetch] [--all-games]
// Writes <run folder>/views/major-table.html:
//   1. Summary: one row per player. Majors (config/majors.json: this game's main event there, one per year)
//      as "placement / entrants · W-L"; the series the most registrants share, each as best
//      placement (with W-L), best W-L and average W-L; seed and notes from views/notes.json.
//   2. Per player: a series table, then every result in this game and other games, collapsed.
// Per Noah (2026-10-14): what matters per result is event name, placement out of entrants and W-L;
// the date is secondary; no aggregate counts (placements only mean something relative to the event).
// W-L needs sets, which the pull doesn't fetch. lib/wl.js fetches them and caches them in
// <run>/views/set-records.json, so re-rendering costs nothing.
// The logic lives in lib/view/model.js and the HTML in lib/view/render.js, shared with the app.

const fs = require('node:fs');
const path = require('node:path');
const data = require('../lib/view/data');
const { createClient } = require('../lib/startgg');
const { loadToken } = require('../lib/token');
const M = require('../lib/view/model');
const R = require('../lib/view/render');
const wl = require('../lib/wl');

const { esc } = R;

async function fetchSetRecords(runDir, players, rows, isSummary) {
  const cache = wl.loadCache(runDir);
  const todo = rows.filter((r) => !cache[M.key(r)]);
  // --no-fetch renders from the cache only (e.g. while another render is still fetching:
  // two fetching processes would together exceed start.gg's 80 requests / 60 s).
  if (todo.length && process.argv.includes('--no-fetch')) {
    process.stderr.write(`--no-fetch: ${todo.length} results have no cached W-L yet; shown as —\n`);
  } else if (todo.length) {
    const { token } = loadToken({ envFile: path.join(__dirname, '..', '.env') });
    if (!token) throw new Error('No STARTGG_TOKEN in .env; needed to fetch set records.');
    const client = createClient({ token });
    await wl.fetchSetRecords({
      client, players, rows, cache, isSummary,
      onChunk: (p) => {
        wl.saveCache(runDir, cache); // a killed render keeps what it fetched
        process.stderr.write(`sets ${p.done}/${p.total} · ${p.rows[0].gamer_tag} · ${client.stats.requests} requests · complexity max ${client.stats.complexityMax}\n`);
      },
    });
    wl.saveCache(runDir, cache);
  }
  return cache;
}

// The page as one HTML string. The context comes from the app's own view model and context
// builder (lib/view/data.js viewModel, lib/view/render.js contextFromViewModel), so this file
// shows the same cells as the app: the same majors (config/majors.json), the same tiers and
// review marks (registry/tiers.csv), the same series. opts.today / opts.tiersFile: for tests.
function renderHtml(runDir, { records, allGames = false, today, tiersFile } = {}) {
  const vm = data.viewModel(runDir, { records, today, tiersFile });
  const ctx = { ...R.contextFromViewModel(vm, { app: false }), allGames };
  const ordered = M.orderPlayers(vm.players, ctx.notes);
  const meta = vm.meta;
  const summary = ordered.map((p) => R.summaryRow(p, ctx)).join('\n');
  const details = ordered.map((p) => R.playerTitle(p) + R.playerBody(p, ctx)).join('\n');
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
table.summary .who{position:sticky;left:0;background:#fff;z-index:1;min-width:120px}
table.summary th.who{background:#f0f0f0}
table.res td.num{white-space:nowrap;text-align:right}table.res td.date{color:#888;white-space:nowrap}
table.res td.each{min-width:240px}table.res td.each .line{white-space:nowrap}
table.sortable th{cursor:pointer}table.sortable th:hover{background:#e6e6e6}
.dim{color:#888}a{color:#2459a6;text-decoration:none}
table.summary tr.reviewed-row>td{background:#e3f4e8}table.summary td.tier{text-align:center}
table.summary td.tier.rec-here{background:#bfe3c9;color:#14532d}table.summary td.tier.rec-old{background:#fdebcc;color:#6e4300}table.summary td.tier.rec-never{background:#e6e8ec}
.tag{font-size:11px;background:#eef;border-radius:3px;padding:0 4px;color:#446;margin-left:4px}.tag.major{background:#fde8c8;color:#7a4a00}
details{margin-top:8px}summary{cursor:pointer;color:#2459a6}
</style>
<h1>${esc(ev.tournament_name)} · ${esc(ev.name)}</h1>
<div class="sub">${esc(meta.game && meta.game.name)} · ${meta.registrant_count} registrants · results from ${meta.window.start.slice(0, 10)} to ${meta.window.end.slice(0, 10)}.
Placement is out of the event's entrants. W-L counts sets won and lost at that event, with DQs excluded.
Major columns (config/majors.json) show this game's main event at each major, one result per year.
Seed and notes are suggestions. Tier color: green reviewed at this tournament, amber reviewed over 6 months ago, grey never reviewed; hover a tier for when and where. Click a column header in a player's table to sort it.</div>
<div class="wrap"><table class="summary"><thead>${R.summaryHeadRow(ctx)}</thead><tbody>
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
  return html;
}

async function main() {
  const runDir = path.resolve(process.argv[2] || '');
  if (!fs.existsSync(path.join(runDir, 'meta.json'))) { console.error('Usage: node views/major-table.js <finished run folder>'); return 2; }
  fs.mkdirSync(path.join(runDir, 'views'), { recursive: true });
  const run = data.loadRun(runDir);
  // W-L for this game's results by default; --all-games also fetches other games (more requests).
  // Fetch order: results the summary columns use first, so the summary is complete early.
  const allGames = process.argv.includes('--all-games');
  const columns = { majors: run.columns.majors.map((label) => ({ label })), shared: run.columns.shared };
  const { ordered: fetchRows, inSummary } = M.fetchOrder(allGames ? run.results : run.gameRows, columns, run.index);
  const records = await fetchSetRecords(runDir, run.players, fetchRows, inSummary);
  const html = renderHtml(runDir, { records, allGames });
  const out = path.join(runDir, 'views', 'major-table.html');
  fs.writeFileSync(out, html);
  console.log(out);
  return 0;
}

module.exports = { renderHtml, main };

if (require.main === module) {
  main().then((c) => { process.exitCode = c; }, (e) => { console.error(e.stack || e); process.exitCode = 1; });
}
