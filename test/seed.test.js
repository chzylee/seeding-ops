'use strict';
// seed.js, the everyday launcher: resume detection, the Claude prompt file, and the no-token path.
// Retargeted for increment 3 (docs/design-tool.md T2): a tournament's pulls are out/<t>/pull-<stamp>/
// and the live one is named in out/<t>/current; the launcher resumes per tournament, not per event.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const seed = require('../seed');

const T = 'cb-2026';
const HOUR = 60 * 60 * 1000;

function makeRun(outRoot, name, { finished = false, resumable = true, ageMs = 0, t = T } = {}) {
  const dir = path.join(outRoot, t, name);
  fs.mkdirSync(path.join(dir, '_work'), { recursive: true });
  if (resumable) {
    const f = path.join(dir, '_work', 'run.json');
    fs.writeFileSync(f, '{}');
    const t = new Date(Date.now() - ageMs);
    fs.utimesSync(f, t, t);
  }
  if (finished) fs.writeFileSync(path.join(dir, 'meta.json'), '{}');
  return dir;
}

const tmpOut = () => fs.mkdtempSync(path.join(os.tmpdir(), 'seed-out-'));

test('seed: pullsFor lists the tournament\'s lib/output.js pull folders (pullFolderName), and nothing else', () => {
  const { pullFolderName } = require('../lib/output');
  const out = tmpOut();
  const name = pullFolderName(Date.now());
  makeRun(out, name);
  fs.mkdirSync(path.join(out, T, 'not-a-pull'), { recursive: true });
  fs.mkdirSync(path.join(out, `${T}__mbaacc__20261012-0900`, '_work'), { recursive: true }); // increment 1's layout: ignored
  assert.deepStrictEqual(seed.pullsFor(out, T).map((p) => p.name), [name]);
});

test('seed: resumes the newest unfinished run of the same event', () => {
  const out = tmpOut();
  makeRun(out, 'pull-20261012-100000', { ageMs: 3 * HOUR });
  const newer = makeRun(out, 'pull-20261012-120000', { ageMs: 1 * HOUR });
  assert.strictEqual(seed.findUnfinishedPull(out, T), newer);
});

test('seed: does not resume finished, stale, non-resumable, or other-event runs', () => {
  const out = tmpOut();
  makeRun(out, 'pull-20261012-090000', { finished: true });
  makeRun(out, 'pull-20261010-090000', { ageMs: 30 * HOUR });
  makeRun(out, 'pull-20261012-080000', { resumable: false });
  makeRun(out, 'pull-20261012-090100', { t: 'other' });
  assert.strictEqual(seed.findUnfinishedPull(out, T), null);
  assert.strictEqual(seed.findUnfinishedPull(path.join(out, 'missing'), T), null);
});

test('seed: claude-prompt.txt is written only for a live (finished) pull, from its meta.json, into out/<t>/', () => {
  const out = tmpOut();
  makeRun(out, 'pull-20261012-090000');
  assert.strictEqual(seed.writePromptFile(path.join(out, T)), null);
  const done = makeRun(out, 'pull-20261012-100000');
  fs.writeFileSync(path.join(done, 'meta.json'), JSON.stringify({
    input_url: 'x', tournament: { slug: T, name: 'Combo Breaker 2026' },
    seeded_events: [{ slug: 'mbaacc', name: 'MBAACC', game: { id: '22407', name: 'Melty Blood Actress Again Current Code' } }],
    window: { start: '2024-10-12T00:00:00.000Z', end: '2026-10-12T00:00:00.000Z' },
    registrant_count: 218, result_count: 5000, history_status: { complete: 210, limited: 8, failed: 0 },
  }));
  require('../lib/output').writeCurrent(path.join(out, T), 'pull-20261012-100000');
  const file = seed.writePromptFile(path.join(out, T));
  assert.strictEqual(file, path.join(out, T, 'claude-prompt.txt'));
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /Combo Breaker 2026 — MBAACC/);
  assert.match(text, /2024-10-12 to 2026-10-12/);
  assert.match(text, /210 complete, 8 limited, 0 failed/);
  assert.match(text, /player_id/);
});

test('seed: no token -> exit 2 with paste instructions, nothing fetched, no out/', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-cli-'));
  fs.cpSync(path.join(__dirname, '..', 'lib'), path.join(dir, 'lib'), { recursive: true });
  for (const f of ['seed.js', 'pull.js']) fs.copyFileSync(path.join(__dirname, '..', f), path.join(dir, f));
  fs.writeFileSync(path.join(dir, '.env'), 'STARTGG_TOKEN=\n');
  const r = spawnSync(process.execPath, [path.join(dir, 'seed.js'), 'https://www.start.gg/tournament/x/event/y'], {
    encoding: 'utf8', env: { ...process.env, STARTGG_TOKEN: '', SEED_NO_OPEN: '1' },
  });
  assert.strictEqual(r.status, 2, r.stderr);
  assert.match(r.stderr, /No start\.gg token yet/);
  assert.ok(!fs.existsSync(path.join(dir, 'out')));
});
