'use strict';
// app/server.js readBody: a request body is bytes, decoded once. Decoding each chunk as it came
// (`body += chunk`) turned a character split across two chunks into U+FFFD: an uploaded list named
// "Cup Ü" was stored as "Cup ��" (reproduced with a probe on 4e35890).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { createApp } = require('../app/server');

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

function send(app, url, chunks) {
  const req = Readable.from(chunks);
  Object.assign(req, { method: 'POST', url, headers: { host: '127.0.0.1:8765', 'x-seeding-app': '1', 'content-type': 'application/json' } });
  return new Promise((resolve, reject) => {
    const res = { status: 0, writeHead(s) { this.status = s; return this; }, end(b) { resolve({ status: this.status, text: String(b) }); } };
    Promise.resolve(app.handler(req, res)).catch(reject);
  });
}

test('server: a body whose multibyte characters are split across chunks arrives intact (page name and CSV rows)', async () => {
  const outRoot = tmp('seeding-body-');
  const app = createApp({ outRoot, getToken: () => 't', fetchImpl: async () => { throw new Error('offline'); }, sleep: async () => {}, pull: async () => ({ code: 1 }) });
  const body = Buffer.from(JSON.stringify({ name: 'Cup Ü', game_id: '1', csv: 'Zoë,abcd1234\n日本,ef015678\n' }));
  // Split inside each multibyte character, one byte at a time around them.
  const cuts = [body.indexOf(Buffer.from('Ü')) + 1, body.indexOf(Buffer.from('ë')) + 1, body.indexOf(Buffer.from('日')) + 2];
  const chunks = [];
  let at = 0;
  for (const c of cuts) { chunks.push(body.subarray(at, c)); at = c; }
  chunks.push(body.subarray(at));
  const r = await send(app, '/api/uploads', chunks);
  assert.strictEqual(r.status, 202, r.text);
  const st = JSON.parse(fs.readFileSync(path.join(outRoot, JSON.parse(r.text).t, 'state.json'), 'utf8'));
  assert.strictEqual(st.tournament.name, 'Cup Ü');
  assert.deepStrictEqual(st.upload.rows.map((x) => x.name), ['Zoë', '日本']);
  await app.jobs.idle().catch(() => {});
});

test('server: the body limit counts bytes; over it is 413', async () => {
  const app = createApp({ outRoot: tmp('seeding-body-'), getToken: () => 't', fetchImpl: async () => { throw new Error('offline'); } });
  const big = Buffer.from(JSON.stringify({ name: 'x', csv: 'é'.repeat(110000) }));   // ~220 KB of bytes, ~110 K characters
  const r = await send(app, '/api/uploads', [big.subarray(0, 100000), big.subarray(100000)]);
  assert.strictEqual(r.status, 413);
});
