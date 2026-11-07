'use strict';
// The CSV upload's contract and resolution (docs/design-tool.md Amendment A1.3;
// dispatch-contract-tool-c.md, Acceptance 4 and 5). Offline: the Mixfest fixture
// (test/fixtures/mixfest-26-players.csv, public start.gg data) and synthetic edge cases; resolution
// runs against the fake start.gg's `user` resolver.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const U = require('../lib/upload');
const sgg = require('../lib/startgg');
const { buildWorld, createFakeFetch, virtualClock } = require('../testlib/fake-api');

const MIXFEST = fs.readFileSync(path.join(__dirname, 'fixtures', 'mixfest-26-players.csv'), 'utf8');

test('the Mixfest file: 32 rows, header detected, every discriminator kept, names split into prefix and tag, nothing malformed or duplicated', () => {
  const r = U.parseUploadCsv(MIXFEST);
  assert.strictEqual(r.header, 'name,discriminator');
  assert.strictEqual(r.rows.length, 32);
  assert.deepStrictEqual([r.duplicates, r.malformed, r.ignored_columns], [[], [], []]);
  assert.ok(r.rows.every((x) => /^[0-9a-f]{8}$/.test(x.discriminator)));
  assert.deepStrictEqual(r.rows[0], { line: 2, name: 'CHAINED | illumin', prefix: 'CHAINED', tag: 'illumin', discriminator: '2d17cccd' });
  assert.deepStrictEqual(r.rows[1], { line: 3, name: 'HZ / Polarity | Arhkma MuddyKipz', prefix: 'HZ / Polarity', tag: 'Arhkma MuddyKipz', discriminator: 'e2ce6f6f' });
  assert.deepStrictEqual(r.rows[2], { line: 4, name: 'Plummy', prefix: '', tag: 'Plummy', discriminator: 'c8d65021' });
  assert.deepStrictEqual(r.rows[31], { line: 33, name: 'Javonero', prefix: '', tag: 'Javonero', discriminator: '00fa8ffb' });
  assert.strictEqual(r.rows.filter((x) => x.prefix).length, 9, 'nine names carry a team (grep -c "|" on the file)');
});

test('discriminators: bare, user/<code>, a profile URL (with or without www, scheme, trailing path); case folded; anything else refused', () => {
  for (const v of ['abcd1234', 'ABCD1234', ' user/abcd1234 ', 'User/ABCD1234/', 'https://www.start.gg/user/abcd1234', 'http://start.gg/user/abcd1234/details',
    'start.gg/user/abcd1234?tab=x', 'www.start.gg/user/abcd1234#y']) {
    assert.strictEqual(U.normalizeDiscriminator(v), 'abcd1234', v);
  }
  for (const v of ['', 'abcd123', 'abcd12345', 'ghij1234', 'name', 'https://www.start.gg/tournament/abcd1234', 'abcd1234/extra', 'user/abcd1234/x', null]) {
    assert.strictEqual(U.normalizeDiscriminator(v), null, String(v));
  }
});

test('header optional: absent when the first row\'s second value is itself a discriminator; column names never matter', () => {
  const none = U.parseUploadCsv('Alpha,aaaa0001\nBravo,user/bbbb0002\n');
  assert.strictEqual(none.header, null);
  assert.deepStrictEqual(none.rows.map((x) => [x.line, x.tag, x.discriminator]), [[1, 'Alpha', 'aaaa0001'], [2, 'Bravo', 'bbbb0002']]);
  const named = U.parseUploadCsv('Player,start.gg\nAlpha,https://start.gg/user/aaaa0001\n');
  assert.strictEqual(named.header, 'Player,start.gg');
  assert.deepStrictEqual(named.rows.map((x) => x.discriminator), ['aaaa0001']);
});

test('duplicate discriminators collapse onto the first row, with a note naming both lines', () => {
  const r = U.parseUploadCsv('name,id\nAlpha,aaaa0001\nAlpha again,user/AAAA0001\nBravo,bbbb0002\n');
  assert.deepStrictEqual(r.rows.map((x) => x.name), ['Alpha', 'Bravo']);
  assert.deepStrictEqual(r.duplicates, [{ discriminator: 'aaaa0001', line: 3, kept_line: 2 }]);
});

