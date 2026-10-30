'use strict';
// app/limit-fetch.js — a ceiling on HTTP sends per rolling window, wrapped around fetch.
// lib/startgg's client already paces at 75 per 60 s (start.gg allows 80 per token). The app adds
// this so its share can be set lower when something else is using the same token at the same
// time (SEED_APP_MAX_PER_MIN). It counts every send, retries included, across the pull and the
// W-L fetch, because it sits under both.

const pacing = require('../lib/pacing');

function limitFetch(fetchImpl, { max = pacing.MAX_REQUESTS, windowMs = pacing.WINDOW_MS, now = Date.now,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)), onSend = () => {} } = {}) {
  const sentAt = [];
  let gate = Promise.resolve();
  // Slots are handed out one caller at a time (the gate), so concurrent callers can't both see
  // room for one more send.
  const reserve = () => {
    const mine = gate.then(async () => {
      for (;;) {
        const wait = pacing.delayBeforeNext(sentAt, now(), max, windowMs);
        if (wait <= 0) break;
        await sleep(wait);
      }
      const t = now();
      sentAt.push(t);
      while (sentAt.length > max * 2) sentAt.shift();
      onSend(t);
      return t;
    });
    gate = mine.catch(() => {});
    return mine;
  };
  // D2-3: a caller that asks for a timeout (init.timeoutMs, lib/startgg's client) gets it armed
  // here, at the send, after the wait for a slot; a wait never eats into the request's own time.
  // If the fetch underneath also holds calls (timeoutAtSend), it arms the timeout itself.
  const arm = (init) => {
    if (!init || init.timeoutMs == null || fetchImpl.timeoutAtSend) return init;
    const { timeoutMs, ...rest } = init;
    return { ...rest, signal: AbortSignal.timeout(timeoutMs) };
  };
  // E2-1 (build C pass 2): a caller that asks for the send time (init.onSent, lib/startgg's client)
  // is told it here, so its request log carries the time the request was sent, not queued. If the
  // fetch underneath also holds calls, it reports the later, real send itself.
  const report = (init, t) => {
    if (!init || typeof init.onSent !== 'function' || fetchImpl.timeoutAtSend) return init;
    const { onSent, ...rest } = init;
    onSent(t);
    return rest;
  };
  const limited = async (url, init) => {
    const t = await reserve();
    return fetchImpl(url, arm(report(init, t)));
  };
  limited.timeoutAtSend = true;
  limited.sentAt = sentAt;
  return limited;
}

module.exports = { limitFetch };
