'use strict';
// lib/schedule.js — T3 (docs/design-tool.md): every player's schedule across a tournament's events: which
// events (games) they entered, which pool (block) they sit in, and when that pool's wave starts.
// Two queries: one for the tournament's events -> phases -> pools -> waves (the timetable), one
// paged per event for its entrants and their seeds (which pool each entrant is in). The join
// is pure (buildSchedule) so it can be tested without the network.
//
// Moved from conflicts/lib/schedule.js in build B (it was the schedule-conflicts feature). Visibility
// only: it never fixes a conflict.
// Reuses the seeding tool's start.gg client (lib/startgg.js) for pacing, retries and errors.

const sgg = require('./startgg');

// Live-measured 2026-10-16 on eclipse-1st-cour: perPage 100 = queryComplexity 601 (cap 1000).
const ENTRANTS_PER_PAGE = 100;
// Pools per phase. The largest phase seen had 8. buildTimetable fails loudly if one is cut off.
const GROUPS_PER_PAGE = 100;

const Q_TOURNAMENT_SCHEDULE = `query TournamentSchedule($slug: String!, $perPage: Int!) {
  tournament(slug: $slug) {
    id slug name startAt timezone
    events {
      id slug name startAt numEntrants
      videogame { id name }
      phases {
        id name phaseOrder groupCount numSeeds
        phaseGroups(query: { page: 1, perPage: $perPage }) {
          pageInfo { total }
          nodes { id displayIdentifier startAt wave { id identifier startAt } }
        }
      }
    }
  }
}`;

const Q_EVENT_ENTRANT_SEEDS = `query EventEntrantSeeds($eventId: ID!, $page: Int!, $perPage: Int!) {
  event(id: $eventId) {
    entrants(query: { page: $page, perPage: $perPage }) {
      pageInfo { total totalPages }
      nodes {
        id name
        participants { player { id gamerTag prefix } user { id slug } }
        seeds { seedNum groupSeedNum phase { id } phaseGroup { id } }
      }
    }
  }
}`;

// Accepts a start.gg tournament or event URL, or a bare tournament slug (one parser for the app:
// lib/startgg.js).
const { parseTournamentSlug } = sgg;

async function fetchTournament(client, slug) {
  const data = await client.request('TournamentSchedule', Q_TOURNAMENT_SCHEDULE,
    { slug, perPage: GROUPS_PER_PAGE });
  const t = data && data.tournament;
  if (!t) throw new sgg.StartggError('event-not-found', `No tournament found for "${slug}".`);
  return t;
}

async function fetchEntrantSeeds(client, eventId, onPage = () => {}) {
  const all = [];
  let totalPages = 1;
  for (let page = 1; page <= totalPages; page++) {
    const data = await client.request('EventEntrantSeeds', Q_EVENT_ENTRANT_SEEDS,
      { eventId, page, perPage: ENTRANTS_PER_PAGE }, { eventId, page });
    const conn = data && data.event && data.event.entrants;
    if (!conn) throw new sgg.StartggError('query', `EventEntrantSeeds: nothing returned for event ${eventId} (page ${page}).`);
    totalPages = (conn.pageInfo && conn.pageInfo.totalPages) || 0;
    all.push(...(conn.nodes || []));
    onPage(page, totalPages);
  }
  return all;
}

// ---- Pure ---------------------------------------------------------------------------------

