'use strict';
// lib/data-dir.js — where the user's data lives, kept apart from the code the installer owns.
//
// The data is three things: registry/tiers.csv (the tiers table), out/ (every tournament's pulls,
// W-L and schedule) and .env (the start.gg token). In a checkout, or an unzipped portable copy, they
// sit beside the code as they always have: the folder is the user's, nobody else writes to it.
//
// An INSTALLED copy is different. The installer owns the install folder (%LOCALAPPDATA%\Seeding Ops):
// an update overwrites every file it ships, and an uninstall deletes them. Through 0.1.0 the installer
// shipped registry/tiers.csv itself (an empty table), so a reinstall or an upgrade could put the empty
// table back over the user's, and the uninstall that an upgrade runs first deleted it outright
// (registry\tiers.csv is in the 0.1.0 uninstaller's delete list). So an installed copy keeps its data
// in the per-user data folder Tauri uses for this app (its bundle identifier), which no install,
// update or plain uninstall touches. Only the uninstaller's own "Delete the application data" tick
// box removes it, which is the point of that box.
//
// "Installed" is said by a marker file the installer ships beside the exe (src-tauri/installed.json,
// a bundle resource); the portable ZIP and a checkout never have it. A project override
// (SEEDING_PROJECT, project-path.txt) serves that project's own data, installed or not.
//
// The first launch of an installed copy moves the data an older install left in the install folder
// to the data folder: each item is renamed (same volume, atomic). If one fails, the ones already done
// this launch are renamed back, and the launch runs wherever the tiers table is (the data folder when
// it has one, else the old folder, as before). Then, when the data folder still has no tiers table, it
// gets a copy of the empty template. None of this is silent: a failed or partial move, an old copy
// left behind, and a tiers table the old uninstaller probably deleted each become a notice on the home
// page (see Notices below).

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// src-tauri/tauri.conf.json "identifier" (test/data-dir.test.js pins the two together).
const IDENTIFIER = 'net.enpicie.seeding-ops';
const INSTALLED_MARKER = 'installed.json';
// What moves, in order: the tiers table first, because it is the one thing that can't be pulled again.
const DATA_ITEMS = [path.join('registry', 'tiers.csv'), '.env', 'out'];
const TEMPLATE = path.join('registry', 'tiers.template.csv');
const MIGRATED_NOTE = 'migrated.json';

function perUserDataDir({ env = process.env, platform = process.platform, home = os.homedir() } = {}) {
  if (platform === 'win32') return path.join(env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), IDENTIFIER);
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', IDENTIFIER);
  return path.join(env.XDG_DATA_HOME || path.join(home, '.local', 'share'), IDENTIFIER);
}

const samePath = (a, b) => {
  const n = (p) => path.resolve(p).replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? n(a).toLowerCase() === n(b).toLowerCase() : n(a) === n(b);
};

// codeRoot: the folder the server's code and config are read from. exeDir: the running exe's folder.
// -> { installed, dataRoot, legacyRoot } — legacyRoot is where an older install left its data (the
// install folder), or null when there is nothing to move from.
function resolveDataRoot({ codeRoot, exeDir, env = process.env, platform, home, exists = fs.existsSync } = {}) {
  const installed = !!exeDir && samePath(codeRoot, exeDir) && exists(path.join(codeRoot, INSTALLED_MARKER));
  if (env.SEEDING_DATA && String(env.SEEDING_DATA).trim()) {
    return { installed, dataRoot: path.resolve(String(env.SEEDING_DATA).trim()), legacyRoot: installed ? codeRoot : null };
  }
  if (!installed) return { installed: false, dataRoot: codeRoot, legacyRoot: null };
  return { installed: true, dataRoot: perUserDataDir({ env, platform, home }), legacyRoot: codeRoot };
}


// ---- Notices: nothing about the data's state is ever silent (audit 2026-11-06, #2c and #4) ---------
// prepareDataRoot returns notices; applyDataRoot keeps the lasting ones in <data>/notices.json (shown
// on the home page until dismissed) and passes this launch's in SEEDING_DATA_NOTICES. Each is
// { id, level: 'warn' | 'info', text, lasting }.
const NOTICES_FILE = 'notices.json';
const TIERS = path.join('registry', 'tiers.csv');
const list = (items) => items.map((i) => i.replace(/\\/g, '/')).join(', ');

