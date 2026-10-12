'use strict';
// seed.js, the everyday launcher: resume detection, the Claude prompt file, and the no-token path.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const seed = require('../seed');

const SLUG = 'tournament/cb-2026/event/mbaacc';
const HOUR = 60 * 60 * 1000;

function makeRun(outRoot, name, { finished = false, resumable = true, ageMs = 0 } = {}) {
  const dir = path.join(outRoot, name);
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

test('seed: folderPrefix matches lib/output.js runFolderName', () => {
  const { runFolderName } = require('../lib/output');
  assert.ok(runFolderName(SLUG, Date.now()).startsWith(seed.folderPrefix(SLUG)));
});

test('seed: resumes the newest unfinished run of the same event', () => {
  const out = tmpOut();
  makeRun(out, `${seed.folderPrefix(SLUG)}20261012-1000`, { ageMs: 3 * HOUR });
  const newer = makeRun(out, `${seed.folderPrefix(SLUG)}20261012-1200`, { ageMs: 1 * HOUR });
  assert.strictEqual(seed.findUnfinishedRun(out, SLUG), newer);
});

test('seed: does not resume finished, stale, non-resumable, or other-event runs', () => {
  const out = tmpOut();
  makeRun(out, `${seed.folderPrefix(SLUG)}20261012-0900`, { finished: true });
  makeRun(out, `${seed.folderPrefix(SLUG)}20261010-0900`, { ageMs: 30 * HOUR });
  makeRun(out, `${seed.folderPrefix(SLUG)}20261012-0800`, { resumable: false });
  makeRun(out, `${seed.folderPrefix('tournament/other/event/x')}20261012-0900`);
  assert.strictEqual(seed.findUnfinishedRun(out, SLUG), null);
  assert.strictEqual(seed.findUnfinishedRun(path.join(out, 'missing'), SLUG), null);
});

test('seed: claude-prompt.txt is written only for a finished run, from meta.json', () => {
  const out = tmpOut();
  const unfinished = makeRun(out, `${seed.folderPrefix(SLUG)}a`);
  assert.strictEqual(seed.writePromptFile(unfinished), null);
  const done = makeRun(out, `${seed.folderPrefix(SLUG)}b`);
  fs.writeFileSync(path.join(done, 'meta.json'), JSON.stringify({
    input_url: 'x', event: { name: 'MBAACC', tournament_name: 'Combo Breaker 2026' },
    game: { id: '22407', name: 'Melty Blood Actress Again Current Code' },
    window: { start: '2024-10-12T00:00:00.000Z', end: '2026-10-12T00:00:00.000Z' },
    registrant_count: 218, result_count: 5000, history_status: { complete: 210, limited: 8, failed: 0 },
  }));
  const file = seed.writePromptFile(done);
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
