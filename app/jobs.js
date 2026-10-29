'use strict';
// app/jobs.js — the app's background work against start.gg, per tournament (docs/design-tool.md,
// T2, T3 and Lifecycle). Every request goes through the one queue (app/queue.js): one request in
// flight, one rolling-window ceiling, for the pool pull, the W-L, the schedule pull and the archive.
//
//   pull      Refresh (mode full: every seeded event's registrants and every player's results) or a
//             newly ticked event (mode incremental: only players not yet in the pool). lib/run.js
//             writes out/<t>/pull-<stamp>/ beside the live pull and swaps `current` when it is done;
//             an unfinished pull of the same seeded events is resumed instead of restarted. Then the
//             W-L still missing from out/<t>/set-records.json is fetched, summary-first, where
//             "summary" is the union of every tab's summary columns. A reload during the W-L shows
//             what has been fetched so far (liveRecords).
//   archive   Archive standings: one standings fetch per seeded event into out/<t>/standings.json,
//             then state.json `archived`.
//   schedule  T3: out/<t>/schedule.json (lib/schedule-pull.js).
// One pull or archive at a time per server (start.gg's limit is per token); a schedule pull may run
// beside it, its requests queued with the others. A pull asked for while another job runs (a newly
// ticked event, D2-1) waits in `waiting` and starts when the running job ends; one entry per
// tournament, a full pull outranking an incremental one.

const fs = require('node:fs');
const path = require('node:path');
const { run: runPull } = require('../lib/run');
const sgg = require('../lib/startgg');
const out = require('../lib/output');
const pool = require('../lib/pool');
const wl = require('../lib/wl');
const data = require('../lib/view/data');
const M = require('../lib/view/model');
const { pullSchedule } = require('../lib/schedule-pull');

function lineSink(onLine) {
  let buf = '';
  return { write(s) { buf += String(s); let i; while ((i = buf.indexOf('\n')) >= 0) { onLine(buf.slice(0, i)); buf = buf.slice(i + 1); } return true; } };
}
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

class Jobs {
  // opts: outRoot, getToken() -> string, queue (app/queue.js), now, sleep, pull (lib/run.run)
  constructor(opts) {
    this.opts = opts;
    this.current = null;        // the running pull or archive job, or null
    this.last = new Map();      // t -> the most recent pull/archive job
    this.schedules = new Map(); // t -> the most recent schedule job
    this.waiting = [];          // pulls queued behind the running job: [{ t, mode, at }]
  }

  now() { return (this.opts.now || Date.now)(); }
  tDir(t) { return pool.tournamentDir(this.opts.outRoot, t); }

  begin(t, kind, extra) {
    if (this.current) return { started: false, job: this.current };
    const job = {
      t, kind, phase: kind === 'pull' ? 'pulling' : kind, message: 'Starting…', error: null,
      startedAt: new Date(this.now()).toISOString(), finishedAt: null, pullDir: null, cache: null, sends: [],
      wl: { done: 0, total: 0, summaryDone: 0, summaryTotal: 0, noUser: 0 }, requests: 0, ...extra,
    };
    this.current = job;
    this.last.set(t, job);
    const exec = kind === 'pull' ? this.executePull(job) : this.executeArchive(job);
    job.promise = exec.catch((err) => {
      job.phase = 'error';
      job.error = (err && err.message) || String(err);
    }).finally(() => {
      job.finishedAt = new Date(this.now()).toISOString();
      if (job.cache) { try { wl.savePoolCache(this.tDir(t), job.cache); } catch { /* reported by the error above */ } }
      if (job.pullDir && fs.existsSync(path.join(job.pullDir, out.WORK_DIR))) {
        try {
          fs.writeFileSync(path.join(job.pullDir, out.WORK_DIR, 'refresh-sends.json'),
            JSON.stringify({ max_per_60s: this.opts.queue.max, requests: job.sends.length, sent_at_ms: job.sends }) + '\n');
        } catch { /* the pull itself is intact without this record */ }
      }
      job.cache = null;
      this.current = null;
      this.startNext();
    });
    return { started: true, job };
  }

  // D2-1: start the pull, or queue it behind the running job. Returns { started, queued, behind }.
  queuePull(t, { mode = 'incremental' } = {}) {
    const r = this.startPull(t, { mode });
    if (r.started) return { started: true, queued: false, job: r.job };
    const had = this.waiting.find((w) => w.t === t);
    if (had) { if (mode === 'full') had.mode = 'full'; } else this.waiting.push({ t, mode, at: new Date(this.now()).toISOString() });
    return { started: false, queued: true, behind: r.job ? r.job.t : null };
  }

