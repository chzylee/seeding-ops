#!/usr/bin/env node
'use strict';
// scripts/check-requests.js — acceptance items 6 and 7, from a run's request log.
//   node scripts/check-requests.js <run folder>
// Reports: total sends, the most sends in any rolling 60 s window (must be <= 80; the tool
// aims for <= 75), how many backoffs happened, and, for a resumed run, whether any player
// checkpointed before a resume was fetched again after it. Exit 0 only if both hold.

const fs = require('node:fs');
const { readRequestLog, readCheckpoint } = require('../lib/output');
const { maxInAnyWindow } = require('../lib/pacing');

const HISTORY_OPS = new Set(['UserEvents', 'RecentStandings', 'RecentStandingsAnyGame']);

function checkRequests(runDir) {
  const log = readRequestLog(runDir);
  const sends = log.filter((r) => r.op !== 'RESUME');
  const resumes = log.filter((r) => r.op === 'RESUME').map((r) => r.ms);
  const maxWindow = maxInAnyWindow(sends.map((r) => r.ms));
  const backoffs = sends.filter((r) => r.retry_in_ms != null);

  // Refetch check: a player checkpointed before resume k must not be requested after it.
  const { done } = readCheckpoint(runDir);
  const refetched = [];
  for (const resumeAt of resumes) {
    const doneBefore = new Set([...done.values()]
      .filter((e) => e.finished_at && Date.parse(e.finished_at) <= resumeAt).map((e) => String(e.player_id)));
    for (const r of sends) {
      if (r.ms > resumeAt && HISTORY_OPS.has(r.op) && doneBefore.has(String(r.player_id))) refetched.push(r.player_id);
    }
  }
  const sessions = [];
  let cur = { from: sends.length ? sends[0].ms : 0, sends: 0, players: new Set() };
  for (const r of log) {
    if (r.op === 'RESUME') { sessions.push(cur); cur = { from: r.ms, sends: 0, players: new Set() }; continue; }
    cur.sends++;
    if (HISTORY_OPS.has(r.op)) cur.players.add(String(r.player_id));
  }
  sessions.push(cur);
  return { total: sends.length, maxWindow, backoffs: backoffs.length, resumes: resumes.length, refetched: [...new Set(refetched)], sessions };
}

function main() {
  const runDir = process.argv[2];
  if (!runDir || !fs.existsSync(runDir)) { console.error('Usage: node scripts/check-requests.js <run folder>'); return 2; }
  const r = checkRequests(runDir);
  console.log(`requests: ${r.total}`);
  console.log(`max in any rolling 60 s window: ${r.maxWindow} (limit 80, target 75) -> ${r.maxWindow <= 80 ? 'PASS' : 'FAIL'}`);
  console.log(`backoffs: ${r.backoffs}`);
  r.sessions.forEach((s, i) => console.log(`session ${i + 1}: ${s.sends} sends, history fetched for ${s.players.size} players`));
  if (r.resumes) {
    console.log(`resumes: ${r.resumes}; players checkpointed before a resume and fetched again after it: ${r.refetched.length} -> ${r.refetched.length === 0 ? 'PASS' : 'FAIL'}`);
  }
  return r.maxWindow <= 80 && r.refetched.length === 0 ? 0 : 1;
}

if (require.main === module) process.exitCode = main();

module.exports = { checkRequests };
