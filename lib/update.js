'use strict';
// lib/update.js — "Check for updates" (Noah, 2026-11-06: a friend runs the installed app and should be
// able to update it easily). Node built-ins only.
//
// The route. The release side is Tauri's updater format, unchanged: each GitHub release carries the
// installer, its minisign signature from `tauri signer sign` (the .sig), and latest.json
// ({ version, notes, pub_date, platforms: { "windows-x86_64": { url, signature } } }). The CLIENT
// is this file, in the app's Node server, instead of Tauri's Rust updater plugin. Why: the shell in
// src-tauri/ is kept deliberately thin ("anything that feels like a feature belongs on the JavaScript
// side", src-tauri/src/main.rs) because it only ever builds in CI. The plugin route needs new crates,
// a capability granting IPC to a page served from http://127.0.0.1:8765, and a way to stop the
// sidecar before the installer overwrites it. None of that can be compiled or run outside CI, and a
// mistake would show up only when the friend presses the button. Here every step but the last (run
// the installer) runs in the test suite. The signature check is the same one the plugin does:
// Ed25519 over the file (BLAKE2b-512 prehashed, minisign "ED"), plus the global signature over the
// trusted comment, against the public key in config/updater.json. Moving to the plugin later means
// no change to releases.
//
// Installing: the installer is downloaded, its signature checked, saved to the temp folder, and run
// with the flags Tauri's updater passes to an NSIS installer: /P (passive: a progress bar, no
// questions), /UPDATE (the 0.1.0 uninstaller's script carries this flag: an update skips the
// "uninstall the old version first" step), /R (start the app again when done). The flags' effects
// are model knowledge of Tauri's NSIS template (unverified; /UPDATE's presence is verified in the
// installed 0.1.0 uninstaller). Then the server exits, and in the desktop shell it ends the shell too,
// so neither exe is running (and locked) when the installer overwrites them.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const PLATFORM_KEYS = ['windows-x86_64-nsis', 'windows-x86_64'];
const INSTALLER_ARGS = ['/P', '/UPDATE', '/R'];
const MAX_INSTALLER_BYTES = 400 * 1024 * 1024;

function readConfig(codeRoot) {
  let c = {};
  try { c = JSON.parse(fs.readFileSync(path.join(codeRoot, 'config', 'updater.json'), 'utf8')); } catch { c = {}; }
  const repo = String(c.repo || '').trim();
  return {
    repo,
    endpoint: String(c.endpoint || (repo ? `https://github.com/${repo}/releases/latest/download/latest.json` : '')).trim(),
    pubkey: String(c.pubkey || '').trim(),
    releasesPage: repo ? `https://github.com/${repo}/releases/latest` : null,
  };
}

function currentVersion(codeRoot) {
  try { return String(JSON.parse(fs.readFileSync(path.join(codeRoot, 'package.json'), 'utf8')).version || '0.0.0'); } catch { return '0.0.0'; }
}

// Semantic versions: major.minor.patch, a leading v allowed, a pre-release (1.2.0-beta) sorting
// before its release. -> -1 | 0 | 1, or null when either is not a version.
function parseVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9a-z.-]+))?(?:\+[0-9a-z.-]+)?$/i.exec(String(v || '').trim());
  return m ? { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] || null } : null;
}
function compareVersions(a, b) {
  const x = parseVersion(a), y = parseVersion(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i++) if (x.nums[i] !== y.nums[i]) return x.nums[i] < y.nums[i] ? -1 : 1;
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre < y.pre ? -1 : 1;
}

// ---- minisign (the format `tauri signer` writes; Tauri base64-encodes the whole key / .sig file) ----
const b64text = (s) => {
  const raw = String(s || '').trim();
  const text = Buffer.from(raw, 'base64').toString('utf8');
  // Accept the file's text itself as well as Tauri's base64 of it.
  return /untrusted comment:/.test(raw) ? raw : text;
};
const dataLines = (text) => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

function parsePublicKey(pubkey) {
  const lines = dataLines(b64text(pubkey)).filter((l) => !/^untrusted comment:/i.test(l));
  const raw = Buffer.from(lines[0] || '', 'base64');
  if (raw.length !== 42 || raw.subarray(0, 2).toString('latin1') !== 'Ed') throw new Error('The update public key is not a minisign Ed25519 key.');
  return { keyId: raw.subarray(2, 10), key: crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw.subarray(10)]), format: 'der', type: 'spki' }) };
}

function parseSignature(signature) {
  const lines = dataLines(b64text(signature));
  const i = lines.findIndex((l) => /^untrusted comment:/i.test(l));
  const sigLine = lines[i + 1] || '';
  const trusted = lines[i + 2] || '';
  const global = lines[i + 3] || '';
  const raw = Buffer.from(sigLine, 'base64');
  if (i < 0 || raw.length !== 74 || !/^trusted comment: /.test(trusted)) throw new Error('The update signature is not a minisign signature.');
  const alg = raw.subarray(0, 2).toString('latin1');
  if (alg !== 'Ed' && alg !== 'ED') throw new Error(`Unknown signature algorithm "${alg}".`);
  return { alg, keyId: raw.subarray(2, 10), sig: raw.subarray(10), trustedComment: trusted.slice('trusted comment: '.length), globalSig: Buffer.from(global, 'base64') };
}

