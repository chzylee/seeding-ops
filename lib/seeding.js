'use strict';
// lib/seeding.js — the seed order Noah arranges, per event (docs/design-tool.md, Amendment A2.3).
// Node only. Stored in out/<t>/state.json `seeding` (never written by the pull, deleted with the
// tournament): { [event slug]: { order: [player id], at } }. An event with no entry is in tier order.
// The order logic itself (tier order, reconciling with new and removed entrants, a move) is
// lib/view/model.js seedOrder / reconcileOrder / moveSeed, shared with the page.

const pool = require('./pool');
const data = require('./view/data');

const MAX_ORDER = 5000;
const bad = (status, msg) => Object.assign(new Error(msg), { status });

// The saved arrangement of one event, or null (tier order).
function savedFor(state, slug) {
  const x = state && state.seeding && state.seeding[slug];
  return x && Array.isArray(x.order) ? { order: x.order.map(String), at: x.at || null } : null;
}

// The players of a tab who entered one event (players.csv `events`).
function entrantsOf(players, slug) {
  return players.filter((p) => String(p.events || '').split(';').includes(slug)).map((p) => String(p.player_id));
}

// What the page needs to number a tab's seeds: each of the tab's events with its entrants and its
// saved arrangement. src: lib/view/data.js tabSource.
function forTab(src) {
  const state = pool.readState(src.tDir);
  const run = data.loadRun(src);
  const names = new Map(((run.meta && run.meta.seeded_events) || []).map((e) => [e.slug, e.name]));
  return {
    events: src.events.map((slug) => ({ slug, name: names.get(slug) || slug, entrants: entrantsOf(run.players, slug), saved: savedFor(state, slug) })),
  };
}

// body: { mode: 'tiers' } (reset: forget the arrangement) or { mode: 'arranged', order: [player id] }.
// Every id must be an entrant of the event in the live pull, at most once. An order that leaves some
// entrants out is legal (they slot in by tier when read). Returns the event's saved entry (or null).
function checkBody(body, entrants) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad(400, 'The seed order must be an object: { mode, order }.');
  if (body.mode === 'tiers') return null;
  if (body.mode !== 'arranged') throw bad(400, '"mode" must be "tiers" or "arranged".');
  if (!Array.isArray(body.order) || body.order.length > MAX_ORDER) throw bad(400, '"order" must be a list of player ids.');
  const known = new Set(entrants);
  const seen = new Set();
  for (const raw of body.order) {
    const id = String(raw);
    if (typeof raw !== 'string' && typeof raw !== 'number') throw bad(400, '"order" must be a list of player ids.');
    if (!known.has(id)) throw bad(400, `Player ${id} is not an entrant of this event in the current pull.`);
    if (seen.has(id)) throw bad(400, `Player ${id} appears twice in the order.`);
    seen.add(id);
  }
  return body.order.map(String);
}

// Save (or reset) one event's arrangement. src: a tab (the event must be one of its events).
function setOrder(src, slug, body, { now = new Date() } = {}) {
  if (!src.events.includes(slug)) throw bad(404, 'That event is not seeded on this tab.');
  const order = checkBody(body, entrantsOf(data.loadRun(src).players, slug));
  const s = pool.updateState(src.tDir, (st) => {
    const next = { ...(st.seeding || {}) };
    if (order) next[slug] = { order, at: now.toISOString() }; else delete next[slug];
    st.seeding = next;
  });
  return savedFor(s, slug);
}

module.exports = { savedFor, entrantsOf, forTab, checkBody, setOrder, MAX_ORDER };
