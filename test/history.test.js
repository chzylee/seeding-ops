'use strict';
// Window filter, team split, region capture, status rule, and row shaping.
const { test } = require('node:test');
const assert = require('node:assert');
const h = require('../lib/history');
const entrantsFx = require('./fixtures/entrants-page.json');
const userEventsFx = require('./fixtures/user-events-page.json');
const standingsFx = require('./fixtures/recent-standings.json');

const RUN_AT = Date.UTC(2026, 9, 12, 12, 0, 0); // 2026-10-12T12:00:00Z
const W = h.computeWindow(RUN_AT);
const sec = (ms) => ms / 1000;

test('window: [runAt - 730 days, runAt], both ends inclusive', () => {
  assert.strictEqual(W.endMs - W.startMs, 730 * 86_400_000);
  assert.ok(h.inWindow(sec(W.startMs), W), 'start edge in');
  assert.ok(h.inWindow(sec(W.endMs), W), 'end edge in');
  assert.ok(!h.inWindow(sec(W.startMs) - 1, W), 'one second before is out');
  assert.ok(!h.inWindow(sec(W.endMs) + 1, W), 'future is out');
  assert.ok(!h.inWindow(null, W), 'no date is out');
  assert.ok(!h.inWindow(undefined, W));
});

test('event_date is the UTC calendar date of startAt', () => {
  assert.strictEqual(h.isoDate(1767225600), '2026-01-01');
  assert.strictEqual(h.isoDate(null), '');
});

test('team split: each participant gets a row; team_entry marks multi-participant entrants', () => {
  const { players, counts } = h.splitRegistrants(entrantsFx.data.event.entrants.nodes);
  assert.deepStrictEqual(players.map((p) => p.player_id), ['501', '502', '503', '504']);
  assert.deepStrictEqual(players.map((p) => p.team_entry), [false, true, true, false]);
  assert.strictEqual(counts.participants, 4);
  assert.strictEqual(counts.team_entries_split, 1);
});

test('region: state and country from user.location; blank when hidden, empty, or no account', () => {
  const { players } = h.splitRegistrants(entrantsFx.data.event.entrants.nodes);
  const byId = Object.fromEntries(players.map((p) => [p.player_id, p]));
  assert.deepStrictEqual([byId['501'].region_state, byId['501'].region_country], ['IL', 'United States']);
  assert.deepStrictEqual([byId['502'].region_state, byId['502'].region_country], ['', '']); // location null
  assert.deepStrictEqual([byId['503'].region_state, byId['503'].region_country], ['', '']); // no account
  assert.deepStrictEqual([byId['504'].region_state, byId['504'].region_country], ['', 'Japan']);
  assert.strictEqual(byId['503'].user_slug, '');
  assert.strictEqual(byId['503'].user_id, '');
});

test('registrants: a repeated player is kept once and counted; a participant with no player is counted', () => {
  const nodes = [
    { id: 1, participants: [{ player: { id: 9, gamerTag: 'A', user: null } }] },
    { id: 2, participants: [{ player: { id: 9, gamerTag: 'A', user: null } }, { player: null }] },
  ];
  const { players, counts } = h.splitRegistrants(nodes);
  assert.strictEqual(players.length, 1);
  assert.strictEqual(players[0].team_entry, true);
  assert.deepStrictEqual(counts, { participants: 3, team_entries_split: 1, duplicate_player: 1, no_player: 1 });
});

test('user.events rows: window filter, skip counts, repeat events dropped, blank placement kept', () => {
  const player = { player_id: '7', gamer_tag: 'X' };
  const { rows, skipped } = h.rowsFromUserEvents(player, userEventsFx.data.user.events.nodes, W, 22);
  assert.deepStrictEqual(rows.map((r) => r.event_id), ['1001', '1002']);
  assert.deepStrictEqual(skipped, { out_of_window: 1, no_event_container: 0 });
  const [a, b] = rows;
  assert.strictEqual(a.placement, '5');
  assert.strictEqual(a.is_event_game, true);
  assert.strictEqual(b.placement, '');            // no standing
  assert.strictEqual(b.is_event_game, false);     // Melee
  assert.strictEqual(b.is_online, true);
  assert.strictEqual(a.event_date, '2026-01-01');
  assert.strictEqual(a.tournament_name, 'Tournament A');
  assert.strictEqual(a.num_entrants, '64');
});

test('recentStandings rows: non-Event containers counted as no_event_container', () => {
  const player = { player_id: '8', gamer_tag: 'G' };
  const { rows, skipped } = h.rowsFromStandings(player, [standingsFx.data.player.recentStandings], W, 22);
  assert.deepStrictEqual(rows.map((r) => r.event_id), ['2001']);
  assert.deepStrictEqual(skipped, { out_of_window: 1, no_event_container: 2 });
  assert.strictEqual(rows[0].placement, '4');
});

test('status rule: linked user -> complete, no user -> limited, failure -> failed', () => {
  assert.strictEqual(h.statusFor({ user_id: '1' }, 'ok'), 'complete');
  assert.strictEqual(h.statusFor({ user_id: '' }, 'ok'), 'limited');
  assert.strictEqual(h.statusFor({ user_id: '1' }, 'failed'), 'failed');
  assert.strictEqual(h.statusFor({ user_id: '' }, 'failed'), 'failed');
});
