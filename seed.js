#!/usr/bin/env node
'use strict';
// seed.js — the everyday launcher. Double-click seed.cmd (Windows) or run `npm run seed`.
// Paste one or more event URLs (or pass them as arguments). They are grouped by tournament, and each
// tournament is pulled once with pull.js: one pool for all of its pasted events (docs/design-tool.md,
// T2). An unfinished pull of the same tournament from the last 24 h is resumed instead of restarted.
// When a pull finishes, a ready-to-paste Claude prompt is written into out/<tournament>/.
// This file adds no fetch logic. pull.js stays the single path to start.gg.

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { spawnSync, spawn } = require('node:child_process');
const { parseEventSlug, parseTournamentSlug } = require('./lib/startgg');
const out = require('./lib/output');
const { loadToken } = require('./lib/token');

const ROOT = __dirname;
const OUT_ROOT = path.join(ROOT, 'out');
const ENV_FILE = path.join(ROOT, '.env');
const RESUME_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PROMPT_FILE = 'claude-prompt.txt';

// A tournament's pull folders (lib/output.js listPulls), newest work first.
function pullsFor(outRoot, t) {
  const tDir = path.join(outRoot, t);
  return out.listPulls(tDir).map((p) => {
    const work = path.join(p.dir, out.WORK_DIR);
    const stamps = ['run.json', 'checkpoint.jsonl', 'requests.jsonl']
      .map((f) => path.join(work, f)).filter((f) => fs.existsSync(f))
      .map((f) => fs.statSync(f).mtimeMs);
    return { ...p, lastWorkMs: stamps.length ? Math.max(...stamps) : fs.statSync(p.dir).mtimeMs };
  }).sort((x, y) => y.lastWorkMs - x.lastWorkMs);
}

// The newest unfinished, resumable pull of this tournament touched within maxAgeMs, else null.
function findUnfinishedPull(outRoot, t, nowMs = Date.now(), maxAgeMs = RESUME_MAX_AGE_MS) {
  const hit = pullsFor(outRoot, t).find((r) => !r.finished && r.resumable && nowMs - r.lastWorkMs <= maxAgeMs);
  return hit ? hit.dir : null;
}

function claudePrompt(meta) {
  const t = meta.tournament || {};
  const evs = meta.seeded_events || [];
  const name = [t.name, evs.map((e) => e.name).join(' + ')].filter(Boolean).join(' — ') || meta.input_url;
  const game = [...new Set(evs.map((e) => e.game && e.game.name).filter(Boolean))].join(', ') || 'the seeded games';
  const s = meta.history_status || {};
  return [
    `These are start.gg results for every registrant of ${name} (${game}),`,
    `covering ${meta.window.start.slice(0, 10)} to ${meta.window.end.slice(0, 10)} (the two years before the pull).`,
    `${meta.registrant_count} registrants, ${meta.result_count} results.`,
    `Status: ${s.complete || 0} complete, ${s.limited || 0} limited, ${s.failed || 0} failed.`,
    '',
    'Join players.csv and results.csv on player_id (never on tag).',
    'history_status: "limited" = no start.gg account, so only their last 20 results in this game;',
    '"failed" = we have nothing for them. players.csv "events" lists which seeded events each one entered;',
    'a result is in a seeded game when its game_id matches that event\'s game (meta.json seeded_events).',
    'region_state / region_country come from the player\'s public start.gg location (blank if hidden).',
    'Placement is blank when start.gg has no standing.',
    '',
    'Using this, <what you want: seeding tiers, a column per big event, head-to-heads, regions...>.',
    '',
  ].join('\n');
}

// Into out/<t>/ (outside the pull folder, which the next pull replaces), from the live pull's meta.
function writePromptFile(tDir) {
  const live = out.readCurrent(tDir);
  if (!live) return null;
  const metaPath = path.join(tDir, live, 'meta.json');
  const file = path.join(tDir, PROMPT_FILE);
  fs.writeFileSync(file, claudePrompt(JSON.parse(fs.readFileSync(metaPath, 'utf8'))));
  return file;
}

