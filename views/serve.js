#!/usr/bin/env node
'use strict';
// views/serve.js — serve out/ on http://localhost:8765 so seeding views open in a browser.
// Read-only and bound to localhost. Open http://localhost:8765/ for an index of run folders with views.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', 'out');
const PORT = Number(process.env.PORT) || 8765;
const TYPES = { '.html': 'text/html; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8' };

function index() {
  const runs = fs.existsSync(ROOT) ? fs.readdirSync(ROOT).filter((d) => fs.existsSync(path.join(ROOT, d, 'views'))).sort().reverse() : [];
  const links = runs.flatMap((d) => fs.readdirSync(path.join(ROOT, d, 'views')).filter((f) => f.endsWith('.html'))
    .map((f) => `<li><a href="/${encodeURIComponent(d)}/views/${f}">${d} · ${f}</a></li>`));
  return `<!doctype html><meta charset="utf-8"><title>Seeding views</title><body style="font:14px system-ui;margin:16px"><h1>Seeding views</h1><ul>${links.join('') || '<li>No views yet.</li>'}</ul>`;
}

http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (url === '/') { res.writeHead(200, { 'Content-Type': TYPES['.html'] }); return res.end(index()); }
  const file = path.join(ROOT, path.normalize(url));
  if (!file.startsWith(ROOT + path.sep) || path.basename(file) === '.env' || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end('Not found');
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1', () => console.log(`Seeding views: http://localhost:${PORT}/`));