test('malformed rows are reported with their line numbers, never dropped silently; the good rows around them are kept', () => {
  const text = '﻿name,discriminator\r\n'
    + 'Alpha,aaaa0001\r\n'
    + 'NoCode\r\n'                          // line 3: one column
    + 'Blank,\r\n'                          // line 4: empty second column
    + 'Bad,not-a-code\r\n'                  // line 5
    + '"Comma, Inc | Charlie",cccc0003\r\n' // line 6: quoted, comma inside
    + '\r\n'                                // line 7: blank, skipped
    + '"Two\r\nLines",dddd0004\r\n'         // lines 8-9: a line break inside quotes
    + 'Echo,eeee0005,extra\r\n'             // line 10: an extra value, ignored and listed
    + 'Broken,"ffff0006\r\n';               // line 11: an unterminated quote
  const r = U.parseUploadCsv(text);
  assert.strictEqual(r.header, 'name,discriminator');
  assert.deepStrictEqual(r.rows.map((x) => [x.line, x.prefix, x.tag, x.discriminator]), [
    [2, '', 'Alpha', 'aaaa0001'], [6, 'Comma, Inc', 'Charlie', 'cccc0003'], [8, '', 'Two\r\nLines', 'dddd0004'], [10, '', 'Echo', 'eeee0005']]);
  assert.deepStrictEqual(r.malformed.map((m) => [m.line, m.reason.split(' ')[0]]), [[3, 'no'], [4, 'no'], [5, '"not-a-code"'], [11, 'a']]);
  assert.match(r.malformed[2].reason, /not a start\.gg discriminator/);
  assert.deepStrictEqual(r.ignored_columns, [10]);
  // Every non-blank data line is accounted for: kept, duplicate or malformed.
  assert.strictEqual(r.rows.length + r.duplicates.length + r.malformed.length, 8);
});

test('names: "Team | tag" splits on the last bar; a name with no bar is the tag; an empty name is allowed (start.gg fills the tag)', () => {
  assert.deepStrictEqual(U.splitName('retiredstriver | Sarcasm1000'), { prefix: 'retiredstriver', tag: 'Sarcasm1000' });
  assert.deepStrictEqual(U.splitName('A | B | C'), { prefix: 'A | B', tag: 'C' });
  assert.deepStrictEqual(U.splitName('  Solo  '), { prefix: '', tag: 'Solo' });
  assert.deepStrictEqual(U.parseUploadCsv(',aaaa0001\n').rows[0], { line: 1, name: '', prefix: '', tag: '', discriminator: 'aaaa0001' });
  assert.deepStrictEqual(U.parseUploadCsv('').rows, []);
});

test('slugify: the page slug from the given name (ASCII, lower case, single hyphens)', () => {
  assert.strictEqual(U.slugify('Mixfest 26 — MBAACC Seeding'), 'mixfest-26-mbaacc-seeding');
  assert.strictEqual(U.slugify('Café  Night #3!'), 'cafe-night-3');
  assert.strictEqual(U.slugify('***'), '');
});

// ---- Resolution (Acceptance 5) ----------------------------------------------------------------

function client(fake) {
  const clock = virtualClock(Date.UTC(2026, 9, 30));
  const records = [];
  const c = sgg.createClient({ token: 'T', fetchImpl: fake, now: clock.now, sleep: clock.sleep, onRequest: (r) => records.push(r) });
  return { c, records };
}

