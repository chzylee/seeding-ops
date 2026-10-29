'use strict';
// A majors list for tests (docs/design-tool.md, display rules 5 and 6), parsed by the real loader
// (lib/view/majors.js) but independent of config/majors.json, which Noah edits: a change to his
// list must not change what these tests check. The content matches the shipped file as seeded;
// test/majors.test.js pins the shipped file separately.
const { parseMajorsConfig, majorsForGame } = require('../lib/view/majors');

const EXCLUDE = ['\\bside\\b', '\\bcommunity\\b', '\\b2v2\\b', '\\bteams\\b', '\\bpre-'];
const KNOWN = [
  { label: 'CEO', pattern: '^CEO \\d{4}\\b', kind: 'known' },
  { label: 'Evo', pattern: '^EVO \\d{4}\\b', kind: 'known' },
  { label: 'Combo Breaker', pattern: '^combo breaker\\b', kind: 'known' },
  { label: 'Frosty Faustings', pattern: '^frosty faustings\\b', kind: 'known' },
];
const MBAACC_ID = '22407';
const MBAACC = [...KNOWN,
  { label: 'Climax of Night', pattern: '^climax of night\\b', kind: 'game' },
  { label: 'Eclipse', pattern: '^eclipse\\b', kind: 'game' },
];
const TEST_MAJORS_CFG = parseMajorsConfig(JSON.stringify({
  exclude: EXCLUDE,
  games: { default: { majors: KNOWN }, [MBAACC_ID]: { name: 'MBAACC', majors: MBAACC } },
}), 'testlib/majors-fixture');

// The list for one game id; '1' (the tests' usual game) gets the default list.
const majorsFor = (gameId = '1') => majorsForGame(TEST_MAJORS_CFG, gameId);

module.exports = { TEST_MAJORS_CFG, majorsFor, MBAACC_ID, EXCLUDE, KNOWN, MBAACC };
