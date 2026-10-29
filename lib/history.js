'use strict';
// lib/history.js — who the registrants are and what each one's last two years look like.
// Pure functions up top (tested offline). The two collect* functions take a start.gg client
// and do the paging.

const sgg = require('./startgg');

const WINDOW_DAYS = 730;
const DAY_MS = 86_400_000;

// [runAt - 730 days, runAt], both ends inclusive, in ms.
function computeWindow(runAtMs) {
  return { startMs: runAtMs - WINDOW_DAYS * DAY_MS, endMs: runAtMs };
}

// startAt is unix seconds. A missing startAt cannot be placed in the window, so it is counted
// as out_of_window (the design has no separate bucket for it).
function inWindow(startAtSec, window) {
  if (startAtSec == null || !Number.isFinite(Number(startAtSec))) return false;
  const ms = Number(startAtSec) * 1000;
  return ms >= window.startMs && ms <= window.endMs;
}

// YYYY-MM-DD in UTC.
function isoDate(startAtSec) {
  if (startAtSec == null) return '';
  return new Date(Number(startAtSec) * 1000).toISOString().slice(0, 10);
}

const str = (v) => (v == null ? '' : String(v));

// Entrant nodes -> one record per participant (a team entrant becomes several rows).
// A player who appears twice (possible only in odd team setups) is kept once; the repeat is
// counted. A participant with no player cannot be keyed and is counted, not kept.
function splitRegistrants(entrantNodes) {
  const players = [];
  const seen = new Map();
  const counts = { participants: 0, team_entries_split: 0, duplicate_player: 0, no_player: 0 };
  for (const ent of entrantNodes || []) {
    const parts = (ent && ent.participants) || [];
    const isTeam = parts.length > 1;
    if (isTeam) counts.team_entries_split++;
    for (const p of parts) {
      counts.participants++;
      const pl = p && p.player;
      if (!pl || pl.id == null) { counts.no_player++; continue; }
      const id = str(pl.id);
      if (seen.has(id)) {
        counts.duplicate_player++;
        if (isTeam) seen.get(id).team_entry = true;
        continue;
      }
      const user = pl.user || null;
      const loc = (user && user.location) || {};
      const rec = {
        player_id: id,
        gamer_tag: str(pl.gamerTag),
        prefix: str(pl.prefix),
        user_id: user && user.id != null ? str(user.id) : '',
        user_slug: user && user.slug ? str(user.slug) : '',
        region_state: user ? str(loc.state).trim() : '',
        region_country: user ? str(loc.country).trim() : '',
        team_entry: isTeam,
      };
      seen.set(id, rec);
      players.push(rec);
    }
  }
  return { players, counts };
}

// A past event (user.events node, or a recentStandings container) -> a results.csv row.
function eventRow(player, ev, placement, eventGameId) {
  const gameId = ev.videogame && ev.videogame.id != null ? str(ev.videogame.id) : '';
  return {
    player_id: player.player_id,
    gamer_tag: player.gamer_tag,
    event_date: isoDate(ev.startAt),
    game_id: gameId,
    game_name: ev.videogame ? str(ev.videogame.name) : '',
    is_event_game: gameId !== '' && gameId === str(eventGameId),
    tournament_name: ev.tournament ? str(ev.tournament.name) : '',
    event_name: str(ev.name),
    event_slug: str(ev.slug),
    event_id: str(ev.id),
    num_entrants: ev.numEntrants == null ? '' : str(ev.numEntrants),
    placement: placement == null ? '' : str(placement),
    is_online: ev.isOnline === true,
  };
}

// user.events nodes -> { rows, skipped }. Repeats across pages (paging can shift while we
// read) are dropped by event id; they are the same event, not a lost result.
function rowsFromUserEvents(player, nodes, window, eventGameId) {
  const rows = [];
  const skipped = { out_of_window: 0, no_event_container: 0 };
  const seen = new Set();
  for (const ev of nodes) {
    if (!ev || ev.id == null) { skipped.no_event_container++; continue; }
    if (seen.has(str(ev.id))) continue;
    seen.add(str(ev.id));
    if (!inWindow(ev.startAt, window)) { skipped.out_of_window++; continue; }
    const placement = ev.userEntrant && ev.userEntrant.standing ? ev.userEntrant.standing.placement : null;
    rows.push(eventRow(player, ev, placement, eventGameId));
  }
  return { rows, skipped };
}

