'use strict';
// scripts/updater-manifest.js writes the latest.json the app reads: the round trip from the release
// workflow's output to lib/update.js's check and download, with a real (throwaway) signing key.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { buildManifest, assetName } = require('../scripts/updater-manifest');
const ASSET = assetName('0.3.0');
const U = require('../lib/update');
const { makeSigner } = require('../testlib/minisign');

const REPO = 'someone/seeding-ops';

test('updater manifest: what the release publishes is what the app checks, downloads and verifies', async () => {
  const s = makeSigner();
  const installer = Buffer.from('MZ 0.3.0');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seeding-manifest-'));
  fs.writeFileSync(path.join(dir, `${ASSET}.sig`), s.sign(installer));
  execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'updater-manifest.js'), '--version', '0.3.0', '--repo', REPO, '--sig', path.join(dir, `${ASSET}.sig`), '--out', path.join(dir, 'latest.json')], { stdio: 'pipe' });
  const latest = fs.readFileSync(path.join(dir, 'latest.json'), 'utf8');
  const url = `https://github.com/${REPO}/releases/download/v0.3.0/${ASSET}`;
  assert.strictEqual(JSON.parse(latest).platforms['windows-x86_64'].url, url);
  const fetchImpl = async (u) => (u.endsWith('/latest.json') ? new Response(latest) : u === url ? new Response(installer) : new Response('', { status: 404 }));
  const config = { repo: REPO, endpoint: `https://github.com/${REPO}/releases/latest/download/latest.json`, pubkey: s.pubkey };
  const info = await U.check({ fetchImpl, config, current: '0.2.0' });
  assert.deepStrictEqual([info.available, info.latest], [true, '0.3.0']);
  const file = await U.download({ fetchImpl, info, config, tmpDir: dir });
  assert.ok(fs.readFileSync(file).equals(installer));
});

test('updater manifest: refuses a non-version, a bad repo, or a missing signature', () => {
  assert.throws(() => buildManifest({ version: 'latest', repo: REPO, signature: 'x' }), /Not a version/);
  assert.throws(() => buildManifest({ version: '0.3.0', repo: 'nope', signature: 'x' }), /GitHub repository/);
  assert.throws(() => buildManifest({ version: '0.3.0', repo: REPO, signature: ' ' }), /No signature/);
  assert.strictEqual(buildManifest({ version: 'v0.3.0', repo: REPO, signature: 'x' }).version, '0.3.0');
});

// ---- Audit #1: never publish a version that can never install an update ----
const RC = require('../scripts/release-check');

