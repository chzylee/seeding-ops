#!/usr/bin/env node
'use strict';
// scripts/migrate-tiers.js — bring a tiers file to the current shape (lib/tiers-migrate.js migrateTiers):
// the T1 migration (build A) when the file is pre-T1, then the discriminator column (build C), once.
//   node scripts/migrate-tiers.js [file] [--dry-run]
// Default file: registry/tiers.csv. Before writing, the original is copied to <file>.bak (kept
// until the build's closing review approves; delete it by hand after). The write is atomic
// (temp file + rename). A file already migrated is left untouched (exit 0, "already migrated").
// Prints counts only, never row contents.

const fs = require('node:fs');
const path = require('node:path');
const { migrateTiers } = require('../lib/tiers-migrate');

function main(argv = process.argv.slice(2), out = console) {
  const dry = argv.includes('--dry-run');
  const fileArg = argv.find((a) => !a.startsWith('--'));
  const file = path.resolve(fileArg || path.join(__dirname, '..', 'registry', 'tiers.csv'));
  const input = fs.readFileSync(file, 'utf8');
  const { text, changed, stats } = migrateTiers(input);
  const summary = `${stats.rows} rows, ${stats.app} with source=app, ${stats.backfilled} backfilled; columns ${stats.columnsBefore} -> ${stats.columnsAfter}${stats.steps.length ? ` (${stats.steps.join(' + ')})` : ''}`;
  if (!changed) { out.log(`${file}: already migrated (${summary}). Nothing written.`); return 0; }
  if (dry) { out.log(`${file}: would migrate (${summary}). --dry-run: nothing written.`); return 0; }
  const bak = `${file}.bak`;
  if (fs.existsSync(bak) && fs.readFileSync(bak, 'utf8') !== input) {
    out.error(`${bak} exists and differs from ${path.basename(file)}; move it aside first. Nothing written.`);
    return 1;
  }
  fs.writeFileSync(bak, input);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
  out.log(`${file}: migrated (${summary}). Original kept at ${bak}.`);
  return 0;
}

if (require.main === module) {
  try { process.exitCode = main(); } catch (err) { console.error(`Not migrated: ${err.message}`); process.exitCode = 1; }
}

module.exports = { main };
