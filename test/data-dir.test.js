'use strict';
// lib/data-dir.js — an installed copy keeps the user's data out of the folder the installer owns,
// and the first launch after an update moves what a 0.1.0 install left there.
//
// The install folder as 0.1.0 left it is reproduced from the 0.1.0 uninstaller itself: decoding its
// NSIS script (the copy installed on Noah's machine, %LOCALAPPDATA%\Seeding Ops\uninstall.exe) shows
// it deletes each shipped file by name, registry\tiers.csv among them, and removes each shipped folder
// only when empty; .env and out/ are not in its list. So an upgrade can lose registry/tiers.csv but
// not .env or out/, and the fix is that nothing the installer ships is ever named like user data.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const D = require('../lib/data-dir');

const REPO = path.join(__dirname, '..');
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const write = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const TEMPLATE = fs.readFileSync(path.join(REPO, 'registry', 'tiers.template.csv'), 'utf8');
const USER_TIERS = TEMPLATE.replace(/\r?\n?$/, '\n') + Array.from({ length: 50 }, (_, i) => `"1386","MBAACC","${5000 + i}","","P${i}","P${i}","3","","","","","app","","",""`).join('\n') + '\n';

// The install folder after the new installer ran over a 0.1.0 install without uninstalling it first
// (the updater's /UPDATE mode, or "Do not uninstall"): the new code and marker, plus 0.1.0's
// registry/tiers.csv (now the user's, edited) and the user's .env and out/.
function installFolder({ withUserData = true, marker = true } = {}) {
  const dir = tmp('seeding-install-');
  for (const f of ['seeding-ops.exe', 'seeding-server.exe', 'uninstall.exe', 'app/server.js', 'config/majors.json', 'package.json']) write(path.join(dir, f), 'x');
  write(path.join(dir, 'registry', 'tiers.template.csv'), TEMPLATE);
  if (marker) write(path.join(dir, 'installed.json'), '{}');
  if (withUserData) {
    write(path.join(dir, 'registry', 'tiers.csv'), USER_TIERS);
    write(path.join(dir, '.env'), 'STARTGG_TOKEN=friend-token\n');
    write(path.join(dir, 'out', 'some-major', 'state.json'), '{"version":1}');
    write(path.join(dir, 'out', 'some-major', 'pull-20261105-000000', 'players.csv'), 'player_id\n1\n');
  }
  return dir;
}

test('data-dir: a checkout or a portable copy keeps its data beside the code; an installed copy uses the per-user folder named for the bundle identifier', () => {
  const env = { LOCALAPPDATA: 'C:\\Users\\f\\AppData\\Local' };
  const checkout = installFolder({ marker: false, withUserData: false });
  assert.deepStrictEqual(D.resolveDataRoot({ codeRoot: checkout, exeDir: checkout, env }), { installed: false, dataRoot: checkout, legacyRoot: null });
  const inst = installFolder({ withUserData: false });
  const r = D.resolveDataRoot({ codeRoot: inst, exeDir: inst, env, platform: 'win32' });
  assert.strictEqual(r.installed, true);
  assert.strictEqual(r.dataRoot, path.join('C:\\Users\\f\\AppData\\Local', 'net.enpicie.seeding-ops'));
  assert.strictEqual(r.legacyRoot, inst);
  // An installed exe pointed at a checkout (project-path.txt / SEEDING_PROJECT) serves that checkout's data.
  assert.deepStrictEqual(D.resolveDataRoot({ codeRoot: checkout, exeDir: inst, env }), { installed: false, dataRoot: checkout, legacyRoot: null });
  // SEEDING_DATA, when set, names the folder outright.
  assert.strictEqual(D.resolveDataRoot({ codeRoot: checkout, exeDir: checkout, env: { SEEDING_DATA: path.join(checkout, 'elsewhere') } }).dataRoot, path.join(checkout, 'elsewhere'));
  assert.strictEqual(D.perUserDataDir({ platform: 'darwin', home: '/Users/f' }), path.join('/Users/f', 'Library', 'Application Support', 'net.enpicie.seeding-ops'));
});

