'use strict';
// app/jobs.js — the refresh job: re-pull one event with lib/run.js (a new run folder), carry the
// previous run's W-L cache and notes into it, then fetch the W-L still missing, summary-column
// results first. One job at a time per server: start.gg's limit is per token.
//
// The job runs in this process, in the background. Its in-memory W-L cache is what the data
// endpoint serves for that run while the fetch is going, and it is saved to
// <new run>/views/set-records.json after every batch.

const fs = require('node:fs');
const path = require('node:path');
const { run: runPull } = require('../lib/run');
const { createClient } = require('../lib/startgg');
const wl = require('../lib/wl');
const data = require('../lib/view/data');
const { limitFetch } = require('./limit-fetch');

function lineSink(onLine) {
  let buf = '';
  return { write(s) { buf += String(s); let i; while ((i = buf.indexOf('\n')) >= 0) { onLine(buf.slice(0, i)); buf = buf.slice(i + 1); } return true; } };
}

class Jobs {
  // opts: outRoot, getToken() -> string, fetchImpl, now, sleep, maxPerMinute, pull (lib/run.run)
  constructor(opts) {
    this.opts = opts;
    this.current = null;     // the running job, or null
    this.last = new Map();   // "t/e" -> the most recent job for that event
  }

  start(t, e) {
    if (this.current) return { started: false, job: this.current };
    const job = {
      slug: `${t}/${e}`, t, e, phase: 'pulling', message: 'Starting…', error: null,
      startedAt: new Date(this.now()).toISOString(), finishedAt: null, runDir: null, prevDir: null, cache: null,
      wl: { done: 0, total: 0, summaryDone: 0, summaryTotal: 0, noUser: 0 }, requests: 0,
    };
    this.current = job;
    this.last.set(job.slug, job);
    job.promise = this.execute(job).catch((err) => {
      job.phase = 'error';
      job.error = (err && err.message) || String(err);
    }).finally(() => {
      job.finishedAt = new Date(this.now()).toISOString();
      if (job.cache && job.runDir) { try { wl.saveCache(job.runDir, job.cache); } catch { /* reported below */ } }
      if (job.runDir) {
        try {
          fs.writeFileSync(path.join(job.runDir, 'views', 'refresh-sends.json'),
            JSON.stringify({ max_per_60s: this.opts.maxPerMinute, requests: job.sends.length, sent_at_ms: job.sends }) + '\n');
        } catch { /* the run itself is intact without this record */ }
      }
      job.cache = null;
      this.current = null;
    });
    return { started: true, job };
  }

  now() { return (this.opts.now || Date.now)(); }

  // The cache the data endpoint should use for a run folder: the running job's, if it is that run.
  liveRecords(dir) {
    const j = this.current;
    return j && j.cache && j.runDir && path.resolve(j.runDir) === path.resolve(dir) ? j.cache : null;
  }

  status(t, e) {
    const slug = `${t}/${e}`;
    const job = this.current && this.current.slug === slug ? this.current : this.last.get(slug) || null;
    const latest = data.latestFinished(this.opts.outRoot, t, e);
    const running = !!(job && job === this.current);
    return {
      pulling: running && job.phase === 'pulling',
      running,
      phase: job ? job.phase : null,
      message: job ? job.message : null,
      wl: job ? { done: job.wl.done, total: job.wl.total, summaryDone: job.wl.summaryDone, summaryTotal: job.wl.summaryTotal } : null,
      lastRunAt: latest ? latest.runAt : null,
      run: latest ? latest.name : null,
      error: job ? job.error : null,
      busy: this.current && this.current.slug !== slug ? this.current.slug : null,
      startedAt: job ? job.startedAt : null,
      finishedAt: job ? job.finishedAt : null,
    };
  }

  async execute(job) {
    const { outRoot } = this.opts;
    const token = this.opts.getToken();
    if (!token) throw new Error('No start.gg token. Paste it after STARTGG_TOKEN= in the .env file and restart the app.');
    const sleep = this.opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    const base = this.opts.fetchImpl || ((u, i) => globalThis.fetch(u, i));
    // Actual send times (after the limiter's wait). The request logs record when the client
    // decided to send, which can be earlier; this is the record of what reached start.gg.
    job.sends = [];
    const fetchImpl = limitFetch(base, { max: this.opts.maxPerMinute, now: () => this.now(), sleep, onSend: (t) => { job.requests++; job.sends.push(t); } });

    // 1. The pull: a fresh run folder, exactly as `node pull.js <url>` makes it.
    const prev = data.latestFinished(outRoot, job.t, job.e);
    job.prevDir = prev ? prev.dir : null;
    const before = new Set(data.listRuns(outRoot).map((r) => r.name));
    let lastLine = '';
    const stderr = lineSink((l) => { if (l.trim()) { lastLine = l; job.message = l; } });
    const code = await (this.opts.pull || runPull)({
      url: `https://www.start.gg/tournament/${job.t}/event/${job.e}`, token, outRoot, fetchImpl,
      now: this.opts.now, sleep: this.opts.sleep, stderr, stdout: lineSink(() => {}),
    });
    const fresh = data.listRuns(outRoot).filter((r) => r.t === job.t && r.e === job.e && !before.has(r.name));
    const made = fresh.find((r) => r.finished);
    if (!made) {
      throw new Error(`The pull did not finish (exit ${code}): ${lastLine || 'no output'}. The page still shows the previous run.`);
    }
    job.runDir = made.dir;

    // 2. Carry the previous run's W-L cache (and notes) into the new run.
    const cache = { ...(prev ? wl.loadCache(prev.dir) : {}), ...wl.loadCache(made.dir) };
    wl.saveCache(made.dir, cache);
    if (prev) {
      const from = path.join(prev.dir, 'views', 'notes.json'), to = path.join(made.dir, 'views', 'notes.json');
      if (fs.existsSync(from) && !fs.existsSync(to)) fs.copyFileSync(from, to);
    }
    job.cache = cache;

    // 3. W-L for whatever is still missing, summary-column results first.
    job.phase = 'wl';
    job.message = 'Fetching W-L';
    const run = data.loadRun(made.dir);
    const logFile = path.join(made.dir, 'views', 'wl-requests.jsonl');
    const client = createClient({
      token, fetchImpl, now: this.opts.now, sleep: this.opts.sleep,
      onRequest: (rec) => fs.appendFileSync(logFile, JSON.stringify(rec) + '\n'),
    });
    await wl.fetchSetRecords({
      client, players: run.players, rows: run.fetchRows, cache, isSummary: run.inSummary,
      onChunk: (p) => {
        job.wl = { done: p.done, total: p.total, summaryDone: p.summaryDone, summaryTotal: p.summaryTotal, noUser: p.noUser };
        wl.saveCache(made.dir, cache);
      },
    }).then((p) => { job.wl = { done: p.done, total: p.total, summaryDone: p.summaryDone, summaryTotal: p.summaryTotal, noUser: p.noUser }; });
    wl.saveCache(made.dir, cache);
    job.phase = 'done';
    job.message = `Done: ${job.wl.done} W-L fetched, ${Object.keys(cache).length} cached`;
  }
}

module.exports = { Jobs };
