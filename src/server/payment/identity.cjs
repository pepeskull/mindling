'use strict';
const {createHash, createPublicKey, randomBytes, verify} = require('node:crypto');
const {failure} = require('./store.cjs');

const HEX = /^[a-f0-9]{64}$/;
const NONCE = /^[a-f0-9]{48}$/;
const CHALLENGE_MS = 120000;
const SESSION_MS = 300000;
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

function signingMessage({fingerprint, nonce, route, body, operation, session}) {
  return JSON.stringify(['mindling-energy-mainnet-v1', fingerprint, nonce, route,
    sha256(JSON.stringify(body)), operation ?? null, ...(session?[session]:[])]);
}

function authority(store, now = Date.now, ticketCipher) {
  const ticketScope=(id,owner)=>({id,owner,address:'authentication',mint:'mainnet'});
  return {
    async challenge(jwk,useTicket=false) {
      const identity = publicIdentity(jwk);
      try { createPublicKey({key:identity.publicKey,format:'jwk'}); }
      catch { throw failure('INVALID_IDENTITY', 400); }
      const nonce = randomBytes(24).toString('hex');
      const issued=now();
      const expiresAt=issued+SESSION_MS;
      if(useTicket&&ticketCipher){
        const key=ticketCipher.seal(Buffer.from(JSON.stringify({publicKey:identity.publicKey,expiresAt})),
          ticketScope(nonce,identity.fingerprint));
        return {nonce,fingerprint:identity.fingerprint,expiresAt,ticket:Buffer.from(JSON.stringify(key)).toString('base64url')};
      }
      const saved = await store.createChallenge('nonce:' + nonce, {...identity, until:issued+CHALLENGE_MS, expiresAt},SESSION_MS);
      if (!saved) throw failure('IDENTITY_UNAVAILABLE', 503);
      return {nonce, fingerprint:identity.fingerprint, expiresAt};
    },
    async verify(headers, route, body, rateKey) {
      const fingerprint = headers['x-mindling-owner'];
      const nonce = headers['x-mindling-nonce'];
      const signature = headers['x-mindling-signature'];
      const encoded = headers['x-mindling-operation'];
      const session = headers['x-mindling-session'];
      const ticket=headers['x-mindling-ticket'];
      if (!HEX.test(fingerprint || '') || !NONCE.test(nonce || '') || (session!==undefined&&(typeof session!=='string'||!NONCE.test(session))) || typeof signature !== 'string' ||
          !/^[a-f0-9]{128}$/.test(signature) || (encoded && (typeof encoded !== 'string' || encoded.length > 650))) {
        throw failure('AUTHENTICATION_REQUIRED', 401);
      }
      let operation = null;
      try {
        if (encoded) operation = JSON.parse(Buffer.from(encoded, 'base64url').toString());
      } catch { throw failure('INVALID_OPERATION', 400); }
      let challenge;
      if(ticket!==undefined){
        if(typeof ticket!=='string'||!/^[A-Za-z0-9_-]{160,1100}$/.test(ticket)||!session||!ticketCipher)
          throw failure('AUTHENTICATION_REQUIRED',401);
        try{
          const sealed=JSON.parse(Buffer.from(ticket,'base64url'));
          const decoded=JSON.parse(ticketCipher.open({...ticketScope(session,fingerprint),sealed}));
          challenge={...publicIdentity(decoded.publicKey),expiresAt:decoded.expiresAt};
        }catch{throw failure('CHALLENGE_EXPIRED',401);}
      }else challenge=await store.get('nonce:'+(session||nonce));
      const deadline=session?challenge?.expiresAt:challenge?.until;
      if (!Number.isSafeInteger(deadline)||deadline<=now()||challenge.fingerprint!==fingerprint) throw failure('CHALLENGE_EXPIRED',401);
      const key = createPublicKey({key:challenge.publicKey, format:'jwk'});
      const message = signingMessage({fingerprint, nonce, route, body, operation, session});
      if (!verify('sha256', Buffer.from(message), {key, dsaEncoding:'ieee-p1363'},Buffer.from(signature,'hex'))) {
        throw failure('INVALID_SIGNATURE', 401);
      }
      const ttl=deadline-now();
      if(ttl<=0)throw failure('CHALLENGE_EXPIRED',401);
      let accepted;
      if(session){
        const replayKey='used:'+session+':'+nonce;
        accepted=rateKey?await store.claimSession(replayKey,ttl,rateKey,90,60):
          await store.createChallenge(replayKey,true,ttl);
      }else accepted=await store.consumeChallenge('nonce:'+nonce);
      if(!accepted)throw failure('CHALLENGE_EXPIRED',401);
      return {fingerprint, displayId:challenge.displayId, publicKey:challenge.publicKey, operation};
    }
  };
}

module.exports = {authority, publicIdentity, signingMessage, sha256};
