import test from 'node:test';
import assert from 'node:assert/strict';
import {semanticCandidates,semanticPairReceipt} from '../src/semantic/model-contract.js';
import {canRetryResearch,SERVICE_MESSAGES} from '../src/autonomous/service-diagnostics.js';
import {learningSummary} from '../src/autonomous/learning-summary.js';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
const memory=(id,area)=>({id,category:area,categoryId:area,content:area+' contains a distinct documented subject.',source:'SERVICE',contentIntegrity:{version:1,status:'captured',length:(area+' contains a distinct documented subject.').length},analysis:{name:'mindling-learning-service',verification:'unverified-player-claim'},intelligence:{kind:'claim',current:true}});
test('existing knowledge delivers distinct cross-area evidence within the unchanged two-pair batch',()=>{
 const m={memories:[memory('a','A'),memory('b','A'),memory('c','A'),memory('d','B'),memory('e','C')]};
 const c=semanticCandidates(m,['a'],{includeAreaReconsideration:true});
 assert.equal(c.pairs.length,2);assert.deepEqual(c.pairs.map(p=>p.b.id),['d','e']);
 m.learningTasks=[{semanticAttempts:[{state:'OUTCOME_UNKNOWN',pairs:[semanticPairReceipt(c.pairs[0])]}]}];
 assert(!semanticCandidates(m,['a'],{includeAreaReconsideration:true}).pairs.some(p=>p.b.id==='d'));
});
test('exact concurrent planning request returns local 409, other IDs remain independent; no unsafe retry',async()=>{
 const {handler}=createRequire(import.meta.url)('../src/server/mindling-reasoning.cjs');
 const prior={api:process.env.SERVICE_API,model:process.env.SERVICE_MODEL,fetch:globalThis.fetch};
 process.env.SERVICE_API='offline';process.env.SERVICE_MODEL='offline';
 let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);let calls=0;
 globalThis.fetch=async()=>{calls++;entered();await gate;return Response.json({error:{code:'offline'}},{status:503});};
 const context={topic:'A generic subject',mode:'FOUNDATION',freshness:false,scope:{criterion:null,geography:[],geographyMode:null,period:null,quantity:null}};
 const request=id=>Object.assign(new EventEmitter(),{method:'POST',headers:{host:'localhost','x-forwarded-for':'local-conflict'},body:{id:id.repeat(64),mode:'research',context}});
 const response=()=>Object.assign(new EventEmitter(),{status(n){this.code=n;return this;},json(body){this.body=body;this.writableEnded=true;return this;}});
 const log=console.warn;console.warn=()=>{};
 try{
  const first=response(),run=handler(request('a'),first);await started;
  const duplicate=response();await handler(request('a'),duplicate);assert.equal(duplicate.code,409);assert.equal(duplicate.body.error.code,'EVALUATION_IN_PROGRESS');assert.equal(calls,1);
  const unrelated=response(),other=handler(request('b'),unrelated);release();await Promise.all([run,other]);assert.notEqual(unrelated.code,409);
  assert(SERVICE_MESSAGES.EVALUATION_IN_PROGRESS);assert.equal(canRetryResearch({code:'EVALUATION_IN_PROGRESS',planningCalls:1,modelCalls:1}),false);
  assert(learningSummary({status:'BLOCKED',code:'NO_MODEL_CANDIDATES',knowledgeIds:[],sourceReferences:[]}).message.includes('proposed no candidate'));
 }finally{release();globalThis.fetch=prior.fetch;console.warn=log;for(const [key,val] of [['SERVICE_API',prior.api],['SERVICE_MODEL',prior.model]])if(val===undefined)delete process.env[key];else process.env[key]=val;}
});
test('zero generated candidates remain distinct from rejected evidence after the actual server/client/engine pipeline',async()=>{
 const {scenario}=await import('./support/research-success-harness.mjs');
 await scenario(async c=>{
  await c.run();const t=c.saved();
  assert.equal(t.code,'NO_MODEL_CANDIDATES');assert.equal(t.status,'BLOCKED');
  assert.equal(t.sourceReferences.length,3);assert.equal(t.evidenceDiagnostics.candidates,0);
  assert.deepEqual(t.evidenceDiagnostics.rejections,[]);assert.equal(t.evidenceDiagnostics.candidateOutcome,'NO_MODEL_CANDIDATES');
  assert.equal(c.app.state.mind.memories.length,0);assert.equal(c.app.state.mind.energy.remaining,10);
  assert.equal(c.app.state.mind.lifetimeXP,0);
  const count=c.calls.length;c.engine.startIfAuthorized(t);assert.equal(c.calls.length,count);
 },{evaluate:()=>({claims:[],limitations:['No directly applicable claim selected.'],nextQuestion:null})});
});
