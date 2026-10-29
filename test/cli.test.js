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

test('D2-8: --resume on an increment 1 per-event run folder refuses in one line, exit 2, and writes nothing', () => {
  const dir = copyApp();
  const old = path.join(dir, 'out', 'crescendo-of-night-3-episode-0__andante-uni2-pc__20261015-1052');
  fs.mkdirSync(path.join(old, '_work'), { recursive: true });
  // An old folder that finished with a failed player: the case that would have taken the retry branch.
  fs.writeFileSync(path.join(old, '_work', 'run.json'), JSON.stringify({ version: 1, players: [{ player_id: '1' }], window: { startMs: 0, endMs: 1 } }));
  fs.writeFileSync(path.join(old, 'meta.json'), JSON.stringify({ failed_players: [{ player_id: '1' }] }));
  fs.writeFileSync(path.join(old, 'players.csv'), '"player_id"\r\n"1"\r\n');
  fs.writeFileSync(path.join(old, 'results.csv'), '"player_id"\r\n');
  const snapshot = () => fs.readdirSync(path.join(dir, 'out'), { recursive: true }).sort().map((f) => {
    const p = path.join(dir, 'out', f);
    return fs.statSync(p).isFile() ? `${f}:${fs.readFileSync(p, 'utf8')}` : f;
  });
  const before = snapshot();
  const r = runCli(dir, ['--resume', old], { STARTGG_TOKEN: 'x-not-used' });
  assert.strictEqual(r.status, 2, r.stderr);
  assert.strictEqual(r.stderr.trim(), 'This is a per-event run folder from before the pool layout; add the tournament in the app or run a fresh pull.');
  assert.deepStrictEqual(snapshot(), before, 'nothing written, moved or deleted');
});