// Throws unless `file` (a Buffer) is signed by `pubkey`. -> { trustedComment }.
function verifySignature(file, signature, pubkey) {
  const pk = parsePublicKey(pubkey);
  const s = parseSignature(signature);
  if (!s.keyId.equals(pk.keyId)) throw new Error('The update was signed with a different key than this app trusts.');
  const message = s.alg === 'ED' ? crypto.createHash('blake2b512').update(file).digest() : file;
  if (!crypto.verify(null, message, pk.key, s.sig)) throw new Error('The update\'s signature does not match the file (it may be damaged or not ours).');
  if (s.globalSig.length !== 64 || !crypto.verify(null, Buffer.concat([s.sig, Buffer.from(s.trustedComment, 'utf8')]), pk.key, s.globalSig)) {
    throw new Error('The update signature\'s trusted comment does not verify.');
  }
  return { trustedComment: s.trustedComment };
}

// ---- The check ----------------------------------------------------------------------------------
function allowedUrl(url, repo) {
  return typeof url === 'string' && !!repo && url.startsWith(`https://github.com/${repo}/releases/download/`);
}

// -> { current, latest, available, notes, pub_date, url, signature, releasesPage }. Throws an Error
// with .kind 'unreachable' (no answer) or 'bad-manifest' (an answer that is not a usable latest.json).
async function check({ fetchImpl = globalThis.fetch, config, current, timeoutMs = 15000 }) {
  if (!config.endpoint) throw Object.assign(new Error('No update source is configured (config/updater.json).'), { kind: 'not-configured' });
  let res;
  try { res = await fetchImpl(config.endpoint, { headers: { Accept: 'application/json' }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) }); } catch (err) {
    throw Object.assign(new Error(`Could not reach GitHub to check for updates (${err.message}).`), { kind: 'unreachable' });
  }
  if (res.status === 404) throw Object.assign(new Error('No release with update information has been published yet.'), { kind: 'no-release' });
  if (!res.ok) throw Object.assign(new Error(`GitHub answered ${res.status} while checking for updates.`), { kind: 'unreachable' });
  let m;
  try { m = JSON.parse(await res.text()); } catch { throw Object.assign(new Error('The release\'s latest.json is not JSON.'), { kind: 'bad-manifest' }); }
  const entry = m && m.platforms && PLATFORM_KEYS.map((k) => m.platforms[k]).find(Boolean);
  if (!m || compareVersions(m.version, '0.0.0') == null || !entry) throw Object.assign(new Error('The release\'s latest.json has no Windows installer.'), { kind: 'bad-manifest' });
  const latest = String(m.version).replace(/^v/i, '');
  return {
    current, latest, available: compareVersions(latest, current) === 1,
    notes: typeof m.notes === 'string' ? m.notes : '', pub_date: m.pub_date || null,
    url: entry.url, signature: entry.signature || '', releasesPage: config.releasesPage,
  };
}

// Downloads and verifies; -> the path of the checked installer in the temp folder.
async function download({ fetchImpl = globalThis.fetch, info, config, tmpDir = os.tmpdir(), timeoutMs = 10 * 60 * 1000 }) {
  if (!allowedUrl(info.url, config.repo)) throw Object.assign(new Error(`The update's download link is not one of this app's releases: ${info.url}`), { kind: 'bad-manifest' });
  if (!config.pubkey) throw Object.assign(new Error('This build has no update signing key, so it cannot check an update is genuine. Download the installer from the release page instead.'), { kind: 'no-key' });
  if (!info.signature) throw Object.assign(new Error('The release has no signature for its installer. Download it from the release page instead.'), { kind: 'unsigned' });
  let res;
  try { res = await fetchImpl(info.url, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) }); } catch (err) {
    throw Object.assign(new Error(`The download failed (${err.message}).`), { kind: 'unreachable' });
  }
  if (!res.ok) throw Object.assign(new Error(`The download failed: GitHub answered ${res.status}.`), { kind: 'unreachable' });
  const len = Number(res.headers && res.headers.get && res.headers.get('content-length'));
  if (len > MAX_INSTALLER_BYTES) throw Object.assign(new Error('The download is larger than an installer should be.'), { kind: 'bad-manifest' });
  const file = Buffer.from(await res.arrayBuffer());
  if (file.length > MAX_INSTALLER_BYTES) throw Object.assign(new Error('The download is larger than an installer should be.'), { kind: 'bad-manifest' });
  try { verifySignature(file, info.signature, config.pubkey); } catch (err) { throw Object.assign(err, { kind: 'bad-signature' }); }
  const out = path.join(tmpDir, `Seeding-Ops-${info.latest.replace(/[^0-9a-z.-]/gi, '')}-setup.exe`);
  fs.writeFileSync(out, file);
  return out;
}

// Starts the installer on its own (it outlives this process). spawnImpl is injectable for tests.
function runInstaller(file, { spawnImpl = require('node:child_process').spawn } = {}) {
  const child = spawnImpl(file, INSTALLER_ARGS, { detached: true, stdio: 'ignore', windowsHide: false });
  if (child && child.unref) child.unref();
  return { file, args: INSTALLER_ARGS };
}

module.exports = { readConfig, currentVersion, parseVersion, compareVersions, parsePublicKey, parseSignature, verifySignature, check, download, runInstaller, allowedUrl, INSTALLER_ARGS, PLATFORM_KEYS };