// recentStandings lists (one per game queried) -> { rows, skipped }. A standing whose container
// is not an Event (a phase, a league) is counted as no_event_container.
function rowsFromStandings(player, standingLists, window, eventGameId) {
  const rows = [];
  const skipped = { out_of_window: 0, no_event_container: 0 };
  const seen = new Set();
  for (const list of standingLists) {
    for (const st of list || []) {
      const c = st && st.container;
      if (!c || c.__typename !== 'Event' || c.id == null) { skipped.no_event_container++; continue; }
      if (seen.has(str(c.id))) continue;
      seen.add(str(c.id));
      if (!inWindow(c.startAt, window)) { skipped.out_of_window++; continue; }
      rows.push(eventRow(player, c, st.placement, eventGameId));
    }
  }
  return { rows, skipped };
}

// The status rule (design, players.csv history_status).
//   linked user + user.events paged to the end   -> complete
//   no linked user, recentStandings answered     -> limited
//   retries exhausted / the API had no record    -> failed
function statusFor(player, outcome) {
  if (outcome === 'failed') return 'failed';
  return player.user_id ? 'complete' : 'limited';
}

// Fetch one linked player's full history. Throws StartggError on failure.
async function collectUserHistory(client, player, window, eventGameId, onPage = () => {}) {
  const tag = { player_id: player.player_id };
  const nodes = [];
  let totalPages = 1;
  for (let page = 1; page <= totalPages; page++) {
    const res = await sgg.fetchUserEventsPage(client, player.user_id, page, tag);
    if (!res) {
      throw new sgg.StartggError('missing', `user ${player.user_id} returned no record`);
    }
    totalPages = res.totalPages;
    nodes.push(...res.nodes);
    onPage(page, totalPages);
  }
  const { rows, skipped } = rowsFromUserEvents(player, nodes, window, eventGameId);
  return { status: statusFor(player, 'ok'), rows, skipped, pages: totalPages };
}

// Fetch a no-account player's recentStandings for every game we can identify: the input
// event's game, plus an any-game call when the schema allows it.
async function collectLimitedHistory(client, player, window, eventGameId, onPage = () => {}) {
  const tag = { player_id: player.player_id };
  // Increment 3: a pool player is queried for the game of every seeded event they entered (an
  // array); a single id is the increment 1 shape. Rows are de-duplicated by event id below.
  const games = [...new Set((Array.isArray(eventGameId) ? eventGameId : [eventGameId]).map((g) => (g == null ? g : String(g))))];
  if (sgg.ALL_GAMES_FALLBACK) games.push(null);
  const lists = [];
  for (let i = 0; i < games.length; i++) {
    const list = await sgg.fetchRecentStandings(client, player.player_id, games[i], tag);
    if (list == null) {
      throw new sgg.StartggError('missing', `player ${player.player_id} returned no record`);
    }
    lists.push(list);
    onPage(i + 1, games.length);
  }
  const { rows, skipped } = rowsFromStandings(player, lists, window, eventGameId);
  return { status: statusFor(player, 'ok'), rows, skipped, pages: games.length };
}

function collectHistory(client, player, window, eventGameId, onPage) {
  return player.user_id
    ? collectUserHistory(client, player, window, eventGameId, onPage)
    : collectLimitedHistory(client, player, window, eventGameId, onPage);
}

module.exports = {
  WINDOW_DAYS, computeWindow, inWindow, isoDate, splitRegistrants, eventRow,
  rowsFromUserEvents, rowsFromStandings, statusFor,
  collectUserHistory, collectLimitedHistory, collectHistory,
};
