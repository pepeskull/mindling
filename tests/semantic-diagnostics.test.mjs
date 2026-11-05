import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {semanticCandidates,VERSION} from '../src/semantic/model-contract.js';
import {semanticDiagnostic} from '../src/semantic/diagnostics.js';
import {runSemantic} from '../src/semantic/model-worker.js';
globalThis.crypto??=webcrypto;
const records=JSON.parse(readFileSync(new URL('./support/semantic-audit-three-export.json',import.meta.url))).memories;
const context=semanticCandidates({memories:records},records.map(m=>m.id));assert.equal(context.pairs.length,3);
const {handler}=createRequire(import.meta.url)('../src/server/mindling-reasoning.cjs');
const previous={key:process.env.SERVICE_API,model:process.env.SERVICE_MODEL,fetch:globalThis.fetch,warn:console.warn};process.env.SERVICE_API='offline-private-key';process.env.SERVICE_MODEL='offline-model';
try{
 const logs=[];console.warn=s=>logs.push(JSON.parse(s));
 const cases=[
  [{choices:[{finish_reason:'length',message:{content:'private partial response'}}]},'COMPLETION_INCOMPLETE'],
  [{choices:[{finish_reason:'stop',message:{content:'not json private response'}}]},'COMPLETION_JSON_INVALID'],
  [{choices:[{finish_reason:'stop',message:{content:JSON.stringify({version:VERSION,relationships:null})}}]},'RESULT_ENVELOPE_INVALID']
 ];
 for(const [i,[payload,detail]]of cases.entries()){
  globalThis.fetch=async url=>Response.json(String(url).includes('/models/')?{id:process.env.SERVICE_MODEL}:payload);
  const res={setHeader(){},on(){},removeListener(){},status(s){this.statusCode=s;return this;},json(b){this.body=b;this.writableEnded=true;return this;}};
  await handler({method:'POST',headers:{},socket:{remoteAddress:'semantic-diagnostics-'+i},body:{id:'a'.repeat(64),mode:'semantic',context}},res);
  assert.equal(res.statusCode,502);assert.equal(res.body.error.code,'INVALID_SCHEMA');assert.equal(res.body.error.diagnostic.detail,detail);assert.equal(res.body.error.diagnostic.phase,'SEMANTIC');assert.equal(res.body.error.diagnostic.upstreamStatus,200);
 }
 assert.equal(logs.length,3);assert(!JSON.stringify(logs).includes('private'));assert(!JSON.stringify(logs).includes(records[0].content));
 assert.deepEqual(semanticDiagnostic({phase:'secret',endpoint:'secret',upstreamStatus:'secret',detail:'secret',raw:'private'}),{phase:null,endpoint:null,upstreamStatus:null,detail:'RESULT_VALIDATION_FAILED'});
 // Received diagnostics survive in local task state. Unknown billing outcome
 // still cannot automatically repeat a dispatched inference.
 let state={mind:{id:'diagnostic-fixture',memories:structuredClone(records),learningTasks:[{id:'task',status:'COMPLETED',knowledgeIds:records.map(m=>m.id),modelCalls:4}]}};let calls=0;
 globalThis.fetch=async(url,options)=>{calls++;const {id}=JSON.parse(options.body);return Response.json({service:'mindling-reasoning-service',id,error:{code:'INVALID_SCHEMA',diagnostic:{phase:'SEMANTIC',endpoint:'completions',upstreamStatus:200,detail:'COMPLETION_INCOMPLETE',raw:'must not persist'}}},{status:502});};
 const engine={session:'offline',app:{get state(){return state;}},abort:new AbortController(),loadPermissions:async()=>({enabled:true,revision:1,semanticCallsPerDay:3}),grant:()=>({}),assertLive(){},async patch(id,run,fn){const next=structuredClone(state);fn(next.mind.learningTasks[0],next);state=next;}};
 await runSemantic(engine,state.mind.learningTasks[0]);assert.equal(state.mind.learningTasks[0].semanticAnalysis.diagnostic.detail,'COMPLETION_INCOMPLETE');assert(!JSON.stringify(state).includes('must not persist'));assert.equal(state.mind.learningTasks[0].semanticWork.state,'OUTCOME_UNKNOWN');
 await runSemantic(engine,state.mind.learningTasks[0]);assert.equal(calls,1);assert.deepEqual(state.mind.memories,records);
 state={mind:{id:'diagnostic-fixture',memories:structuredClone(records),learningTasks:[{id:'task',status:'COMPLETED',knowledgeIds:records.map(m=>m.id),modelCalls:4}]}};
 globalThis.fetch=async(url,options)=>{const {id}=JSON.parse(options.body);return Response.json({service:'mindling-reasoning-service',id,result:{version:VERSION,relationships:[null]}});};
 await runSemantic(engine,state.mind.learningTasks[0]);assert.equal(state.mind.learningTasks[0].semanticAnalysis.status,'COMPLETED');assert.equal(state.mind.learningTasks[0].semanticAnalysis.rejections[0].code,'INVALID_SCHEMA');assert.equal(state.mind.learningTasks[0].semanticAttempts[0].result.pairs.length,3);assert.deepEqual(state.mind.memories,records);
 console.log('Latest three actual records: all three pairs reach model context. Mock incomplete completion, invalid JSON and invalid envelope have distinct safe server/client diagnostics; no repeat or memory mutation.');
}finally{globalThis.fetch=previous.fetch;console.warn=previous.warn;if(previous.key===undefined)delete process.env.SERVICE_API;else process.env.SERVICE_API=previous.key;if(previous.model===undefined)delete process.env.SERVICE_MODEL;else process.env.SERVICE_MODEL=previous.model;}
