'use strict';
const {resolve}=require('node:path');
const {generateKeyPairSync,sign,randomBytes}=require('node:crypto');

const root=resolve(process.argv[2]||'.');
const load=name=>require(resolve(root,'src/server/payment',name+'.cjs'));
const {redisStore}=load('store'), {authority,publicIdentity,signingMessage,sha256}=load('identity');
const {energyLedger}=load('energy-ledger'), {energyHandler,protect,walletHandler,LEARN,REASON}=load('runtime');
const {payments,encryption}=load('payments'), {CONTROL,WORKER}=load('financial-control');
const ENERGY='/api/mindling/energy';
const address='So11111111111111111111111111111111111111112';
const seed='a5'.repeat(32);
const start=Date.UTC(2026,10,27,12);
let time=start,http=0,reads=0,writes=0,rest=0,scripts=0;
Date.now=()=>time;
const values=new Map(), statistics=[];
const count=(command,...args)=>{
  if(['GET','MGET','SCAN'].includes(command))reads++;
  else if(command!=='EVAL')writes++;
  if(command==='GET')return values.get(args[0])??null;
  if(command==='MGET')return args.map(key=>values.get(key)??null);
  if(command==='SCAN'){
    const candidates=[...values.keys()], pattern=args[2];
    const matcher=new RegExp('^'+pattern.split('*').join('.*')+'$');
    return ['0',candidates.filter(key=>matcher.test(key))];
  }
  if(command==='SET'){
    if(args.includes('NX')&&values.has(args[0]))return null;
    values.set(args[0],args[1]);return 'OK';
  }
  if(command==='GETDEL'){reads++;const prior=values.get(args[0]);values.delete(args[0]);return prior??null;}
  if(command==='DEL'){for(const key of args)values.delete(key);return 1;}
  if(command==='INCR'){const next=Number(values.get(args[0])||0)+1;values.set(args[0],String(next));return next;}
  if(command==='EXPIRE')return 1;
  if(command==='MSET'){for(let i=0;i<args.length;i+=2)values.set(args[i],args[i+1]);return 'OK';}
  if(command==='EVAL'){
    scripts++;
    const [script,length,...parts]=args, keys=parts.slice(0,length), argv=parts.slice(length);
    if(script.includes('mindling-replay-rate')){
      const n=count('INCR',keys[1]);if(n===1)count('EXPIRE',keys[1],argv[2]);
      return n>Number(argv[1])?-1:count('SET',keys[0],'true','NX','PX',argv[0])?1:0;
    }
    if(script.includes("redis.call('INCR'")){
      const n=count('INCR',keys[0]);if(n===1)count('EXPIRE',keys[0],argv[0]);return n;
    }
    const batched=script.includes("redis.call('MGET'");
    const previous=batched?count('MGET',...keys):keys.map(key=>count('GET',key));
    if(!previous.every((value,index)=>(value||'')===argv[index*2]))return 0;
    if(script.includes('read-only compare'))return 1;
    if(!batched){
      keys.forEach((key,index)=>argv[index*2+1]?count('SET',key,argv[index*2+1]):count('DEL',key));
      return 1;
    }
    const changed=[], deleted=[];
    keys.forEach((key,index)=>{
      const next=argv[index*2+1];if(next===(previous[index]||''))return;
      if(next)changed.push(key,next);else deleted.push(key);
    });
    if(changed.length)count('MSET',...changed);
    if(deleted.length)count('DEL',...deleted);
    return 1;
  }
  throw Error('Unexpected command '+command);
};
const store=redisStore({url:'https://fixture.invalid',token:'test',fetcher:async(_,{body})=>{
  rest++;return Response.json({result:count(...JSON.parse(body))});
}});
const client={};
let paymentId, availableFinance=false, finalized=false, lostBroadcast=true;
const sponsor={fee:10000,rent:2000000,treasuryLamports:1000000000};
const chain={cluster:'mainnet',mintInfo:async()=>({mint:address,decimals:6}),sponsorEstimate:async()=>sponsor,
  newDeposit:async()=>({address,ata:address,reference:address,secret:Buffer.alloc(64,7)}),
  depositTarget:async wallet=>({address:wallet,ata:address,reference:address}),
  checkout:async row=>({...sponsor,transaction:'fixture',signature:row.id}),
  check:async row=>availableFinance?{signature:row.id,slot:1,finalizedAt:time}:null,
  canSubmit:async()=>true,sweep:async row=>({...sponsor,transaction:'fixture-sweep',signature:'sweep-'+row.id}),
  sweepStatus:async()=>finalized?'FINALIZED':'PENDING',
  submit:async()=>{if(lostBroadcast){lostBroadcast=false;throw Error('fixture lost response');}}
};

