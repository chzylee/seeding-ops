'use strict';
// lib/pool.js — the tournament pool on disk (docs/design-tool.md, T2 and Lifecycle): where a
// tournament's folder is, its state.json (what Noah ticked and decided; never written by the pull),
// the live pull through the `current` pointer, the tabs, and the status computed at read time.
//
//   out/<t>/state.json        { source, tournament, events (the catalog from the add request), ticked,
//                               linked, marked_done, archived, pushes } — an uploaded list (Amendment
//                               A1.3) also has `upload` (the parsed list and each row's resolution) and
//                               `uploads` (one summary per resolution run, shown on the page once)
//   out/<t>/current           names the live pull-<stamp>/ (lib/output.js)
//   out/<t>/set-records.json  the shared W-L cache (lib/wl.js)
//   out/<t>/schedule.json     T3 (lib/schedule-pull.js)
//   out/<t>/standings.json    the optional archive
//
// Only folders whose names are plain slugs are tournaments. Increment 1's run folders
// (out/<t>__<e>__<stamp>/) contain "__" and never match, so they are never opened here.

const fs = require('node:fs');
const path = require('node:path');
const out = require('./output');

const SLUG_PART = /^[a-z0-9][a-z0-9-]*$/i;
const STATE_FILE = 'state.json';
const LEGACY_LINKED = path.join(process.env.SEEDING_ROOT ? path.resolve(process.env.SEEDING_ROOT) : path.join(__dirname, '..'), 'conflicts', 'linked.json');

function tournamentDir(outRoot, t) {
  if (!SLUG_PART.test(String(t || ''))) throw Object.assign(new Error(`Not a tournament slug: ${t}`), { status: 404 });
  return path.join(outRoot, String(t).toLowerCase());
}

function writeJsonAtomic(file, value) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(tmp, file);
}
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

// ---- state.json ---------------------------------------------------------------------------

// Amendment A1.4: `source` is "startgg" (added by link) or "upload" (a CSV list). A state.json
// written before build C (every tournament added by link, and every legacy pull imported by
// scripts/import-legacy.js) has none and reads as "startgg": migrated on read, never rewritten for
// it; the next ordinary write of that state.json (a tick, Mark done) stores it.
const SOURCES = new Set(['startgg', 'upload']);
function readState(tDir) {
  const s = readJson(path.join(tDir, STATE_FILE));
  if (!s || typeof s !== 'object') return null;
  const st = { ticked: [], linked: [], marked_done: null, archived: null, pushes: [], events: [], ...s };
  if (!SOURCES.has(st.source)) st.source = 'startgg';
  return st;
}
const isUpload = (state) => !!state && state.source === 'upload';
function writeState(tDir, state) {
  fs.mkdirSync(tDir, { recursive: true });
  writeJsonAtomic(path.join(tDir, STATE_FILE), state);
}
// Read, change, write. fn(state) mutates the state (or returns a replacement).
function updateState(tDir, fn) {
  const s = readState(tDir);
  if (!s) throw Object.assign(new Error('This tournament has not been added.'), { status: 404 });
  const next = fn(s) || s;
  writeState(tDir, next);
  return next;
}

