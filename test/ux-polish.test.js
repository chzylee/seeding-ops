'use strict';
// Amendment A4 (docs/design-tool.md; docs/reviews/2026-11-21-rulings-and-polish-contract.md): the UX
// polish pass. What is testable without a browser is pinned here: the one tier maximum (both editors,
// the server and the above-10 flag), the tier marks and their legend (one map), the Tiers sheet's one
// tab stop and its arrow keys, the sort buttons, the dark tokens written twice, reduced motion, the
// contrast of the tokens the pass set, and the small riders. Nothing here touches registry/tiers.csv:
// every tiers file is a temporary one.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const out = require('../lib/output');
const data = require('../lib/view/data');
const M = require('../lib/view/model');
const R = require('../lib/view/render');
const S = require('../lib/tiers-share');
const { createApp } = require('../app/server');
const { inject } = require('../testlib/inject');
const { loadPage, makeEl, anything } = require('../testlib/fake-dom');
const { makePool } = require('../testlib/pool-fixture');
const { seedWorld, T_SLUG, E_SLUG } = require('../testlib/seed-world');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const CSS = src('app/public/app.css');
const A = { id: '22407', name: 'MBAACC' };
const NOW = new Date('2026-11-21T12:00:00Z');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'seeding-polish-'));
const row = (o) => ({ ...Object.fromEntries(data.TIER_COLS.map((c) => [c, ''])), game_id: A.id, game_name: A.name, source: 'app', ...o });

function world(rows) {
  const dir = tmp();
  const tiersFile = path.join(dir, 'tiers.csv');
  if (rows) fs.writeFileSync(tiersFile, out.toCsv(data.TIER_COLS, rows));
  const app = createApp({ outRoot: path.join(dir, 'out'), tiersFile, getToken: () => 'T', fetchImpl: async () => { throw new Error('no start.gg request expected'); }, now: () => NOW.getTime() });
  return { dir, tiersFile, app, outRoot: path.join(dir, 'out') };
}
// The Tiers view booted on a fake page (as test/tiers-view.test.js does).
async function tiersPage(w) {
  const html = (await inject(w.app.handler, { url: `/tiers?game=${A.id}` })).text;
  const answer = async (url, init = {}) => {
    const r = await inject(w.app.handler, { url, method: init.method || 'GET', headers: init.headers || {}, body: init.body || '' });
    return { status: r.status, body: r.text ? r.json() : {} };
  };
  const SRC = ['lib/view/model.js', 'lib/view/render.js', 'app/public/tiers.js'].map(src).join('\n;\n');
  const page = loadPage(SRC, { html, fetch: answer, globals: { TextEncoder } });
  await page.flush(10);
  return { html, page, table: page.document.getElementById('tierTable') };
}

// ---- The tier range: one source (UX-07 remainder, standing rule A4-6) -------------------------------

