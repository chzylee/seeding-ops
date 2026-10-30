#!/usr/bin/env node
'use strict';
// app/server.js — the seeding tool: one page per tournament, a tab per seeded game plus a Schedule
// tab (docs/design-tool.md, Pages). Node built-ins only. Bound to 127.0.0.1.
//   npm start              (or double-click app.cmd, which also opens the browser)
//   node app/server.js [--port 8765] [--out <folder>] [--open]
// Pages:
//   GET  /                      tournaments: live first, then done, then archived; add a tournament
//   GET  /t/<t>                 the tournament page (?tab=<game id> | schedule)
//   GET  /e/<t>/<e>             redirects to /t/<t>?tab=<that event's game> when out/<t>/ exists, else
//                               404 with a link to add the tournament (old run folders are not read)
// API (POSTs need the X-Seeding-App header; JSON bodies):
//   POST /api/tournaments                     { url } add a tournament: ONE synchronous start.gg
//                                             request for its events, saved to out/<t>/state.json
//   POST /api/uploads                         { name, game_id, game_name?, date, csv, file_name? } an
//                                             uploaded list (Amendment A1.3): out/<slug>/ with
//                                             state.json source "upload", then a job through the queue
//                                             (one user lookup per row, registry linking, the pull, W-L)
//   POST /api/t/<t>/upload/seen               the upload summary has been shown once
//   GET  /api/t/<t>                           the tournament: catalog, ticked, tabs, status, controls,
//                                             pushes, the live pull's facts, job status
//   POST /api/t/<t>/events                    { ticked: [slug] } the seeded events; a newly ticked
//                                             event with a pool present starts an incremental pull,
//                                             or queues it behind a running job (D2-1)
//   POST /api/t/<t>/refresh                   the full pull (Refresh means everything), then W-L
//   GET  /api/t/<t>/status                    job status
//   POST /api/t/<t>/lifecycle                 { action: mark-done | unmark-done | archive | delete, confirm }
//   POST /api/t/<t>/linked                    { linked: [side tournament slug] } (T3)
//   GET  /api/t/<t>/schedule                  out/<t>/schedule.json + status
//   POST /api/t/<t>/schedule/refresh          [?only=seeds] the schedule pull, through the queue
//   GET  /api/t/<t>/g/<game>/data             one tab's view model
//   GET  /api/t/<t>/g/<game>/export.csv       the tab's summary for Google Sheets
//   GET  /api/t/<t>/g/<game>/seeds.csv        [?order=<player ids>] seeds in seed order (no start.gg request)
//   POST /api/t/<t>/g/<game>/player/<id>      edit tier / notes in registry/tiers.csv
//   POST /api/t/<t>/g/<game>/player/<id>/review   the ✓ review mark (T1)
//   POST /api/t/<t>/push/<e>/dry-run          the push dry run (read-only: the phase's seeds)
//   POST /api/t/<t>/push/<e>/post             { fingerprint, confirm: true } the seeding post
//   GET  /static/<file>                       the pages' JS/CSS (a fixed list; nothing else is served)
// Nothing under out/ is served as a file: state.json, current, the pulls and the caches reach the
// page only through these routes' JSON.
// Env: SEED_APP_MAX_PER_MIN caps the app's start.gg requests per rolling 60 s (default 75). PORT
// overrides the port. SEED_TIERS_FILE overrides registry/tiers.csv (tests never touch the real file).

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { loadToken } = require('../lib/token');
const pacing = require('../lib/pacing');
const sgg = require('../lib/startgg');
const pool = require('../lib/pool');
const data = require('../lib/view/data');
const push = require('../lib/push');
const { readSchedule } = require('../lib/schedule-pull');
const U = require('../lib/upload');
const majorsConfig = require('../lib/view/majors');
const { Jobs } = require('./jobs');
const { createQueue } = require('./queue');

// SEEDING_ROOT points the server at a project folder on disk when this file runs from inside
// the compiled desktop sidecar (app/app-main.js sets it). From source it is simply the repo.
const ROOT = process.env.SEEDING_ROOT ? path.resolve(process.env.SEEDING_ROOT) : path.join(__dirname, '..');
const APP_DIR = path.join(ROOT, 'app');
const DEFAULT_PORT = 8765;
const HOST = '127.0.0.1';

