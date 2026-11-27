import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createPrivateKey, sign} from 'node:crypto';
import {createLocalIdentity} from '../src/identity/identity.js';
import {cacheEnergy} from '../src/payment/energy-client.js';
import storeModule from '../src/server/payment/store.cjs';
import identityModule from '../src/server/payment/identity.cjs';
import ledgerModule from '../src/server/payment/energy-ledger.cjs';
import paymentModule from '../src/server/payment/payments.cjs';
import runtimeModule from '../src/server/payment/runtime.cjs';
import marketModule from '../src/server/payment/market-price.cjs';
import pumpModule from '../src/server/payment/pump-market.cjs';
import financialModule from '../src/server/payment/financial-control.cjs';
import solanaModule from '../src/server/payment/solana.cjs';
import * as solana from '@solana/kit';
import * as spl from '@solana-program/token';

const {redisStore}=storeModule;
const {authority,publicIdentity,signingMessage,sha256}=identityModule;
const {energyLedger}=ledgerModule;
const {encryption,payments,depositWallets}=paymentModule;
const {marketPrice,quoteUnits,SOL_USD}=marketModule;
const {CONTROL,HEAD,WORKER,verifyJournal}=financialModule;
const {protect,energyHandler,runtimeFor,LEARN,REASON}=runtimeModule;
const nowBase=Date.UTC(2026,10,26,13);
const day=86400000, interval=720000;
const own={fingerprint:sha256('owner fixture'),displayId:'ML-0000-0000-0000',publicKey:{}};
const id=value=>sha256(String(value));

function memoryRedis() {
  const values=new Map();
  let compareAttempts=0;
  const fetcher=async (_url,{body})=>{
    const [operation,...args]=JSON.parse(body);
    let result;
    switch(operation) {
      case 'GET':result=values.get(args[0])??null; break;
      case 'MGET':result=args.map(key=>values.get(key)??null);break;
      case 'GETDEL':result=values.get(args[0])??null;values.delete(args[0]);break;
      case 'SET':
        if(args[2]==='NX'&&values.has(args[0]))result=null;
        else {values.set(args[0],args[1]);result='OK';}
        break;
      case 'SCAN':result=['0',[...values.keys()].filter(key=>key.startsWith(args[2].slice(0,-1)))];break;
      case 'EVAL': {
        const [script,length,...rest]=args;
        if(script.includes('mindling-replay-rate')){
          const n=Number(values.get(rest[1])||0)+1;
          values.set(rest[1],String(n));
          if(n>Number(rest[3])){result=-1;break;}
          if(values.has(rest[0])){result=0;break;}
          values.set(rest[0],'true');result=1;break;
        }
        if(script.includes('INCR')){
          result=Number(values.get(rest[0])||0)+1;
          values.set(rest[0],String(result));break;
        }
        compareAttempts++;
        const keys=rest.slice(0,length), argv=rest.slice(length);
        result=keys.every((key,index)=>(values.get(key)||'')===argv[index*2])?1:0;
        if(result===1&&!script.includes('read-only compare')){
          keys.forEach((key,index)=>{
            const value=argv[index*2+1];
            if(value===(values.get(key)||''))return;
            if(value)values.set(key,value);else values.delete(key);
          });
        }
        break;
      }
      default:throw Error('Unexpected Redis command '+operation);
    }
    return Response.json({result});
  };
  const store=redisStore({url:'https://redis.invalid',token:'mock',fetcher});
  return {store,values,get compareAttempts(){return compareAttempts;}};
}
async function setup() {
  const redis=memoryRedis();
  let time=nowBase;
  const clock=()=>time,ledger=await energyLedger(redis.store,clock);
  return {...redis,redis,clock,ledger,tick:ms=>time+=ms};
}
const operation=(identifier,kind,phase=kind,requestId=phase)=>({
  id:id(identifier),kind,phase,requestId,bodyHash:id(identifier+requestId)
});
const confirmed=(ledger,principal,request,qualification={spend:true,xp:0})=>ledger.record(
  principal,request.id,request.requestId,{status:200,body:{}},{qualification}
);

const authorize=(ledger,principal,id,cost,memoryHashes,awardedXP=0)=>
  ledger.authorizeCommit(principal,id,{cost,memoryHashes,awardedXP});
async function settle(ledger,principal,id,cost,memoryHashes,awardedXP=0){
  const {approval}=await authorize(ledger,principal,id,cost,memoryHashes,awardedXP);
  return ledger.settle(principal,id,approval);
}

test('P-256 challenge verifies full fingerprint, binds request and cannot be reused', async()=>{
  const {store,clock}=await setup();
  const auth=authority(store,clock);
  const local=await createLocalIdentity();
  const identity=publicIdentity(local.publicKey);
  assert.equal(identity.displayId,local.mindlingId);
  const body={action:'state'}, route='/api/mindling/energy';
  const {nonce}=await auth.challenge(local.publicKey);
  const signature=sign('sha256',Buffer.from(signingMessage({...identity,nonce,route,body})),{
    key:createPrivateKey({key:local.privateKey,format:'jwk'}),dsaEncoding:'ieee-p1363'
  }).toString('hex');
  const headers={'x-mindling-nonce':nonce,'x-mindling-signature':signature,'x-mindling-owner':identity.fingerprint};
  await assert.rejects(auth.verify(headers,route,{action:'register'}),{code:'INVALID_SIGNATURE'});
  const results=await Promise.allSettled([auth.verify(headers,route,body),auth.verify(headers,route,body)]);
  assert.equal(results.filter(item=>item.status==='fulfilled').length,1);
  assert.equal(results.find(item=>item.status==='rejected').reason.code,'CHALLENGE_EXPIRED');
});