// Moves legacyRoot's data into dataRoot, then seeds the tiers table from the template when dataRoot
// has none. -> { dataRoot, moved, left, seeded, fellBack, error, notices }.
//   dataRoot   where to run: the data folder, unless a move failed and the tiers table is only in the
//              old folder (then the old folder, as before, with a notice). Never a folder without the
//              tiers table when the other one has it.
//   left       items in both folders (the data folder's copy is used; the old one is named in a notice)
// Each failed move is undone (renamed back); an undo that fails too is named in the notice.
// `fsi` is injectable so a test can make one rename fail.
function prepareDataRoot({ dataRoot, legacyRoot, codeRoot, fsi = fs, now = () => new Date() } = {}) {
  const r = { dataRoot, moved: [], left: [], seeded: false, fellBack: false, error: null, notices: [] };
  const has = (root, item) => fsi.existsSync(path.join(root, item));
  fsi.mkdirSync(path.join(dataRoot, 'registry'), { recursive: true });
  if (legacyRoot && !samePath(legacyRoot, dataRoot)) {
    // #2c, before anything moves: the old install folder still holds tournaments or a key but no tiers
    // table, and the data folder has none either. 0.1.0's uninstaller deletes registry\tiers.csv by
    // name, so an update that uninstalled the old version first has most likely just removed it.
    if (!has(legacyRoot, TIERS) && !has(dataRoot, TIERS) && (has(legacyRoot, 'out') || has(legacyRoot, '.env'))) {
      r.notices.push({ id: 'tiers-missing', level: 'warn', lasting: true,
        text: `Your tiers table may have been removed while updating: the old install folder (${legacyRoot}) still had your ${has(legacyRoot, 'out') ? 'tournaments' : 'start.gg key'} but no registry\\tiers.csv, and uninstalling the old version deletes that file. If you saved a copy before updating, close the app and put it at ${path.join(dataRoot, TIERS)}. Until then the app uses a new, empty tiers table.` });
    }
    const done = [];
    try {
      for (const item of DATA_ITEMS) {
        if (!has(legacyRoot, item)) continue;
        // Data already in the data folder is never overwritten by an older copy.
        if (has(dataRoot, item)) { r.left.push(item); continue; }
        fsi.renameSync(path.join(legacyRoot, item), path.join(dataRoot, item));
        done.push(item);
      }
    } catch (err) {
      const undoFailed = [];
      for (const item of [...done].reverse()) {
        try { fsi.renameSync(path.join(dataRoot, item), path.join(legacyRoot, item)); } catch (e2) { undoFailed.push(`${item.replace(/\\/g, '/')} (${e2.code || e2.message})`); }
      }
      const error = `${err.code || 'error'}: ${err.message}`;
      // Run wherever the tiers table is. The data folder wins when it has one (an earlier launch moved
      // it, or this undo could not put it back); otherwise the old folder, as before this change.
      const run = (has(dataRoot, TIERS) || (!has(legacyRoot, TIERS) && has(dataRoot, 'out'))) ? dataRoot : legacyRoot;
      const other = run === dataRoot ? legacyRoot : dataRoot;
      const elsewhere = DATA_ITEMS.filter((i) => has(other, i) && !has(run, i));
      r.notices.push({ id: 'move-failed', level: 'warn', lasting: false,
        text: `Your data could not all be moved to ${dataRoot} (${error}). This time the app uses ${run}.${elsewhere.length ? ` Still in ${other}: ${list(elsewhere)}; the app does not see ${elsewhere.length > 1 ? 'them' : 'it'} until the move succeeds.` : ''}${undoFailed.length ? ` Could not put back: ${undoFailed.join(', ')}.` : ''} It tries again on the next launch; if this keeps showing, close the app and move them by hand.` });
      return { ...r, dataRoot: run, fellBack: run === legacyRoot, error, left: [...r.left], moved: [] };
    }
    r.moved = done;
    if (done.length) {
      try { fsi.writeFileSync(path.join(dataRoot, MIGRATED_NOTE), JSON.stringify({ from: legacyRoot, at: now().toISOString(), moved: done }, null, 2) + '\n'); } catch { /* a note only */ }
    }
    if (r.left.length) {
      r.notices.push({ id: 'left-in-old', level: 'info', lasting: false,
        text: `The old install folder (${legacyRoot}) still has an older copy of ${list(r.left)}. The app uses the copy in ${dataRoot}; delete the old one once you are sure you do not need it.` });
    }
  }
  fsi.mkdirSync(path.join(dataRoot, 'out'), { recursive: true });
  const tiers = path.join(dataRoot, TIERS);
  const template = codeRoot && path.join(codeRoot, TEMPLATE);
  if (!fsi.existsSync(tiers) && template && fsi.existsSync(template)) {
    try { fsi.copyFileSync(template, tiers, fs.constants.COPYFILE_EXCL); r.seeded = true; } catch (err) { if (err.code !== 'EEXIST') throw err; }
  }
  return r;
}

