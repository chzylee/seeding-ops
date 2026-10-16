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

// A2-2: the start.gg server-time-budget error ('time-budget', lib/startgg.js classifyError) gets
// its own schedule — a flat 90 s wait, not the exponential one, and up to 8 tries instead of 5 —
// because 5 short retries (topping out at 32 s) never cleared it live (usage-log.md 2026-10-15).
test('backoff: the time-budget kind waits a flat 90 s per try (not exponential), honoring a larger Retry-After', () => {
  for (const n of [2, 3, 4, 8]) assert.strictEqual(p.backoffMs(n, 0, 'time-budget'), 90_000);
  assert.strictEqual(p.backoffMs(2, 120_000, 'time-budget'), 120_000, 'a longer server hint still wins');
  assert.strictEqual(p.backoffMs(2, 20_000, 'time-budget'), 90_000, 'a shorter server hint does not shrink the floor');
  assert.strictEqual(p.RATE_LIMIT_WAIT_MS, 90_000);
});

test('maxTriesFor: time-budget gets ~8 tries; every other kind keeps the general 5', () => {
  assert.strictEqual(p.maxTriesFor('time-budget'), 8);
  assert.strictEqual(p.RATE_LIMIT_MAX_TRIES, 8);
  for (const k of ['rate-limited', 'server', 'network', undefined]) assert.strictEqual(p.maxTriesFor(k), 5);
});
