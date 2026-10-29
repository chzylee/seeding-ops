#!/usr/bin/env node
'use strict';
// conflicts/pull-schedule.js — pull every player's schedule for a tournament.
//   node conflicts/pull-schedule.js <start.gg tournament URL or slug>
// Writes conflicts/out/<tournament>__<stamp>/: schedule.json, schedule.csv (one row per player
// per pool), schedule.txt (readable, per player), blocks.csv (every pool and its start time).
// Times are shown in the tournament's own time zone. Progress goes to stderr.
// The app shows the latest pull at /schedule/<tournament> (npm start).

const path = require('node:path');
const { loadToken } = require('../lib/token');
const sch = require('./lib/schedule');
const { pullSchedule } = require('./lib/pull');

async function main() {
  const slug = sch.parseTournamentSlug(process.argv[2]);
  if (!slug) {
    process.stderr.write('Usage: node conflicts/pull-schedule.js <start.gg tournament URL or slug>\n');
    return 2;
  }
  const { token } = loadToken({ envFile: path.join(__dirname, '..', '.env') });
  if (!token) { process.stderr.write('No STARTGG_TOKEN. Paste it into .env first.\n'); return 2; }
  const r = await pullSchedule({ slug, token, log: (l) => process.stderr.write(l + '\n') });
  const multi = r.players.filter((p) => new Set(p.entries.map((e) => e.eventId)).size > 1).length;
  process.stdout.write(`${r.players.length} players (${multi} in 2+ events), ${r.requests} requests, `
    + `max complexity ${r.complexityMax}\n${r.dir}\n`);
  return 0;
}

main().then((c) => { process.exitCode = c; }, (e) => {
  process.stderr.write((e && e.message) || String(e));
  process.stderr.write('\n');
  process.exitCode = 1;
});