// The only files served besides the API. Anything else is 404.
const JS = 'text/javascript; charset=utf-8';
const STATIC = {
  'model.js': [path.join(ROOT, 'lib', 'view', 'model.js'), JS],
  'render.js': [path.join(ROOT, 'lib', 'view', 'render.js'), JS],
  'app.js': [path.join(APP_DIR, 'public', 'app.js'), JS],
  'tournament.js': [path.join(APP_DIR, 'public', 'tournament.js'), JS],
  'schedule.js': [path.join(APP_DIR, 'public', 'schedule.js'), JS],
  'index.js': [path.join(APP_DIR, 'public', 'index.js'), JS],
  'app.css': [path.join(APP_DIR, 'public', 'app.css'), 'text/css; charset=utf-8'],
  'theme.js': [path.join(APP_DIR, 'public', 'theme.js'), JS],
};
const PAGE = path.join(APP_DIR, 'public', 'tournament.html');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function send(res, status, body, type = 'text/plain; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(body);
}
const json = (res, status, obj) => send(res, status, JSON.stringify(obj), 'application/json; charset=utf-8');
const notFound = (res) => send(res, 404, 'Not found');
const bad = (status, msg, extra = {}) => Object.assign(new Error(msg), { status, ...extra });

const STATUS_LABEL = { live: 'live', done: 'done', archived: 'archived' };
// Amendment A1.4: where each tournament came from. state.json `source` (lib/pool.js readState reads
// a missing one as "startgg").
const SOURCE_BADGE = {
  startgg: '<span class="src src-startgg" title="Added from start.gg by link">start.gg</span>',
  upload: '<span class="src src-upload" title="Built from an uploaded CSV list of players">upload</span>',
};
// The upload form's games (A1.3): the games config/majors.json lists by id, then a free id.
function uploadGames() {
  let games = {};
  try { games = majorsConfig.loadMajorsConfig().games; } catch { games = {}; }
  return Object.entries(games).filter(([id]) => /^\d+$/.test(id)).map(([id, g]) => ({ id, name: g.name }));
}
function uploadForm() {
  const opts = uploadGames().map((g) => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('');
  // Noah, mid-pass 2026-10-30: under the link row, "Import from CSV" with a short description that is
  // visible while the form is folded.
  return `<details id="uploadBox" class="upload-t"><summary>Import from CSV <span class="dim import-desc">A CSV of two columns: name, then the start.gg discriminator (the code in start.gg/user/&lt;code&gt;). It builds its own page for one game; no push and no schedule.</span></summary>
<form id="upload" class="upload-form">
<p class="dim">The code can be bare, user/&lt;code&gt; or the profile link; a header row is optional. Each row costs one start.gg lookup, then the players' results are pulled as for a tournament.</p>
<label>Page name <input id="upName" name="name" required autocomplete="off" placeholder="e.g. Mixfest 26 MBAACC"></label>
<label>Game <select id="upGame" name="game">${opts}<option value="other">Other (start.gg game id)…</option></select></label>
<label id="upOtherWrap" hidden>Game id <input id="upGameId" inputmode="numeric" pattern="\\d+" autocomplete="off" placeholder="start.gg videogame id"> name <input id="upGameName" autocomplete="off" placeholder="optional"></label>
<label>Date <input id="upDate" name="date" type="date" required title="The day the event is played. The page counts as done once it starts."></label>
<label>CSV file <input id="upFile" name="file" type="file" accept=".csv,text/csv" required></label>
<button type="submit">Upload</button><span id="upMsg" class="status" role="status" aria-live="polite"></span>
</form></details>`;
}
// Noah, mid-pass 2026-10-30: no block or heading for the live ones; one sentence sits above the first
// tournament that is no longer live (the list is always live, then done, then archived).
const DONE_NOTE = '<li class="done-note dim">Tournaments are marked done automatically once their last seeded event\'s date has passed. Delete one when you no longer need it: right-click it here, or use Delete on its page; both ask first.</li>';
function indexPage(outRoot, jobs, nowMs) {
  const list = pool.listTournaments(outRoot, nowMs);
  const firstDone = list.findIndex((x) => x.status !== 'live');
  const items = list.map((x, i) => {
    const st = jobs.status(x.t);
    const name = (x.state.tournament && x.state.tournament.name) || x.t;
    const tabs = pool.tabsOf(x.state, x.current && x.current.meta).map((tab) => tab.game.name);
    const sub = [tabs.length ? tabs.join(' · ') : 'no events ticked yet',
      x.current ? `${x.current.meta.registrant_count} players · pulled ${esc(String(x.current.meta.run_at).slice(0, 16).replace('T', ' '))} UTC` : 'not pulled yet']
      .map(esc).join(' · ');
    const busy = st.running ? ` <span class="busy">${st.resolving ? 'looking up players…' : st.pulling ? 'pulling…' : st.kind === 'archive' ? 'archiving…' : 'fetching W-L…'}</span>` : '';
    const badge = SOURCE_BADGE[x.state.source] || SOURCE_BADGE.startgg;
    return `${i === firstDone ? DONE_NOTE : ''}<li class="st-${x.status} src-${esc(x.state.source)}" data-t="${esc(x.t)}" data-name="${esc(name)}" title="Right-click for options"><a href="/t/${esc(x.t)}">${esc(name)}</a> ${badge} <span class="pill st-${x.status}">${STATUS_LABEL[x.status]}</span>${busy}<div class="dim">${sub}</div></li>`;
  }).join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Seeding tournaments</title><link rel="stylesheet" href="/static/app.css"><script src="/static/theme.js"></script>
<body class="index"><main><h1>Tournaments</h1>
<section class="add-section" aria-labelledby="addHead"><h2 id="addHead">Add a tournament</h2>
<form id="add" class="add-t"><label for="addUrl" class="sr-only">start.gg tournament or event link</label>
<input id="addUrl" name="url" placeholder="start.gg tournament or event link" autocomplete="off" spellcheck="false" required title="Adding makes one request to start.gg for the tournament's events; you pick the singles events to seed on its page.">
<button type="submit">Add</button><span id="addMsg" class="status" role="status" aria-live="polite"></span></form>
${uploadForm()}
</section>
<ul class="events">${items || '<li class="dim">No tournaments yet. Add one above.</li>'}</ul></main>
<script src="/static/index.js"></script></body></html>`;
}

function notAddedPage(t) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Not added</title><link rel="stylesheet" href="/static/app.css"><script src="/static/theme.js"></script>
<body class="index"><main><h1>Not added yet</h1><p>There is no data for <code>${esc(t)}</code>. Pull data happens per tournament now.
<a href="/?add=${encodeURIComponent(t)}">Add the tournament</a> to seed it.</p></main></body></html>`;
}

// A same-origin request from the app's own page. Blocks other sites' pages from POSTing to the
// local server (they can't send a custom header without a CORS preflight, which we never answer)
// and DNS-rebinding hosts.
function trustedHost(req) {
  const h = String(req.headers.host || '').toLowerCase();
  return /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(h);
}

async function readBody(req) {
  let body = '';
  for await (const chunk of req) { body += chunk; if (body.length > 200000) throw bad(413, 'Too large'); }
  let fields;
  try { fields = JSON.parse(body || '{}'); } catch { throw bad(400, 'Body must be JSON.'); }
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw bad(400, 'Body must be a JSON object.');
  return fields;
}

function createApp(opts = {}) {
  const outRoot = opts.outRoot || path.join(ROOT, 'out');
  const getToken = opts.getToken || (() => loadToken({ envFile: path.join(ROOT, '.env') }).token);
  const tiersFile = opts.tiersFile; // undefined => data.js's own default (SEED_TIERS_FILE or registry/tiers.csv)
  const nowMs = () => (opts.now ? opts.now() : Date.now());
  const nowDate = () => new Date(nowMs());
  const queue = opts.queue || createQueue({ fetchImpl: opts.fetchImpl, now: opts.now, sleep: opts.sleep,
    max: opts.maxPerMinute || Number(process.env.SEED_APP_MAX_PER_MIN) || pacing.MAX_REQUESTS });
  const jobs = new Jobs({ outRoot, getToken, queue, now: opts.now, sleep: opts.sleep, pull: opts.pull, pullSchedule: opts.pullSchedule, tiersFile });
  const client = () => {
    const token = getToken();
    if (!token) throw bad(400, 'No STARTGG_TOKEN. Paste it into .env first, then restart the app.');
    return sgg.createClient({ token, fetchImpl: queue.fetch, now: opts.now, sleep: opts.sleep });
  };
  const requireApp = (req) => { if (req.headers['x-seeding-app'] !== '1') throw bad(403, 'Missing X-Seeding-App header'); };

  function tournamentInfo(t) {
    const tDir = pool.tournamentDir(outRoot, t);
    const state = pool.readState(tDir);
    if (!state) return null;
    const cur = pool.currentPull(tDir);
    const meta = cur && cur.meta;
    const status = pool.statusOf(state, meta, nowMs());
    return {
      t, source: state.source, tournament: state.tournament, status, controls: pool.controlsFor(state, status),
      ...(pool.isUpload(state) ? { upload: uploadInfo(state) } : {}),
      marked_done: state.marked_done, archived: state.archived,
      events: state.events.map((e) => ({ slug: e.slug, name: e.name, game: e.game, start_at: e.start_at, num_entrants: e.num_entrants, singles: e.singles })),
      ticked: state.ticked, linked: state.linked, pushes: state.pushes,
      tabs: pool.tabsOf(state, meta),
      pull: cur ? { name: cur.name, run_at: meta.run_at, window: meta.window, mode: meta.mode, registrant_count: meta.registrant_count,
        history_status: meta.history_status, seeded: (meta.seeded_events || []).map((e) => e.slug), incremental: meta.incremental || null } : null,
      standings: fs.existsSync(path.join(tDir, 'standings.json')),
      job: jobs.status(t),
    };
  }

  // What an uploaded list's page shows besides the tab: the list's counts, each row's state, and the
  // summaries (the newest one unseen is shown once, A1.3 / Acceptance 8).
  function uploadInfo(state) {
    const rows = state.upload.rows || [];
    const count = (st) => rows.filter((r) => r.resolved && r.resolved.status === st).length;
    return {
      file_name: state.upload.file_name || null, game: state.events[0] && state.events[0].game, date: state.upload.date,
      rows: rows.length, found: count('found'), not_found: count('not-found'), errors: count('error'), pending: rows.filter((r) => !r.resolved).length,
      duplicates: state.upload.duplicates || [], malformed: state.upload.malformed || [],
      summaries: state.uploads || [],
    };
  }

  const notForUpload = (t, what) => {
    const st = pool.readState(pool.tournamentDir(outRoot, t));
    if (pool.isUpload(st)) throw bad(409, `This page is an uploaded list: it has no start.gg event, so ${what}.`);
  };

  // POST /api/uploads (Amendment A1.3): the list parsed and checked here, synchronously and with no
  // start.gg request; out/<slug>/state.json written; then the job (one lookup per row, the registry
  // linking, the pull, W-L) through the queue, queued behind a running job like a newly ticked event.
  function createUpload(fields) {
    const name = String(fields.name || '').trim();
    if (!name) throw bad(400, 'Give the page a name.');
    const t = U.slugify(name);
    if (!t || !pool.SLUG_PART.test(t)) throw bad(400, 'The name needs at least one letter or digit.');
    const tDir = pool.tournamentDir(outRoot, t);
    if (fs.existsSync(tDir)) throw bad(409, `out/${t}/ already exists. Pick another name, or delete that page first.`);
    const gameId = String(fields.game_id ?? '').trim();
    if (!/^\d+$/.test(gameId)) throw bad(400, 'Pick a game, or give its start.gg videogame id (digits).');
    const known = uploadGames().find((g) => g.id === gameId);
    const game = { id: gameId, name: (known && known.name) || String(fields.game_name || '').trim() || `Game ${gameId}` };
    const date = String(fields.date || '');
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    const local = m && new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!local || local.getFullYear() !== Number(m[1]) || local.getMonth() !== Number(m[2]) - 1 || local.getDate() !== Number(m[3])) throw bad(400, 'The date must be a YYYY-MM-DD date.');
    if (typeof fields.csv !== 'string' || !fields.csv.trim()) throw bad(400, 'The CSV file is empty.');
    const parsed = U.parseUploadCsv(fields.csv);
    if (!parsed.rows.length) {
      throw bad(400, `No player rows in the file.${parsed.malformed.length ? ` Malformed: ${parsed.malformed.map((x) => `line ${x.line} (${x.reason})`).join('; ')}` : ''}`, { malformed: parsed.malformed });
    }
    // E2-7: a row ceiling, checked before anything is written or asked of start.gg.
    if (parsed.rows.length > U.MAX_UPLOAD_ROWS) {
      throw bad(400, `The list has ${parsed.rows.length} player rows; an upload takes at most ${U.MAX_UPLOAD_ROWS} (each row is a start.gg lookup and a pull on the one queue). Split the list.`);
    }
    // Done by the given date: the page counts as done from the start of that day, this computer's time.
    const startAt = local.toISOString();
    const event = U.uploadEvent({ name, game, startAt, count: parsed.rows.length });
    const fileName = String(fields.file_name || '').slice(0, 200) || null;
    pool.writeState(tDir, {
      version: 1, source: 'upload',
      tournament: { id: null, slug: t, name, start_at: startAt, timezone: null },
      events: [event], ticked: [event.slug], linked: [], marked_done: null, archived: null, pushes: [],
      upload: { file_name: fileName, created_at: nowDate().toISOString(), date, header: parsed.header, header_row: parsed.header_row, rows: parsed.rows,
        duplicates: parsed.duplicates, malformed: parsed.malformed, ignored_columns: parsed.ignored_columns },
      uploads: [],
    });
    const { started, queued } = jobs.queuePull(t, { mode: 'full' });
    return { t, page: `/t/${t}`, rows: parsed.rows.length, header: parsed.header, header_row: parsed.header_row, duplicates: parsed.duplicates, malformed: parsed.malformed,
      ignored_columns: parsed.ignored_columns, started, queued };
  }

  async function addTournament(fields) {
    const t = sgg.parseTournamentSlug(fields.url);
    if (!t) throw bad(400, 'That is not a start.gg tournament or event link.');
    const apiT = await sgg.fetchTournamentEvents(client(), t);
    const catalog = pool.catalogOf(apiT);
    const tDir = pool.tournamentDir(outRoot, catalog.tournament.slug);
    const had = pool.readState(tDir);
    // An uploaded list with the same slug is never turned into a start.gg tournament (its rows, its
    // pool and its summaries would be overwritten by the catalog).
    if (pool.isUpload(had)) throw bad(409, `out/${catalog.tournament.slug}/ is an uploaded list with the same name. Delete it first, or keep both by renaming the list.`);
    // Re-adding refreshes the catalog (names, start times, phases) and keeps every decision.
    const state = had ? { ...had, tournament: catalog.tournament, events: catalog.events } : pool.newState(catalog);
    pool.writeState(tDir, state);
    const ev = /\/event\/([^/?#\s]+)/i.exec(String(fields.url));
    const tick = ev && catalog.events.some((e) => e.slug === ev[1].toLowerCase() && e.singles) ? ev[1].toLowerCase() : null;
    return { t: catalog.tournament.slug, added: !had, page: `/t/${catalog.tournament.slug}${tick ? `?tick=${encodeURIComponent(tick)}` : ''}` };
  }

  function setTicked(t, fields) {
    const tDir = pool.tournamentDir(outRoot, t);
    if (!Array.isArray(fields.ticked)) throw bad(400, '"ticked" must be a list of event slugs.');
    notForUpload(t, 'its one tab cannot be changed');
    let added = [];
    let addedNames = [];
    const state = pool.updateState(tDir, (s) => {
      const known = new Map(s.events.map((e) => [e.slug, e]));
      const next = [...new Set(fields.ticked.map((x) => String(x).toLowerCase()))];
      for (const slug of next) {
        const e = known.get(slug);
        if (!e) throw bad(400, `No event "${slug}" in this tournament.`);
        if (!e.singles) throw bad(400, `${e.name} is not a singles event; only singles can be seeded.`);
      }
      const was = s.ticked || [];
      s.ticked = s.events.map((e) => e.slug).filter((slug) => next.includes(slug)); // catalog order
      added = s.ticked.filter((x) => !was.includes(x));
      addedNames = added.map((slug) => known.get(slug).name);
    });
    // Ticking a new event is incremental: only players not yet in the pool are pulled. Before the
    // first pool exists, the page's Pull button starts the first (full) pull. D2-1: while another
    // job runs, the tick is saved and the pull is queued behind that job (one queue), never dropped.
    let started = null;
    let queued = false;
    if (added.length && pool.currentPull(tDir)) ({ started, queued } = jobs.queuePull(t, { mode: 'incremental' }));
    return { ticked: state.ticked, added, addedNames, started, queued };
  }

  function lifecycle(t, fields) {
    const tDir = pool.tournamentDir(outRoot, t);
    const state = pool.readState(tDir);
    if (!state) throw bad(404, 'This tournament has not been added.');
    const cur = pool.currentPull(tDir);
    const status = pool.statusOf(state, cur && cur.meta, nowMs());
    const can = pool.controlsFor(state, status);
    const a = fields.action;
    if (a === 'mark-done') {
      if (!can.markDone) throw bad(409, 'Only a live tournament can be marked done.');
      pool.updateState(tDir, (s) => { s.marked_done = nowDate().toISOString(); });
      return { done: true };
    }
    if (a === 'unmark-done') {
      if (!can.unmarkDone) throw bad(409, 'Nothing to undo.');
      pool.updateState(tDir, (s) => { s.marked_done = null; });
      return { done: true };
    }
    if (a === 'archive') {
      if (!can.archive) throw bad(409, 'Archive standings is available once the tournament is done.');
      const { started } = jobs.startArchive(t);
      if (!started) throw bad(409, 'Another job is running; try again when it finishes.');
      return { started: true };
    }
    if (a === 'delete') {
      if (!can.delete) throw bad(409, 'Delete is available once the tournament is done.');
      if (fields.confirm !== t) throw bad(400, `To delete, confirm with the tournament slug "${t}".`);
      if (jobs.busyWith(t)) throw bad(409, 'A job is running for this tournament; wait for it to finish.');
      // out/<t>/ only: registry/tiers.csv (T1) and every other folder in out/ are untouched.
      fs.rmSync(tDir, { recursive: true, force: true });
      return { deleted: true };
    }
    throw bad(400, 'Unknown action.');
  }

  function tabOr404(t, g) {
    const src = data.tabSource(outRoot, t, g);
    if (!src) throw bad(404, 'No pulled data for this game yet.');
    return src;
  }

  function seededEvent(t, e) {
    const tDir = pool.tournamentDir(outRoot, t);
    const state = pool.readState(tDir);
    const cur = pool.currentPull(tDir);
    if (!state || !cur) throw bad(404, 'No pulled data for this tournament yet.');
    const ev = pool.tickedEvents(state, cur.meta).find((x) => x.slug === e);
    if (!ev) throw bad(404, 'That event is not seeded here.');
    const ids = new Set(require('../lib/output').parseCsv(fs.readFileSync(path.join(cur.dir, 'players.csv'), 'utf8')).map((p) => p.player_id));
    return { tDir, ev, ids };
  }

  async function dryRun(t, e) {
    const { ev, ids } = seededEvent(t, e);
    try {
      return await push.dryRun({ client: client(), event: ev, poolIds: ids, tiersFile });
    } catch (err) {
      // A start.gg error carries start.gg's HTTP status; only our own errors pass through as they are.
      if (!(err instanceof sgg.StartggError)) throw err;
      const f = sgg.pushFailure(err);
      throw bad(502, f.text, { failure: f.kind });
    }
  }

  async function postSeeding(t, e, fields) {
    if (fields.confirm !== true) throw bad(400, 'Posting needs a confirmed click on the dry run.');
    const { tDir, ev, ids } = seededEvent(t, e);
    const c = client();
    let dry;
    try {
      dry = await push.dryRun({ client: c, event: ev, poolIds: ids, tiersFile });
    } catch (err) {
      // A start.gg error carries start.gg's HTTP status; only our own errors pass through as they are.
      if (!(err instanceof sgg.StartggError)) throw err;
      const f = sgg.pushFailure(err);
      throw bad(502, f.text, { failure: f.kind });
    }
    if (dry.fingerprint !== fields.fingerprint) throw bad(409, "start.gg's seeding or your tiers changed since this dry run. Run the dry run again before posting.", { failure: 'stale' });
    let posted;
    try {
      posted = await push.post({ client: c, dry });
    } catch (err) {
      const f = sgg.pushFailure(err);
      throw bad(502, f.text, { failure: f.kind });
    }
    const entry = { event: ev.slug, phase_id: dry.phase.id, phase_name: dry.phase.name, at: nowDate().toISOString(), seed_count: posted.seed_count };
    pool.updateState(tDir, (s) => { s.pushes = [...(s.pushes || []), entry]; });
    return { posted: true, ...entry };
  }

  async function handler(req, res) {
    try {
      if (!trustedHost(req)) return send(res, 403, 'Forbidden host');
      // Prefixed, not resolved against a base: "//x" or "/\x" must stay a path, never become a host.
      const url = new URL(`http://127.0.0.1${String(req.url).startsWith('/') ? '' : '/'}${req.url}`);
      let p;
      try { p = decodeURIComponent(url.pathname); } catch { return notFound(res); }
      const method = req.method;
      const slug = (x) => pool.SLUG_PART.test(x);

      if (p === '/' && method === 'GET') return send(res, 200, indexPage(outRoot, jobs, nowMs()), 'text/html; charset=utf-8');

      let m = /^\/static\/([a-z.]+)$/.exec(p);
      if (m && method === 'GET') {
        const s = STATIC[m[1]];
        if (!s) return notFound(res);
        return send(res, 200, fs.readFileSync(s[0]), s[1]);
      }

      m = /^\/t\/([^/]+)\/?$/.exec(p);
      if (m && method === 'GET') {
        if (!slug(m[1])) return notFound(res);
        if (!pool.readState(pool.tournamentDir(outRoot, m[1]))) return send(res, 404, notAddedPage(m[1]), 'text/html; charset=utf-8');
        return send(res, 200, fs.readFileSync(PAGE), 'text/html; charset=utf-8');
      }

      // Increment 2's event URL: redirect to the tournament page with that event's game selected,
      // only when out/<t>/ exists. Old out/<t>__<e>__<stamp>/ folders are never looked at.
      m = /^\/e\/([^/]+)\/([^/]+)\/?$/.exec(p);
      if (m && method === 'GET') {
        const [, t, e] = m;
        if (!slug(t) || !slug(e)) return notFound(res);
        const tDir = pool.tournamentDir(outRoot, t);
        if (!fs.existsSync(tDir)) return send(res, 404, notAddedPage(t), 'text/html; charset=utf-8');
        const state = pool.readState(tDir);
        const ev = state && state.events.find((x) => x.slug === e.toLowerCase());
        const to = `/t/${t.toLowerCase()}${ev && ev.game ? `?tab=${encodeURIComponent(ev.game.id)}` : ''}`;
        return send(res, 302, `Moved to ${to}`, 'text/plain; charset=utf-8', { Location: to });
      }

      if (p === '/api/uploads') {
        if (method !== 'POST') return send(res, 405, 'Method not allowed');
        requireApp(req);
        return json(res, 202, createUpload(await readBody(req)));
      }

      if (p === '/api/tournaments') {
        if (method !== 'POST') return send(res, 405, 'Method not allowed');
        requireApp(req);
        return json(res, 200, await addTournament(await readBody(req)));
      }

      m = /^\/api\/t\/([^/]+)(\/.*)?$/.exec(p);
      if (m) {
        const [, t, restRaw] = m;
        if (!slug(t)) return notFound(res);
        const rest = restRaw || '';
        const info = () => tournamentInfo(t);
        if (rest === '' && method === 'GET') { const i = info(); return i ? json(res, 200, i) : json(res, 404, { error: 'This tournament has not been added.' }); }
        if (!pool.readState(pool.tournamentDir(outRoot, t))) return json(res, 404, { error: 'This tournament has not been added.' });
        if (rest === '/status' && method === 'GET') return json(res, 200, jobs.status(t));
        if (rest === '/schedule' && method === 'GET') {
          const body = readSchedule(pool.tournamentDir(outRoot, t));
          const status = jobs.status(t).schedule;
          if (!body) return json(res, 404, { error: 'No schedule pull for this tournament yet.', status });
          return json(res, 200, { ...body, status });
        }
        let g = /^\/g\/(\d+)\/(data|export\.csv|seeds\.csv)$/.exec(rest);
        if (g && method === 'GET') {
          const src = tabOr404(t, g[1]);
          const records = jobs.liveRecords(t);
          if (g[2] === 'data') {
            const vm = data.viewModel(src, { records, tiersFile, today: data.todayOf(nowDate()) });
            vm.status = jobs.status(t);
            vm.tab = { game: src.game, events: src.events };
            return json(res, 200, vm);
          }
          if (g[2] === 'export.csv') {
            const { filename, csv } = data.summaryExport(src, { records, tiersFile, today: data.todayOf(nowDate()) });
            return send(res, 200, csv, 'text/csv; charset=utf-8', { 'Content-Disposition': `attachment; filename="${filename}"` });
          }
          const order = (url.searchParams.get('order') || '').split(',').filter((x) => /^\d+$/.test(x));
          const { filename, csv } = data.seedsExport(src, { order, tiersFile });
          return send(res, 200, csv, 'text/csv; charset=utf-8', { 'Content-Disposition': `attachment; filename="${filename}"` });
        }
        const getRoute = /^(\/status|\/schedule|\/g\/\d+\/(data|export\.csv|seeds\.csv))$/;
        const postRoute = /^(\/g\/\d+\/player\/\d+(\/review)?|\/events|\/refresh|\/lifecycle|\/linked|\/schedule\/refresh|\/upload\/seen|\/push\/[^/]+\/(dry-run|post))$/;
        if (method !== 'POST' || getRoute.test(rest)) {
          return postRoute.test(rest) || getRoute.test(rest) ? send(res, 405, 'Method not allowed') : notFound(res);
        }
        requireApp(req);
        // Edit one player's tier / notes, or set / undo the ✓ review mark, in registry/tiers.csv.
        // The tournament a review records is this URL's <t>.
        g = /^\/g\/(\d+)\/player\/(\d+)(\/review)?$/.exec(rest);
        if (g) {
          const src = tabOr404(t, g[1]);
          const [, , pid, review] = g;
          const fields = await readBody(req);
          if (review) {
            // An un-✓ carries the review the page showed before the ✓ (B2-1); reviewPlayer validates it
            // and restores it only over a review made here today. A ✓ takes nothing from the body but
            // "reviewed": the date is the server's and the tournament is this URL's.
            const sent = fields.reviewed === false && ('last_reviewed_on' in fields || 'last_reviewed_tournament' in fields);
            const prior = sent ? { last_reviewed_on: fields.last_reviewed_on, last_reviewed_tournament: fields.last_reviewed_tournament } : undefined;
            return json(res, 200, data.reviewPlayer(src, pid, { reviewed: fields.reviewed, prior, now: nowDate(), tiersFile }));
          }
          // Tier and notes only: T1 has no reason field, and nothing else on the row is the client's to set.
          const allowed = Object.fromEntries(Object.entries(fields).filter(([k]) => ['tier', 'notes'].includes(k)));
          return json(res, 200, data.updatePlayer(src, pid, allowed, { now: nowDate(), tiersFile }));
        }
        if (rest === '/events') return json(res, 200, setTicked(t, await readBody(req)));
        if (rest === '/refresh') {
          await readBody(req);
          const { started } = jobs.startPull(t, { mode: 'full' });
          return json(res, started ? 202 : 409, jobs.status(t));
        }
        if (rest === '/lifecycle') return json(res, 200, lifecycle(t, await readBody(req)));
        if (rest === '/upload/seen') {
          await readBody(req);
          const tDir = pool.tournamentDir(outRoot, t);
          if (!pool.isUpload(pool.readState(tDir))) throw bad(404, 'This page is not an uploaded list.');
          const s = pool.updateState(tDir, (st) => { const last = (st.uploads || [])[st.uploads.length - 1]; if (last && !last.shown_at) last.shown_at = nowDate().toISOString(); });
          return json(res, 200, { shown_at: s.uploads.length ? s.uploads[s.uploads.length - 1].shown_at : null });
        }
        if (rest === '/linked') {
          notForUpload(t, 'it has no side tournaments');
          const fields = await readBody(req);
          if (!Array.isArray(fields.linked) || !fields.linked.every((x) => slug(String(x)))) throw bad(400, '"linked" must be a list of tournament slugs.');
          const s = pool.updateState(pool.tournamentDir(outRoot, t), (st) => { st.linked = [...new Set(fields.linked.map((x) => String(x).toLowerCase()))].filter((x) => x !== t); });
          return json(res, 200, { linked: s.linked });
        }
        if (rest === '/schedule/refresh') {
          notForUpload(t, 'it has no schedule');
          const { started } = jobs.startSchedule(t, { seedsOnly: url.searchParams.get('only') === 'seeds' });
          return json(res, started ? 202 : 409, jobs.status(t).schedule);
        }
        g = /^\/push\/([^/]+)\/(dry-run|post)$/.exec(rest);
        if (g && slug(g[1])) {
          notForUpload(t, 'there is nothing to push to');
          const fields = await readBody(req);
          if (g[2] === 'dry-run') return json(res, 200, await dryRun(t, g[1].toLowerCase()));
          return json(res, 200, await postSeeding(t, g[1].toLowerCase(), fields));
        }
        return notFound(res);
      }
      return notFound(res);
    } catch (err) {
      // start.gg's errors first: a StartggError's .status is start.gg's HTTP status, not ours.
      if (err instanceof sgg.StartggError) return json(res, err.kind === 'event-not-found' ? 404 : 502, { error: err.kind === 'bad-token' ? 'start.gg rejected the token.' : err.message });
      if (err && err.status) return json(res, err.status, { error: err.message, ...(err.failure ? { failure: err.failure } : {}) });
      return send(res, 500, `Server error: ${err && err.message}`);
    }
  }
  return { handler, jobs, outRoot, queue };
}

function openBrowser(url) {
  if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  else if (process.platform === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
}

// A2-3: `Number(x || DEFAULT)` can't tell a literal `--port 0` (let the OS pick an ephemeral
// port — what the "server binds 127.0.0.1" test asks for) apart from an absent/empty one (use
// DEFAULT_PORT): both are falsy. Resolve explicitly instead: missing or empty means "use the
// default"; anything else, including "0", is parsed as the port the caller asked for.
function resolvePort(raw) {
  if (raw == null || raw === '') return DEFAULT_PORT;
  const n = Number(raw);
  return Number.isFinite(n) ? n : DEFAULT_PORT;
}

function main(argv = process.argv.slice(2)) {
  const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const portArg = arg('--port');
  const port = resolvePort(portArg != null ? portArg : process.env.PORT);
  const outRoot = arg('--out') ? path.resolve(arg('--out')) : path.join(ROOT, 'out');
  const app = createApp({ outRoot });
  const server = http.createServer(app.handler);
  const url = `http://${HOST}:${port}/`;
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} is already in use: the app is probably already running. Opening ${url}`);
      if (argv.includes('--open')) openBrowser(url);
      process.exitCode = 0;
      return;
    }
    console.error(err.message);
    process.exitCode = 1;
  });
  server.listen(port, HOST, () => {
    console.log(`Seeding app: ${url}  (out: ${outRoot})`);
    console.log('Leave this window open while you use the app. Ctrl+C stops it.');
    if (argv.includes('--open')) openBrowser(url);
  });
  return server;
}

if (require.main === module) main();

module.exports = { createApp, main, HOST, DEFAULT_PORT, STATIC, resolvePort };
