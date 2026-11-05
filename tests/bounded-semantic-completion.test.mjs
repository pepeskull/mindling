import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {semanticCandidates,validateSemanticResult,VERSION} from '../src/semantic/model-contract.js';
import {sentenceSpans,semanticWireContext,decodeSemanticWire} from '../src/semantic/model-wire.js';
import {runSemantic} from '../src/semantic/model-worker.js';
import {graphData} from '../src/memory/graph-data.js';
import {semanticDiagnostic} from '../src/semantic/diagnostics.js';
globalThis.crypto??=webcrypto;
const sha=v=>createHash('sha256').update(v).digest('hex');
// User's exact two reproduction sentences, with explicitly synthetic record
// metadata. No full astronomy export or live source retrieval was supplied.
const teach='Gravity keeps planets in orbit around the Sun.';
const research="Gravity steers a planet's motion; its sideways motion keeps it from falling straight into the Sun.";
const records=[{id:'teach',content:teach,source:'SERVICE',contentIntegrity:{version:1,status:'captured',length:teach.length},analysis:{name:'mindling-learning-service',verification:'unverified-player-claim'},intelligence:{kind:'claim',current:true},category:'Astronomy',topic:'Gravity',relatedMemoryIds:[]},{id:'research',content:research,source:'AUTONOMOUS',research:{quoteHash:sha(research),sourceHash:sha(research),sourceURL:'https://example.org/offline-source',observedAt:0},category:'Astronomy',topic:'Orbital motion',relatedMemoryIds:[]}];
const assessment={support:'supported',reason:'Mock: complementary descriptions of the same orbital process.',qualifications:['No independent factual verification.'],polarityPreserved:true,modalityPreserved:true,scopePreserved:true,noEquivalence:true,evidenceSufficient:true};
const wireResult={version:1,relationships:[{pair:0,reverse:false,type:'complements',evidenceA:{first:0,last:0},evidenceB:{first:0,last:0},assessment}]};
const ctx=semanticCandidates({memories:records},['research']),decoded=decodeSemanticWire(wireResult,ctx);
assert.equal(validateSemanticResult(decoded,ctx).accepted.length,1);
for(const side of ['a','b'])assert.equal(semanticWireContext(ctx).pairs[0][side].sentences[0].text,ctx.pairs[0][side].text);
const awkward='A **star** emits light.\n\nIts symbol is 🌟; this is a symbol, not evidence.';
const special=structuredClone(ctx);special.pairs[0].a.text=awkward;
const whole=structuredClone(wireResult);whole.relationships[0].evidenceA.last=1;
assert.equal(decodeSemanticWire(whole,special).relationships[0].evidenceA.quote,awkward);
assert.equal(validateSemanticResult(decodeSemanticWire(whole,special),special).accepted.length,1);
const invalid=structuredClone(wireResult);invalid.relationships[0].evidenceA.last=999;
assert.equal(validateSemanticResult(decodeSemanticWire(invalid,ctx),ctx).rejections[0].code,'INVALID_SCHEMA');
const mixed={version:1,relationships:[invalid.relationships[0],wireResult.relationships[0]]};assert.equal(validateSemanticResult(decodeSemanticWire(mixed,ctx),ctx).accepted.length,1);
assert.equal(validateSemanticResult(decodeSemanticWire({version:1,relationships:[]},ctx),ctx).accepted.length,0);
const reverse=structuredClone(wireResult);reverse.relationships[0].reverse=true;reverse.relationships[0].type='qualifies';const r=decodeSemanticWire(reverse,ctx).relationships[0];assert.equal(r.memoryA,ctx.pairs[0].b.id);assert.equal(r.direction,'a-to-b');
// Demonstrate the removal of repeated quotation output, not a tokenizer/model
// benchmark. Both transports materialize identical complete evidence spans.
const long='Long evidence retains every material qualification and never guarantees universal outcomes. '.repeat(20).trim();
const longCtx={version:VERSION,pairs:Array.from({length:4},(_,i)=>({a:{...ctx.pairs[0].a,id:'a'+i,text:long},b:{...ctx.pairs[0].b,id:'b'+i,text:long}}))};
const longWire={version:1,relationships:longCtx.pairs.map((p,i)=>({...wireResult.relationships[0],pair:i,evidenceA:{first:0,last:sentenceSpans(long).length-1},evidenceB:{first:0,last:sentenceSpans(long).length-1}}))};
const bytesBefore=JSON.stringify(decodeSemanticWire(longWire,longCtx)).length,bytesAfter=JSON.stringify(longWire).length;assert(bytesAfter<bytesBefore/4);
const {handler}=createRequire(import.meta.url)('../src/server/mindling-reasoning.cjs');
const previous={fetch:globalThis.fetch,warn:console.warn,key:process.env.SERVICE_API,model:process.env.SERVICE_MODEL};
process.env.SERVICE_API='offline-secret';process.env.SERVICE_MODEL='offline-model';let seq=0,mode='valid',modelCalls=0;const logs=[];console.warn=line=>logs.push(JSON.parse(line));
const upstream=async(url,options)=>{
 assert(!url.endsWith('/responses'),'no web search');
 if(url.includes('/models/'))return Response.json({id:'offline-model'});
 modelCalls++;const body=JSON.parse(options.body);assert.equal(body.max_completion_tokens,2600);assert.equal(body.response_format.json_schema.strict,true);assert(!JSON.stringify(body.response_format).includes('"quote"'));
 const payload=JSON.parse(body.messages[1].content);assert(payload.context.pairs[0].a.sentences.length);
 if(mode==='api')return Response.json({error:{code:'server_error',message:'PRIVATE'}},{status:503});
 const result=mode==='invalid'?invalid:mode==='empty'?{version:1,relationships:[]}:wireResult;
 return Response.json({choices:[{finish_reason:mode==='incomplete'?'length':'stop',message:{content:mode==='json'?'PRIVATE invalid JSON':JSON.stringify(result)}}],usage:{prompt_tokens:1200,completion_tokens:mode==='incomplete'?2600:200,completion_tokens_details:{reasoning_tokens:mode==='incomplete'?2500:100},private:'must not persist'}});
};
async function server(body){const response={setHeader(){},on(){},removeListener(){},status(n){this.code=n;return this;},json(b){this.body=b;this.writableEnded=true;return this;}};await handler({method:'POST',headers:{},socket:{remoteAddress:'bounded-'+(++seq)},body},response);return Response.json(response.body,{status:response.code});}
function setup(){let state={mind:{id:'offline-mind',xp:0,energy:10,memories:structuredClone(records),learningTasks:[{id:'task',status:'COMPLETED',knowledgeIds:['research'],modelCalls:3}]}};return {app:{get state(){return state;}},session:'test',abort:new AbortController(),loadPermissions:async()=>({enabled:true,revision:1}),grant:()=>({}),assertLive(id){assert.equal(id,state.mind.id);},async patch(id,run,fn){const next=structuredClone(state);fn(next.mind.learningTasks[0],next);state=next;},reload(){state=JSON.parse(JSON.stringify(state));}};}
try{
 globalThis.fetch=async(url,options)=>url==='/api/mindling/reason'?server(JSON.parse(options.body)):upstream(url,options);
 for(const outcome of ['valid','empty','invalid','incomplete','json','api']){
  mode=outcome;const e=setup(),before=modelCalls;await runSemantic(e,e.app.state.mind.learningTasks[0]);const task=e.app.state.mind.learningTasks[0];assert.equal(modelCalls,before+1);assert.equal(task.modelCalls,4);assert.equal(e.app.state.mind.semanticLedger.reserved,1);
  if(outcome==='valid'){
   assert.equal(task.semanticAnalysis.persisted,1);assert.equal(task.semanticAnalysis.diagnostic.finishReason,'stop');assert.equal(task.semanticAnalysis.diagnostic.accounting.reasoningTokens,100);
   assert.deepEqual(e.app.state.mind.memories[0].relatedMemoryIds,['research']);assert.deepEqual(e.app.state.mind.memories[1].relatedMemoryIds,['teach']);e.reload();assert.equal(graphData(e.app.state.mind).stats.associations,1);
  }else assert(e.app.state.mind.memories.every(m=>m.relatedMemoryIds.length===0));
  if(outcome==='incomplete'){assert.equal(task.semanticAnalysis.failure,'INCOMPLETE_GENERATION');assert.equal(task.semanticAnalysis.diagnostic.finishReason,'length');assert.equal(task.semanticAnalysis.diagnostic.accounting.completionTokens,2600);assert.equal(task.semanticAnalysis.diagnostic.accounting.reasoningTokens,2500);assert.equal(task.semanticWork.state,'OUTCOME_UNKNOWN');}
  if(outcome==='api'){assert.equal(task.semanticAnalysis.diagnostic.upstreamStatus,503);assert.equal(task.semanticAnalysis.diagnostic.errorCategory,'UPSTREAM_HTTP_ERROR');}
  if(outcome==='json')assert.equal(task.semanticAnalysis.diagnostic.detail,'COMPLETION_JSON_INVALID');
  if(outcome==='invalid')assert.equal(task.semanticAnalysis.rejections[0].code,'INVALID_SCHEMA');
  await runSemantic(e,e.app.state.mind.learningTasks[0]);assert.equal(modelCalls,before+1,'no automatic retry or duplicate inference');assert.equal(e.app.state.mind.xp,0);assert.equal(e.app.state.mind.energy,10);
  assert.deepEqual(e.app.state.mind.memories.map(m=>[m.content,m.research,m.source]),records.map(m=>[m.content,m.research,m.source]));
 }
 assert(!JSON.stringify(logs).includes('PRIVATE'));assert(!JSON.stringify(logs).includes(teach));assert(!JSON.stringify(logs).includes('offline-secret'));assert(!JSON.stringify(logs).includes('must not persist'));
 assert.equal(semanticDiagnostic({finishReason:'PRIVATE',usage:{completion_tokens:'PRIVATE'}}).finishReason,null);
 console.log(`Compact wire: ${bytesBefore} → ${bytesAfter} serialized output characters for four long-evidence proposals (not token counts). Valid/abstained/invalid/incomplete/JSON/API paths, real handler→worker→atomic persistence, reload projection and no-repeat accounting passed offline.`);
}finally{globalThis.fetch=previous.fetch;console.warn=previous.warn;if(previous.key===undefined)delete process.env.SERVICE_API;else process.env.SERVICE_API=previous.key;if(previous.model===undefined)delete process.env.SERVICE_MODEL;else process.env.SERVICE_MODEL=previous.model;}