test('a reusable P-256 session consumes each signed nonce once and expires without a new dispatch',async()=>{
  const {store,clock,tick}=await setup();
  const auth=authority(store,clock),local=await createLocalIdentity(),identity=publicIdentity(local.publicKey);
  const route='/api/mindling/energy',body={action:'state'};
  const {nonce:session}=await auth.challenge(local.publicKey);
  const key=createPrivateKey({key:local.privateKey,format:'jwk'});
  function proof(index){
    const nonce=id(index).slice(0,48);
    const signature=sign('sha256',Buffer.from(signingMessage({...identity,session,nonce,route,body})),
      {key,dsaEncoding:'ieee-p1363'}).toString('hex');
    return {'x-mindling-session':session,'x-mindling-nonce':nonce,'x-mindling-owner':identity.fingerprint,
      'x-mindling-signature':signature};
  }
  const shared=proof(1);
  await assert.rejects(auth.verify(shared,route,{action:'payment-open'}),{code:'INVALID_SIGNATURE'});
  const results=await Promise.allSettled([auth.verify(shared,route,body),auth.verify(shared,route,body)]);
  assert.equal(results.filter(item=>item.status==='fulfilled').length,1);
  assert.equal((await auth.verify(proof(2),route,body)).fingerprint,identity.fingerprint);
  tick(300001);
  await assert.rejects(auth.verify(proof(3),route,body),{code:'CHALLENGE_EXPIRED'});
});

test('sealed authentication tickets do not need a stored session and prevent replay across requests',async()=>{
  const {store,clock,tick}=await setup();
  const auth=authority(store,clock,encryption('a4'.repeat(32),'auth-ticket'));
  const local=await createLocalIdentity(),identity=publicIdentity(local.publicKey);
  const route='/api/mindling/energy',body={action:'state'};
  const {nonce:session,ticket}=await auth.challenge(local.publicKey,true);
  assert.equal(await store.get('nonce:'+session),null);
  const key=createPrivateKey({key:local.privateKey,format:'jwk'});
  const nonce=id('single-use ticket proof').slice(0,48);
  const signature=sign('sha256',Buffer.from(signingMessage({...identity,session,nonce,route,body})),
    {key,dsaEncoding:'ieee-p1363'}).toString('hex');
  const headers={'x-mindling-ticket':ticket,'x-mindling-session':session,'x-mindling-nonce':nonce,
    'x-mindling-owner':identity.fingerprint,'x-mindling-signature':signature};
  await assert.rejects(auth.verify({...headers,'x-mindling-ticket':ticket.replace(/^./,'X')},route,body,'fixture'),{code:'CHALLENGE_EXPIRED'});
  assert.equal((await auth.verify(headers,route,body,'fixture')).fingerprint,identity.fingerprint);
  await assert.rejects(auth.verify(headers,route,body,'fixture'),{code:'CHALLENGE_EXPIRED'});
  tick(300001);
  await assert.rejects(auth.verify(headers,route,body,'fixture'),{code:'CHALLENGE_EXPIRED'});
});

test('legacy capacity requires a reviewed identical history, independent of claimed Energy',async()=>{
  const {ledger,store}=await setup();
  const principal=own.fingerprint;
  const createdAt=nowBase-30*day;
  const stages=[
    {stage:1,enteredAt:createdAt,leftAt:createdAt+day,xp:75,concepts:6},
    {stage:2,enteredAt:createdAt+day,leftAt:createdAt+3*day,xp:125,concepts:10},
    {stage:3,enteredAt:createdAt+3*day,leftAt:createdAt+6*day,xp:175,concepts:15}
  ];
  await assert.rejects(ledger.initialize(own,{stage:4,createdAt,stages:[]}),{code:'LEGACY_STAGE_REVIEW'});
  const legacy={stage:4,createdAt,stages};
  await assert.rejects(ledger.initialize(own,legacy),{code:'LEGACY_STAGE_REVIEW'});
  await store.change(['legacy-review:'+principal],()=>({writes:[{
    stage:4,historyHash:sha256(JSON.stringify(legacy)),enteredAt:stages.at(-1).leftAt,stageXP:0,milestones:[]
  }]}));
  await assert.rejects(ledger.initialize(own,{...legacy,remaining:9999}),{code:'LEGACY_STAGE_REVIEW'});
  const energy=await ledger.initialize(own,legacy);
  assert.equal(energy.stage,4);
  assert.equal(energy.capacity,18);
  assert.equal(energy.remaining,10);
  assert.equal(energy.bonus,0);
  assert.deepEqual(await ledger.initialize(own,{stage:7}),await ledger.get(principal));
});

test('concurrent reservations never overspend and retry settles one charge',async()=>{
  const {ledger,redis,tick}=await setup();
  const principal=own.fingerprint;
  await ledger.initialize(own);
  const operations=Array.from({length:4},(_,index)=>operation('deep'+index,'deep','learn'));
  const decisions=await Promise.allSettled(operations.map(request=>ledger.admit(principal,request)));
  const admitted=operations.filter((_,index)=>decisions[index].status==='fulfilled');
  assert.equal(admitted.length,3);
  assert.equal(decisions.find(item=>item.status==='rejected').reason.code,'ENERGY_LOW');
  assert(redis.compareAttempts>=5);
  assert.equal((await ledger.get(principal)).reserved,9);
  const request=admitted[0];
  await confirmed(ledger,principal,request);
  await assert.rejects(authorize(ledger,principal,request.id,0),{code:'QUALIFICATION_REVIEW'});
  await assert.rejects(ledger.settle(principal,request.id,id('forged')), {code:'COMMIT_REQUIRED'});
  const {approval}=await authorize(ledger,principal,request.id,3);
  const [first,second]=await Promise.all([
    ledger.settle(principal,request.id,approval),ledger.settle(principal,request.id,approval)
  ]);
  assert.deepEqual(first.receipt,second.receipt);
  assert.equal(second.energy.remaining,7);
  tick(interval-1);
  assert.equal((await ledger.get(principal)).remaining,7);
  tick(1);
  assert.equal((await ledger.get(principal)).remaining,8);
});

test('no-change remains free, whereas an unknown outcome cannot be replayed or released',async()=>{
  const {ledger}=await setup();
  const principal=own.fingerprint;
  await ledger.initialize(own);
  const noop=operation('learn-no-change','teach','learn');
  await ledger.admit(principal,noop);
  await confirmed(ledger,principal,noop,{spend:false,xp:0});
  assert.equal((await settle(ledger,principal,noop.id,0)).energy.remaining,10);
  const unknown=operation('learn-unknown','teach','learn');
  await ledger.admit(principal,unknown);
  await assert.rejects(ledger.admit(principal,unknown),{code:'OUTCOME_UNKNOWN'});
  await assert.rejects(ledger.release(principal,unknown.id),{code:'OUTCOME_UNKNOWN'});
  assert.equal((await ledger.get(principal)).reserved,2);
});