  startNext() {
    while (!this.current && this.waiting.length) {
      const w = this.waiting.shift();
      if (!pool.readState(this.tDir(w.t))) continue; // deleted while it waited
      this.begin(w.t, 'pull', { mode: w.mode, queuedAt: w.at });
    }
  }

  // Resolves when no job runs and none waits (tests, and a clean shutdown).
  async idle() {
    while (this.current) await this.current.promise;
  }

  startPull(t, { mode = 'full' } = {}) { return this.begin(t, 'pull', { mode }); }
  startArchive(t) { return this.begin(t, 'archive'); }

  startSchedule(t, { seedsOnly = false } = {}) {
    const cur = this.schedules.get(t);
    if (cur && cur.running) return { started: false, job: cur };
    const job = { t, running: true, kind: seedsOnly ? 'seeds' : 'full', error: null, startedAt: new Date(this.now()).toISOString(), finishedAt: null };
    this.schedules.set(t, job);
    job.promise = Promise.resolve()
      .then(() => {
        const token = this.opts.getToken();
        if (!token) throw new Error('No start.gg token. Paste it after STARTGG_TOKEN= in the .env file and restart the app.');
        return (this.opts.pullSchedule || pullSchedule)({ slug: t, token, seedsOnly, outRoot: this.opts.outRoot,
          fetchImpl: this.opts.queue.fetchFor(), now: this.opts.now, sleep: this.opts.sleep });
      })
      .catch((err) => { job.error = (err && err.message) || String(err); })
      .finally(() => { job.running = false; job.finishedAt = new Date(this.now()).toISOString(); });
    return { started: true, job };
  }

  busyWith(t) {
    const s = this.schedules.get(t);
    return (this.current && this.current.t === t) || (s && s.running);
  }

  // The W-L cache the data endpoint should use for a tournament: the running job's, if it is that one.
  liveRecords(t) {
    const j = this.current;
    return j && j.cache && j.t === t ? j.cache : null;
  }

  status(t) {
    const job = this.current && this.current.t === t ? this.current : this.last.get(t) || null;
    const running = !!(job && job === this.current);
    const cur = (() => { try { return pool.currentPull(this.tDir(t)); } catch { return null; } })();
    const s = this.schedules.get(t);
    return {
      pulling: running && job.phase === 'pulling',
      running,
      kind: job ? job.kind : null,
      phase: job ? job.phase : null,
      message: job ? job.message : null,
      wl: job && job.kind === 'pull' ? { done: job.wl.done, total: job.wl.total, summaryDone: job.wl.summaryDone, summaryTotal: job.wl.summaryTotal } : null,
      lastRunAt: cur ? cur.meta.run_at : null,
      run: cur ? cur.name : null,
      error: job ? job.error : null,
      busy: this.current && this.current.t !== t ? this.current.t : null,
      queued: this.waiting.some((w) => w.t === t),
      startedAt: job ? job.startedAt : null,
      finishedAt: job ? job.finishedAt : null,
      schedule: s ? { running: s.running, kind: s.kind, error: s.error, startedAt: s.startedAt, finishedAt: s.finishedAt } : { running: false, error: null },
    };
  }

  client(job, token, onRequest) {
    return sgg.createClient({ token, fetchImpl: this.opts.queue.fetchFor((t) => { job.requests++; job.sends.push(t); }), now: this.opts.now, sleep: this.opts.sleep, onRequest });
  }

