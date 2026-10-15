#!/usr/bin/env node
'use strict';
// app/server.js — the seeding app: one stable page per event that always shows the latest pull,
// with pin, compare and refresh. Node built-ins only. Bound to 127.0.0.1.
//   npm run app            (or double-click app.cmd, which also opens the browser)
//   node app/server.js [--port 8765] [--out <folder>] [--open]
// Routes:
//   GET  /                          events, one per event slug, each with its latest finished run
//   GET  /e/<t>/<e>                 the app page (stable URL; a reload shows the newest data)
//   GET  /api/e/<t>/<e>/data        the view model, computed at request time
//   POST /api/e/<t>/<e>/refresh     re-pull + W-L in the background; 202, or 409 if a job runs
//   GET  /api/e/<t>/<e>/status      { pulling, wl: {done,total,summaryDone,summaryTotal}, lastRunAt, error, ... }
//   GET  /static/<file>             the page's JS/CSS (a fixed list; nothing else is served)
// Env: SEED_APP_MAX_PER_MIN caps the app's start.gg requests per rolling 60 s (default 75, the
// pull's own pace). PORT overrides the port.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { loadToken } = require('../lib/token');
const pacing = require('../lib/pacing');
const data = require('../lib/view/data');
const { Jobs } = require('./jobs');

const ROOT = path.join(__dirname, '..');
const DEFAULT_PORT = 8765;
const HOST = '127.0.0.1';

// The only files served besides the API. Anything else is 404.
const STATIC = {
  'model.js': [path.join(ROOT, 'lib', 'view', 'model.js'), 'text/javascript; charset=utf-8'],
  'render.js': [path.join(ROOT, 'lib', 'view', 'render.js'), 'text/javascript; charset=utf-8'],
  'app.js': [path.join(__dirname, 'public', 'app.js'), 'text/javascript; charset=utf-8'],
  'app.css': [path.join(__dirname, 'public', 'app.css'), 'text/css; charset=utf-8'],
};
const PAGE = path.join(__dirname, 'public', 'event.html');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function send(res, status, body, type = 'text/plain; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(body);
}
const json = (res, status, obj) => send(res, status, JSON.stringify(obj), 'application/json; charset=utf-8');
const notFound = (res) => send(res, 404, 'Not found');

