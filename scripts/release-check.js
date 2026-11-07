#!/usr/bin/env node
'use strict';
// scripts/release-check.js — the release workflow's gate before anything is published (audit
// 2026-11-06 #1). A release whose app has no public key, or whose installer is signed by a different
// key than the one committed in config/updater.json, would ship a version that can never install an
// update. So publishing stops unless:
//   1. config/updater.json has a pubkey that parses (checked before the build: --pubkey-only), and
//   2. the installer's .sig verifies against THAT key, with the same check the app runs
//      (lib/update.js verifySignature).
//
//   node scripts/release-check.js --pubkey-only
//   node scripts/release-check.js --file dist/Seeding-Ops-0.2.0-windows-setup.exe --sig dist/Seeding-Ops-0.2.0-windows-setup.exe.sig
const fs = require('node:fs');
const path = require('node:path');
const U = require('../lib/update');

const ROOT = path.join(__dirname, '..');

function checkPubkey(config) {
  if (!config.pubkey) throw new Error('config/updater.json has no "pubkey". Put the public signing key there and commit it before publishing (README, Desktop app > Updates, signing step 3): a build without it can never install an update.');
  try { U.parsePublicKey(config.pubkey); } catch (err) { throw new Error(`config/updater.json "pubkey" is not a usable key: ${err.message} Paste the one line from seeding-ops.key.pub.`); }
}

function checkRelease({ config, file, signature }) {
  checkPubkey(config);
  if (!String(signature || '').trim()) throw new Error('The installer has no signature. Set the TAURI_SIGNING_PRIVATE_KEY secret (README, Desktop app > Updates, signing step 2); a release is not published unsigned.');
  try { U.verifySignature(file, signature, config.pubkey); } catch (err) {
    throw new Error(`The installer's signature does not verify against config/updater.json's pubkey (${err.message}). The TAURI_SIGNING_PRIVATE_KEY secret and the committed pubkey must be the two halves of the same key.`);
  }
}

function main(argv) {
  const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const config = U.readConfig(arg('--root') || ROOT);
  if (argv.includes('--pubkey-only')) { checkPubkey(config); console.log('  release-check: config/updater.json pubkey present and well formed'); return; }
  const file = arg('--file'), sig = arg('--sig');
  if (!file || !sig) throw new Error('--file <installer> and --sig <installer.sig> are required');
  checkRelease({ config, file: fs.readFileSync(file), signature: fs.existsSync(sig) ? fs.readFileSync(sig, 'utf8') : '' });
  console.log(`  release-check: ${path.basename(file)} verifies against config/updater.json's pubkey`);
}

if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (err) { console.error(`::error::${err.message}`); process.exit(1); }
}

module.exports = { checkPubkey, checkRelease, main };
