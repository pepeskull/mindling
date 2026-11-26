'use strict';
const {readFile}=require('node:fs/promises');
const {runtimeFor}=require('../src/server/payment/runtime.cjs');
const {sha256}=require('../src/server/payment/identity.cjs');
const {CONTROL,HEAD,verifyJournal}=require('../src/server/payment/financial-control.cjs');
const {legacyStage}=require('../src/server/payment/energy-ledger.cjs');
const failure=require('../src/server/payment/store.cjs').failure;

const digest=/^[a-f0-9]{64}$/;
const reference=/^[A-Za-z0-9_.-]{4,96}$/;
const file=async path=>JSON.parse(await readFile(path,'utf8'));

async function main(command,path) {
  const {store,payment}=await runtimeFor();
  if(command==='pause'){
    await store.change([CONTROL],()=>({writes:[{cluster:'mainnet',state:'PAUSED',at:Date.now()}]}));
    return {state:'PAUSED'};
  }
  if(command==='review-legacy'){
    const review=await file(path);
    const {EVOLUTION_REQUIREMENTS:rules}=await import('../src/economy/energy-policy.js');
    const time=Date.now(),stage=legacyStage(review.legacy,time,rules);
    if(!digest.test(review.fingerprint||'')||!reference.test(review.reference||'')||stage<2||
       !Number.isSafeInteger(review.enteredAt)||review.enteredAt<review.legacy.createdAt||review.enteredAt>time||
       !Number.isSafeInteger(review.stageXP)||review.stageXP<0||review.stageXP>rules[stage-1].xp||
       !Array.isArray(review.milestones)||review.milestones.length>30||
       new Set(review.milestones).size!==review.milestones.length||review.milestones.some(hash=>!digest.test(hash||''))){
      throw failure('LEGACY_STAGE_REVIEW');
    }
    await store.change(['legacy-review:'+review.fingerprint,'energy:'+review.fingerprint],([prior,entry])=>{
      if(prior||entry)throw failure('LEGACY_STAGE_ALREADY_REGISTERED');
      return {writes:[{stage,historyHash:sha256(JSON.stringify(review.legacy)),enteredAt:review.enteredAt,
        stageXP:review.stageXP,milestones:review.milestones,reference:review.reference,reviewedAt:time},null]};
    });
    return {stage,state:'REVIEWED'};
  }
  if(command!=='audit'&&command!=='open')throw failure('UNKNOWN_ADMIN_COMMAND');
  const manifest=await file(path);
  if(!reference.test(manifest.reference||'')||
     !Object.hasOwn(manifest,'previous')||
     (manifest.previous===null&&manifest.genesis!==true)||
     (manifest.previous!==null&&(!digest.test(manifest.previous?.hash||'')||
       !Number.isSafeInteger(manifest.previous.sequence)||manifest.previous.sequence<1||
       !/^financial-event:[\w:-]{1,160}$/.test(manifest.previous.key||'')))){
    throw failure('PAYMENT_LEDGER_EXPORT_REQUIRED');
  }
  const result=await verifyJournal(store,manifest.previous,{onEvent:event=>payment().auditEvent(event)});
  if(command==='open'){
    if(manifest.previous===null&&result.head)throw failure('PAYMENT_LEDGER_EXPORT_REQUIRED');
    if(manifest.durabilityVerified!==true||manifest.workerReady!==true||manifest.walletReviewed!==true||
       manifest.sponsorReviewed!==true||manifest.energyReviewed!==true||manifest.marketReviewed!==true||
       manifest.activationApproved!==true)throw failure('PAYMENT_ACTIVATION_REVIEW_REQUIRED');
    const time=Date.now();
    await store.change([CONTROL,HEAD],([,head])=>{
      if(JSON.stringify(head)!==JSON.stringify(result.head))throw failure('LEDGER_BUSY',503);
      return {writes:[{cluster:'mainnet',state:'OPEN',reference:manifest.reference,
        head,verifiedUntil:time+86400000},head]};
    });
  }
  return {...result,state:command==='open'?'OPEN':'AUDITED'};
}
if(require.main===module)main(...process.argv.slice(2)).then(result=>process.stdout.write(JSON.stringify(result)+'\n')).catch(error=>{
  const code=/^[A-Z_]{1,60}$/.test(error.code||'')?error.code:'PAYMENT_ADMIN_UNAVAILABLE';
  process.stderr.write(code+'\n');process.exitCode=1;
});