  async executePull(job) {
    const { outRoot } = this.opts;
    const token = this.opts.getToken();
    if (!token) throw new Error('No start.gg token. Paste it after STARTGG_TOKEN= in the .env file and restart the app.');
    const tDir = this.tDir(job.t);
    const state = pool.readState(tDir);
    if (!state) throw new Error('This tournament has not been added.');
    const ticked = state.ticked || [];
    if (!ticked.length) throw new Error('Tick at least one event to seed first.');
    const fetchImpl = this.opts.queue.fetchFor((t) => { job.requests++; job.sends.push(t); });

    // 1. The pull. An unfinished pull of the same seeded events (or a finished one never swapped in)
    // is resumed: its checkpointed players are not fetched again.
    const live = out.readCurrent(tDir);
    const open = out.listPulls(tDir).find((p) => p.name !== live && p.resumable
      && (!live || p.name.localeCompare(live, undefined, { numeric: true }) > 0)
      && (() => { try { return sameSet((out.loadRunState(p.dir).events || []).map((e) => e.slug), ticked); } catch { return false; } })());
    let lastLine = '';
    const stderr = lineSink((l) => { if (l.trim()) { lastLine = l; job.message = l; } });
    const report = {};
    const args = open ? { resumeDir: open.dir } : { tournament: job.t, events: ticked, mode: job.mode };
    if (open) job.message = `Resuming ${open.name}`;
    const code = await (this.opts.pull || runPull)({ ...args, token, outRoot, fetchImpl, now: this.opts.now, sleep: this.opts.sleep,
      stderr, stdout: lineSink(() => {}), report });
    job.pullDir = report.pullDir || null;
    if (!report.swap) {
      throw new Error(`The pull did not finish (exit ${code}): ${lastLine || 'no output'}. The page still shows the previous pull.`);
    }
    // D2-7: the new pull is live even if the old folder could not be deleted; say so and go on.
    job.leftover = (report.swap.leftover || []).map((l) => l.name);

    // 2. W-L for whatever is still missing, summary-first across every tab.
    job.phase = 'wl';
    job.message = 'Fetching W-L';
    const cache = wl.loadPoolCache(tDir);
    job.cache = cache;
    const cur = pool.currentPull(tDir);
    const tabs = pool.tabsOf(pool.readState(tDir) || state, cur.meta);
    const summary = [], rest = [];
    const seen = new Set();
    let players = [];
    for (const tab of tabs) {
      const src = data.tabSource(outRoot, job.t, tab.game.id);
      if (!src) continue;
      const r = data.loadRun(src);
      players = players.concat(r.players);
      for (const row of r.fetchRows) (r.inSummary(row) ? summary : rest).push(row);
    }
    const ordered = [...summary, ...rest].filter((row) => { const k = M.key(row); if (seen.has(k)) return false; seen.add(k); return true; });
    const summaryKeys = new Set(summary.map(M.key));
    const logFile = path.join(cur.dir, out.WORK_DIR, 'wl-requests.jsonl');
    const client = this.client(job, token, (rec) => fs.appendFileSync(logFile, JSON.stringify(rec) + '\n'));
    const setWl = (p) => { job.wl = { done: p.done, total: p.total, summaryDone: p.summaryDone, summaryTotal: p.summaryTotal, noUser: p.noUser }; };
    await wl.fetchSetRecords({
      client, players, rows: ordered, cache, isSummary: (row) => summaryKeys.has(M.key(row)),
      onChunk: (p) => { setWl(p); wl.savePoolCache(tDir, cache); },
    }).then(setWl);
    wl.savePoolCache(tDir, cache);
    job.phase = 'done';
    job.message = `Done: ${job.wl.done} W-L fetched, ${Object.keys(cache).length} cached` + (code === 1 ? '; some players failed (see the pull\'s meta.json)' : '')
      + (job.leftover.length ? `; the old pull folder ${job.leftover.join(', ')} could not be deleted yet (the next pull deletes it)` : '');
  }

  async executeArchive(job) {
    const token = this.opts.getToken();
    if (!token) throw new Error('No start.gg token. Paste it after STARTGG_TOKEN= in the .env file and restart the app.');
    const tDir = this.tDir(job.t);
    const state = pool.readState(tDir);
    const cur = pool.currentPull(tDir);
    const events = pool.tickedEvents(state, cur && cur.meta);
    if (!events.length) throw new Error('No seeded events to archive.');
    const client = this.client(job, token);
    const archive = { fetched_at: new Date(this.now()).toISOString(), events: {} };
    for (const e of events) {
      job.message = `Standings: ${e.name}`;
      const nodes = await sgg.fetchEventStandings(client, e.id);
      archive.events[e.slug] = {
        name: e.name, game: e.game,
        standings: nodes.map((n) => ({
          placement: n.placement ?? null,
          entrant_id: n.entrant ? String(n.entrant.id) : null,
          name: n.entrant ? n.entrant.name : null,
          player_ids: n.entrant ? (n.entrant.participants || []).map((p) => p.player && p.player.id).filter((x) => x != null).map(String) : [],
        })),
      };
    }
    pool.writeJsonAtomic(path.join(tDir, 'standings.json'), archive);
    pool.updateState(tDir, (s) => { s.archived = archive.fetched_at; });
    job.phase = 'done';
    job.message = `Archived the standings of ${events.length} event(s).`;
  }
}

module.exports = { Jobs };
