'use strict';
const {createHash, createPublicKey, randomBytes, verify} = require('node:crypto');
const {failure} = require('./store.cjs');

const HEX = /^[a-f0-9]{64}$/;
const NONCE = /^[a-f0-9]{48}$/;
const CHALLENGE_MS = 120000;
const sha256 = value => createHash('sha256').update(value).digest('hex');

function publicIdentity(jwk) {
  const coordinate = /^[\w-]{43}$/;
  if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !coordinate.test(jwk.x) ||
      !coordinate.test(jwk.y) || 'd' in jwk) throw failure('INVALID_IDENTITY', 400);
  const publicKey = {crv:'P-256', kty:'EC', x:jwk.x, y:jwk.y};
  const fingerprint = sha256(JSON.stringify(publicKey));
  const short = fingerprint.slice(0,12).toUpperCase();
  return {publicKey, fingerprint, displayId:'ML-' + short.match(/.{4}/g).join('-')};
}

function signingMessage({fingerprint, nonce, route, body, operation}) {
  return JSON.stringify(['mindling-energy-devnet-v1', fingerprint, nonce, route,
    sha256(JSON.stringify(body)), operation ?? null]);
}

function authority(store, now = Date.now) {
  return {
    async challenge(jwk) {
      const identity = publicIdentity(jwk);
      try { createPublicKey({key:identity.publicKey,format:'jwk'}); }
      catch { throw failure('INVALID_IDENTITY', 400); }
      const nonce = randomBytes(24).toString('hex');
      const saved = await store.createChallenge('nonce:' + nonce, {...identity, until:now()+CHALLENGE_MS});
      if (!saved) throw failure('IDENTITY_UNAVAILABLE', 503);
      return {nonce, fingerprint:identity.fingerprint};
    },
    async verify(headers, route, body) {
      const fingerprint = headers['x-mindling-owner'];
      const nonce = headers['x-mindling-nonce'];
      const signature = headers['x-mindling-signature'];
      const encoded = headers['x-mindling-operation'];
      if (!HEX.test(fingerprint || '') || !NONCE.test(nonce || '') || typeof signature !== 'string' ||
          !/^[a-f0-9]{128}$/.test(signature) || (encoded && (typeof encoded !== 'string' || encoded.length > 650))) {
        throw failure('AUTHENTICATION_REQUIRED', 401);
      }
      let operation = null;
      try {
        if (encoded) operation = JSON.parse(Buffer.from(encoded, 'base64url').toString());
      } catch { throw failure('INVALID_OPERATION', 400); }
      const challenge = await store.get('nonce:' + nonce);
      if (!challenge || challenge.until < now() || challenge.fingerprint !== fingerprint) throw failure('CHALLENGE_EXPIRED', 401);
      const key = createPublicKey({key:challenge.publicKey, format:'jwk'});
      const message = signingMessage({fingerprint, nonce, route, body, operation});
      if (!verify('sha256', Buffer.from(message), {key, dsaEncoding:'ieee-p1363'},Buffer.from(signature,'hex'))) {
        throw failure('INVALID_SIGNATURE', 401);
      }
      if (!(await store.consumeChallenge('nonce:' + nonce))) throw failure('CHALLENGE_EXPIRED', 401);
      return {fingerprint, displayId:challenge.displayId, publicKey:challenge.publicKey, operation};
    }
  };
}

module.exports = {authority, publicIdentity, signingMessage, sha256};
