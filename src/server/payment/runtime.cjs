'use strict';

const {redisStore,failure} = require('./store.cjs');
const {authority,sha256} = require('./identity.cjs');
const {energyLedger,RESEARCH,SEMANTIC} = require('./energy-ledger.cjs');

const ROOT='/api/mindling/';
const LEARN=ROOT+'learn', REASON=ROOT+'reason', ENERGY=ROOT+'energy';
const LEARN_KINDS=new Set(['teach','deep','correction']);
const RESEARCH_DEPTH={foundation:'FOUNDATION','deep-research':'DEEP','talk-research':'TALK_RESEARCH',autonomous:'FOUNDATION'};
const RESEARCH_MODES=new Set(['research','research-acquire','research-evaluate','research-capabilities']);
const accepts=(kind,route,body)=>{
  if (route===LEARN) return LEARN_KINDS.has(kind)&&(kind==='correction')===Boolean(body.correction);
  if (RESEARCH.has(kind)) {
    if(!RESEARCH_MODES.has(body.mode))return false;
    const request=body.mode==='research'?body.context:body.mode==='research-evaluate'?
      body.context?.checkpoint?.request:body.context?.request;
    return body.mode==='research-capabilities'||(request?.mode===RESEARCH_DEPTH[kind]&&
      Boolean(request?.autonomous)===(kind==='autonomous'));
  }
  if (SEMANTIC.has(kind)) {
    if (kind.endsWith('area-pair')) return body.mode==='area-pair';
    if (kind==='memory-pair') return body.mode==='semantic'&&!body.context?.areas&&!body.context?.parentDiscovery;
    return body.mode==='semantic';
  }
  if (kind==='talk') return body.mode==='talk';
  return kind==='evaluation' && !body.mode;
};

function parse(req) {
  if (req.method!=='POST') throw failure('METHOD_NOT_ALLOWED',405);
  const text=typeof req.body==='string'?req.body:JSON.stringify(req.body??null);
  if (Buffer.byteLength(text)>65536) throw failure('REQUEST_TOO_LARGE',413);
  try {
    const body=JSON.parse(text);
    if (!body||typeof body!=='object'||Array.isArray(body)) throw Error();
    return body;
  } catch { throw failure('REQUEST_INVALID',400); }
}

