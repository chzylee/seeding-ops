'use strict';
// lib/run.js — the pull: one tournament pool (docs/design-tool.md, T2), fresh, incremental or
// resumed. Ties the client, the history logic and the writer together. Returns an exit code; never
// calls process.exit itself, so tests and the app drive it.
//
// One pull per tournament, not per event: the registrants are the union across the seeded events,
// a player in two events is fetched once, and the result is written BESIDE the live pull, in
// out/<t>/pull-<stamp>/, then swapped in through out/<t>/current (lib/output.js). The previous pull
// folder is deleted only after the swap. A crash at any point leaves the old pull live and the new
// one resumable from its own _work/.
//
// Modes:
//   full         re-pull the registrants of every seeded event and every player's results
//   incremental  re-read the registrants, carry every player the live pull already has (complete or
//                limited) and fetch only the rest; the pool keeps the live pull's run_at and window
//                (D2-6, kept: a full Refresh moves it). A carried no-account (limited) player who
//                entered a newly seeded game gets that game's recentStandings added (D2-13)
//   retry        (a resume of a finished pull with failed players) carry everyone but the failed
//                players into a new pull folder and fetch just those
// Never written here: state.json (what Noah ticked, lifecycle, pushes), set-records.json (W-L).
//
// Exit codes: 0 done, every player complete or limited
//             1 done but some players failed, or the pull stopped partway (resumable)
//             2 could not start: token missing or rejected, bad URL, tournament or event not found

const fs = require('node:fs');
const path = require('node:path');
const sgg = require('./startgg');
const history = require('./history');
const out = require('./output');
const pacing = require('./pacing');
const pool = require('./pool');

const EXIT_OK = 0;
const EXIT_INCOMPLETE = 1;
const EXIT_SETUP = 2;

const SETUP_KINDS = new Set(['bad-token', 'event-not-found']);
// Kinds that stop the whole pull (rather than failing one player). A4-3 (increment 2): the
// time-budget error is retryable and fails one player, not the pull (pinned by test/run.test.js).
const RUN_FATAL_KINDS = new Set(['bad-token', 'query', 'event-not-found']);

class SetupError extends Error {}

function messageFor(err) {
  if (err.kind === 'bad-token') {
    return 'start.gg rejected the token. Check STARTGG_TOKEN (environment or .env) and try again.';
  }
  return err.message;
}

// Result rows without increment 1's is_event_game (T2: meaningless in a multi-game pool).
const stripRow = ({ is_event_game, ...r }) => r; // eslint-disable-line no-unused-vars

// The union of the seeded events' registrants: one record per player, with `events` (the seeded
// event slugs they entered) and `games` (those events' game ids, for a no-account player's
// recentStandings). Counts are summed across events; a player in two events is counted once and
// the repeat is recorded as cross_event_repeats.
function unionRegistrants(perEvent) {
  const byId = new Map();
  const counts = { participants: 0, team_entries_split: 0, duplicate_player: 0, no_player: 0, cross_event_repeats: 0 };
  for (const { event, nodes } of perEvent) {
    const { players, counts: c } = history.splitRegistrants(nodes);
    for (const k of ['participants', 'team_entries_split', 'duplicate_player', 'no_player']) counts[k] += c[k];
    for (const p of players) {
      const gameId = event.game ? event.game.id : null;
      const had = byId.get(p.player_id);
      if (had) {
        counts.cross_event_repeats++;
        if (!had.events.includes(event.slug)) had.events.push(event.slug);
        if (gameId && !had.games.includes(gameId)) had.games.push(gameId);
        had.team_entry = had.team_entry || p.team_entry;
        continue;
      }
      byId.set(p.player_id, { ...p, events: [event.slug], games: gameId ? [gameId] : [] });
    }
  }
  return { players: [...byId.values()], counts };
}