test('resolution: one user lookup per row through the client; found rows carry user id, player id, current tag, prefix and location; unknown codes stay as flagged rows', async () => {
  const world = buildWorld(Date.UTC(2026, 9, 30) / 1000);
  world.extraUsers = [{ slug: 'user/0000aaaa', id: 9999 }]; // a user with no player profile
  const fake = createFakeFetch(world);
  const { c, records } = client(fake);
  const { rows } = U.parseUploadCsv('name,d\nCB | General,14364d39\nQuiet,https://start.gg/user/aaaa0003\nGhost,deadbeef\nNo Player,0000aaaa\n');
  const saved = [];
  const r = await U.resolveRows(c, rows, { onRow: (x) => saved.push(x.discriminator) });
  assert.strictEqual(r.asked, 4);
  assert.deepStrictEqual(fake.calls.map((x) => [x.op, x.variables.slug]), [['UserBySlug', 'user/14364d39'], ['UserBySlug', 'user/aaaa0003'], ['UserBySlug', 'user/deadbeef'], ['UserBySlug', 'user/0000aaaa']]);
  assert.deepStrictEqual(saved, ['14364d39', 'aaaa0003', 'deadbeef', '0000aaaa'], 'each row handed back as it resolves (saved by the caller)');
  assert.deepStrictEqual(rows[0].resolved, { status: 'found', user_id: '9001', player_id: '101', gamer_tag: 'GeneralMidwest', prefix: 'CB', region_state: 'IL', region_country: 'United States' });
  assert.deepStrictEqual(rows[1].resolved, { status: 'found', user_id: '9003', player_id: '103', gamer_tag: 'Quiet', prefix: '', region_state: '', region_country: '' });
  assert.deepStrictEqual(rows.slice(2).map((x) => x.resolved.status), ['not-found', 'not-found']);
  assert.match(rows[3].resolved.reason, /no player profile/);
  assert.ok(records.every((x) => x.op === 'UserBySlug' && x.discriminator), 'the request log names the code, never the token');
  assert.ok(!JSON.stringify(records).includes('Bearer'));
});

test('resolution is resumable: a found or not-found row is never asked again; a failed lookup is kept as an error and asked again next time; a bad token stops it', async () => {
  const world = buildWorld(Date.UTC(2026, 9, 30) / 1000);
  const { rows } = U.parseUploadCsv('a,aaaa0005\nb,aaaa0007\nc,deadbeef\n');
  const fail = createFakeFetch(world, { userBySlugFail: 'aaaa0007' });
  await U.resolveRows(client(fail).c, rows);
  assert.deepStrictEqual(rows.map((x) => x.resolved.status), ['found', 'error', 'not-found']);
  assert.strictEqual(fail.calls.filter((x) => x.variables.slug === 'user/aaaa0007').length, 5, 'the client\'s retries, then an error row');
  const again = createFakeFetch(world);
  const r = await U.resolveRows(client(again).c, rows);
  assert.strictEqual(r.asked, 1);
  assert.deepStrictEqual(again.calls.map((x) => x.variables.slug), ['user/aaaa0007']);
  assert.deepStrictEqual(rows.map((x) => x.resolved.status), ['found', 'found', 'not-found']);
  const fresh = U.parseUploadCsv('a,aaaa0005\n').rows;
  await assert.rejects(U.resolveRows(client(createFakeFetch(world, { badToken: true })).c, fresh), (e) => e.kind === 'bad-token');
  assert.strictEqual(fresh[0].resolved, undefined);
});

test('poolPlayers: found rows become registrants (start.gg tag, list prefix else start.gg prefix, the list name as alias); unresolved rows stay with the list name and no id', () => {
  const rows = [
    { line: 2, name: 'TEAM | Gen', prefix: 'TEAM', tag: 'Gen', discriminator: '14364d39', resolved: { status: 'found', user_id: '9001', player_id: '101', gamer_tag: 'GeneralMidwest', prefix: 'CB', region_state: 'IL', region_country: 'US' } },
    { line: 3, name: 'Quiet', prefix: '', tag: 'Quiet', discriminator: 'aaaa0003', resolved: { status: 'found', user_id: '9003', player_id: '103', gamer_tag: 'Quiet', prefix: 'QQ', region_state: '', region_country: '' } },
    { line: 4, name: 'Ghost', prefix: '', tag: 'Ghost', discriminator: 'deadbeef', resolved: { status: 'not-found' } },
    { line: 5, name: 'Twice', prefix: '', tag: 'Twice', discriminator: 'aaaa0099', resolved: { status: 'found', user_id: '9001', player_id: '101', gamer_tag: 'GeneralMidwest', prefix: 'CB', region_state: '', region_country: '' } },
  ];
  const ps = U.poolPlayers(rows, 22);
  assert.deepStrictEqual(ps.map((p) => [p.player_id, p.gamer_tag, p.prefix, p.user_slug, p.alias, !!p.unresolved]), [
    ['101', 'GeneralMidwest', 'TEAM', 'user/14364d39', 'TEAM | Gen', false],
    ['103', 'Quiet', 'QQ', 'user/aaaa0003', 'Quiet', false],
    ['unresolved-deadbeef', 'Ghost', '', '', 'Ghost', true],
  ]);
  assert.ok(ps.every((p) => p.events[0] === U.UPLOAD_EVENT && p.games[0] === '22'));
});

