'use strict';
// The home page's script binds what the page relies on. Pinned after 2026-11-05, when an edit that
// removed the connect card also cut the "Add a tournament" submit handler, so the form fell back to a
// plain GET and nothing was added (seen on the released build).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'public', 'index.js'), 'utf8');

test('home script: the Add form is handled in the page (preventDefault, POST /api/tournaments, then open the page), the upload form too, and the row click and right-click menu are wired', () => {
  const add = /const form = document\.getElementById\('add'\);[\s\S]*?form\.addEventListener\('submit', async \(ev\) => \{\s*ev\.preventDefault\(\);[\s\S]*?fetch\('\/api\/tournaments', \{ method: 'POST'[\s\S]*?location\.href = body\.page;/;
  assert.match(src, add, 'the Add form posts to /api/tournaments and opens the page');
  assert.match(src, /up\.addEventListener\('submit', async \(ev\) => \{\s*ev\.preventDefault\(\);[\s\S]*?fetch\('\/api\/uploads'/, 'the upload form posts to /api/uploads');
  assert.match(src, /list\.addEventListener\('click'/, 'a row click opens the tournament');
  assert.match(src, /list\.addEventListener\('contextmenu'/, 'right-click opens the menu');
  assert.ok(!/document\.getElementById\('connect(Form|Token|Why|Line)'\)/.test(src), 'the home-page connect card is gone (one entry point: account.js)');
  // Every id the script reads at load exists in the page the server renders (app/server.js).
  const server = fs.readFileSync(path.join(__dirname, '..', 'app', 'server.js'), 'utf8');
  for (const id of ['add', 'addUrl', 'addMsg', 'upload', 'uploadOpen', 'uploadCancel', 'uploadModal', 'upGame', 'upGameSearch', 'upGameList', 'upGameChip', 'upGameNone', 'upOtherWrap', 'upGameId', 'upGameName', 'upName', 'upDate', 'upFile', 'upMsg']) {
    assert.ok(new RegExp(`id="${id}"`).test(server), `the home page renders #${id}`);
  }
});