// Flattens the tournament into one record per pool (phase group), keyed by pool id.
function buildTimetable(tournament) {
  const pools = new Map();
  for (const ev of tournament.events || []) {
    for (const ph of ev.phases || []) {
      const conn = ph.phaseGroups || {};
      const nodes = conn.nodes || [];
      const total = conn.pageInfo && conn.pageInfo.total;
      if (total != null && total > nodes.length) {
        throw new Error(`Phase "${ph.name}" in ${ev.name} has ${total} pools; only ${nodes.length} fetched. Raise GROUPS_PER_PAGE.`);
      }
      for (const pg of nodes) {
        pools.set(String(pg.id), {
          poolId: String(pg.id),
          eventId: String(ev.id),
          eventName: ev.name,
          eventSlug: ev.slug,
          game: (ev.videogame && ev.videogame.name) || '',
          phaseId: String(ph.id),
          phaseName: ph.name,
          phaseOrder: ph.phaseOrder,
          pool: pg.displayIdentifier,
          wave: (pg.wave && pg.wave.identifier) || null,
          // A pool's own start wins; fall back to its wave's.
          startAt: pg.startAt || (pg.wave && pg.wave.startAt) || null,
        });
      }
    }
  }
  return pools;
}

// Joins entrants' seeds to the timetable. Returns players sorted by tag, each with entries
// sorted by start time. An entrant registered in an event but not yet in any pool still gets
// an entry (pool null) so nobody silently drops out of the schedule.
// entrantsByEvent: Map(eventId -> entrant nodes from Q_EVENT_ENTRANT_SEEDS).
// opts.side marks every entry as coming from a side-games tournament (see mergeSide).
function buildSchedule(tournament, entrantsByEvent, opts = {}) {
  const pools = buildTimetable(tournament);
  const events = new Map((tournament.events || []).map((e) => [String(e.id), e]));
  const players = new Map();

  for (const [eventId, entrants] of entrantsByEvent) {
    const ev = events.get(String(eventId));
    for (const ent of entrants) {
      const parts = ent.participants || [];
      const seeds = (ent.seeds || []).filter((s) => s && s.phaseGroup);
      for (const p of parts) {
        const pl = p.player || {};
        const key = pl.id != null ? 'p' + pl.id : 'e' + ent.id;
        if (!players.has(key)) {
          players.set(key, {
            playerId: pl.id != null ? String(pl.id) : null,
            tag: pl.gamerTag || ent.name,
            prefix: pl.prefix || '',
            userSlug: (p.user && p.user.slug) || null,
            entries: [],
          });
        }
        const rec = players.get(key);
        const base = {
          eventId: String(eventId),
          eventName: ev ? ev.name : String(eventId),
          game: ev && ev.videogame ? ev.videogame.name : '',
          entrantId: String(ent.id),
          team: parts.length > 1 ? ent.name : null,
          side: !!opts.side,
        };
        if (!seeds.length) {
          rec.entries.push({ ...base, phaseName: null, pool: null, wave: null, startAt: null, seedNum: null, poolSeedNum: null });
          continue;
        }
        for (const s of seeds) {
          const pool = pools.get(String(s.phaseGroup.id));
          rec.entries.push({
            ...base,
            phaseName: pool ? pool.phaseName : null,
            pool: pool ? pool.pool : null,
            poolId: String(s.phaseGroup.id),
            wave: pool ? pool.wave : null,
            startAt: pool ? pool.startAt : null,
            seedNum: s.seedNum ?? null,
            poolSeedNum: s.groupSeedNum ?? null,
          });
        }
      }
    }
  }

  const byStart = (a, b) => (a.startAt ?? Infinity) - (b.startAt ?? Infinity)
    || a.eventName.localeCompare(b.eventName);
  const list = [...players.values()];
  for (const p of list) p.entries.sort(byStart);
  list.sort((a, b) => a.tag.localeCompare(b.tag, undefined, { sensitivity: 'base' }));
  for (const p of list) p.conflict = conflictOf(p.entries);
  return list;
}

// Adds side-games entries to the main tournament's players, matched by start.gg player id.
// Players only in the side tournament are left out: they have no main-event pool to move.
function mergeSide(mainPlayers, sidePlayers) {
  const byId = new Map(mainPlayers.filter((p) => p.playerId).map((p) => [p.playerId, p]));
  for (const sp of sidePlayers) {
    const mp = sp.playerId && byId.get(sp.playerId);
    if (mp) mp.entries.push(...sp.entries);
  }
  const byStart = (a, b) => (a.startAt ?? Infinity) - (b.startAt ?? Infinity) || a.side - b.side
    || a.eventName.localeCompare(b.eventName);
  for (const p of mainPlayers) { p.entries.sort(byStart); p.conflict = conflictOf(p.entries); }
  return mainPlayers;
}

