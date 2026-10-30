'use strict';
// lib/view/data.js — a tab of a tournament pool (or a run-shaped folder) -> the app's view model
// (the JSON the page renders), the Sheets and seeds exports, and the two T1 writes (tier/notes
// edits and the ✓ review) to registry/tiers.csv. Node only. Writes nothing but registry/tiers.csv.
//
// The app reads tournaments through lib/pool.js: out/<t>/current names the live pull, and
// tabSource() below slices it by game. Increment 1's per-event run folders in out/ are never
// listed or read by the app. A run-shaped folder (players.csv, results.csv, meta.json with one
// `game`) is still accepted by every function here: the unit tests and the CLI view build them.

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
//
// `src` is either a run-shaped folder (a path: players.csv, results.csv and meta.json with one
// `game`, as increment 1 wrote them; the unit tests and scripts/synth-run.js build these) or a TAB
// of a tournament pool (tabSource below, docs/design-tool.md T2): the live pull's players who
// entered one of the tab's seeded events, all their results, and is_event_game computed per row as
// game_id === the tab's game (T2: "each tab computes game_id === tab.game_id"). Everything after
// the read is the same code for both, so a tab is increment 2's table sliced by game_id.
function readSource(src) {
  if (typeof src === 'string') {
    const dir = src;
    const mtime = fs.statSync(path.join(dir, 'meta.json')).mtimeMs;
    return { key: dir, dir, mtime, read: () => {
      const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
      return { meta, tournament: tournamentOf(dir, meta), players: readCsv(path.join(dir, 'players.csv')), results: readCsv(path.join(dir, 'results.csv')) };
    } };
  }
  const dir = src.pullDir;
  const mtime = fs.statSync(path.join(dir, 'meta.json')).mtimeMs;
  return { key: `${dir}|${src.game.id}|${src.events.join(',')}`, dir, mtime, read: () => {
    const pm = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
    const tabEvents = new Set(src.events);
    const players = readCsv(path.join(dir, 'players.csv'))
      .filter((p) => String(p.events || '').split(';').some((e) => tabEvents.has(e)));
    const ids = new Set(players.map((p) => p.player_id));
    const gid = String(src.game.id);
    const results = readCsv(path.join(dir, 'results.csv')).filter((r) => ids.has(r.player_id))
      .map((r) => ({ ...r, is_event_game: String(String(r.game_id) === gid) }));
    const seeded = (pm.seeded_events || []).filter((e) => tabEvents.has(e.slug));
    const statuses = { complete: 0, limited: 0, failed: 0 };
    for (const p of players) statuses[p.history_status] = (statuses[p.history_status] || 0) + 1;
    const meta = {
      event: { tournament_name: pm.tournament && pm.tournament.name, name: seeded.map((e) => e.name).join(' + ') || src.game.name,
        slug: seeded.map((e) => e.slug).join(' '), start_at: seeded.map((e) => e.start_at).filter(Boolean).sort()[0] || null },
      game: { id: gid, name: src.game.name },
      tournament: pm.tournament, seeded_events: seeded, run_at: pm.run_at, window: pm.window,
      registrant_count: players.length, history_status: statuses,
    };
    return { meta, tournament: src.tournament, players, results };
  } };
}

function loadRun(src, { majorsFile } = {}) {
  const s = readSource(src);
  const { dir, mtime } = s;
  const cfg = majorsConfig.loadMajorsConfig(majorsFile);
  const hit = runCache.get(s.key);
  if (hit && hit.mtime === mtime && hit.cfg === cfg) return hit;
  const { meta, tournament, players, results } = s.read();
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
    dir, src, mtime, cfg, meta, tournament, players, results, index, columns, labels, rows, gameRows,
    fetchRows: fetch.ordered, inSummary: fetch.inSummary,
    playersOut: players.map((p) => ({ player_id: p.player_id, gamer_tag: p.gamer_tag, prefix: p.prefix,
      region_state: p.region_state, region_country: p.region_country, history_status: p.history_status,
      // A1.3: an uploaded player's name in the list (hover on the tag when it differs).
      ...(p.alias ? { alias: p.alias } : {}),
      // E2-6: why an uploaded row's lookup failed (a row start.gg does not know has none).
      ...(p.lookup_error ? { lookup_error: p.lookup_error } : {}) })),
  };
  runCache.set(s.key, run);
  if (runCache.size > 8) runCache.delete(runCache.keys().next().value);
  return run;
}

