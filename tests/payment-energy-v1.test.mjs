import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createPrivateKey, sign} from 'node:crypto';
import {createLocalIdentity} from '../src/identity/identity.js';
import {applyPaymentReceipt} from '../src/payment/payment-client.js';
import {migrateLocalEnergy,energyAt,ENERGY_INTERVAL,spendEnergy} from '../src/economy/energy.js';
import storeModule from '../src/server/payment/store.cjs';
import identityModule from '../src/server/payment/identity.cjs';
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
const {encryption,payments,depositWallets}=paymentModule;
const {marketPrice,quoteUnits,SOL_USD}=marketModule;
const {CONTROL,HEAD,WORKER,verifyJournal}=financialModule;
const {paymentHandler,runtimeFor}=runtimeModule;
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
  return {...redis,clock:()=>time,tick:ms=>time+=ms};
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

function mockedResponse(){
  return Object.assign(new EventEmitter(),{
    status(code){this.code=code;return this;},
    json(body){this.body=body;return this;},
    setHeader(){}
  });
}

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

const priceAt=clock=>async mint=>({mint,asOf:clock(),freshUntil:clock()+60000,usdScaled:'100000000000'});
const browserSignature='4'.repeat(88);
function receiptFor(owner,id,extra={}){
  return {version:2,id,owner,paymentSignature:browserSignature,slot:12,
    mint:account,units:'19900000',finalizedAt:nowBase,creditedAt:nowBase,...extra};
}

test('new checkout needs actual readiness without an activation record and pause retains payment recovery',async()=>{
  const {store,clock,tick}=await setup(),owner=own.fingerprint;
  const {chain,allow}=mockChain(),keys=encryption('f0'.repeat(32));
  const deposit=depositWallets(store,keys);
  const payment=payments(store,chain,keys,{now:clock,deposit,requireWorker:true,price:priceAt(clock)});
  chain.sponsorEstimate=async()=>({fee:15000,rent:2000000,treasuryLamports:1000000000});
  const handler=paymentHandler({runtime:async()=>({store,deposit,auth:{verify:async()=>({...own,operation:null})},payment:()=>payment})});
  const initialized=mockedResponse();
  await handler({method:'POST',headers:{},body:{action:'payment-wallet'}},initialized);
  assert.equal(initialized.code,200);
  assert.equal(solana.address(initialized.body.wallet.address),initialized.body.wallet.address);
  await assert.rejects(payment.open(owner),{code:'PAYMENT_RECOVERY_UNAVAILABLE'});
  assert.equal(await store.get(CONTROL),null);
  await store.heartbeat(WORKER,{at:clock(),mode:'event-driven-v1'});
  const session=await payment.open(owner);
  assert.equal(session.payable,true);
  assert.equal(session.address,initialized.body.wallet.address);
  await payment.wallet(session.id,account);
  await store.change([CONTROL],([current])=>({writes:[{...current,state:'PAUSED'}]}));
  tick(1000);
  const recovery=await payment.open(owner,{recoverOnly:true,recoveryId:session.id});
  assert.equal(recovery.id,session.id);
  assert.equal(recovery.payable,false);
  assert.equal((await payment.open(owner)).checkoutCode,'PAYMENTS_PAUSED');
  await assert.rejects(payment.wallet(session.id,account),{code:'PAYMENTS_PAUSED'});
  allow();
  assert.equal((await payment.check(owner,session.id)).receipt.owner,owner);
  assert.ok(await store.get('sweep-work:'+session.id));
});

test('price failure preserves deposit, and a usable quote includes one owner-bound QR',async()=>{
  const {store,clock}=await setup(),owner=own.fingerprint,{chain}=mockChain();
  const keys=encryption('cc'.repeat(32)),deposit=depositWallets(store,keys);
  const address=(await deposit.ensure(owner)).address;
  let priceAvailable=false;
  const price=async mint=>{
    if(!priceAvailable)throw storeModule.failure('MARKET_PRICE_UNAVAILABLE',503);
    return priceAt(clock)(mint);
  };
  chain.sponsorEstimate=async()=>({fee:15000,rent:2000000,treasuryLamports:1000000000});
  const payment=payments(store,chain,keys,{now:clock,deposit,price});
  const handler=paymentHandler({runtime:async()=>({store,deposit,auth:{verify:async()=>({...own,operation:null})},payment:()=>payment})});
  async function open(){
    const response=mockedResponse();
    await handler({method:'POST',headers:{host:'mindling.test',origin:'https://mindling.test'},body:{action:'payment-open'}},response);
    return response;
  }
  assert.equal((await open()).body.error.code,'MARKET_PRICE_UNAVAILABLE');
  assert.equal((await deposit.ensure(owner)).address,address);
  priceAvailable=true;
  const a=(await open()).body.session,b=(await open()).body.session;
  assert.deepEqual(a,b);
  assert.equal(a.units,'19900000');
  assert.equal(a.address,address);
  assert.equal(a.expiresAt-a.createdAt,600000);
  assert.equal(decodeURIComponent(a.qrPayload.slice(7)),'https://mindling.test/api/mindling/pay?session='+a.id);
  await assert.rejects(payment.open(id('wrong owner'),{recoverOnly:true,recoveryId:a.id}),{code:'PAYMENT_NOT_FOUND'});
});

