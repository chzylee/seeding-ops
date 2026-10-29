#!/usr/bin/env node
'use strict';
// pull.js — command line entry point for the tournament pool (docs/design-tool.md, T2).
//   node pull.js <event URL> [<event URL> ...]   tick these singles events of one tournament (added to
//                                               out/<t>/state.json) and pull every ticked event
//   node pull.js <tournament URL>               re-pull the tournament's ticked events (Refresh)
//   node pull.js --resume <pull folder | out/<t>>  finish an unfinished pull
// The pull writes out/<t>/pull-<stamp>/ and swaps it in through out/<t>/current. Increment 1's
// per-event folders (out/<t>__<e>__<stamp>/) are retired: nothing writes them any more, and
// --resume refuses one (D2-8).
// One client, so one limiter, for the whole run: the catalog request (when one is needed) and the
// pull share it, and the tournament's events are asked for once (D2-9). Do not run a CLI pull
// while the app is pulling: they are two processes on one token (README, "Pulling from the command
// line").
// Progress goes to stderr, the summary to stdout. See README.md.

const path = require('node:path');
const { loadToken } = require('./lib/token');
const sgg = require('./lib/startgg');
const pool = require('./lib/pool');
const { run, EXIT_SETUP, EXIT_INCOMPLETE } = require('./lib/run');

const USAGE = 'Usage:\n  node pull.js <start.gg event URL> [more event URLs of the same tournament]\n'
  + '  node pull.js <start.gg tournament URL>\n  node pull.js --resume <pull folder or out/<tournament>>';

function parseArgs(argv) {
  const args = { urls: [], resumeDir: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--resume') args.resumeDir = argv[++i] || '';
    else if (a === '-h' || a === '--help') args.help = true;
    else args.urls.push(a);
  }
  return args;
}

// Tick the URLs' events in state.json (the tool's record of what is seeded; the pull itself never
// writes it). A tournament not added yet, or an event its catalog does not know, costs one request
// for the tournament's events, made with `client` (the run's one client) and returned as `apiT` so
// the pull does not ask again.
// D2-5: state.json is shared with the app, which may save a tick, a link, a lifecycle mark or a
// push record while this runs. It is created only when none exists; otherwise this merges into
// the file as it is at write time (lib/pool updateState), changing only the catalog and `ticked`,
// never `marked_done`, `archived`, `pushes` or `linked`.
async function tickFromUrls({ urls, token, outRoot, fetchImpl, client, stderr = process.stderr }) {
  const say = (s) => stderr.write(s + '\n');
  const ts = [...new Set(urls.map((u) => sgg.parseTournamentSlug(u)))];
  if (ts.length !== 1 || !ts[0]) { say(ts.length > 1 ? 'All links must be from one tournament.' : 'That is not a start.gg tournament or event URL.'); return null; }
  const t = ts[0];
  const events = urls.map((u) => sgg.parseEventSlug(u)).filter((p) => !p.error).map((p) => pool.shortSlug(p.slug));
  const tDir = path.join(outRoot, t);
  const known = pool.readState(tDir);
  let apiT = null;
  let catalog = null;
  if (!known || events.some((e) => !known.events.some((x) => x.slug === e))) {
    try { apiT = await sgg.fetchTournamentEvents(client || sgg.createClient({ token, fetchImpl }), t); } catch (err) {
      say(err.kind === 'bad-token' ? 'start.gg rejected the token. Check STARTGG_TOKEN (environment or .env) and try again.' : err.message);
      return null;
    }
    catalog = pool.catalogOf(apiT);
  }
  const catalogEvents = catalog ? catalog.events : known.events;
  for (const e of events) {
    const ev = catalogEvents.find((x) => x.slug === e);
    if (!ev) { say(`No event "${e}" in ${(catalog || known).tournament.name}.`); return null; }
    if (!ev.singles) { say(`${ev.name} is a teams event; only singles events can be seeded.`); return null; }
  }
  const tick = (s) => {
    if (catalog) { s.tournament = catalog.tournament; s.events = catalog.events; }
    const want = new Set([...(s.ticked || []), ...events]);
    s.ticked = s.events.map((e) => e.slug).filter((x) => want.has(x));
  };
  let state;
  if (pool.readState(tDir)) state = pool.updateState(tDir, tick);
  else if (catalog) { state = pool.newState(catalog); tick(state); pool.writeState(tDir, state); }
  else { say(`${t}'s data was deleted while this ran; run the command again.`); return null; }
  if (!state.ticked.length) { say(`No events are ticked for ${t}. Pass an event URL, or tick events on the tournament's page.`); return null; }
  return { t, events: state.ticked, apiT };
}

// opts (tests): outRoot, token (overrides .env), fetchImpl, stderr, stdout.
async function main(argv = process.argv.slice(2), opts = {}) {
  const stderr = opts.stderr || process.stderr;
  const stdout = opts.stdout || process.stdout;
  const args = parseArgs(argv);
  if (args.help) { stdout.write(USAGE + '\n'); return 0; }
  if ((!args.urls.length && !args.resumeDir) || (args.urls.length && args.resumeDir) || args.resumeDir === '') {
    stderr.write(USAGE + '\n');
    return EXIT_SETUP;
  }
  const outRoot = opts.outRoot || path.join(__dirname, 'out');
  const token = 'token' in opts ? opts.token : loadToken({ envFile: path.join(__dirname, '.env') }).token;
  const io = { stderr, stdout, fetchImpl: opts.fetchImpl };
  if (args.resumeDir) return run({ resumeDir: args.resumeDir, token, outRoot, ...io });
  if (!token) return run({ url: args.urls[0], token, outRoot, ...io }); // the plain no-token message, exit 2
  // D2-9: one client for the catalog request and the pull. Its records before the pull folder
  // exists are handed to run(), which logs them in the pull's request log.
  const records = [];
  const client = sgg.createClient({ token, fetchImpl: opts.fetchImpl, onRequest: (r) => records.push(r) });
  const picked = await tickFromUrls({ urls: args.urls, outRoot, client, stderr });
  if (!picked) return EXIT_SETUP;
  return run({ tournament: picked.t, events: picked.events, url: args.urls[0], token, outRoot, client, apiT: picked.apiT, records, ...io });
}

if (require.main === module) {
  main().then(
    (code) => { process.exitCode = code; },
    (err) => {
      process.stderr.write(`Unexpected error: ${err && err.stack ? err.stack : err}\n`);
      process.exitCode = EXIT_INCOMPLETE;
    },
  );
}

module.exports = { tickFromUrls, parseArgs, main };
