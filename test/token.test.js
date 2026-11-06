'use strict';
// Token loading: the environment wins, then .env; blanks count as missing.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadToken } = require('../lib/token');

const envFile = (content) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seeding-env-'));
  const f = path.join(dir, '.env');
  fs.writeFileSync(f, content);
  return f;
};

test('token: STARTGG_TOKEN in the environment wins over .env', () => {
  const f = envFile('STARTGG_TOKEN=from-file\n');
  assert.deepStrictEqual(loadToken({ env: { STARTGG_TOKEN: 'from-env' }, envFile: f }), { token: 'from-env', source: 'environment' });
});

test('token: falls back to .env, ignoring comments', () => {
  const f = envFile('# paste below\nSTARTGG_TOKEN=abc123\n');
  assert.strictEqual(loadToken({ env: {}, envFile: f }).token, 'abc123');
});

test('token: a blank line in .env (the shipped state) is missing', () => {
  const f = envFile('# comment\nSTARTGG_TOKEN=\n');
  assert.deepStrictEqual(loadToken({ env: {}, envFile: f }), { token: '', source: null });
  assert.strictEqual(loadToken({ env: { STARTGG_TOKEN: '   ' }, envFile: f }).token, '');
});

test('token: no .env file at all is missing, not an error', () => {
  assert.strictEqual(loadToken({ env: {}, envFile: path.join(os.tmpdir(), 'does-not-exist', '.env') }).token, '');
});

// ---- Noah, 2026-11-05: the app asks for a token on first launch and saves it to .env ----
const { saveToken, validateToken } = require('../lib/token');
const { createFakeFetch, buildWorld } = require('../testlib/fake-api');

test('saveToken: creates .env, replaces an existing STARTGG_TOKEN line in place, keeps every other line, and loadToken reads it back', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seeding-token-'));
  const envFile = path.join(dir, '.env');
  saveToken({ envFile, token: 'first-token' });
  assert.strictEqual(fs.readFileSync(envFile, 'utf8'), 'STARTGG_TOKEN=first-token\n');
  assert.deepStrictEqual(loadToken({ env: {}, envFile }), { token: 'first-token', source: '.env' });
  fs.writeFileSync(envFile, '# the token\nOTHER=1\nSTARTGG_TOKEN=first-token\nAFTER=2\n');
  saveToken({ envFile, token: ' second-token ' });
  assert.strictEqual(fs.readFileSync(envFile, 'utf8'), '# the token\nOTHER=1\nSTARTGG_TOKEN=second-token\nAFTER=2\n', 'other lines untouched, the token trimmed');
  fs.writeFileSync(envFile, 'OTHER=1');
  saveToken({ envFile, token: 'third' });
  assert.strictEqual(fs.readFileSync(envFile, 'utf8'), 'OTHER=1\n\nSTARTGG_TOKEN=third\n', 'appended when absent');
  assert.throws(() => saveToken({ envFile, token: '  ' }), /empty/);
});

test('validateToken: one CurrentUser request; a good token says whose it is, a bad one is rejected with no retry', async () => {
  const world = buildWorld(Math.floor(Date.UTC(2026, 9, 12) / 1000));
  const fake = createFakeFetch(world);
  const ok = await validateToken({ token: 'good', fetchImpl: fake });
  assert.deepStrictEqual(ok, { ok: true, as: 'TestTO', prefix: 'FAKE', image: 'https://images.start.gg/fake/testto-profile.png', slug: 'user/testto00', user_id: '424242', player_id: '777' });
  const calls = fake.calls.length;
  const bad = await validateToken({ token: 'bad-token', fetchImpl: fake, sleep: async () => {} });
  assert.strictEqual(bad.ok, false);
  assert.strictEqual(bad.kind, 'bad-token');
  assert.strictEqual(bad.state, 'rejected');
  assert.strictEqual(fake.calls.length, calls + 1, 'rejected on the first try, not retried');
});

// Found 2026-11-06 (reproduced on 4e35890): saveToken replaced the FIRST STARTGG_TOKEN line, but
// loadToken (node:util parseEnv) reads the LAST, so with a duplicate in .env the token just saved was
// silently ignored. Saving now leaves exactly one line, where the first was.
test('saveToken: duplicate STARTGG_TOKEN lines collapse to one, and the saved token is the one read back', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seeding-token-dup-'));
  const envFile = path.join(dir, '.env');
  fs.writeFileSync(envFile, '# top\nSTARTGG_TOKEN=old-one\nOTHER=1\nSTARTGG_TOKEN=old-two\n  STARTGG_TOKEN = old-three\n');
  saveToken({ envFile, token: 'new-token' });
  assert.deepStrictEqual(loadToken({ env: {}, envFile }), { token: 'new-token', source: '.env' });
  assert.strictEqual(fs.readFileSync(envFile, 'utf8'), '# top\nSTARTGG_TOKEN=new-token\nOTHER=1\n');
});

// The client's try ceiling: maxTries: 1 is one send whatever the kind. Without it a rate limit on a
// retry:false request still ran the time-budget schedule (8 tries, 90 s apart).
test('startgg client: maxTries caps the tries for every kind; retry:false alone still retries a rate limit', async () => {
  const sgg = require('../lib/startgg');
  const budget = async () => new Response(JSON.stringify({ errors: [{ message: 'You have gone over the threshold for recent request time. Please wait before sending another request.' }] }), { status: 200 });
  let n = 0;
  const fetchImpl = async (...a) => { n++; return budget(...a); };
  const slept = [];
  const client = sgg.createClient({ token: 't', fetchImpl, sleep: async (ms) => { slept.push(ms); } });
  await assert.rejects(client.request('Q', 'query Q { a }', {}, {}, { retry: false, maxTries: 1 }), (e) => e.kind === 'time-budget');
  assert.strictEqual(n, 1);
  assert.strictEqual(slept.filter((ms) => ms >= 90000).length, 0);
  n = 0;
  await assert.rejects(client.request('Q', 'query Q { a }', {}, {}, { retry: false }), (e) => e.kind === 'time-budget' && e.exhausted);
  assert.strictEqual(n, 8, 'the seeding post keeps its rate-limit retries');
});