test('parallel finalized checks issue one recoverable receipt and interrupted sweep reuses signed bytes',async()=>{
  const {store,clock,tick,values}=await setup(),owner=own.fingerprint;
  const {chain,allow,finalize}=mockChain(),keys=encryption('fe'.repeat(32));
  const sent=[];
  chain.submit=async signed=>{sent.push(signed);throw Error('Lost outcome');};
  const payment=payments(store,chain,keys,{now:clock,price:priceAt(clock)});
  const session=await payment.open(owner);
  await assert.rejects(payment.check(owner,session.id),{code:'PAYMENT_AWAITING_WALLET'});
  await payment.wallet(session.id,account);
  await assert.rejects(payment.check(owner,session.id),{code:'PAYMENT_PENDING'});
  allow();
  const [a,b]=await Promise.all([payment.check(owner,session.id),payment.check(owner,session.id)]);
  assert.deepEqual(a,b);
  assert.deepEqual(Object.keys(a),['receipt']);
  assert.equal(a.receipt.version,2);
  assert.equal(a.receipt.owner,owner);
  assert(![...values.keys()].some(key=>key.includes(':energy:')));
  await assert.rejects(payment.check(id('wrong owner'),session.id),{code:'PAYMENT_NOT_FOUND'});
  const restarted=payments(store,chain,keys,{now:clock,price:priceAt(clock)});
  assert.deepEqual(await restarted.check(owner,session.id),a);
  await assert.rejects(restarted.sweepOne(session.id),/Lost outcome/);
  tick(46000);
  await assert.rejects(restarted.sweepOne(session.id),/Lost outcome/);
  assert.deepEqual(sent[0],sent[1]);
  tick(46000);
  finalize();
  await restarted.sweepOne(session.id);
  assert.equal(await store.get('sweep-work:'+session.id),null);
  const audited=await verifyJournal(store,null,{onEvent:event=>restarted.auditEvent(event)});
  assert.equal(audited.checked,4);
  assert.equal(sent.length,2);
});

test('historic receipt is revalidated from its payment journal without reading historic Energy',async()=>{
  const {store,clock}=await setup(),owner=own.fingerprint,{chain}=mockChain(),keys=encryption('f1'.repeat(32));
  const payment=payments(store,chain,keys,{now:clock,price:priceAt(clock)});
  const session=await payment.open(owner),eventKey='financial-event:credit:'+session.id;
  const energyRevision=17,old=receiptFor(owner,session.id);
  delete old.version;
  delete old.owner;
  old.energyRevision=energyRevision;
  const {eventAfter}=financialModule;
  const {entry,head}=eventAfter(null,null,{key:eventKey,type:'CREDITED',id:session.id,signature:old.paymentSignature,
    units:old.units,mint:old.mint,revision:energyRevision,at:clock()});
  await store.change(['payment:'+session.id,'signature:'+old.paymentSignature,eventKey,CONTROL,HEAD],([row])=>({
    writes:[{...row,receipt:old},{id:session.id,owner,revision:energyRevision,eventHash:entry.hash},entry,{head},head]
  }));
  const result=await payment.check(owner,session.id);
  assert.equal(result.receipt.legacyEnergyRevision,energyRevision);
  assert.equal(result.receipt.owner,owner);
  assert.equal(result.energy,undefined);
});

