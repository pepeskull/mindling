'use strict';
const {createCipheriv,createDecipheriv,randomBytes,hkdfSync} = require('node:crypto');
const {failure} = require('./store.cjs');
const {energyKey} = require('./energy-ledger.cjs');
const {sha256}=require('./identity.cjs');
const {marketPrice,quoteUnits} = require('./market-price.cjs');
const {CONTROL,HEAD,SPONSOR,requireOpen,assertFence,eventAfter,reserveSponsor}=require('./financial-control.cjs');

const SESSION_ID=/^[a-f0-9]{48}$/;
const ACCOUNT=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const QUOTE_MS=10*60000;
const sessionKey=id=>{
  if (typeof id!=='string'||!SESSION_ID.test(id)) throw failure('INVALID_PAYMENT_SESSION',400);
  return 'payment:'+id;
};
const sweepKey=id=>'sweep-work:'+id;
const verifyKey=id=>'verify-work:'+id;
const creditEvent=id=>'financial-event:credit:'+id;
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
  const aad=session=>Buffer.from(JSON.stringify(['mindling-mainnet',purpose,session.id,session.owner,session.address,session.mint]));
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

function payments(store,ledger,chain,keys,{now=Date.now,price=marketPrice(store,{now,snapshot:chain.marketSnapshot})}={}) {
  if (chain.cluster!=='mainnet') throw failure('PAYMENT_UNAVAILABLE',503);
  const keysFor=owner=>[energyKey(owner),'checkout:'+owner,'checkout-global'];
  const visible = row => ({
    id:row.id,cluster:chain.cluster,address:row.address,mint:row.mint,decimals:row.decimals,
    units:row.units,createdAt:row.createdAt,expiresAt:row.expiresAt,priceAsOf:row.quote.asOf,
    receipt:row.receipt??null, transactionIssued:Boolean(row.signed)
  });
  async function create(owner,{fresh=false}={}) {
    await ledger.get(owner);
    const [energy,active,global]=keysFor(owner);
    const previous=await store.get(active);
    if (!fresh && previous?.id) {
      const row=await store.get(sessionKey(previous.id));
      if(row){
        equalOwner(row,owner);
        if(row.receipt||row.signed||row.expiresAt>now())return visible(row);
      }
    }
    requireOpen(await store.get(CONTROL),now());
    await store.rate('payment-session-attempt:'+owner,6,60);
    await store.rate('payment-session-attempt-global',30,60);
    const {mint,decimals,tokenProgram}=await chain.mintInfo();
    const quote=await price(mint,decimals,tokenProgram);
    const id=randomBytes(24).toString('hex'), createdAt=now();
    if(quote.mint!==mint||quote.freshUntil<=createdAt)throw failure('MARKET_PRICE_UNAVAILABLE',503);
    const units=quoteUnits(quote,decimals);
    const {secret,...deposit}=await chain.newDeposit(tokenProgram);
    const row={id,owner,...deposit,mint,decimals,tokenProgram,units,quote,createdAt,expiresAt:createdAt+QUOTE_MS};
    try {row.sealed=keys.seal(secret,row);}
    finally {secret.fill(0);}
    const created=await store.change([energy,active,global,sessionKey(id),CONTROL,HEAD],([entry,current,total,previous,control,head])=>{
      requireOpen(control,now());
      assertFence(control,head);
      if(previous)throw failure('PAYMENT_SESSION_ACTIVE');
      if (!entry) throw failure('ENERGY_REGISTRATION_REQUIRED',401);
      if(current?.expiresAt>createdAt&&!current.credited){
        if(!fresh)return {result:null};
        throw failure('PAYMENT_SESSION_ACTIVE');
      }
      const day=Math.floor(createdAt/86400000);
      const count=current?.day===day?current.count:0;
      const all=total?.day===day?total.count:0;
      if (count>=3 || all>=100) throw failure('PAYMENT_RATE_LIMIT',429);
      return {writes:[entry,{id,day,count:count+1,expiresAt:row.expiresAt,credited:false},{day,count:all+1},row,control,head],result:visible(row)};
    });
    if(created)return created;
    const recovered=await current(owner);
    if(!recovered)throw failure('PAYMENT_SESSION_ACTIVE');
    return recovered;
  }
  async function current(owner) {
    const active=await store.get('checkout:'+owner);
    if (!active) return null;
    const session=await store.get(sessionKey(active.id));
    equalOwner(session,owner);
    return visible(session);
  }
  async function open(owner,options) {
    const session=await create(owner,options);
    if(session.expiresAt<=now()||session.receipt)return {...session,payable:false,sponsored:false};
    const [control,head,tally]=await Promise.all([store.get(CONTROL),store.get(HEAD),store.get(SPONSOR)]);
    try {requireOpen(control,now());assertFence(control,head);}
    catch(error){
      if(error.code==='PAYMENTS_PAUSED')return {...session,payable:false,sponsored:false};
      throw error;
    }
    let sponsored=false;
    try {
      if(chain.sponsorEstimate){
        reserveSponsor(tally,await chain.sponsorEstimate(),now());
        sponsored=true;
      }
    }catch(error){
      if(!['SPONSOR_BUDGET_UNAVAILABLE','CHAIN_UNAVAILABLE','SPONSOR_FEE_LIMIT'].includes(error.code))throw error;
    }
    const payable=sponsored&&session.expiresAt>now();
    return {...session,payable,sponsored:payable};
  }
  async function wallet(id,account) {
    if (typeof account!=='string'||!ACCOUNT.test(account)) throw failure('INVALID_WALLET',400);
    const key=sessionKey(id),nonce=randomBytes(12).toString('hex');
    const session=await store.change([key,CONTROL,HEAD],([row,control,head])=>{
      requireOpen(control,now());
      assertFence(control,head);
      if(!row||row.receipt||row.expiresAt<=now())throw failure('PAYMENT_SESSION_EXPIRED',410);
      if(row.signed){
        if(row.account!==account)throw failure('PAYMENT_ACCOUNT_LOCKED');
        return {result:row};
      }
      if(row.buildingUntil>now())throw failure('PAYMENT_BUILD_IN_PROGRESS');
      row.buildingUntil=now()+30000;
      row.build=nonce;
      return {writes:[row,control,head],result:row};
    });
    const reply=signed=>({transaction:signed.transaction,message:'Play Mindling · $1.99 Energy top-up'});
    if(session.signed){
      if(!await chain.canSubmit(session.signed))throw failure('PAYMENT_BLOCKHASH_EXPIRED',410);
      return reply(session.signed);
    }
    await store.rate('sponsor-wallet:'+account,4,86400);
    const signed=await chain.checkout(session,account);
    if(!await chain.canSubmit(signed))throw failure('PAYMENT_BLOCKHASH_EXPIRED',410);
    const eventKey='financial-event:checkout:'+id;
    return store.change([key,CONTROL,HEAD,eventKey,SPONSOR,verifyKey(id)],([row,control,head,event,tally,job])=>{
      const time=now();
      requireOpen(control,time);
      if(!row||row.build!==nonce||row.expiresAt<=time||row.buildingUntil<=time||job)throw failure('PAYMENT_SESSION_EXPIRED',410);
      const reserved=reserveSponsor(tally,signed,time);
      assertFence(control,head);
      const next=eventAfter(head,event,{key:eventKey,type:'CHECKOUT_SIGNED',id,signature:signed.signature,
        mint:row.mint,units:row.units,fee:signed.fee,rent:signed.rent,at:time});
      row.account=account;
      row.signed=signed;
      delete row.build;
      delete row.buildingUntil;
      return {writes:[row,{...control,head:next.head},next.head,next.entry,reserved,{id,nextAt:time}],result:reply(signed)};
    });
  }
  function validatedReceipt(payment,entry,claim,event,head) {
    const receipt=payment?.receipt;
    if(!receipt||!entry||claim?.id!==payment.id||claim.owner!==payment.owner||
       claim.revision!==receipt.energyRevision||event?.type!=='CREDITED'||event.id!==payment.id||
       event.signature!==receipt.paymentSignature||event.units!==receipt.units||event.revision!==receipt.energyRevision||
       event.hash!==claim.eventHash||head?.sequence<event.sequence||!head||entry.revision<receipt.energyRevision) {
      throw failure('PAYMENT_LEDGER_REVIEW',503);
    }
    const {hash,...content}=event;
    if(sha256(JSON.stringify(content))!==hash)throw failure('PAYMENT_LEDGER_REVIEW',503);
    return {receipt,energy:ledger.makeView(entry)};
  }
  async function receiptFor(owner,id,signature) {
    return store.change([sessionKey(id),energyKey(owner),'signature:'+signature,creditEvent(id),HEAD],
      ([payment,entry,claim,event,head])=>{
        equalOwner(payment,owner);
        return {result:validatedReceipt(payment,entry,claim,event,head)};
      });
  }
  async function check(owner,id) {
    const key=sessionKey(id),row=await store.get(key);
    equalOwner(row,owner);
    if(row.receipt)return receiptFor(owner,id,row.receipt.paymentSignature);
    if(!row.signed)throw failure('PAYMENT_AWAITING_WALLET');
    requireOpen(await store.get(CONTROL),now());
    const evidence=await chain.check(row);
    if(!evidence)throw failure('PAYMENT_PENDING');
    const claim='signature:'+evidence.signature,eventKey=creditEvent(id);
    const names=[key,energyKey(owner),claim,sweepKey(id),'checkout:'+owner,CONTROL,HEAD,eventKey,verifyKey(id)];
    return store.change(names,([payment,entry,claimed,job,active,control,head,event])=>{
      equalOwner(payment,owner);
      if(payment.receipt)return {result:validatedReceipt(payment,entry,claimed,event,head)};
      const time=now();
      requireOpen(control,time);
      if(claimed||job||payment.signed?.signature!==evidence.signature)throw failure('PAYMENT_LEDGER_REVIEW',503);
      const energy=ledger.makeFull(entry,time);
      const receipt={id,paymentSignature:evidence.signature,slot:evidence.slot,mint:payment.mint,
        units:payment.units,finalizedAt:evidence.finalizedAt,creditedAt:time,energyRevision:energy.revision};
      assertFence(control,head);
      const next=eventAfter(head,event,{key:eventKey,type:'CREDITED',id,signature:evidence.signature,
        units:payment.units,mint:payment.mint,revision:energy.revision,at:time});
      payment.receipt=receipt;
      if(active?.id===id)active.credited=true;
      const queued={id,owner,state:'PENDING',nextAt:time,attempts:0};
      return {writes:[payment,entry,{id,owner,revision:energy.revision,eventHash:next.entry.hash},queued,
        active,{...control,head:next.head},next.head,next.entry,null],result:{receipt,energy}};
    });
  }
  async function verifyOne(id) {
    const key=verifyKey(id),lease=await store.change([key],([job])=>{
      if(!job||job.nextAt>now())return {result:false};
      job.nextAt=now()+60000;
      return {writes:[job],result:true};
    });
    if(!lease)return;
    const payment=await store.get(sessionKey(id));
    if(!payment?.signed)throw failure('PAYMENT_LEDGER_REVIEW',503);
    try{await check(payment.owner,id);}
    catch(error){
      if(error.code==='PAYMENT_PENDING'&&payment.expiresAt>now())return;
      // Preserve late and invalid evidence for customer support. Poll late
      // deposits less often and never start another checkout on their behalf.
      if(!['PAYMENT_PENDING','PAYMENT_TIMING_REVIEW','PAYMENT_TRANSACTION_REJECTED','PAYMENT_AMOUNT_MISMATCH'].includes(error.code))throw error;
      await store.change([key,sessionKey(id)],([job,row])=>{
        if(!job||!row||row.receipt)return {result:null};
        if(error.code==='PAYMENT_PENDING')job.nextAt=now()+3600000;
        if(error.code!=='PAYMENT_PENDING')row.review={code:error.code,checkedAt:now()};
        return {writes:[error.code==='PAYMENT_PENDING'?job:null,row]};
      });
    }
  }
  async function sweepOne(id) {
    const key=sweepKey(id),nonce=randomBytes(12).toString('hex');
    const payment=await store.get(sessionKey(id));
    if(!payment?.receipt)throw failure('PAYMENT_NOT_FOUND',404);
    await receiptFor(payment.owner,id,payment.receipt.paymentSignature);
    const job=await store.change([key,CONTROL,HEAD],([row,control,head])=>{
      requireOpen(control,now());
      assertFence(control,head);
      if(!row||row.nextAt>now()||row.state==='REVIEW')return {result:null};
      row.nextAt=now()+45000;
      row.lease=nonce;
      return {writes:[row,control,head],result:row};
    });
    if(!job)return;
    if(job.signed){
      const status=await chain.sweepStatus(job.signed);
      if(status==='PENDING'&&job.broadcasts<3&&await chain.canSubmit(job.signed)){
        return broadcast(key,nonce,job.signed);
      }
      if(status==='PENDING')return;
      const eventKey='financial-event:sweep-result:'+job.signed.signature;
      await store.change([key,CONTROL,HEAD,eventKey],([current,control,head,event])=>{
        requireOpen(control,now());
        if(current?.lease!==nonce)return {result:null};
        assertFence(control,head);
        const next=eventAfter(head,event,{key:eventKey,type:'SWEEP_'+status,id,signature:job.signed.signature,messageHash:job.signed.messageHash,at:now()});
        if(status==='FINALIZED')return {writes:[null,{...control,head:next.head},next.head,next.entry],result:status};
        current.state=status==='FAILED'&&current.attempts<3?'PENDING':'REVIEW';
        if(current.state==='PENDING')delete current.signed;
        return {writes:[current,{...control,head:next.head},next.head,next.entry],result:status};
      });
      return;
    }
    const secret=keys.open(payment);
    let signed;
    try{signed=await chain.sweep(payment,secret);}
    finally{secret.fill(0);}
    if(!await chain.canSubmit(signed))return;
    const eventKey='financial-event:sweep-signed:'+signed.signature;
    const reserved=await store.change([key,CONTROL,HEAD,eventKey,SPONSOR],([current,control,head,event,tally])=>{
      const time=now();
      requireOpen(control,time);
      if(current?.lease!==nonce||current.nextAt<=time)return {result:false};
      const sponsor=reserveSponsor(tally,signed,time);
      assertFence(control,head);
      const next=eventAfter(head,event,{key:eventKey,type:'SWEEP_SIGNED',id,signature:signed.signature,
        fee:signed.fee,rent:signed.rent,at:time});
      current.state='PREPARED';
      current.signed=signed;
      current.broadcasts=0;
      current.attempts++;
      return {writes:[current,{...control,head:next.head},next.head,next.entry,sponsor],result:true};
    });
    if(reserved)await broadcast(key,nonce,signed);
  }
  async function broadcast(key,nonce,signed){
    const reserved=await store.change([key,CONTROL,HEAD],([job,control,head])=>{
      requireOpen(control,now());
      assertFence(control,head);
      if(job?.lease!==nonce||job.nextAt<=now()||job.signed.signature!==signed.signature||job.broadcasts>=3)return {result:false};
      job.broadcasts++;
      job.state='DISPATCHED';
      return {writes:[job,control,head],result:true};
    });
    // Identical signed bytes have the same Solana signature and execution id.
    // A crash or missing RPC response never authorizes a second signature.
    if(reserved)await chain.submit(signed);
  }
  async function auditEvent(event){
    if(event.type==='CREDITED'){
      const row=await store.get(sessionKey(event.id));
      const {receipt}=await receiptFor(row?.owner,event.id,event.signature);
      const checked=await chain.check(row);
      if(!checked||checked.signature!==receipt.paymentSignature||checked.slot!==receipt.slot||
         checked.finalizedAt!==receipt.finalizedAt)throw failure('PAYMENT_LEDGER_REVIEW',503);
    }else if(event.type==='SWEEP_FINALIZED'){
      if(await chain.sweepStatus({signature:event.signature,messageHash:event.messageHash,lastValidBlockHeight:0})!=='FINALIZED'){
        throw failure('PAYMENT_LEDGER_REVIEW',503);
      }
    }
  }
  return {create,current,open,wallet,check,sweepOne,verifyOne,auditEvent,visible};
}

module.exports={encryption,payments,sessionKey};
