'use strict';
// The real command line, in a copy of the code with no .env (so a token pasted into this
// repo's .env can never turn this test into a live call).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

function copyApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seeding-cli-'));
  fs.cpSync(path.join(ROOT, 'lib'), path.join(dir, 'lib'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'pull.js'), path.join(dir, 'pull.js'));
  return dir;
}

const runCli = (dir, args, env = {}) => spawnSync(process.execPath, [path.join(dir, 'pull.js'), ...args], {
  encoding: 'utf8', env: { ...process.env, STARTGG_TOKEN: '', ...env },
});

test('cli: no token -> plain message, exit 2, no out/ folder', () => {
  const dir = copyApp();
  const r = runCli(dir, ['https://www.start.gg/tournament/x/event/y']);
  assert.strictEqual(r.status, 2, r.stderr);
  assert.match(r.stderr, /No start\.gg token found/);
  assert.ok(!fs.existsSync(path.join(dir, 'out')));
});

test('cli: blank STARTGG_TOKEN= line in .env (the shipped state) -> exit 2, no out/ folder', () => {
  const dir = copyApp();
  fs.writeFileSync(path.join(dir, '.env'), '# paste below\nSTARTGG_TOKEN=\n');
  const r = runCli(dir, ['https://www.start.gg/tournament/x/event/y']);
  assert.strictEqual(r.status, 2);
  assert.ok(!fs.existsSync(path.join(dir, 'out')));
});

test('cli: usage errors exit 2 without touching the network', () => {
  const dir = copyApp();
  assert.strictEqual(runCli(dir, []).status, 2);
  assert.strictEqual(runCli(dir, ['a', 'b']).status, 2);
  assert.strictEqual(runCli(dir, ['--resume']).status, 2);
  assert.strictEqual(runCli(dir, ['--help']).status, 0);
});

test('cli: --resume on a folder that is not a run folder -> exit 2', () => {
  const dir = copyApp();
  const r = runCli(dir, ['--resume', dir], { STARTGG_TOKEN: 'x-not-used' });
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /Not a run folder/);
});