test('data-dir: the first launch after updating from 0.1.0 moves tiers.csv, .env and out/ out of the install folder, byte for byte; later launches move nothing and overwrite nothing', () => {
  const inst = installFolder();
  const data = path.join(tmp('seeding-data-'), 'net.enpicie.seeding-ops');
  const r = D.prepareDataRoot({ dataRoot: data, legacyRoot: inst, codeRoot: inst, now: () => new Date('2026-11-06T00:00:00Z') });
  assert.deepStrictEqual(r.moved, [path.join('registry', 'tiers.csv'), '.env', 'out']);
  assert.strictEqual(r.fellBack, false);
  assert.strictEqual(r.seeded, false, 'the user already has a tiers table: the template is not used');
  assert.strictEqual(fs.readFileSync(path.join(data, 'registry', 'tiers.csv'), 'utf8'), USER_TIERS, 'all 50 rows arrive unchanged');
  assert.strictEqual(fs.readFileSync(path.join(data, '.env'), 'utf8'), 'STARTGG_TOKEN=friend-token\n');
  assert.strictEqual(fs.readFileSync(path.join(data, 'out', 'some-major', 'pull-20261105-000000', 'players.csv'), 'utf8'), 'player_id\n1\n');
  for (const gone of ['registry/tiers.csv', '.env', 'out']) assert.ok(!fs.existsSync(path.join(inst, gone)), `${gone} is no longer in the install folder`);
  assert.ok(fs.existsSync(path.join(inst, 'registry', 'tiers.template.csv')), 'the installer\'s own files stay');
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(data, 'migrated.json'), 'utf8')).moved, r.moved);
  // Second launch: nothing to move. And a stale copy that reappears in the install folder (an older
  // build reinstalled over it) never overwrites the data folder's.
  write(path.join(inst, 'registry', 'tiers.csv'), TEMPLATE);
  const again = D.prepareDataRoot({ dataRoot: data, legacyRoot: inst, codeRoot: inst });
  assert.deepStrictEqual(again.moved, []);
  assert.deepStrictEqual(again.left, [path.join('registry', 'tiers.csv')]);
  assert.strictEqual(fs.readFileSync(path.join(data, 'registry', 'tiers.csv'), 'utf8'), USER_TIERS);
});

test('data-dir: a fresh install gets an empty tiers table from the template, once; an existing table is never replaced', () => {
  const inst = installFolder({ withUserData: false });
  const data = path.join(tmp('seeding-data-'), 'd');
  const r = D.prepareDataRoot({ dataRoot: data, legacyRoot: inst, codeRoot: inst });
  assert.strictEqual(r.seeded, true);
  assert.strictEqual(fs.readFileSync(path.join(data, 'registry', 'tiers.csv'), 'utf8'), TEMPLATE);
  assert.ok(fs.statSync(path.join(data, 'out')).isDirectory());
  write(path.join(data, 'registry', 'tiers.csv'), USER_TIERS);
  assert.strictEqual(D.prepareDataRoot({ dataRoot: data, legacyRoot: inst, codeRoot: inst }).seeded, false);
  assert.strictEqual(fs.readFileSync(path.join(data, 'registry', 'tiers.csv'), 'utf8'), USER_TIERS);
});

