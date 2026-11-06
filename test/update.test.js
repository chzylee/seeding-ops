'use strict';
// lib/update.js — the update check, the signature check, the download, and how the installer is run.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const U = require('../lib/update');
const { makeSigner } = require('../testlib/minisign');

const REPO = 'someone/seeding-ops';
const config = (pubkey = '') => ({ repo: REPO, endpoint: `https://github.com/${REPO}/releases/latest/download/latest.json`, pubkey, releasesPage: `https://github.com/${REPO}/releases/latest` });
const installerUrl = (v) => `https://github.com/${REPO}/releases/download/v${v}/Seeding-Ops-windows-setup.exe`;
const manifest = (v, signature = 'sig', key = 'windows-x86_64') => ({ version: v, notes: 'Notes', pub_date: '2026-11-06T00:00:00Z', platforms: { [key]: { url: installerUrl(v), signature } } });
const reply = (status, body, headers = {}) => new Response(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body), { status, headers });

test('update: versions compare as semver (v prefix, pre-releases before their release); junk is not a version', () => {
  assert.strictEqual(U.compareVersions('0.2.0', '0.1.0'), 1);
  assert.strictEqual(U.compareVersions('v0.1.0', '0.1.0'), 0);
  assert.strictEqual(U.compareVersions('0.10.0', '0.9.9'), 1, 'numeric, not string, order');
  assert.strictEqual(U.compareVersions('1.0.0-beta.1', '1.0.0'), -1);
  assert.strictEqual(U.compareVersions('1.0.0', '1.0.0-rc.1'), 1);
  assert.strictEqual(U.compareVersions('latest', '0.1.0'), null);
});

test('update: a minisign signature from the matching key verifies (prehashed ED and legacy Ed); anything else is refused', () => {
  const s = makeSigner();
  const file = Buffer.from('installer bytes '.repeat(1000));
  assert.match(U.verifySignature(file, s.sign(file), s.pubkey).trustedComment, /file:Seeding-Ops-windows-setup\.exe/);
  U.verifySignature(file, s.sign(file, { prehashed: false }), s.pubkey);
  const tampered = Buffer.from(file); tampered[10] ^= 1;
  assert.throws(() => U.verifySignature(tampered, s.sign(file), s.pubkey), /does not match the file/);
  const other = makeSigner();
  assert.throws(() => U.verifySignature(file, other.sign(file), s.pubkey), /different key/);
  const forged = makeSigner({ keyId: s.keyId });   // same key id, different key
  assert.throws(() => U.verifySignature(file, forged.sign(file), s.pubkey), /does not match/);
  // The trusted comment is covered by the global signature.
  const text = Buffer.from(s.sign(file), 'base64').toString().replace('file:Seeding', 'file:Evil');
  assert.throws(() => U.verifySignature(file, Buffer.from(text).toString('base64'), s.pubkey), /trusted comment/);
  assert.throws(() => U.verifySignature(file, 'not a signature', s.pubkey), /not a minisign signature/);
  assert.throws(() => U.verifySignature(file, s.sign(file), 'bm90IGEga2V5'), /not a minisign Ed25519 key/);
});

test('update: check reads latest.json and says whether it is newer; errors say what kind', async () => {
  const seen = [];
  const f = (body, status = 200) => async (url) => { seen.push(url); return reply(status, body); };
  const newer = await U.check({ fetchImpl: f(manifest('0.3.0')), config: config(), current: '0.2.0' });
  assert.deepStrictEqual([newer.available, newer.latest, newer.current, newer.url], [true, '0.3.0', '0.2.0', installerUrl('0.3.0')]);
  assert.strictEqual(seen[0], `https://github.com/${REPO}/releases/latest/download/latest.json`);
  assert.strictEqual((await U.check({ fetchImpl: f(manifest('0.2.0')), config: config(), current: '0.2.0' })).available, false);
  assert.strictEqual((await U.check({ fetchImpl: f(manifest('v0.1.0')), config: config(), current: '0.2.0' })).available, false, 'never a downgrade');
  assert.strictEqual((await U.check({ fetchImpl: f(manifest('0.3.0', 's', 'windows-x86_64-nsis')), config: config(), current: '0.2.0' })).available, true);
  await assert.rejects(U.check({ fetchImpl: f('Not Found', 404), config: config(), current: '0.2.0' }), (e) => e.kind === 'no-release');
  await assert.rejects(U.check({ fetchImpl: async () => { throw new Error('ENOTFOUND github.com'); }, config: config(), current: '0.2.0' }), (e) => e.kind === 'unreachable');
  await assert.rejects(U.check({ fetchImpl: f('<html>', 200), config: config(), current: '0.2.0' }), (e) => e.kind === 'bad-manifest');
  await assert.rejects(U.check({ fetchImpl: f({ version: '0.3.0', platforms: { 'darwin-aarch64': {} } }), config: config(), current: '0.2.0' }), (e) => e.kind === 'bad-manifest');
});

test('update: download takes only this repo\'s release links, needs a key and a signature, and writes nothing that fails the check', async () => {
  const s = makeSigner();
  const file = Buffer.from('MZ fake installer');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seeding-update-'));
  const info = { latest: '0.3.0', url: installerUrl('0.3.0'), signature: s.sign(file) };
  const fetchImpl = async () => reply(200, file);
  await assert.rejects(U.download({ fetchImpl, info: { ...info, url: 'https://evil.example/setup.exe' }, config: config(s.pubkey), tmpDir }), (e) => e.kind === 'bad-manifest');
  await assert.rejects(U.download({ fetchImpl, info, config: config(''), tmpDir }), (e) => e.kind === 'no-key');
  await assert.rejects(U.download({ fetchImpl, info: { ...info, signature: '' }, config: config(s.pubkey), tmpDir }), (e) => e.kind === 'unsigned');
  await assert.rejects(U.download({ fetchImpl: async () => reply(200, Buffer.from('MZ something else')), info, config: config(s.pubkey), tmpDir }), (e) => e.kind === 'bad-signature');
  assert.deepStrictEqual(fs.readdirSync(tmpDir), [], 'nothing written for a refused download');
  const out = await U.download({ fetchImpl, info, config: config(s.pubkey), tmpDir });
  assert.strictEqual(out, path.join(tmpDir, 'Seeding-Ops-0.3.0-setup.exe'));
  assert.ok(fs.readFileSync(out).equals(file));
});