// Outcomes of a finished pull, rebuilt from its files, for carrying into a new pull. The rows come
// from results.csv; each player's skip counts and request count come from that pull's checkpoint
// (D2-2: a carried player's skips and requests stay counted in the new pull's meta.json). A pull
// whose checkpoint predates the `requests` field has its requests counted from its request log.
// `events` (the seeded events the player entered there) lets an incremental pull see which games a
// no-account player was already asked about (D2-13).
function outcomesOf(pullDir) {
  const players = out.parseCsv(fs.readFileSync(path.join(pullDir, 'players.csv'), 'utf8'));
  const results = out.parseCsv(fs.readFileSync(path.join(pullDir, 'results.csv'), 'utf8'));
  const { done } = out.readCheckpoint(pullDir);
  let logCounts = null;
  const requestsFromLog = (id) => {
    if (!logCounts) {
      logCounts = new Map();
      for (const r of out.readRequestLog(pullDir)) if (r.player_id != null) logCounts.set(String(r.player_id), (logCounts.get(String(r.player_id)) || 0) + 1);
    }
    return logCounts.get(id) || 0;
  };
  const rowsBy = new Map();
  for (const r of results) {
    if (!rowsBy.has(r.player_id)) rowsBy.set(r.player_id, []);
    rowsBy.get(r.player_id).push({ ...r, is_online: r.is_online === 'true' });
  }
  const map = new Map();
  for (const p of players) {
    const c = done.get(p.player_id);
    map.set(p.player_id, {
      player_id: p.player_id, status: p.history_status, rows: rowsBy.get(p.player_id) || [],
      skipped: (c && c.skipped) || null,
      requests: c && Number.isFinite(c.requests) ? c.requests : requestsFromLog(p.player_id),
      events: String(p.events || '').split(';').filter(Boolean),
    });
  }
  return map;
}

// Two outcomes of one player merged (D2-13's top-up): rows de-duplicated by event id, skips and
// requests summed.
function mergeOutcome(had, got) {
  const ids = new Set(had.rows.map((r) => String(r.event_id)));
  const sum = (k) => ((had.skipped && had.skipped[k]) || 0) + ((got.skipped && got.skipped[k]) || 0);
  return {
    rows: [...had.rows, ...got.rows.filter((r) => !ids.has(String(r.event_id)))],
    skipped: { out_of_window: sum('out_of_window'), no_event_container: sum('no_event_container') },
    requests: (had.requests || 0) + (got.requests || 0),
  };
}

// After a pull finished: point `current` at it, then delete the pull it replaced and any older
// pull folder (finished or abandoned). A newer folder (another pull in progress) is left alone.
// D2-7: once `current` has moved the new pull is live, so a folder that cannot be deleted (a file
// lock on Windows, say) does not fail the pull: it is reported in `leftover`, and the next swap's
// sweep of older folders deletes it. A leftover must never look resumable: on Windows a locked file
// stops a recursive delete partway (observed in build B pass 3: meta.json gone, _work/run.json
// kept), so the resume marker is removed first.
function swapIn(tDir, pullDir) {
  const name = path.basename(pullDir);
  const before = out.readCurrent(tDir);
  out.writeCurrent(tDir, name);
  const removed = [];
  const leftover = [];
  for (const p of out.listPulls(tDir)) {
    if (p.name === name) continue;
    const older = p.name.localeCompare(name, undefined, { numeric: true }) < 0;
    if (p.name === before || older) {
      try {
        fs.rmSync(out.workPath(p.dir, 'run.json'), { force: true });
        fs.rmSync(p.dir, { recursive: true, force: true });
        removed.push(p.name);
      } catch (err) {
        leftover.push({ name: p.name, error: err.code || err.message });
      }
    }
  }
  return { current: name, previous: before, removed, leftover };
}

// Seeded events from the tournament (lib/startgg fetchTournamentEvents), in the order asked.
function seededEvents(apiT, slugs) {
  const catalog = pool.catalogOf(apiT);
  const events = [];
  for (const s of slugs) {
    const e = catalog.events.find((x) => x.slug === String(s).toLowerCase());
    if (!e) throw new SetupError(`No event "${s}" in ${catalog.tournament.name || catalog.tournament.slug}.`);
    if (!events.includes(e)) events.push(e);
  }
  return { catalog, events };
}

