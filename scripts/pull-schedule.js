#!/usr/bin/env node
'use strict';
// scripts/pull-schedule.js — pull every player's schedule for a tournament (T3) from the command
// line. The app's Schedule tab does the same through its request queue.
//   node scripts/pull-schedule.js <start.gg tournament URL or slug> [--seeds]
// Writes out/<tournament>/schedule.json (lib/schedule-pull.js). Side tournaments come from
// out/<tournament>/state.json `linked`. --seeds re-pulls only this tournament's pools and seeds.
// Progress goes to stderr. Moved from conflicts/pull-schedule.js in build B.

const path = require('node:path');
const { loadToken } = require('../lib/token');
const { parseTournamentSlug } = require('../lib/startgg');
const { pullSchedule } = require('../lib/schedule-pull');

async function main() {
  const slug = parseTournamentSlug(process.argv[2]);
  if (!slug) {
    process.stderr.write('Usage: node scripts/pull-schedule.js <start.gg tournament URL or slug> [--seeds]\n');
    return 2;
  }
  const { token } = loadToken({ envFile: path.join(__dirname, '..', '.env') });
  if (!token) { process.stderr.write('No STARTGG_TOKEN. Paste it into .env first.\n'); return 2; }
  const r = await pullSchedule({ slug, token, outRoot: path.join(__dirname, '..', 'out'), seedsOnly: process.argv.includes('--seeds'),
    log: (l) => process.stderr.write(l + '\n') });
  const multi = r.players.filter((p) => new Set(p.entries.map((e) => e.eventId)).size > 1).length;
  process.stdout.write(`${r.players.length} players (${multi} in 2+ events), ${r.requests} requests, `
    + `max complexity ${r.complexityMax}\n${r.file}\n`);
  return 0;
}

main().then((c) => { process.exitCode = c; }, (e) => {
  process.stderr.write((e && e.message) || String(e));
  process.stderr.write('\n');
  process.exitCode = 1;
});
