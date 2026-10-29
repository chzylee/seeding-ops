'use strict';
// conflicts/lib/pull.js — run one schedule pull into a folder, and find the latest pull.
// Used by the CLI (conflicts/pull-schedule.js) and the app's schedule page (app/server.js).
// Folders: <outRoot>/<tournament slug>__<YYYYMMDD-HHMMSS>/ with schedule.json/.csv/.txt and blocks.csv.

const fs = require('node:fs');
const path = require('node:path');
const sgg = require('../../lib/startgg');
const sch = require('./schedule');

const OUT_ROOT = path.join(__dirname, '..', 'out');
const LINKED_FILE = path.join(__dirname, '..', 'linked.json');
const FOLDER_RE = /^([a-z0-9][a-z0-9-]*)__(\d{8}-\d{4,6})$/i;

// "[bloody fights.] MBAACC Singles" -> "MBAACC". Falls back to the full name.
function shortEventName(name) {
  const m = String(name).match(/\]\s*([A-Z0-9]{2,})\b/);
  return m ? m[1] : String(name);
}

function stamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// Side-games tournaments linked to a main one (conflicts/linked.json). Missing file -> none.
function linkedSides(slug, file = LINKED_FILE) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8'))[slug] || []; } catch { return []; }
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

// opts: slug, sides (side-games tournament slugs; default linked.json), token, outRoot, log(line),
// fetchImpl, now, sleep. Resolves to { dir, players, requests }.
// opts.seedsOnly: re-pull only the main tournament (pools and seeds) and carry the side-games
// entries over from the latest pull, so a seeding pass doesn't re-fetch every side event. With no
// earlier pull to carry from, it does a full pull.
async function pullSchedule(opts) {
  const log = opts.log || (() => {});
  const now = opts.now || Date.now;
  const client = sgg.createClient({ token: opts.token, fetchImpl: opts.fetchImpl, now: opts.now, sleep: opts.sleep });
  const sides = opts.sides || linkedSides(opts.slug, opts.linkedFile);
  const outRoot = opts.outRoot || OUT_ROOT;
  const prevRef = opts.seedsOnly ? latestSchedule(outRoot, opts.slug) : null;
  const prev = prevRef ? JSON.parse(fs.readFileSync(path.join(prevRef.dir, 'schedule.json'), 'utf8')) : null;

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
  const fmt = sch.timeFormatter(t.timezone);

  const dir = path.join(outRoot, `${t.slug.replace(/^tournament\//, '')}__${stamp(new Date(now()))}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'schedule.json'), JSON.stringify({
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
  }, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'schedule.csv'), sch.scheduleCsv(players, fmt));
  fs.writeFileSync(path.join(dir, 'blocks.csv'), sch.blocksCsv(timetable, fmt));
  fs.writeFileSync(path.join(dir, 'schedule.txt'), sch.scheduleText(players, fmt, (e) => shortEventName(e.eventName)));
  return { dir, players, requests: client.stats.requests, complexityMax: client.stats.complexityMax };
}

// Every finished pull (has schedule.json), newest first per tournament: [{ slug, dir, stamp }].
function listSchedules(outRoot = OUT_ROOT) {
  if (!fs.existsSync(outRoot)) return [];
  return fs.readdirSync(outRoot)
    .map((name) => ({ name, m: FOLDER_RE.exec(name) }))
    .filter((x) => x.m && fs.existsSync(path.join(outRoot, x.name, 'schedule.json')))
    .map((x) => ({ slug: x.m[1], stamp: x.m[2].padEnd(15, '0'), dir: path.join(outRoot, x.name) }))
    .sort((a, b) => a.slug.localeCompare(b.slug) || b.stamp.localeCompare(a.stamp));
}

function latestSchedule(outRoot, slug) {
  return listSchedules(outRoot).find((s) => s.slug === slug) || null;
}

module.exports = { OUT_ROOT, LINKED_FILE, linkedSides, shortEventName, pullSchedule, listSchedules, latestSchedule };