test('server receipts unlock capacity after the elapsed-time gate without a new provider dispatch',async()=>{
  const {ledger,tick,clock}=await setup(), principal=own.fingerprint;
  await ledger.initialize(own);
  for(let index=0;index<8;index++){
    const lesson=operation('deep-lesson-'+index,'deep','learn');
    await ledger.admit(principal,lesson);
    await confirmed(ledger,principal,lesson,{spend:true,xp:10,concept:id('concept-'+index)});
    const {energy}=await settle(ledger,principal,lesson.id,3,undefined,10);
    assert.equal(energy.capacity,10);
    if(index<7)tick(3*interval);
  }
  tick(nowBase+day-clock());
  const advanced=await ledger.get(principal);
  assert.equal(advanced.capacity,12);
  assert.equal(advanced.remaining,10);
  assert.equal((await ledger.get(principal)).revision,advanced.revision);
});

test('a stale permission copy cannot restore revoked Research',async()=>{
  const {ledger}=await setup(),principal=own.fingerprint;
  await ledger.initialize(own);
  await ledger.setResearch(principal,true,12,1);
  await ledger.setResearch(principal,false,12,2);
  assert.deepEqual(await ledger.setResearch(principal,true,12,1),{enabled:false,revision:2});
  await assert.rejects(ledger.admit(principal,operation('blocked research','foundation','research')),
    {code:'RESEARCH_PERMISSION_REQUIRED'});
});
test('multi-phase Research holds one reservation, binds checkpoint, observes inference and tool ceilings',async()=>{
  const {ledger}=await setup(), principal=own.fingerprint;
  await ledger.initialize(own);
  const plan=operation('research-task','foundation','research');
  await assert.rejects(ledger.admit(principal,plan),{code:'RESEARCH_PERMISSION_REQUIRED'});
  await ledger.setResearch(principal,true);
  await ledger.admit(principal,plan);
  await ledger.record(principal,plan.id,plan.requestId,{status:200,body:{}});
  const acquire={...operation('research-task','foundation','research-acquire'),tools:4};
  await ledger.admit(principal,acquire);
  const quote=id('source quote'),quote2=id('additional source quote');
  await ledger.record(principal,acquire.id,acquire.requestId,{status:200,body:{}},{
    checkpointSignature:'server-checkpoint',qualification:{claims:[{hash:quote,formed:true,concept:id('topic')}],xp:5}
  });
  assert.equal((await ledger.get(principal)).reserved,2);
  const refine=operation('research-task','foundation','research-evaluate');
  await assert.rejects(ledger.admit(principal,{...refine,checkpointSignature:'different'}),{code:'CHECKPOINT_OPERATION_MISMATCH'});
  await ledger.admit(principal,{...refine,checkpointSignature:'server-checkpoint'});
  await ledger.record(principal,refine.id,refine.requestId,{status:200,body:{}},{
    qualification:{claims:[{hash:quote2,formed:true,concept:id('topic')}],xp:5}
  });
  await assert.rejects(ledger.admit(principal,{...refine,requestId:'new',checkpointSignature:'server-checkpoint'}),{code:'BUDGET_EXHAUSTED'});
  await assert.rejects(authorize(ledger,principal,plan.id,2,[id('invented')]),{code:'QUALIFICATION_REVIEW'});
  await assert.rejects(authorize(ledger,principal,plan.id,0,[]),{code:'QUALIFICATION_REVIEW'});
  await assert.rejects(ledger.release(principal,plan.id),{code:'QUALIFICATION_REVIEW'});
  const {approval}=await authorize(ledger,principal,plan.id,2,[quote,quote2]);
  const result=await ledger.settle(principal,plan.id,approval);
  assert.equal(result.energy.remaining,8);
  assert.equal(result.energy.reserved,0);
  assert.equal(result.receipt.charge,2);
  assert.equal((await ledger.settle(principal,plan.id,approval)).energy.remaining,8);
});

const account=(await solana.createKeyPairSignerFromPrivateKeyBytes(new Uint8Array(32).fill(3))).address;
function mockChain() {
  let count=0, builds=0, sends=0, ready=false, swept='PENDING', valid=true;
  const sponsor={fee:10000,rent:2000000,treasuryLamports:1000000000};
  return {
    chain:{cluster:'mainnet',mintInfo:async()=>({mint:account,decimals:6}),
      depositTarget:async address=>({address,reference:'reference-'+(++count),ata:'ata-'+address}),
      checkout:async session=>{builds++;return {transaction:'synthetic-transaction',signature:session.id,...sponsor};},
      check:async session=>ready?{signature:session.id,slot:123,finalizedAt:nowBase}:null,
      sweep:async(session,secret)=>{assert.equal(secret.length,64);return {transaction:'sweep',signature:'sweep-'+session.id,...sponsor};},
      sweepStatus:async()=>swept,canSubmit:async()=>valid,
      submit:async()=>{sends++;throw Error('Lost transport response');}
    },
    built:()=>builds,sent:()=>sends,allow:()=>{ready=true;},finalize:()=>{swept='FINALIZED';},expire:()=>{valid=false;}
  };
}

function deplete(store, owner, time=nowBase){
  return store.change(['energy:'+owner],([entry])=>{
    entry.balance={...entry.balance,remaining:0,bonus:0,updatedAt:time};
    return {writes:[entry]};
  });
}

test('wallet bootstrap needs no pricing, preserves its identity and reuses an issued legacy wallet',async()=>{
  const {store}=await setup(),cipher=encryption('d1'.repeat(32));
  const owner=own.fingerprint;
  const {randomDeposit}=solanaModule;
  const wallets=depositWallets(store,cipher,randomDeposit);
  const [first,second]=await Promise.all([wallets.ensure(owner),wallets.ensure(owner)]);
  assert.deepEqual(first,second);
  assert.equal(solana.address(first.address),first.address);
  const disk=await store.get('deposit:'+owner);
  const secret=await wallets.secretFor({owner,address:first.address});
  assert.equal(solana.getBase58Decoder().decode(secret.subarray(32)),first.address);
  secret.fill(0);
  assert(!JSON.stringify(disk).includes('secretKey'));
  await assert.rejects(wallets.secretFor({owner,address:account}),{code:'DEPOSIT_KEY_UNAVAILABLE'});
  const previousOwner=id('legacy owner'),legacyId=id('legacy payment').slice(0,48);
  const {address,secret:legacySecret}=randomDeposit();
  const legacy={id:legacyId,owner:previousOwner,address,mint:account};
  legacy.sealed=cipher.seal(legacySecret,legacy);
  legacySecret.fill(0);
  await store.change(['checkout:'+previousOwner,'payment:'+legacyId],()=>({writes:[{id:legacyId},legacy]}));
  assert.deepEqual(await wallets.ensure(previousOwner),{address,pending:legacyId});
  assert.deepEqual(await store.get('payment:'+legacyId),legacy);
  const recovered=await wallets.secretFor(legacy);
  assert.equal(solana.getBase58Decoder().decode(recovered.subarray(32)),address);
  recovered.fill(0);
});