test('A4 tier range: one maximum (lib/view/model.js) for the server rule, the import, both browser editors and the flag', async () => {
  assert.strictEqual(M.MAX_TIER, 10);
  assert.strictEqual(M.MIN_TIER, 0);
  assert.strictEqual(data.MAX_TIER, M.MAX_TIER, 'the server rule reads the shared value');
  assert.strictEqual(data.MIN_TIER, M.MIN_TIER);
  assert.throws(() => data.checkTier(M.MAX_TIER + 1), /from 0 to 10/);
  assert.strictEqual(data.checkTier(M.MAX_TIER), M.MAX_TIER);
  // The Tiers sheet's editor, run: its input's max is MAX_TIER.
  const w = world([row({ player_id: '1', startgg_tag: 'Alpha', tier: '5' })]);
  const p = await tiersPage(w);
  const tr = { dataset: { key: 'p:1' } };
  const td = makeEl('td', { dataset: { edit: 'tier' } });
  td.closest = (sel) => (sel === 'tr' ? tr : sel === 'td[data-edit]' ? td : null);
  p.table.dispatch('click', { target: { closest: (sel) => (sel === 'td[data-edit]' ? td : null) } });
  assert.match(td.innerHTML, new RegExp(`<input class="ed" type="number" min="${M.MIN_TIER}" max="${M.MAX_TIER}" step="1"`));
  // The seeding table's editor, run (app/public/app.js on a fake page): its input's max is MAX_TIER, not 20.
  const sw = await seedWorld();
  const summary = makeEl('table', { id: 'summary' });
  summary.tHead = anything('thead'); summary.tBodies = [anything('pinned'), anything('main')]; summary.rows = [];
  const needsOnly = makeEl('input', { id: 'needsOnly' }); needsOnly.checked = false;
  const g = { SEED_TAB: { t: T_SLUG, game: { id: sw.gid, name: 'G' }, events: [E_SLUG], eventInfo: {} }, localStorage: anything('ls'), performance: { now: () => 0 },
    PerformanceObserver: anything('po'), IntersectionObserver: anything('io'), requestAnimationFrame: () => 0, setInterval: () => 0, clearInterval: () => {},
    Event: class { constructor(t) { this.type = t; } }, getComputedStyle: anything('gcs'), matchMedia: anything('mm'), CSS: { escape: (s) => String(s) } };
  const page = loadPage(['lib/view/model.js', 'lib/view/render.js', 'app/public/app.js'].map(src).join('\n;\n'), {
    stubMissing: true, globals: g, elements: { summary, needsOnly }, fetch: async (url, init = {}) => { const r = await inject(sw.app.handler, { url, method: init.method || 'GET', headers: init.headers || {}, body: init.body || '' }); return { status: r.status, body: r.text ? r.json() : {} }; } });
  await page.flush(10);
  page.document.documentElement = { clientWidth: 1200 };
  const cell = makeEl('td', { dataset: { edit: 'tier' } });
  cell.closest = (sel) => (sel === 'tr' ? { dataset: { pid: '101' } } : null);
  cell.getBoundingClientRect = () => ({ left: 10 });
  summary.dispatch('dblclick', { target: { closest: (sel) => (sel === 'td[data-edit]' ? cell : null) } });
  const box = page.created.find((e) => /editor-tier/.test(e.className || ''));
  assert.ok(box, 'the seeding editor opened');
  assert.match(box.innerHTML, new RegExp(`type="number" min="${M.MIN_TIER}" max="${M.MAX_TIER}" step="1"`));
  assert.doesNotMatch(src('app/public/app.js') + src('app/public/tiers.js'), /max="\d+"/, 'no hard-coded bound left in either editor');
});

// ---- Ruling A2: a stored tier above the maximum is flagged, never changed ---------------------------

test('A4 ruling A2: a stored 11 shows a mark that is not colour and words a screen reader reads, on the Tiers sheet and in the seeding table; 10 does not; nothing is written', async () => {
  const w = world([row({ player_id: '1', startgg_tag: 'Skeleton', tier: '11', source: 'sheet import 2026-10-15' }), row({ player_id: '2', startgg_tag: 'Ten', tier: '10' }), row({ player_id: '3', startgg_tag: 'Zero', tier: '0' })]);
  const before = fs.readFileSync(w.tiersFile, 'utf8');
  const p = await tiersPage(w);
  const html = p.table.innerHTML;
  const marks = [...html.matchAll(/<tr data-key="([^"]+)">(?:(?!<\/tr>).)*?class="tier-mark over"/g)].map((m) => m[1]);
  assert.deepStrictEqual(marks, ['p:1'], 'only the 11 is flagged');
  assert.match(html, /<td class="tier num over-max" tabindex="-1" data-edit="tier" aria-label="Tier for Skeleton, 11, above 10: start\.gg supports 0-10; set it within 0-10 to save"><b>11<\/b><span class="tier-mark over" aria-hidden="true" title="[^"]+">!<\/span><\/td>/);
  // The seeding table: the same mark and words, the value itself unchanged (sort and export read 11).
  const ctx = { players: [], notes: {}, tournament: 't', today: '2026-11-21' };
  const n = { tier: 11, last_reviewed_on: '', source: 'sheet import' };
  assert.match(R.tierMarks(n, ctx), /<span class="tier-mark over" aria-hidden="true">!<\/span>/);
  assert.strictEqual(R.tierCellLabel(n, ctx), '11, above 10: start.gg supports 0-10; set it within 0-10 to save, never reviewed');
  assert.match(R.tierCellTitle(n, ctx), /^Above 10: start\.gg supports tiers 0-10\./);
  assert.doesNotMatch(R.tierMarks({ tier: 10, last_reviewed_on: '2026-11-01', last_reviewed_tournament: 'x' }, ctx), /over/);
  assert.strictEqual(fs.readFileSync(w.tiersFile, 'utf8'), before, 'flag, never fix: the file is untouched');
  // The import still refuses an 11 (Amendment A3): the flag changes no rule.
  assert.throws(() => S.previewImport({ csv: 'game_id,game_name,player_id,discriminator,startgg_tag,sheet_tag,tier\n22407,MBAACC,9,,Nine,,11\n', gameId: A.id, tiersFile: w.tiersFile }), /tier "11" is not a whole number from 0 to 10/);
});

