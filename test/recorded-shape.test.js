'use strict';
// Real start.gg responses (test/fixtures/recorded/, written by scripts/record-fixtures.js)
// through the same parsers the run uses. Skipped, with the reason printed, until recorded.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const h = require('../lib/history');

const DIR = path.join(__dirname, 'fixtures', 'recorded');
const load = (f) => (fs.existsSync(path.join(DIR, f)) ? JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')) : null);
const SKIP = 'not recorded yet: run node scripts/record-fixtures.js with a token in .env';
const W = h.computeWindow(Date.now());

const entrants = load('entrants-page.json');
test('recorded: entrants page splits into registrants with string ids and region fields', { skip: !entrants && SKIP }, () => {
  const { players, counts } = h.splitRegistrants(entrants.data.event.entrants.nodes);
  assert.ok(players.length > 0);
  assert.strictEqual(counts.participants, players.length + counts.duplicate_player + counts.no_player);
  for (const p of players) {
    assert.match(p.player_id, /^\d+$/);
    assert.strictEqual(typeof p.region_state, 'string');
    assert.strictEqual(typeof p.region_country, 'string');
  }
});

const userEvents = load('user-events-page.json');
test('recorded: user.events page yields well-formed result rows', { skip: !userEvents && SKIP }, () => {
  const nodes = userEvents.data.user.events.nodes;
  const { rows, skipped } = h.rowsFromUserEvents({ player_id: '1', gamer_tag: 'x' }, nodes, W, '0');
  assert.strictEqual(rows.length + skipped.out_of_window + skipped.no_event_container <= nodes.length, true);
  for (const r of rows) {
    assert.match(r.event_date, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(r.event_id, /^\d+$/);
    assert.match(r.placement, /^\d*$/);
  }
  assert.ok(typeof userEvents.extensions.queryComplexity === 'number');
});

const standings = load('recent-standings.json');
test('recorded: recentStandings yields rows or counted skips', { skip: !standings && SKIP }, () => {
  const list = standings.data.player.recentStandings || [];
  const { rows, skipped } = h.rowsFromStandings({ player_id: '1', gamer_tag: 'x' }, [list], W, '0');
  assert.ok(rows.length + skipped.out_of_window + skipped.no_event_container <= list.length);
});