// E2-4 (build C pass 2; orchestrator ruling): the first row is the header only when its second value is
// neither a discriminator nor an attempt at one. A header-less file whose first code is mistyped used
// to lose that player as "the header" with nothing reported.
test('E2-4: a first row whose second value is an attempted discriminator is malformed at line 1, never the header; a real header is kept with its two values', () => {
  for (const bad of ['abcd123', 'abcd12g3', 'user/abcd12', 'https://start.gg/user/abc', 'www.start.gg/user/x', 'user/abcd1234/x', 'ABCD12345']) {
    const r = U.parseUploadCsv(`Alice,${bad}\nBob,bbbb0002\n`);
    assert.strictEqual(r.header, null, bad);
    assert.strictEqual(r.header_row, null, bad);
    assert.deepStrictEqual(r.malformed.map((m) => [m.line, m.text]), [[1, `Alice,${bad}`]], bad);
    assert.deepStrictEqual(r.rows.map((x) => [x.line, x.tag]), [[2, 'Bob']], bad);
  }
  for (const [h, values] of [['name,discriminator', ['name', 'discriminator']], ['Player,start.gg', ['Player', 'start.gg']], ['Name, startgg id ', ['Name', 'startgg id']],
    ['player1,column2', ['player1', 'column2']], ['tag,code', ['tag', 'code']], ['Gamertag', ['Gamertag', '']], ['who,discriminator (start.gg)', ['who', 'discriminator (start.gg)']]]) {
    const r = U.parseUploadCsv(`${h}\nBob,bbbb0002\n`);
    assert.deepStrictEqual(r.header_row, { line: 1, values }, h);
    assert.deepStrictEqual([r.rows.length, r.malformed.length], [1, 0], h);
  }
  assert.strictEqual(U.parseUploadCsv('Alpha,aaaa0001\n').header_row, null, 'no header: nothing skipped');
  // The Mixfest file's header is still a header.
  assert.deepStrictEqual(U.parseUploadCsv(MIXFEST).header_row, { line: 1, values: ['name', 'discriminator'] });
});

// Found 2026-11-06 (reproduced on 4e35890): a header-less list whose first player has a blank code
// ("Alpha,") had that row read as the header. It is a player row missing its code.
test('upload: a first row with a blank second column is a malformed player row at line 1, not the header; a one-column first row is still a header', () => {
  for (const first of ['Alpha,', 'Alpha, ', '"Alpha",""', 'Alpha,,extra']) {
    const r = U.parseUploadCsv(`${first}\nBeta,abcd1234\n`);
    assert.strictEqual(r.header, null, first);
    assert.strictEqual(r.header_row, null, first);
    assert.deepStrictEqual(r.malformed.map((m) => [m.line, m.reason]), [[1, 'no discriminator in the second column']], first);
    assert.deepStrictEqual(r.rows.map((x) => [x.line, x.tag]), [[2, 'Beta']], first);
  }
  assert.deepStrictEqual(U.parseUploadCsv('Gamertag\nBeta,abcd1234\n').header_row, { line: 1, values: ['Gamertag', ''] });
});

// Audit #9: the fix above made "Gamertag," (a header row whose second cell is empty, as a spreadsheet
// exports it) a malformed row. A column name in the first cell keeps it the header.
test('upload: a header word with an empty second cell is still the header, never a malformed row', () => {
  for (const first of ['Gamertag,', 'Name,', 'player name,', ' TAG ,', '"Gamer Tag",""', 'Players,,', 'gamer_tag,']) {
    const r = U.parseUploadCsv(`${first}\nBeta,abcd1234\n`);
    assert.strictEqual(r.header_row && r.header_row.line, 1, first);
    assert.deepStrictEqual([r.malformed.length, r.rows.length], [0, 1], first);
  }
  // A player whose name only resembles a word is still a player missing a code.
  assert.deepStrictEqual(U.parseUploadCsv('Tagger,\nBeta,abcd1234\n').malformed.map((m) => m.line), [1]);
});