test('data-dir: the move is all or nothing: when one item cannot move, the ones already moved go back and this launch uses the install folder', () => {
  const inst = installFolder();
  const data = path.join(tmp('seeding-data-'), 'd');
  const fsi = { ...fs, renameSync: (a, b) => { if (path.basename(a) === '.env') throw Object.assign(new Error('locked'), { code: 'EBUSY' }); return fs.renameSync(a, b); } };
  const r = D.prepareDataRoot({ dataRoot: data, legacyRoot: inst, codeRoot: inst, fsi });
  assert.strictEqual(r.fellBack, true);
  assert.strictEqual(r.dataRoot, inst);
  assert.match(r.error, /EBUSY/);
  assert.strictEqual(fs.readFileSync(path.join(inst, 'registry', 'tiers.csv'), 'utf8'), USER_TIERS, 'tiers.csv was put back');
  assert.ok(!fs.existsSync(path.join(data, 'registry', 'tiers.csv')));
  assert.ok(fs.existsSync(path.join(inst, '.env')) && fs.existsSync(path.join(inst, 'out', 'some-major', 'state.json')));
  // applyDataRoot (what the loader runs) reports the same thing through SEEDING_DATA.
  const env = { LOCALAPPDATA: path.dirname(data) };
  const lines = [];
  const applied = D.applyDataRoot({ root: inst, exeDir: inst, env, platform: 'win32', fsi, log: (s) => lines.push(s) });
  assert.strictEqual(env.SEEDING_DATA, inst);
  assert.strictEqual(env.SEEDING_INSTALLED, '1');
  assert.strictEqual(applied.fellBack, true);
  assert.ok(lines.some((l) => /could not move it out/.test(l)));
});

test('data-dir: applyDataRoot on an installed copy sets SEEDING_DATA to the per-user folder after moving; on a checkout it leaves the data where it is', () => {
  const inst = installFolder();
  const local = tmp('seeding-local-');
  const env = { LOCALAPPDATA: local };
  const r = D.applyDataRoot({ root: inst, exeDir: inst, env, platform: 'win32', log: () => {} });
  assert.strictEqual(env.SEEDING_DATA, path.join(local, 'net.enpicie.seeding-ops'));
  assert.strictEqual(r.moved.length, 3);
  const checkout = installFolder({ marker: false });
  const env2 = {};
  D.applyDataRoot({ root: checkout, exeDir: checkout, env: env2, log: () => {} });
  assert.strictEqual(env2.SEEDING_DATA, checkout);
  assert.strictEqual(env2.SEEDING_INSTALLED, undefined);
  assert.ok(fs.existsSync(path.join(checkout, 'registry', 'tiers.csv')), 'a checkout\'s data is never moved');
});

// ---- Audit 2026-11-06 #2c: the tiers table the old uninstaller probably deleted is said, not silent ----
test('data-dir: an old install folder with tournaments or a key but no tiers table gets a lasting home-page warning; a normal update does not', () => {
  const inst = installFolder();
  fs.rmSync(path.join(inst, 'registry', 'tiers.csv'));   // what 0.1.0's uninstaller does
  const local = tmp('seeding-local-');
  const env = { LOCALAPPDATA: local };
  const r = D.applyDataRoot({ root: inst, exeDir: inst, env, platform: 'win32', log: () => {}, now: () => new Date('2026-11-06T00:00:00Z') });
  const data = path.join(local, 'net.enpicie.seeding-ops');
  assert.deepStrictEqual(r.notices.map((n) => n.id), ['tiers-missing']);
  assert.match(r.notices[0].text, /tiers table may have been removed/);
  assert.ok(r.notices[0].text.includes(path.join(data, 'registry', 'tiers.csv')), 'it says where to put the backup');
  assert.strictEqual(r.seeded, true, 'an empty table is in use meanwhile');
  assert.deepStrictEqual(D.readNotices(data).map((n) => n.id), ['tiers-missing'], 'kept in the data folder until dismissed');
  assert.deepStrictEqual(JSON.parse(env.SEEDING_DATA_NOTICES), [], 'not repeated as a launch notice');
  // The next launch finds nothing left to move and adds nothing; the warning stays until dismissed.
  const again = D.applyDataRoot({ root: inst, exeDir: inst, env, platform: 'win32', log: () => {} });
  assert.deepStrictEqual(again.notices, []);
  assert.strictEqual(D.readNotices(data).length, 1);
  assert.strictEqual(D.dismissNotice(data, 'tiers-missing'), true);
  assert.deepStrictEqual(D.readNotices(data), []);
  // No warning when the table came along, or when there was nothing to lose.
  const fine = D.applyDataRoot({ root: installFolder(), exeDir: null, env: {}, log: () => {} });
  assert.deepStrictEqual(fine.notices, []);
  for (const legacy of [installFolder(), installFolder({ withUserData: false })]) {
    const d = path.join(tmp('seeding-data-'), 'd');
    assert.deepStrictEqual(D.prepareDataRoot({ dataRoot: d, legacyRoot: legacy, codeRoot: legacy }).notices, []);
  }
});

