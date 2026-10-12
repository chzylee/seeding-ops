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
