#!/usr/bin/env node
'use strict';
// scripts/updater-manifest.js — write latest.json for a release, in Tauri's updater format, which is
// what the app's "Check for updates" reads (lib/update.js).
//
//   node scripts/updater-manifest.js --version 0.2.0 --repo owner/name --sig dist/X-setup.exe.sig \
//       [--asset Seeding-Ops-<version>-windows-setup.exe] [--notes "..."] --out dist/latest.json
//
// The release workflow runs it after signing the installer (.github/workflows/release.yml). The
// signature is the .sig file's content as `tauri signer sign` wrote it (base64 of the minisign file).
const fs = require('node:fs');
const path = require('node:path');

// Each release's installer is named for its version (audit round 2 #1): a browser that already has an older
// installer in Downloads can never hand the 0.1.0 one (Seeding-Ops-windows-setup.exe) to a line that names
// the new one exactly.
const assetName = (version) => `Seeding-Ops-${String(version).replace(/^v/i, '')}-windows-setup.exe`;

function buildManifest({ version, repo, signature, asset, notes = '', pubDate = new Date() }) {
  const v = String(version || '').replace(/^v/i, '');
  if (!/^\d+\.\d+\.\d+(-[0-9a-z.-]+)?$/i.test(v)) throw new Error(`Not a version: ${version}`);
  if (!/^[\w.-]+\/[\w.-]+$/.test(String(repo || ''))) throw new Error(`Not a GitHub repository (owner/name): ${repo}`);
  const sig = String(signature || '').trim();
  if (!sig) throw new Error('No signature: sign the installer first (npx tauri signer sign).');
  const entry = { signature: sig, url: `https://github.com/${repo}/releases/download/v${v}/${asset || assetName(v)}` };
  // Both keys Tauri's updater looks up for a Windows NSIS build; lib/update.js reads either.
  return { version: v, notes, pub_date: pubDate.toISOString(), platforms: { 'windows-x86_64-nsis': entry, 'windows-x86_64': entry } };
}

function main(argv) {
  const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const sigFile = arg('--sig');
  if (!sigFile) throw new Error('--sig <file> is required');
  const m = buildManifest({ version: arg('--version'), repo: arg('--repo'), signature: fs.readFileSync(sigFile, 'utf8'), asset: arg('--asset'), notes: arg('--notes') || '' });
  const out = arg('--out') || 'latest.json';
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(m, null, 2) + '\n');
  console.log(`  latest.json  ${m.version}  ${m.platforms['windows-x86_64'].url}`);
}

if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (err) { console.error(`  ${err.message}`); process.exit(1); }
}

module.exports = { buildManifest, assetName };