test('Mainnet checkout needs audited approval and live recovery while the wallet stays available',async()=>{
  const {store,ledger,clock,tick}=await setup(),owner=own.fingerprint;
  const {chain}=mockChain(),cipher=encryption('f0'.repeat(32));
  const deposit=depositWallets(store,cipher);
  const payment=payments(store,ledger,chain,cipher,{now:clock,deposit,requireWorker:true,
    price:async mint=>({mint,asOf:clock(),freshUntil:clock()+60000,usdScaled:'100000000000'})});
  chain.sponsorEstimate=async()=>({fee:15000,rent:2000000,treasuryLamports:1000000000});
  const auth={verify:async()=>own};
  const handler=energyHandler({runtime:async()=>({store,ledger,auth,deposit,payment:()=>payment})});
  const initialized=mockedResponse();
  await handler({method:'POST',headers:{},body:{action:'register',wallet:true}},initialized);
  assert.equal(initialized.code,200);
  assert.equal(initialized.body.wallet.version,1);
  assert.equal(initialized.body.energy.remaining,10);
  await assert.rejects(payment.open(owner),{code:'PAYMENT_ENERGY_AVAILABLE'});
  await deplete(store,owner);
  await assert.rejects(payment.open(owner),{code:'PAYMENT_ACTIVATION_REQUIRED'});
  await store.change([CONTROL],()=>({writes:[{cluster:'mainnet',state:'OPEN',verifiedUntil:nowBase-1}]}));
  await assert.rejects(payment.open(owner),{code:'PAYMENT_APPROVAL_EXPIRED'});
  await store.change([CONTROL],()=>({writes:[{cluster:'mainnet',state:'OPEN',policy:2,approvedAt:nowBase}]}));
  tick(86400001);
  await deplete(store,owner,clock());
  await assert.rejects(payment.open(owner),{code:'PAYMENT_RECOVERY_UNAVAILABLE'});
  await store.heartbeat(WORKER,{at:clock()});
  assert.equal((await payment.open(owner)).payable,true);
  assert.equal((await deposit.ensure(owner)).address,initialized.body.wallet.address);
});

test('one wallet-open operation recovers a pending session, and returns a QR only with validated pricing and sponsorship',async()=>{
  const {store,ledger,clock}=await setup(),principal=own.fingerprint;
  const {chain}=mockChain();
  let pricing=false,priced=0,balance=1000000000;
  chain.sponsorEstimate=async()=>({fee:15000,rent:2000000,treasuryLamports:balance});
  const price=async mint=>{
    priced++;
    if(!pricing)throw Object.assign(Error('MARKET_PRICE_UNAVAILABLE'),{code:'MARKET_PRICE_UNAVAILABLE',status:503});
    return {mint,asOf:nowBase,freshUntil:nowBase+10000,usdScaled:'100000000000'};
  };
  const payment=payments(store,ledger,chain,encryption('ab'.repeat(32)),{now:clock,price});
  await ledger.initialize(own);
  await deplete(store,principal);
  await store.change([CONTROL],()=>({writes:[{cluster:'mainnet',state:'OPEN',verifiedUntil:nowBase+600000}]}));
  const auth={verify:async()=>({fingerprint:principal})};
  const handler=energyHandler({runtime:async()=>({store,ledger,auth,payment:()=>payment})});
  async function open(){
    const res=mockedResponse();
    await handler({method:'POST',headers:{host:'mindling.test',origin:'https://mindling.test'},body:{action:'payment-open'}},res);
    return res;
  }
  const failed=await open();
  assert.equal(failed.code,503);
  assert.equal(failed.body.error.code,'MARKET_PRICE_UNAVAILABLE');
  assert.equal(await payment.current(principal),null);
  pricing=true;
  const created=(await open()).body.session;
  assert.equal(created.sponsored,true);
  assert.equal(created.units,'19900000');
  assert.equal(created.expiresAt-created.createdAt,600000);
  assert.equal(decodeURIComponent(created.qrPayload.slice(7)),'https://mindling.test/api/mindling/pay?session='+created.id);
  assert.deepEqual((await open()).body.session,created);
  assert.equal(priced,2);
  balance=1000;
  const unsponsored=(await open()).body.session;
  assert.equal(unsponsored.id,created.id);
  assert.equal(unsponsored.qrPayload,null);
  assert.equal(unsponsored.sponsored,false);
});