const shortSlug = (slug) => {
  // Anchored to a path segment: "tournament/big-event/event/x" must give "x", not "event".
  const m = /(?:^|\/)event\/([^/?#]+)/.exec(String(slug || ''));
  return (m ? m[1] : String(slug || '')).toLowerCase();
};
const iso = (sec) => (sec ? new Date(Number(sec) * 1000).toISOString() : null);

// Singles or not (constraint 7: the picker hides teams events). start.gg's Event.type: 1 is a
// one-participant event (model knowledge). An event without a type falls back to its name.
const TEAMS_NAME = /\b(2v2|3v3|doubles|teams?|crews?)\b/i;
function isSingles(ev) {
  if (ev.type != null) return Number(ev.type) === 1 && !TEAMS_NAME.test(ev.name || '');
  return !TEAMS_NAME.test(ev.name || '');
}

// The start.gg tournament (lib/startgg fetchTournamentEvents) -> the catalog state.json keeps for
// the picker and the pull: { tournament, events }.
function catalogOf(apiT) {
  return {
    tournament: { id: String(apiT.id), slug: shortTournament(apiT.slug), name: apiT.name, start_at: iso(apiT.startAt), timezone: apiT.timezone || null },
    events: (apiT.events || []).map((e) => ({
      slug: shortSlug(e.slug), id: String(e.id), name: e.name,
      game: e.videogame ? { id: String(e.videogame.id), name: e.videogame.name } : null,
      start_at: iso(e.startAt), num_entrants: e.numEntrants ?? null, singles: isSingles(e),
      phases: (e.phases || []).map((ph) => ({ id: String(ph.id), name: ph.name, phase_order: ph.phaseOrder ?? null })),
    })),
  };
}
function shortTournament(slug) {
  const m = /tournament\/([^/?#]+)/.exec(String(slug || ''));
  return (m ? m[1] : String(slug || '')).toLowerCase();
}

// Side tournaments linked before increment 3 lived in conflicts/linked.json; a newly added
// tournament starts with whatever that file named for it (T3: they now live in state.json).
function legacyLinked(t, file = LEGACY_LINKED) {
  const j = readJson(file);
  const v = j && j[t];
  return Array.isArray(v) ? v.filter((s) => SLUG_PART.test(s)) : [];
}

function newState(catalog, { linkedFile } = {}) {
  return {
    version: 1,
    source: 'startgg',
    tournament: catalog.tournament,
    events: catalog.events,
    ticked: [],
    linked: legacyLinked(catalog.tournament.slug, linkedFile),
    marked_done: null,
    archived: null,
    pushes: [],
  };
}

// ---- The live pull --------------------------------------------------------------------------

function currentPull(tDir) {
  const name = out.readCurrent(tDir);
  if (!name) return null;
  const dir = path.join(tDir, name);
  const meta = readJson(path.join(dir, 'meta.json'));
  return meta ? { name, dir, meta } : null;
}

// The seeded events, as the pull last saw them (meta.json) where it has them, else the catalog.
function tickedEvents(state, meta) {
  const fromMeta = new Map(((meta && meta.seeded_events) || []).map((e) => [e.slug, e]));
  const fromState = new Map((state.events || []).map((e) => [e.slug, e]));
  return (state.ticked || []).map((s) => fromMeta.get(s) || fromState.get(s)).filter(Boolean);
}

// One tab per seeded game, in catalog order: { game: {id, name}, events: [slug] }.
function tabsOf(state, meta) {
  const tabs = new Map();
  for (const e of tickedEvents(state, meta)) {
    if (!e.game) continue;
    if (!tabs.has(e.game.id)) tabs.set(e.game.id, { game: e.game, events: [] });
    tabs.get(e.game.id).events.push(e.slug);
  }
  return [...tabs.values()];
}

// ---- Status (Lifecycle) -------------------------------------------------------------------
// Computed at read time: live until the latest startAt among the ticked events has passed, then
// done. With nothing ticked, the tournament's own startAt stands in. marked_done and archived in
// state.json override (archived wins).
function statusOf(state, meta, nowMs = Date.now()) {
  if (state.archived) return 'archived';
  if (state.marked_done) return 'done';
  const starts = tickedEvents(state, meta).map((e) => e.start_at).filter(Boolean);
  const latest = starts.length ? starts.sort().pop() : (state.tournament && state.tournament.start_at);
  if (!latest) return 'live';
  return Date.parse(latest) <= nowMs ? 'done' : 'live';
}
// What the page header offers, by status; the server enforces the same table. Done blocks nothing:
// it only surfaces Archive and Delete.
function controlsFor(state, status) {
  return {
    markDone: status === 'live',
    unmarkDone: !!state.marked_done && !state.archived,
    // An uploaded list has no start.gg event, so no standings to archive (A1.3).
    archive: status !== 'live' && !isUpload(state),
    // Noah, 2026-10-30: delete is by hand at any time (the home page's right-click, or the page's
    // button), always behind a confirmation; a live tournament is not protected from its owner.
    delete: true,
  };
}

// Every tournament under outRoot: { t, dir, state, current }.
const ORDER = { live: 0, done: 1, archived: 2 };
function listTournaments(outRoot, nowMs = Date.now()) {
  if (!fs.existsSync(outRoot)) return [];
  const list = [];
  for (const d of fs.readdirSync(outRoot, { withFileTypes: true })) {
    if (!d.isDirectory() || !SLUG_PART.test(d.name)) continue; // old run folders have "__"
    const dir = path.join(outRoot, d.name);
    const state = readState(dir);
    if (!state) continue;
    const cur = currentPull(dir);
    const status = statusOf(state, cur && cur.meta, nowMs);
    list.push({ t: d.name, dir, state, current: cur, status });
  }
  const startOf = (x) => (x.state.tournament && x.state.tournament.start_at) || '';
  return list.sort((a, b) => ORDER[a.status] - ORDER[b.status]
    || (a.status === 'live' ? startOf(a).localeCompare(startOf(b)) : startOf(b).localeCompare(startOf(a))) || a.t.localeCompare(b.t));
}

module.exports = {
  SLUG_PART, STATE_FILE, SOURCES, isUpload, tournamentDir, readState, writeState, updateState, writeJsonAtomic, readJson,
  shortSlug, shortTournament, isSingles, catalogOf, legacyLinked, newState,
  currentPull, tickedEvents, tabsOf, statusOf, controlsFor, listTournaments,
};
