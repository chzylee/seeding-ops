#!/usr/bin/env node
'use strict';
// pull.js — command line entry point for the tournament pool (docs/design-tool.md, T2).
//   node pull.js <event URL> [<event URL> ...]   tick these singles events of one tournament (added to
//                                               out/<t>/state.json) and pull every ticked event
//   node pull.js <tournament URL>               re-pull the tournament's ticked events (Refresh)
//   node pull.js --resume <pull folder | out/<t>>  finish an unfinished pull
// The pull writes out/<t>/pull-<stamp>/ and swaps it in through out/<t>/current. Increment 1's
// per-event folders (out/<t>__<e>__<stamp>/) are retired: nothing writes them any more.
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
// for the tournament's events.
async function tickFromUrls({ urls, token, outRoot, fetchImpl, stderr = process.stderr }) {
  const say = (s) => stderr.write(s + '\n');
  const ts = [...new Set(urls.map((u) => sgg.parseTournamentSlug(u)))];
  if (ts.length !== 1 || !ts[0]) { say(ts.length > 1 ? 'All links must be from one tournament.' : 'That is not a start.gg tournament or event URL.'); return null; }
  const t = ts[0];
  const events = urls.map((u) => sgg.parseEventSlug(u)).filter((p) => !p.error).map((p) => pool.shortSlug(p.slug));
  const tDir = path.join(outRoot, t);
  let state = pool.readState(tDir);
  if (!state || events.some((e) => !state.events.some((x) => x.slug === e))) {
    const client = sgg.createClient({ token, fetchImpl });
    let apiT;
    try { apiT = await sgg.fetchTournamentEvents(client, t); } catch (err) {
      say(err.kind === 'bad-token' ? 'start.gg rejected the token. Check STARTGG_TOKEN (environment or .env) and try again.' : err.message);
      return null;
    }
    const catalog = pool.catalogOf(apiT);
    state = state ? { ...state, tournament: catalog.tournament, events: catalog.events } : pool.newState(catalog);
  }
  for (const e of events) {
    const ev = state.events.find((x) => x.slug === e);
    if (!ev) { say(`No event "${e}" in ${state.tournament.name}.`); return null; }
    if (!ev.singles) { say(`${ev.name} is a teams event; only singles events can be seeded.`); return null; }
  }
  const ticked = new Set([...(state.ticked || []), ...events]);
  state.ticked = state.events.map((e) => e.slug).filter((s) => ticked.has(s));
  pool.writeState(tDir, state);
  if (!state.ticked.length) { say(`No events are ticked for ${t}. Pass an event URL, or tick events on the tournament's page.`); return null; }
  return { t, events: state.ticked };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { process.stdout.write(USAGE + '\n'); return 0; }
  if ((!args.urls.length && !args.resumeDir) || (args.urls.length && args.resumeDir) || args.resumeDir === '') {
    process.stderr.write(USAGE + '\n');
    return EXIT_SETUP;
  }
  const outRoot = path.join(__dirname, 'out');
  const { token } = loadToken({ envFile: path.join(__dirname, '.env') });
  if (args.resumeDir) return run({ resumeDir: args.resumeDir, token, outRoot });
  if (!token) return run({ url: args.urls[0], token, outRoot }); // the plain no-token message, exit 2
  const picked = await tickFromUrls({ urls: args.urls, token, outRoot });
  if (!picked) return EXIT_SETUP;
  return run({ tournament: picked.t, events: picked.events, url: args.urls[0], token, outRoot });
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

module.exports = { tickFromUrls, parseArgs };
