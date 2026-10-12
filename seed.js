#!/usr/bin/env node
'use strict';
// seed.js — the everyday launcher. Double-click seed.cmd (Windows) or run `npm run seed`.
// Paste one or more event URLs (or pass them as arguments). Each is pulled in turn with pull.js.
// An unfinished run of the same event from the last 24 h is resumed instead of restarted.
// When a run finishes, a ready-to-paste Claude prompt is written into its folder.
// This file adds no fetch logic. pull.js stays the single path to start.gg.

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { spawnSync, spawn } = require('node:child_process');
const { parseEventSlug } = require('./lib/startgg');
const { loadToken } = require('./lib/token');

const ROOT = __dirname;
const OUT_ROOT = path.join(ROOT, 'out');
const ENV_FILE = path.join(ROOT, '.env');
const RESUME_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PROMPT_FILE = 'claude-prompt.txt';

// "tournament/<t>/event/<e>" -> "<t>__<e>__", the prefix lib/output.js gives this event's folders.
function folderPrefix(slug) {
  const m = /tournament\/([^/]+)\/event\/([^/]+)/.exec(slug) || [];
  return `${m[1] || 'tournament'}__${m[2] || 'event'}__`;
}

// Run folders for this event, newest first (by the last time any work was saved).
function runsFor(outRoot, slug) {
  if (!fs.existsSync(outRoot)) return [];
  const prefix = folderPrefix(slug);
  return fs.readdirSync(outRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith(prefix))
    .map((d) => {
      const dir = path.join(outRoot, d.name);
      const work = path.join(dir, '_work');
      const stamps = ['run.json', 'checkpoint.jsonl', 'requests.jsonl']
        .map((f) => path.join(work, f)).filter((f) => fs.existsSync(f))
        .map((f) => fs.statSync(f).mtimeMs);
      return {
        dir,
        finished: fs.existsSync(path.join(dir, 'meta.json')),
        resumable: fs.existsSync(path.join(work, 'run.json')),
        lastWorkMs: stamps.length ? Math.max(...stamps) : fs.statSync(dir).mtimeMs,
      };
    })
    .sort((a, b) => b.lastWorkMs - a.lastWorkMs);
}

// The newest unfinished, resumable run of this event touched within maxAgeMs, else null.
function findUnfinishedRun(outRoot, slug, nowMs = Date.now(), maxAgeMs = RESUME_MAX_AGE_MS) {
  const hit = runsFor(outRoot, slug)
    .find((r) => !r.finished && r.resumable && nowMs - r.lastWorkMs <= maxAgeMs);
  return hit ? hit.dir : null;
}

function claudePrompt(meta) {
  const ev = meta.event || {};
  const name = [ev.tournament_name, ev.name].filter(Boolean).join(' — ') || meta.input_url;
  const game = meta.game ? meta.game.name : 'this event\'s game';
  const s = meta.history_status || {};
  return [
    `These are start.gg results for every registrant of ${name} (${game}),`,
    `covering ${meta.window.start.slice(0, 10)} to ${meta.window.end.slice(0, 10)} (the two years before the pull).`,
    `${meta.registrant_count} registrants, ${meta.result_count} results.`,
    `Status: ${s.complete || 0} complete, ${s.limited || 0} limited, ${s.failed || 0} failed.`,
    '',
    'Join players.csv and results.csv on player_id (never on tag).',
    'history_status: "limited" = no start.gg account, so only their last 20 results in this game;',
    '"failed" = we have nothing for them. is_event_game marks results in this event\'s game.',
    'region_state / region_country come from the player\'s public start.gg location (blank if hidden).',
    'Placement is blank when start.gg has no standing.',
    '',
    'Using this, <what you want: seeding tiers, a column per big event, head-to-heads, regions...>.',
    '',
  ].join('\n');
}

function writePromptFile(runDir) {
  const metaPath = path.join(runDir, 'meta.json');
  if (!fs.existsSync(metaPath)) return null;
  const file = path.join(runDir, PROMPT_FILE);
  fs.writeFileSync(file, claudePrompt(JSON.parse(fs.readFileSync(metaPath, 'utf8'))));
  return file;
}

function askForUrls() {
  return new Promise((resolve) => {
    const urls = [];
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log('Paste start.gg event links, one per line. Press Enter on an empty line to start.');
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
  const jobs = [];
  for (const u of raw) {
    const p = parseEventSlug(u);
    if (p.error) console.error(`Skipping (not an event link; it needs /event/ in it): ${u}`);
    else if (!jobs.some((j) => j.slug === p.slug)) jobs.push({ url: u, slug: p.slug });
  }
  if (!jobs.length) { console.error('Nothing to pull.'); return 2; }

  const results = [];
  for (const [i, job] of jobs.entries()) {
    const resumeDir = findUnfinishedRun(OUT_ROOT, job.slug);
    console.log(`\n[${i + 1}/${jobs.length}] ${job.slug}${resumeDir ? `  (resuming ${path.basename(resumeDir)})` : ''}`);
    const args = resumeDir ? ['--resume', resumeDir] : [job.url];
    const r = spawnSync(process.execPath, [path.join(ROOT, 'pull.js'), ...args], { stdio: 'inherit' });
    const code = r.status == null ? 1 : r.status;
    const latest = runsFor(OUT_ROOT, job.slug)[0];
    const runDir = resumeDir || (latest && latest.dir) || null;
    const prompt = runDir && code !== 2 ? writePromptFile(runDir) : null;
    results.push({ slug: job.slug, code, runDir, prompt });
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

module.exports = { folderPrefix, runsFor, findUnfinishedRun, claudePrompt, writePromptFile };
