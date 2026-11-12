'use strict';
// Amendment A3 (docs/design-tool.md; Noah, 2026-11-12): the left nav, the Tiers view (game tabs, a
// sortable sheet edited in place, the player alias) and the reworked import (a game with no tiers takes
// the file directly; otherwise a diff approved per row, by selection or all, with a search).
// The page script (app/public/tiers.js) RUNS on a fake page (testlib/fake-dom.js) built from the HTML
// the real server renders, and every request it makes goes to that server (testlib/inject.js) over a
// temporary tiers.csv; what is checked is what the page shows and what reached the file.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const out = require('../lib/output');
const data = require('../lib/view/data');
const M = require('../lib/view/model');
const R = require('../lib/view/render');
const S = require('../lib/tiers-share');
const { createApp } = require('../app/server');
const { inject } = require('../testlib/inject');
const { loadPage, makeEl } = require('../testlib/fake-dom');
const { makePool } = require('../testlib/pool-fixture');

const ROOT = path.join(__dirname, '..');
const SRC = ['lib/view/model.js', 'lib/view/render.js', 'app/public/tiers.js'].map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
const A = { id: '22407', name: 'MBAACC' };
const B = { id: '39281', name: 'MBTL' };
const NOW = new Date('2026-11-12T12:00:00Z');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'seeding-tiersview-'));
const read = (f) => out.parseCsv(fs.readFileSync(f, 'utf8'));
// A row in the pre-A3 shape (no alias column) unless the caller adds one.
const OLD_COLS = data.TIER_COLS.filter((c) => c !== 'alias');
const row = (game, o) => ({ ...Object.fromEntries(data.TIER_COLS.map((c) => [c, ''])), game_id: game.id, game_name: game.name, source: 'app', ...o });

function world(rows, { cols = data.TIER_COLS } = {}) {
  const dir = tmp();
  const tiersFile = path.join(dir, 'tiers.csv');
  if (rows) fs.writeFileSync(tiersFile, out.toCsv(cols, rows));
  const app = createApp({ outRoot: path.join(dir, 'out'), tiersFile, getToken: () => 'T', fetchImpl: async () => { throw new Error('no start.gg request expected'); }, now: () => NOW.getTime() });
  return { dir, tiersFile, app, outRoot: path.join(dir, 'out') };
}
const mineRows = () => [
  row(A, { player_id: '1', discriminator: 'aaaa0001', startgg_tag: 'Knight Artorias', sheet_tag: 'Knight Artorias', alias: 'Onyxdood', tier: '9', notes: 'n1', last_reviewed_on: '2026-10-16', last_reviewed_tournament: 'eclipse' }),
  row(A, { player_id: '2', startgg_tag: 'bravo', tier: '5', notes: 'keep me' }),
  row(A, { sheet_tag: 'Charlie', tier: '3', source: 'sheet import', alias: 'Zed' }),
  row(A, { player_id: '4', discriminator: 'dddd0004', startgg_tag: 'Delta', notes: 'a note', last_reviewed_on: '2026-11-01', last_reviewed_tournament: 'x' }),
  row(B, { player_id: '1', startgg_tag: 'Knight Artorias', tier: '2' }),
];
const theirs = (lines) => '﻿"game_id","game_name","player_id","discriminator","startgg_tag","sheet_tag","tier"\r\n' + lines.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n') + '\r\n';

