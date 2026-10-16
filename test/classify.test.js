'use strict';
// classifyError: retry classification. The bad-token cases are PORTED from
// startgg-results/tests/merge-startgg.test.js (SG-3..SG-7) and keep their meaning; the 5xx,
// schema and rate-limit-message cases are this tool's additions.
const { test } = require('node:test');
const assert = require('node:assert');
const { classifyError } = require('../lib/startgg');
const { isRetryable } = require('../lib/pacing');
const fx = require('./fixtures/error-badtoken-400.json');

test('classify: recorded HTTP 400 bad-token body -> bad-token, never keyed on 401 (ported SG-3, D-8)', () => {
  assert.strictEqual(classifyError({ httpStatus: fx.httpStatus, body: fx.body }), 'bad-token');
  assert.strictEqual(classifyError({ httpStatus: 400, body: { success: false } }), 'bad-token');
  assert.strictEqual(classifyError({ httpStatus: 400, body: { message: 'Invalid authentication token' } }), 'bad-token');
  assert.notStrictEqual(classifyError({ httpStatus: 401 }), 'bad-token');
  assert.strictEqual(classifyError({ httpStatus: 401, body: { success: false } }), 'bad-token');
});

test('classify: GraphQL 200 carrying an auth message -> bad-token (ported SG-6)', () => {
  assert.strictEqual(classifyError({ httpStatus: 200, graphqlErrors: [{ message: 'Unauthorized' }] }), 'bad-token');
  assert.strictEqual(classifyError({ httpStatus: 200, graphqlErrors: [{ message: 'Invalid token supplied' }] }), 'bad-token');
});

test('classify: 429 -> rate-limited, even when the message says "api-token" (ported SG-5 + guard)', () => {
  assert.strictEqual(classifyError({ httpStatus: 429, body: {} }), 'rate-limited');
  assert.strictEqual(classifyError({ httpStatus: 429, body: { success: false, message: 'Rate limit exceeded - api-token' } }), 'rate-limited');
  assert.strictEqual(classifyError({ httpStatus: 200, graphqlErrors: [{ message: 'Rate limit exceeded - api-token' }] }), 'rate-limited');
});

test('classify: 5xx -> server; a thrown request -> network (ported SG-7, split)', () => {
  assert.strictEqual(classifyError({ httpStatus: 500, body: { message: 'boom' } }), 'server');
  assert.strictEqual(classifyError({ httpStatus: 503 }), 'server');
  assert.strictEqual(classifyError({ threw: true }), 'network');
  assert.strictEqual(classifyError({}), 'network');
});

test('classify: schema/validation error (no path) -> query; execution error (path) -> server', () => {
  assert.strictEqual(classifyError({ httpStatus: 200, graphqlErrors: [{ message: 'Cannot query field "x" on type "Event".', locations: [{ line: 1, column: 3 }] }] }), 'query');
  assert.strictEqual(classifyError({ httpStatus: 200, graphqlErrors: [{ message: 'Your query complexity is too high.' }] }), 'query');
  assert.strictEqual(classifyError({ httpStatus: 200, graphqlErrors: [{ message: 'An unknown error has occurred', path: ['user', 'events'] }] }), 'server');
  assert.strictEqual(classifyError({ httpStatus: 400, body: { message: 'syntax error' } }), 'query');
});

test('classify: event:null at 200 -> event-not-found (ported SG-4)', () => {
  assert.strictEqual(classifyError({ httpStatus: 200, eventNull: true }), 'event-not-found');
});

test('retry rule: only rate-limited, server, network and time-budget are retried', () => {
  for (const k of ['rate-limited', 'server', 'network', 'time-budget']) assert.ok(isRetryable(k), k);
  for (const k of ['bad-token', 'query', 'event-not-found', 'missing']) assert.ok(!isRetryable(k), k);
});

// A2-2 (usage-log.md 2026-10-15, "Handle start.gg's server-time budget"): the live error text,
// "You have gone over the threshold for recent request time. Please wait before sending another
// request.", must classify as the retryable 'time-budget' kind (not 'query', not folded into the
// plain-429 'rate-limited' kind, which keeps its own short backoff — see pacing.test.js) in every
// shape start.gg is likely to send it, matching the auditor's A2-2 simulation exactly.
const BUDGET_TEXT = 'You have gone over the threshold for recent request time. Please wait before sending another request.';

test('classify: the start.gg server-time-budget message -> time-budget, not query or rate-limited, in every shape it can arrive in', () => {
  // A pre-execution GraphQL error with no `path` (validation/budget errors have none).
  assert.strictEqual(classifyError({ httpStatus: 200, graphqlErrors: [{ message: BUDGET_TEXT }] }), 'time-budget');
  // An HTTP 4xx body message (no GraphQL envelope at all).
  assert.strictEqual(classifyError({ httpStatus: 400, body: { message: BUDGET_TEXT } }), 'time-budget');
  // A GraphQL error that does carry a `path` (would otherwise read as 'server').
  assert.strictEqual(classifyError({ httpStatus: 200, graphqlErrors: [{ message: BUDGET_TEXT, path: ['event'] }] }), 'time-budget');
  assert.ok(isRetryable('time-budget'));
});

test('classify: a plain HTTP 429 still classifies rate-limited, not time-budget (the two stay distinct kinds)', () => {
  assert.strictEqual(classifyError({ httpStatus: 429, body: { message: 'Rate limit exceeded - api-token' } }), 'rate-limited');
});