// ---- Audit #4: never run on a half-moved state silently ----
test('data-dir: a failed move after an earlier launch already moved tiers.csv runs on the data folder (where the table is) and names what is still in the old folder', () => {
  const inst = installFolder();
  const data = path.join(tmp('seeding-data-'), 'd');
  write(path.join(data, 'registry', 'tiers.csv'), USER_TIERS);   // an earlier, interrupted launch moved it
  fs.rmSync(path.join(inst, 'registry', 'tiers.csv'));
  const fsi = { ...fs, renameSync: (a, b) => { if (path.basename(a) === '.env') throw Object.assign(new Error('locked'), { code: 'EBUSY' }); return fs.renameSync(a, b); } };
  const r = D.prepareDataRoot({ dataRoot: data, legacyRoot: inst, codeRoot: inst, fsi });
  assert.strictEqual(r.dataRoot, data, 'never the old folder, which has no tiers table');
  assert.strictEqual(r.fellBack, false);
  assert.deepStrictEqual(r.notices.map((n) => [n.id, n.lasting]), [['move-failed', false]]);
  assert.match(r.notices[0].text, /EBUSY/);
  assert.match(r.notices[0].text, /Still in .*: \.env, out/);
  assert.strictEqual(fs.readFileSync(path.join(data, 'registry', 'tiers.csv'), 'utf8'), USER_TIERS);
  assert.ok(!r.notices.some((n) => n.id === 'tiers-missing'), 'the table is in the data folder: nothing was lost');
});

test('data-dir: an undo that also fails is reported, and the launch follows the tiers table to wherever it ended up', () => {
  const inst = installFolder();
  const data = path.join(tmp('seeding-data-'), 'd');
  let undo = false;
  const fsi = { ...fs, renameSync: (a, b) => {
    if (path.basename(a) === '.env') { undo = true; throw Object.assign(new Error('locked'), { code: 'EBUSY' }); }
    if (undo && path.basename(a) === 'tiers.csv') throw Object.assign(new Error('denied'), { code: 'EPERM' });   // the undo
    return fs.renameSync(a, b);
  } };
  const r = D.prepareDataRoot({ dataRoot: data, legacyRoot: inst, codeRoot: inst, fsi });
  assert.strictEqual(r.dataRoot, data, 'tiers.csv could not go back, so the data folder is where it is');
  assert.match(r.notices[0].text, /Could not put back: registry\/tiers\.csv \(EPERM\)/);
  assert.strictEqual(fs.readFileSync(path.join(data, 'registry', 'tiers.csv'), 'utf8'), USER_TIERS);
});

test('data-dir: an older copy left in the old install folder is named, not silently ignored', () => {
  const inst = installFolder();
  const data = path.join(tmp('seeding-data-'), 'd');
  write(path.join(data, 'registry', 'tiers.csv'), 'newer');
  const r = D.prepareDataRoot({ dataRoot: data, legacyRoot: inst, codeRoot: inst });
  assert.deepStrictEqual(r.left, [path.join('registry', 'tiers.csv')]);
  assert.deepStrictEqual(r.notices.map((n) => [n.id, n.level]), [['left-in-old', 'info']]);
  assert.match(r.notices[0].text, /older copy of registry\/tiers\.csv/);
  assert.strictEqual(fs.readFileSync(path.join(data, 'registry', 'tiers.csv'), 'utf8'), 'newer');
});

