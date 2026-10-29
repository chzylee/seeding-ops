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
const majorsConfig = require('./majors');

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

// The page's tournament slug: the run folder's <tournament> part (what /e/<t>/<e> names), else
// the event slug's. last_reviewed_tournament is compared against this.
function tournamentOf(dir, meta) {
  const f = parseFolder(path.basename(dir));
  if (f) return f.t;
  const m = /^tournament\/([^/]+)/.exec((meta && meta.event && meta.event.slug) || '');
  return m ? m[1] : null;
}

// Today as YYYY-MM-DD, in UTC, the same calendar decided_on has always used (now.toISOString()).
// Every date the T1 rules compare (decided_on, last_reviewed_on, the recency bands) goes through
// here, so a review, its undo and its color agree on what "today" is.
const todayOf = (now = new Date()) => now.toISOString().slice(0, 10);

// ---- The run's static part, parsed once per folder ----------------------------------------
// players.csv / results.csv / meta.json never change once meta.json exists, so the parse, the
// series index and the column choice are cached by folder (and meta.json's mtime, to be safe).
const COLS = ['player_id', 'event_date', 'game_name', 'is_event_game', 'tournament_name', 'event_name',
  'event_id', 'num_entrants', 'placement', 'is_online', 's'];
const runCache = new Map();

function readCsv(file) { return parseCsv(fs.readFileSync(file, 'utf8')); }

// The majors list for the run's game comes from config/majors.json (lib/view/majors.js); an edit
// to that file invalidates the cached parse (the config object changes when its mtime does).
function loadRun(dir, { majorsFile } = {}) {
  const mtime = fs.statSync(path.join(dir, 'meta.json')).mtimeMs;
  const cfg = majorsConfig.loadMajorsConfig(majorsFile);
  const hit = runCache.get(dir);
  if (hit && hit.mtime === mtime && hit.cfg === cfg) return hit;
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  const players = readCsv(path.join(dir, 'players.csv'));
  const results = readCsv(path.join(dir, 'results.csv'));
  const majorsList = majorsConfig.majorsForGame(cfg, meta.game && meta.game.id);
  const index = M.buildSeriesIndex(results, { majors: majorsList });
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
    dir, mtime, cfg, meta, tournament: tournamentOf(dir, meta), players, results, index, columns, labels, rows, gameRows,
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

// Per-player notes for a run: <run>/views/notes.json (seed, notes), merged with Noah's tiers table
// registry/tiers.csv for this run's game — matched by start.gg player_id, else by tag (start.gg tag
// with or without its team prefix, or the sheet tag). Adds { tier, notes, last_reviewed_on, last_reviewed_tournament }.
//
// The path is injectable (A2-1): a `tiersFile` option on readNotes/viewModel/summaryExport/
// updatePlayer, or the SEED_TIERS_FILE env var, both read at call time so a test (or the server,
// via createApp({ tiersFile })) can point every one of these functions at a scratch file without
// ever touching the real registry/tiers.csv. defaultTiersFile() is a function, not a frozen
// constant, for exactly the reason A2-1 flagged: module.exports copying a const's value at
// require-time can't be redirected by a test that reassigns it afterward.
function defaultTiersFile() {
  return process.env.SEED_TIERS_FILE
    ? path.resolve(process.env.SEED_TIERS_FILE)
    : path.join(__dirname, '..', '..', 'registry', 'tiers.csv');
}
const TIERS_FILE = defaultTiersFile(); // back-compat: the default path, resolved once at load.
function readTiers(gameId, tiersFile = defaultTiersFile()) {
  try {
    const { parseCsv } = require('../output');
    return parseCsv(fs.readFileSync(tiersFile, 'utf8').replace(/^﻿/, ''))
      .filter((r) => !gameId || String(r.game_id) === String(gameId));
  } catch { return []; }
}

// ---- Shared tier-row matching (A4-2, build-record-webapp.md pass 4) -----------------------
// The reader (readNotes, below — what the page displays) and the writer (updatePlayer, further
// down — what an edit saves) must pick the SAME row for the same player, or a display and an
// edit can silently disagree about whose tier it's showing. One index, one precedence, used by
// both:
//   1. the row already linked to this exact player_id.
//   2. among rows with NO player_id yet (unlinked — the normal pre-link state for every
//      sheet-imported row, before Eclipse or an app edit links it), the first whose
//      startgg_tag or sheet_tag — in full ("prefix | tag") or with the team prefix stripped —
//      normalizes to one of this player's own tags.
// A row already linked to a DIFFERENT player_id never matches by tag alone: two real people can
// share a tag, and letting an already-linked row answer to someone else's tag by name is exactly
// how a display can show one person's tier under a different person's row (A4-2's repro: player
// 600 reads as player 500's linked "Foo" row until an edit forks a second, emptier one for 600).
const normTag = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const lastTag = (s) => normTag(String(s || '').split('|').pop());
const tierKeysOf = (p) => [normTag(p.prefix ? `${p.prefix} | ${p.gamer_tag}` : p.gamer_tag), normTag(p.gamer_tag)];
// Index once per call — the reader indexes once for every player in the run; the writer indexes
// once per edit, over that game's rows. First row wins a tie on either map (matches the old
// writer's .find() order; the old reader's byPid Map let a later duplicate win instead, an
// inconsistency this unification also closes).
function indexTierRows(rows) {
  const byPid = new Map();
  const unlinkedByTag = new Map();
  for (const r of rows) {
    if (r.player_id) { if (!byPid.has(String(r.player_id))) byPid.set(String(r.player_id), r); continue; }
    for (const k of [normTag(r.startgg_tag), lastTag(r.startgg_tag), normTag(r.sheet_tag), lastTag(r.sheet_tag)]) {
      if (k && !unlinkedByTag.has(k)) unlinkedByTag.set(k, r);
    }
  }
  return { byPid, unlinkedByTag };
}
function matchTierRow(index, player) {
  return index.byPid.get(String(player.player_id))
    || tierKeysOf(player).map((k) => index.unlinkedByTag.get(k)).find(Boolean)
    || null;
}

function readNotes(dir, players, gameId, tiersFile) {
  let notes = {};
  try { notes = JSON.parse(fs.readFileSync(path.join(dir, 'views', 'notes.json'), 'utf8')); } catch { notes = {}; }
  if (!players) return notes;
  const tiers = readTiers(gameId, tiersFile);
  if (!tiers.length) return notes;
  const index = indexTierRows(tiers);
  for (const p of players) {
    const t = matchTierRow(index, p);
    if (!t) continue;
    const n = notes[p.player_id] || {};
    const tiered = String(t.tier ?? '').trim() !== '';
    // A row with no tier, no note and no review says nothing about this player.
    if (!tiered && !t.notes && !t.last_reviewed_on && !t.last_reviewed_tournament) continue;
    // 'notes' is the editable column (seeded from the sheet's notes); older files only have sheet_notes.
    const out = { ...n, notes: 'notes' in t ? (t.notes || '') : [n.notes, t.sheet_notes].filter(Boolean).join(' · '),
      last_reviewed_on: t.last_reviewed_on || '', last_reviewed_tournament: t.last_reviewed_tournament || '' };
    if (tiered) out.tier = Number(t.tier); else delete out.tier;
    notes[p.player_id] = out;
  }
  return notes;
}

// The page's JSON. `records` overrides the on-disk cache (the app passes a running job's
// in-memory cache, so a reload during a W-L fetch shows what has been fetched so far).
// `tournament` (the run's tournament slug) and `today` drive the review mark and the tier
// recency color (lib/view/model.js recency); opts.today overrides the date (tests, the CLI).
function viewModel(dir, { records, tiersFile, today, majorsFile } = {}) {
  const run = loadRun(dir, { majorsFile });
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
    tournament: run.tournament,
    today: today || todayOf(),
    players: run.playersOut,
    cols: COLS,
    rows: run.rows,
    labels: run.labels,
    columns: run.columns,
    records: sub,
    notes: readNotes(dir, run.players, run.meta.game && run.meta.game.id, tiersFile),
    wl: { known, total: run.gameRows.length },
  };
}

