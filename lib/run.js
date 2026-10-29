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

// Outcomes of a finished pull, rebuilt from its files, for carrying into a new pull.
function outcomesOf(pullDir) {
  const players = out.parseCsv(fs.readFileSync(path.join(pullDir, 'players.csv'), 'utf8'));
  const results = out.parseCsv(fs.readFileSync(path.join(pullDir, 'results.csv'), 'utf8'));
  const rowsBy = new Map();
  for (const r of results) {
    if (!rowsBy.has(r.player_id)) rowsBy.set(r.player_id, []);
    rowsBy.get(r.player_id).push({ ...r, is_online: r.is_online === 'true' });
  }
  const map = new Map();
  for (const p of players) map.set(p.player_id, { player_id: p.player_id, status: p.history_status, rows: rowsBy.get(p.player_id) || [], skipped: null });
  return map;
}

// After a pull finished: point `current` at it, then delete the pull it replaced and any older
// pull folder (finished or abandoned). A newer folder (another pull in progress) is left alone.
function swapIn(tDir, pullDir) {
  const name = path.basename(pullDir);
  const before = out.readCurrent(tDir);
  out.writeCurrent(tDir, name);
  const removed = [];
  for (const p of out.listPulls(tDir)) {
    if (p.name === name) continue;
    const older = p.name.localeCompare(name, undefined, { numeric: true }) < 0;
    if (p.name === before || older) {
      fs.rmSync(p.dir, { recursive: true, force: true });
      removed.push(p.name);
    }
  }
  return { current: name, previous: before, removed };
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
//   token                 already loaded (empty -> exit 2)
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
  let pending = [];   // request records made before the pull folder exists
  let logToFile = null;
  const onRequest = (rec) => (logToFile ? logToFile(rec) : pending.push(rec));

  if (opts.resumeDir) {
    let dir = path.resolve(opts.resumeDir);
    if (!fs.existsSync(out.workPath(dir, 'run.json'))) {
      const open = out.listPulls(dir).find((p) => !p.finished && p.resumable);
      if (!open) {
        say(fs.existsSync(path.join(dir, pool.STATE_FILE)) || out.listPulls(dir).length
          ? `Nothing to resume in ${dir}: no unfinished pull.`
          : `Not a run folder: no pull to resume here (no ${out.WORK_DIR}/run.json): ${dir}`);
        return EXIT_SETUP;
      }
      dir = open.dir;
    }
    tDir = path.dirname(dir);
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
      logToFile = out.requestLogger(pullDir);
      logToFile({ t: new Date(now()).toISOString(), ms: now(), op: 'RESUME' });
    }
  }

  // Pacing must hold across a kill-and-resume: seed the limiter with this pull's recent sends.
  const priorSends = pullDir ? out.readRequestLog(pullDir).filter((r) => r.op !== 'RESUME').map((r) => r.ms) : [];
  const client = sgg.createClient({
    token: opts.token, fetchImpl: opts.fetchImpl, now, sleep: opts.sleep, onRequest, priorSends,
  });

  try {
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
      const apiT = await sgg.fetchTournamentEvents(client, t);
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
        carried = new Map(players.filter((p) => had.has(p.player_id) && had.get(p.player_id).status !== 'failed')
          .map((p) => [p.player_id, had.get(p.player_id)]));
        incremental = { at: new Date(now()).toISOString(), from: live.name, carried: carried.size, fetched: players.length - carried.size };
        say(`Incremental: ${carried.size} player(s) already in the pool, ${incremental.fetched} to fetch.`);
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
    const label = `player ${i + 1}/${total}`;
    try {
      const res = await history.collectHistory(client, p, state.window, p.games && p.games.length ? p.games : [null],
        (pg, n) => say(`${label} · page ${pg}/${n} · ${p.gamer_tag}`));
      const entry = { player_id: p.player_id, status: res.status, rows: res.rows.map(stripRow), skipped: res.skipped,
        finished_at: new Date(now()).toISOString() };
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
  const stats = {
    requests: sends.length,
    retries: sends.filter((r) => r.retry_in_ms != null).length,
    complexityMax: sends.reduce((m, r) => Math.max(m, r.complexity || 0), 0),
    sessions: 1 + log.filter((r) => r.op === 'RESUME').length,
  };
  const built = out.buildOutputs(state, outcomes, stats);
  out.writeOutputs(pullDir, built);
  report.swap = swapIn(tDir, pullDir);

  const m = built.meta;
  stdout.write([
    `Done: ${pullDir} (now live${report.swap.previous ? `; replaced ${report.swap.previous}` : ''})`,
    `  players: ${m.registrant_count} (complete ${m.history_status.complete}, limited ${m.history_status.limited}, failed ${m.history_status.failed})`
      + (m.incremental ? `, ${m.incremental.carried} carried from ${m.incremental.from}` : ''),
    `  results: ${m.result_count} in window ${m.window.start.slice(0, 10)} .. ${m.window.end.slice(0, 10)}`,
    `  skipped: ${m.skipped.out_of_window} out of window, ${m.skipped.no_event_container} without an event`,
    `  requests: ${m.request_count} (max queryComplexity ${m.query_complexity_max}, max ${pacing.maxInAnyWindow(sends.map((r) => r.ms))} in any 60 s)`,
  ].join('\n') + '\n');
  if (m.history_status.failed) {
    stdout.write(`  ${m.history_status.failed} player(s) failed; see failed_players in meta.json.\n`);
    return EXIT_INCOMPLETE;
  }
  return EXIT_OK;
}

module.exports = { run, swapIn, unionRegistrants, outcomesOf, EXIT_OK, EXIT_INCOMPLETE, EXIT_SETUP };
