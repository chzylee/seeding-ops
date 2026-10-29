#!/usr/bin/env node
'use strict';
// scripts/token-absent.js — increment 1's acceptance 2, "no token in history or outputs", checked
// by value without anyone reading the token: it is loaded the way the tool loads it (lib/token:
// STARTGG_TOKEN in the environment, else .env) and searched for in-process. Prints only the files
// (and the git history's hit count) that contain it, never the token itself. Makes no request.
//   node scripts/token-absent.js [file or folder ...]     default: out/
// Exit 0: not found anywhere · 1: found (paths printed) · 2: no token to look for.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { loadToken } = require('../lib/token');

const ROOT = path.join(__dirname, '..');

function filesUnder(p) {
  if (!fs.existsSync(p)) return [];
  const st = fs.statSync(p);
  if (st.isFile()) return [p];
  return fs.readdirSync(p, { withFileTypes: true }).flatMap((d) => filesUnder(path.join(p, d.name)));
}

// { files: [paths containing the token], scanned, gitHits } — gitHits is null when no git dir given.
function scan({ token, paths, gitDir = null }) {
  if (!token) throw new Error('no token to look for');
  const needle = Buffer.from(token, 'utf8');
  const files = [];
  let scanned = 0;
  for (const p of paths) {
    for (const f of filesUnder(p)) {
      scanned++;
      if (fs.readFileSync(f).includes(needle)) files.push(f);
    }
  }
  let gitHits = null;
  if (gitDir) {
    const r = spawnSync('git', ['log', '-p', '--all', '--no-color'], { cwd: gitDir, maxBuffer: 1 << 30 });
    if (r.status !== 0) throw new Error(`git log failed: ${String(r.stderr).trim()}`);
    gitHits = 0;
    for (let i = r.stdout.indexOf(needle); i >= 0; i = r.stdout.indexOf(needle, i + 1)) gitHits++;
  }
  return { files, scanned, gitHits };
}

function main() {
  const args = process.argv.slice(2);
  const { token } = loadToken({ envFile: path.join(ROOT, '.env') });
  if (!token) { console.error('No STARTGG_TOKEN to look for (environment or .env).'); return 2; }
  const paths = args.length ? args : [path.join(ROOT, 'out')];
  const r = scan({ token, paths, gitDir: ROOT });
  for (const f of r.files) console.log(`FOUND in ${f}`);
  console.log(`${r.scanned} files scanned under ${paths.join(', ')}: ${r.files.length} contain the token. git log -p --all: ${r.gitHits} hit(s).`);
  return r.files.length || r.gitHits ? 1 : 0;
}

if (require.main === module) process.exitCode = main();

module.exports = { scan };
