'use strict';
// parseEventSlug. Cases PORTED from startgg-results/tests/merge-startgg.test.js (SG-1, SG-2),
// which tested the same function copied from startgg-results/core.js:33.
const { test } = require('node:test');
const assert = require('node:assert');
const { parseEventSlug } = require('../lib/startgg');

test('slug: every URL variant yields the same slug (ported SG-1)', () => {
  const want = 'tournament/combo-breaker-2026/event/melty-blood-actress-again-current-code';
  const cases = [
    'https://www.start.gg/tournament/combo-breaker-2026/event/melty-blood-actress-again-current-code',
    'https://www.start.gg/tournament/combo-breaker-2026/event/melty-blood-actress-again-current-code/overview',
    'https://start.gg/tournament/combo-breaker-2026/event/melty-blood-actress-again-current-code/brackets/1528957/2044743',
    'www.start.gg/tournament/combo-breaker-2026/event/melty-blood-actress-again-current-code',
    '   https://www.start.gg/tournament/combo-breaker-2026/event/melty-blood-actress-again-current-code   ',
    'tournament/combo-breaker-2026/event/melty-blood-actress-again-current-code',
    'https://www.start.gg/tournament/combo-breaker-2026/event/melty-blood-actress-again-current-code?tab=standings',
  ];
  for (const c of cases) assert.deepStrictEqual(parseEventSlug(c), { slug: want }, `failed on: ${c}`);
});

test('slug: non-event inputs error rather than guessing (ported SG-2)', () => {
  const bad = [
    'https://www.start.gg/tournament/combo-breaker-2026',
    'https://www.start.gg/user/12345',
    'https://www.start.gg/tournament/combo-breaker-2026/details',
    '', '   ', 'just some garbage text', null, undefined,
  ];
  for (const c of bad) assert.deepStrictEqual(parseEventSlug(c), { error: 'not-an-event-url' }, `should error: ${c}`);
});
