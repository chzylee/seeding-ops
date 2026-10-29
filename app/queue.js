'use strict';
// app/queue.js — the app's one queue to start.gg (docs/design-tool.md, constraint 2: "One limiter,
// one queue, one request in flight for everything the app does against start.gg: pool pull, W-L,
// schedule pull, seed push"). Every start.gg call the app makes goes through createQueue's fetch:
//   - one request in flight: a request is sent only after the previous one's response has been
//     read to the end (the body is read inside the queue, so "in flight" includes the download);
//   - the app's rolling-window ceiling (app/limit-fetch.js, SEED_APP_MAX_PER_MIN, default 75/60 s)
//     under it, counting every send, retries included.
// Each caller gets its own fetch (fetchFor) so a job can record its own sends; they all share the
// queue. The clients above (lib/startgg createClient) still pace and retry as before; a client's
// backoff sleep happens outside the queue, so it never holds up the others.

const { limitFetch } = require('./limit-fetch');
const pacing = require('../lib/pacing');

function createQueue({ fetchImpl, max = pacing.MAX_REQUESTS, now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const base = fetchImpl || ((u, i) => globalThis.fetch(u, i));
  let active = null; // the caller whose request is being sent (one at a time)
  const limited = limitFetch(base, { max, now, sleep, onSend: (t) => { stats.sends++; if (active) active(t); } });
  const stats = { sends: 0, inFlight: 0, maxInFlight: 0 };
  let tail = Promise.resolve();

  function fetchFor(onSend = () => {}) {
    return (url, init) => {
      const go = async () => {
        active = onSend;
        stats.inFlight++;
        stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight);
        try {
          const res = await limited(url, init);
          const text = await res.text();
          return { status: res.status, ok: res.ok, headers: res.headers, text: async () => text };
        } finally {
          stats.inFlight--;
          active = null;
        }
      };
      const p = tail.then(go);
      tail = p.then(() => {}, () => {});
      return p;
    };
  }
  return { fetchFor, fetch: fetchFor(), stats, sentAt: limited.sentAt, max };
}

module.exports = { createQueue };
