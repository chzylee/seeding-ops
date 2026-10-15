'use strict';
// testlib/inject.js — call an http request handler in memory, without a socket. The suite runs
// under testlib/no-network.js, which blocks every connect (loopback included), so the app's
// handler is exercised directly. Returns { status, headers, text, json() }.
const { Readable } = require('node:stream');

function inject(handler, { method = 'GET', url = '/', headers = {}, body = '' } = {}) {
  const req = Readable.from(body ? [Buffer.from(body)] : []);
  req.method = method;
  req.url = url;
  req.headers = { host: '127.0.0.1:8765', ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])) };
  return new Promise((resolve, reject) => {
    const res = {
      status: 0, headers: {},
      writeHead(s, h) { this.status = s; Object.assign(this.headers, h || {}); return this; },
      end(b) {
        const text = b == null ? '' : Buffer.isBuffer(b) ? b.toString('utf8') : String(b);
        resolve({ status: this.status, headers: this.headers, text, json: () => JSON.parse(text) });
      },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

module.exports = { inject };
