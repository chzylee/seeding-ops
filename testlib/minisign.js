'use strict';
// testlib/minisign.js — a throwaway update signing key for tests, in the format `tauri signer`
// writes: the key and the .sig are minisign files, and Tauri hands each one around base64-encoded
// (a Tauri pubkey / signature string starts "dW50cnVzdGVkIGNvbW1lbnQ6", base64 of "untrusted
// comment:"). Layout (minisign's spec, model knowledge): public key = "Ed" + key id (8) + key (32);
// signature = "ED" (BLAKE2b-512 prehashed) or "Ed" + key id (8) + Ed25519 signature (64); then a
// trusted comment, and a global signature over signature || trusted comment.
const crypto = require('node:crypto');

function makeSigner({ keyId = crypto.randomBytes(8) } = {}) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const raw = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url');
  const idHex = Buffer.from(keyId).reverse().toString('hex').toUpperCase();
  const pubText = `untrusted comment: minisign public key: ${idHex}\n${Buffer.concat([Buffer.from('Ed'), keyId, raw]).toString('base64')}\n`;
  return {
    keyId,
    pubkey: Buffer.from(pubText).toString('base64'),
    sign(file, { prehashed = true, trusted = 'timestamp:1762400000\tfile:Seeding-Ops-windows-setup.exe' } = {}) {
      const message = prehashed ? crypto.createHash('blake2b512').update(file).digest() : file;
      const sig = crypto.sign(null, message, privateKey);
      const global = crypto.sign(null, Buffer.concat([sig, Buffer.from(trusted)]), privateKey);
      const text = `untrusted comment: signature from tauri secret key\n${Buffer.concat([Buffer.from(prehashed ? 'ED' : 'Ed'), keyId, sig]).toString('base64')}\ntrusted comment: ${trusted}\n${global.toString('base64')}\n`;
      return Buffer.from(text).toString('base64');
    },
  };
}

module.exports = { makeSigner };
