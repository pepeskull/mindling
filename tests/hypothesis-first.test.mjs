import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {scenario} from './support/research-success-harness.mjs';
import {validateHypotheses} from '../src/autonomous/research-hypotheses.js';
import {selectSourceEvaluation,validateResearchCheckpoint} from '../src/autonomous/research-contract.js';
const require=createRequire(import.meta.url),fixture=require('./support/research-success-fixture.cjs');
const hypotheses=fixture.quotes.map((claim,i)=>({id:'h'+(i+1),claim,status:'unverified',relationship:null}));
const evaluate=sources=>({...fixture.evaluation(sources),hypothesisReview:hypotheses.map((h,i)=>({id:h.id,status:'supported',claimIndex:i,reason:'The retained passage supports this hypothesis.'}))});
test('hypotheses stay unverified; planning and verified source acquisition use existing three-call budget',async()=>scenario(async c=>{
 const fetch=globalThis.fetch,requests=[];globalThis.fetch=async(url,options)=>{if(options?.body)requests.push([url,JSON.parse(options.body)]);return fetch(url,options);};
 await c.run();const t=c.saved();assert.equal(t.status,'COMPLETED');assert.equal(t.modelCalls,3);
 assert.equal(c.app.state.mind.memories.length,3);assert.deepEqual(t.hypotheses,hypotheses);
 assert.equal(t.hypothesisReview.filter(r=>r.status==='supported').length,3);
 const plan=requests.find(([url,b])=>b.response_format?.json_schema?.name==='mindling_planning');
 assert(plan);assert(!plan[1].tools);assert(plan[1].messages[0].content.includes('unverified'));
 const search=requests.find(([url])=>url.endsWith('/responses'));assert.deepEqual(JSON.parse(search[1].input).hypotheses,hypotheses);assert.equal(search[1].max_tool_calls,2);
 assert(requests.indexOf(plan)<requests.indexOf(search));
 for(const m of c.app.state.mind.memories){assert(m.research.quoteHash);assert(m.research.sourceURL);assert.equal(m.research.verification,'tool-cited-unverified-synthesis');}
},{hypotheses,evaluate}));
test('hypotheses cannot supply their own evidence; unsupported and malformed reviews cannot create knowledge',()=>{
 const text=fixture.quotes[0],sources=[{id:'s',text,passages:[text],observedAt:Date.now()}];
 const claims=[{sourceId:'s',quote:'A fabricated claim not found in any retained source passage.',category:'Gaming',topic:'Rules',reason:'Not supported',validAt:null}];
 const proposed={claims,limitations:[],nextQuestion:null,hypothesisReview:[{id:'h1',status:'supported',claimIndex:0,reason:'Claimed support'}]};
 const result=selectSourceEvaluation(proposed,sources,{hypotheses:[hypotheses[0]]});
 assert.equal(result.evaluation.claims.length,0);assert.equal(result.evaluation.hypothesisReview[0].status,'rejected');
 assert.throws(()=>selectSourceEvaluation({...proposed,hypothesisReview:[]},sources,{hypotheses:[hypotheses[0]]}));
 assert.throws(()=>validateHypotheses([{...hypotheses[0],status:'verified'}]));
 const declined=selectSourceEvaluation({claims:[],limitations:['No applicable evidence.'],nextQuestion:null,hypothesisReview:[{id:'h1',status:'contradicted',claimIndex:null,reason:'Retained sources conflict with the proposal.'}]},sources,{hypotheses:[hypotheses[0]]});
 assert.equal(declined.evaluation.claims.length,0);
});
test('signed hypothesis context survives abstention and automatic evaluation-only recovery without another search',async()=>{
 let calls=0;
 await scenario(async c=>{
  await c.run();let t=c.saved();assert.equal(t.code,'NO_MODEL_CANDIDATES');
  const cp=validateResearchCheckpoint(t.pendingSourceEvidence);assert.deepEqual(cp.hypotheses,hypotheses);
  const {verify}=require('../src/server/research-checkpoint.cjs');
  await assert.rejects(verify({...cp,hypotheses:[{...hypotheses[0],claim:'Tampered claim'}]},'synthetic-received-secret'));
  c.reopen();await c.tick();t=c.saved();
  assert.equal(t.status,'COMPLETED');assert.equal(t.modelCalls,4);assert.equal(t.evaluationCalls,2);
  assert.equal(c.calls.filter(url=>url.endsWith('/responses')).length,1);assert.equal(c.app.state.mind.memories.length,3);
 },{hypotheses,evaluate:sources=>++calls===1?{claims:[],limitations:['Insufficient evidence selected.'],nextQuestion:null,hypothesisReview:hypotheses.map(h=>({id:h.id,status:'insufficient',claimIndex:null,reason:'No qualifying passage selected.'}))}:evaluate(sources)});
});
test('interrupted local integration retains hypotheses and accepts sources once, without additional paid work',async()=>scenario(async c=>{
 await c.run();assert.equal(c.saved().code,'INTEGRATION_PAUSED');assert.deepEqual(c.saved().pendingSourceEvidence.hypotheses,hypotheses);
 const before=c.calls.length;c.afterBody=null;c.reopen();await c.engine.loadPermissions();await c.run();
 assert.equal(c.saved().status,'COMPLETED');assert.equal(c.calls.length,before);assert.equal(c.app.state.mind.memories.length,3);
},{hypotheses,evaluate,afterBody:c=>c.engine.active.controller.abort('HIDDEN')}));
test('unknown hosted tool outcome cannot promote or retry prepared hypotheses',async()=>scenario(async c=>{
 const fetch=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
  if(url.endsWith('/responses')){
   const output=fixture.searchPayload();const tool={type:'web_search_call',action:{type:'search',sources:[]}};
   output.output=[{...tool,id:'one',status:'completed'},{...tool,id:'two',status:'completed'},{...tool,id:'three',status:'searching'}];
   return Response.json(output);
  }return fetch(url,options);
 };
 await c.run();const t=c.saved();
 assert.equal(t.code,'TOOL_LIFECYCLE_INCOMPLETE');assert.deepEqual(t.hypotheses,hypotheses);
 assert.equal(c.app.state.mind.memories.length,0);assert.equal(t.sourceRequests,2);assert.equal(t.modelCalls,3);
 assert.equal(t.pendingSourceEvidence,undefined);assert.equal(t.researchExecution.outcomeUnknown,true);
 const {canRetryResearch}=await import('../src/autonomous/service-diagnostics.js');assert.equal(canRetryResearch(JSON.parse(JSON.stringify(t))),false);
},{hypotheses,evaluate}));
test('continued abstention exhausts the existing evaluation allowance without another search or automatic retry',async()=>scenario(async c=>{
 await c.run();await c.tick();
 const t=c.saved(),before=c.calls.length;assert.equal(t.code,'NO_MODEL_CANDIDATES');assert.equal(t.modelCalls,4);assert.equal(t.evidenceRefinement.state,'EXHAUSTED');
 await assert.rejects(c.engine.act('retry',t.id));assert.equal(c.calls.length,before);
 assert.equal(c.calls.filter(url=>url.endsWith('/responses')).length,1);assert.equal(c.app.state.mind.memories.length,0);
},{hypotheses,evaluate:()=>({claims:[],limitations:['Insufficient qualifying source evidence.'],nextQuestion:null,hypothesisReview:hypotheses.map(h=>({id:h.id,status:'insufficient',claimIndex:null,reason:'Sources do not establish this proposal.'}))})}));
