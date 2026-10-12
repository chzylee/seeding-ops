#!/usr/bin/env node
'use strict';
// pull.js — command line entry point.
//   node pull.js <start.gg event URL>
//   node pull.js --resume <run folder>
// Progress goes to stderr, the summary to stdout. See README.md.

const path = require('node:path');
const { loadToken } = require('./lib/token');
const { run, EXIT_SETUP, EXIT_INCOMPLETE } = require('./lib/run');

const USAGE = 'Usage:\n  node pull.js <start.gg event URL>\n  node pull.js --resume <run folder>';

function parseArgs(argv) {
  const args = { url: null, resumeDir: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--resume') args.resumeDir = argv[++i] || '';
    else if (a === '-h' || a === '--help') args.help = true;
    else if (!args.url) args.url = a;
    else args.extra = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { process.stdout.write(USAGE + '\n'); return 0; }
  if ((!args.url && !args.resumeDir) || (args.url && args.resumeDir) || args.extra || args.resumeDir === '') {
    process.stderr.write(USAGE + '\n');
    return EXIT_SETUP;
  }
  const { token } = loadToken({ envFile: path.join(__dirname, '.env') });
  return run({
    url: args.url,
    resumeDir: args.resumeDir,
    token,
    outRoot: path.join(__dirname, 'out'),
  });
}

main().then(
  (code) => { process.exitCode = code; },
  (err) => {
    process.stderr.write(`Unexpected error: ${err && err.stack ? err.stack : err}\n`);
    process.exitCode = EXIT_INCOMPLETE;
  },
);
