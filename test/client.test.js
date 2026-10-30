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

// A2-2 (usage-log.md 2026-10-15): start.gg's server-time-budget error, hit live under heavy
// batched fetching, needed a long wait and more tries than the general schedule gives 5xx/network
// failures. classifyError gives it its own kind, 'time-budget' (test/classify.test.js), and this
// checks the client actually paces and retries it that way end to end: a flat 90 s wait per try,
// up to 8 tries, and recovery (no lost work) once start.gg stops objecting.
const BUDGET_TEXT = 'You have gone over the threshold for recent request time. Please wait before sending another request.';
const BUDGET_GQL_ERROR = { status: 200, body: { errors: [{ message: BUDGET_TEXT }] } };

test('client: the server-time-budget error retries at a flat 90 s, up to 8 tries, and recovers once it clears (no lost work)', async () => {
  const clock = virtualClock(0);
  const slept = [];
  const log = [];
  // Fails with the live budget error 3 times, then succeeds — well under the 8-try ceiling.
  const f = scripted([BUDGET_GQL_ERROR, BUDGET_GQL_ERROR, BUDGET_GQL_ERROR, OK]);
  const c = sgg.createClient({ token: TOKEN, fetchImpl: f, now: clock.now, sleep: async (ms) => { slept.push(ms); await clock.sleep(ms); }, onRequest: (r) => log.push(r) });
  const data = await c.request('Op', 'query Op { x }', {});
  assert.deepStrictEqual(data, { ok: 1 });
  assert.strictEqual(f.calls.length, 4);
  assert.deepStrictEqual(slept, [90_000, 90_000, 90_000], 'a flat 90 s wait each retry, not exponential');
  assert.ok(log.slice(0, 3).every((r) => r.kind === 'time-budget'));
  assert.strictEqual(c.stats.retries, 3);
});