// ---- UX-01: tier marks and the legend, one map ----------------------------------------------------

test('A4 UX-01: each recency state and the tag-only match carry their own mark and words; "recent" has none; sort value and export unchanged', () => {
  const ctx = { tournament: 'here-t', today: '2026-11-21' };
  const cases = {
    here: { tier: 6, last_reviewed_on: '2026-11-20', last_reviewed_tournament: 'here-t' },
    old: { tier: 6, last_reviewed_on: '2026-01-02', last_reviewed_tournament: 'x' },
    never: { tier: 6, source: 'sheet import' },
    tag: { tier: 6, tag_only: true, source: 'sheet import' },
    recent: { tier: 6, last_reviewed_on: '2026-10-01', last_reviewed_tournament: 'x' },
  };
  for (const [state, n] of Object.entries(cases)) {
    assert.strictEqual(R.tierState(n, ctx), state);
    if (state === 'recent') { assert.strictEqual(R.tierMarks(n, ctx), ''); assert.strictEqual(R.tierCellLabel(n, ctx), ''); continue; }
    assert.strictEqual(R.tierMarks(n, ctx), `<span class="tier-mark" aria-hidden="true">${R.TIER_MARKS[state].mark}</span>`);
    assert.strictEqual(R.tierCellLabel(n, ctx), `6, ${R.TIER_MARKS[state].words}`);
  }
  assert.strictEqual(R.tierCellLabel(cases.never, ctx), '6, never reviewed', 'the contract\'s example');
  const marks = Object.values(R.TIER_MARKS).map((s) => s.mark).concat(R.OVER_MAX.mark);
  assert.strictEqual(new Set(marks).size, marks.length, 'every mark is different');
  // In the row: the mark after the number, the name in words, the hover title kept, data-v the number.
  const p = { player_id: '7', gamer_tag: 'Seven', prefix: '', country: '' };
  const c = R.summaryContext({ meta: { game: { name: 'G' } }, players: [p], rows: [], records: {}, notes: { 7: cases.never }, columns: { majors: [], shared: [] }, index: M.indexFromKeys({}, []), tournament: 'here-t', today: '2026-11-21' });
  c.app = true;
  const tr = R.summaryRow(p, c, { app: true });
  assert.match(tr, /<td class="tier rec-never" data-v="6" tabindex="0" data-edit="tier" title="Never reviewed \(tier from the sheet import\)" aria-label="6, never reviewed"><b>6<\/b><span class="tier-mark" aria-hidden="true">\?<\/span><\/td>/);
  const text = R.summaryTextTable(c, [p]);
  assert.strictEqual(text[1][text[0].indexOf('Tier')], '6', 'the export is the number, no mark');
});

test('A4 UX-01: the legend lists every state a Tier cell can take (one map), plus "no mark"', () => {
  const html = R.tierLegend(), text = R.tierLegendText();
  for (const s of [...Object.values(R.TIER_MARKS), R.OVER_MAX]) {
    const words = s.words.replace(/:.*$/, '');
    assert.ok(html.includes(`title="${words}">`) && html.includes(`${s.mark}</span> ${s.short}`), `legend html: ${s.mark} ${s.short} (title: ${words})`);
    assert.ok(text.includes(`${s.mark} ${words}`), `legend text: ${s.mark} ${words}`);
  }
  assert.match(html, /title="no mark: reviewed within the last 6 months">no mark: within 6 months</);
  // Every state the cell can take: recency's bands (lib/view/model.js recency) and the tag-only match.
  const states = ['here', 'recent', 'old', 'never', 'tag'];
  for (const st of states) assert.ok(st === 'recent' || R.TIER_MARKS[st], `${st} has a mark`);
  assert.deepStrictEqual(Object.keys(R.TIER_MARKS).sort(), states.filter((s) => s !== 'recent').sort(), 'no mark for a state the cell never takes');
});

// ---- UX-03: the Tiers sheet is one tab stop with arrow keys -------------------------------------

