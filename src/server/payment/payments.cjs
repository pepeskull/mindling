'use strict';
const {createCipheriv,createDecipheriv,randomBytes,hkdfSync} = require('node:crypto');
const {failure} = require('./store.cjs');
const {energyKey} = require('./energy-ledger.cjs');

const SESSION_ID=/^[a-f0-9]{48}$/;
const ACCOUNT=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const QUOTE_MS=10*60000;
const PRICE_MICROS=1990000n;
const DEVNET_FIXTURE_MICROS=100000n;
const sessionKey=id=>{
  if (typeof id!=='string'||!SESSION_ID.test(id)) throw failure('INVALID_PAYMENT_SESSION',400);
  return 'payment:'+id;
};
const sweepKey=id=>'sweep-work:'+id;
const equalOwner=(session,owner)=>{
  if (!session||session.owner!==owner) throw failure('PAYMENT_NOT_FOUND',404);
};

function encryption(material,purpose='deposit') {
  // One environment variable can hold a versioned keyring for rotation.
  const keys=typeof material==='string'&&material.startsWith('{')?JSON.parse(material):{v1:material};
  const versions=Object.keys(keys);
  if (!versions.length || versions.some(version=>!/^v[1-9]\d{0,4}$/.test(version) ||
    !/^[a-fA-F0-9]{64}$/.test(keys[version]||''))) throw failure('ENCRYPTION_UNAVAILABLE',503);
  const version=versions.sort((a,b)=>Number(b.slice(1))-Number(a.slice(1)))[0];
  const aad=session=>Buffer.from(JSON.stringify(['mindling-devnet',purpose,session.id,session.owner,session.address,session.mint]));
  const key=id=>Buffer.from(hkdfSync('sha256',Buffer.from(keys[id],'hex'),'mindling-energy-v1',purpose,32));
  return {
    seal(secret,session) {
      const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(version),iv);
      cipher.setAAD(aad(session));
      const ciphertext=Buffer.concat([cipher.update(secret),cipher.final()]);
      return {version,iv:iv.toString('hex'),tag:cipher.getAuthTag().toString('hex'),ciphertext:ciphertext.toString('hex')};
    },
    open(session) {
      const {version,iv,tag,ciphertext}=session.sealed;
      if (!keys[version]) throw failure('DEPOSIT_KEY_UNAVAILABLE',503);
      const decipher=createDecipheriv('aes-256-gcm',key(version),Buffer.from(iv,'hex'));
      decipher.setAAD(aad(session));
      decipher.setAuthTag(Buffer.from(tag,'hex'));
      return Buffer.concat([decipher.update(Buffer.from(ciphertext,'hex')),decipher.final()]);
    }
  };
}