// The summary table as a Google Sheets CSV (lib/view/export.js), same rows, order and W-L as the page.
function summaryExport(dir, { records, tiersFile, today, majorsFile } = {}) {
  const R = require('./render');
  const { toSheetsCsv } = require('./export');
  const run = loadRun(dir, { majorsFile });
  const notes = readNotes(dir, run.players, run.meta.game && run.meta.game.id, tiersFile);
  const ctx = R.summaryContext({ meta: run.meta, players: run.players, rows: run.results, records: records || readRecords(dir),
    notes, columns: run.columns, index: run.index, tournament: run.tournament, today: today || todayOf() });
  const ordered = M.orderPlayers(run.players, notes);
  const name = path.basename(dir).replace(/__(\d{8}-\d{4})(-\d+)?$/, '-seeding-$1').replace(/__/g, '-');
  return { filename: `${name}.csv`, csv: toSheetsCsv(R.summaryTextTable(ctx, ordered)) };
}

// ---- Writing registry/tiers.csv (T1): tier / notes edits and the ✓ review mark -----------------
// Both writes go to the run's game's row for this player: the row with this player_id, else the
// unlinked row whose tag matches (and links it to the player_id), else a new row; the same
// matcher readNotes uses (A4-2), so a write lands on the row a reload shows. Written atomically
// (temp file + rename), UTF-8 with a BOM, every field quoted (lib/output.js toCsv).
//
// Columns: TIER_COLS (docs/design-tool.md, T1), then any other column the file already has, in
// the file's order, so a column this code doesn't know is carried, never dropped.
const TIER_COLS = ['game_id', 'game_name', 'player_id', 'startgg_tag', 'sheet_tag', 'tier', 'notes', 'decided_on',
  'last_reviewed_on', 'last_reviewed_tournament', 'source', 'sheet_region', 'sheet_placements', 'sheet_notes'];