test('A4 UX-03: the sheet has exactly one tabindex="0"; every editable cell is named in words; the active cell is kept', () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({ key: `p:${i}`, tag: `P${i}`, alias: i % 2 ? `A${i}` : '', tier: i % 3 ? i % 11 : null, notes: i % 4 ? '' : 'line one\nline two', region: '', discriminator: '', last_reviewed_on: '' }));
  const html = R.tiersTable(rows, { col: 'tier', dir: 'desc' });
  assert.strictEqual((html.match(/tabindex="0"/g) || []).length, 1, 'one tab stop');
  assert.strictEqual((html.match(/tabindex="-1"/g) || []).length, 40 * 3 - 1);
  assert.match(html, /<td class="alias-cell" tabindex="0" data-edit="alias" aria-label="Alias for P0, empty">/, 'by default the first row\'s Alias');
  const labels = [...html.matchAll(/data-edit="\w+" aria-label="([^"]*)"/g)].map((m) => m[1]);
  assert.strictEqual(labels.length, 120);
  assert.ok(labels.every((l) => /^(Alias|Tier|Notes) for P\d+, \S/.test(l)), 'none empty');
  assert.ok(labels.includes('Notes for P4, line one line two'));
  assert.ok(labels.includes('Tier for P0, no tier'));
  const moved = R.tiersTable(rows, null, { key: 'p:7', field: 'notes' });
  assert.match(moved, /<tr data-key="p:7">.*?<td class="notes" tabindex="0" data-edit="notes"/);
  assert.strictEqual((moved.match(/tabindex="0"/g) || []).length, 1);
  assert.strictEqual(R.tiersTable(rows, null, { key: 'gone', field: 'tier' }).match(/tabindex="0"/g).length, 1, 'a row that left falls back to the first cell');
  assert.doesNotMatch(R.tiersTable([], null), /tabindex/, 'an empty sheet has no tab stop in its body');
});

test('A4 UX-03: the arrow keys (gridMove): up/down a column, left/right along a row, Home/End, Ctrl+Home/End, nothing past an edge', () => {
  const order = ['a', 'b', 'c'], f = R.SHEET_FIELDS;
  assert.deepStrictEqual(f, ['alias', 'tier', 'notes']);
  const at = (key, field) => ({ key, field });
  assert.deepStrictEqual(M.gridMove(order, f, at('a', 'tier'), 'ArrowDown'), at('b', 'tier'));
  assert.deepStrictEqual(M.gridMove(order, f, at('b', 'tier'), 'ArrowUp'), at('a', 'tier'));
  assert.deepStrictEqual(M.gridMove(order, f, at('b', 'tier'), 'ArrowRight'), at('b', 'notes'));
  assert.deepStrictEqual(M.gridMove(order, f, at('b', 'tier'), 'ArrowLeft'), at('b', 'alias'));
  assert.deepStrictEqual(M.gridMove(order, f, at('b', 'tier'), 'Home'), at('b', 'alias'));
  assert.deepStrictEqual(M.gridMove(order, f, at('b', 'tier'), 'End'), at('b', 'notes'));
  assert.deepStrictEqual(M.gridMove(order, f, at('b', 'tier'), 'Home', { ctrl: true }), at('a', 'alias'));
  assert.deepStrictEqual(M.gridMove(order, f, at('b', 'tier'), 'End', { ctrl: true }), at('c', 'notes'));
  assert.strictEqual(M.gridMove(order, f, at('a', 'alias'), 'ArrowUp'), null);
  assert.strictEqual(M.gridMove(order, f, at('c', 'notes'), 'ArrowRight'), null);
  assert.strictEqual(M.gridMove(order, f, at('a', 'alias'), 'Tab'), null, 'Tab is not a move: it leaves the sheet');
});

test('A4 UX-03: on the page, an arrow key moves focus and the tab stop to the next cell in the sheet\'s current order; Enter still opens the editor; Esc returns focus', async () => {
  const w = world([row({ player_id: '1', startgg_tag: 'Alpha', tier: '9' }), row({ player_id: '2', startgg_tag: 'Bravo', tier: '5' }), row({ player_id: '3', startgg_tag: 'Charlie', tier: '1' })]);
  const p = await tiersPage(w);
  assert.strictEqual((p.table.innerHTML.match(/tabindex="0"/g) || []).length, 1);
  const td = (key, field) => { const t = makeEl('td', { dataset: { edit: field } }); t.closest = (sel) => (sel === 'tr' ? { dataset: { key } } : sel === 'td[data-edit]' ? t : null); return t; };
  const sel = (key, field) => `tr[data-key="${key}"] td[data-edit="${field}"]`;
  const ev = p.table.dispatch('keydown', { key: 'ArrowDown', target: td('p:1', 'tier') });
  assert.ok(ev.defaultPrevented);
  const next = p.table.querySelector(sel('p:2', 'tier'));   // the sheet opens by tier, highest first: Alpha, Bravo, Charlie
  assert.strictEqual(next.focusCalls, 1, 'focus moved down to Bravo\'s Tier');
  assert.strictEqual(next.tabIndex, 0, 'and the tab stop with it');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(p.page.window.TiersView.state().active)), { key: 'p:2', field: 'tier' });
  p.table.dispatch('keydown', { key: 'ArrowRight', target: td('p:2', 'tier') });
  assert.strictEqual(p.table.querySelector(sel('p:2', 'notes')).tabIndex, 0);
  assert.strictEqual(next.tabIndex, -1, 'the old cell left the tab order');
  const edge = p.table.dispatch('keydown', { key: 'ArrowRight', target: td('p:2', 'notes') });
  assert.ok(edge.defaultPrevented, 'at the edge the key is swallowed, not a page scroll');
  // Enter opens the editor on the focused cell; Esc closes it and the redraw keeps that cell the tab stop.
  const cell = td('p:3', 'alias');
  p.table.dispatch('keydown', { key: 'Enter', target: cell });
  const input = cell.querySelector('.ed');
  assert.match(cell.innerHTML, /<div class="ed-hint">Enter saves · Esc cancels<\/div>/, 'the seeding editor\'s hint (UX-14)');
  input.dispatch('keydown', { key: 'Escape' });
  assert.match(p.table.innerHTML, /<tr data-key="p:3">.*?<td class="alias-cell" tabindex="0" data-edit="alias"/);
  assert.ok(p.table.querySelector(sel('p:3', 'alias')).focusCalls >= 1, 'focus back on the cell');
  assert.ok(!p.page.requests.some((r) => r.url === '/api/tiers/row'), 'nothing saved');
});