test('finalized payment atomically restores normal Energy once and keeps sweep independently recoverable',async()=>{
  const {store,ledger,tick}=await setup();
  const principal=own.fingerprint, injected=mockChain();
  const key=encryption('ab'.repeat(32));
  const price=async mint=>({mint,asOf:nowBase,freshUntil:nowBase+60000,usdScaled:'100000000000'});
  const payment=payments(store,ledger,injected.chain,key,{now:()=>nowBase,price});
  await ledger.initialize(own);
  await deplete(store,principal);
  await assert.rejects(payment.create(principal),{code:'PAYMENT_ACTIVATION_REQUIRED'});
  await store.change([CONTROL],()=>({writes:[{cluster:'mainnet',state:'OPEN',verifiedUntil:nowBase+600000}]}));
  const session=await payment.create(principal);
  assert.equal(session.units,'19900000');
  assert.equal((await payment.create(principal)).id,session.id);
  assert.equal(session.sealed,undefined);
  const persisted=await store.get('payment:'+session.id);
  const wallet=await store.get('deposit:'+principal);
  assert.equal(persisted.sealed,undefined);
  assert.throws(()=>key.open({...wallet,address:'other address'}));
  await payment.wallet(session.id,account);
  await payment.wallet(session.id,account);
  assert.equal(injected.built(),1);
  await assert.rejects(payment.check(id('different owner'),session.id),{code:'PAYMENT_NOT_FOUND'});
  await assert.rejects(payment.check(principal,session.id),{code:'PAYMENT_PENDING'});
  await store.change(['energy:'+principal],([entry])=>{
    entry.balance={...entry.balance,remaining:3,bonus:3};
    return {writes:[entry]};
  });
  const pending=await payment.open(principal,{recoverOnly:true});
  assert.equal(pending.id,session.id);
  assert.equal(pending.payable,false);
  await assert.rejects(payment.create(principal,{fresh:true}),{code:'PAYMENT_ENERGY_AVAILABLE'});
  injected.allow();
  const [first,second]=await Promise.all([payment.check(principal,session.id),payment.check(principal,session.id)]);
  assert.deepEqual(first.receipt,second.receipt);
  assert.equal(first.energy.remaining,13);
  assert.equal(first.energy.bonus,3);
  assert.equal(first.energy.revision,second.energy.revision);
  await assert.rejects(payment.sweepOne(session.id),/Lost transport/);
  assert.equal((await store.get('sweep-work:'+session.id)).state,'DISPATCHED');
  assert.equal(injected.sent(),1);
  assert.equal((await payment.check(principal,session.id)).receipt.energyRevision,first.energy.revision);
  const post=operation('post payment','talk','talk');
  await ledger.admit(principal,post);
  await confirmed(ledger,principal,post);
  await settle(ledger,principal,post.id,1);
  assert.equal((await payment.check(principal,session.id)).energy.remaining,12);
  tick(46000);
  injected.finalize();
  // A restarted worker sees the persisted transaction instead of creating another.
  const recovered=payments(store,ledger,injected.chain,key,{now:()=>nowBase+46000,price});
  await recovered.sweepOne(session.id);
  assert.equal((await store.get('financial-event:sweep-result:sweep-'+session.id)).type,'SWEEP_FINALIZED');
  assert.equal(injected.sent(),1);
  await deplete(store,principal,nowBase+46000);
  const next=await recovered.create(principal,{fresh:true});
  assert.notEqual(next.id,session.id);
  assert.equal(next.address,session.address);
});

function mockedResponse(){
  return Object.assign(new EventEmitter(),{
    status(code){this.code=code;return this;},
    json(body){this.body=body;return this;},
    setHeader(){}
  });
}

test('API derives a conditional Teach charge from the stored provider response; replay never redispatches',async()=>{
  const {store,ledger,clock}=await setup();
  const local=await createLocalIdentity(),identity=publicIdentity(local.publicKey);
  const auth=authority(store,clock);
  const runtime=async()=>({store,ledger,auth,activityCipher:encryption('1a'.repeat(32),'operation')});
  await ledger.initialize(identity);
  let calls=0;
  const handler=protect(LEARN,(_req,res)=>{
    calls++;return res.status(200).json({service:'mindling-learning-service',assessment:{
      version:3,operations:[{statement:0,decision:{operation:'CREATE_NEW',concept:'Orbital period'}}]
    }});
  },{runtime});
  const body={input:'Orbital periods are measured as time.',candidates:[],categories:[]};
  const operationInfo={id:id('teach route'),kind:'teach'};
  const signedRequest=async(route,data,op=null)=>{
    const {nonce}=await auth.challenge(local.publicKey);
    const message=signingMessage({...identity,nonce,route,body:data,operation:op});
    return Object.assign(new EventEmitter(),{method:'POST',body:data,headers:{
      'x-mindling-owner':identity.fingerprint,'x-mindling-nonce':nonce,
      'x-mindling-signature':sign('sha256',Buffer.from(message),{
        key:createPrivateKey({key:local.privateKey,format:'jwk'}),dsaEncoding:'ieee-p1363'
      }).toString('hex'),...(op?{'x-mindling-operation':Buffer.from(JSON.stringify(op)).toString('base64url')}:{})
    }});
  };
  const unauthorized=mockedResponse();
  await handler({method:'POST',body,headers:{}},unauthorized);
  assert.equal(unauthorized.code,401);
  const first=mockedResponse();
  await handler(await signedRequest(LEARN,body,operationInfo),first);
  assert.equal(first.code,200);
  assert.equal(first.body.energy.reserved,2);
  const replay=mockedResponse();
  await handler(await signedRequest(LEARN,body,operationInfo),replay);
  assert.equal(replay.code,200);
  assert.equal(calls,1);
  assert(!JSON.stringify(await ledger.inspect(identity.fingerprint,operationInfo.id)).includes('Orbital period'));
  const complete=mockedResponse();
  const planned=mockedResponse();
  const prepareRequest={action:'authorize-commit',id:operationInfo.id,cost:2,awardedXP:5};
  await energyHandler({runtime})(await signedRequest('/api/mindling/energy',prepareRequest),planned);
  assert.equal(planned.code,200);
  const receiptRequest={action:'settle',id:operationInfo.id,approval:planned.body.approval};
  await energyHandler({runtime})(await signedRequest('/api/mindling/energy',receiptRequest),complete);
  assert.equal(complete.body.energy.remaining,8);
  const later=mockedResponse();
  await handler(await signedRequest(LEARN,body,operationInfo),later);
  assert.equal(later.body.energy.remaining,8);
  assert.equal(calls,1);
  const wrongRoute=mockedResponse();
  await protect(REASON,()=>assert.fail('Wrong route reached provider'),{runtime})(
    await signedRequest(REASON,{mode:'talk',id:id('reason')},operationInfo),wrongRoute);
  assert.equal(wrongRoute.code,400);
});

