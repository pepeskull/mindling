import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {validateAcquisition,selectSourceEvaluation,validateResearchCheckpoint} from '../src/autonomous/research-contract.js';
import {validateResearchReceipt} from '../src/cognition/research-receipt.js';
import {validateServiceDiagnostic} from '../src/autonomous/service-diagnostics.js';
import {reconcileSemanticConnections,CONNECTION_LIMITS} from '../src/semantic/memory-connections.js';
import {createSandbox,newMindling,learn} from '../src/preview/sandbox/engine.js';
import {AutonomousLearningEngine} from '../src/autonomous/learning-engine.js';
import {graphData} from '../src/memory/graph-data.js';
const require=createRequire(import.meta.url),{handler}=require('../src/server/mindling-reasoning.cjs'),checkpoint=require('../src/server/research-checkpoint.cjs'),fixture=require('./support/semantic-research-fixture.cjs');
const sha=s=>createHash('sha256').update(s).digest('hex');
const context={request:{topic:'crypto market risks blockchain limitations and use cases',mode:'FOUNDATION',freshness:false,scope:{criterion:null,geography:[],geographyMode:null,period:null,quantity:null}},queries:['crypto market risks'],remainingCalls:2,plan:['Compare actual cited reports']};
let sequence=0;
async function mocked(callback,{payload=fixture.searchPayload(),propose=fixture.evaluation}={}){
 const old={fetch:globalThis.fetch,warn:console.warn,api:process.env.SERVICE_API,model:process.env.SERVICE_MODEL,enabled:process.env.MINDLING_WEB_SEARCH};Object.assign(process.env,{SERVICE_API:'synthetic-envelope-secret',SERVICE_MODEL:'opaque-model',MINDLING_WEB_SEARCH:'enabled'});
 const calls=[],logs=[];console.warn=line=>logs.push(JSON.parse(line));
 globalThis.fetch=async(url,options)=>{calls.push(url);if(url.includes('/models/'))return Response.json({id:'opaque-model'});if(url.endsWith('/responses'))return Response.json(payload);assert.equal(url,'https://api.openai.com/v1/chat/completions');const data=JSON.parse(JSON.parse(options.body).messages[1].content);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(propose(data.sources))}}]});};
 const api=async(mode='research-acquire',input=context)=>{const id=sha('envelope'+(++sequence)),req=Object.assign(new EventEmitter(),{method:'POST',headers:{host:'localhost','x-forwarded-for':'envelope-'+sequence},body:{id,mode,context:input}}),res=Object.assign(new EventEmitter(),{status(code){this.code=code;return this;},json(value){this.body=value;this.writableEnded=true;return this;}});await handler(req,res);return {...res,id};};
 try{return await callback({api,calls,logs});}finally{globalThis.fetch=old.fetch;console.warn=old.warn;for(const [key,value]of [['SERVICE_API',old.api],['SERVICE_MODEL',old.model],['MINDLING_WEB_SEARCH',old.enabled]])if(value===undefined)delete process.env[key];else process.env[key]=value;}
}
test('three supported candidates can pass assessment while an invalid source title fails final acquisition validation',()=>{
 const sources=fixture.quotes.map((text,i)=>({id:'web:'+sha(String(i)),provider:'openai-web-search',url:`https://research${i+1}.org/blockchain`,domain:`research${i+1}.org`,title:i?'Synthetic source':'Crypto Market\nRisks',type:'web-search-synthesis',status:'tool-cited',observedAt:Date.now(),publishedAt:null,text,passages:[text],hash:sha(text)}));
 const selected=selectSourceEvaluation(fixture.evaluation(sources),sources);assert.equal(selected.validation.accepted,3);assert.throws(()=>validateAcquisition({provider:'openai-web-search',sources,requests:2,bytes:100,responseId:'resp_synthetic',evaluation:selected.evaluation}),e=>e.detail==='SOURCE_TITLE_INVALID');
});
test('actual handler normalizes only title layout and returns a valid correlated signed three-claim receipt',async()=>mocked(async({api,logs})=>{
 const res=await api();assert.equal(res.code,200);assert.equal(res.body.acquisition.sources[0].title,'Crypto Market Risks');assert.deepEqual(res.body.acquisition.sources.map(s=>s.text),fixture.quotes);assert.equal(res.body.execution.validation.accepted,3);assert.equal(res.body.execution.sourceCount,3);assert.equal(res.body.execution.completed,2);
 validateResearchReceipt(res.body,{id:res.id,mode:'research-acquire',context});await checkpoint.verify(res.body.sourceCheckpoint,'synthetic-envelope-secret');
 const altered=structuredClone(res.body.sourceCheckpoint);altered.evidence.sources[0].title='Different source';await assert.rejects(checkpoint.verify(altered,'synthetic-envelope-secret'),e=>e.detail==='CHECKPOINT_INVALID_OR_EXPIRED');
 assert.ok(!JSON.stringify(logs).includes(fixture.quotes[0]));assert.ok(!JSON.stringify(logs).includes('synthetic-envelope-secret'));
}));
test('unsafe Unicode/control title metadata is rejected before source evaluation, without modifying its quote',async()=>mocked(async({api})=>{
 const res=await api();assert.equal(res.code,200);assert.equal(res.body.acquisition.sources.length,2);assert.equal(res.body.acquisition.diagnostics.dropped.INVALID_TITLE,1);assert.deepEqual(res.body.acquisition.sources.map(s=>s.text),fixture.quotes.slice(1));
},{payload:fixture.searchPayload({title:'Crypto\u200bMarket Risks'})}));
for(const responseId of ['', ' resp_synthetic ', 'resp_\u0000invalid'])test(`invalid response identifier ${JSON.stringify(responseId)} retains a precise bounded diagnostic`,async()=>mocked(async({api,calls})=>{
 const res=await api();assert.equal(res.code,502);assert.equal(res.body.error.diagnostic.detail,'RESPONSE_ID_INVALID');assert.equal(res.body.error.diagnostic.phase,'ACQUISITION_VALIDATION');assert.equal(res.body.sourceCheckpoint,undefined);validateServiceDiagnostic(res.body.error.diagnostic);assert.equal(calls.filter(u=>u.endsWith('/chat/completions')).length,0);
},{payload:fixture.searchPayload({responseId})}));
function escapedReport(multi=false){
 let text='';const annotations=[],urls=[1,2,3].map(n=>`https://literal${n}.org/report`);
 for(let i=0;i<3;i++)for(let j=0;j<(multi?2:1);j++){
  if(text)text+='\n\n';text+=`Report ${i} passage ${j} describes a cryptographic literal: `+'\\'.repeat(multi?1090:2250);const start_index=text.length;text+='[source]';annotations.push({type:'url_citation',url:urls[i],title:'Synthetic literal report',start_index,end_index:text.length});
 }
 return {id:'resp_literal_fixture',status:'completed',output:[{type:'web_search_call',status:'completed',action:{type:'search',sources:urls.map(url=>({type:'url',url}))}},{type:'message',status:'completed',content:[{type:'output_text',text,annotations}]}]};
}
const literalEvaluation=sources=>({claims:sources.map(s=>({sourceId:s.id,quote:(s.passages?.[0]||s.text).slice(0,100),category:'Cryptography',topic:'Literal representation',reason:'Exact synthetic passage.',validAt:null})),limitations:[],nextQuestion:null});
test('large valid single passages compact losslessly within the original checkpoint limit and recover without search',async()=>mocked(async({api,calls})=>{
 const res=await api();assert.equal(res.code,200);assert.equal(res.body.execution.validation.accepted,3);assert.ok(res.body.acquisition.sources.every(s=>s.passages===undefined));assert.ok(JSON.stringify(res.body.sourceCheckpoint).length<=24000);validateResearchReceipt(res.body,{id:res.id,mode:'research-acquire',context});
 await checkpoint.verify(res.body.sourceCheckpoint,'synthetic-envelope-secret');const resumed=await api('research-evaluate',{checkpoint:res.body.sourceCheckpoint});assert.equal(resumed.code,200);assert.equal(calls.filter(u=>u.endsWith('/responses')).length,1);assert.equal(resumed.body.acquisition.sources[0].hash,res.body.acquisition.sources[0].hash);
},{payload:escapedReport(),propose:literalEvaluation}));
test('a checkpoint that cannot fit without losing passage boundaries fails before assessment with its exact rule',async()=>mocked(async({api,calls})=>{
 const res=await api();assert.equal(res.code,502);assert.equal(res.body.error.diagnostic.detail,'CHECKPOINT_SIZE_LIMIT');assert.equal(res.body.error.diagnostic.phase,'CHECKPOINT_VALIDATION');assert.equal(res.body.error.diagnostic.completed,1);assert.equal(res.body.sourceCheckpoint,undefined);assert.equal(calls.filter(u=>u.endsWith('/chat/completions')).length,0);
},{payload:escapedReport(true),propose:literalEvaluation}));
test('source hash/passages/checkpoint shape violations preserve strict named invariants',async()=>mocked(async({api})=>{
 const res=await api();const a=res.body.acquisition;
 for(const [mutate,detail]of [[x=>x.sources[0].hash='invalid','SOURCE_HASH_INVALID'],[x=>x.sources[0].passages=['Other text'],'SOURCE_PASSAGES_INVALID'],[x=>x.sources[0].observedAt=-1,'SOURCE_METADATA_INVALID']]){const bad=structuredClone(a);mutate(bad);assert.throws(()=>validateAcquisition(bad),e=>e.detail===detail);}
 const bad=structuredClone(res.body.sourceCheckpoint);bad.plan=[17];assert.throws(()=>validateResearchCheckpoint(bad),e=>e.detail==='CHECKPOINT_PLAN_INVALID');
}));

