'use strict';
const {failure}=require('./store.cjs');
const {sha256}=require('./identity.cjs');

const CONTROL='financial-control';
const HEAD='financial-head';
const WORKER='payment-worker-ready';
const SPONSOR='financial-sponsor';
const DAY=86400000;
const MAX_DAILY_LAMPORTS=250000000;
const TREASURY_RESERVE=10000000;
const MAX_SIGNING_EXPOSURE=4000000;

function requireOpen(control) {
  if(control?.state==='PAUSED')throw failure('PAYMENTS_PAUSED',503);
}

function requireWorker(status,now) {
  if(status?.mode!=='event-driven-v1'||!Number.isSafeInteger(status.at)||status.at>now+5000||status.at<now-120000)
    throw failure('PAYMENT_RECOVERY_UNAVAILABLE',503);
}

function assertFence(control,head) {
  if(JSON.stringify(control?.head??null)!==JSON.stringify(head??null))throw failure('PAYMENT_LEDGER_REVIEW',503);
}
function eventAfter(head, prior, event) {
  if(prior)throw failure('PAYMENT_LEDGER_REVIEW',503);
  if(head&&(!Number.isSafeInteger(head.sequence)||!head.key||!/^[a-f0-9]{64}$/.test(head.hash))) {
    throw failure('PAYMENT_LEDGER_REVIEW',503);
  }
  const entry={...event,sequence:(head?.sequence??0)+1,previous:head??null};
  const hash=sha256(JSON.stringify(entry));
  return {entry:{...entry,hash},head:{sequence:entry.sequence,key:event.key,hash}};
}

function reserveSponsor(tally,signed,now) {
  const {fee, rent, treasuryLamports}=signed;
  if(![fee,rent,treasuryLamports].every(value=>Number.isSafeInteger(value)&&value>=0)||
      fee<5000||fee>15000||fee+rent>MAX_SIGNING_EXPOSURE)throw failure('SPONSOR_FEE_LIMIT',503);
  const day=Math.floor(now/DAY);
  const totals=tally?.day===day?tally:{day,today:0,yesterday:tally?.day===day-1?tally.today:0};
  if(totals.today+fee+rent>MAX_DAILY_LAMPORTS||
     treasuryLamports<TREASURY_RESERVE+totals.today+totals.yesterday+fee+rent) {
    throw failure('SPONSOR_BUDGET_UNAVAILABLE',503);
  }
  return {...totals,today:totals.today+fee+rent};
}

async function verifyJournal(store,expected=null,{limit=2000,onEvent=()=>{}}={}) {
  const head=await store.get(HEAD);
  let cursor=head,checked=0;
  while(cursor&&(!expected||cursor.hash!==expected.hash||cursor.sequence!==expected.sequence||cursor.key!==expected.key)){
    if(++checked>limit)throw failure('PAYMENT_LEDGER_EXPORT_REQUIRED',503);
    const event=await store.get(cursor.key);
    if(!event)throw failure('PAYMENT_LEDGER_REVIEW',503);
    const {hash,...entry}=event;
    if(hash!==cursor.hash||sha256(JSON.stringify(entry))!==hash||entry.key!==cursor.key||entry.sequence!==cursor.sequence||
       (entry.previous?.sequence??0)!==cursor.sequence-1)throw failure('PAYMENT_LEDGER_REVIEW',503);
    await onEvent(event);
    cursor=entry.previous;
  }
  if(expected){
    const event=cursor&&await store.get(cursor.key);
    if(!event)throw failure('PAYMENT_LEDGER_REVIEW',503);
    const {hash,...entry}=event;
    if(hash!==cursor.hash||sha256(JSON.stringify(entry))!==hash)throw failure('PAYMENT_LEDGER_REVIEW',503);
  }
  return {head,checked};
}

module.exports={CONTROL,HEAD,SPONSOR,WORKER,requireOpen,requireWorker,assertFence,eventAfter,reserveSponsor,verifyJournal};
