'use strict';
// Pacing arithmetic: the rolling 60 s window and the backoff schedule.
const { test } = require('node:test');
const assert = require('node:assert');
const p = require('../lib/pacing');

test('pacing: under the cap a request goes now', () => {
  const sent = Array.from({ length: 74 }, (_, i) => i * 10);
  assert.strictEqual(p.delayBeforeNext(sent, 1000), 0);
});

test('pacing: at 75 in the window, wait until the oldest one ages out', () => {
  const sent = Array.from({ length: 75 }, (_, i) => 1000 + i); // 1000..1074
  const d = p.delayBeforeNext(sent, 2000);
  assert.strictEqual(d, 1000 + 60_000 - 2000 + 1);
  assert.strictEqual(p.delayBeforeNext(sent, 2000 + d), 0);
});

test('pacing: sends older than 60 s do not count', () => {
  const sent = Array.from({ length: 200 }, (_, i) => i);
  assert.strictEqual(p.delayBeforeNext(sent, 70_000), 0);
});

test('pacing: 300 simulated sends never exceed 75 in any rolling 60 s window', () => {
  const sent = [];
  let now = 0;
  for (let i = 0; i < 300; i++) {
    now += p.delayBeforeNext(sent, now);
    sent.push(now);
    now += 50;
  }
  assert.ok(p.maxInAnyWindow(sent) <= 75, `max ${p.maxInAnyWindow(sent)}`);
});

test('pacing: maxInAnyWindow uses a rolling, not a fixed, window', () => {
  // 40 at 59.9 s and 40 at 60.1 s: a fixed minute splits them, a rolling window sees 80.
  const sent = [...Array(40).fill(59_900), ...Array(40).fill(60_100)];
  assert.strictEqual(p.maxInAnyWindow(sent), 80);
  assert.strictEqual(p.maxInAnyWindow([0, 60_000]), 1);
  assert.strictEqual(p.maxInAnyWindow([]), 0);
});

test('backoff: exponential 4, 8, 16, 32 s over 5 tries, honoring Retry-After', () => {
  assert.deepStrictEqual([2, 3, 4, 5].map((n) => p.backoffMs(n)), [4000, 8000, 16000, 32000]);
  assert.strictEqual(p.backoffMs(2, 20_000), 20_000);
  assert.strictEqual(p.MAX_TRIES, 5);
  assert.strictEqual(p.MAX_REQUESTS, 75);
});