function askForUrls() {
  return new Promise((resolve) => {
    const urls = [];
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log('Paste start.gg event links, one per line (events of one tournament are pulled together). Press Enter on an empty line to start.');
    const ask = () => rl.question(`  event ${urls.length + 1}: `, (line) => {
      const v = line.trim();
      if (!v) { rl.close(); resolve(urls); return; }
      urls.push(v);
      ask();
    });
    ask();
  });
}

function openFolder(dir) {
  if (process.platform !== 'win32' || process.env.SEED_NO_OPEN) return;
  spawn('explorer', [dir], { detached: true, stdio: 'ignore' }).unref();
}

const OUTCOME = { 0: 'done', 1: 'stopped or some players failed — run again to resume', 2: 'could not start (see message above)' };

async function main() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 24) {
    console.error(`Node ${process.versions.node} found; this needs Node 24 or newer (https://nodejs.org).`);
    return 2;
  }
  if (!loadToken({ envFile: ENV_FILE }).token) {
    console.error('No start.gg token yet. Paste it after STARTGG_TOKEN= in the .env file, save, and run again.');
    console.error(`  ${ENV_FILE}`);
    if (process.platform === 'win32' && !process.env.SEED_NO_OPEN) {
      spawn('notepad', [ENV_FILE], { detached: true, stdio: 'ignore' }).unref();
    }
    return 2;
  }

  const raw = process.argv.slice(2).length ? process.argv.slice(2) : await askForUrls();
  const jobs = []; // one per tournament: { t, urls }
  for (const u of raw) {
    const p = parseEventSlug(u);
    if (p.error) { console.error(`Skipping (not an event link; it needs /event/ in it): ${u}`); continue; }
    const t = parseTournamentSlug(u);
    const job = jobs.find((j) => j.t === t) || (jobs.push({ t, urls: [] }), jobs[jobs.length - 1]);
    if (!job.urls.includes(u)) job.urls.push(u);
  }
  if (!jobs.length) { console.error('Nothing to pull.'); return 2; }

  const results = [];
  for (const [i, job] of jobs.entries()) {
    const resumeDir = findUnfinishedPull(OUT_ROOT, job.t);
    console.log(`\n[${i + 1}/${jobs.length}] ${job.t}${resumeDir ? `  (resuming ${path.basename(resumeDir)})` : ''}`);
    const args = resumeDir ? ['--resume', resumeDir] : job.urls;
    const r = spawnSync(process.execPath, [path.join(ROOT, 'pull.js'), ...args], { stdio: 'inherit' });
    const code = r.status == null ? 1 : r.status;
    const tDir = path.join(OUT_ROOT, job.t);
    const prompt = code !== 2 && fs.existsSync(tDir) ? writePromptFile(tDir) : null;
    results.push({ slug: job.t, code, runDir: fs.existsSync(tDir) ? tDir : null, prompt });
  }

  console.log('\nSummary');
  for (const r of results) {
    console.log(`  ${r.slug}: ${OUTCOME[r.code] || `exit ${r.code}`}`);
    if (r.runDir && r.code !== 2) console.log(`    folder: ${r.runDir}`);
    if (r.prompt) console.log(`    Claude prompt: ${r.prompt}`);
  }
  const folders = results.filter((r) => r.runDir && r.code !== 2);
  if (folders.length === 1) openFolder(folders[0].runDir);
  else if (folders.length > 1) openFolder(OUT_ROOT);
  return Math.max(...results.map((r) => r.code));
}

if (require.main === module) {
  main().then((code) => { process.exitCode = code; },
    (err) => { console.error(`Unexpected error: ${err && err.stack ? err.stack : err}`); process.exitCode = 1; });
}

module.exports = { pullsFor, findUnfinishedPull, claudePrompt, writePromptFile };
