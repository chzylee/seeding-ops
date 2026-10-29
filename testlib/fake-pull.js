'use strict';
// testlib/fake-pull.js — runs lib/run.js against the fake API in a child process, so a test can
// kill it for real (SIGKILL, no cleanup) and then resume it.
//   node testlib/fake-pull.js <outRoot> <worldAtMs> <clockStartMs> [--kill-at N] [--resume <dir>] [--events a,b]
// --kill-at N  SIGKILLs this process when the Nth UserEvents request is about to be answered.

const { run } = require('../lib/run');
const { buildWorld, createFakeFetch, virtualClock, sink, EVENT_SLUG, T_SLUG } = require('./fake-api');

const [outRoot, worldAt, clockStart, ...rest] = process.argv.slice(2);
const killAt = rest.includes('--kill-at') ? Number(rest[rest.indexOf('--kill-at') + 1]) : null;
const resumeDir = rest.includes('--resume') ? rest[rest.indexOf('--resume') + 1] : null;
// --events a,b: pull the tournament with these seeded events (increment 3); else the one event URL.
const events = rest.includes('--events') ? rest[rest.indexOf('--events') + 1].split(',') : null;

const world = buildWorld(Number(worldAt) / 1000);
const clock = virtualClock(Number(clockStart));
const fetchImpl = createFakeFetch(world, {
  onUserEvents: (n) => { if (killAt && n === killAt) process.kill(process.pid, 'SIGKILL'); },
});
const err = sink();

run({
  url: resumeDir || events ? null : 'https://www.start.gg/' + EVENT_SLUG,
  tournament: events ? T_SLUG : undefined,
  events: events || undefined,
  resumeDir,
  token: 'TOKEN-SENTINEL-c0ffee',
  outRoot,
  fetchImpl,
  now: clock.now,
  sleep: clock.sleep,
  stderr: err,
  stdout: process.stdout,
}).then((code) => { process.stderr.write(err.text()); process.exitCode = code; });
