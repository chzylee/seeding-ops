'use strict';
// The home page's script, RUN against the page the server actually renders (testlib/fake-dom.js).
// Pinned after 2026-11-05, when an edit that removed the connect card also cut the "Add a
// tournament" submit handler, so the form fell back to a plain GET and nothing was added (seen on the
// released build). This used to grep index.js and check ids against server.js's source text; now the
// script runs, and what it does is checked.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../app/server');
const { inject } = require('../testlib/inject');
const { loadPage } = require('../testlib/fake-dom');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app', 'public', 'index.js'), 'utf8');

async function home(reply) {
  const app = createApp({ outRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'seeding-home-')), getToken: () => 't', fetchImpl: async () => { throw new Error('offline'); } });
  const html = (await inject(app.handler, { url: '/' })).text;
  class FileReader { readAsText(f) { this.result = f.text; setImmediate(() => this.onload()); } }
  const page = loadPage(SRC, { html, fetch: reply, globals: { FileReader } });
  return { page, $: (id) => page.document.getElementById(id) };
}

test('home script: loads against the rendered page without looking up anything the page lacks', async () => {
  const { page } = await home(async () => ({ body: {} }));
  assert.deepStrictEqual(page.misses, [], 'every id the script reads is in the page the server renders');
});

test('home script: Add posts the link to /api/tournaments (no plain GET) and opens the page; an error is shown in place', async () => {
  let reply = { body: { page: '/t/some-major' } };
  const { page, $ } = await home(async () => reply);
  $('addUrl').value = 'https://www.start.gg/tournament/some-major';
  const ev = $('add').dispatch('submit');
  assert.strictEqual(ev.defaultPrevented, true, 'the form never submits itself');
  await Promise.all(ev.results);
  assert.deepStrictEqual(page.requests.map((r) => [r.method, r.url, JSON.parse(r.body)]), [['POST', '/api/tournaments', { url: 'https://www.start.gg/tournament/some-major' }]]);
  assert.strictEqual(page.requests[0].headers['X-Seeding-App'], '1');
  assert.strictEqual(page.location.href, '/t/some-major');
  reply = { status: 400, body: { error: 'That is not a start.gg tournament or event link.' } };
  await Promise.all($('add').dispatch('submit').results);
  assert.strictEqual($('addMsg').textContent, 'That is not a start.gg tournament or event link.');
  assert.ok($('addMsg').classList.contains('err'));
});

test('home script: Import from CSV opens its dialog and posts the file\'s text to /api/uploads', async () => {
  const { page, $ } = await home(async () => ({ body: { page: '/t/mixfest' } }));
  $('uploadOpen').click();
  assert.strictEqual($('uploadModal').showModalCalls, 1);
  $('upName').value = 'Mixfest';
  $('upFile').files = [{ name: 'list.csv', size: 20, text: 'Alpha,abcd1234\n' }];
  const ev = $('upload').dispatch('submit');
  assert.strictEqual(ev.defaultPrevented, true);
  await Promise.all(ev.results);
  const req = page.requests.find((r) => r.url === '/api/uploads');
  assert.ok(req, 'the upload was posted');
  const body = JSON.parse(req.body);
  assert.strictEqual(body.csv, 'Alpha,abcd1234\n');
  assert.strictEqual(body.name, 'Mixfest');
  assert.match(body.game_id, /^\d+$/, 'a game is chosen by default');
  assert.strictEqual(page.location.href, '/t/mixfest');
});

test('home script: the tournament list gets its row click and right-click menu', async () => {
  const { page } = await home(async () => ({ body: {} }));
  assert.ok(page.events, 'the page renders the list');
  assert.strictEqual((page.events.listeners.click || []).length, 1, 'a row click opens the tournament');
  assert.strictEqual((page.events.listeners.contextmenu || []).length, 1, 'right-click opens the menu');
});
