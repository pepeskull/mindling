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
  assert.equal(t.evidenceRefinement.state,'QUEUED');
 },{evaluate:()=>({claims:[],limitations:['No directly applicable claim selected.'],nextQuestion:null})});
});
test('automatic empty-result refinement reuses signed sources within four inference calls and performs no new search',async()=>{
 const {scenario}=await import('./support/research-success-harness.mjs'),fixture=createRequire(import.meta.url)('./support/research-success-fixture.cjs');
 let evaluations=0;
 await scenario(async c=>{
  await c.run();let task=c.saved();assert(task.pendingSourceEvidence);assert.equal(task.code,'NO_MODEL_CANDIDATES');
  const searchCount=()=>c.calls.filter(url=>url.endsWith('/responses')).length;
  assert.equal(searchCount(),1);
  await assert.rejects(c.engine.act('retry',task.id),/managed automatically/);
  await c.tick();
  task=c.saved();assert.equal(task.status,'COMPLETED');assert.equal(searchCount(),1);
  assert.equal(task.modelCalls,4);assert.equal(task.evaluationCalls,2);assert.equal(c.app.state.mind.memories.length,3);
 },{evaluate:sources=>++evaluations===1?{claims:[],limitations:['No selected claim.'],nextQuestion:null}:fixture.evaluation(sources)});
});
test('authorized historical area backlog advances through durable receipts, without graph-triggered inference',()=>{
 const m={memories:[memory('a','Current'),memory('b','Ice hockey'),memory('c','Sport'),memory('d','Psychology')]};
 const options={includeAreaReconsideration:true,includeHistoricalAreas:true},before=JSON.stringify(m.memories);
 const ordinary=semanticCandidates(m,['a'],{includeAreaReconsideration:true});
 assert(ordinary.pairs.every(p=>[p.a.id,p.b.id].includes('a')));
 const batch=semanticCandidates(m,['a'],options);
 assert.equal(batch.pairs.length,2);
 const historical=batch.pairs.find(p=>![p.a.id,p.b.id].includes('a'));assert(historical);
 m.learningTasks=[{semanticAttempts:[{state:'COMPLETED',pairs:batch.pairs.map(semanticPairReceipt),areaPairs:batch.pairs.map(semanticPairReceipt)}]}];
 const reloaded=JSON.parse(JSON.stringify(m)),next=semanticCandidates(reloaded,['a'],options);
 assert(next.pairs.length);assert(next.pairs.every(p=>!batch.pairs.some(old=>semanticPairReceipt(old)===semanticPairReceipt(p))));
 reloaded.learningTasks[0].semanticAttempts.push({state:'OUTCOME_UNKNOWN',pairs:next.pairs.map(semanticPairReceipt)});
 assert(semanticCandidates(reloaded,['a'],options).pairs.every(p=>!next.pairs.some(old=>semanticPairReceipt(old)===semanticPairReceipt(p))));
 assert.equal(JSON.stringify(m.memories),before);
});