// opts:
//   tournament + events   tournament slug and seeded event slugs (short: the part after /event/)
//   url                   or: a start.gg event URL (that event alone) or tournament URL (+ events)
//   mode                  'full' (default) or 'incremental'
//   resumeDir             or: a pull folder, or a tournament folder (its newest unfinished pull)
//   upload                or: an uploaded list (Amendment A1.3, lib/upload.js): { catalog: { tournament,
//                         events: [the one synthetic event] }, players } — the registrants come from
//                         the list, not from start.gg; no tournament or entrants request. Always full.
//                         A player flagged `unresolved` costs no request: history_status "unresolved".
//   token                 already loaded (empty -> exit 2)
//   client, apiT, records optional (D2-9, pull.js): a client already used for this tournament's
//                         catalog, so a whole CLI run has one client and one limiter; the
//                         TournamentEvents response it fetched (so it is not asked for twice); and
//                         the request records that client made before the pull folder existed.
//   outRoot               where tournament folders go
//   fetchImpl, now, sleep injectable
//   stderr, stdout        writable-like { write(str) }
//   report                optional object, filled with { tDir, pullDir, swap }
async function run(opts) {
  const stderr = opts.stderr || process.stderr;
  const stdout = opts.stdout || process.stdout;
  const now = opts.now || Date.now;
  const report = opts.report || {};
  const say = (s) => stderr.write(s + '\n');

  if (!opts.token) {
    say('No start.gg token found. Paste your token after STARTGG_TOKEN= in the .env file in this folder ' +
        '(see .env.example), or set the STARTGG_TOKEN environment variable.');
    return EXIT_SETUP;
  }

  let pullDir;
  let tDir;
  let state;
  let carried = null; // Map player_id -> outcome, written into a NEW pull's checkpoint
  let topup = null;   // incremental: player_id -> { games, had } (D2-13), kept in run.json
  let pending = [];   // request records made before the pull folder exists
  let logToFile = null;
  // Requests per player (tagged by lib/history), kept in each player's checkpoint entry (D2-2).
  const reqBy = new Map();
  const tally = (rec) => { if (rec.player_id != null) reqBy.set(String(rec.player_id), (reqBy.get(String(rec.player_id)) || 0) + 1); };
  const onRequest = (rec) => { tally(rec); return logToFile ? logToFile(rec) : pending.push(rec); };

  if (opts.resumeDir) {
    let dir = path.resolve(opts.resumeDir);
    // D2-8: a resume takes a pull folder or a tournament folder, nothing else. Increment 1's
    // per-event run folders (out/<t>__<e>__<stamp>/) are never read, so one is refused before any
    // file in it is opened.
    const base = path.basename(dir);
    if (base.includes('__')) {
      say('This is a per-event run folder from before the pool layout; add the tournament in the app or run a fresh pull.');
      return EXIT_SETUP;
    }
    if (!out.PULL_RE.test(base) && !pool.SLUG_PART.test(base)) {
      say(`Not a run folder: --resume takes a pull folder (pull-<stamp>) or a tournament folder (out/<tournament>): ${dir}`);
      return EXIT_SETUP;
    }
    const newerThan = (live) => (name) => !live || name.localeCompare(live, undefined, { numeric: true }) > 0;
    if (!fs.existsSync(out.workPath(dir, 'run.json'))) {
      // Only a pull newer than the live one is resumed (the app's rule too): an older unfinished
      // folder is a leftover, and finishing it would swap older data in over newer.
      const isNewer = newerThan(out.readCurrent(dir));
      const open = out.listPulls(dir).find((p) => !p.finished && p.resumable && isNewer(p.name));
      if (!open) {
        say(fs.existsSync(path.join(dir, pool.STATE_FILE)) || out.listPulls(dir).length
          ? `Nothing to resume in ${dir}: no unfinished pull.`
          : `Not a run folder: no pull to resume here (no ${out.WORK_DIR}/run.json): ${dir}`);
        return EXIT_SETUP;
      }
      dir = open.dir;
    }
    tDir = path.dirname(dir);
    const live = out.readCurrent(tDir);
    if (live && path.basename(dir) !== live && !newerThan(live)(path.basename(dir))) {
      say(`${path.basename(dir)} is older than the live pull ${live}; finishing it would replace newer data. Run a fresh pull instead.`);
      return EXIT_SETUP;
    }
    const prior = out.loadRunState(dir);
    if (out.outputsPresent(dir).length === out.OUTPUT_FILES.length) {
      const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
      if (!meta.failed_players || meta.failed_players.length === 0) {
        if (out.readCurrent(tDir) !== path.basename(dir)) {
          report.swap = swapIn(tDir, dir);
          say(`This pull had finished but was not live yet; it is now: ${dir}`);
        } else say(`This pull already finished: ${dir}`);
        report.tDir = tDir; report.pullDir = dir;
        return EXIT_OK;
      }
      // Retry the failed players in a NEW pull folder, so the live files are never rewritten in
      // place; everyone else is carried. The window does not move.
      say(`Retrying ${meta.failed_players.length} failed player(s) from the finished pull.`);
      const failed = new Set(meta.failed_players.map((f) => String(f.player_id)));
      carried = new Map([...outcomesOf(dir)].filter(([id]) => !failed.has(id)));
      state = { ...prior, mode: 'retry', incremental: { at: new Date(now()).toISOString(), from: path.basename(dir), carried: carried.size, fetched: failed.size } };
    } else {
      pullDir = dir;
      state = prior;
      for (const rec of out.readRequestLog(pullDir)) tally(rec);
      logToFile = out.requestLogger(pullDir);
      logToFile({ t: new Date(now()).toISOString(), ms: now(), op: 'RESUME' });
    }
  }

  // Pacing must hold across a kill-and-resume: seed the limiter with this pull's recent sends.
  const priorSends = pullDir ? out.readRequestLog(pullDir).filter((r) => r.op !== 'RESUME').map((r) => r.ms) : [];
  let client;
  if (opts.client && !opts.resumeDir) {
    // D2-9: the caller's client (one limiter for the whole run); its records now go to this pull.
    client = opts.client;
    client.onRequest = onRequest;
    for (const rec of opts.records || []) onRequest(rec);
  } else {
    client = sgg.createClient({
      token: opts.token, fetchImpl: opts.fetchImpl, now, sleep: opts.sleep, onRequest, priorSends,
    });
  }

  try {
    if (!state && opts.upload) {
      const { catalog, players } = opts.upload;
      const t = catalog.tournament.slug;
      if (!pool.SLUG_PART.test(String(t || ''))) { say(`Not a page slug: ${t}`); return EXIT_SETUP; }
      tDir = path.join(opts.outRoot, t);
      const runAt = now();
      say(`${catalog.tournament.name} · uploaded list · ${players.length} players`);
      state = {
        version: 2, source: 'upload', input_url: `upload:${t}`, tournament: catalog.tournament, mode: 'full',
        run_at: runAt, window: history.computeWindow(runAt), events: catalog.events, players,
        registrant_counts: { participants: players.length, team_entries_split: 0, duplicate_player: 0, no_player: 0, cross_event_repeats: 0 },
      };
    }
    if (!state) {
      let t = opts.tournament ? String(opts.tournament).toLowerCase() : null;
      let slugs = opts.events ? [...opts.events] : null;
      if (!t && opts.url) {
        const ev = sgg.parseEventSlug(opts.url);
        t = sgg.parseTournamentSlug(opts.url);
        if (!slugs && !ev.error) slugs = [pool.shortSlug(ev.slug)];
      }
      if (!t || !pool.SLUG_PART.test(t)) {
        say('That is not a start.gg tournament or event URL. It should look like ' +
            'https://www.start.gg/tournament/<tournament>/event/<event>');
        return EXIT_SETUP;
      }
      if (!slugs || !slugs.length) {
        say(`No seeded events for ${t}. Name an event URL, or tick events on the tournament's page.`);
        return EXIT_SETUP;
      }
      tDir = path.join(opts.outRoot, t);
      const live = pool.currentPull(tDir);
      const mode = opts.mode === 'incremental' && live ? 'incremental' : 'full';
      say(`Resolving ${t} ...`);
      const apiT = opts.apiT && pool.shortTournament(opts.apiT.slug) === t ? opts.apiT : await sgg.fetchTournamentEvents(client, t);
      const { catalog, events } = seededEvents(apiT, slugs);
      say(`${catalog.tournament.name} · ${events.map((e) => `${e.name} (${e.game ? e.game.name : '?'})`).join(' · ')}`);
      const perEvent = [];
      for (const e of events) {
        const nodes = await sgg.fetchEntrants(client, e.id, (p, n) => say(`registrants · ${e.slug} · page ${p}/${n}`));
        perEvent.push({ event: e, nodes });
      }
      const { players, counts } = unionRegistrants(perEvent);
      let runAt = now();
      let window = history.computeWindow(runAt);
      let incremental;
      if (mode === 'incremental') {
        // The pool keeps one window: the live pull's. New players are fetched in it.
        runAt = Date.parse(live.meta.run_at);
        window = { startMs: Date.parse(live.meta.window.start), endMs: Date.parse(live.meta.window.end) };
        const had = outcomesOf(live.dir);
        // D2-13: a no-account player is asked about one game per call; one already in the pool who
        // entered a newly seeded game is asked about that game only, and the rows are merged.
        const gameOf = new Map((live.meta.seeded_events || []).map((e) => [e.slug, e.game ? String(e.game.id) : null]));
        carried = new Map();
        topup = {};
        for (const p of players) {
          const o = had.get(p.player_id);
          if (!o || o.status === 'failed') continue;
          const asked = new Set(o.events.map((x) => gameOf.get(x)).filter(Boolean));
          const fresh = o.status === 'limited' ? (p.games || []).map(String).filter((g) => !asked.has(g)) : [];
          const { events: _events, ...keep } = o; // eslint-disable-line no-unused-vars
          if (fresh.length) topup[p.player_id] = { games: fresh, had: keep };
          else carried.set(p.player_id, keep);
        }
        const toppedUp = Object.keys(topup).length;
        incremental = { at: new Date(now()).toISOString(), from: live.name, carried: carried.size + toppedUp,
          fetched: players.length - carried.size - toppedUp, ...(toppedUp ? { topped_up: toppedUp } : {}) };
        say(`Incremental: ${carried.size + toppedUp} player(s) already in the pool, ${incremental.fetched} to fetch` +
          (toppedUp ? `, ${toppedUp} no-account player(s) asked about the new game` : '') + '.');
      }
      state = {
        version: 2,
        input_url: opts.url || `https://www.start.gg/tournament/${t}`,
        tournament: catalog.tournament,
        mode,
        run_at: runAt,
        window,
        events,
        players,
        registrant_counts: counts,
        ...(incremental ? { incremental } : {}),
        ...(topup && Object.keys(topup).length ? { topup } : {}),
      };
    }
    if (!pullDir) {
      // The token has been accepted and the tournament exists: only now does a folder appear.
      tDir = tDir || path.join(opts.outRoot, state.tournament.slug);
      pullDir = out.createPullFolder(tDir, out.pullFolderName(now()));
      out.saveRunState(pullDir, state);
      // Carried players go into the new pull's own checkpoint, so it resumes without the old pull.
      if (carried) for (const p of state.players) if (carried.has(p.player_id)) out.appendCheckpoint(pullDir, { ...carried.get(p.player_id), carried: true });
      logToFile = out.requestLogger(pullDir);
      for (const rec of pending) logToFile(rec);
      pending = [];
      say(`Pull folder: ${pullDir}`);
    }
  } catch (err) {
    if (err instanceof SetupError) { say(err.message); return EXIT_SETUP; }
    if (err instanceof sgg.StartggError && SETUP_KINDS.has(err.kind)) {
      say(messageFor(err));
      return EXIT_SETUP;
    }
    say(`Could not start the pull: ${err.message}`);
    return err instanceof sgg.StartggError ? EXIT_SETUP : EXIT_INCOMPLETE;
  }
  report.tDir = tDir;
  report.pullDir = pullDir;

  // ---- Per-player history ----
  const { done, torn } = out.readCheckpoint(pullDir);
  if (opts.resumeDir && !carried) {
    say(`Resuming: ${done.size} of ${state.players.length} players already checkpointed` +
        (torn ? ` (${torn} torn checkpoint line ignored)` : '') + '.');
  }
  const outcomes = new Map();
  for (const [id, e] of done) outcomes.set(id, e);
  const total = state.players.length;

  for (let i = 0; i < total; i++) {
    const p = state.players[i];
    if (outcomes.has(p.player_id)) continue;
    if (p.unresolved) {
      // An uploaded row start.gg does not know: kept on the page, never fetched.
      const entry = { player_id: p.player_id, status: 'unresolved', rows: [], skipped: null, requests: 0, finished_at: new Date(now()).toISOString() };
      out.appendCheckpoint(pullDir, entry);
      outcomes.set(p.player_id, entry);
      continue;
    }
    const label = `player ${i + 1}/${total}`;
    const top = state.topup && state.topup[p.player_id];
    try {
      const games = top ? top.games : (p.games && p.games.length ? p.games : [null]);
      const res = await history.collectHistory(client, p, state.window, games,
        (pg, n) => say(`${label} · page ${pg}/${n} · ${p.gamer_tag}`));
      let got = { rows: res.rows.map(stripRow), skipped: res.skipped, requests: reqBy.get(String(p.player_id)) || 0 };
      if (top) got = mergeOutcome(top.had, got);
      const entry = { player_id: p.player_id, status: res.status, ...got,
        ...(top ? { topped_up: top.games, carried_requests: top.had.requests || 0 } : {}), finished_at: new Date(now()).toISOString() };
      out.appendCheckpoint(pullDir, entry);
      outcomes.set(p.player_id, entry);
    } catch (err) {
      if (err instanceof sgg.StartggError && RUN_FATAL_KINDS.has(err.kind)) {
        say(`Stopped at ${label} (${p.gamer_tag}): ${messageFor(err)}`);
        say(`Nothing was written as final output; the live pull is unchanged. Fix the cause, then finish with:\n  node pull.js --resume "${pullDir}"`);
        return err.kind === 'bad-token' ? EXIT_SETUP : EXIT_INCOMPLETE;
      }
      if (!(err instanceof sgg.StartggError)) throw err;
      // Retries exhausted or no record: this player fails, the pull goes on. Not checkpointed,
      // so a later --resume tries them again.
      say(`${label} · ${p.gamer_tag}: FAILED (${err.message})`);
      outcomes.set(p.player_id, { player_id: p.player_id, status: 'failed', rows: [], skipped: null, error: err.message });
    }
  }

  // ---- Final output, then the swap ----
  const log = out.readRequestLog(pullDir);
  const sends = log.filter((r) => r.op !== 'RESUME');
  // D2-2: request_count covers carried players too (the requests that fetched them, in an earlier
  // pull); requests_this_pull is what this pull itself sent (its request log).
  // A topped-up player's own new requests are in this pull's log; only the earlier part is added.
  const carriedRequests = [...outcomes.values()].reduce((n, o) => n + (o.carried ? (o.requests || 0) : (o.carried_requests || 0)), 0);
  const stats = {
    requests: sends.length + carriedRequests,
    requestsThisPull: sends.length,
    retries: sends.filter((r) => r.retry_in_ms != null).length,
    complexityMax: sends.reduce((m, r) => Math.max(m, r.complexity || 0), 0),
    sessions: 1 + log.filter((r) => r.op === 'RESUME').length,
  };
  const built = out.buildOutputs(state, outcomes, stats);
  out.writeOutputs(pullDir, built);
  report.swap = swapIn(tDir, pullDir);
  for (const l of report.swap.leftover) say(`The pull is live, but the old pull folder ${l.name} could not be deleted (${l.error}); the next pull deletes it.`);

  const m = built.meta;
  stdout.write([
    `Done: ${pullDir} (now live${report.swap.previous ? `; replaced ${report.swap.previous}` : ''})`,
    `  players: ${m.registrant_count} (complete ${m.history_status.complete}, limited ${m.history_status.limited}, failed ${m.history_status.failed})`
      + (m.incremental ? `, ${m.incremental.carried} carried from ${m.incremental.from}` : ''),
    `  results: ${m.result_count} in window ${m.window.start.slice(0, 10)} .. ${m.window.end.slice(0, 10)}`,
    `  skipped: ${m.skipped.out_of_window} out of window, ${m.skipped.no_event_container} without an event`,
    `  requests: ${m.requests_this_pull}${m.request_count !== m.requests_this_pull ? ` (${m.request_count} counting carried players)` : ''} (max queryComplexity ${m.query_complexity_max}, max ${pacing.maxInAnyWindow(sends.map((r) => r.ms))} in any 60 s)`,
  ].join('\n') + '\n');
  if (m.history_status.failed) {
    stdout.write(`  ${m.history_status.failed} player(s) failed; see failed_players in meta.json.\n`);
    return EXIT_INCOMPLETE;
  }
  return EXIT_OK;
}

module.exports = { run, swapIn, unionRegistrants, outcomesOf, mergeOutcome, EXIT_OK, EXIT_INCOMPLETE, EXIT_SETUP };
