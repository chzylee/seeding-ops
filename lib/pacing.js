'use strict';
// lib/pacing.js — the arithmetic behind request pacing and retry backoff. Pure: no clock,
// no timers. The client feeds it timestamps and attempt numbers and does the waiting itself.

// start.gg allows 80 requests per 60 s. The design caps us at 75 so a clock skew or an
// in-flight request never tips us over.
const MAX_REQUESTS = 75;
const WINDOW_MS = 60_000;

// Up to 5 tries per request (design: "exponential backoff, up to 5 tries per request").
// Tries 2..5 wait 4 s, 8 s, 16 s, 32 s: 60 s in total, one full rate-limit window.
const MAX_TRIES = 5;
const BACKOFF_BASE_MS = 4_000;

// start.gg's server-time-budget error ("You have gone over the threshold for recent request
// time. Please wait before sending another request.", usage-log.md 2026-10-15) is a different
// failure shape from the 80/min request-count limit (plain HTTP 429, classified 'rate-limited'
// and already paced/tested with the short exponential schedule below): it showed up after ~45
// heavy batched requests, well under the count cap, and 5 short exponential retries (topping out
// at 32 s) never cleared it. classifyError (lib/startgg.js) gives it its own kind,
// 'time-budget', specifically so it does not change the existing, working 429 schedule. The
// orchestrator's live workaround — 1 request in flight, a flat 90 s wait, up to ~8 tries — is
// carried here as 'time-budget's own schedule; every other retryable kind is unaffected.
const RATE_LIMIT_WAIT_MS = 90_000;
const RATE_LIMIT_MAX_TRIES = 8;
function maxTriesFor(kind) {
  return kind === 'time-budget' ? RATE_LIMIT_MAX_TRIES : MAX_TRIES;
}

// How long to wait before the next request may be sent so that no rolling window of
// `windowMs` holds more than `max` sends. `sentAt` is the send times (ms) of earlier requests,
// any order. Returns 0 when a request may go now.
function delayBeforeNext(sentAt, now, max = MAX_REQUESTS, windowMs = WINDOW_MS) {
  const recent = sentAt.filter((t) => t > now - windowMs).sort((a, b) => a - b);
  if (recent.length < max) return 0;
  // The oldest send that must fall out of the window before we may send again.
  const blocker = recent[recent.length - max];
  return Math.max(0, blocker + windowMs - now + 1);
}

// Wait before try number `tryNumber` (2..maxTriesFor(kind)). `retryAfterMs` honors a server hint.
// `kind` is the failure's classifyError kind; omitted (or anything but 'time-budget') keeps the
// plain exponential schedule, so every existing caller/test (including plain 429s) is unchanged.
function backoffMs(tryNumber, retryAfterMs = 0, kind) {
  if (kind === 'time-budget') return Math.max(RATE_LIMIT_WAIT_MS, retryAfterMs || 0);
  const exp = BACKOFF_BASE_MS * 2 ** Math.max(0, tryNumber - 2);
  return Math.max(exp, retryAfterMs || 0);
}

// Kinds from classifyError that are worth another try. Everything else stops the run.
const RETRYABLE = new Set(['rate-limited', 'server', 'network', 'time-budget']);
function isRetryable(kind) {
  return RETRYABLE.has(kind);
}

// The largest number of requests in any rolling window of `windowMs` over a list of send
// times. Used by the request-log checker (acceptance 6) and by tests.
function maxInAnyWindow(sentAt, windowMs = WINDOW_MS) {
  const t = [...sentAt].sort((a, b) => a - b);
  let best = 0;
  let lo = 0;
  for (let hi = 0; hi < t.length; hi++) {
    while (t[hi] - t[lo] >= windowMs) lo++;
    best = Math.max(best, hi - lo + 1);
  }
  return best;
}

module.exports = {
  MAX_REQUESTS, WINDOW_MS, MAX_TRIES, BACKOFF_BASE_MS, RATE_LIMIT_WAIT_MS, RATE_LIMIT_MAX_TRIES,
  delayBeforeNext, backoffMs, isRetryable, maxInAnyWindow, maxTriesFor,
};