const stateFor=()=>{const s=newMindling(createSandbox(),{id:'semantic-fixture',confirmed:true});s.mind.memories=fixture.records.map((m,i)=>({...m,createdAt:new Date(Date.UTC(2025,i,1)).toISOString(),source:'SERVICE',strength:.3,activations:1,relatedMemoryIds:[]}));return s;};
test('independent cross-area canonical claims gain reciprocal structural associations without changing content or counters',()=>{
 const state=stateFor(),before=structuredClone(state);reconcileSemanticConnections(state);
 for(const memory of state.mind.memories){assert.equal(memory.relatedMemoryIds.length,2);assert.equal(new Set(memory.relatedMemoryIds).size,2);assert.ok(memory.semanticAssociations.every(e=>['definition-subject','dependency-subject','shared-dependency'].includes(e.rule)));const preserved={...memory};delete preserved.semanticAssociations;preserved.relatedMemoryIds=[];assert.deepEqual(preserved,before.mind.memories.find(m=>m.id===memory.id));}
 assert.deepEqual(state.mind.energy,before.mind.energy);assert.equal(state.mind.lifetimeXP,before.mind.lifetimeXP);assert.deepEqual(state.mind.pathwayEvidence,before.mind.pathwayEvidence);assert.equal(graphData(state.mind).stats.associations,3);
 const once=structuredClone(state);reconcileSemanticConnections(state);assert.deepEqual(state,once);
});
test('similar prompt labels, negation, fictional names, incomplete data and speculation do not establish connections',()=>{
 const state=stateFor();state.mind.memories=state.mind.memories.slice(2);
 const texts=['Learn crypto market and blockchain','Crypto market speculation reflects public enthusiasm rather than blockchain consensus.','Solana is a fictional restaurant whose walls display meme coins.','A book titled "Blockchain Ledgers" uses paper pages.','Blockchain ledgers do not use consensus mechanisms.','Blockchain ledgers may use consensus mechanisms.','Cryptoassets use blockchain ledgers. This statement is not true.'];
 texts.forEach((content,i)=>state.mind.memories.push({id:'bad'+i,content,category:'Technical foundations',topic:'Blockchain Ledgers and Consensus',relatedMemoryIds:[]}));
 state.mind.memories.push({...fixture.records[0],id:'missing',topic:''},{...fixture.records[0],id:'incomplete',complete:false},{...fixture.records[0],id:'malformed',contradictions:'legacy invalid value'});const before=structuredClone(state);reconcileSemanticConnections(state);assert.deepEqual(state,before);
});
test('a structurally similar single-word homonym across different subjects is not a semantic connection',()=>{
 const state=stateFor();state.mind.memories=[{id:'planet',content:'Mercury contains iron inside its core.',category:'Astronomy',topic:'Mercury structure',relatedMemoryIds:[]},{id:'instrument',content:'Thermometers use mercury to measure temperature.',category:'Physical instruments',topic:'Mercury thermometers',relatedMemoryIds:[]}];const before=structuredClone(state);reconcileSemanticConnections(state);assert.deepEqual(state,before);
});
test('historical versions and existing links survive reconciliation; invalid and duplicate identities are skipped',()=>{
 const state=stateFor();state.mind.memories[0].supersededBy='solana';state.mind.memories[0].relatedMemoryIds=['solana'];state.mind.memories.push(null,{},structuredClone(state.mind.memories[2]));const original=structuredClone(state.mind.memories[0]);reconcileSemanticConnections(state);assert.deepEqual(state.mind.memories[0],original);assert.equal(state.mind.memories[1].relatedMemoryIds.length,0);
});
test('automatic association degree and candidate work are bounded with no all-to-all graph expansion',()=>{
 const state=stateFor();state.mind.memories=Array.from({length:100},(_,i)=>({id:'record-'+String(i).padStart(3,'0'),content:`Application ${String.fromCharCode(65+i%26)} uses blockchain ledgers to record transfers.`,category:'Technical foundations',topic:'Blockchain applications',relatedMemoryIds:[]}));
 // Unique noun subjects ensure the test is about relation work, not prompt words.
 reconcileSemanticConnections(state);for(const m of state.mind.memories)assert.ok(m.relatedMemoryIds.length<=CONNECTION_LIMITS.links);assert.ok(graphData(state.mind).stats.associations<=200);const once=structuredClone(state);reconcileSemanticConnections(state);assert.deepEqual(state,once);
 state.mind.memories=Array.from({length:1001},(_,i)=>({...fixture.records[i%3],id:'oversized-'+i,relatedMemoryIds:[]}));const oversized=structuredClone(state);reconcileSemanticConnections(state);assert.deepEqual(state,oversized);
});
const decision=(record,target='')=>({version:2,relationship:target?'RELATED_MEMORY':'NEW_MEMORY',operation:target?'LINK_TO_EXISTING':'CREATE_NEW',responseAction:'ACKNOWLEDGE',kind:'claim',certainty:'asserted',concept:record.topic,category:record.category,categoryId:'',topic:record.topic,relatedMemoryId:target,confidence:.95});
test('separate Teach/Deep formation uses the shared connector and validates existing inference targets without duplicate edges',async()=>{
 let state=newMindling(createSandbox(),{id:'sessions',confirmed:true});const a=fixture.records[0],b={...fixture.records[1],content:'Solana meme coins use blockchain ledgers to record token transfers.'};
 state=learn(state,{id:'teach-a',text:a.content,activity:'TEACH',assessment:decision(a)});state=learn(state,{id:'deep-b',text:b.content,activity:'DEEP_TRAINING',assessment:decision(b,'teach-a')});
 assert.deepEqual(state.mind.memories[0].relatedMemoryIds,['deep-b']);assert.deepEqual(state.mind.memories[1].relatedMemoryIds,['teach-a']);assert.equal(state.mind.energy.remaining,5);assert.equal(state.mind.lifetimeXP,10);
 const c=fixture.records[2],id=sha('research-connection'),at=Date.now(),url='https://research3.org/blockchain',hash=sha(c.content),proof={quote:c.content,quoteHash:hash,sourceURL:url,sourceHash:hash,observedAt:at,validAt:null,category:c.category,topic:c.topic};
 state.mind.learningTasks=[{id,version:1,engineVersion:4,mindlingId:state.mind.id,requestId:id,run:'run',mode:'FOUNDATION',topic:c.topic,objective:'Learn about blockchain ledgers',autonomous:true,energyCharged:true,status:'COMMITTING',code:'INTEGRATING',message:'Integrating.',createdAt:at,updatedAt:at,attempts:1,sourceRequests:2,completedWork:['understanding','retrieval','plan','source','evidence'],referenceIds:[],knowledgeIds:[],plan:[],timeSensitive:false,pendingEvidence:[proof],acceptedQuotes:[hash],sourceReferences:[{url,hash,authorizedAt:at,observedAt:at,type:'web-search-synthesis'}]}];
 const authorization={taskId:id,run:'run',url,sourceHash:hash,observedAt:at,validAt:null,quote:c.content,quoteHash:hash,content:`Source observation (${new Date(at).toISOString()}) from ${url}: ${c.content}`,classification:{category:c.category,topic:c.topic}};
 state=learn(state,{id:'autonomous-c',text:c.content,autonomous:authorization});assert.equal(state.mind.memories.length,3);assert.ok(state.mind.memories[2].relatedMemoryIds.includes('teach-a'));assert.ok(state.mind.memories[2].relatedMemoryIds.includes('deep-b'));assert.equal(state.mind.memories[2].source,'AUTONOMOUS');assert.equal(state.mind.energy.remaining,5);assert.equal(state.mind.lifetimeXP,10);
 const app={state,async change(reducer){this.state=reducer(structuredClone(this.state));}};await AutonomousLearningEngine.prototype.manageKnowledge.call({app,assertLive(){}},state.mind.learningTasks[0],'forget-memory',{memoryId:'autonomous-c'});assert.equal(app.state.mind.memories.length,2);assert.ok(app.state.mind.memories.every(m=>!m.relatedMemoryIds.includes('autonomous-c')&&!m.semanticAssociations.some(e=>e.memoryId==='autonomous-c')));
});
