'use strict';
// lib/run.js — the orchestrator. Ties the client, the history logic and the writer together
// for a fresh run or a resume. Returns an exit code; never calls process.exit itself, so tests
// and a future tool can drive it.
//
// Exit codes: 0 done, every player complete or limited
//             1 done but some players failed, or the run stopped partway (resumable)
//             2 could not start: token missing or rejected, bad URL, event not found

const fs = require('node:fs');
const path = require('node:path');
const sgg = require('./startgg');
const history = require('./history');
const out = require('./output');
const pacing = require('./pacing');

const EXIT_OK = 0;
const EXIT_INCOMPLETE = 1;
const EXIT_SETUP = 2;

const SETUP_KINDS = new Set(['bad-token', 'event-not-found']);
// Kinds that stop the whole run (rather than failing one player).
const RUN_FATAL_KINDS = new Set(['bad-token', 'query', 'event-not-found']);

function messageFor(err) {
  if (err.kind === 'bad-token') {
    return 'start.gg rejected the token. Check STARTGG_TOKEN (environment or .env) and try again.';
  }
  if (err.kind === 'event-not-found') return err.message;
  return err.message;
}

// opts:
//   url | resumeDir   one of them
//   token             already loaded (empty -> exit 2)
//   outRoot           where run folders go
//   fetchImpl, now, sleep   injectable
//   stderr, stdout    writable-like { write(str) }
async function run(opts) {
  const stderr = opts.stderr || process.stderr;
  const stdout = opts.stdout || process.stdout;
  const now = opts.now || Date.now;
  const say = (s) => stderr.write(s + '\n');

  if (!opts.token) {
    say('No start.gg token found. Paste your token after STARTGG_TOKEN= in the .env file in this folder ' +
        '(see .env.example), or set the STARTGG_TOKEN environment variable.');
    return EXIT_SETUP;
  }

  let runDir;
  let state;
  let pending = []; // request records made before the run folder exists
  let logToFile = null;
  const onRequest = (rec) => (logToFile ? logToFile(rec) : pending.push(rec));

  if (opts.resumeDir) {
    runDir = path.resolve(opts.resumeDir);
    if (!fs.existsSync(out.workPath(runDir, 'run.json'))) {
      say(`Not a run folder (no ${out.WORK_DIR}/run.json): ${runDir}`);
      return EXIT_SETUP;
    }
    const present = out.outputsPresent(runDir);
    if (present.length === out.OUTPUT_FILES.length) {
      const meta = JSON.parse(fs.readFileSync(path.join(runDir, 'meta.json'), 'utf8'));
      if (!meta.failed_players || meta.failed_players.length === 0) {
        say(`This run already finished: ${runDir}`);
        return EXIT_OK;
      }
      // Failed players are never checkpointed, so carrying on retries exactly them and then
      // rewrites the three files (temp, then rename) over the earlier ones.
      say(`Retrying ${meta.failed_players.length} failed player(s) from the finished run.`);
    }
    state = out.loadRunState(runDir);
    logToFile = out.requestLogger(runDir);
    logToFile({ t: new Date(now()).toISOString(), ms: now(), op: 'RESUME' });
  }

  // Pacing must hold across a kill-and-resume: seed the limiter with this run's recent sends.
  const priorSends = runDir ? out.readRequestLog(runDir).filter((r) => r.op !== 'RESUME').map((r) => r.ms) : [];
  const client = sgg.createClient({
    token: opts.token, fetchImpl: opts.fetchImpl, now, sleep: opts.sleep, onRequest, priorSends,
  });

  try {
    if (!state) {
      const parsed = sgg.parseEventSlug(opts.url);
      if (parsed.error) {
        say('That is not a start.gg event URL. It should look like ' +
            'https://www.start.gg/tournament/<tournament>/event/<event>');
        return EXIT_SETUP;
      }
      const runAt = now();
      say(`Resolving ${parsed.slug} ...`);
      const event = await sgg.resolveEvent(client, parsed.slug);
      say(`${event.tournament ? event.tournament.name + ' · ' : ''}${event.name} · ${event.videogame ? event.videogame.name : '?'} · ${event.numEntrants} entrants`);
      const entrants = await sgg.fetchEntrants(client, event.id,
        (p, n) => say(`registrants · page ${p}/${n}`));
      const { players, counts } = history.splitRegistrants(entrants);
      state = {
        version: 1,
        input_url: opts.url,
        slug: parsed.slug,
        run_at: runAt,
        window: history.computeWindow(runAt),
        event,
        players,
        registrant_counts: counts,
      };
      // The token has been accepted and the event exists: only now does a folder appear.
      runDir = out.createRunFolder(opts.outRoot, out.runFolderName(parsed.slug, runAt));
      out.saveRunState(runDir, state);
      logToFile = out.requestLogger(runDir);
      for (const rec of pending) logToFile(rec);
      pending = [];
      say(`Run folder: ${runDir}`);
    }
  } catch (err) {
    if (err instanceof sgg.StartggError && SETUP_KINDS.has(err.kind)) {
      say(messageFor(err));
      return EXIT_SETUP;
    }
    say(`Could not start the run: ${err.message}`);
    return err instanceof sgg.StartggError ? EXIT_SETUP : EXIT_INCOMPLETE;
  }

  // ---- Per-player history ----
  const { done, torn } = out.readCheckpoint(runDir);
  if (opts.resumeDir) {
    say(`Resuming: ${done.size} of ${state.players.length} players already checkpointed` +
        (torn ? ` (${torn} torn checkpoint line ignored)` : '') + '.');
  }
  const outcomes = new Map();
  for (const [id, e] of done) outcomes.set(id, e);
  const eventGameId = state.event.videogame ? state.event.videogame.id : null;
  const total = state.players.length;

  for (let i = 0; i < total; i++) {
    const p = state.players[i];
    if (outcomes.has(p.player_id)) continue;
    const label = `player ${i + 1}/${total}`;
    try {
      const res = await history.collectHistory(client, p, state.window, eventGameId,
        (pg, n) => say(`${label} · page ${pg}/${n} · ${p.gamer_tag}`));
      const entry = { player_id: p.player_id, status: res.status, rows: res.rows, skipped: res.skipped,
        finished_at: new Date(now()).toISOString() };
      out.appendCheckpoint(runDir, entry);
      outcomes.set(p.player_id, entry);
    } catch (err) {
      if (err instanceof sgg.StartggError && RUN_FATAL_KINDS.has(err.kind)) {
        say(`Stopped at ${label} (${p.gamer_tag}): ${messageFor(err)}`);
        say(`Nothing was written as final output. Fix the cause, then finish with:\n  node pull.js --resume "${runDir}"`);
        return err.kind === 'bad-token' ? EXIT_SETUP : EXIT_INCOMPLETE;
      }
      if (!(err instanceof sgg.StartggError)) throw err;
      // Retries exhausted or no record: this player fails, the run goes on. Not checkpointed,
      // so a later --resume tries them again.
      say(`${label} · ${p.gamer_tag}: FAILED (${err.message})`);
      outcomes.set(p.player_id, { player_id: p.player_id, status: 'failed', rows: [], skipped: null, error: err.message });
    }
  }

  // ---- Final output ----
  const log = out.readRequestLog(runDir);
  const sends = log.filter((r) => r.op !== 'RESUME');
  const stats = {
    requests: sends.length,
    retries: sends.filter((r) => r.retry_in_ms != null).length,
    complexityMax: sends.reduce((m, r) => Math.max(m, r.complexity || 0), 0),
    sessions: 1 + log.filter((r) => r.op === 'RESUME').length,
  };
  const built = out.buildOutputs(state, outcomes, stats);
  out.writeOutputs(runDir, built);

  const m = built.meta;
  stdout.write([
    `Done: ${runDir}`,
    `  players: ${m.registrant_count} (complete ${m.history_status.complete}, limited ${m.history_status.limited}, failed ${m.history_status.failed})`,
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

module.exports = { run, EXIT_OK, EXIT_INCOMPLETE, EXIT_SETUP };
