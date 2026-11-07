'use strict';
// lib/seeding.js — the Seed column's saved state, per event (docs/design-tool.md, Amendment A2.3).
// Node only. Stored in out/<t>/state.json `seeding` (never written by the pull, deleted with the
// tournament):
//   { [event slug]: { order: [player id] | null, at, rev, by, seq } }
// order null (or no entry) = tier order; rev counts every change to the event's entry; by / seq are the
// page (a random id per page load) and its write number that made the last change. The order logic
// itself (tier order, reconciling with new and removed entrants, a move) is lib/view/model.js
// seedOrder / reconcileOrder / moveSeed, shared with the page.
//
// Writes (auditor findings 5 and 6, build D pass 2). The page sends every change through one
// serialized chain with { base: the rev it built on, client, seq }:
//   - a write from the same page whose seq is not newer than the last one stored is an overtaken copy:
//     ignored, so the page's LAST write wins even if requests arrive out of order;
//   - a write built on a rev that another page has since changed is refused (409, failure
//     "seed-conflict", with the current entry), so a stale window can never erase an arrangement made
//     elsewhere, by a reset or by a post;
//   - a write without `base` (a script or a test, never the page) is not conflict-checked.

const pool = require('./pool');
const data = require('./view/data');
const M = require('./view/model');

const MAX_ORDER = 5000;
const bad = (status, msg, extra = {}) => Object.assign(new Error(msg), { status, ...extra });

// One event's entry, with defaults.
function entryFor(state, slug) {
  const x = (state && state.seeding && state.seeding[slug]) || {};
  return { order: Array.isArray(x.order) ? x.order.map(String) : null, at: x.at || null, rev: Number.isInteger(x.rev) ? x.rev : (Array.isArray(x.order) ? 1 : 0), by: x.by || null, seq: Number.isFinite(x.seq) ? x.seq : null };
}
// The saved arrangement of one event, or null (tier order).
function savedFor(state, slug) {
  const e = entryFor(state, slug);
  return e.order ? { order: e.order, at: e.at, rev: e.rev } : null;
}
const out = (e) => ({ mode: e.order ? 'arranged' : 'tiers', saved: e.order ? { order: e.order, at: e.at, rev: e.rev } : null, rev: e.rev });

// The players of a tab who entered one event (players.csv `events`).
function entrantsOf(players, slug) {
  return players.filter((p) => String(p.events || '').split(';').includes(slug)).map((p) => String(p.player_id));
}

// What the page needs to number a tab's seeds: each of the tab's events with its entrants, its saved
// arrangement and the entry's rev (the page's `base`). src: lib/view/data.js tabSource.
function forTab(src) {
  const state = pool.readState(src.tDir);
  const run = data.loadRun(src);
  const names = new Map(((run.meta && run.meta.seeded_events) || []).map((e) => [e.slug, e.name]));
  return {
    events: src.events.map((slug) => ({ slug, name: names.get(slug) || slug, entrants: entrantsOf(run.players, slug), saved: savedFor(state, slug), rev: entryFor(state, slug).rev })),
  };
}

// The Seed column as the server computes it (what the page shows on load): the saved arrangement, or
// the tier order from this game's tiers. -> { mode, order }.
function columnOrder(src, slug, { tiersFile } = {}) {
  const run = data.loadRun(src);
  const notes = data.readNotes(src, run.players, src.game && src.game.id, tiersFile);
  const byId = new Map(run.players.map((p) => [String(p.player_id), p]));
  const entrants = entrantsOf(run.players, slug).map((id) => ({ id, tier: notes[id] && Number.isFinite(notes[id].tier) ? notes[id].tier : null, tag: byId.get(id).gamer_tag }));
  const so = M.seedOrder(entrants, savedFor(pool.readState(src.tDir), slug));
  return { mode: so.mode, order: so.order };
}

// body: { mode: 'tiers' | 'arranged', order? } -> { mode, order (or null) }. Every id in `order` must
// be an entrant of the event in the live pull, at most once (both modes: the page sends the column it
// shows in tier mode too). An order that leaves entrants out is legal (they slot in by tier).
function checkSeeding(body, entrants) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad(400, 'The seed order must be an object: { mode, order }.');
  if (body.mode !== 'tiers' && body.mode !== 'arranged') throw bad(400, '"mode" must be "tiers" or "arranged".');
  if (body.mode === 'tiers' && body.order == null) return { mode: 'tiers', order: null };
  if (!Array.isArray(body.order) || body.order.length > MAX_ORDER) throw bad(400, '"order" must be a list of player ids.');
  const known = new Set(entrants);
  const seen = new Set();
  for (const raw of body.order) {
    if (typeof raw !== 'string' && typeof raw !== 'number') throw bad(400, '"order" must be a list of player ids.');
    const id = String(raw);
    if (!known.has(id)) throw bad(400, `Player ${id} is not an entrant of this event in the current pull.`);
    if (seen.has(id)) throw bad(400, `Player ${id} appears twice in the order.`);
    seen.add(id);
  }
  return { mode: body.mode, order: body.order.map(String) };
}
// Kept for callers of build D pass 1: the order to save (arranged) or null (tiers).
function checkBody(body, entrants) {
  const s = checkSeeding(body, entrants);
  return s.mode === 'arranged' ? s.order : null;
}

// Save one event's column state: arranged (its order) or tier order (forgets an arrangement).
// body: { mode, order?, base?, client?, seq? } (see the header for the rules). src: a tab.
// -> { mode, saved, rev, changed, ignored? }.
function setOrder(src, slug, body, { now = new Date() } = {}) {
  if (!src.events.includes(slug)) throw bad(404, 'That event is not seeded on this tab.');
  const s = checkSeeding(body, entrantsOf(data.loadRun(src).players, slug));
  const next = s.mode === 'arranged' ? s.order : null;
  const client = typeof body.client === 'string' && body.client ? body.client.slice(0, 64) : null;
  const seq = Number.isFinite(Number(body.seq)) && body.seq != null ? Number(body.seq) : null;
  let result;
  pool.updateState(src.tDir, (st) => {
    const cur = entryFor(st, slug);
    if (client && cur.by === client && seq != null && cur.seq != null && seq <= cur.seq) { result = { ...out(cur), changed: false, ignored: true }; return; }
    if (body.base != null && Number(body.base) !== cur.rev && cur.by !== client) {
      throw bad(409, 'The seed order of this event was changed in another window since this page loaded it. Nothing was saved; the page now shows that order.', { failure: 'seed-conflict', current: out(cur) });
    }
    const same = (cur.order == null && next == null) || (cur.order && next && cur.order.join(',') === next.join(','));
    if (same) {
      // Nothing to change; the page's write number is still recorded so an older copy stays ignored.
      if (client && seq != null && cur.by === client) st.seeding = { ...(st.seeding || {}), [slug]: { ...(st.seeding || {})[slug], seq } };
      result = { ...out(cur), changed: false };
      return;
    }
    const entry = { order: next, at: now.toISOString(), rev: cur.rev + 1, by: client, seq };
    st.seeding = { ...(st.seeding || {}), [slug]: entry };
    result = { ...out(entryFor(st, slug)), changed: true };
  });
  return result;
}

module.exports = { entryFor, savedFor, entrantsOf, forTab, columnOrder, checkSeeding, checkBody, setOrder, MAX_ORDER };
