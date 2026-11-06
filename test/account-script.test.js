'use strict';
// app/public/account.js, RUN against a fake page (testlib/fake-dom.js) rather than grepped: the
// Connect dialog opens by itself only when there is no token or start.gg rejected it. When start.gg
// simply could not be reached (offline, rate limited) the bar says so, offers Retry, and leaves the
// token alone (found 2026-11-06: every failure read as "rejected" and opened Connect on every page).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadPage } = require('../testlib/fake-dom');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app', 'public', 'account.js'), 'utf8');

async function open(status) {
  const page = loadPage(SRC, { fetch: async (url) => (url.startsWith('/api/token') ? { body: status } : { status: 404 }) });
  await page.flush();
  const bar = page.created.find((e) => e.tagName === 'DIV');
  const dlg = page.created.find((e) => e.tagName === 'DIALOG');
  return { page, bar, dlg, who: bar.querySelector('.who'), retry: bar.querySelector('.retry'), change: bar.querySelector('.change') };
}

test('account bar: signed in shows the tag; nothing pops up', async () => {
  const { bar, dlg, who, retry, change } = await open({ ok: true, state: 'ok', as: 'TestTO', prefix: 'FAKE', image: null });
  assert.match(who.innerHTML, /FAKE \| <\/span>TestTO/);
  assert.strictEqual(dlg.showModalCalls, 0);
  assert.ok(!bar.classList.contains('off') && !bar.classList.contains('warn'));
  assert.strictEqual(retry.hidden, true);
  assert.strictEqual(change.textContent, 'Change…');
});

for (const [label, status, line] of [
  ['no token', { ok: false, state: 'missing', kind: 'missing' }, /Not connected to start\.gg/],
  ['a rejected token', { ok: false, state: 'rejected', kind: 'bad-token' }, /start\.gg rejected the saved token/],
]) {
  test(`account bar: ${label} turns the bar red and opens Connect by itself, once`, async () => {
    const { page, bar, dlg, who, change } = await open(status);
    assert.match(who.textContent, line);
    assert.ok(bar.classList.contains('off'));
    assert.strictEqual(dlg.showModalCalls, 1);
    assert.strictEqual(change.textContent, 'Connect…');
    assert.match(dlg.innerHTML, /start\.gg\/admin\/profile\/developer/, 'the dialog says where to get a key');
    await page.window.Account.reload();
    assert.strictEqual(dlg.showModalCalls, 1, 'once per page, not on every check');
  });
}

for (const kind of ['network', 'rate-limited', 'time-budget', 'server']) {
  test(`account bar: start.gg ${kind} says "could not be reached", offers Retry, and does NOT open Connect`, async () => {
    const { page, bar, dlg, who, retry } = await open({ ok: false, state: 'unreachable', kind, message: 'start.gg could not be reached.' });
    assert.match(who.textContent, /start\.gg could not be reached/);
    assert.doesNotMatch(who.textContent, /rejected/);
    assert.strictEqual(dlg.showModalCalls, 0);
    assert.ok(bar.classList.contains('warn') && !bar.classList.contains('off'));
    assert.strictEqual(retry.hidden, false);
    // Retry asks again, forced, with the app header the server requires for that.
    const before = page.requests.length;
    retry.click();
    await page.flush();
    const req = page.requests[before];
    assert.strictEqual(req.url, '/api/token?check=1');
    assert.strictEqual(req.headers['X-Seeding-App'], '1');
  });
}

test('account bar: an older server that sends only `kind` is read the same way', async () => {
  assert.strictEqual((await open({ ok: false, kind: 'network' })).dlg.showModalCalls, 0);
  assert.strictEqual((await open({ ok: false, kind: 'bad-token' })).dlg.showModalCalls, 1);
});

test('account bar: the app server not answering at all is not a token problem either', async () => {
  const page = loadPage(SRC, { fetch: async () => { throw new Error('connection refused'); } });
  await page.flush();
  const dlg = page.created.find((e) => e.tagName === 'DIALOG');
  assert.strictEqual(dlg.showModalCalls, 0);
});
