'use strict';
// lib/token.js — find the start.gg token without ever printing it.
// Order: the STARTGG_TOKEN environment variable, then STARTGG_TOKEN in <repo>/.env.
// A hosted runtime injects the variable directly, so the .env step simply finds nothing there.

const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');

function loadToken({ env = process.env, envFile } = {}) {
  const fromEnv = (env.STARTGG_TOKEN || '').trim();
  if (fromEnv) return { token: fromEnv, source: 'environment' };
  if (envFile && fs.existsSync(envFile)) {
    const parsed = parseEnv(fs.readFileSync(envFile, 'utf8'));
    const fromFile = (parsed.STARTGG_TOKEN || '').trim();
    if (fromFile) return { token: fromFile, source: path.basename(envFile) };
  }
  return { token: '', source: null };
}

// Save a token into <repo>/.env (Noah, 2026-11-05: the app asks for one on first launch). The
// existing file is kept line for line; the STARTGG_TOKEN line is replaced (or appended); written to
// a temp file and renamed. Never logs the value. The environment variable, when set, still wins at
// read time, and callers say so.
function saveToken({ envFile, token }) {
  const t = String(token || '').trim();
  if (!t) throw new Error('empty token');
  let lines = [];
  if (fs.existsSync(envFile)) lines = fs.readFileSync(envFile, 'utf8').replace(/^﻿/, '').split(/\r?\n/);
  // One STARTGG_TOKEN line, where the first one was. loadToken (node:util parseEnv) takes the LAST
  // of several, so replacing only the first left an older duplicate below it winning: the token just
  // saved was silently ignored. Every other STARTGG_TOKEN line is dropped.
  let done = false;
  lines = lines.flatMap((l) => {
    if (!/^\s*(export\s+)?STARTGG_TOKEN\s*=/.test(l)) return [l];
    if (done) return [];
    done = true;
    return [`STARTGG_TOKEN=${t}`];
  });
  if (!done) { if (lines.length && lines[lines.length - 1] !== '') lines.push(''); lines.push(`STARTGG_TOKEN=${t}`); }
  const text = lines.join('\n').replace(/\n*$/, '\n');
  const tmp = envFile + '.tmp';
  fs.writeFileSync(tmp, text, { mode: 0o600 });
  fs.renameSync(tmp, envFile);
  return { file: path.basename(envFile) };
}

// What a failed check means for the person: 'rejected' (start.gg said no to this token: connect
// again) or 'unreachable' (offline, rate limited, start.gg down or answering oddly: the token may be
// fine, so nobody is asked to paste a new one). Only 'bad-token' is a rejection.
const stateOf = (kind) => (kind === 'bad-token' ? 'rejected' : 'unreachable');
const MESSAGES = {
  'bad-token': 'start.gg rejected this token. Check it was copied whole, or make a new one.',
  'rate-limited': 'start.gg is limiting requests right now (rate limit). Try again in a minute.',
  'time-budget': 'start.gg is limiting requests right now (rate limit). Try again in a minute.',
  server: 'start.gg had an error answering. Try again in a minute.',
};

// One request, one try: who this token belongs to. { ok: true, as, ... } or
// { ok: false, kind, state, message }. A rate limit is not retried here (it is retried later, on the
// next check); a pull still retries it as always.
async function validateToken({ token, fetchImpl, now, sleep }) {
  const sgg = require('./startgg');
  const client = sgg.createClient({ token, fetchImpl, now, sleep });
  try {
    // Who the token belongs to, with the profile picture for the account bar (User.images(type:
    // "profile"), model knowledge of the schema; a missing picture is simply null).
    const d = await client.request('CurrentUser', 'query CurrentUser { currentUser { id slug player { id gamerTag prefix } images(type: "profile") { url } } }', {}, {}, { retry: false, maxTries: 1 });
    const u = d && d.currentUser;
    if (!u) return { ok: false, kind: 'bad-token', state: 'rejected', message: 'start.gg did not recognise this token.' };
    const img = Array.isArray(u.images) && u.images[0] && typeof u.images[0].url === 'string' && /^https:\/\//.test(u.images[0].url) ? u.images[0].url : null;
    return { ok: true, as: (u.player && u.player.gamerTag) || `user ${u.id}`, prefix: (u.player && u.player.prefix) || null, image: img, slug: u.slug || null,
      user_id: String(u.id), player_id: u.player ? String(u.player.id) : null };
  } catch (err) {
    const kind = err && err.kind ? err.kind : 'network';
    const message = MESSAGES[kind] || (kind === 'network' ? `start.gg could not be reached. Check the connection and try again. (${err.message})` : `start.gg answered with an error (${kind}): ${err.message}`);
    return { ok: false, kind, state: stateOf(kind), message };
  }
}

module.exports = { loadToken, saveToken, validateToken, stateOf };
