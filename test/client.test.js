'use strict';
// The client: retries with backoff, stops at once on fatal kinds, paces every send, records
// complexity, and keeps the token out of everything it logs or throws.
const { test } = require('node:test');
const assert = require('node:assert');
const sgg = require('../lib/startgg');
const pacing = require('../lib/pacing');
const { virtualClock } = require('../testlib/fake-api');

const TOKEN = 'TOKEN-SENTINEL-c0ffee';

function scripted(responses) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, init });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (r === 'throw') throw new Error('socket hang up');
    const text = JSON.stringify(r.body);
    return { status: r.status, ok: r.status < 300, headers: { get: (k) => (r.headers || {})[k.toLowerCase()] ?? null }, text: async () => text };
  };
  f.calls = calls;
  return f;
}

const OK = { status: 200, body: { data: { ok: 1 }, extensions: { queryComplexity: 351 } } };

test('client: a 429 is retried with backoff, then succeeds (backoff exercised)', async () => {
  const clock = virtualClock(1_000_000);
  const slept = [];
  const log = [];
  const f = scripted([{ status: 429, body: { message: 'Rate limit exceeded - api-token' } }, OK]);
  const c = sgg.createClient({ token: TOKEN, fetchImpl: f, now: clock.now, sleep: async (ms) => { slept.push(ms); await clock.sleep(ms); }, onRequest: (r) => log.push(r) });
  const data = await c.request('Op', 'query Op { x }', {});
  assert.deepStrictEqual(data, { ok: 1 });
  assert.strictEqual(f.calls.length, 2);
  assert.deepStrictEqual(slept, [pacing.backoffMs(2)]);
  assert.strictEqual(log[0].kind, 'rate-limited');
  assert.strictEqual(log[0].retry_in_ms, 4000);
  assert.strictEqual(c.stats.retries, 1);
  assert.strictEqual(c.stats.complexityMax, 351);
});

test('client: 5xx and thrown requests retry up to 5 tries, then give up as exhausted', async () => {
  const clock = virtualClock(0);
  const f = scripted([{ status: 503, body: {} }, 'throw', { status: 502, body: {} }, { status: 500, body: {} }, { status: 503, body: {} }]);
  const c = sgg.createClient({ token: TOKEN, fetchImpl: f, now: clock.now, sleep: clock.sleep });
  await assert.rejects(c.request('Op', 'q', {}), (e) => e instanceof sgg.StartggError && e.exhausted === true && e.kind === 'server');
  assert.strictEqual(f.calls.length, 5);
});

test('client: a bad token is not retried', async () => {
  const fx = require('./fixtures/error-badtoken-400.json');
  const clock = virtualClock(0);
  const f = scripted([{ status: fx.httpStatus, body: fx.body }]);
  const c = sgg.createClient({ token: TOKEN, fetchImpl: f, now: clock.now, sleep: clock.sleep });
  await assert.rejects(c.request('Op', 'q', {}), (e) => e.kind === 'bad-token' && e.fatal === true && !e.exhausted);
  assert.strictEqual(f.calls.length, 1);
});

test('client: a schema error is not retried', async () => {
  const clock = virtualClock(0);
  const f = scripted([{ status: 200, body: { errors: [{ message: 'Cannot query field "nope" on type "User".' }] } }]);
  const c = sgg.createClient({ token: TOKEN, fetchImpl: f, now: clock.now, sleep: clock.sleep });
  await assert.rejects(c.request('Op', 'q', {}), (e) => e.kind === 'query');
  assert.strictEqual(f.calls.length, 1);
});

test('client: 200 sends in a burst are paced to <= 75 per rolling 60 s, retries included', async () => {
  const clock = virtualClock(0);
  const sends = [];
  let n = 0;
  const f = async () => {
    sends.push(clock.now());
    n++;
    const body = n % 10 === 0 ? { message: 'x' } : OK.body;
    const status = n % 10 === 0 ? 429 : 200;
    const text = JSON.stringify(body);
    return { status, ok: status < 300, headers: { get: () => null }, text: async () => text };
  };
  const c = sgg.createClient({ token: TOKEN, fetchImpl: f, now: clock.now, sleep: clock.sleep });
  for (let i = 0; i < 200; i++) await c.request('Op', 'q', {});
  assert.ok(sends.length > 200, 'retries happened');
  assert.ok(pacing.maxInAnyWindow(sends) <= 75, `max in window ${pacing.maxInAnyWindow(sends)}`);
});

test('client: pacing carries over from an earlier process (priorSends)', async () => {
  const clock = virtualClock(100_000);
  const prior = Array.from({ length: 75 }, (_, i) => 90_000 + i);
  const sends = [];
  const f = async () => { sends.push(clock.now()); const t = JSON.stringify(OK.body); return { status: 200, ok: true, headers: { get: () => null }, text: async () => t }; };
  const c = sgg.createClient({ token: TOKEN, fetchImpl: f, now: clock.now, sleep: clock.sleep, priorSends: prior });
  await c.request('Op', 'q', {});
  assert.ok(sends[0] >= 150_000, `first send waited for the window: ${sends[0]}`);
});

test('client: the token goes only into the Authorization header, never into logs or errors', async () => {
  const clock = virtualClock(0);
  const log = [];
  const f = scripted([{ status: 500, body: { message: 'boom' } }]);
  const c = sgg.createClient({ token: TOKEN, fetchImpl: f, now: clock.now, sleep: clock.sleep, onRequest: (r) => log.push(r) });
  let err;
  try { await c.request('Op', 'q', { a: 1 }); } catch (e) { err = e; }
  assert.strictEqual(f.calls[0].init.headers.Authorization, 'Bearer ' + TOKEN);
  assert.ok(!JSON.stringify(log).includes(TOKEN));
  assert.ok(!String(err.message).includes(TOKEN) && !String(err.stack).includes(TOKEN));
  assert.ok(!JSON.stringify(err).includes(TOKEN));
});

test('fetchEntrants pages to totalPages', async () => {
  const clock = virtualClock(0);
  const seen = [];
  const f = async (url, init) => {
    const v = JSON.parse(init.body).variables;
    seen.push(v.page);
    const body = { data: { event: { entrants: { pageInfo: { total: 250, totalPages: 3 }, nodes: [{ id: v.page, participants: [] }] } } } };
    const t = JSON.stringify(body);
    return { status: 200, ok: true, headers: { get: () => null }, text: async () => t };
  };
  const c = sgg.createClient({ token: TOKEN, fetchImpl: f, now: clock.now, sleep: clock.sleep });
  const nodes = await sgg.fetchEntrants(c, 1);
  assert.deepStrictEqual(seen, [1, 2, 3]);
  assert.deepStrictEqual(nodes.map((n) => n.id), [1, 2, 3]);
});

test('queries never request city, and the registrant query asks for state and country', () => {
  for (const q of [sgg.Q_EVENT, sgg.Q_ENTRANTS, sgg.Q_USER_EVENTS, sgg.Q_RECENT_STANDINGS, sgg.Q_RECENT_STANDINGS_ANY_GAME]) {
    assert.ok(!/\bcity\b/i.test(q));
  }
  assert.match(sgg.Q_ENTRANTS, /location\s*\{\s*state\s+country\s*\}/);
});

test('page size: user.events perPage stays under 1000 at the probe-measured cost (351 / 50)', () => {
  const perNode = 351 / 50;
  assert.ok(sgg.USER_EVENTS_PER_PAGE * perNode < 1000, `${sgg.USER_EVENTS_PER_PAGE * perNode}`);
});
