'use strict';
// scripts/import-legacy.js — bring increment 1/2's per-event run folders into the tournament pool
// layout (docs/design-tool.md, T2), offline, so past events show in the app as done tournaments.
//
//   node scripts/import-legacy.js [--out <folder>] [--conflicts <folder>] [--only <tournament>] [--dry-run]
//
// For every out/<t>__<e>__<stamp>/ (the newest finished run per event):
//   out/<t>/pull-<stamp>/players.csv   union of the events' registrants, plus the `events` column
//   out/<t>/pull-<stamp>/results.csv   union of result rows (one per player per past event), no is_event_game
//   out/<t>/pull-<stamp>/meta.json     the pool shape: tournament, seeded_events, counts summed
//   out/<t>/current                    names that pull
//   out/<t>/state.json                 every imported event ticked; linked side tournaments from conflicts/linked.json
//   out/<t>/set-records.json           the events' views/set-records.json merged (W-L never refetched)
//   out/<t>/schedule.json              the newest conflicts/out/<t>__<stamp>/schedule.json, if any
// A tournament that already has a state.json is left alone (say --force to replace its pool; state.json,
// set-records.json and schedule.json are still never overwritten). The old folders are never touched.
// No start.gg request is made.

const fs = require('node:fs');
const path = require('node:path');
const out = require('../lib/output');
const pool = require('../lib/pool');

const LEGACY_RE = /^(.+?)__(.+?)__(\d{8}-\d{4})(?:-(\d+))?$/;
const SLUG_PART = /^[a-z0-9][a-z0-9-]*$/i;