test('client: the server-time-budget error gives up only after 8 tries (never fewer, matching the live workaround)', async () => {
  const clock = virtualClock(0);
  const slept = [];
  const f = scripted([BUDGET_GQL_ERROR]); // every attempt repeats the same budget error
  const c = sgg.createClient({ token: TOKEN, fetchImpl: f, now: clock.now, sleep: async (ms) => { slept.push(ms); await clock.sleep(ms); } });
  await assert.rejects(c.request('Op', 'q', {}), (e) => e instanceof sgg.StartggError && e.kind === 'time-budget' && e.exhausted === true
    && /gave up after 8 tries/.test(e.message));
  assert.strictEqual(f.calls.length, 8, 'the full ~8-try ceiling, not the general 5');
  assert.strictEqual(slept.length, 7, 'one 90 s wait between each of the 8 tries');
  assert.ok(slept.every((ms) => ms === 90_000));
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

// D2-3 (build-record-tool.md, build B pass 2): the client's timeout counts from the moment the
// request is SENT, not from when the client asked the queue for a slot. A fake that honors
// AbortSignal the way real fetch does (aborted before the call: refused at once; aborted during
// the response: the body read fails), real timers, a short timeout.
function signalFetch({ delayMs, hang = () => false }) {
  const log = { sends: 0, refusedAborted: 0, abortedInFlight: 0 };
  const f = (url, init) => new Promise((resolve, reject) => {
    const sig = init.signal;
    if (!sig) return reject(new Error('the send carried no timeout signal'));
    if (sig.aborted) { log.refusedAborted++; return reject(sig.reason); }
    log.sends++;
    const timer = hang(log.sends) ? null : setTimeout(() => {
      sig.removeEventListener('abort', onAbort);
      const text = JSON.stringify({ data: { ok: log.sends } });
      resolve({ status: 200, ok: true, headers: { get: () => null }, text: async () => text });
    }, delayMs);
    function onAbort() { if (timer) clearTimeout(timer); log.abortedInFlight++; reject(sig.reason); }
    sig.addEventListener('abort', onAbort, { once: true });
  });
  f.log = log;
  return f;
}

test('D2-3: through the app queue, the timeout starts at the send: a request queued behind slow ones is not cancelled, and a send that hangs still times out', async () => {
  const { createQueue } = require('../app/queue');
  // Three callers at once, each send taking 120 ms, a 200 ms timeout: the third waits 240 ms in the
  // queue. Timed from the client's call (the old behavior) it would be refused before it was sent.
  const fake = signalFetch({ delayMs: 120 });
  const queue = createQueue({ fetchImpl: fake });
  const slept = [];
  const mk = () => sgg.createClient({ token: TOKEN, fetchImpl: queue.fetchFor(), timeoutMs: 200, sleep: async (ms) => { slept.push(ms); } });
  const clients = [mk(), mk(), mk()];
  const got = await Promise.all(clients.map((c) => c.request('Op', 'query Op { x }', {})));
  assert.deepStrictEqual(got.map((d) => d.ok).sort(), [1, 2, 3]);
  assert.deepStrictEqual(fake.log, { sends: 3, refusedAborted: 0, abortedInFlight: 0 }, 'no request was cancelled while it waited');
  assert.deepStrictEqual(clients.map((c) => c.stats.retries), [0, 0, 0]);
  assert.deepStrictEqual(slept, []);
  assert.strictEqual(queue.stats.sends, 3);

  // The timeout still bounds the send itself: a send that never answers is aborted after ~timeoutMs.
  const hung = signalFetch({ delayMs: 10, hang: (n) => n === 1 });
  const q2 = createQueue({ fetchImpl: hung });
  const c = sgg.createClient({ token: TOKEN, fetchImpl: q2.fetchFor(), timeoutMs: 80, sleep: async () => {} });
  const t0 = Date.now();
  await assert.rejects(c.request('Op', 'query Op { x }', {}, {}, { retry: false }), (e) => e.kind === 'network');
  assert.ok(Date.now() - t0 >= 70, 'aborted by the timeout, not at once');
  assert.deepStrictEqual(hung.log, { sends: 1, refusedAborted: 0, abortedInFlight: 1 });
});

test('D2-3: without a queue the client arms the timeout itself; app/limit-fetch arms it at the send after its wait', async () => {
  const seen = [];
  const plain = async (u, init) => { seen.push({ signal: !!init.signal, timeoutMs: init.timeoutMs }); return { status: 200, ok: true, headers: { get: () => null }, text: async () => '{"data":{}}' }; };
  await sgg.createClient({ token: TOKEN, fetchImpl: plain }).request('Op', 'query Op { x }', {});
  assert.deepStrictEqual(seen.pop(), { signal: true, timeoutMs: undefined });
  const { limitFetch } = require('../app/limit-fetch');
  const clock = virtualClock(0);
  const limited = limitFetch(plain, { max: 1, windowMs: 60_000, now: clock.now, sleep: clock.sleep });
  assert.strictEqual(limited.timeoutAtSend, true);
  const c = sgg.createClient({ token: TOKEN, fetchImpl: limited, now: clock.now, sleep: clock.sleep });
  await c.request('Op', 'query Op { x }', {});
  await c.request('Op', 'query Op { x }', {}); // waits 60 s (virtual) for the limiter's slot
  assert.deepStrictEqual(seen, [{ signal: true, timeoutMs: undefined }, { signal: true, timeoutMs: undefined }], 'the send gets a signal and never the bare timeoutMs');
});

// E2-1 (build C pass 2): the request log is stamped at the SEND, so it can be read against the
// budget on its own. Before, the client stamped a request when it handed it to the queue, and a log
// showed 21 in a 60 s window where the queue had sent 20.
test('E2-1: through the app queue, each request record carries the time it was sent (queued_ms when it waited); the log alone stays under the ceiling', async () => {
  const { createQueue } = require('../app/queue');
  const START = 1_000_000;
  const clock = virtualClock(START);
  const plain = async () => ({ status: 200, ok: true, headers: { get: () => null }, text: async () => '{"data":{"ok":1}}' });
  const queue = createQueue({ fetchImpl: plain, max: 2, now: clock.now, sleep: clock.sleep });
  const records = [];
  const c = sgg.createClient({ token: TOKEN, fetchImpl: queue.fetchFor(), now: clock.now, sleep: clock.sleep, onRequest: (r) => records.push(r) });
  for (let i = 0; i < 3; i++) await c.request('Op', 'query Op { x }', {});
  assert.deepStrictEqual(records.map((r) => r.ms), queue.sentAt, 'the log\'s times are the queue\'s send times');
  assert.deepStrictEqual(records.slice(0, 2).map((r) => r.ms), [START, START]);
  assert.ok(records[2].ms >= START + 60_000, 'the third was held for the window: ' + records[2].ms);
  assert.deepStrictEqual(records.map((r) => r.queued_ms), [undefined, undefined, START], 'the held request keeps when it was queued');
  assert.strictEqual(records[2].t, new Date(records[2].ms).toISOString());
  assert.strictEqual(pacing.maxInAnyWindow(records.map((r) => r.ms)), 2);
  // Without a queue nothing changes: the send is the call.
  const direct = [];
  await sgg.createClient({ token: TOKEN, fetchImpl: plain, now: clock.now, sleep: clock.sleep, onRequest: (r) => direct.push(r) }).request('Op', 'query Op { x }', {});
  assert.deepStrictEqual([direct[0].ms, direct[0].queued_ms], [clock.now(), undefined]);
});