for(const [label,tokenProgram] of [['SPL',spl.TOKEN_PROGRAM_ADDRESS],['Token-2022',pumpModule.TOKEN_2022]]){
  test('Solana Pay co-signs a checked '+label+' transfer and rejects mismatched net amount',async()=>{
    const makeKey=n=>solana.createKeyPairSignerFromPrivateKeyBytes(new Uint8Array(32).fill(n),true);
    const [treasury,payer,{address:mint},{address:blockhash}]=await Promise.all([1,2,3,4].map(makeKey));
    const [source]=await spl.findAssociatedTokenPda({owner:payer.address,mint,tokenProgram:tokenProgram});
    const ordinaryAccount=spl.getTokenEncoder().encode({mint,owner:payer.address,amount:200000000n,
      delegate:null,state:spl.AccountState.Initialized,isNative:null,delegatedAmount:0,closeAuthority:null});
    const ordinaryMint=spl.getMintEncoder().encode({mintAuthority:null,supply:200000000n,decimals:6,
      isInitialized:true,freezeAuthority:null});
    const token22=tokenProgram===pumpModule.TOKEN_2022;
    const accountData=token22?Buffer.concat([ordinaryAccount,Buffer.from([2,7,0,0,0])]):ordinaryAccount;
    const mintData=token22?Buffer.concat([ordinaryMint,Buffer.alloc(83),Buffer.from([1,18,0,64,0]),Buffer.alloc(64)]):ordinaryMint;
    let transaction;
    const rpc=async(method,key)=>{
      if(method==='getAccountInfo')return {value:{owner:tokenProgram,
        data:[Buffer.from(key===source?accountData:mintData).toString('base64'),'base64']}};
      if(method==='getLatestBlockhash')return {value:{blockhash,lastValidBlockHeight:77}};
      if(method==='getFeeForMessage')return {value:10000};
      if(method==='getMinimumBalanceForRentExemption')return 2000000;
      if(method==='getBalance')return {value:1000000000};
      if(method==='getBlockHeight')return 76;
      if(method==='getTransaction')return transaction;
      throw Error('Unexpected RPC method '+method);
    };
    const walletSecret=[...new Uint8Array(32).fill(1),...solana.getBase58Encoder().encode(treasury.address)];
    const chain=solanaModule.solanaAdapter({apiKey:'mock',mintAddress:mint,walletSecret:JSON.stringify(walletSecret),rpc});
    const deposit=await chain.newDeposit(tokenProgram);
    const session={...deposit,...await chain.mintInfo(),units:'19900000',createdAt:nowBase-1000,expiresAt:nowBase+60000};
    session.signed=await chain.checkout(session,payer.address);
    const tx=solana.getTransactionDecoder().decode(Buffer.from(session.signed.transaction,'base64'));
    const message=solana.getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
    assert.equal(message.staticAccounts[0],treasury.address);
    assert.equal(await solana.verifySignature(treasury.keyPair.publicKey,tx.signatures[treasury.address],tx.messageBytes),true);
    assert.equal(tx.signatures[payer.address],null);
    const [payerSignatures]=await payer.signTransactions([tx]);
    const signed=solana.getBase64EncodedWireTransaction({...tx,signatures:{...tx.signatures,...payerSignatures}});
    const transfer=message.instructions.at(-1);
    assert.equal(message.staticAccounts[transfer.programAddressIndex],tokenProgram);
    assert.equal(spl.getTransferCheckedInstructionDataDecoder().decode(transfer.data).amount,19900000n);
    assert.equal(message.staticAccounts[transfer.accountIndices[2]],deposit.ata);
    const index=message.staticAccounts.indexOf(deposit.ata);
    const post={accountIndex:index,mint,owner:deposit.address,programId:tokenProgram,
      uiTokenAmount:{amount:'19900000',decimals:6}};
    transaction={version:'legacy',slot:7,blockTime:nowBase/1000,transaction:[signed,'base64'],
      meta:{err:null,preTokenBalances:[],postTokenBalances:[post]}};
    assert.equal((await chain.check(session)).slot,7);
    for(const invalid of [{mint:payer.address},{owner:treasury.address},{uiTokenAmount:{amount:'19899999',decimals:6}},
      {uiTokenAmount:{amount:'19900001',decimals:6}}]){
      const original=transaction.meta.postTokenBalances;
      transaction.meta.postTokenBalances=[{...post,...invalid}];
      await assert.rejects(chain.check(session),{code:'PAYMENT_AMOUNT_MISMATCH'});
      transaction.meta.postTokenBalances=original;
    }
    transaction.blockTime=Math.floor(session.expiresAt/1000)+1;
    await assert.rejects(chain.check(session),{code:'PAYMENT_TIMING_REVIEW'});
    transaction.meta.err={rejected:true};
    await assert.rejects(chain.check(session),{code:'PAYMENT_TRANSACTION_REJECTED'});
  });
}

test('a delayed state response cannot overwrite a newer synchronized Energy revision',()=>{
  const mind={energy:{remaining:2}};
  const latest={version:2,remaining:10,bonus:0,capacity:10,updatedAt:nowBase,reserved:0,revision:12,serverTime:nowBase,stage:1};
  cacheEnergy(mind,latest);
  cacheEnergy(mind,{...latest,remaining:2,revision:11});
  cacheEnergy(mind,{...latest,remaining:2,serverTime:nowBase-1});
  assert.equal(mind.energy.remaining,10);
  assert.equal(mind.energyAuthority.revision,12);
});