function readTierTable(tiersFile) {
  let text;
  try { text = fs.readFileSync(tiersFile, 'utf8').replace(/^﻿/, ''); } catch { return { all: [], cols: TIER_COLS }; }
  const all = parseCsv(text);
  // The header's names (parsed with one blank row under it, so a file with no rows yet still
  // names its columns; a quoted header can't contain a line break in this file).
  const fileCols = Object.keys(parseCsv(`${text.split(/\r?\n/)[0]}\r\n""\r\n`)[0] || {});
  return { all, cols: [...TIER_COLS, ...fileCols.filter((c) => c && !TIER_COLS.includes(c))] };
}

// mutate(row, { created }) changes the row in place; returning false means "nothing to write".
function editTierRow(dir, playerId, tiersFile, mutate) {
  const { toCsv } = require('../output');
  const run = loadRun(dir);
  const p = run.players.find((x) => String(x.player_id) === String(playerId));
  if (!p) throw Object.assign(new Error('Unknown player for this event.'), { status: 404 });
  const gameId = String(run.meta.game && run.meta.game.id);
  const { all, cols } = readTierTable(tiersFile);
  for (const r of all) if (!('notes' in r)) r.notes = r.sheet_notes || '';
  const mine = all.filter((r) => String(r.game_id) === gameId);
  // A4-2: the same matcher readNotes uses, so an edit lands on the row a reload would show.
  let row = matchTierRow(indexTierRows(mine), p);
  const created = !row;
  if (created) {
    row = Object.fromEntries(cols.map((c) => [c, '']));
    Object.assign(row, { game_id: gameId, game_name: run.meta.game.name, startgg_tag: p.gamer_tag, sheet_tag: p.gamer_tag, source: 'app' });
  }
  if (mutate(row, { created }) === false) return created ? null : row;
  if (created) all.push(row);
  row.player_id = String(p.player_id);
  fs.mkdirSync(path.dirname(tiersFile), { recursive: true });
  const tmp = tiersFile + '.tmp';
  fs.writeFileSync(tmp, toCsv(cols, all));
  fs.renameSync(tmp, tiersFile);
  return row;
}

const rowOut = (playerId, row) => ({
  player_id: String(playerId),
  tier: !row || row.tier === '' || row.tier == null ? null : Number(row.tier),
  notes: (row && row.notes) || '',
  decided_on: (row && row.decided_on) || '',
  last_reviewed_on: (row && row.last_reviewed_on) || '',
  last_reviewed_tournament: (row && row.last_reviewed_tournament) || '',
});

// The app's POST …/player/<id>: tier and notes. A tier change stamps decided_on; every edit sets
// source "app". There is no reason field (T1 dropped justification); the route passes only tier
// and notes.
function updatePlayer(dir, playerId, fields, { now = new Date(), tiersFile = defaultTiersFile() } = {}) {
  const row = editTierRow(dir, playerId, tiersFile, (r) => {
    if ('tier' in fields) {
      const t = fields.tier === '' || fields.tier == null ? '' : Number(fields.tier);
      if (t !== '' && (!Number.isInteger(t) || t < 0 || t > 20)) throw Object.assign(new Error('Tier must be a whole number from 0 to 20.'), { status: 400 });
      if (String(r.tier) !== String(t)) r.decided_on = todayOf(now);
      r.tier = String(t);
    }
    if ('notes' in fields) r.notes = String(fields.notes ?? '');
    r.source = 'app';
  });
  return rowOut(playerId, row);
}

// The ✓ (T1 rules, "✓ semantics"). reviewed: true sets last_reviewed_on to today and
// last_reviewed_tournament to this run's tournament. reviewed: false is an undo for a misclick
// only: it clears both when they are this tournament AND today, and otherwise does nothing, so a
// review recorded earlier (another day, or another tournament) is never destroyed by a click.
// Tier, notes, decided_on and source are untouched (a row the ✓ has to create is source "app").
// Returns the row's state after the click, and `changed`.
function reviewPlayer(dir, playerId, { reviewed, now = new Date(), tiersFile = defaultTiersFile() } = {}) {
  if (typeof reviewed !== 'boolean') throw Object.assign(new Error('"reviewed" must be true or false.'), { status: 400 });
  const tournament = loadRun(dir).tournament;
  if (!tournament) throw Object.assign(new Error('This run has no tournament slug.'), { status: 400 });
  const today = todayOf(now);
  let changed = false;
  const row = editTierRow(dir, playerId, tiersFile, (r, { created }) => {
    if (reviewed) {
      if (!created && r.last_reviewed_on === today && r.last_reviewed_tournament === tournament) return false;
      r.last_reviewed_on = today;
      r.last_reviewed_tournament = tournament;
    } else {
      if (created || r.last_reviewed_tournament !== tournament || r.last_reviewed_on !== today) return false;
      r.last_reviewed_on = '';
      r.last_reviewed_tournament = '';
    }
    changed = true;
    return true;
  });
  return { ...rowOut(playerId, row), changed };
}

module.exports = { updatePlayer, reviewPlayer, TIER_COLS, todayOf, tournamentOf, TIERS_FILE, defaultTiersFile, COLS, summaryExport, parseFolder, listRuns, latestFinished, listEvents, loadRun, readRecords, readNotes, viewModel, SLUG_PART };
