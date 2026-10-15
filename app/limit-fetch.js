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
    });
    gate = mine.catch(() => {});
    return mine;
  };
  const limited = async (url, init) => {
    await reserve();
    return fetchImpl(url, init);
  };
  limited.sentAt = sentAt;
  return limited;
}

module.exports = { limitFetch };
