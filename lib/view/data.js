'use strict';
// lib/view/data.js — run folders on disk -> the app's view model (the JSON the page renders).
// Node only. Reads; never writes.
//
// A run folder is out/<tournament>__<event>__<YYYYMMDD-HHMM>[-N] (lib/output.js runFolderName).
// It is FINISHED when meta.json exists (lib/output.js writes it last). The latest finished run
// of an event is the one with the newest meta.run_at.

const fs = require('node:fs');
const path = require('node:path');
const { parseCsv } = require('../output');
const M = require('./model');
const wl = require('../wl');

const SLUG_PART = /^[a-z0-9][a-z0-9-]*$/i;
const FOLDER = /^(.+?)__(.+?)__(\d{8}-\d{4})(?:-(\d+))?$/;

function parseFolder(name) {
  const m = FOLDER.exec(name);
  if (!m || !SLUG_PART.test(m[1]) || !SLUG_PART.test(m[2])) return null;
  return { t: m[1], e: m[2], stamp: m[3], n: Number(m[4] || 1) };
}

function readMeta(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')); } catch { return null; }
}

// Every run folder under outRoot: { dir, name, t, e, finished, runAt }.
function listRuns(outRoot) {
  if (!fs.existsSync(outRoot)) return [];
  const runs = [];
  for (const d of fs.readdirSync(outRoot, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const f = parseFolder(d.name);
    if (!f) continue;
    const dir = path.join(outRoot, d.name);
    const meta = readMeta(dir);
    runs.push({ dir, name: d.name, t: f.t, e: f.e, stamp: f.stamp, n: f.n, finished: !!meta, runAt: meta ? meta.run_at : null, meta });
  }
  return runs;
}

const newestFirst = (a, b) => (b.runAt || '').localeCompare(a.runAt || '') || b.stamp.localeCompare(a.stamp) || b.n - a.n;

function latestFinished(outRoot, t, e) {
  return listRuns(outRoot).filter((r) => r.t === t && r.e === e && r.finished).sort(newestFirst)[0] || null;
}

// One entry per event: its latest finished run (or none yet, if only unfinished folders exist).
function listEvents(outRoot) {
  const by = new Map();
  for (const r of listRuns(outRoot)) {
    const k = `${r.t}/${r.e}`;
    if (!by.has(k)) by.set(k, { t: r.t, e: r.e, latest: null, runs: 0 });
    const ev = by.get(k);
    ev.runs++;
    if (r.finished && (!ev.latest || newestFirst(r, ev.latest) < 0)) ev.latest = r;
  }
  return [...by.values()].sort((a, b) => ((b.latest && b.latest.runAt) || '').localeCompare((a.latest && a.latest.runAt) || ''));
}

// ---- The run's static part, parsed once per folder ----------------------------------------
// players.csv / results.csv / meta.json never change once meta.json exists, so the parse, the
// series index and the column choice are cached by folder (and meta.json's mtime, to be safe).
const COLS = ['player_id', 'event_date', 'game_name', 'is_event_game', 'tournament_name', 'event_name',
  'event_id', 'num_entrants', 'placement', 'is_online', 's'];
const runCache = new Map();

function readCsv(file) { return parseCsv(fs.readFileSync(file, 'utf8')); }

function loadRun(dir) {
  const mtime = fs.statSync(path.join(dir, 'meta.json')).mtimeMs;
  const hit = runCache.get(dir);
  if (hit && hit.mtime === mtime) return hit;
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  const players = readCsv(path.join(dir, 'players.csv'));
  const results = readCsv(path.join(dir, 'results.csv'));
  const index = M.buildSeriesIndex(results);
  const gameRows = results.filter(M.isGame);
  const { majors, shared } = M.chooseColumns(players, gameRows, index);
  const columns = { majors: majors.map((m) => m.label), shared };
  const labels = {};
  const rows = results.map((r) => {
    const s = index.keyOf(r);
    labels[s] ??= index.label(s);
    return COLS.map((c) => (c === 's' ? s : r[c]));
  });
  const fetch = M.fetchOrder(gameRows, { majors, shared }, index);
  const run = {
    dir, mtime, meta, players, results, index, columns, labels, rows, gameRows,
    fetchRows: fetch.ordered, inSummary: fetch.inSummary,
    playersOut: players.map((p) => ({ player_id: p.player_id, gamer_tag: p.gamer_tag, prefix: p.prefix,
      region_state: p.region_state, region_country: p.region_country, history_status: p.history_status })),
  };
  runCache.set(dir, run);
  if (runCache.size > 8) runCache.delete(runCache.keys().next().value);
  return run;
}

// set-records.json can be mid-write by another process (an older major-table.js wrote it in
// place). A parse failure falls back to the last good read of that folder.
const lastGoodCache = new Map();
function readRecords(dir) {
  try {
    const c = wl.loadCache(dir);
    lastGoodCache.set(dir, c);
    return c;
  } catch {
    return lastGoodCache.get(dir) || {};
  }
}

function readNotes(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'views', 'notes.json'), 'utf8')); } catch { return {}; }
}

// The page's JSON. `records` overrides the on-disk cache (the app passes a running job's
// in-memory cache, so a reload during a W-L fetch shows what has been fetched so far).
function viewModel(dir, { records } = {}) {
  const run = loadRun(dir);
  const recs = records || readRecords(dir);
  const sub = {};
  let known = 0;
  for (const r of run.gameRows) {
    const k = M.key(r);
    if (recs[k]) { sub[k] = recs[k]; known++; }
  }
  for (const r of run.results) { const k = M.key(r); if (!sub[k] && recs[k]) sub[k] = recs[k]; }
  const ev = run.meta.event || {};
  return {
    run: { folder: path.basename(dir), run_at: run.meta.run_at },
    meta: {
      event: ev, game: run.meta.game || { name: '?' }, registrant_count: run.meta.registrant_count,
      window: run.meta.window, history_status: run.meta.history_status,
    },
    players: run.playersOut,
    cols: COLS,
    rows: run.rows,
    labels: run.labels,
    columns: run.columns,
    records: sub,
    notes: readNotes(dir),
    wl: { known, total: run.gameRows.length },
  };
}

// The summary table as a Google Sheets CSV (lib/view/export.js), same rows, order and W-L as the page.
function summaryExport(dir, { records } = {}) {
  const R = require('./render');
  const { toSheetsCsv } = require('./export');
  const run = loadRun(dir);
  const notes = readNotes(dir);
  const ctx = R.summaryContext({ meta: run.meta, players: run.players, rows: run.results, records: records || readRecords(dir),
    notes, columns: run.columns, index: run.index });
  const ordered = M.orderPlayers(run.players, notes);
  const name = path.basename(dir).replace(/__(\d{8}-\d{4})(-\d+)?$/, '-seeding-$1').replace(/__/g, '-');
  return { filename: `${name}.csv`, csv: toSheetsCsv(R.summaryTextTable(ctx, ordered)) };
}

module.exports = { COLS, summaryExport, parseFolder, listRuns, latestFinished, listEvents, loadRun, readRecords, readNotes, viewModel, SLUG_PART };
