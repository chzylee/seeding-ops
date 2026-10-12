'use strict';
// lib/output.js — everything that touches disk: the run folder, the checkpoint, the request
// log, the CSV/JSON serializers, and the temp-then-rename write of the three output files.

const fs = require('node:fs');
const path = require('node:path');

const PLAYER_COLUMNS = [
  'player_id', 'gamer_tag', 'prefix', 'user_slug', 'region_state', 'region_country',
  'result_count', 'history_status', 'team_entry',
];
const RESULT_COLUMNS = [
  'player_id', 'gamer_tag', 'event_date', 'game_id', 'game_name', 'is_event_game',
  'tournament_name', 'event_name', 'event_slug', 'event_id', 'num_entrants', 'placement',
  'is_online',
];
const OUTPUT_FILES = ['players.csv', 'results.csv', 'meta.json'];
const WORK_DIR = '_work';

// ---- CSV ----------------------------------------------------------------------------------
// UTF-8 with a BOM, every field quoted, embedded " doubled (design, Output).
// Values are written verbatim: a tag starting with = + - @ stays exactly as on start.gg.
const BOM = '﻿';

function csvField(v) {
  const s = v == null ? '' : String(v);
  return '"' + s.replace(/"/g, '""') + '"';
}

function toCsv(columns, rows) {
  const lines = [columns.map(csvField).join(',')];
  for (const r of rows) lines.push(columns.map((c) => csvField(r[c])).join(','));
  return BOM + lines.join('\r\n') + '\r\n';
}

// A small RFC 4180 parser for our own output (used by the reconcile script and tests).
function parseCsv(text) {
  let s = text.startsWith(BOM) ? text.slice(1) : text;
  const rows = [];
  let row = [];
  let field = '';
  let i = 0;
  let quoted = false;
  while (i < s.length) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { quoted = true; i++; continue; }
    if (ch === ',') { row.push(field); field = ''; i++; continue; }
    if (ch === '\r' && s[i + 1] === '\n') { row.push(field); rows.push(row); row = []; field = ''; i += 2; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += ch; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, k) => [h, r[k]])));
}

// ---- Run folder ---------------------------------------------------------------------------

function pad(n) { return String(n).padStart(2, '0'); }

// <tournament-slug>__<event-slug>__<YYYYMMDD-HHMM>, local time.
function runFolderName(eventSlug, runAt) {
  const m = /tournament\/([^/]+)\/event\/([^/]+)/.exec(eventSlug) || [];
  const d = new Date(runAt);
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `${m[1] || 'tournament'}__${m[2] || 'event'}__${stamp}`;
}

function createRunFolder(outRoot, name) {
  fs.mkdirSync(outRoot, { recursive: true });
  let dir = path.join(outRoot, name);
  for (let n = 2; fs.existsSync(dir); n++) dir = path.join(outRoot, `${name}-${n}`);
  fs.mkdirSync(path.join(dir, WORK_DIR), { recursive: true });
  return dir;
}

const workPath = (runDir, file) => path.join(runDir, WORK_DIR, file);

function writeJsonAtomic(file, value) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

// ---- Run state (_work/run.json) -----------------------------------------------------------
// Everything a resume needs to continue the SAME run: the input, run_at (so the window does not
// move), the event and the registrant list as first fetched.
function saveRunState(runDir, state) { writeJsonAtomic(workPath(runDir, 'run.json'), state); }
function loadRunState(runDir) {
  return JSON.parse(fs.readFileSync(workPath(runDir, 'run.json'), 'utf8'));
}

// ---- Checkpoint (_work/checkpoint.jsonl) --------------------------------------------------
// One JSON line per finished player (complete or limited). Appended as each player finishes.
// A kill mid-append can leave a torn last line; reading ignores any line that does not parse,
// and that player is simply fetched again.
function appendCheckpoint(runDir, entry) {
  fs.appendFileSync(workPath(runDir, 'checkpoint.jsonl'), JSON.stringify(entry) + '\n');
}

function readCheckpoint(runDir) {
  const file = workPath(runDir, 'checkpoint.jsonl');
  const done = new Map();
  let torn = 0;
  if (!fs.existsSync(file)) return { done, torn };
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (e && e.player_id != null) done.set(String(e.player_id), e);
    } catch { torn++; }
  }
  return { done, torn };
}

// ---- Request log (_work/requests.jsonl) ---------------------------------------------------
// One line per HTTP send: time, operation, player, page, attempt, status, complexity, and
// the error kind/backoff on failures. Never the token or headers.
function requestLogger(runDir) {
  const file = workPath(runDir, 'requests.jsonl');
  return (record) => fs.appendFileSync(file, JSON.stringify(record) + '\n');
}

