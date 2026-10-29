'use strict';
// Parity (dispatch-contract-tool.md, Acceptance 8; the owner's craft note on header/row drift):
// the CLI view (views/major-table.js), the app page and the Sheets export are built from one view
// model and one context builder, so for the same run they must show the same columns and the same
// cells. The app's only additions are its affordances: the leftmost ✓ (Seeded) column, the pin
// and compare controls, the editable-cell attributes and data-pid. This test renders a run with
// per-game majors, tiers, review marks and seeds through all three and compares them.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { toCsv, parseCsv } = require('../lib/output');
const data = require('../lib/view/data');
const M = require('../lib/view/model');
const R = require('../lib/view/render');
const { renderHtml } = require('../views/major-table');

const PLAYER_COLS = ['player_id', 'gamer_tag', 'prefix', 'user_slug', 'region_state', 'region_country', 'result_count', 'history_status', 'team_entry'];
const RESULT_COLS = ['player_id', 'gamer_tag', 'event_date', 'game_id', 'game_name', 'is_event_game', 'tournament_name', 'event_name', 'event_slug', 'event_id', 'num_entrants', 'placement', 'is_online'];
const T = 'eclipse-1st-cour', E = 'bloody-fights-mbaacc-singles', TODAY = '2026-11-03';
const MB = { id: '22407', name: 'Melty Blood Actress Again Current Code' };

function fixtureRun() {
  const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'seeding-parity-'));
  const dir = path.join(outRoot, `${T}__${E}__20261015-0925`);
  fs.mkdirSync(path.join(dir, 'views'), { recursive: true });
  const ps = [['1', 'Kouryuu', 'TEAM', 'NY'], ['2', 'Ono', '', 'NJ'], ['3', 'Fresh', '', ''], ['4', 'Sheet Only', '', 'Ontario']]
    .map(([id, tag, prefix, st]) => ({ player_id: id, gamer_tag: tag, prefix, user_slug: `u${id}`, region_state: st, region_country: st ? 'US' : '', result_count: '3', history_status: 'complete', team_entry: 'false' }));
  let ev = 900;
  const r = (pid, t, o = {}) => ({ player_id: pid, gamer_tag: `P${pid}`, event_date: '2025-01-18', game_id: MB.id, game_name: MB.name, is_event_game: 'true',
    tournament_name: t, event_name: MB.name, event_slug: '', event_id: String(ev++), num_entrants: '145', placement: '9', is_online: 'false', ...o });
  const frosty = r('1', 'Frosty Faustings XVII 2025');
  const climax = r('1', 'Climax of Night Final Season: [breakadawn]', { event_name: '[a bloody finale.] MBAACC Singles', num_entrants: '245', event_date: '2025-11-08', placement: '17' });
  const results = [
    frosty, { ...frosty, player_id: '2', placement: '25' },
    r('1', 'MBAACC 2v2 @ Frosty Faustings XVII', { event_name: 'MBAACC 2v2', num_entrants: '17', placement: '3' }),
    r('2', 'Frosty Faustings XVII 2025', { event_name: 'MBAACC Side Bracket', num_entrants: '24', placement: '1' }),
    climax, { ...climax, player_id: '3', placement: '65' },
    r('1', 'Midweek Melting 44', { num_entrants: '27', placement: '5', event_date: '2026-08-06', is_online: 'true' }),
    r('2', 'Midweek Melting 45', { num_entrants: '20', placement: '2', event_date: '2026-09-03', is_online: 'true' }),
    r('3', 'Midweek Melting 45', { num_entrants: '20', placement: '7', event_date: '2026-09-03', is_online: 'true' }),
    r('1', 'Frosty Faustings XVII 2025', { game_id: '33945', game_name: 'Guilty Gear: Strive', is_event_game: 'false', event_name: 'Guilty Gear: Strive', num_entrants: '701', placement: '33' }),
  ];
  fs.writeFileSync(path.join(dir, 'players.csv'), toCsv(PLAYER_COLS, ps));
  fs.writeFileSync(path.join(dir, 'results.csv'), toCsv(RESULT_COLS, results));
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({
    event: { id: '1635293', slug: `tournament/${T}/event/${E}`, name: '[bloody fights.] MBAACC Singles', tournament_name: 'Eclipse [1st Cour]' },
    game: MB, run_at: '2026-10-15T14:25:07.889Z', window: { start: '2024-10-15T14:25:07.889Z', end: '2026-10-15T14:25:07.889Z', days: 730 },
    registrant_count: ps.length, history_status: { complete: ps.length, limited: 0, failed: 0 },
  }));
  fs.writeFileSync(path.join(dir, 'views', 'set-records.json'), JSON.stringify({ [M.key(frosty)]: { w: 4, l: 2, dq: 0 }, [M.key(climax)]: { w: 3, l: 2, dq: 0 } }));
  fs.writeFileSync(path.join(dir, 'views', 'notes.json'), JSON.stringify({ 1: { seed: 1 }, 2: { seed: 2 } }));
  const tiersFile = path.join(outRoot, 'tiers.csv');
  const t = (o) => ({ game_id: MB.id, game_name: MB.name, player_id: '', startgg_tag: '', sheet_tag: '', tier: '', notes: '', decided_on: '', last_reviewed_on: '', last_reviewed_tournament: '', source: 'sheet import', sheet_region: '', sheet_placements: '', sheet_notes: '', ...o });
  fs.writeFileSync(tiersFile, toCsv(data.TIER_COLS, [
    t({ player_id: '1', sheet_tag: 'Kouryuu', tier: '9', notes: 'fast "starter", reads well', decided_on: '2026-10-16', last_reviewed_on: '2026-10-16', last_reviewed_tournament: T, source: 'app' }),
    t({ player_id: '2', sheet_tag: 'Ono', tier: '7', decided_on: '2026-03-01', last_reviewed_on: '2026-03-01', last_reviewed_tournament: 'climax-of-night-final', source: 'app' }),
    t({ sheet_tag: 'Sheet Only', tier: '0' }),
  ]));
  return { dir, tiersFile };
}