test('data-dir: the home page shows the notices; a lasting one has Dismiss, which removes it', async () => {
  const { createApp } = require('../app/server');
  const { inject } = require('../testlib/inject');
  const data = tmp('seeding-notice-');
  fs.writeFileSync(path.join(data, 'notices.json'), JSON.stringify([{ id: 'tiers-missing', level: 'warn', text: 'Your tiers table may have been removed <here>.' }]));
  const app = createApp({ outRoot: path.join(data, 'out'), dataRoot: data, getToken: () => 't', fetchImpl: async () => { throw new Error('offline'); },
    dataNotices: [{ id: 'move-failed', level: 'warn', text: 'Your data could not all be moved.' }] });
  const html = (await inject(app.handler, { url: '/' })).text;
  assert.match(html, /<div class="data-notice warn" role="alert" data-id="move-failed"><span>Your data could not all be moved\.<\/span><\/div>/);
  assert.match(html, /data-id="tiers-missing"><span>Your tiers table may have been removed &lt;here&gt;\.<\/span><button type="button" class="plain" data-dismiss="tiers-missing">Dismiss<\/button>/);
  const H = { 'X-Seeding-App': '1', 'Content-Type': 'application/json' };
  assert.strictEqual((await inject(app.handler, { url: '/api/notices/dismiss', method: 'POST', body: '{"id":"tiers-missing"}' })).status, 403);
  const r = await inject(app.handler, { url: '/api/notices/dismiss', method: 'POST', headers: H, body: '{"id":"tiers-missing"}' });
  assert.deepStrictEqual(r.json(), { dismissed: true });
  assert.doesNotMatch((await inject(app.handler, { url: '/' })).text, /tiers-missing/);
});

test('data-dir: the installer ships nothing named like user data, ships the marker and the template, and the identifier matches', () => {
  const conf = JSON.parse(fs.readFileSync(path.join(REPO, 'src-tauri', 'tauri.conf.json'), 'utf8'));
  assert.strictEqual(conf.identifier, D.IDENTIFIER);
  const res = conf.bundle.resources;
  const targets = Object.entries(res).map(([src, to]) => (to === '' ? path.basename(src) : to).replace(/\\/g, '/'));
  for (const t of targets) {
    assert.ok(!/^(registry\/tiers\.csv|\.env|out)(\/|$)/.test(t), `the installer must not own ${t}: an update would overwrite it and an uninstall delete it`);
  }
  assert.ok(targets.includes('installed.json'), 'the marker that says "installed" ships');
  assert.ok(targets.includes('registry/tiers.template.csv'), 'the empty table ships under its own name');
  for (const src of Object.keys(res)) assert.ok(fs.existsSync(path.join(REPO, 'src-tauri', src)), `resource source ${src} exists`);
});

test('data-dir: with SEEDING_DATA set, the server keeps out/, .env and the tiers table there (not beside the code)', () => {
  const data = tmp('seeding-data-env-');
  const code = `const s=require(${JSON.stringify(path.join(REPO, 'app', 'server.js'))});const d=require(${JSON.stringify(path.join(REPO, 'lib', 'view', 'data.js'))});`
    + 'const a=s.createApp({fetchImpl:async()=>{throw new Error("offline")}});console.log(JSON.stringify({out:a.outRoot,tiers:d.defaultTiersFile()}));';
  const env = { ...process.env, SEEDING_DATA: data };
  delete env.SEED_TIERS_FILE;
  const got = JSON.parse(execFileSync(process.execPath, ['-e', code], { env, encoding: 'utf8' }).trim().split('\n').pop());
  assert.strictEqual(got.out, path.join(data, 'out'));
  assert.strictEqual(got.tiers, path.join(data, 'registry', 'tiers.csv'));
});