// The Tiers view, booted for one game against the world's server.
async function tiersPage(w, game) {
  const html = (await inject(w.app.handler, { url: `/tiers${game ? `?game=${game}` : ''}` })).text;
  const answer = async (url, init = {}) => {
    const r = await inject(w.app.handler, { url, method: init.method || 'GET', headers: init.headers || {}, body: init.body || '' });
    return { status: r.status, body: r.text ? r.json() : {} };
  };
  const page = loadPage(SRC, { html, fetch: answer, globals: { TextEncoder } });
  await page.flush(10);
  const $ = (id) => page.document.getElementById(id);
  const order = () => [...$('tierTable').innerHTML.matchAll(/<tr data-key="([^"]+)"/g)].map((m) => m[1]);
  // A click on a header's sort button / on an editable cell, as the browser's event would carry it.
  const sortBy = (col) => $('tierTable').dispatch('click', { target: { closest: (sel) => (sel === 'button.sort' ? { dataset: { col } } : null) } });
  const cell = (key, field) => {
    const tr = { dataset: { key } };
    const td = makeEl('td', { dataset: { edit: field } });
    td.closest = (sel) => (sel === 'tr' ? tr : sel === 'td[data-edit]' ? td : null);
    return td;
  };
  // Opens the editor on a cell, types `value`, and presses Enter. -> the save's promise.
  const edit = async (key, field, value) => {
    const td = cell(key, field);
    $('tierTable').dispatch('click', { target: { closest: (sel) => (sel === 'td[data-edit]' ? td : null) } });
    const input = td.querySelector('input.ed');
    input.value = value;
    await Promise.all(input.dispatch('keydown', { key: 'Enter' }).results);
    await page.flush(6);
    return { td, input };
  };
  // Picks a file for Import.
  const importFile = async (csv, name = 'theirs.csv') => {
    $('tierFile').files = [{ name, text: async () => csv }];
    await Promise.all($('tierFile').dispatch('change').results);
    await page.flush(6);
  };
  const diffKeys = () => [...$('impBody').innerHTML.matchAll(/<tr data-key="([^"]+)"/g)].map((m) => m[1]);
  return { html, page, $, order, sortBy, edit, importFile, diffKeys };
}

// ---- The nav --------------------------------------------------------------------------------------