// The app's summary row with its affordances removed: what the CLI must print for the same player.
function withoutAppAffordances(html) {
  return html
    .replace(/^<tr data-pid="[^"]*"/, '<tr')
    .replace(/<td class="seeded"[^>]*>[\s\S]*?<\/td>/, '')
    .replace(/<input type="checkbox" class="sel"[^>]*>/, '')
    .replace(/<button class="pin"[^>]*>📌<\/button>/, '')
    .replace(/ tabindex="0" data-edit="(tier|notes)"/g, '')
    .replace('<td class="region" ', '<td ');
}

test('parity: the CLI view prints exactly the app\'s summary cells (minus the app\'s controls), header and rows, majors, tiers, recency and review marks included', () => {
  const { dir, tiersFile } = fixtureRun();
  const html = renderHtml(dir, { today: TODAY, tiersFile });
  const vm = data.viewModel(dir, { today: TODAY, tiersFile });
  const app = R.contextFromViewModel(vm, { app: true });
  const ordered = M.orderPlayers(vm.players, app.notes);

  // The columns: the app's, without its leftmost Seeded column, are the CLI's.
  const appKeys = R.summaryColumns(app).map((c) => c.key);
  const cli = { ...R.contextFromViewModel(vm, { app: false }) };
  assert.deepStrictEqual(appKeys.slice(1), R.summaryColumns(cli).map((c) => c.key));
  assert.ok(appKeys.includes('major:Frosty Faustings') && appKeys.includes('major:Climax of Night'), 'the fixture exercises per-game majors');
  assert.ok(html.includes(`<thead>${R.summaryHeadRow(cli)}</thead>`), 'CLI header = the shared header');

  // Every row: the app's row minus its controls is, byte for byte, the CLI's row, in the same order.
  const appRows = ordered.map((p) => withoutAppAffordances(R.summaryRow(p, app, { app: true })));
  assert.ok(html.includes(`<tbody>\n${appRows.join('\n')}\n</tbody>`), 'CLI rows = app rows without the app\'s controls');
  // And what those rows carry: the review mark, the recency colors and hover, the per-game majors.
  assert.match(appRows[0], /^<tr class="reviewed-row">/);
  assert.match(html, /class="tier rec-here" data-v="9" title="Last reviewed 2026-10-16 at eclipse-1st-cour \(this tournament\)"/);
  assert.match(html, /class="tier rec-old" data-v="7" title="Last reviewed 2026-03-01 at climax-of-night-final \(over 6 months ago\)"/);
  assert.match(html, /class="tier rec-never" data-v="0" title="Never reviewed/);
  assert.match(html, /<b>9th \/ 145<\/b> · 4-2 <span class="dim">'25<\/span>/, 'Frosty main event, with its W-L');
  assert.ok(!/3rd \/ 17/.test(html.split('</tbody>')[0].split('<tbody>')[1].replace(/<details[\s\S]*?<\/details>/g, '')), 'the 2v2 is not in a major cell');
});

test('parity: the Sheets export has the CLI\'s columns in order (plus the player id) and the same major cells as text', () => {
  const { dir, tiersFile } = fixtureRun();
  const vm = data.viewModel(dir, { today: TODAY, tiersFile });
  const cli = R.contextFromViewModel(vm, { app: false });
  const { csv } = data.summaryExport(dir, { tiersFile, today: TODAY });
  const rows = parseCsv(csv);
  const head = Object.keys(rows[0]);
  assert.deepStrictEqual(head, [...R.summaryColumns(cli).map((c) => c.text), 'start.gg player id']);
  const k = rows.find((r) => r['start.gg player id'] === '1');
  assert.strictEqual(k['Frosty Faustings'], "9th / 145 · 4-2 ('25)");
  assert.strictEqual(k['Climax of Night'], "17th / 245 · 3-2 ('25)");
  assert.strictEqual(rows.find((r) => r['start.gg player id'] === '2')['Frosty Faustings'], "25th / 145 · — ('25)", 'the main event, not the side bracket Ono won');
  assert.strictEqual(k.Notes, 'fast "starter", reads well', 'notes, and no "Tier reason"');
  // Row order is the page's: seeds first, then tier.
  assert.deepStrictEqual(rows.map((r) => r['start.gg player id']), M.orderPlayers(vm.players, cli.notes).map((p) => p.player_id));
  // Tier 0 is a real tier: it sorts below 1 and above untiered (Open questions default).
  assert.deepStrictEqual(rows.slice(2).map((r) => [r.Player, r.Tier]), [['Sheet Only', '0'], ['Fresh', '']]);
});