// ---- UX-02: sort buttons on the three kinds of table ----------------------------------------------

test('A4 UX-02: every sortable header holds a sort button (seeding table, result tables, Tiers sheet); Notes is not sortable; the CLI and compare heads are unchanged', () => {
  const p = { player_id: '7', gamer_tag: 'Seven' };
  const c = R.summaryContext({ meta: { game: { name: 'G' } }, players: [p], rows: [], records: {}, notes: {}, columns: { majors: ['Evo'], shared: [] }, index: M.indexFromKeys({}, []), tournament: 't', today: '2026-11-21' });
  c.app = true;
  const head = R.summaryHeadRow(c, { app: true });
  const ths = [...head.matchAll(/<th[^>]*data-col="([^"]+)"[^>]*>(.*?)<\/th>/g)].map((m) => [m[1], m[2]]);
  for (const [k, inner] of ths) {
    if (k === 'notes') assert.doesNotMatch(inner, /class="sort"/, 'Notes does not sort');
    else assert.match(inner, /^<button type="button" class="sort">/, `${k}: a sort button first`);
    if (k !== 'player') assert.match(inner, /<button class="freeze"/, `${k}: the freeze button stays its own`);
  }
  assert.doesNotMatch(R.summaryHeadRow(c), /class="sort"/, 'the compare panel / CLI head: no buttons');
  const res = R.resultsTable([], {}) + R.seriesTable([], {}) + R.sharedEventsTable([p, p], { rowsBy: {}, records: {}, index: M.indexFromKeys({}, []) });
  const heads = [...res.matchAll(/<th>(.*?)<\/th>/g)].map((m) => m[1]);
  assert.ok(heads.length > 0 && heads.every((h) => /^<button type="button" class="sort">/.test(h)), 'every result-table header');
  assert.strictEqual(R.sortButton('X'), '<button type="button" class="sort">X</button>');
  assert.strictEqual(R.ariaSort(1), ' aria-sort="ascending"');
  assert.strictEqual(R.ariaSort('desc'), ' aria-sort="descending"');
  assert.strictEqual(R.ariaSort(null), '');
  // The schedule's block view draws its headers with the same helper.
  assert.match(src('app/public/schedule.js'), /R\.sortButton\(/);
  assert.match(src('app/public/schedule.js'), /R\.ariaSort\(/);
});

// ---- UX-32: the dark tokens are written twice; they must agree --------------------------------------

function tokenBlock(css, selector) {
  const i = css.indexOf(selector);
  assert.ok(i >= 0, selector);
  const open = css.indexOf('{', i), close = css.indexOf('}', open);
  return Object.fromEntries([...css.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[\w-]+|color-scheme)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}
const LIGHT = tokenBlock(CSS, ':root {');
const DARK = tokenBlock(CSS, ':root[data-theme="dark"] {');
const DARK_OS = tokenBlock(CSS, ':root:not([data-theme="light"]) {');

test('A4 UX-32: the saved-dark block and the OS-dark block declare the same properties with the same values; the header comment is current', () => {
  assert.ok(Object.keys(DARK).length > 50);
  assert.deepStrictEqual(DARK_OS, DARK);
  assert.doesNotMatch(CSS.slice(0, 200), /Light only/);
});

// ---- Contrast of the tokens this pass set (WCAG formula, the owner's appendix) -------------------

const hex = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const lum = (m) => 0.2126 * lin(m[0]) + 0.7152 * lin(m[1]) + 0.0722 * lin(m[2]);
const ratio = (a, b) => { const x = lum(hex(a)), y = lum(hex(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const THEMES = { light: LIGHT, dark: { ...LIGHT, ...DARK } };

test('A4 contrast (UX-05, UX-22, UX-28, UX-01, UX-08): the pairs the contract names meet their thresholds in both themes', () => {
  const at = (t, k) => THEMES[t][k];
  for (const t of Object.keys(THEMES)) {
    // UX-05: start.gg badge, dark text on start.gg's blue.
    assert.strictEqual(at(t, '--src-startgg-bg'), '#3f80ff', `${t}: start.gg's blue kept (A1.4)`);
    assert.strictEqual(at(t, '--src-startgg-fg'), '#0b0d11');
    assert.strictEqual(+ratio(at(t, '--src-startgg-fg'), at(t, '--src-startgg-bg')).toFixed(2), 5.32);
    // UX-22: the control border, 3:1 on every surface it sits on; --line-strong unchanged.
    for (const s of ['--cell', '--bg', '--head']) assert.ok(ratio(at(t, '--ctl-line'), at(t, s)) >= 3, `${t}: --ctl-line on ${s}: ${ratio(at(t, '--ctl-line'), at(t, s)).toFixed(2)}`);
    // UX-28: the account bar's prefix takes the bar's colour when off (red) or warn (amber).
    assert.ok(ratio(at(t, '--err'), at(t, '--err-bg')) >= 4.5, `${t}: off`);
    assert.ok(ratio(at(t, '--warn-fg'), at(t, '--warn-bg')) >= 4.5, `${t}: warn`);
    // UX-01: the tier digit (and its mark, the same colour) on each recency fill.
    for (const [fg, bg] of [['--rec-here-fg', '--rec-here-bg'], ['--warn-fg', '--warn-bg'], ['--ink-2', '--rec-never-bg'], ['--tag-only-fg', '--tag-only-bg']]) {
      assert.ok(ratio(at(t, fg), at(t, bg)) >= 4.5, `${t}: ${fg} on ${bg}`);
    }
    // UX-08: the clash tags (text on the cell colour).
    assert.ok(ratio(at(t, '--clash-fg'), at(t, '--cell')) >= 4.5, `${t}: Clash`);
    assert.ok(ratio(at(t, '--warn-fg'), at(t, '--cell')) >= 4.5, `${t}: Side clash`);
  }
  assert.strictEqual(LIGHT['--line-strong'], '#c6cbd3', '--line-strong stays for dividers');
  assert.match(CSS, /#accountBar\.off \.prefix, #accountBar\.warn \.prefix \{ color: inherit; \}/);
  assert.match(CSS, /\.tier-mark \{[^}]*\}/);
  assert.doesNotMatch(/\.tier-mark \{([^}]*)\}/.exec(CSS)[1], /color|opacity/, 'the mark takes the digit\'s colour');
});

// ---- UX-11: reduced motion; UX-24: shadows -----------------------------------------------------------

test('A4 UX-11: under reduced motion the busy bar, spinners and "pulling…" chips stop, the theme fade does not run, and the shell\'s dots stand still', () => {
  const reduce = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(CSS)[1];
  assert.match(reduce, /#busyBar, \.spinner, \.busy::before \{ animation: none !important; \}/);
  const fade = CSS.indexOf('html.theme-fade, html.theme-fade *');
  assert.ok(fade > 0);
  const media = CSS.lastIndexOf('@media', fade);
  assert.match(CSS.slice(media, fade), /^@media \(prefers-reduced-motion: no-preference\) \{\s*$/, 'the fade only where motion is welcome');
  const shell = src('src-tauri/shell/index.html');
  assert.match(shell, /@media \(prefers-reduced-motion: reduce\) \{ \.dot \{ animation: none;/);
});

test('A4 UX-24: no box-shadow blurs more than 8 px (floating layers keep their 1 px border)', () => {
  const shadows = [...CSS.matchAll(/box-shadow:\s*([^;}]+)/g)].map((m) => m[1]);
  for (const sh of shadows) {
    for (const part of sh.split(/,(?![^(]*\))/)) {
      const px = [...part.matchAll(/(-?\d*\.?\d+)px/g)].map((m) => +m[1]);
      if (/inset/.test(part) || px.length < 3) continue;
      assert.ok(px[2] <= 8, `blur ${px[2]}px in "${sh}"`);
    }
  }
  for (const sel of ['.ctx-menu {', 'dialog.upload-modal {', '.game-combo ul.game-list {', '#busyPill {', '.mini-modal {', 'dialog.account-dialog {', '.editor {']) {
    const i = CSS.indexOf(sel);
    assert.match(CSS.slice(i, CSS.indexOf('}', i)), /border: 1px solid/, sel);
  }
});

// ---- Riders: skip link, read error, Dismiss, compare title, cursor, lang ----------------------------

test('A4 UX-19: the tournament page and the Tiers view open with a "Skip to table" link, before the nav', async () => {
  const w = world([row({ player_id: '1', startgg_tag: 'Alpha', tier: '9' })]);
  makePool(w.outRoot, { t: 'tour', events: [{ slug: 'ev', game: { id: A.id, name: A.name } }], players: [] });
  const tour = (await inject(w.app.handler, { url: '/t/tour' })).text;
  const tiers = (await inject(w.app.handler, { url: '/tiers' })).text;
  assert.match(tour, /<body class="app has-nav"><a class="skip-link" href="#pane">Skip to table<\/a><nav id="appNav"/);
  assert.match(tiers, /<body class="index tiers-view has-nav"><a class="skip-link" href="#tierTable">Skip to table<\/a><nav id="appNav"/);
  assert.match(src('app/public/account.js'), /insertBefore\(bar, skip \? skip\.nextSibling : document\.body\.firstChild\)/, 'the account bar goes after it');
  assert.match(CSS, /\.skip-link:focus \{ top: 6px;/);
});

test('A4 UX-20: a tiers table that cannot be read shows its message styled as an error notice (a temporary file, never the real one)', async () => {
  const w = world([row({ player_id: '1', startgg_tag: 'Alpha', tier: '9' })]);
  const real = fs.readFileSync;
  fs.readFileSync = function (p, ...rest) {
    if (path.resolve(String(p)) === path.resolve(w.tiersFile)) throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
    return real.call(this, p, ...rest);
  };
  let html;
  try { html = (await inject(w.app.handler, { url: '/tiers' })).text; } finally { fs.readFileSync = real; }
  assert.match(html, /<p id="tierReadError" class="err data-notice warn" role="alert">[^<]*EBUSY/);
  assert.match(CSS, /\.data-notice\.warn \{ background: var\(--err-bg\); border-color: var\(--err\); color: var\(--err\); \}/);
});

test('A4 UX-30: a failed Dismiss says "Couldn\'t dismiss. Try again." in the notice\'s live region and the button works again', async () => {
  // The server renders the live region beside a lasting notice's Dismiss (app/server.js noticesHtml).
  assert.match(src('app/server.js'), /Dismiss<\/button><span class="notice-msg" role="status" aria-live="polite"><\/span>/);
  // notices.js, run against a failing endpoint.
  let handler = null;
  const msg = { textContent: '' };
  const notice = { querySelector: (s) => (s === '.notice-msg' ? msg : null), remove() { throw new Error('must not be removed'); } };
  const button = { disabled: false, getAttribute: () => 'n1', closest: (s) => (s === '[data-dismiss]' ? button : s === '.data-notice' ? notice : null) };
  const box = { addEventListener: (t, fn) => { handler = fn; } };
  const ctx = { document: { querySelector: (s) => (s === 'section.data-notices' ? box : null) }, fetch: async () => ({ ok: false, status: 500 }), JSON, Error };
  vm.createContext(ctx);
  vm.runInContext(src('app/public/notices.js'), ctx);
  await handler({ target: button });
  assert.strictEqual(msg.textContent, 'Couldn’t dismiss. Try again.');
  assert.strictEqual(button.disabled, false);
});

test('A4 UX-31 / UX-27 / UX-36: the compare box says "up to 3"; a disabled button has the default cursor except while busy; the shell has lang="en"; the seed mode is plain text', () => {
  const p = { player_id: '7', gamer_tag: 'Seven' };
  const c = R.summaryContext({ meta: { game: { name: 'G' } }, players: [p], rows: [], records: {}, notes: {}, columns: { majors: [], shared: [] }, index: M.indexFromKeys({}, []), tournament: 't', today: '2026-11-21' });
  assert.match(R.summaryRow(p, c, { app: true }), /title="Select to compare \(up to 3\)"/);
  assert.match(CSS, /button:disabled \{ opacity: \.6; cursor: default; \}\r?\nhtml\.is-busy button:disabled \{ cursor: progress; \}/);
  assert.match(src('src-tauri/shell/index.html'), /<html lang="en">/);
  const seedMode = /\.seed-mode \{([^}]*)\}/.exec(CSS)[1];
  assert.doesNotMatch(seedMode, /border|background/);
});

test('A4 UX-08 / UX-02: the Schedule tab, run: with Conflicts first a clash row says "Clash" or "Side clash" in its text; the block view\'s headers are sort buttons with aria-sort', async () => {
  const w = world([]);
  makePool(w.outRoot, { t: 'tour', events: [{ slug: 'ev', game: { id: A.id, name: A.name } }], players: [] });
  const html = (await inject(w.app.handler, { url: '/t/tour' })).text;
  const table = (id) => { const t = makeEl('table', { id }); t.tHead = makeEl('thead'); t.tBodies = [makeEl('tbody')]; return t; };
  const sched = table('sched'), sched2 = table('sched2');
  const body = { tournament: { name: 'T', timezone: 'UTC' }, pulled_at: '2026-11-01T00:00:00Z', events: [{ id: 'e1', name: 'Singles', short: 'S', numEntrants: 3 }], blocks: [],
    players: [
      { tag: 'Main', entries: [{ eventId: 'e1', eventName: 'Singles', pool: 'A1', startAt: 100, wave: 'A' }], conflict: 'main' },
      { tag: 'Side', entries: [{ eventId: 'e1', eventName: 'Singles', pool: 'A2', startAt: 100, wave: 'A' }], conflict: 'side' },
      { tag: 'Calm', entries: [{ eventId: 'e1', eventName: 'Singles', pool: 'B1', startAt: 200, wave: 'B' }], conflict: null },
    ] };
  const page = loadPage(['lib/view/model.js', 'lib/view/render.js', 'app/public/schedule.js'].map(src).join('\n;\n'), {
    html, elements: { sched, sched2 }, globals: { SCHEDULE_T: 'tour', SCHEDULE_LINKED: [], Intl, localStorage: { getItem: () => null, setItem: () => {} } },
    fetch: async (url) => (/\/schedule$/.test(url) ? { status: 200, body: { ...body, status: null } } : { status: 200, body: {} }) });
  await page.flush(10);
  const $ = (id) => page.document.getElementById(id);
  assert.doesNotMatch(sched.tBodies[0].innerHTML, /clash-tag/, 'off: no tags (and no colour)');
  $('clashToggle').dispatch('click');
  const rows = sched.tBodies[0].innerHTML;
  assert.match(rows, /<tr class="clash"><td class="player">Main <span class="clash-tag" title="[^"]+">Clash<\/span>/);
  assert.match(rows, /<tr class="clash-side"><td class="player">Side <span class="clash-tag side" title="[^"]+">Side clash<\/span>/);
  assert.match(rows, /<tr><td class="player">Calm<span class="n">/, 'no tag on a row without a clash');
  assert.doesNotMatch(sched.tHead.innerHTML, /class="sort"/, 'the top table does not sort');
  $('lowerToggle').dispatch('click');
  const head = sched2.tHead.innerHTML;
  const ths = [...head.matchAll(/<th data-key="[^"]+"[^>]*>(.*?)<\/th>/g)];
  assert.ok(ths.length >= 3 && ths.every((m) => /^<button type="button" class="sort">/.test(m[1])), head);
  assert.strictEqual((head.match(/aria-sort=/g) || []).length, 1);
  assert.match(head, /<th data-key="player" class="player" aria-sort="ascending">/);
});

test('A4 repair R1: "How to read this" says what each colour and mark means, once, from the same map', () => {
  const help = R.tierHelpText();
  assert.doesNotMatch(help, /Tier marks:/, 'no stutter after the bold label');
  for (const s of Object.values(R.TIER_MARKS)) {
    const line = `${s.colour[0].toUpperCase()}${s.colour.slice(1)} with ${s.mark}: ${s.words}.`;
    assert.strictEqual(help.split(line).length, 2, `once: ${line}`);
  }
  assert.match(help, /A red ! beside the number: the stored tier is above 10 \(start\.gg supports 0-10; set it within 0-10 to save\)\./);
  assert.match(help, /No colour and no mark: reviewed within the last 6 months\.$/);
  assert.match(src('app/public/tournament.html'), /<p><b>Tier colours and marks:<\/b> <span id="legendText"><\/span><\/p>/);
  assert.match(src('app/public/tournament.js'), /\$\('legendText'\)\.textContent = window\.SeedRender\.tierHelpText\(\);/);
});