async function run(){
  const ledger=await energyLedger(store,()=>time);
  await store.change([CONTROL,...(WORKER?[WORKER]:[])],()=>({writes:[{cluster:'mainnet',state:'OPEN',verifiedUntil:time+86400000},...(WORKER?[{at:time}]:[])]}));
  const keys=encryption(seed);
  const depositModule=load('payments');
  const deposit=depositModule.depositWallets?.(store,keys,async()=>({address,secret:Buffer.alloc(64,7)}));
  const auth=authority(store,()=>time,encryption(seed,'auth-ticket'));
  const payment=payments(store,ledger,chain,keys,{now:()=>time,deposit,requireWorker:Boolean(WORKER),price:async mint=>({
    mint,asOf:time,freshUntil:time+60000,usdScaled:'100000000000'
  })});
  const runtime=async()=>({store,auth,ledger,payment:()=>payment,deposit,activityCipher:encryption(seed,'operation')});
  const local=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const identity=publicIdentity(local.publicKey.export({format:'jwk'}));
  const endpoint=energyHandler({runtime}),checkout=walletHandler({runtime});
  const learning=protect(LEARN,(_req,res)=>res.status(200).json({assessment:{operation:'CREATE_NEW',concept:'Distinct claim'}}),{runtime});
  const reasoning=protect(REASON,(req,res)=>{
    const mode=req.body.mode;
    if(mode==='research-acquire')return res.status(200).json({acquisition:{evaluation:{claims:[{
      topic:'Orbital dynamics',quote:'A model explaining orbital dynamics uses gravity and velocity.'
    }]}},sourceCheckpoint:{signature:'fixture-checkpoint'}});
    return res.status(200).json({});
  },{runtime});
  async function call(handler,route,body,operation,status=200,unsigned=false){
    http++;
    const headers={host:'fixture.invalid',origin:'https://fixture.invalid'};
    if(!unsigned){
      if(!client.session)client.session=await call(endpoint,ENERGY,{action:'challenge',publicKey:identity.publicKey,ticket:true},null,200,true);
      const session=client.session.nonce,nonce=randomBytes(24).toString('hex');
      headers['x-mindling-owner']=identity.fingerprint;headers['x-mindling-session']=session;headers['x-mindling-nonce']=nonce;
      if(client.session.ticket)headers['x-mindling-ticket']=client.session.ticket;
      if(operation)headers['x-mindling-operation']=Buffer.from(JSON.stringify(operation)).toString('base64url');
      headers['x-mindling-signature']=sign('sha256',Buffer.from(signingMessage({...identity,session,nonce,route,body,operation})),
        {key:local.privateKey,dsaEncoding:'ieee-p1363'}).toString('hex');
    }
    const res={status(code){this.code=code;return this;},setHeader(){},json(data){this.body=data;}};
    await handler({method:'POST',headers,body},res);
    if(res.code!==status)throw Error(JSON.stringify({route,action:body.action||body.mode,expected:status,actual:res.code,error:res.body?.error?.code}));
    return res.body;
  }
  const callEnergy=(body,status)=>call(endpoint,ENERGY,body,null,status);
  async function measure(label,fn){
    const before=[http,rest,reads,writes,scripts];
    await fn();
    statistics.push([label,...[http,rest,reads,writes,scripts].map((value,index)=>value-before[index])]);
  }
  async function commit(id,cost,awardedXP=0,memoryHashes){
    const {approval}=await callEnergy({action:'authorize-commit',id,cost,awardedXP,memoryHashes});
    await callEnergy({action:'settle',id,approval});
  }
  await measure('Fresh initialization',async()=>{
    await call(endpoint,ENERGY,{action:'availability'},null,200,true);
    await callEnergy({action:'register',wallet:true});
  });
  for(const label of ['Browser reload','Navigation','Inactivity','Wallet address rendering'])await measure(label,async()=>{
    // Both versions render these cached views without calling server handlers.
    if(label==='Browser reload')delete client.session;
  });
  await measure('Talk',async()=>{
    const id=sha256('talk');
    await callEnergy({action:'local-talk',id,text:'A short local talk fixture indeed.'});
    await commit(id,1);
  });
  for(const [label,kind,cost,xp] of [['Teach','teach',2,5],['Deep','deep',3,10]])await measure(label,async()=>{
    const id=sha256(kind);
    await call(learning,LEARN,{input:'Distinct fact during '+kind+'.',candidates:[]},{kind,id});
    await commit(id,cost,xp);
  });
  await measure('Research',async()=>{
    const id=sha256('research'), operation={kind:'foundation',id};
    await callEnergy({action:'research-permission',enabled:true,automaticRequestLimit:12,permissionRevision:1});
    await call(reasoning,REASON,{id:sha256('plan'),mode:'research',context:{mode:'FOUNDATION'}},operation);
    await call(reasoning,REASON,{id:sha256('acquire'),mode:'research-acquire',context:{request:{mode:'FOUNDATION'},remainingCalls:4}},operation);
    await commit(id,2,5,[sha256('A model explaining orbital dynamics uses gravity and velocity.')]);
  });
  // The remaining two points have been spent before opening checkout.
  await store.change(['energy:'+identity.fingerprint],([entry])=>{
    entry.balance={...entry.balance,remaining:0,updatedAt:time};return {writes:[entry]};
  });
  await measure('Opening checkout',async()=>{
    paymentId=(await callEnergy({action:'payment-open'})).session.id;
  });
  await measure('Checking unpaid payment',()=>callEnergy({action:'payment-check',id:paymentId},409));
  await measure('Successful payment',async()=>{
    for(const method of ['GET','POST']){
      http++;
      const res={setHeader(){},status(code){this.code=code;return this;},json(){}};
      await checkout({method,headers:{},query:{session:paymentId},body:{account:address}},res);
      if(res.code!==200)throw Error('Wallet request failed: '+res.code);
    }
    availableFinance=true;
    await callEnergy({action:'payment-check',id:paymentId});
  });
  await measure('Sweep recovery',async()=>{
    const {run}=require(resolve(root,'tools/mindling-payment-worker.cjs'));
    await run({store,payment:()=>payment},false);
    time+=46000;finalized=true;
    await run({store,payment:()=>payment},false);
  });
  console.table(statistics.map(([operation,http,rest,reads,writes,scripts])=>({operation,http,rest,reads,writes,scripts})));
  return {statistics,total:statistics.reduce((sum,row)=>sum.map((value,index)=>value+row[index+1]),[0,0,0,0])};
}
if(require.main===module)run().then(result=>process.stdout.write(JSON.stringify(result)+'\n')).catch(error=>{console.error(error.message);process.exitCode=1;});