function payments(store,ledger,chain,keys,now=Date.now) {
  if (chain.cluster!=='devnet') throw failure('PAYMENT_UNAVAILABLE',503);
  const keysFor=owner=>[energyKey(owner),'checkout:'+owner,'checkout-global'];
  const visible = row => ({
    id:row.id,cluster:chain.cluster,address:row.address,mint:row.mint,decimals:row.decimals,
    units:row.units,createdAt:row.createdAt,expiresAt:row.expiresAt,quote:'DEVNET_TEST_PRICE',
    receipt:row.receipt??null
  });
  async function create(owner,{fresh=false}={}) {
    await ledger.get(owner);
    const [energy,active,global]=keysFor(owner);
    const previous=await store.get(active);
    if (!fresh && previous?.id) {
      const row=await store.get(sessionKey(previous.id));
      if (row && (row.receipt || row.expiresAt>now())) return visible(row);
    }
    await store.rate('payment-session-attempt:'+owner,6,60);
    await store.rate('payment-session-attempt-global',30,60);
    const {mint,decimals}=await chain.mintInfo();
    const createdAt=now(),id=randomBytes(24).toString('hex');
    if (!Number.isSafeInteger(decimals)||decimals<0||decimals>9) throw failure('UNSUPPORTED_MINT',503);
    const units=(PRICE_MICROS*10n**BigInt(decimals)+DEVNET_FIXTURE_MICROS-1n)/DEVNET_FIXTURE_MICROS;
    const {secret,...deposit}=await chain.newDeposit();
    const row={id,owner,...deposit,mint,decimals,units:String(units),createdAt,expiresAt:createdAt+QUOTE_MS};
    try {row.sealed=keys.seal(secret,row);}
    finally {secret.fill(0);}
    return store.change([energy,active,global,sessionKey(id)],([entry,current,total])=>{
      if (!entry) throw failure('ENERGY_REGISTRATION_REQUIRED',401);
      if(current?.expiresAt>createdAt&&!current.credited) throw failure('PAYMENT_SESSION_ACTIVE');
      const day=Math.floor(createdAt/86400000);
      const count=current?.day===day?current.count:0;
      const all=total?.day===day?total.count:0;
      if (count>=3 || all>=100) throw failure('PAYMENT_RATE_LIMIT',429);
      return {writes:[entry,{id,day,count:count+1,expiresAt:row.expiresAt,credited:false},{day,count:all+1},row],result:visible(row)};
    });
  }
  async function current(owner) {
    const active=await store.get('checkout:'+owner);
    if (!active) return null;
    const session=await store.get(sessionKey(active.id));
    equalOwner(session,owner);
    return visible(session);
  }
  async function wallet(id,account) {
    if (typeof account!=='string'||!ACCOUNT.test(account)) throw failure('INVALID_WALLET',400);
    const key=sessionKey(id);
    const nonce=randomBytes(12).toString('hex');
    const session=await store.change([key],([row])=>{
      if(!row || row.receipt || row.expiresAt<=now()) throw failure('PAYMENT_SESSION_EXPIRED',410);
      if(row.signed) {
        if(row.account!==account) throw failure('PAYMENT_ACCOUNT_LOCKED');
        return {result:row};
      }
      if(row.buildingUntil>now()) throw failure('PAYMENT_BUILD_IN_PROGRESS');
      row.buildingUntil=now()+30000;
      row.build=nonce;
      return {writes:[row],result:row};
    });
    if(session.signed) return {transaction:session.signed.transaction,message:'Devnet MIND Energy top-up'};
    const signed=await chain.checkout(session,account);
    return store.change([key],([row])=>{
      if(!row||row.build!==nonce||row.expiresAt<=now()||row.buildingUntil<=now()) throw failure('PAYMENT_SESSION_EXPIRED',410);
      row.account=account;
      row.signed=signed;
      delete row.build;
      delete row.buildingUntil;
      return {writes:[row],result:{transaction:signed.transaction,message:'Devnet MIND Energy top-up'}};
    });
  }
  async function check(owner,id) {
    const key=sessionKey(id),row=await store.get(key);
    equalOwner(row,owner);
    if (row.receipt) return {receipt:row.receipt,energy:await ledger.get(owner)};
    if (!row.signed) throw failure('PAYMENT_AWAITING_WALLET');
    const evidence=await chain.check(row);
    if (!evidence) throw failure('PAYMENT_PENDING');
    const claim='signature:'+evidence.signature;
    return store.change([key,energyKey(owner),claim,sweepKey(id),'checkout:'+owner],([payment,entry,claimed,job,active])=>{
      equalOwner(payment,owner);
      if(payment.receipt) return {result:{receipt:payment.receipt,energy:ledger.makeView(entry)}};
      if(claimed||job||payment.signed?.signature!==evidence.signature) throw failure('PAYMENT_ALREADY_CLAIMED');
      const time=now();
      const energy=ledger.makeFull(entry,time);
      const receipt={id,paymentSignature:evidence.signature,slot:evidence.slot,mint:payment.mint,
        units:payment.units,finalizedAt:evidence.finalizedAt,creditedAt:time,energyRevision:energy.revision};
      payment.receipt=receipt;
      if(active?.id===id) active.credited=true;
      const queued={id,owner,state:'PENDING',nextAt:time};
      return {writes:[payment,entry,{id,owner},queued,active],result:{receipt,energy}};
    });
  }
  async function sweepOne(id) {
    const key=sweepKey(id),transactionKey='sweep-transaction:'+id;
    const payment=await store.get(sessionKey(id));
    if(!payment?.receipt) throw failure('PAYMENT_NOT_FOUND',404);
    const nonce=randomBytes(12).toString('hex');
    const job=await store.change([key],([row])=>{
      if(!row || row.nextAt>now() || ['UNKNOWN','FINALIZED'].includes(row.state))return {result:null};
      row.nextAt=now()+30000; row.lease=nonce;
      return {writes:[row],result:row};
    });
    if(!job)return;
    if(job.signed) {
      const status=await chain.sweepStatus(job.signed);
      await store.change([key,transactionKey],([current])=>{
        if(current?.lease!==nonce)return {result:null};
        if(status==='FINALIZED')return {writes:[null,{id,owner:payment.owner,state:status,signature:job.signed.signature,at:now()}],result:status};
        if(status==='FAILED'){
          // A finalized failure is safe to retry, but only a bounded number.
          current.failures=(current.failures||0)+1;
          current.state=current.failures>=3?'UNKNOWN':'PENDING';
          delete current.signed;
        }else if(status==='UNKNOWN')current.state='UNKNOWN';
        return {writes:[current,{id,owner:payment.owner,state:status,signature:job.signed.signature,at:now()}],result:status};
      });
      return;
    }
    const secret=keys.open(payment);
    let signed;
    try { signed=await chain.sweep(payment,secret); }
    finally {secret.fill(0);}
    const reserved=await store.change([key,transactionKey],([current])=>{
      if(current?.lease!==nonce||current.nextAt<=now())return {result:false};
      current.state='DISPATCHED';
      current.signed=signed;
      return {writes:[current,{id,owner:payment.owner,state:'DISPATCHED',signature:signed.signature,at:now()}],result:true};
    });
    if(reserved) await chain.submit(signed);
  }
  return {create,current,wallet,check,sweepOne,visible};
}

module.exports={encryption,payments,sessionKey};