function indexPage(outRoot, jobs) {
  const events = data.listEvents(outRoot);
  const items = events.map((ev) => {
    const m = ev.latest && ev.latest.meta;
    const st = jobs.status(ev.t, ev.e);
    const title = m ? `${esc(m.event.tournament_name)} · ${esc(m.event.name)}` : `${esc(ev.t)} · ${esc(ev.e)}`;
    const sub = m ? `${esc(m.game ? m.game.name : '?')} · ${m.registrant_count} registrants · pulled ${esc(m.run_at.slice(0, 16).replace('T', ' '))} UTC`
      : 'no finished pull yet';
    const live = st.running ? ` <span class="busy">${st.pulling ? 'pulling…' : 'fetching W-L…'}</span>` : '';
    return `<li>${m ? `<a href="/e/${esc(ev.t)}/${esc(ev.e)}">${title}</a>` : title}${live}<div class="dim">${sub}</div></li>`;
  }).join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Seeding events</title><link rel="stylesheet" href="/static/app.css">
<body class="index"><main><h1>Seeding events</h1>
<p class="dim">Each event's page always shows its latest pull. Pull a new event with <code>seed.cmd</code> or <code>node pull.js &lt;event link&gt;</code>; it appears here.</p>
<ul class="events">${items || '<li class="dim">No pulls in out/ yet.</li>'}</ul></main></body></html>`;
}

// A same-origin request from the app's own page. Blocks other sites' pages from POSTing to the
// local server (they can't send a custom header without a CORS preflight, which we never answer)
// and DNS-rebinding hosts.
function trustedHost(req) {
  const h = String(req.headers.host || '').toLowerCase();
  return /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(h);
}

function createApp(opts = {}) {
  const outRoot = opts.outRoot || path.join(ROOT, 'out');
  const jobs = new Jobs({
    outRoot,
    getToken: opts.getToken || (() => loadToken({ envFile: path.join(ROOT, '.env') }).token),
    fetchImpl: opts.fetchImpl, now: opts.now, sleep: opts.sleep, pull: opts.pull,
    maxPerMinute: opts.maxPerMinute || Number(process.env.SEED_APP_MAX_PER_MIN) || pacing.MAX_REQUESTS,
  });

  async function handler(req, res) {
    try {
      if (!trustedHost(req)) return send(res, 403, 'Forbidden host');
      const url = new URL(req.url, 'http://127.0.0.1');
      let p;
      try { p = decodeURIComponent(url.pathname); } catch { return notFound(res); }
      const method = req.method;

      if (p === '/' && method === 'GET') return send(res, 200, indexPage(outRoot, jobs), 'text/html; charset=utf-8');

      let m = /^\/static\/([a-z.]+)$/.exec(p);
      if (m && method === 'GET') {
        const s = STATIC[m[1]];
        if (!s) return notFound(res);
        return send(res, 200, fs.readFileSync(s[0]), s[1]);
      }

      m = /^\/e\/([^/]+)\/([^/]+)\/?$/.exec(p);
      if (m && method === 'GET') {
        const [, t, e] = m;
        if (!data.SLUG_PART.test(t) || !data.SLUG_PART.test(e)) return notFound(res);
        if (!data.latestFinished(outRoot, t, e) && !jobs.status(t, e).running) return notFound(res);
        return send(res, 200, fs.readFileSync(PAGE), 'text/html; charset=utf-8');
      }

      m = /^\/api\/e\/([^/]+)\/([^/]+)\/(data|status|refresh)$/.exec(p);
      if (m) {
        const [, t, e, what] = m;
        if (!data.SLUG_PART.test(t) || !data.SLUG_PART.test(e)) return notFound(res);
        if (what === 'status' && method === 'GET') return json(res, 200, jobs.status(t, e));
        if (what === 'data' && method === 'GET') {
          const latest = data.latestFinished(outRoot, t, e);
          if (!latest) return json(res, 404, { error: 'No finished pull for this event yet.', status: jobs.status(t, e) });
          const vm = data.viewModel(latest.dir, { records: jobs.liveRecords(latest.dir) });
          vm.status = jobs.status(t, e);
          return json(res, 200, vm);
        }
        if (what === 'refresh' && method === 'POST') {
          if (req.headers['x-seeding-app'] !== '1') return send(res, 403, 'Missing X-Seeding-App header');
          const { started } = jobs.start(t, e);
          return json(res, started ? 202 : 409, jobs.status(t, e));
        }
        return send(res, 405, 'Method not allowed');
      }
      return notFound(res);
    } catch (err) {
      return send(res, 500, `Server error: ${err && err.message}`);
    }
  }
  return { handler, jobs, outRoot };
}

function openBrowser(url) {
  if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  else if (process.platform === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
}

function main(argv = process.argv.slice(2)) {
  const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const port = Number(arg('--port') || process.env.PORT) || DEFAULT_PORT;
  const outRoot = arg('--out') ? path.resolve(arg('--out')) : path.join(ROOT, 'out');
  const app = createApp({ outRoot });
  const server = http.createServer(app.handler);
  const url = `http://${HOST}:${port}/`;
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} is already in use: the app is probably already running. Opening ${url}`);
      if (argv.includes('--open')) openBrowser(url);
      process.exitCode = 0;
      return;
    }
    console.error(err.message);
    process.exitCode = 1;
  });
  server.listen(port, HOST, () => {
    console.log(`Seeding app: ${url}  (out: ${outRoot})`);
    console.log('Leave this window open while you use the app. Ctrl+C stops it.');
    if (argv.includes('--open')) openBrowser(url);
  });
  return server;
}

if (require.main === module) main();

module.exports = { createApp, main, HOST, DEFAULT_PORT, STATIC };