async function publicMarket(now) {
  const {pumpSnapshot,addresses,PUMP,SWAP,FEE,SOL,TOKEN_2022}=pumpModule;
  const settings={graduation:'curve',lowLiquidity:false,stale:false,oracleStale:false,mismatch:false,usd:'10000000000',slot:10};
  const mint=account, token=spl.TOKEN_PROGRAM_ADDRESS, keys=await addresses(mint,TOKEN_2022);
  const supply=1_000_000_000_000_000n, reserve=30_000_000_000n;
  const encode=solana.getAddressEncoder();
  const accountFor=(owner,bytes,lamports=1)=>({owner,lamports,data:[Buffer.from(bytes).toString('base64'),'base64']});
  const anchor=(length,discriminator)=>{
    const value=Buffer.alloc(length);
    Buffer.from(discriminator).copy(value);
    return value;
  };
  const mintData=Buffer.alloc(234);
  mintData.set(spl.getMintEncoder().encode({decimals:6,supply,isInitialized:true,freezeAuthority:null,mintAuthority:null}));
  mintData[165]=1;
  mintData.writeUInt16LE(18,166);mintData.writeUInt16LE(64,168);
  const holding=(program,mint,owner,amount,native=null)=>{
    const bytes=Buffer.from(spl.getTokenEncoder().encode({mint,owner,amount,delegate:null,state:1,
      isNative:native,delegatedAmount:0n,closeAuthority:null}));
    return accountFor(program,program===TOKEN_2022?Buffer.concat([bytes,Buffer.from([2,7,0,0,0])]):bytes);
  };
  const fees=anchor(109,[143,52,146,187,219,123,76,155]);
  fees.writeUInt32LE(1,65);fees.writeBigUInt64LE(200n,93);
  let snapshots=0;
  const rpc=async(method,ids,options)=>{
    if(method==='getBlockTime')return Math.floor(now()/1000)-(settings.stale?100:2);
    assert.equal(method,'getMultipleAccounts');
    assert.equal(options.commitment,'finalized');
    assert.deepEqual(ids,[mint,keys.curve,keys.pool,keys.curveVault,keys.baseVault,keys.quoteVault,keys.curveFee,keys.swapFee,keys.swapGlobal]);
    snapshots++;
    const curve=anchor(115,[23,183,248,55,96,216,172,96]);
    curve.writeBigUInt64LE(supply,8);curve.writeBigUInt64LE(reserve,16);
    curve.writeBigUInt64LE(supply/2n,24);curve.writeBigUInt64LE(settings.lowLiquidity?10n:5_000_000_000n,32);
    curve.writeBigUInt64LE(supply,40);
    curve[48]=settings.graduation==='curve'?0:1;
    const pool=anchor(261,[241,154,109,4,17,177,109,188]);
    pool.set(encode.encode(keys.authority),11);pool.set(encode.encode(settings.mismatch?SOL:mint),43);
    pool.set(encode.encode(SOL),75);pool.set(encode.encode(keys.baseVault),139);pool.set(encode.encode(keys.quoteVault),171);
    pool.writeBigUInt64LE(supply/2n,203);
    pool.writeBigUInt64LE(BigInt.asUintN(64,-5_000_000_000n),245);pool.writeBigUInt64LE((1n<<64n)-1n,253);
    const global=anchor(57,[149,8,156,202,160,252,176,217]);
    return {context:{slot:settings.slot},value:[
      accountFor(TOKEN_2022,mintData),
      accountFor(PUMP,curve,5_000_000_000),
      settings.graduation==='pool'?accountFor(SWAP,pool):null,
      holding(TOKEN_2022,mint,keys.curve,supply/2n),holding(TOKEN_2022,mint,keys.pool,supply),
      holding(token,SOL,keys.pool,35_000_000_000n,2039280n),accountFor(FEE,fees),accountFor(FEE,fees),
      accountFor(SWAP,global)
    ]};
  };
  const fetcher=async url=>{
    assert.equal(new URL(url).origin,'https://hermes.pyth.network');
    return Response.json({parsed:[{id:SOL_USD,price:{price:settings.usd,conf:'1000000',expo:-8,
      publish_time:Math.floor(now()/1000)-(settings.oracleStale?110:2)}}]});
  };
  return {settings,mint,tokenProgram:TOKEN_2022,snapshot:pumpSnapshot(rpc,now),fetcher,calls:()=>snapshots};
}

test('Pump.fun pre-graduation and canonical PumpSwap use exact integer units including the signed pool reserve adjustment',async()=>{
  const {store,clock,tick}=await setup(),market=await publicMarket(clock);
  const price=marketPrice(store,{...market,now:clock});
  const quote=()=>price(market.mint,6,market.tokenProgram);
  const curve=await quote();
  assert.equal(curve.source,'pump.fun');
  assert.equal(curve.asOf,nowBase-2000);
  assert.equal(quoteUnits(curve,6),'663333333334');
  assert.equal(quoteUnits({usdScaled:'300000000000'},6),'6633334');
  tick(5000);market.settings.slot++;
  market.settings.graduation='migrating';
  await assert.rejects(quote(),{code:'MARKET_PRICE_UNAVAILABLE'});
  market.settings.graduation='pool';
  const pool=await quote();
  assert.equal(pool.source,'pumpswap');
  assert.equal(quoteUnits(pool,6),'663333333334');
  assert.equal(market.calls(),3);
  market.settings.graduation='curve';
  await assert.rejects(quote(),{code:'MARKET_PRICE_UNAVAILABLE'});
  market.settings.graduation='pool';market.settings.usd='12000000000';
  await assert.rejects(quote(),{code:'MARKET_PRICE_UNAVAILABLE'});
});

test('stale snapshots, stale SOL feed, wrong pool mint and insufficient real depth cannot make a quote',async()=>{
  for(const settings of [{stale:true},{oracleStale:true},{lowLiquidity:true},{graduation:'pool',mismatch:true}]){
    const {store,clock}=await setup(),market=await publicMarket(clock);
    Object.assign(market.settings,settings);
    await assert.rejects(marketPrice(store,{...market,now:clock})(market.mint,6,market.tokenProgram),{code:'MARKET_PRICE_UNAVAILABLE'});
    assert.equal(await store.get('market:pump:'+market.mint),null);
  }
});

test('background inference needs a settled prerequisite from the same owner',async()=>{
  const {ledger}=await setup(),principal=own.fingerprint;
  await ledger.initialize(own);
  await ledger.setResearch(principal,true);
  const research=operation('without a Talk','talk-research','research');
  await assert.rejects(ledger.admit(principal,{...research,prerequisite:id('unrelated')}),
    {code:'ACTIVITY_PREREQUISITE_REQUIRED'});
  const talk=operation('actual Talk','talk','talk');
  await ledger.admit(principal,talk);
  await confirmed(ledger,principal,talk);
  await assert.rejects(ledger.admit(principal,{...research,prerequisite:talk.id}),
    {code:'ACTIVITY_PREREQUISITE_REQUIRED'});
  await settle(ledger,principal,talk.id,1);
  await ledger.admit(principal,{...research,prerequisite:talk.id});
  await assert.rejects(ledger.admit(principal,{...research,id:id('another continuation'),prerequisite:talk.id}),
    {code:'ACTIVITY_ALREADY_CONTINUED'});
  assert.equal((await ledger.get(principal)).reserved,0);
  await assert.rejects(ledger.admit(principal,{...operation('invented semantic work','research-semantic','semantic'),
    prerequisite:talk.id}),{code:'ACTIVITY_PREREQUISITE_REQUIRED'});
});

