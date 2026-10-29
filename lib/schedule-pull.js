'use strict';
// lib/schedule-pull.js — T3 (docs/design-tool.md): pull every player's schedule for a tournament
// into out/<t>/schedule.json, next to the pool it belongs to and outside every pull folder (a pool
// swap never touches it). Moved from conflicts/lib/pull.js in build B; conflicts/out/ is no longer
// written or read.
//
// Side tournaments linked to this one live in out/<t>/state.json `linked` (they lived in
// conflicts/linked.json before; lib/pool.js newState imports that file's entry once). The app runs
// this through its single request queue (app/queue.js), like every other start.gg call.

const fs = require('node:fs');
const path = require('node:path');
const sgg = require('./startgg');
const sch = require('./schedule');
const pool = require('./pool');

const SCHEDULE_FILE = 'schedule.json';

// "[bloody fights.] MBAACC Singles" -> "MBAACC". Falls back to the full name.
function shortEventName(name) {
  const m = String(name).match(/\]\s*([A-Z0-9]{2,})\b/);
  return m ? m[1] : String(name);
}

async function fetchAll(client, slug, log) {
  const t = await sch.fetchTournament(client, slug);
  log(`${t.name} (${t.timezone || 'UTC'})`);
  const entrantsByEvent = new Map();
  for (const ev of t.events || []) {
    if (!ev.numEntrants) { log(`  ${ev.name}: no entrants, skipped`); continue; }
    const nodes = await sch.fetchEntrantSeeds(client, ev.id);
    log(`  ${ev.name}: ${nodes.length} entrants`);
    entrantsByEvent.set(String(ev.id), nodes);
  }
  return { t, entrantsByEvent };
}

const scheduleFile = (tDir) => path.join(tDir, SCHEDULE_FILE);
function readSchedule(tDir) {
  try { return JSON.parse(fs.readFileSync(scheduleFile(tDir), 'utf8')); } catch { return null; }
}

// opts: slug, outRoot (the out/ folder), token, fetchImpl, now, sleep, log(line), sides (side
// tournament slugs; default state.json `linked`), seedsOnly (re-pull only this tournament's pools and
// seeds and carry the side games from the last schedule.json; with none, a full pull).
// Resolves to { file, players, requests, complexityMax }.
async function pullSchedule(opts) {
  const log = opts.log || (() => {});
  const now = opts.now || Date.now;
  const client = sgg.createClient({ token: opts.token, fetchImpl: opts.fetchImpl, now: opts.now, sleep: opts.sleep });
  const tDir = pool.tournamentDir(opts.outRoot, opts.slug);
  const state = pool.readState(tDir);
  const sides = opts.sides || (state && state.linked) || [];
  const prev = opts.seedsOnly ? readSchedule(tDir) : null;

  const { t, entrantsByEvent } = await fetchAll(client, opts.slug, log);
  const timetable = sch.buildTimetable(t);
  const players = sch.buildSchedule(t, entrantsByEvent);
  let sideTournaments = [];
  let sideEvents = [];
  let sidesPulledAt = null;
  if (prev) {
    log(`Side games carried over from the pull at ${prev.sides_pulled_at || prev.pulled_at}`);
    sideTournaments = prev.side_tournaments || [];
    sideEvents = (prev.events || []).filter((e) => e.side);
    sidesPulledAt = prev.sides_pulled_at || prev.pulled_at;
    for (const b of prev.blocks || []) if (b.side) timetable.set(b.poolId, b);
    sch.mergeSide(players, (prev.players || []).map((p) => ({ playerId: p.playerId, entries: p.entries.filter((e) => e.side) })));
  } else {
    for (const sideSlug of sides) {
      const side = await fetchAll(client, sideSlug, log);
      sideTournaments.push({ id: String(side.t.id), slug: side.t.slug, name: side.t.name });
      sideEvents.push(...(side.t.events || []).map((e) => ({
        id: String(e.id), name: e.name, short: shortEventName(e.name),
        game: e.videogame && e.videogame.name, numEntrants: e.numEntrants, side: true,
      })));
      for (const [id, b] of sch.buildTimetable(side.t)) timetable.set(id, { ...b, side: true });
      sch.mergeSide(players, sch.buildSchedule(side.t, side.entrantsByEvent, { side: true }));
    }
    sidesPulledAt = sides.length ? new Date(now()).toISOString() : null;
  }

  fs.mkdirSync(tDir, { recursive: true });
  pool.writeJsonAtomic(scheduleFile(tDir), {
    tournament: { id: String(t.id), slug: t.slug, name: t.name, timezone: t.timezone },
    pulled_at: new Date(now()).toISOString(),
    sides_pulled_at: sidesPulledAt,
    side_tournaments: sideTournaments,
    events: [
      ...(t.events || []).map((e) => ({
        id: String(e.id), name: e.name, short: shortEventName(e.name),
        game: e.videogame && e.videogame.name, numEntrants: e.numEntrants, side: false,
      })),
      ...sideEvents,
    ],
    blocks: [...timetable.values()],
    players,
  });
  return { file: scheduleFile(tDir), players, requests: client.stats.requests, complexityMax: client.stats.complexityMax };
}

module.exports = { SCHEDULE_FILE, shortEventName, pullSchedule, readSchedule, scheduleFile };