function serviceError(res,error,service) {
  const safe=Number.isInteger(error.status)&&error.status>=400&&error.status<=599&&/^[A-Z_]{1,60}$/.test(error.code||'');
  if (!res.writableEnded&&!res.destroyed) return res.status(safe?error.status:503).json({
    ...(service?{service}:{}),error:{code:safe?error.code:'PAYMENT_UNAVAILABLE'}
  });
}
function origin(req) {
  if(!req.headers.origin)return;
  try {
    if(new URL(req.headers.origin).host===String(req.headers['x-forwarded-host']||req.headers.host))return;
  }catch{}
  throw failure('ORIGIN_INVALID',403);
}
const clientKey=(req,prefix)=>{
  const ip=String(req.headers['x-vercel-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim().slice(0,80);
  return prefix+':'+sha256(ip);
};

function enabled(env) {
  return Boolean(env.UPSTASH_REDIS_REST_URL || env.UPSTASH_REDIS_REST_TOKEN ||
    env.HELIUS_API_KEY || env.MIND_TOKEN_MINT || env.WALLET_PRIVATE_KEY || env.ENCRYPTION_KEY);
}

function ledgerConfigured(env) {
  return Boolean(env.UPSTASH_REDIS_REST_URL?.startsWith('https://')&&env.UPSTASH_REDIS_REST_TOKEN&&env.ENCRYPTION_KEY);
}

function energyCipher(env) {
  if(!ledgerConfigured(env))throw failure('ENERGY_SERVICE_UNAVAILABLE',503);
  try {return require('./payments.cjs').encryption(env.ENCRYPTION_KEY,'operation');}
  catch {throw failure('ENERGY_SERVICE_UNAVAILABLE',503);}
}

function runtimeFor(env=process.env) {
  const activityCipher=energyCipher(env);
  const store = redisStore({url:env.UPSTASH_REDIS_REST_URL,token:env.UPSTASH_REDIS_REST_TOKEN});
  const auth = authority(store);
  return Promise.resolve(energyLedger(store)).then(ledger=>{
    let payment;
    return {store,auth,ledger,activityCipher,payment(){
      if (payment) return payment;
      const {payments,encryption}=require('./payments.cjs');
      const {solanaAdapter}=require('./solana.cjs');
      try {
        const keys=encryption(env.ENCRYPTION_KEY);
        const chain=solanaAdapter({apiKey:env.HELIUS_API_KEY,mintAddress:env.MIND_TOKEN_MINT,walletSecret:env.WALLET_PRIVATE_KEY});
        payment=payments(store,ledger,chain,keys);
        return payment;
      } catch {throw failure('PAYMENT_UNAVAILABLE',503);}
    }};
  });
}

async function qualify(route,kind,body,result) {
  if (route===LEARN) {
    const assessment=result.assessment;
    if (!assessment) throw failure('RECEIPT_INVALID');
    const {normalize}=await import('../../learning/text.js');
    const {atomicStatements,updatePart,updateInput,mutableValue}=await import('../../preview/sandbox/atomic-memory.js');
    const statements=atomicStatements(body.input);
    const decisions=assessment.operations??[{statement:0,decision:assessment}];
    if(kind==='correction'){
      const spend=assessment.operation==='CREATE_NEW'&&assessment.kind!=='intention'&&
        normalize(body.input)!==normalize(body.correction.content);
      return {spend,xp:spend?3:0};
    }
    const distinct=decisions.find(({statement,decision})=>{
      if(!['CREATE_NEW','LINK_TO_EXISTING'].includes(decision.operation)||!statements[statement])return false;
      return !body.candidates.some(item=>item.current!==false&&normalize(item.content)===normalize(statements[statement]));
    });
    const update=decisions.find(({statement,targetPart,decision})=>{
      if(decision.operation!=='UPDATE_EXISTING')return false;
      const target=body.candidates.find(candidate=>candidate.id===decision.relatedMemoryId);
      const part=target&&updatePart(target,decision.kind,targetPart);
      if(!part)return false;
      const prior=part.parts[part.index], next=updateInput(statements[statement],decision.kind);
      return normalize(prior)!==normalize(next)&&!(mutableValue(prior)&&mutableValue(prior)===mutableValue(next));
    });
    return {spend:Boolean(distinct||update||decisions.some(({decision})=>decision.operation==='FLAG_CONTRADICTION')),
      xp:distinct||update?(kind==='deep'?10:5):0,
      ...(distinct||update?{subject:sha256(normalize(body.input))}:{}),
      ...(distinct?{concept:sha256(normalize(distinct.decision.concept))}:{})};
  }
  if(kind==='talk'){
    const {normalize}=await import('../../learning/text.js');
    return {spend:true,xp:result.reasoning?.insufficientInformation===false?3:0,
      subject:sha256(normalize(body.context.problem))};
  }
  if(RESEARCH.has(kind)&&['research-evaluate','research-acquire'].includes(body.mode)){
    const {researchRelation}=await import('../../autonomous/memory-evolution.js');
    const {normalize}=await import('../../learning/text.js');
    const memories=(body.context?.learning?.candidates||[]).filter(item=>item.complete).map(item=>({
      ...item,contentIntegrity:{version:1,status:'captured',length:item.content.length}
    }));
    const claims=[];
    for(const claim of result.acquisition?.evaluation?.claims||[]){
      const relation=researchRelation({memories,pathways:[],history:[]},{...claim,validAt:claim.validAt??null});
      claims.push({hash:sha256(claim.quote),formed:relation.kind==='new',concept:sha256(normalize(claim.topic))});
    }
    return {claims,xp:kind==='deep-research'?10:kind==='talk-research'?3:5};
  }
  return null;
}

function protect(route,handler,options={}) {
  const isLearn=route===LEARN;
  const service=isLearn?'mindling-learning-service':'mindling-reasoning-service';
  return async (req,res)=>{
    if(!options.runtime&&!enabled(process.env))return serviceError(res,failure('ENERGY_SERVICE_UNAVAILABLE',503),service);
    let body,admitted=false;
    try{
      body=parse(req);
      origin(req);
      const {ledger,auth,store,activityCipher}=await (options.runtime||runtimeFor)();
      const {fingerprint,operation}=await auth.verify(req.headers,route,body,()=>store.rate(clientKey(req,'authenticated'),90,60));
      if(route===REASON&&body.mode==='research-capabilities') {
        await ledger.get(fingerprint);
        return handler(req,res);
      }
      if(!operation||!accepts(operation.kind,route,body))throw failure('INVALID_OPERATION',400);
      const requestId=isLearn?'learn':body.id;
      if(!isLearn&&!/^[a-f0-9]{64}$/.test(requestId||''))throw failure('INVALID_OPERATION',400);
      const phase=isLearn?'learn':body.mode||'evaluation';
      if(!process.env.SERVICE_API&&!options.runtime)throw failure('MODEL_UNAVAILABLE',503);
      const bodyHash=sha256(JSON.stringify(body));
      const {cached,energy}=await ledger.admit(fingerprint,{
        ...operation,phase,requestId,bodyHash,tools:phase==='research-acquire'?body.context?.remainingCalls||0:0,
        checkpointSignature:body.context?.checkpoint?.signature
      });
      admitted=!cached;
      const cipherScope={id:operation.id+':'+requestId,owner:fingerprint,address:route,mint:bodyHash};
      if(cached){
        const body=activityCipher?JSON.parse(activityCipher.open({...cipherScope,sealed:cached.body}).toString()):cached.body;
        return res.status(cached.status).json({...body,energy});
      }
      let status, result;
      const capture={
        status(code){status=code;return capture;},
        json(value){result=value;return capture;},
        setHeader(name,value){if(!res.writableEnded&&!res.destroyed)res.setHeader(name,value);}
      };
      // Once admitted, the server owns this bounded attempt. Browser abort
      // events must not stop its checkpoint or receipt from reaching Redis.
      const input={method:req.method,headers:req.headers,body:req.body,socket:req.socket};
      await handler(input,capture);
      if(!status||!result)throw failure('OUTCOME_UNKNOWN');
      const json=JSON.stringify(result);
      if(Buffer.byteLength(json)>120000)throw failure('OUTCOME_UNKNOWN');
      const saved={status,body:activityCipher?activityCipher.seal(Buffer.from(json),cipherScope):result};
      const recoverable=phase==='research-acquire'&&result.sourceCheckpoint&&!result.error?.diagnostic?.outcomeUnknown;
      const knownNoResult=isLearn&&result.error?.code==='ANALYSIS_INVALID';
      const unknown=status>=500&&!recoverable&&!knownNoResult||Boolean(result.error?.diagnostic?.outcomeUnknown)||status===409;
      const qualification=status===200?await qualify(route,operation.kind,body,result):null;
      const authorityState=await ledger.record(fingerprint,operation.id,requestId,saved,{
        unknown,qualification, checkpointSignature:result.sourceCheckpoint?.signature,
        terminal:(qualification?.spend===false&&qualification.xp===0)||(!unknown&&!recoverable&&status!==200)||(!qualification&&!RESEARCH.has(operation.kind)&&operation.kind!=='area-pair'&&operation.kind!=='automatic-area-pair'&&operation.kind!=='research-semantic'&&!unknown)
      });
      if (!res.writableEnded&&!res.destroyed)return res.status(status).json({...result,energy:authorityState});
    }catch(error){
      if(!admitted&&body?.mode==='area-pair'&&/^[a-f0-9]{64}$/.test(body.id||'')&&[429,503].includes(error.status)){
        return res.status(error.status).json({service,id:body.id,inferenceDispatched:false,error:{code:error.code}});
      }
      return serviceError(res,error,service);
    }
  };
}

function energyHandler(options={}) {
  return async (req,res)=>{
    try {
      const body=parse(req);
      if(Object.hasOwn(body,'cluster')||Object.hasOwn(body,'network'))throw failure('REQUEST_INVALID',400);
      origin(req);
      const active=Boolean(options.runtime)||enabled(process.env);
      res.setHeader('Cache-Control','no-store');
      if(body.action==='availability'){
        if(active&&!options.runtime)energyCipher(process.env);
        return res.status(200).json({active,cluster:active?'mainnet':null});
      }
      if(!active)throw failure('ENERGY_SERVICE_UNAVAILABLE',503);
      const runtime=await (options.runtime||runtimeFor)();
      const {store,auth,ledger}=runtime;
      if(body.action==='challenge'){
        await store.rate(clientKey(req,'challenge'),90,60);
        return res.status(200).json(await auth.challenge(body.publicKey));
      }
      const {fingerprint,publicKey,displayId}=await auth.verify(req.headers,ENERGY,body,()=>store.rate(clientKey(req,'authenticated'),90,60));
      let data;
      switch(body.action){
        case 'register':
          data={energy:await ledger.initialize({fingerprint,publicKey,displayId},body.legacy)};break;
        case 'state':
          data={energy:await ledger.get(fingerprint)};break;
        case 'research-permission':
          data=await ledger.setResearch(fingerprint,body.enabled,body.automaticRequestLimit,body.permissionRevision);break;
        case 'authorize-commit':
          data=await ledger.authorizeCommit(fingerprint,body.id,body);break;
        case 'settle':
          data=await ledger.settle(fingerprint,body.id,body.approval);break;
        case 'release':
          data={energy:await ledger.release(fingerprint,body.id)};break;
        case 'local-talk': {
          if(typeof body.text!=='string'||body.text.length>2000||body.text.trim().length<20||
             new Set(body.text.trim().split(/\s+/)).size<4)throw failure('REQUEST_INVALID',400);
          const admission=await ledger.admit(fingerprint,{id:body.id,kind:'talk',phase:'local-talk',requestId:'local',bodyHash:sha256(body.text)});
          data={energy:admission.cached?admission.energy:await ledger.record(fingerprint,body.id,'local',{status:200,body:{}},{qualification:{spend:true,xp:0}})};
          break;
        }
        case 'payment-open': {
          await store.rate(clientKey(req,'payment-open'),12,60);
          const localOrigin=req.headers.origin;
          if(typeof localOrigin!=='string'||!localOrigin.startsWith('https://'))throw failure('PAYMENT_HTTPS_REQUIRED',400);
          const session=await runtime.payment().open(fingerprint,{fresh:body.fresh===true});
          const link=new URL('/api/mindling/pay',localOrigin);
          link.searchParams.set('session',session.id);
          data={session:{...session,qrPayload:session.payable?'solana:'+encodeURIComponent(link.href):null}};
          break;
        }
        case 'payment-current':
          data={session:await runtime.payment().current(fingerprint)};break;
        case 'payment-create':
          await store.rate(clientKey(req,'payment-create'),6,60);
          data={session:await runtime.payment().create(fingerprint,{fresh:body.fresh===true})};break;
        case 'payment-check': {
          await store.rate('payment-check:'+fingerprint,12,60);
          const payment=runtime.payment();
          data=await payment.check(fingerprint,body.id);
          break;
        }
        default:throw failure('REQUEST_INVALID',400);
      }
      return res.status(200).json(data);
    }catch(error){return serviceError(res,error);}
  };
}

function walletHandler(options={}) {
  return async (req,res)=>{
    try{
      if(!options.runtime&&!enabled(process.env))throw failure('PAYMENT_UNAVAILABLE',503);
      res.setHeader('Access-Control-Allow-Origin','*');
      if(req.method==='OPTIONS'){
        res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers','Content-Type');
        return res.status(204).end();
      }
      if(!['GET','POST'].includes(req.method))throw failure('METHOD_NOT_ALLOWED',405);
      const runtime=await (options.runtime||runtimeFor)();
      await runtime.store.rate(clientKey(req,'wallet-checkout'),12,60);
      if(req.method==='GET')return res.status(200).json({label:'Play Mindling · Mainnet'});
      const body=parse(req);
      if(Object.keys(body).length!==1||!Object.hasOwn(body,'account'))throw failure('REQUEST_INVALID',400);
      return res.status(200).json(await runtime.payment().wallet(req.query?.session,body.account));
    }catch(error){
      if (!res.writableEnded&&!res.destroyed) return res.status(error.status||503).json({
        message:/^[A-Z_]{1,60}$/.test(error.code||'')?error.code:'Payment temporarily unavailable'
      });
    }
  };
}

module.exports={protect,energyHandler,walletHandler,runtimeFor,LEARN,REASON};