test('an admitted Research request records its checkpoint on disconnect and a matching request reuses it',async()=>{
  const {store,ledger}=await setup(),principal=own.fingerprint;
  await ledger.initialize(own);
  await ledger.setResearch(principal,true,12,1);
  const req=Object.assign(new EventEmitter(),{method:'POST',headers:{},
    body:{id:id('checkpoint on disconnect'),mode:'research-acquire',context:{request:{mode:'FOUNDATION'},remainingCalls:4}}});
  const op={kind:'foundation',id:id('paid research once')};
  const plan={...operation('paid research once','foundation','research')};
  await ledger.admit(principal,plan);
  await ledger.record(principal,plan.id,plan.requestId,{status:200,body:{}});
  const runtime=async()=>({store,ledger,auth:{verify:async()=>({fingerprint:principal,operation:op})},
    activityCipher:encryption('ab'.repeat(32),'operation')});
  const res=mockedResponse();
  let calls=0;
  const handler=protect(REASON,async(input,output)=>{
    calls++;
    let interrupted=false;
    input.on?.('aborted',()=>{interrupted=true;});
    output.on?.('close',()=>{interrupted=true;});
    req.emit('aborted');
    res.destroyed=true;
    res.emit('close');
    assert.equal(interrupted,false);
    return output.status(502).json({sourceCheckpoint:{signature:'fixture-checkpoint'},error:{
      code:'RESPONSE_PARSE_ERROR',diagnostic:{phase:'SOURCE_EVALUATION',outcomeUnknown:false}
    }});
  },{runtime});
  await handler(req,res);
  assert.equal(res.body,undefined);
  const retry=mockedResponse();
  await handler(req,retry);
  assert.equal(retry.code,502);
  assert.equal(retry.body.sourceCheckpoint.signature,'fixture-checkpoint');
  assert.equal(calls,1);
  assert.equal((await ledger.inspect(principal,op.id)).checkpointSignature,'fixture-checkpoint');
});

test('partial configuration and invalid keys yield a distinct Energy 503 before any service dispatch',()=>{
  const partial={HELIUS_API_KEY:'fixture-only'};
  assert.throws(()=>runtimeFor(partial),{code:'ENERGY_SERVICE_UNAVAILABLE',status:503});
  const invalid={UPSTASH_REDIS_REST_URL:'https://fixture.invalid',UPSTASH_REDIS_REST_TOKEN:'fixture-only',
    ENCRYPTION_KEY:'invalid'};
  assert.throws(()=>runtimeFor(invalid),{code:'ENERGY_SERVICE_UNAVAILABLE',status:503});
});

test('production endpoint has no unauthenticated fallback when the ledger is unconfigured',async()=>{
  const response=mockedResponse();
  await protect(LEARN,()=>assert.fail('Unconfigured request reached model handler'))(
    {method:'POST',headers:{},body:{}},response);
  assert.equal(response.code,503);
  assert.equal(response.body.error.code,'ENERGY_SERVICE_UNAVAILABLE');
});

test('sponsorship pauses on expired blockhash, reserve exhaustion or broken journal; late verification is worker-safe',async()=>{
  const {store,ledger,clock,tick}=await setup(),principal=own.fingerprint;
  const {chain,allow,expire}=mockChain();
  const original=chain.checkout;
  let feePayerBalance=100;
  chain.checkout=async(...args)=>({...await original(...args),treasuryLamports:feePayerBalance});
  const price=async mint=>({mint,asOf:clock(),freshUntil:clock()+10000,usdScaled:'100000000000'});
  const payment=payments(store,ledger,chain,encryption('abcd'.repeat(16)),{now:clock,price});
  await ledger.initialize(own);
  await deplete(store,principal);
  await store.change([CONTROL],()=>({writes:[{cluster:'mainnet',state:'OPEN',verifiedUntil:nowBase+86400000}]}));
  const session=await payment.create(principal);
  assert.equal(session.expiresAt-session.createdAt,600000);
  await assert.rejects(payment.wallet(session.id,account),{code:'SPONSOR_BUDGET_UNAVAILABLE'});
  assert.equal((await store.pending('verify-work:')).keys.length,0);
  tick(31000);
  feePayerBalance=1000000000;
  await payment.wallet(session.id,account);
  expire();
  await assert.rejects(payment.wallet(session.id,account),{code:'PAYMENT_BLOCKHASH_EXPIRED'});
  assert.deepEqual((await store.pending('verify-work:')).keys,[session.id]);
  const checkpoint=(await verifyJournal(store)).head;
  allow();
  await payment.verifyOne(session.id);
  assert.equal((await store.pending('verify-work:')).keys.length,0);
  const {head,checked}=await verifyJournal(store,checkpoint,{onEvent:event=>payment.auditEvent(event)});
  assert.equal(head.sequence,2);
  assert.equal(checked,1);
  // Redis rollback corrupts a physical record. Re-reading a receipt must
  // fail rather than creating new credit from the same finalized signature.
  await store.change(['signature:'+session.id],()=>({writes:[null]}));
  await assert.rejects(payment.check(principal,session.id),{code:'PAYMENT_LEDGER_REVIEW'});
  await store.change([HEAD],()=>({writes:[null]}));
  await assert.rejects(verifyJournal(store,checkpoint),{code:'PAYMENT_LEDGER_REVIEW'});
});

test('sweep worker reuses the exact persisted wire transaction after a lost dispatch',async()=>{
  const {store,ledger,clock,tick}=await setup(),principal=own.fingerprint;
  const {chain,allow}=mockChain();
  const submitted=[];
  chain.submit=async signed=>{submitted.push(signed);throw Error('Lost outcome');};
  const price=async mint=>({mint,asOf:clock(),freshUntil:clock()+10000,usdScaled:'100000000000'});
  const payment=payments(store,ledger,chain,encryption('fe'.repeat(32)),{now:clock,price});
  await ledger.initialize(own);
  await deplete(store,principal);
  await store.change([CONTROL],()=>({writes:[{cluster:'mainnet',state:'OPEN',verifiedUntil:nowBase+86400000}]}));
  const session=await payment.create(principal);
  await payment.wallet(session.id,account);
  allow();
  await payment.check(principal,session.id);
  await assert.rejects(payment.sweepOne(session.id),/Lost outcome/);
  tick(46000);
  await assert.rejects(payment.sweepOne(session.id),/Lost outcome/);
  assert.equal(submitted.length,2);
  assert.deepEqual(submitted[0],submitted[1]);
  chain.sweepStatus=async()=> 'UNKNOWN';
  tick(46000);
  await payment.sweepOne(session.id);
  assert.equal((await store.get('sweep-work:'+session.id)).state,'REVIEW');
  assert.equal(submitted.length,2);
});