// Two or more entries starting at the same time. 'main' when at least two of them are
// main-tournament pools; 'side' when every such clash involves a side game; null when none.
function conflictOf(entries) {
  const at = new Map();
  for (const e of entries) {
    if (!e.startAt) continue;
    if (!at.has(e.startAt)) at.set(e.startAt, []);
    at.get(e.startAt).push(e);
  }
  let kind = null;
  for (const group of at.values()) {
    if (group.length < 2) continue;
    if (group.filter((e) => !e.side).length >= 2) return 'main';
    kind = 'side';
  }
  return kind;
}

// ---- Formatting ---------------------------------------------------------------------------

function timeFormatter(timeZone) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || 'UTC', weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
  return (sec) => (sec ? f.format(new Date(sec * 1000)) : '');
}

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const csvRow = (cells) => cells.map(csvCell).join(',');

// One row per player x pool assignment (long format: filter/pivot it in Sheets).
function scheduleCsv(players, fmt) {
  const out = [csvRow(['tag', 'prefix', 'player_id', 'user_slug', 'game', 'event', 'phase', 'pool',
    'wave', 'start_local', 'start_utc', 'seed', 'team', 'side_game', 'conflict'])];
  for (const p of players) {
    for (const e of p.entries) {
      out.push(csvRow([p.tag, p.prefix, p.playerId, p.userSlug, e.game, e.eventName, e.phaseName,
        e.pool ?? '(no pool)', e.wave, fmt(e.startAt),
        e.startAt ? new Date(e.startAt * 1000).toISOString() : '', e.seedNum, e.team, e.side ? 'yes' : '', p.conflict]));
    }
  }
  return out.join('\n') + '\n';
}

// The tournament's blocks: one row per pool, sorted by start.
function blocksCsv(timetable, fmt) {
  const rows = [...timetable.values()].sort((a, b) => (a.startAt ?? Infinity) - (b.startAt ?? Infinity)
    || a.eventName.localeCompare(b.eventName) || String(a.pool).localeCompare(String(b.pool)));
  const out = [csvRow(['wave', 'start_local', 'start_utc', 'game', 'event', 'phase', 'pool', 'pool_id'])];
  for (const r of rows) {
    out.push(csvRow([r.wave, fmt(r.startAt), r.startAt ? new Date(r.startAt * 1000).toISOString() : '',
      r.game, r.eventName, r.phaseName, r.pool, r.poolId]));
  }
  return out.join('\n') + '\n';
}

// Readable: one block per player, entries in time order.
function scheduleText(players, fmt, shortName = (e) => e.eventName) {
  const lines = [];
  for (const p of players) {
    lines.push((p.prefix ? p.prefix + ' | ' : '') + p.tag);
    for (const e of p.entries) {
      const where = (e.side ? 'side game: ' : '') + (e.pool == null ? '(no pool yet)' : `${e.phaseName} ${e.pool}`);
      const when = e.startAt ? `wave ${e.wave || '?'}, ${fmt(e.startAt)}` : 'no time set';
      lines.push(`  ${fmt(e.startAt).padEnd(22)} ${shortName(e).padEnd(10)} ${where}  (${when})${e.team ? '  team: ' + e.team : ''}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

module.exports = {
  ENTRANTS_PER_PAGE, GROUPS_PER_PAGE, Q_TOURNAMENT_SCHEDULE, Q_EVENT_ENTRANT_SEEDS,
  parseTournamentSlug, fetchTournament, fetchEntrantSeeds,
  buildTimetable, buildSchedule, mergeSide, conflictOf, timeFormatter, scheduleCsv, blocksCsv, scheduleText,
};