// set-records.json can be mid-write by another process (an older major-table.js wrote it in
// place). A parse failure falls back to the last good read of that folder.
const lastGoodCache = new Map();
// A tab reads the pool's shared cache, out/<t>/set-records.json (lib/wl.js poolCacheFile).
function readRecords(src) {
  const k = typeof src === 'string' ? src : wl.poolCacheFile(src.tDir);
  try {
    const c = typeof src === 'string' ? wl.loadCache(src) : wl.loadPoolCache(src.tDir);
    lastGoodCache.set(k, c);
    return c;
  } catch {
    return lastGoodCache.get(k) || {};
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
  if (process.env.SEED_TIERS_FILE) return path.resolve(process.env.SEED_TIERS_FILE);
  // SEEDING_ROOT: the project folder when running inside the compiled desktop sidecar.
  const root = process.env.SEEDING_ROOT ? path.resolve(process.env.SEEDING_ROOT) : path.join(__dirname, '..', '..');
  return path.join(root, 'registry', 'tiers.csv');
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
//
// Build C (Amendment A1.2, match order): the id comes first, in two forms: the row's player_id, then
// its `discriminator` (the start.gg user code) against the player's own (players.csv user_slug is
// "user/<code>"). Only then the tag, and only among rows with neither id. A row found by tag only is
// reported as such (matchTierRowBy's `by: 'tag'`), so the page can color it (readNotes `tag_only`),
// and a ✓ or an edit writes both ids into it (editTierRow), which makes the link real.
const normTag = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const lastTag = (s) => normTag(String(s || '').split('|').pop());
// A start.gg discriminator: the code in start.gg/user/<code>. Eight hex characters in every value
// seen so far (the Mixfest file's 32, the pulls' user_slug); kept lower case.
const DISCRIMINATOR = /^[0-9a-f]{8}$/i;
function discriminatorOf(p) {
  const raw = String((p && (p.discriminator || p.user_slug)) || '').trim().replace(/^user\//i, '');
  return DISCRIMINATOR.test(raw) ? raw.toLowerCase() : '';
}
// The player's tags as a tiers row may hold them: "prefix | tag" and the bare tag; for an uploaded
// player also the tag the uploaded list gave (`alias`, Amendment A1.3), after the start.gg ones.
const tierKeysOf = (p) => [normTag(p.prefix ? `${p.prefix} | ${p.gamer_tag}` : p.gamer_tag), normTag(p.gamer_tag),
  ...(p.alias ? [normTag(p.alias), lastTag(p.alias)] : [])].filter(Boolean);
// Index once per call — the reader indexes once for every player in the run; the writer indexes
// once per edit, over that game's rows. First row wins a tie on any map (matches the old
// writer's .find() order; the old reader's byPid Map let a later duplicate win instead, an
// inconsistency this unification also closes).
function indexTierRows(rows) {
  const byPid = new Map();
  const byDisc = new Map();
  const unlinkedByTag = new Map();
  for (const r of rows) {
    const d = DISCRIMINATOR.test(String(r.discriminator || '').trim()) ? String(r.discriminator).trim().toLowerCase() : '';
    if (d && !byDisc.has(d)) byDisc.set(d, r);
    if (r.player_id) { if (!byPid.has(String(r.player_id))) byPid.set(String(r.player_id), r); continue; }
    if (d) continue; // linked by its discriminator: never answers to a tag
    for (const k of [normTag(r.startgg_tag), lastTag(r.startgg_tag), normTag(r.sheet_tag), lastTag(r.sheet_tag)]) {
      if (k && !unlinkedByTag.has(k)) unlinkedByTag.set(k, r);
    }
  }
  return { byPid, byDisc, unlinkedByTag };
}
// { row, by: 'player_id' | 'discriminator' | 'tag' } or null.
function matchTierRowBy(index, player) {
  const pid = index.byPid.get(String(player.player_id));
  if (pid) return { row: pid, by: 'player_id' };
  const d = discriminatorOf(player);
  const disc = d && index.byDisc.get(d);
  // A row whose player_id names someone else is that person's, whatever its discriminator says.
  if (disc && (!disc.player_id || String(disc.player_id) === String(player.player_id))) return { row: disc, by: 'discriminator' };
  const tag = tierKeysOf(player).map((k) => index.unlinkedByTag.get(k)).find(Boolean);
  return tag ? { row: tag, by: 'tag' } : null;
}
function matchTierRow(index, player) {
  const m = matchTierRowBy(index, player);
  return m ? m.row : null;
}

// A tab of a pool has no notes.json (T2: three tables; notes live in T1), only the tiers.
function readNotes(dir, players, gameId, tiersFile) {
  let notes = {};
  if (typeof dir === 'string') {
    try { notes = JSON.parse(fs.readFileSync(path.join(dir, 'views', 'notes.json'), 'utf8')); } catch { notes = {}; }
  }
  if (!players) return notes;
  const tiers = readTiers(gameId, tiersFile);
  if (!tiers.length) return notes;
  const index = indexTierRows(tiers);
  for (const p of players) {
    const m = matchTierRowBy(index, p);
    if (!m) continue;
    const t = m.row;
    const n = notes[p.player_id] || {};
    const tiered = String(t.tier ?? '').trim() !== '';
    // A row with no tier, no note and no review says nothing about this player.
    if (!tiered && !t.notes && !t.last_reviewed_on && !t.last_reviewed_tournament) continue;
    // 'notes' is the editable column (seeded from the sheet's notes); older files only have sheet_notes.
    const out = { ...n, notes: 'notes' in t ? (t.notes || '') : [n.notes, t.sheet_notes].filter(Boolean).join(' · '),
      last_reviewed_on: t.last_reviewed_on || '', last_reviewed_tournament: t.last_reviewed_tournament || '',
      // B4-3: the grey "never reviewed" hover names the sheet only when the tier came from it.
      source: t.source || '' };
    if (tiered) out.tier = Number(t.tier); else delete out.tier;
    // A1.2: the row was found by tag only (no id on it yet): the Tier cell says so.
    if (m.by === 'tag') out.tag_only = true; else delete out.tag_only;
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
    run: { folder: path.basename(run.dir), run_at: run.meta.run_at },
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
  const name = typeof dir === 'string'
    ? path.basename(dir).replace(/__(\d{8}-\d{4})(-\d+)?$/, '-seeding-$1').replace(/__/g, '-')
    : `${dir.tournament}-${fileSafe(dir.game.name)}-seeding-${path.basename(dir.pullDir).replace(/^pull-/, '')}`;
  return { filename: `${name}.csv`, csv: toSheetsCsv(R.summaryTextTable(ctx, ordered)) };
}

const fileSafe = (s) => String(s || 'game').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'game';

// ---- Tabs of a tournament pool (docs/design-tool.md, T2 and Pages) ---------------------------
// The source for one game's tab: the live pull (out/<t>/current), the seeded events of that game
// (state.json ticked), the tournament slug the ✓ records. Null when the tournament has no live pull
// or the game is not a ticked tab.
function tabSource(outRoot, t, gameId) {
  const pool = require('../pool');
  let tDir;
  try { tDir = pool.tournamentDir(outRoot, t); } catch { return null; }
  const state = pool.readState(tDir);
  const cur = pool.currentPull(tDir);
  if (!state || !cur) return null;
  const tab = pool.tabsOf(state, cur.meta).find((x) => String(x.game.id) === String(gameId));
  if (!tab) return null;
  return { kind: 'tab', tDir, pullDir: cur.dir, tournament: String(t).toLowerCase(), game: tab.game, events: tab.events };
}

// ---- Seeds export (docs/design-tool.md, Outputs 1) -------------------------------------------
// The tab's players as CSV (tier, tag, player_id, proposed seed), numbered by
// lib/view/model.js seedSequence (the same function the push numbers with): higher tier first,
// the table's order within a tier (`order`: player ids as the page shows them; the page's
// default order otherwise), untiered after tiered, 1..N. No start.gg request.
function seedsExport(src, { order, tiersFile } = {}) {
  const { toSheetsCsv } = require('./export');
  const run = loadRun(src);
  const notes = readNotes(src, run.players, run.meta.game && run.meta.game.id, tiersFile);
  const byId = new Map(run.players.map((p) => [String(p.player_id), p]));
  const given = (order || []).map(String).filter((id, i, a) => byId.has(id) && a.indexOf(id) === i);
  const rest = M.orderPlayers(run.players, notes).map((p) => String(p.player_id)).filter((id) => !given.includes(id));
  const seq = M.seedSequence([...given, ...rest].map((id) => ({ id, tier: notes[id] && Number.isFinite(notes[id].tier) ? notes[id].tier : null })));
  const table = [['tier', 'tag', 'player_id', 'proposed_seed'],
    ...seq.map((x) => [x.tier == null ? '' : String(x.tier), byId.get(x.id).gamer_tag, x.id, String(x.seed)])];
  const base = typeof src === 'string' ? path.basename(src) : `${src.tournament}-${fileSafe(src.game.name)}`;
  return { filename: `${base}-seeds.csv`, csv: toSheetsCsv(table), sequence: seq };
}

// ---- Writing registry/tiers.csv (T1): tier / notes edits and the ✓ review mark -----------------
// Both writes go to the run's game's row for this player: the row with this player_id, else the
// unlinked row whose tag matches (and links it to the player_id), else a new row; the same
// matcher readNotes uses (A4-2), so a write lands on the row a reload shows. Written atomically
// (temp file + rename), UTF-8 with a BOM, every field quoted (lib/output.js toCsv).
//
// Columns: TIER_COLS (docs/design-tool.md, T1), then any other column the file already has, in
// the file's order, so a column this code doesn't know is carried, never dropped.
const TIER_COLS = ['game_id', 'game_name', 'player_id', 'discriminator', 'startgg_tag', 'sheet_tag', 'tier', 'notes', 'decided_on',
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

// mutate(row, { created }) changes the row in place; returning false means "nothing to write",
// and returning 'remove' takes the row out of the file (an un-✓ that leaves a row holding nothing).
function editTierRow(dir, playerId, tiersFile, mutate) {
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
  const result = mutate(row, { created });
  if (result === false) return created ? null : row;
  if (result === 'remove') { if (!created) all.splice(all.indexOf(row), 1); row = null; }
  else {
    if (created) all.push(row);
    row.player_id = String(p.player_id);
    // A1.2: the write makes the link real, both ids. A discriminator already on the row is kept.
    if (!row.discriminator && discriminatorOf(p)) row.discriminator = discriminatorOf(p);
  }
  writeTierTable(tiersFile, cols, all);
  return row;
}

function writeTierTable(tiersFile, cols, all) {
  const { toCsv } = require('../output');
  fs.mkdirSync(path.dirname(tiersFile), { recursive: true });
  const tmp = tiersFile + '.tmp';
  fs.writeFileSync(tmp, toCsv(cols, all));
  fs.renameSync(tmp, tiersFile);
}

// ---- Registry linking (Amendment A1.3 and A1.1; dispatch-contract-tool-c.md, Acceptance 2 and 8) --
// Ids written into T1 rows outside a ✓ or an edit, through the same matcher (A4-2), in one atomic
// write, and only when something changes. Tier, notes, reviews and source are never touched.
//
// fillDiscriminators: a pull or an upload resolved these players' discriminators; every row (any
// game) already linked to one of them by player_id and with no discriminator gets it.
function fillIds(all, players) {
  const disc = new Map(players.map((p) => [String(p.player_id), discriminatorOf(p)]).filter(([, d]) => d));
  let written = 0;
  for (const r of all) {
    const d = r.player_id && !r.discriminator ? disc.get(String(r.player_id)) : '';
    if (d) { r.discriminator = d; written++; }
  }
  return written;
}
function fillDiscriminators(players, { tiersFile = defaultTiersFile() } = {}) {
  const { all, cols } = readTierTable(tiersFile);
  if (!all.length) return { discriminators_written: 0 };
  for (const r of all) if (!('notes' in r)) r.notes = r.sheet_notes || '';
  const written = fillIds(all, players);
  if (written) writeTierTable(tiersFile, cols, all);
  return { discriminators_written: written };
}

// linkPlayers (an upload): for each resolved player, the row of this game the matcher picks.
//   by player_id      the discriminator is written when the row has none
//   by discriminator  the player_id is written when the row has none
//   by tag only       player_id and discriminator are written (the link becomes real) and the row is
//                     listed in `linked_by_tag` for Noah to review; when two or more of the uploaded
//                     players match the same row by tag (A6-1: two people, one tag), none is linked
//                     and the row is listed in `ambiguous` instead
// Then fillDiscriminators' rule over every game. Returns the summary the upload records.
function linkPlayers(players, { gameId, tiersFile = defaultTiersFile() } = {}) {
  const { all, cols } = readTierTable(tiersFile);
  const summary = { matched_by_id: 0, player_ids_written: 0, discriminators_written: 0, linked_by_tag: [], ambiguous: [], unmatched: 0 };
  if (!all.length) { summary.unmatched = players.length; return summary; }
  for (const r of all) if (!('notes' in r)) r.notes = r.sheet_notes || '';
  const index = indexTierRows(all.filter((r) => String(r.game_id) === String(gameId)));
  const byTag = new Map(); // row -> players matched to it by tag
  const rowTag = (r) => r.startgg_tag || r.sheet_tag || '';
  for (const p of players) {
    const m = matchTierRowBy(index, p);
    if (!m) { summary.unmatched++; continue; }
    if (m.by === 'tag') { if (!byTag.has(m.row)) byTag.set(m.row, []); byTag.get(m.row).push(p); continue; }
    summary.matched_by_id++;
    if (m.by === 'discriminator' && !m.row.player_id) { m.row.player_id = String(p.player_id); summary.player_ids_written++; }
    if (!m.row.discriminator && discriminatorOf(p)) { m.row.discriminator = discriminatorOf(p); summary.discriminators_written++; }
  }
  for (const [row, ps] of byTag) {
    if (ps.length > 1) {
      summary.ambiguous.push({ row_tag: rowTag(row), tier: row.tier || '', players: ps.map((p) => ({ player_id: String(p.player_id), gamer_tag: p.gamer_tag, discriminator: discriminatorOf(p) })) });
      continue;
    }
    const p = ps[0];
    row.player_id = String(p.player_id);
    if (!row.discriminator && discriminatorOf(p)) row.discriminator = discriminatorOf(p);
    summary.linked_by_tag.push({ player_id: String(p.player_id), gamer_tag: p.gamer_tag, alias: p.alias || '', discriminator: discriminatorOf(p), row_tag: rowTag(row), tier: row.tier || '' });
  }
  summary.discriminators_written += fillIds(all, players);
  if (summary.player_ids_written || summary.discriminators_written || summary.linked_by_tag.length) writeTierTable(tiersFile, cols, all);
  return summary;
}

const rowOut = (playerId, row) => ({
  player_id: String(playerId),
  tier: !row || row.tier === '' || row.tier == null ? null : Number(row.tier),
  notes: (row && row.notes) || '',
  decided_on: (row && row.decided_on) || '',
  last_reviewed_on: (row && row.last_reviewed_on) || '',
  last_reviewed_tournament: (row && row.last_reviewed_tournament) || '',
  // A1.2: true once the row carries this player's id (every write links it); the page drops the
  // tag-only color on that answer.
  linked: !!(row && String(row.player_id) === String(playerId)),
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

// The pair an un-✓ restores (B2-1, ruled option (a)): the review the page displayed before the ✓,
// sent back by the page. Both blank (there was no review) or both set: a YYYY-MM-DD calendar date
// and a tournament slug. Anything else is a 400. Absent (no prior sent) means "clear both".
const REVIEW_DATE = /^\d{4}-\d{2}-\d{2}$/;
function checkPrior(prior) {
  if (prior == null) return { last_reviewed_on: '', last_reviewed_tournament: '' };
  const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
  if (typeof prior !== 'object' || Array.isArray(prior)) throw bad('The earlier review must be an object.');
  const on = prior.last_reviewed_on ?? '', t = prior.last_reviewed_tournament ?? '';
  if (typeof on !== 'string' || typeof t !== 'string') throw bad("The earlier review's date and tournament must be text.");
  if ((on === '') !== (t === '')) throw bad('The earlier review needs both a date and a tournament, or neither.');
  const d = new Date(`${on}T00:00:00Z`);
  if (on && (!REVIEW_DATE.test(on) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== on)) throw bad("The earlier review's date must be a YYYY-MM-DD date.");
  if (t && !SLUG_PART.test(t)) throw bad("The earlier review's tournament is not a tournament slug.");
  return { last_reviewed_on: on, last_reviewed_tournament: t };
}

// A row that holds nothing but a review: the ✓ created it (source "app"), and it has no tier, no
// notes, no decided_on and nothing from the sheet import. Once its review is undone it says nothing,
// so the undo removes it and the file is as it was before the ✓ (B2-3).
const IDENTITY_COLS = ['game_id', 'game_name', 'player_id', 'discriminator', 'startgg_tag', 'sheet_tag', 'source', 'last_reviewed_on', 'last_reviewed_tournament'];
const holdsOnlyAReview = (r) => r.source === 'app' && Object.keys(r).every((c) => IDENTITY_COLS.includes(c) || !r[c]);

// The ✓ (T1 rules, "✓ semantics"). reviewed: true sets last_reviewed_on to today and
// last_reviewed_tournament to this run's tournament. reviewed: false is an undo for a misclick
// only: when the row's review is this tournament AND today, it puts back `prior` (the review the
// page showed before the ✓, checked by checkPrior; blank when there was none or none was sent), and
// otherwise does nothing. So a single click never clears a review recorded earlier (another day,
// or another tournament). A ✓ at a new tournament followed by its undo puts the earlier review
// back only when the page sends it (B2-1), which it can within one page load; after a reload, or
// from another browser, no pair is sent and the undo clears today's review, so the earlier review's
// date and tournament are lost on that path (B4-1, Noah's call; the tier and notes are untouched).
// A forged `prior` can only land on a row reviewed here today, which is the click being undone.
// Tier, notes, decided_on and source are untouched (a row the ✓ has to create is source "app"),
// and an undo that leaves such a row holding nothing removes it (B2-3).
// Returns the row's state after the click, and `changed`.
function reviewPlayer(dir, playerId, { reviewed, prior, now = new Date(), tiersFile = defaultTiersFile() } = {}) {
  if (typeof reviewed !== 'boolean') throw Object.assign(new Error('"reviewed" must be true or false.'), { status: 400 });
  const restore = reviewed ? null : checkPrior(prior);
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
      Object.assign(r, restore);
      changed = true;
      return holdsOnlyAReview(r) && !r.last_reviewed_on ? 'remove' : true;
    }
    changed = true;
    return true;
  });
  return { ...rowOut(playerId, row), changed };
}

module.exports = { linkPlayers, fillDiscriminators, matchTierRowBy, discriminatorOf, DISCRIMINATOR, updatePlayer, reviewPlayer, TIER_COLS, todayOf, tournamentOf, TIERS_FILE, defaultTiersFile, COLS, summaryExport, seedsExport, tabSource, parseFolder, loadRun, readRecords, readNotes, viewModel, matchTierRow, indexTierRows, readTiers, SLUG_PART };
