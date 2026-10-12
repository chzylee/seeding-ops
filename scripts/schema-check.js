#!/usr/bin/env node
'use strict';
// scripts/schema-check.js — the design's open "to check" items, answered from the live schema.
// LIVE: needs STARTGG_TOKEN. About 4 requests.
//   node scripts/schema-check.js [--user <user id>]
//
// 1. Is Player.recentStandings(videogameId) optional?  (design, Data source step 4)
//    -> if yes, set ALL_GAMES_FALLBACK = true in lib/startgg.js.
// 2. What can UserEventsPaginationQuery.filter take? Any date / "past" filter?  (step 3)
// 3. queryComplexity of the real UserEvents query at the configured perPage, for one user.

const path = require('node:path');
const sgg = require('../lib/startgg');
const { loadToken } = require('../lib/token');

const typeArgs = (name) => `query SchemaType${name} { __type(name: "${name}") {
  name kind
  fields { name args { name type { kind name ofType { kind name } } } }
  inputFields { name type { kind name ofType { kind name ofType { kind name } } } }
} }`;

function typeStr(t) {
  if (!t) return '?';
  if (t.kind === 'NON_NULL') return typeStr(t.ofType) + '!';
  if (t.kind === 'LIST') return '[' + typeStr(t.ofType) + ']';
  return t.name;
}

async function main() {
  const args = process.argv.slice(2);
  const { token } = loadToken({ envFile: path.join(__dirname, '..', '.env') });
  if (!token) { console.error('No STARTGG_TOKEN. Paste it into .env first.'); return 2; }
  const client = sgg.createClient({ token });

  const player = (await client.request('SchemaTypePlayer', typeArgs('Player'), {})).__type;
  const rs = player.fields.find((f) => f.name === 'recentStandings');
  console.log('Player.recentStandings args:', rs ? rs.args.map((a) => `${a.name}: ${typeStr(a.type)}`).join(', ') : 'NOT FOUND');
  const vg = rs && rs.args.find((a) => a.name === 'videogameId');
  console.log(`  -> videogameId optional: ${vg ? vg.type.kind !== 'NON_NULL' : 'n/a'}`);

  for (const name of ['UserEventsPaginationQuery', 'UserEventsPaginationFilter']) {
    const t = (await client.request('SchemaType' + name, typeArgs(name), {})).__type;
    console.log(`${name}:`, t ? (t.inputFields || []).map((f) => `${f.name}: ${typeStr(f.type)}`).join(', ') : 'NOT FOUND');
  }

  const userId = args.includes('--user') ? args[args.indexOf('--user') + 1] : null;
  if (userId) {
    const before = client.stats.complexityMax;
    await sgg.fetchUserEventsPage(client, userId, 1);
    console.log(`UserEvents perPage ${sgg.USER_EVENTS_PER_PAGE}: queryComplexity max now ${client.stats.complexityMax} (was ${before})`);
  }
  console.log(`${client.stats.requests} requests`);
  return 0;
}

main().then((c) => { process.exitCode = c; }, (e) => { console.error(e.message); process.exitCode = 1; });
