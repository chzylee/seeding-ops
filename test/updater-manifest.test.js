'use strict';
// scripts/updater-manifest.js writes the latest.json the app reads: the round trip from the release
// workflow's output to lib/update.js's check and download, with a real (throwaway) signing key.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { buildManifest, ASSET } = require('../scripts/updater-manifest');
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
});