function readRequestLog(runDir) {
  const file = workPath(runDir, 'requests.jsonl');
  if (!fs.existsSync(file)) return [];
  const out = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* torn last line */ }
  }
  return out;
}

// ---- Final output -------------------------------------------------------------------------

function outputsPresent(runDir) {
  return OUTPUT_FILES.filter((f) => fs.existsSync(path.join(runDir, f)));
}

// Build the three files' content from the run state and the per-player outcomes.
// outcomes: Map player_id -> { status, rows, skipped, error? }
function buildOutputs(state, outcomes, requestStats) {
  const players = [];
  const results = [];
  const statusCounts = { complete: 0, limited: 0, failed: 0 };
  const skipped = { out_of_window: 0, no_event_container: 0 };
  const region = { with_state: 0, with_country: 0, neither: 0 };
  const failed = [];
  for (const p of state.players) {
    const o = outcomes.get(p.player_id);
    if (!o) throw new Error(`no outcome for player ${p.player_id}; refusing to write output`);
    const rows = o.status === 'failed' ? [] : o.rows;
    statusCounts[o.status]++;
    if (o.skipped) {
      skipped.out_of_window += o.skipped.out_of_window || 0;
      skipped.no_event_container += o.skipped.no_event_container || 0;
    }
    if (o.status === 'failed') failed.push({ player_id: p.player_id, gamer_tag: p.gamer_tag, error: o.error || '' });
    if (p.region_state) region.with_state++;
    if (p.region_country) region.with_country++;
    if (!p.region_state && !p.region_country) region.neither++;
    players.push({
      player_id: p.player_id, gamer_tag: p.gamer_tag, prefix: p.prefix, user_slug: p.user_slug,
      region_state: p.region_state, region_country: p.region_country,
      result_count: rows.length, history_status: o.status, team_entry: p.team_entry,
    });
    const sorted = [...rows].sort((a, b) =>
      (b.event_date.localeCompare(a.event_date)) || a.event_id.localeCompare(b.event_id));
    results.push(...sorted);
  }
  const ev = state.event;
  const meta = {
    input_url: state.input_url,
    event: {
      id: String(ev.id), slug: ev.slug, name: ev.name,
      tournament_name: ev.tournament ? ev.tournament.name : null,
      start_at: ev.startAt ? new Date(ev.startAt * 1000).toISOString() : null,
      num_entrants: ev.numEntrants ?? null,
    },
    game: ev.videogame ? { id: String(ev.videogame.id), name: ev.videogame.name } : null,
    run_at: new Date(state.run_at).toISOString(),
    window: {
      start: new Date(state.window.startMs).toISOString(),
      end: new Date(state.window.endMs).toISOString(),
      days: 730,
    },
    registrant_count: players.length,
    result_count: results.length,
    history_status: statusCounts,
    team_entries_split: state.registrant_counts.team_entries_split,
    registrant_anomalies: {
      api_participants: state.registrant_counts.participants,
      duplicate_player: state.registrant_counts.duplicate_player,
      no_player: state.registrant_counts.no_player,
    },
    region_coverage: region,
    request_count: requestStats.requests,
    retries: requestStats.retries,
    query_complexity_max: requestStats.complexityMax,
    skipped,
    failed_players: failed,
    sessions: requestStats.sessions,
  };
  return {
    playersCsv: toCsv(PLAYER_COLUMNS, players),
    resultsCsv: toCsv(RESULT_COLUMNS, results),
    meta,
  };
}

// Write all three to temp files first, then rename. meta.json is renamed last: it is the
// completion marker.
function writeOutputs(runDir, built) {
  const items = [
    ['players.csv', built.playersCsv],
    ['results.csv', built.resultsCsv],
    ['meta.json', JSON.stringify(built.meta, null, 2) + '\n'],
  ];
  for (const [name, content] of items) fs.writeFileSync(path.join(runDir, name + '.tmp'), content);
  for (const [name] of items) fs.renameSync(path.join(runDir, name + '.tmp'), path.join(runDir, name));
}

module.exports = {
  PLAYER_COLUMNS, RESULT_COLUMNS, OUTPUT_FILES, WORK_DIR, BOM,
  csvField, toCsv, parseCsv, runFolderName, createRunFolder, workPath,
  saveRunState, loadRunState, appendCheckpoint, readCheckpoint,
  requestLogger, readRequestLog, outputsPresent, buildOutputs, writeOutputs,
};