test('release check: refuses an empty or unusable pubkey, an unsigned installer, and a signature from any other key; passes the matching pair', () => {
  const s = makeSigner();
  const file = Buffer.from('MZ 0.2.0');
  assert.throws(() => RC.checkPubkey({ pubkey: '' }), /has no "pubkey"/);
  assert.throws(() => RC.checkPubkey({ pubkey: 'not a key' }), /not a usable key/);
  assert.throws(() => RC.checkRelease({ config: { pubkey: '' }, file, signature: s.sign(file) }), /has no "pubkey"/);
  assert.throws(() => RC.checkRelease({ config: { pubkey: s.pubkey }, file, signature: '' }), /no signature/);
  assert.throws(() => RC.checkRelease({ config: { pubkey: s.pubkey }, file, signature: makeSigner().sign(file) }), /does not verify against config\/updater\.json's pubkey/);
  assert.throws(() => RC.checkRelease({ config: { pubkey: s.pubkey }, file: Buffer.from('MZ other'), signature: s.sign(file) }), /does not verify/);
  RC.checkRelease({ config: { pubkey: s.pubkey }, file, signature: s.sign(file) });
});

test('release check: the command line reads config/updater.json from a root and exits 1 on refusal', () => {
  const s = makeSigner();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seeding-relcheck-'));
  fs.mkdirSync(path.join(root, 'config'));
  const script = path.join(__dirname, '..', 'scripts', 'release-check.js');
  const run = (...args) => { try { return { code: 0, out: execFileSync(process.execPath, [script, '--root', root, ...args], { encoding: 'utf8', stdio: 'pipe' }) }; } catch (e) { return { code: e.status, out: String(e.stderr) }; } };
  fs.writeFileSync(path.join(root, 'config', 'updater.json'), JSON.stringify({ repo: REPO, pubkey: '' }));
  const empty = run('--pubkey-only');
  assert.strictEqual(empty.code, 1);
  assert.match(empty.out, /::error::config\/updater\.json has no "pubkey"/);
  fs.writeFileSync(path.join(root, 'config', 'updater.json'), JSON.stringify({ repo: REPO, pubkey: s.pubkey }));
  assert.strictEqual(run('--pubkey-only').code, 0);
  const file = path.join(root, 'setup.exe');
  fs.writeFileSync(file, 'MZ');
  assert.strictEqual(run('--file', file, '--sig', path.join(root, 'missing.sig')).code, 1, 'no .sig: refused');
  fs.writeFileSync(file + '.sig', makeSigner().sign(Buffer.from('MZ')));
  assert.strictEqual(run('--file', file, '--sig', file + '.sig').code, 1, 'other key: refused');
  fs.writeFileSync(file + '.sig', s.sign(Buffer.from('MZ')));
  assert.strictEqual(run('--file', file, '--sig', file + '.sig').code, 0);
});

// The 0.1.0 -> 0.2.0 manual install (Noah, 2026-11-10: "something someone doubtful or non-technical can
// easily do"). Double-clicking the installer shows Tauri's reinstall page, which selects "Uninstall
// before installing" by default; 0.1.0's uninstaller deletes registry	iers.csv. So both README and the
// release notes say to choose "Do not uninstall", and neither asks anyone to paste a PowerShell line.
test('0.1.0 upgrade instructions: README and release notes say double-click, then "Do not uninstall"; no PowerShell', () => {
  const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
  const yml = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'release.yml'), 'utf8');
  const notes = yml.slice(yml.indexOf("cat > dist/notes.md <<'NOTES'"), yml.indexOf('sed -i "s/@VERSION@/'));
  for (const [name, text] of [['README', readme], ['release notes', notes]]) {
    assert.match(text, /double-click it/, name);
    assert.match(text, /choose \*\*Do not uninstall\*\*, then\s+(click\s+)?\*\*Next\*\*/i, name);
    assert.match(text, /More info\*\*, then \*\*Run anyway/, name);
    assert.doesNotMatch(text, /New-Object -ComObject|Get-ChildItem -LiteralPath|Open \*\*PowerShell/, name + ': no PowerShell');
  }
  assert.match(notes, /Seeding-Ops-@VERSION@-windows-setup\.exe/);
  assert.match(yml, /sed -i "s\/@VERSION@\/\$\{VERSION\}\/g" dist\/notes\.md/, 'the publish step fills in the version');
});

test('release workflow: tags the release v<version> from tauri.conf.json, signs only with the secret, and publishes the installer, its .sig and latest.json', () => {
  const yml = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'release.yml'), 'utf8');
  // A source check of the workflow (it only runs on GitHub): the parts the updater depends on.
  assert.match(yml, /require\('\.\/src-tauri\/tauri\.conf\.json'\)\.version/);
  assert.match(yml, /TAURI_SIGNING_PRIVATE_KEY: \$\{\{ secrets\.TAURI_SIGNING_PRIVATE_KEY \}\}/);
  assert.match(yml, /TAURI_SIGNING_PRIVATE_KEY_PASSWORD: \$\{\{ secrets\.TAURI_SIGNING_PRIVATE_KEY_PASSWORD \}\}/);
  assert.match(yml, /npx tauri signer sign/);
  assert.match(yml, /node scripts\/updater-manifest\.js --version "\$VERSION" --repo "\$GITHUB_REPOSITORY"/);
  assert.match(yml, /TAG="v\$\{VERSION\}"/);
  assert.match(yml, /--latest/);
  assert.doesNotMatch(yml, /default: latest/, 'no more re-pointed "latest" tag: every release is a version');
  assert.doesNotMatch(yml, /ships the tiers table as committed/, 'the stale staging comment is gone');
  // Audit #1 / #10: the pubkey is checked before a publishing build, and the signature against it
  // before anything is uploaded; there is no unsigned publish path (so no Latest without latest.json).
  assert.match(yml, /node scripts\/release-check\.js --pubkey-only/);
  const publish = yml.slice(yml.indexOf('- name: Publish release'));
  const gate = publish.indexOf('node scripts/release-check.js --file "dist/$ASSET" --sig "dist/$ASSET.sig"');
  assert.ok(gate > 0, 'the publish step verifies the signature');
  assert.ok(gate < publish.indexOf('gh release create') && gate < publish.indexOf('gh release upload'), '...before creating or uploading anything');
  assert.doesNotMatch(publish, /Publishing without latest\.json/);
});