test('A3 nav: the home page, a tournament page, the not-added page and the Tiers view each have the left nav, Tournaments and Tiers, with the active one marked', async () => {
  const w = world(mineRows());
  makePool(w.outRoot, { t: 'tour', events: [{ slug: 'ev', game: { id: A.id, name: A.name } }], players: [] });
  const pages = {
    home: [(await inject(w.app.handler, { url: '/' })).text, 'tournaments'],
    tournament: [(await inject(w.app.handler, { url: '/t/tour' })).text, 'tournaments'],
    notAdded: [(await inject(w.app.handler, { url: '/t/nope' })).text, 'tournaments'],
    tiers: [(await inject(w.app.handler, { url: '/tiers' })).text, 'tiers'],
  };
  for (const [name, [html, active]] of Object.entries(pages)) {
    const nav = (/<nav id="appNav" class="app-nav" aria-label="Main">([\s\S]*?)<\/nav>/.exec(html) || [])[1];
    assert.ok(nav, `${name}: has the nav`);
    assert.match(html, /<body class="[^"]*\bhas-nav\b[^"]*">/, `${name}: the page makes room for it`);
    const links = [...nav.matchAll(/<a href="([^"]+)" class="nav-item nav-(\w+)" title="(\w+)"( aria-current="page")?>[\s\S]*?<span class="nav-label">(\w+)<\/span><\/a>/g)].map((m) => ({ href: m[1], key: m[2], current: !!m[4], label: m[5] }));
    assert.deepStrictEqual(links.map((l) => [l.href, l.label]), [['/', 'Tournaments'], ['/tiers', 'Tiers']], name);
    assert.deepStrictEqual(links.filter((l) => l.current).map((l) => l.key), [active], `${name}: aria-current on ${active} only`);
  }
  assert.match(pages.tournament[0], /id="tabs"/, 'the real tournament page');
  // The Tiers view is its own page: the home page no longer carries the tiers controls.
  assert.doesNotMatch(pages.home[0], /id="tierExport"|id="tierImport"|class="tiers-section"/);
  // The narrow window: the CSS turns the nav into an icon rail, its names kept for screen readers.
  const css = fs.readFileSync(path.join(ROOT, 'app', 'public', 'app.css'), 'utf8');
  assert.match(css, /@media \(max-width: 1199px\) \{\s*:root \{ --nav-w: 52px; \}[\s\S]*?\.app-nav \.nav-label \{ position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect\(0 0 0 0\)/);
});

// ---- Tabs per game --------------------------------------------------------------------------------

test('A3 Tiers view: a tab per game in the tiers table, the current one marked; Noah\'s intro verbatim; another game opens its own (empty) tab', async () => {
  const w = world(mineRows());
  const html = (await inject(w.app.handler, { url: '/tiers' })).text;
  assert.ok(html.includes('<p class="intro">Tier players from 0-10 for each game. Save tiers to seed future events faster.<br>Tier data is automatically saved as you seed an event.</p>'));
  const tabs = (h) => [...h.matchAll(/<a href="\/tiers\?game=(\d+)" class="game-tab"( aria-current="page")?>([^<]+)<\/a>/g)].map((m) => [m[1], m[3], !!m[2]]);
  assert.deepStrictEqual(tabs(html), [[A.id, A.name, true], [B.id, B.name, false]], 'the first game is shown by default');
  const onB = (await inject(w.app.handler, { url: `/tiers?game=${B.id}` })).text;
  assert.deepStrictEqual(tabs(onB), [[A.id, A.name, false], [B.id, B.name, true]]);
  assert.match(onB, new RegExp(`id="tierTools" |data-game="${B.id}"`));
  // The page shows the picked game's rows only.
  const p = await tiersPage(w, B.id);
  assert.deepStrictEqual(p.order(), ['p:1']);
  assert.match(p.$('tierTable').innerHTML, /<td class="tier num" tabindex="0" data-edit="tier"><b>2<\/b><\/td>/);
  // Another game (one the app knows, with no rows yet): its own tab, empty, Import on.
  const other = (/<option value="(\d+)">([^<]+)<\/option>/.exec(html.slice(html.indexOf('id="tierNewGame"'))) || []);
  assert.ok(other[1], 'Another game lists the games not in the table');
  const fresh = (await inject(w.app.handler, { url: `/tiers?game=${other[1]}` })).text;
  assert.ok(tabs(fresh).some(([id, , cur]) => id === other[1] && cur));
  assert.doesNotMatch(fresh, /id="tierImport" disabled/);
  const q = await tiersPage(w, other[1]);
  assert.deepStrictEqual(q.order(), []);
  assert.strictEqual(q.$('tierEmpty').hidden, false);
});

// ---- Sorting ---------------------------------------------------------------------------------------

test('A3 Tiers view: every column sorts both ways from its header, with aria-sort; Player sorts by tag, never by alias; blanks last', async () => {
  const w = world(mineRows());
  const p = await tiersPage(w, A.id);
  assert.deepStrictEqual(p.order(), ['p:1', 'p:2', 't:charlie', 'p:4'], 'opens by tier, highest first; no tier last');
  assert.match(p.$('tierTable').innerHTML, /<th data-col="tier" aria-sort="descending">/);
  const expect = {
    tag: [['p:2', 't:charlie', 'p:4', 'p:1'], ['p:1', 'p:4', 't:charlie', 'p:2']],          // bravo, Charlie, Delta, Knight (not Onyxdood / Zed)
    discriminator: [['p:1', 'p:4', 'p:2', 't:charlie'], ['p:4', 'p:1', 'p:2', 't:charlie']],  // blanks last both ways (ties by tag)
    alias: [['p:1', 't:charlie', 'p:2', 'p:4'], ['t:charlie', 'p:1', 'p:2', 'p:4']],
    tier: [['t:charlie', 'p:2', 'p:1', 'p:4'], ['p:1', 'p:2', 't:charlie', 'p:4']],
    notes: [['p:4', 'p:2', 'p:1', 't:charlie'], ['p:1', 'p:2', 'p:4', 't:charlie']],
    last_reviewed_on: [['p:1', 'p:4', 'p:2', 't:charlie'], ['p:4', 'p:1', 'p:2', 't:charlie']],
  };
  assert.deepStrictEqual(Object.keys(expect), M.TIER_VIEW_COLS.map(([k]) => k), 'every column of the view');
  for (const [col, [asc, desc]] of Object.entries(expect)) {
    if (col === 'tier') { p.sortBy('tag'); }   // tier is the current sort: start it fresh
    p.sortBy(col);
    assert.deepStrictEqual(p.order(), asc, `${col} ascending`);
    assert.match(p.$('tierTable').innerHTML, new RegExp(`<th data-col="${col}" aria-sort="ascending">`));
    assert.strictEqual((p.$('tierTable').innerHTML.match(/aria-sort=/g) || []).length, 1, 'one sorted column');
    p.sortBy(col);
    assert.deepStrictEqual(p.order(), desc, `${col} descending`);
    assert.match(p.$('tierTable').innerHTML, new RegExp(`<th data-col="${col}" aria-sort="descending">`));
  }
});

// ---- Editing in place ------------------------------------------------------------------------------

test('A3 Tiers view: tier, alias and notes edited in place each write registry/tiers.csv (the seeding table\'s file and rule); a bad tier writes nothing', async () => {
  const w = world(mineRows());
  const p = await tiersPage(w, A.id);
  const byKey = (k) => read(w.tiersFile).find((r) => r.game_id === A.id && data.rowKey(r) === k);
  await p.edit('p:2', 'tier', '7');
  assert.deepStrictEqual([byKey('p:2').tier, byKey('p:2').decided_on, byKey('p:2').source, byKey('p:2').notes], ['7', '2026-11-12', 'app', 'keep me'], 'tier saved, decided_on stamped as an edit while seeding does');
  await p.edit('p:2', 'alias', 'Bee');
  assert.strictEqual(byKey('p:2').alias, 'Bee');
  await p.edit('t:charlie', 'notes', 'from the view');
  assert.deepStrictEqual([byKey('t:charlie').notes, byKey('t:charlie').tier, byKey('t:charlie').alias], ['from the view', '3', 'Zed'], 'an unlinked row is found by its tag');
  assert.match(p.$('tierTable').innerHTML, /<b>bravo<\/b> <span class="alias">\(Bee\)<\/span>/, 'the sheet shows the saved alias');
  assert.strictEqual(p.$('tierMsg').textContent, 'Saved.');
  // Game B's row for the same player is untouched; nothing else moved.
  assert.strictEqual(read(w.tiersFile).find((r) => r.game_id === B.id).tier, '2');
  assert.strictEqual(read(w.tiersFile).length, mineRows().length);
  // The seeding rule: a whole number in range, else a 400 and nothing written.
  const before = fs.readFileSync(w.tiersFile, 'utf8');
  for (const bad of ['21', '2.5', 'x']) {
    await p.edit('p:2', 'tier', bad);
    assert.match(p.$('tierMsg').textContent, /^Tier must be a whole number from 0 to 20\./, bad);
    assert.ok(p.$('tierMsg').classList.contains('err'));
  }
  assert.strictEqual(fs.readFileSync(w.tiersFile, 'utf8'), before);
  // The route: only tier / alias / notes, and only with the app header.
  const post = (body, headers = { 'X-Seeding-App': '1' }) => inject(w.app.handler, { url: '/api/tiers/row', method: 'POST', headers, body: JSON.stringify(body) });
  assert.strictEqual((await post({ game_id: A.id, key: 'p:2', tier: '1' }, {})).status, 403);
  assert.strictEqual((await post({ game_id: A.id, key: 'p:2', player_id: '99' })).status, 400, 'nothing editable sent');
  assert.strictEqual((await post({ game_id: A.id, key: 'p:404', tier: '1' })).status, 404);
  assert.strictEqual(fs.readFileSync(w.tiersFile, 'utf8'), before);
});

test('A3 Tiers view: two unlinked rows answering to one tag are refused (409), never guessed', () => {
  const w = world([row(A, { sheet_tag: 'Same', tier: '2' }), row(A, { startgg_tag: 'same', tier: '4' })]);
  const before = fs.readFileSync(w.tiersFile, 'utf8');
  assert.throws(() => data.editTierByKey(A.id, 't:same', { tier: 9 }, { tiersFile: w.tiersFile }), (e) => e.status === 409);
  assert.strictEqual(fs.readFileSync(w.tiersFile, 'utf8'), before);
});

// ---- The alias -------------------------------------------------------------------------------------

test('A3 alias: an old tiers.csv without the column still loads (Tiers view, seeding table), and the first write adds it, blank, without losing a row', async () => {
  const old = mineRows().map(({ alias, ...r }) => r);
  const w = world(old, { cols: OLD_COLS });
  assert.ok(!fs.readFileSync(w.tiersFile, 'utf8').split('\r\n')[0].includes('"alias"'), 'the file has no alias column');
  const rows = data.tierRows(A.id, { tiersFile: w.tiersFile });
  assert.deepStrictEqual(rows.map((r) => [r.key, r.alias, r.tier]), [['p:1', '', 9], ['p:2', '', 5], ['t:charlie', '', 3], ['p:4', '', null]]);
  const notes = data.readNotes(null, [{ player_id: '1', gamer_tag: 'Knight Artorias' }], A.id, w.tiersFile);
  assert.deepStrictEqual([notes['1'].tier, notes['1'].tier_alias], [9, '']);
  data.editTierByKey(A.id, 'p:1', { alias: 'Onyxdood' }, { tiersFile: w.tiersFile, now: NOW });
  const text = fs.readFileSync(w.tiersFile, 'utf8');
  const head = text.replace(/^﻿/, '').split('\r\n')[0];
  assert.strictEqual(head, data.TIER_COLS.map((c) => `"${c}"`).join(','), 'the column is added after sheet_tag');
  const after = read(w.tiersFile);
  assert.strictEqual(after.length, old.length, 'no row lost');
  assert.deepStrictEqual(after.map((r) => r.alias), ['Onyxdood', '', '', '', '']);
  const strip = ({ alias, source, ...r }) => r;
  assert.deepStrictEqual(after.slice(1).map(strip), old.slice(1).map(strip), 'every other row as it was');
});

test('A3 alias: "Tag (Alias)" in the Tiers view and in the tournament\'s seeding table; the Player column still sorts by tag', async () => {
  const w = world(mineRows());
  const p = await tiersPage(w, A.id);
  assert.match(p.$('tierTable').innerHTML, /<td class="who"><b>Knight Artorias<\/b> <span class="alias">\(Onyxdood\)<\/span><\/td>/);
  assert.strictEqual(M.tagWithAlias('Knight Artorias', 'Onyxdood'), 'Knight Artorias (Onyxdood)');
  assert.strictEqual(M.tagWithAlias('Knight Artorias', ''), 'Knight Artorias');
  // The tournament page: the server's view model carries the alias; the row shows it after the tag.
  makePool(w.outRoot, { t: 'tour', events: [{ slug: 'ev', game: { id: A.id, name: A.name } }],
    players: [{ player_id: '1', gamer_tag: 'Knight Artorias', prefix: '' }, { player_id: '2', gamer_tag: 'bravo', prefix: '' }] });
  const vm = (await inject(w.app.handler, { url: `/api/t/tour/g/${A.id}/data` })).json();
  assert.strictEqual(vm.notes['1'].tier_alias, 'Onyxdood');
  const ctx = R.contextFromViewModel(vm);
  const knight = R.summaryRow(vm.players.find((x) => x.player_id === '1'), ctx, { app: true });
  assert.match(knight, /<td class="who" data-v="knight artorias">[\s\S]*<b>Knight Artorias<\/b> <span class="alias">\(Onyxdood\)<\/span><\/a>/, 'shown after the tag; sorted by the tag (data-v)');
  const bravo = R.summaryRow(vm.players.find((x) => x.player_id === '2'), ctx, { app: true });
  assert.doesNotMatch(bravo, /class="alias"/, 'no alias, no parentheses');
});

test('A3 alias: never used in matching (seeding, upload linking, import); never exported', () => {
  const w = world(mineRows());
  // A start.gg player whose tag is someone's alias, with no id: no tiers row answers to it.
  const notes = data.readNotes(null, [{ player_id: '900', gamer_tag: 'Onyxdood' }, { player_id: '901', gamer_tag: 'Zed' }], A.id, w.tiersFile);
  assert.deepStrictEqual(notes, {}, 'neither Onyxdood nor Zed matches the rows carrying those aliases');
  const index = data.indexTierRows(data.readTiers(A.id, w.tiersFile));
  assert.strictEqual(data.matchTierRow(index, { player_id: '901', gamer_tag: 'Zed' }), null);
  assert.strictEqual(data.matchTierRow(index, { player_id: '902', gamer_tag: 'Charlie' }).sheet_tag, 'Charlie', 'the tag still matches as before');
  const linked = data.linkPlayers([{ player_id: '903', gamer_tag: 'Onyxdood' }], { gameId: A.id, tiersFile: w.tiersFile });
  assert.deepStrictEqual([linked.linked_by_tag.length, linked.unmatched], [0, 1]);
  // An import naming a player by my alias for him is someone new, not a conflict.
  const p = S.previewImport({ csv: theirs([[A.id, A.name, '', '', 'Onyxdood', '', '4']]), gameId: A.id, tiersFile: w.tiersFile });
  assert.deepStrictEqual([p.counts.new, p.counts.conflicts], [1, 0]);
  // The shareable file leaves the alias out, as it does notes.
  const x = S.exportTiers(A.id, { tiersFile: w.tiersFile, now: NOW });
  assert.ok(S.PRIVATE_COLS.includes('alias') && !S.SHARE_COLS.includes('alias'));
  assert.ok(!x.csv.includes('Onyxdood') && !x.csv.includes('"alias"'));
});

// ---- Import ----------------------------------------------------------------------------------------

test('A3 import: a game with no saved tiers takes the file directly, with no review, and says how many players were added', async () => {
  const w = world(mineRows());
  const C = { id: '1386' };   // a game the app knows, with no rows here
  const p = await tiersPage(w, C.id);
  await p.importFile(theirs([[C.id, 'SF6', '11', '', 'Ryu', '', '8'], [C.id, 'SF6', '12', '', 'Ken', '', '6'], [C.id, 'SF6', '13', '', 'Chun', '', '']]));
  assert.strictEqual(p.$('importPanel').hidden, true, 'no review');
  assert.strictEqual(p.$('tierMsg').textContent, `2 players added to ${p.$('tierTools').dataset.gameName}.`);
  const rows = read(w.tiersFile).filter((r) => r.game_id === C.id);
  assert.deepStrictEqual(rows.map((r) => [r.player_id, r.startgg_tag, r.tier, r.source]), [['11', 'Ryu', '8', 'import 2026-11-12 from theirs.csv'], ['12', 'Ken', '6', 'import 2026-11-12 from theirs.csv']]);
  assert.deepStrictEqual(p.order(), ['p:11', 'p:12'], 'the sheet shows them');
  assert.strictEqual(read(w.tiersFile).filter((r) => r.game_id !== C.id).length, mineRows().length, 'other games untouched');
});

test('A3 import: the diff lists only players whose tier would change, current left and incoming right (new players empty on the left); unchanged players are counted, not listed', async () => {
  const w = world(mineRows());
  const p = await tiersPage(w, A.id);
  await p.importFile(theirs([
    [A.id, A.name, '1', '', 'Knight Artorias', '', '10'],   // line 2: conflict (9 -> 10)
    [A.id, A.name, '2', '', 'bravo', '', '5'],              // line 3: unchanged
    [A.id, A.name, '4', '', 'Delta', '', '6'],              // line 4: a row with no tier here
    [A.id, A.name, '50', '', 'Newcomer', '', '2'],          // line 5: new to me
  ]));
  assert.strictEqual(p.$('importPanel').hidden, false);
  assert.strictEqual(p.$('tierTable').hidden, true, 'one thing at a time');
  assert.deepStrictEqual(p.diffKeys(), ['4', '2', '5'], 'by tag: Delta, Knight Artorias, Newcomer; bravo (unchanged) not listed');
  const body = p.$('impBody').innerHTML;
  assert.match(body, /<th colspan="2" class="cur">Current<\/th><th colspan="2" class="inc">Incoming<\/th>/);
  assert.match(body, /<tr data-key="2">[^]*?<td class="cur">Knight Artorias \(Onyxdood\)<\/td><td class="cur num"><b>9<\/b><\/td><td class="inc">Knight Artorias<\/td><td class="inc num"><b>10<\/b><\/td>/);
  assert.match(body, /<tr data-key="5">[^]*?<td class="cur empty"><\/td><td class="cur empty"><\/td><td class="inc">Newcomer<\/td><td class="inc num"><b>2<\/b><\/td>/);
  assert.match(body, /<tr data-key="4">[^]*?<td class="cur">Delta<\/td><td class="cur num"><span class="dim">—<\/span><\/td>/);
  assert.match(p.$('impNotes').innerHTML, /<p class="dim">1 unchanged player not listed\.<\/p>/);
  assert.strictEqual(p.$('impApproveAll').textContent, 'Approve all (3)');
  assert.strictEqual(fs.readFileSync(w.tiersFile, 'utf8'), out.toCsv(data.TIER_COLS, mineRows()), 'a review writes nothing');
});

test('A3 import: approve one row, a selection, or all; search by tag or alias; each approval writes only what was approved', async () => {
  const w = world(mineRows());
  const p = await tiersPage(w, A.id);
  const file = theirs([
    [A.id, A.name, '1', '', 'Knight Artorias', '', '10'],   // 2
    [A.id, A.name, '4', '', 'Delta', '', '6'],              // 3
    [A.id, A.name, '50', '', 'Newcomer', '', '2'],          // 4
    [A.id, A.name, '51', '', 'Second', '', '1'],            // 5
    [A.id, A.name, '', '', 'Charlie', '', '8'],             // 6 (tag only: Charlie, tier 3 here)
  ]);
  await p.importFile(file);
  assert.deepStrictEqual(p.diffKeys(), ['6', '3', '2', '4', '5']);
  const tierOf = (pidOrTag) => { const r = read(w.tiersFile).find((x) => x.game_id === A.id && (x.player_id === pidOrTag || x.sheet_tag === pidOrTag)); return r && r.tier; };

  // Search: by the alias I gave (Onyxdood finds Knight Artorias), then by tag.
  p.$('impSearch').value = 'onyx';
  p.$('impSearch').dispatch('input');
  assert.deepStrictEqual(p.diffKeys(), ['2']);
  assert.strictEqual(p.$('impApproveAll').textContent, 'Approve all (1)', 'Approve all means the rows listed');
  p.$('impSearch').value = 'zed';
  p.$('impSearch').dispatch('input');
  assert.deepStrictEqual(p.diffKeys(), ['6'], 'Charlie, by my alias Zed');
  p.$('impSearch').value = '';
  p.$('impSearch').dispatch('input');

  // Approve one: only Knight Artorias changes.
  await Promise.all(p.$('impBody').dispatch('click', { target: { closest: (sel) => (sel === 'button.imp-one' ? { dataset: { key: '2' } } : null) } }).results);
  await p.page.flush(10);
  assert.deepStrictEqual([tierOf('1'), tierOf('4'), tierOf('50'), tierOf('Charlie')], ['10', '', undefined, '3']);
  assert.match(p.$('impMsg').textContent, /^Approved 1 player: 0 added, 1 changed\./);
  assert.deepStrictEqual(p.diffKeys(), ['6', '3', '4', '5'], 'the approved row leaves the list');
  assert.match(p.$('impNotes').innerHTML, /1 unchanged player not listed/);

  // Select two (Delta, Second) and approve the selection.
  const tick = (key, on) => p.$('impBody').dispatch('change', { target: { closest: (sel) => (sel === 'input.imp-sel' ? { checked: on, dataset: { key } } : null) } });
  tick('3', true); tick('5', true); tick('4', true); tick('4', false);
  assert.strictEqual(p.$('impApproveSel').textContent, 'Approve selected (2)');
  assert.strictEqual(p.$('impApproveSel').disabled, false);
  await Promise.all(p.$('impApproveSel').dispatch('click').results);
  await p.page.flush(10);
  assert.deepStrictEqual([tierOf('4'), tierOf('51'), tierOf('50'), tierOf('Charlie')], ['6', '1', undefined, '3']);
  assert.deepStrictEqual(p.diffKeys(), ['6', '4']);
  assert.strictEqual(p.$('impApproveSel').textContent, 'Approve selected (0)');

  // Approve all: the rest (the tag-only match is flagged for checking, and gets the file's id when it has one).
  assert.match(p.$('impBody').innerHTML, /<tr data-key="6">[^]*?<span class="tag flag"[^>]*>check<\/span>/);
  await Promise.all(p.$('impApproveAll').dispatch('click').results);
  await p.page.flush(10);
  assert.deepStrictEqual([tierOf('50'), tierOf('Charlie')], ['2', '8']);
  assert.deepStrictEqual(p.diffKeys(), []);
  assert.match(p.$('impBody').innerHTML, /Nothing to approve: every player in the file has the same tier here\./);
  assert.strictEqual(p.$('impApproveAll').disabled, true);
  // Game B never moved; my notes and alias stayed.
  const after = read(w.tiersFile);
  assert.strictEqual(after.find((r) => r.game_id === B.id).tier, '2');
  assert.deepStrictEqual([after.find((r) => r.player_id === '1' && r.game_id === A.id).alias, after.find((r) => r.player_id === '1' && r.game_id === A.id).notes], ['Onyxdood', 'n1']);
});

test('A3 import: the A2.2 safety holds in the diff: a change since the list was made is refused (409) and the list is shown again; ambiguous rows are never offered', async () => {
  const w = world([...mineRows(), row(A, { sheet_tag: 'delta', tier: '2', source: 'sheet import' })]);
  const p = await tiersPage(w, A.id);
  await p.importFile(theirs([[A.id, A.name, '', '', 'Delta', '', '6'], [A.id, A.name, '2', '', 'bravo', '', '8']]));
  assert.deepStrictEqual(p.diffKeys(), ['3'], 'the tag naming two of my rows is not offered');
  assert.match(p.$('impNotes').innerHTML, /Not imported: one tag matches several of your players/);
  // My tiers change in another window (a seeding edit) after the list was made.
  data.editTierByKey(A.id, 'p:2', { tier: 7 }, { tiersFile: w.tiersFile, now: NOW });
  const before = fs.readFileSync(w.tiersFile, 'utf8');
  await Promise.all(p.$('impApproveAll').dispatch('click').results);
  await p.page.flush(10);
  assert.strictEqual(fs.readFileSync(w.tiersFile, 'utf8'), before, 'nothing written over the newer tiers');
  assert.match(p.$('impMsg').textContent, /^Your tiers changed since this list was made; here it is again\./);
  assert.match(p.$('impBody').innerHTML, /<td class="cur num"><b>7<\/b><\/td>/, 'the fresh list shows the current tier');
});