function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }
// Anchored: a tournament slug can itself end in "-event" ("big-event/event/x"), so only a path
// segment that IS "event" counts.
const shortEvent = (slug) => { const m = /(?:^|\/)event\/([^/?#]+)/.exec(String(slug || '')); return (m ? m[1] : String(slug || '')).toLowerCase(); };

// Newest finished legacy run per (tournament, event).
function legacyRuns(outRoot) {
  const byKey = new Map();
  if (!fs.existsSync(outRoot)) return byKey;
  for (const d of fs.readdirSync(outRoot, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const m = LEGACY_RE.exec(d.name);
    if (!m || !SLUG_PART.test(m[1]) || !SLUG_PART.test(m[2])) continue;
    const dir = path.join(outRoot, d.name);
    const meta = readJson(path.join(dir, 'meta.json'));
    if (!meta || !meta.event) continue;
    const key = `${m[1].toLowerCase()}|${m[2].toLowerCase()}`;
    const prev = byKey.get(key);
    if (!prev || String(meta.run_at) > String(prev.meta.run_at)) byKey.set(key, { t: m[1].toLowerCase(), e: m[2].toLowerCase(), dir, meta });
  }
  return byKey;
}

function newestSchedule(conflictsOut, t) {
  if (!conflictsOut || !fs.existsSync(conflictsOut)) return null;
  const dirs = fs.readdirSync(conflictsOut).filter((n) => n.startsWith(t + '__')).sort();
  for (let i = dirs.length - 1; i >= 0; i--) {
    const f = path.join(conflictsOut, dirs[i], 'schedule.json');
    const j = readJson(f);
    if (j && j.tournament) return { file: f, json: j };
  }
  return null;
}

function sumCounts(metas, key) {
  const acc = {};
  for (const m of metas) for (const [k, v] of Object.entries(m[key] || {})) acc[k] = (acc[k] || 0) + (Number(v) || 0);
  return acc;
}

// Build one tournament's pool from its legacy runs. Pure except for reads; returns what to write.
function buildPool(t, runs, schedule) {
  const players = new Map();   // player_id -> row (+ events set)
  const results = new Map();   // player_id|event_id -> row
  const wl = {};
  const events = [];
  for (const r of runs) {
    const ev = r.meta.event;
    const slug = shortEvent(ev.slug);
    events.push({
      slug, id: String(ev.id), name: ev.name,
      game: r.meta.game ? { id: String(r.meta.game.id), name: r.meta.game.name } : null,
      start_at: ev.start_at || null, num_entrants: ev.num_entrants ?? null, singles: true, phases: [],
    });
    for (const p of out.parseCsv(fs.readFileSync(path.join(r.dir, 'players.csv'), 'utf8'))) {
      const cur = players.get(p.player_id);
      if (cur) cur._events.add(slug);
      else players.set(p.player_id, { ...p, _events: new Set([slug]) });
    }
    for (const row of out.parseCsv(fs.readFileSync(path.join(r.dir, 'results.csv'), 'utf8'))) {
      const { is_event_game, ...keep } = row; // eslint-disable-line no-unused-vars
      results.set(`${row.player_id}|${row.event_id}`, keep);
    }
    for (const f of ['set-records.json', 'bbb-records.json']) {
      const j = readJson(path.join(r.dir, 'views', f));
      if (j && typeof j === 'object') for (const [k, v] of Object.entries(j)) if (!(k in wl)) wl[k] = v;
    }
  }
  const playerRows = [...players.values()].map(({ _events, ...p }) => ({ ...p, events: [..._events].join(';') }));
  const resultRows = [...results.values()];
  const metas = runs.map((r) => r.meta);
  const newest = metas.reduce((a, b) => (String(a.run_at) > String(b.run_at) ? a : b));
  const tj = schedule && schedule.json.tournament;
  const name = (tj && tj.name) || runs[0].meta.event.tournament_name || t;
  const starts = events.map((e) => e.start_at).filter(Boolean).sort();
  const meta = {
    input_url: runs.map((r) => r.meta.input_url).filter(Boolean).join(' '),
    tournament: { id: tj ? String(tj.id) : null, slug: t, name, start_at: starts[0] || null, timezone: (tj && tj.timezone) || null },
    seeded_events: events,
    mode: 'full',
    run_at: newest.run_at,
    window: newest.window,
    registrant_count: playerRows.length,
    result_count: resultRows.length,
    history_status: sumCounts(metas, 'history_status'),
    team_entries_split: metas.reduce((n, m) => n + (Number(m.team_entries_split) || 0), 0),
    registrant_anomalies: [].concat(...metas.map((m) => m.registrant_anomalies || [])),
    region_coverage: sumCounts(metas, 'region_coverage'),
    request_count: metas.reduce((n, m) => n + (Number(m.request_count) || 0), 0),
    retries: metas.reduce((n, m) => n + (Number(m.retries) || 0), 0),
    query_complexity_max: Math.max(0, ...metas.map((m) => Number(m.query_complexity_max) || 0)),
    skipped: sumCounts(metas, 'skipped'),
    failed_players: [].concat(...metas.map((m) => m.failed_players || [])),
    sessions: metas.reduce((n, m) => n + (Number(m.sessions) || 0), 0),
    imported_from: runs.map((r) => path.basename(r.dir)),
  };
  const catalog = { tournament: meta.tournament, events };
  return { meta, playerRows, resultRows, wl, catalog, events };
}

function importTournament(outRoot, t, runs, { conflictsOut, dryRun, force, linkedFile, log = console.log } = {}) {
  const tDir = path.join(outRoot, t);
  const hasState = fs.existsSync(path.join(tDir, 'state.json'));
  if (hasState && !force) { log(`  ${t}: already in the pool layout (state.json exists); skipped`); return { t, skipped: true }; }
  const schedule = newestSchedule(conflictsOut, t);
  const built = buildPool(t, runs, schedule);
  const pullName = out.pullFolderName(new Date(built.meta.run_at));
  log(`  ${t}: ${runs.length} event(s), ${built.playerRows.length} players, ${built.resultRows.length} results, ${Object.keys(built.wl).length} W-L records${schedule ? ', schedule' : ''}${dryRun ? '  [dry run]' : ''}`);
  if (dryRun) return { t, dryRun: true, pullName, ...built };

  const dir = out.createPullFolder(tDir, pullName);
  const items = [
    ['players.csv', out.toCsv([...out.PLAYER_COLUMNS], built.playerRows)],
    ['results.csv', out.toCsv([...out.RESULT_COLUMNS], built.resultRows)],
    ['meta.json', JSON.stringify(built.meta, null, 2) + '\n'],
  ];
  for (const [name, content] of items) fs.writeFileSync(path.join(dir, name + '.tmp'), content);
  for (const [name] of items) fs.renameSync(path.join(dir, name + '.tmp'), path.join(dir, name));

  const wlFile = path.join(tDir, 'set-records.json');
  if (!fs.existsSync(wlFile)) pool.writeJsonAtomic(wlFile, built.wl);
  if (schedule && !fs.existsSync(path.join(tDir, 'schedule.json'))) fs.copyFileSync(schedule.file, path.join(tDir, 'schedule.json'));
  if (!hasState) {
    const state = pool.newState(built.catalog, linkedFile ? { linkedFile } : {});
    state.ticked = built.events.map((e) => e.slug);
    pool.writeState(tDir, state);
  }
  out.writeCurrent(tDir, path.basename(dir));
  return { t, pullDir: dir, ...built };
}

function importAll(outRoot, opts = {}) {
  const byT = new Map();
  for (const r of legacyRuns(outRoot).values()) {
    if (opts.only && r.t !== String(opts.only).toLowerCase()) continue;
    if (!byT.has(r.t)) byT.set(r.t, []);
    byT.get(r.t).push(r);
  }
  const done = [];
  for (const [t, runs] of byT) done.push(importTournament(outRoot, t, runs, opts));
  return done;
}

function main(argv = process.argv.slice(2)) {
  const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const root = process.env.SEEDING_ROOT ? path.resolve(process.env.SEEDING_ROOT) : path.join(__dirname, '..');
  const outRoot = arg('--out') ? path.resolve(arg('--out')) : path.join(root, 'out');
  const conflictsOut = arg('--conflicts') ? path.resolve(arg('--conflicts')) : path.join(root, 'conflicts', 'out');
  const res = importAll(outRoot, { conflictsOut, only: arg('--only'), dryRun: argv.includes('--dry-run'), force: argv.includes('--force') });
  if (!res.length) console.log('  No legacy run folders found under ' + outRoot);
  return 0;
}

if (require.main === module) process.exitCode = main();

module.exports = { legacyRuns, buildPool, importTournament, importAll, newestSchedule };