// The lasting notices kept in <data>/notices.json, minus none; dismissNotice removes one.
function readNotices(dataRoot, fsi = fs) {
  try { const j = JSON.parse(fsi.readFileSync(path.join(dataRoot, NOTICES_FILE), 'utf8')); return Array.isArray(j) ? j.filter((n) => n && n.id && n.text) : []; } catch { return []; }
}
function writeNotices(dataRoot, notices, fsi = fs) {
  const f = path.join(dataRoot, NOTICES_FILE);
  if (!notices.length) { try { fsi.unlinkSync(f); } catch { /* none */ } return; }
  fsi.writeFileSync(f + '.tmp', JSON.stringify(notices, null, 2) + '\n');
  fsi.renameSync(f + '.tmp', f);
}
function dismissNotice(dataRoot, id, fsi = fs) {
  const before = readNotices(dataRoot, fsi);
  const after = before.filter((n) => n.id !== id);
  if (after.length !== before.length) writeNotices(dataRoot, after, fsi);
  return after.length !== before.length;
}

// What app/app-main.js runs before loading the server: decide, move, seed, and set SEEDING_DATA (and
// SEEDING_INSTALLED for an installed copy, which the update button reads). Lasting notices go to
// <data>/notices.json, this launch's to SEEDING_DATA_NOTICES. Never throws: anything unexpected leaves
// the data where it is, in the project folder, and says so.
function applyDataRoot({ root, exeDir, env = process.env, log = (s) => console.log(s), platform, home, fsi = fs, now } = {}) {
  let result;
  try {
    const where = resolveDataRoot({ codeRoot: root, exeDir, env, platform, home, exists: (p) => fsi.existsSync(p) });
    if (where.installed) env.SEEDING_INSTALLED = '1';
    if (samePath(where.dataRoot, root) && !where.legacyRoot) {
      result = { dataRoot: root, moved: [], left: [], seeded: false, fellBack: false, error: null, notices: [] };
    } else {
      result = prepareDataRoot({ dataRoot: where.dataRoot, legacyRoot: where.legacyRoot, codeRoot: root, fsi, now });
      if (result.moved.length) log(`  data moved    : ${result.moved.join(', ')} from ${where.legacyRoot}`);
      if (result.fellBack) log(`  data          : could not move it out of ${where.legacyRoot} (${result.error}); using it there this time`);
      if (result.seeded) log('  tiers table   : new, empty (from registry/tiers.template.csv)');
    }
  } catch (err) {
    result = { dataRoot: root, moved: [], left: [], seeded: false, fellBack: true, error: err.message,
      notices: [{ id: 'data-error', level: 'warn', lasting: false, text: `The app could not set up its data folder (${err.message}), so this time it uses ${root}.` }] };
    log(`  data          : ${err.message}; using ${root}`);
  }
  const lasting = result.notices.filter((n) => n.lasting);
  if (lasting.length) {
    try {
      const kept = readNotices(result.dataRoot, fsi);
      writeNotices(result.dataRoot, [...kept.filter((k) => !lasting.some((n) => n.id === k.id)), ...lasting.map((n) => ({ ...n, at: (now ? now() : new Date()).toISOString() }))], fsi);
    } catch (err) {
      // Could not keep it: show it this launch at least.
      result.notices = result.notices.map((n) => ({ ...n, lasting: false }));
      log(`  notices       : not saved (${err.message})`);
    }
  }
  env.SEEDING_DATA = result.dataRoot;
  env.SEEDING_DATA_NOTICES = JSON.stringify(result.notices.filter((n) => !n.lasting));
  for (const n of result.notices) log(`  notice        : ${n.text}`);
  log(`  data folder   : ${result.dataRoot}`);
  return result;
}

module.exports = { IDENTIFIER, INSTALLED_MARKER, DATA_ITEMS, TEMPLATE, NOTICES_FILE, perUserDataDir, resolveDataRoot, prepareDataRoot, applyDataRoot, readNotices, dismissNotice };
