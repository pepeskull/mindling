import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {reserveSemantic,semanticQueue} from '../src/semantic/scheduling.js';
import {runSemantic} from '../src/semantic/model-worker.js';
import {VERSION,semanticCandidates,RELATIONS} from '../src/semantic/model-contract.js';
globalThis.crypto??=webcrypto;
const hash=t=>createHash('sha256').update(t).digest('hex');
const memory=(id,content)=>({id,content,source:'AUTONOMOUS',category:'Astronomy',topic:'Telescopes',research:{sourceHash:hash(content),quoteHash:hash(content),sourceURL:'https://public-source.org/'+id,observedAt:0}});
function setup(){const task={id:'task',createdAt:1,status:'COMPLETED',knowledgeIds:['b'],modelCalls:4,topic:'Optical telescopes'};return {state:{mind:{id:'mind',energy:{remaining:3},memories:[memory('a','A telescope is an optical instrument.'),memory('b','Astronomers can observe distant objects using a telescope.')],learningTasks:[task]}},prefs:{enabled:true,revision:1,semanticCallsPerDay:0},mutex:Promise.resolve()};}
function engine(shared,session='session'){
 const app={disposed:false,get state(){return shared.state;}};
 return {app,session,abort:new AbortController(),disposed:false,assertLive(id){if(this.disposed||app.disposed||app.state.mind.id!==id)throw Error('identity/lifecycle');},async loadPermissions(){return {...shared.prefs};},grant(p){return {revision:p.revision};},async patch(id,run,fn,options={}){
 const operation=shared.mutex.then(()=>{if(this.disposed||app.disposed)throw Error('disposed');if(options.researchGrant&&(!shared.prefs.enabled||options.researchGrant.revision!==shared.prefs.revision))throw Error('revoked');const next=structuredClone(shared.state),task=next.mind.learningTasks.find(t=>t.id===id);fn(task,next);assert(task.modelCalls<=4);shared.state=next;return task;});shared.mutex=operation.catch(()=>{});return operation;
 }};
}
let calls=0;
const success=async(url,options)=>{calls++;const {id,context}=JSON.parse(options.body);return {ok:true,text:async()=>JSON.stringify({service:'mindling-reasoning-service',id,result:{version:VERSION,relationships:[]}})};};globalThis.fetch=success;
let s=setup(),e=engine(s);await runSemantic(e,s.state.mind.learningTasks[0]);assert.equal(calls,1);
assert.equal(s.state.mind.learningTasks[0].modelCalls,4);
assert.equal(s.state.mind.learningTasks[0].semanticWork.state,'COMPLETED');
s.state=JSON.parse(JSON.stringify(s.state));await runSemantic(engine(s,'again'),s.state.mind.learningTasks[0]);assert.equal(calls,1);
// Concurrent tabs serialize reservations through the existing atomic transaction.
s=setup();s.prefs.semanticCallsPerDay=1;await Promise.all([runSemantic(engine(s,'tab1'),s.state.mind.learningTasks[0]),runSemantic(engine(s,'tab2'),s.state.mind.learningTasks[0])]);assert.equal(calls,2);assert.equal(s.state.mind.learningTasks[0].semanticAttempts.length,1);
// Unknown dispatch never replays, including after JSON reload.
s=setup();s.prefs.semanticCallsPerDay=1;globalThis.fetch=async()=>{calls++;throw new DOMException('offline','AbortError');};await runSemantic(engine(s),s.state.mind.learningTasks[0]);assert.equal(s.state.mind.learningTasks[0].semanticWork.state,'OUTCOME_UNKNOWN');const count=calls;s.state=JSON.parse(JSON.stringify(s.state));assert.equal(semanticQueue(s.state.mind,VERSION).length,0);await runSemantic(engine(s,'reload'),s.state.mind.learningTasks[0]);assert.equal(calls,count);
// Explicit server confirmation of no model dispatch safely reuses its reservation.
s=setup();s.prefs.semanticCallsPerDay=1;globalThis.fetch=async(url,options)=>{const {id}=JSON.parse(options.body);return {ok:false,status:503,text:async()=>JSON.stringify({id,inferenceDispatched:false,error:{code:'MODEL_UNAVAILABLE'}})};};await runSemantic(engine(s),s.state.mind.learningTasks[0]);assert.equal(s.state.mind.learningTasks[0].semanticWork.state,'RESERVED');globalThis.fetch=success;await runSemantic(engine(s,'online'),s.state.mind.learningTasks[0]);assert.equal(s.state.mind.learningTasks[0].semanticAttempts.length,1);assert.equal(s.state.mind.learningTasks[0].modelCalls,4);
// Disabled permission / connectivity defer without paid dispatch or reservation.
s=setup();s.prefs.enabled=false;await runSemantic(engine(s),s.state.mind.learningTasks[0]);assert.equal(s.state.mind.learningTasks[0].semanticWork.reason,'WAITING_PERMISSION');
const nav=Object.getOwnPropertyDescriptor(globalThis,'navigator');Object.defineProperty(globalThis,'navigator',{value:{onLine:false},configurable:true});s=setup();await runSemantic(engine(s),s.state.mind.learningTasks[0]);assert.equal(s.state.mind.learningTasks[0].semanticWork.reason,'WAITING_CONNECTIVITY');if(nav)Object.defineProperty(globalThis,'navigator',nav);else delete globalThis.navigator;
// Revocation immediately before transactional persistence leaves links untouched.
s=setup();s.prefs.semanticCallsPerDay=1;globalThis.fetch=async(url,options)=>{const {id,context}=JSON.parse(options.body),{a,b}=context.pairs[0];s.prefs.enabled=false;s.prefs.revision++;return {ok:true,text:async()=>JSON.stringify({service:'mindling-reasoning-service',id,result:{version:VERSION,relationships:[{memoryA:b.id,memoryB:a.id,type:'application-of',direction:'a-to-b',evidenceA:{start:0,end:b.text.length,quote:b.text},evidenceB:{start:0,end:a.text.length,quote:a.text},assessment:{support:'supported',reason:'Mock relationship',qualifications:[],polarityPreserved:true,modalityPreserved:true,scopePreserved:true,noEquivalence:true,evidenceSufficient:true}}]}})};};await runSemantic(engine(s),s.state.mind.learningTasks[0]);assert(s.state.mind.memories.every(m=>!m.relatedMemoryIds?.length));assert.equal(s.state.mind.learningTasks[0].semanticWork.state,'OUTCOME_UNKNOWN');
// Internal lease and historical daily ledgers are independent.
const now=Date.UTC(2026,10,5),mind={learningTasks:[{id:'a',knowledgeIds:[],modelCalls:4},{id:'b',knowledgeIds:[],modelCalls:4}],semanticLedger:{reserved:999}};
assert.equal(reserveSemantic(mind.learningTasks[0],mind,{fingerprint:'one',version:VERSION,now,owner:'a'}),'RESERVED');
assert.equal(reserveSemantic(mind.learningTasks[1],mind,{fingerprint:'two',version:VERSION,now,owner:'b'}),'SEMANTIC_BUSY');
const ordered=semanticQueue({learningTasks:[{id:'new',createdAt:20,status:'COMPLETED',knowledgeIds:['b']},{id:'old',createdAt:1,status:'COMPLETED',knowledgeIds:['a'],semanticWork:{createdAt:2,state:'DEFERRED'}}]},VERSION);assert.equal(ordered[0].id,'old');
console.log('Durable deferral, explicit allowance recovery, concurrent reservation, unknown outcome, model readiness, permissions/connectivity, ceilings and fairness passed.');
// A successfully validated response integrates old memories, not new research.
const linked=async(url,options)=>{calls++;const {id,context}=JSON.parse(options.body),{a,b}=context.pairs[0];return {ok:true,text:async()=>JSON.stringify({service:'mindling-reasoning-service',id,result:{version:VERSION,relationships:[{memoryA:b.id,memoryB:a.id,type:'application-of',direction:'a-to-b',evidenceA:{start:0,end:b.text.length,quote:b.text},evidenceB:{start:0,end:a.text.length,quote:a.text},assessment:{support:'supported',reason:'Mock explicit application',qualifications:['can'],polarityPreserved:true,modalityPreserved:true,scopePreserved:true,noEquivalence:true,evidenceSufficient:true}}]}})};};
s=setup();s.prefs.semanticCallsPerDay=1;const original=s.state.mind.memories.map(m=>({content:m.content,research:structuredClone(m.research)}));globalThis.fetch=linked;await runSemantic(engine(s),s.state.mind.learningTasks[0]);assert.equal(s.state.mind.learningTasks[0].semanticAnalysis.persisted,1);assert.deepEqual(s.state.mind.memories.map(m=>({content:m.content,research:m.research})),original);assert.deepEqual(s.state.mind.memories[0].relatedMemoryIds,['b']);assert.deepEqual(s.state.mind.memories[1].relatedMemoryIds,['a']);assert.equal(s.state.mind.semanticDispatch,undefined);
// Permission loss before dispatch spends no external inference and retains a
// reusable not-dispatched reservation, rather than creating another allowance.
s=setup();s.prefs.semanticCallsPerDay=1;e=engine(s);let reads=0;e.loadPermissions=async()=>({enabled:++reads===1,revision:1,semanticCallsPerDay:1});const pre=calls;await runSemantic(e,s.state.mind.learningTasks[0]);assert.equal(calls,pre);assert.equal(s.state.mind.learningTasks[0].semanticWork.state,'RESERVED');
// Deleted memory and changed identity are rechecked on the returned response.
s=setup();s.prefs.semanticCallsPerDay=1;globalThis.fetch=async(...args)=>{const response=await linked(...args);s.state.mind.memories.pop();return response;};await runSemantic(engine(s),s.state.mind.learningTasks[0]);assert.equal(s.state.mind.learningTasks[0].semanticAnalysis.persisted,0);assert.equal(s.state.mind.learningTasks[0].semanticAnalysis.rejections[0].code,'UNKNOWN_MEMORY');
s=setup();s.prefs.semanticCallsPerDay=1;globalThis.fetch=async(...args)=>{const response=await linked(...args);s.state.mind.id='replacement';return response;};await runSemantic(engine(s),s.state.mind.learningTasks[0]);assert(s.state.mind.memories.every(m=>!m.relatedMemoryIds));
s=setup();e=engine(s);e.disposed=true;const stopped=calls;await runSemantic(e,s.state.mind.learningTasks[0]);assert.equal(calls,stopped);
// New analysis versions/changed data get a new fingerprint but do not reset caps.
const nextDay=now+86400000,task=mind.learningTasks[0];assert.equal(reserveSemantic(task,mind,{fingerprint:'new-version',version:VERSION+1,allowance:1,now:nextDay,owner:'new'}),'RESERVED');assert.equal(task.modelCalls,4);
console.log('Successful historical linking, before-dispatch revocation, identity/deletion/disposal checks and version/topic bounds passed.');