test('local receipt application preserves bonus, respects stage capacity and refuses duplicate or cross-owner credit',()=>{
  const id='b'.repeat(48),owner=own.fingerprint;
  const state={now:nowBase,mind:{id:'brain',stage:3,energy:{version:2,remaining:4,bonus:3,capacity:15,updatedAt:nowBase},
    paymentPending:id}};
  const receipt=receiptFor(owner,id);
  assert.throws(()=>applyPaymentReceipt(state,'other',receipt,owner,id,nowBase),{code:'IDENTITY_CHANGED'});
  assert.throws(()=>applyPaymentReceipt(state,'brain',receipt,'other owner',id,nowBase),{code:'INVALID_PAYMENT_RECEIPT'});
  applyPaymentReceipt(state,'brain',receipt,owner,id,nowBase);
  assert.equal(state.mind.energy.remaining,18);
  assert.equal(state.mind.energy.bonus,3);
  assert.equal(state.mind.paymentPending,null);
  state.mind.energy=spendEnergy(state.mind.energy,2,nowBase);
  applyPaymentReceipt(state,'brain',receipt,owner,id,nowBase);
  assert.equal(state.mind.energy.remaining,16);
  assert.throws(()=>applyPaymentReceipt(state,'brain',{...receipt,paymentSignature:'5'.repeat(88)},owner,id,nowBase),{code:'INVALID_PAYMENT_RECEIPT'});
});

test('local Energy migration keeps elapsed regeneration and protects previously credited legacy receipts',()=>{
  const id='b'.repeat(48),owner=own.fingerprint;
  const state={now:nowBase,mind:{id:'brain',stage:2,energy:{version:2,remaining:3,bonus:1,capacity:10,updatedAt:nowBase},
    energyAuthority:{revision:20,reserved:5,legacyBalance:{remaining:10}},paymentPending:id,memories:[{id:'keep'}]}};
  migrateLocalEnergy(state,nowBase+ENERGY_INTERVAL);
  assert.equal(state.mind.energyAuthority,undefined);
  assert.equal(state.mind.energy.capacity,12);
  assert.equal(state.mind.energy.remaining,4);
  assert.equal(state.mind.legacyPaymentEnergyRevision,20);
  assert.deepEqual(state.mind.memories,[{id:'keep'}]);
  assert.equal(energyAt(state.mind.energy,nowBase+2*ENERGY_INTERVAL).remaining,5);
  applyPaymentReceipt(state,'brain',receiptFor(owner,id,{legacyEnergyRevision:18}),owner,id,nowBase+ENERGY_INTERVAL);
  assert.equal(state.mind.energy.remaining,4);
  const other='c'.repeat(48);
  applyPaymentReceipt(state,'brain',receiptFor(owner,other,{legacyEnergyRevision:21}),owner,other,nowBase+ENERGY_INTERVAL);
  assert.equal(state.mind.energy.remaining,13);
});

test('missing payment configuration retains actionable payment-only errors',async()=>{
  assert.throws(()=>runtimeFor({}),{code:'PAYMENT_STORAGE_UNCONFIGURED',status:503});
  const fixture={UPSTASH_REDIS_REST_URL:'https://fixture.invalid',UPSTASH_REDIS_REST_TOKEN:'fixture-only'};
  assert.throws(()=>runtimeFor(fixture),{code:'ENCRYPTION_UNAVAILABLE',status:503});
  const runtime=runtimeFor({...fixture,ENCRYPTION_KEY:'f0'.repeat(32)});
  assert.throws(()=>runtime.payment(),{code:'PAYMENT_RPC_UNCONFIGURED',status:503});
});

test('supervised worker proves its subscription, scans once when idle, and wakes on durable payment work',async()=>{
  const {run}=await import('../tools/mindling-payment-worker.cjs');
  let close,onEvent,scans=0,heartbeats=0,queued=false,sweeps=0;
  let confirm,processed;
  const ready=new Promise(resolve=>confirm=resolve);
  const worked=new Promise(resolve=>processed=resolve);
  const jobId='a'.repeat(48);
  const store={
    async listen(callback){
      onEvent=callback;
      callback('ready');
      await new Promise(resolve=>close=resolve);
    },
    async pendingWork(){
      scans++;
      return {cursor:'0',jobs:queued?[{kind:'sweep',id:jobId}]:[]};
    },
    async get(){return queued?{nextAt:Date.now()-1,state:'PENDING'}:null;},
    async probeWake(code){queueMicrotask(()=>onEvent(code));return 1;},
    async heartbeat(key,value){assert.equal(key,WORKER);assert.equal(value.mode,'event-driven-v1');heartbeats++;confirm();return true;}
  };
  const runWorker=run({store,payment:()=>({async sweepOne(id){
    assert.equal(id,jobId);
    sweeps++;
    queued=false;
    processed();
  }})},true);
  try {
    await ready;
    assert.equal(scans,1);
    assert.equal(heartbeats,1);
    queued=true;
    onEvent('work');
    await worked;
    assert.equal(scans,2);
    assert.equal(sweeps,1);
  }finally{
    close();
    await runWorker;
  }
});