// Audit #5: the link check compared the raw string's prefix, so ".." walked out of the repository.
test('update: only this repository\'s release downloads pass the link check, however the path is spelled', () => {
  const base = `https://github.com/${REPO}/releases/download`;
  assert.strictEqual(U.allowedUrl(`${base}/v0.3.0/Seeding-Ops-windows-setup.exe`, REPO), true);
  for (const bad of [
    `${base}/../../../other/repo/releases/download/v1/x.exe`,
    `${base}/%2e%2e/%2e%2e/%2e%2e/other/repo/releases/download/v1/x.exe`,
    `${base}\\..\\..\\..\\other\\x.exe`,
    `http://github.com/${REPO}/releases/download/v1/x.exe`,
    `https://github.com.evil.example/${REPO}/releases/download/v1/x.exe`,
    `https://user@github.com/${REPO}/releases/download/v1/x.exe`,
    `https://github.com:8443/${REPO}/releases/download/v1/x.exe`,
    `https://github.com/${REPO}/releases/latest`,
    'not a url',
  ]) assert.strictEqual(U.allowedUrl(bad, REPO), false, bad);
});

const { EventEmitter } = require('node:events');
// A fake child process that emits what Node and Bun emit (both checked: 'spawn' for a real exe,
// 'error' ENOENT for a missing one, and the process lives on).
const fakeSpawn = (calls, outcome = 'spawn') => (cmd, args, opts) => {
  calls.push({ cmd, args, opts });
  const c = new EventEmitter();
  c.unref = () => calls.push('unref');
  process.nextTick(() => (outcome === 'spawn' ? c.emit('spawn') : c.emit('error', Object.assign(new Error('spawn failed'), { code: outcome }))));
  return c;
};

// Audit #7: the installer must start after this server (seeding-server.exe) has exited, or NSIS cannot
// overwrite it. A hidden, detached PowerShell waits, then starts it with the update flags.
test('update: the installer is started by a detached launcher after a delay, with the NSIS update flags', async () => {
  const calls = [];
  const file = "C:\\Users\\O'Brien\\AppData\\Local\\Temp\\Seeding-Ops-0.3.0-setup.exe";
  const r = await U.runInstaller(file, { spawnImpl: fakeSpawn(calls), exists: () => true });
  assert.deepStrictEqual(r.args, ['/P', '/UPDATE', '/R']);
  assert.strictEqual(calls[0].cmd, 'powershell.exe');
  assert.strictEqual(calls[0].opts.detached, true);
  assert.strictEqual(calls[0].opts.windowsHide, true);
  const script = calls[0].args[calls[0].args.length - 1];
  assert.strictEqual(script, `Start-Sleep -Seconds ${U.LAUNCH_DELAY_S}; Start-Process -FilePath 'C:\\Users\\O''Brien\\AppData\\Local\\Temp\\Seeding-Ops-0.3.0-setup.exe' -ArgumentList '/P','/UPDATE','/R'`, 'the path is quoted for PowerShell, apostrophe doubled');
  assert.ok(U.LAUNCH_DELAY_S >= 2, 'long enough for the server to answer and exit first');
  assert.strictEqual(calls[1], 'unref');
});

// Audit #3: a launch that fails (no launcher, or the downloaded exe removed by antivirus) used to be an
// unhandled 'error' event: the server crashed with no message. Now it is a rejection the server answers.
test('update: a launcher that cannot start, or an installer that is gone, rejects (kind launch-failed) instead of crashing', async () => {
  const calls = [];
  await assert.rejects(U.runInstaller('C:\\tmp\\setup.exe', { spawnImpl: fakeSpawn(calls, 'ENOENT'), exists: () => true }),
    (e) => e.kind === 'launch-failed' && /could not be started: ENOENT/.test(e.message));
  await assert.rejects(U.runInstaller('C:\\tmp\\gone.exe', { spawnImpl: fakeSpawn(calls), exists: () => false }),
    (e) => e.kind === 'launch-failed' && /antivirus/.test(e.message));
  await assert.rejects(U.runInstaller('C:\\tmp\\setup.exe', { spawnImpl: () => { throw Object.assign(new Error('x'), { code: 'EACCES' }); }, exists: () => true }), (e) => e.kind === 'launch-failed');
});

test('update: config/updater.json names a repo; the app\'s version is package.json\'s, and package.json, tauri.conf.json and Cargo.toml agree', () => {
  const root = path.join(__dirname, '..');
  const c = U.readConfig(root);
  assert.match(c.repo, /^[\w.-]+\/[\w.-]+$/);
  assert.strictEqual(c.endpoint, `https://github.com/${c.repo}/releases/latest/download/latest.json`);
  const v = U.currentVersion(root);
  assert.notStrictEqual(U.parseVersion(v), null);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8')).version, v, 'tauri.conf.json is the installer\'s version');
  assert.strictEqual(/^version\s*=\s*"([^"]+)"/m.exec(fs.readFileSync(path.join(root, 'src-tauri', 'Cargo.toml'), 'utf8'))[1], v);
  if (c.pubkey) U.parsePublicKey(c.pubkey);   // a configured key must at least parse
});
