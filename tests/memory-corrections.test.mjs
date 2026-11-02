import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {createSandbox,newMindling,learn,XP} from '../src/preview/sandbox/engine.js';
import {correctMemory} from '../src/learning/memory-corrections.js';
import {editableMemoryText,unchangedCorrection} from '../src/learning/correction-content.js';
import {repairCorrectionMetadata} from '../src/learning/correction-metadata-repair.js';
import {analyzeNative} from '../src/learning/native-learning.js';
import {teachMemory} from '../src/learning/teach-memory.js';
import {graphData} from '../src/memory/graph-data.js';
const require=createRequire(import.meta.url),server=require('../src/server/mindling-learning.cjs'),fixture=require('./support/memory-correction-fixture.cjs');
const sha=text=>createHash('sha256').update(text).digest('hex');
export function correctionState(){
 const state=newMindling(createSandbox(),{id:'correction-test',confirmed:true}),observedAt=Date.UTC(2026,9,31),sourceURL='https://www.acmi.net.au/education/game-genres/';
 state.mind.categories=[{id:'genres',name:'Genre comparison'},{id:'history',name:'History'}];
 const memory={id:'original',content:`Source observation (${new Date(observedAt).toISOString()}) from ${sourceURL}: ${fixture.claim}`,createdAt:'2026-10-31T00:00:00Z',category:'Genre comparison',categoryId:'genres',topic:'Common video game genres',source:'AUTONOMOUS',neuronIds:[state.mind.nodes[0].id],synapseIds:[state.mind.synapses[0].id],relatedMemoryIds:['neighbor','other'],research:{taskId:'a'.repeat(64),sourceURL,observedAt,quoteHash:sha(fixture.claim),sourceHash:sha(fixture.claim),evidenceText:fixture.claim,verification:'tool-cited-unverified-synthesis',classificationMethod:'source-evaluated-structured-metadata'}};
 state.mind.memories=[memory,{id:'neighbor',content:'Ancient games reflect the society in which they were played.',category:'History',categoryId:'history',topic:'Game history',source:'NATIVE',relatedMemoryIds:['original']},{id:'other',content:'Games can be studied as cultural artifacts.',category:'History',categoryId:'history',topic:'Game history',source:'NATIVE',relatedMemoryIds:['original']}];
 return state;
}
const app=state=>({state,changes:0,async change(reducer,options){this.state=reducer(structuredClone(this.state));this.options=options;this.changes++;}});
let sequence=0;
async function mocked(callback,{mutate=null,outcome='success'}={}){
 const old={fetch:globalThis.fetch,warn:console.warn,key:process.env.SERVICE_API,model:process.env.SERVICE_MODEL};process.env.SERVICE_API='synthetic-correction-secret';process.env.SERVICE_MODEL='opaque-model';
 const control={calls:[],logs:[],mutate,outcome};console.warn=line=>control.logs.push(JSON.parse(line));
 globalThis.fetch=async(url,options)=>{
  control.calls.push(url);
  if(url==='/api/mindling/learn'){
   const req=Object.assign(new EventEmitter(),{method:'POST',headers:{host:'localhost','x-forwarded-for':`correction-${++sequence}`,...Object.fromEntries(Object.entries(options.headers).map(([k,v])=>[k.toLowerCase(),v]))},body:JSON.parse(options.body)});
   const res={status(code){this.code=code;return this;},json(value){this.body=value;return this;}};await server.handler(req,res);return Response.json(res.body,{status:res.code});
  }
  if(url.endsWith('/models/opaque-model'))return Response.json({id:'opaque-model'});
  assert.equal(url,'https://api.openai.com/v1/chat/completions');const body=JSON.parse(options.body),data=JSON.parse(body.messages[1].content);control.context=data;
  if(control.outcome==='failure')return Response.json({error:{code:'rate_limit_exceeded'}},{status:429});
  const result=fixture.assessment(data);control.mutate?.(result,data);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]});
 };
 try{return await callback(control);}finally{globalThis.fetch=old.fetch;console.warn=old.warn;for(const [key,value] of [['SERVICE_API',old.key],['SERVICE_MODEL',old.model]])if(value===undefined)delete process.env[key];else process.env[key]=value;server._resetRateLimits();}
}
for(const variant of ['source','source-prefix','user','spaces','line-wrap'])test(`unchanged ${variant} returns clear feedback with zero writes, calls or counters`,async()=>mocked(async c=>{
 const a=app(correctionState()),m=a.state.mind.memories[0];let text=fixture.claim;
 if(variant==='source-prefix')text=m.content;
 if(variant==='user'){m.content=fixture.claim;m.source='NATIVE';delete m.research;}
 if(variant==='spaces')text='  '+fixture.claim.replace('game genres','game   genres')+'  ';
 if(variant==='line-wrap')text=fixture.claim.replace('include action','include\naction');
 const before=structuredClone(a.state),result=await correctMemory(a,{memoryId:'original',text});assert.equal(result.code,'NO_CHANGE');assert.equal(result.changed,false);assert.deepEqual(a.state,before);assert.equal(a.changes,0);assert.equal(c.calls.length,0);
}));
test('presentation extraction requires exact source metadata; it never strips an arbitrary source-looking claim',()=>{
 const m=correctionState().mind.memories[0];assert.equal(editableMemoryText(m),fixture.claim);delete m.research.evidenceText;assert.equal(editableMemoryText(m),fixture.claim);delete m.research;assert.equal(editableMemoryText(m),m.content);
});
test('semantic punctuation, case, literals, code indentation and tables are not whitespace no-ops',()=>{
 for(const [before,after] of [['Alice follows Bob.','Bob follows Alice.'],['DNA contains instructions.','dna contains instructions.'],['Is this true?','Is this true.'],['The literal is "a b".','The literal is "a  b".'],['```\nif ready:\n  run()\n```','```\nif ready:\n    run()\n```'],['| a | b |','| a |  b |']])assert.equal(unchangedCorrection(after,{content:before}),false);
});
test('genuine correction uses shared service classification, preserves subject labels and creates one traceable user version',async()=>mocked(async c=>{
 const a=app(correctionState()),original=structuredClone(a.state.mind.memories[0]),nodes=structuredClone(a.state.mind.nodes),synapses=structuredClone(a.state.mind.synapses);
 const result=await correctMemory(a,{memoryId:'original',text:fixture.corrected});const old=a.state.mind.memories[0],current=a.state.mind.memories.find(m=>m.id===result.memoryId);
 assert.equal(c.calls.filter(url=>url==='/api/mindling/learn').length,1);assert.equal(c.context.correction.content,fixture.claim);assert.ok(c.context.candidates.every(m=>m.id!=='original'));
 assert.equal(current.category,'Genre comparison');assert.equal(current.topic,'Common video game genres');assert.equal(current.content,fixture.corrected);assert.equal(current.correctsMemoryId,'original');assert.equal(old.supersededBy,current.id);assert.equal(old.intelligence.current,false);assert.deepEqual(old.research,original.research);assert.equal(old.content,original.content);assert.equal(old.createdAt,original.createdAt);assert.equal(current.research,undefined);assert.equal(current.intelligence.verification,'unverified-player-claim');assert.equal(current.provenance.source,'player');
 assert.deepEqual(a.state.mind.nodes,nodes);assert.deepEqual(a.state.mind.synapses,synapses);assert.equal(a.state.mind.energy.remaining,8);assert.equal(a.state.mind.lifetimeXP,XP.correction);assert.equal(a.state.mind.pathwayEvidence.length,1);assert.equal(graphData(a.state.mind).stats.current,3);
 for(const id of ['neighbor','other']){const neighbor=a.state.mind.memories.find(m=>m.id===id);assert.ok(current.relatedMemoryIds.includes(id));assert.deepEqual(neighbor.relatedMemoryIds,['original',current.id]);}
 const keys=graphData(a.state.mind).edges.map(e=>[e.kind,...[e.from,e.to].sort()].join(':'));assert.equal(new Set(keys).size,keys.length);
 const before=structuredClone(a.state),calls=c.calls.length;const repeat=await correctMemory(a,{memoryId:'original',text:fixture.corrected});assert.equal(repeat.code,'NO_CHANGE');assert.deepEqual(a.state,before);assert.equal(c.calls.length,calls);
}));
test('a different subject receives fresh semantic labels, without inherited web authority',async()=>mocked(async()=>{
 const a=app(correctionState()),result=await correctMemory(a,{memoryId:'original',text:fixture.changedSubject});const memory=a.state.mind.memories.find(m=>m.id===result.memoryId);assert.equal(memory.category,'Biology');assert.equal(memory.topic,'Photosynthesis');assert.equal(memory.research,undefined);
}));
test('a genuine user-provided correction uses the same versioning contract without adding source authority',async()=>mocked(async()=>{
 const a=app(correctionState()),m=a.state.mind.memories[0];m.content=fixture.claim;m.source='NATIVE';delete m.research;
 const result=await correctMemory(a,{memoryId:'original',text:fixture.corrected});const replacement=a.state.mind.memories.find(m=>m.id===result.memoryId);assert.equal(replacement.category,'Genre comparison');assert.equal(replacement.research,undefined);assert.equal(a.state.mind.memories[0].source,'NATIVE');assert.equal(replacement.provenance.source,'player');
}));
test('budget rejection happens before inference, while unchanged text remains free',async()=>mocked(async c=>{
 const a=app(correctionState());a.state.mind.energy.remaining=0;const before=structuredClone(a.state);await assert.rejects(correctMemory(a,{memoryId:'original',text:fixture.corrected}),/Energy/);assert.equal(c.calls.length,0);assert.deepEqual(a.state,before);assert.equal((await correctMemory(a,{memoryId:'original',text:fixture.claim})).code,'NO_CHANGE');
}));
test('the correction target category is retained even beyond the ordinary 12-category context window',async()=>mocked(async c=>{
 const a=app(correctionState());a.state.mind.categories=[...Array.from({length:15},(_,i)=>({id:'extra-'+i,name:'Saved area '+i})),...a.state.mind.categories];const result=await correctMemory(a,{memoryId:'original',text:fixture.corrected});assert.equal(c.context.categories[0].id,'genres');assert.equal(c.context.categories.length,12);assert.equal(a.state.mind.memories.find(m=>m.id===result.memoryId).categoryId,'genres');
}));
test('generic or insufficient assessments fail atomically rather than invoking Notes fallback',async()=>{
 for(const kind of ['Notes','low','clarify','failure'])await mocked(async c=>{
  const a=app(correctionState()),before=structuredClone(a.state);await assert.rejects(correctMemory(a,{memoryId:'original',text:fixture.corrected}));assert.deepEqual(a.state,before);assert.equal(a.changes,0);
 },{outcome:kind==='failure'?'failure':'success',mutate:value=>{if(kind==='Notes')value.decision.category='Notes: genres';if(kind==='low')value.decision.confidence=.3;if(kind==='clarify')Object.assign(value.decision,{operation:'ASK_FOR_CLARIFICATION',responseAction:'CLARIFY'});}});
});
test('concurrent submissions create one correction, one charge and one evidence record',async()=>mocked(async()=>{
 const a=app(correctionState()),results=await Promise.all([correctMemory(a,{memoryId:'original',text:fixture.corrected}),correctMemory(a,{memoryId:'original',text:fixture.corrected})]);assert.equal(results.filter(r=>r.changed).length,1);assert.equal(a.state.mind.memories.length,4);assert.equal(a.state.mind.energy.remaining,8);assert.equal(a.state.mind.lifetimeXP,XP.correction);assert.equal(a.state.mind.pathwayEvidence.length,1);
}));
test('native insufficient classification is neutral, never Notes or a first-words topic',()=>{
 const a=analyzeNative(fixture.claim,{memories:[],categories:[]});assert.equal(a.category,'Unclassified claims');assert.equal(a.topic,'Unclassified claim');assert.equal(a.native.confidence.classification,.35);
});
test('known no-op correction label repair is bounded, idempotent and preserves identity, lineage, sources and evidence',()=>{
 const state=correctionState(),parent=state.mind.memories[0];parent.supersededBy='bad';parent.intelligence={current:false};
 const child={id:'bad',content:fixture.claim,category:'Notes: genres',categoryId:'notes',topic:'common genres compared play',correctsMemoryId:parent.id,relatedMemoryIds:['original','neighbor'],source:'NATIVE',native:{verification:'unverified-player-claim'}};state.mind.memories.push(child);state.mind.categories.push({id:'notes',name:'Notes: genres'});
 const before=structuredClone(state);repairCorrectionMetadata(state,{recordedAt:1});const repaired=state.mind.memories.find(m=>m.id==='bad');assert.equal(repaired.category,'Genre comparison');assert.equal(repaired.topic,'Common video game genres');assert.equal(repaired.id,'bad');assert.equal(repaired.content,child.content);assert.equal(repaired.source,'NATIVE');assert.equal(repaired.research,undefined);assert.deepEqual(repaired.relatedMemoryIds,child.relatedMemoryIds);assert.deepEqual(state.mind.memories[0],before.mind.memories[0]);assert.deepEqual(state.mind.pathwayEvidence,before.mind.pathwayEvidence);assert.deepEqual(state.player,before.player);assert.deepEqual(state.mind.energy,before.mind.energy);
 const once=structuredClone(state);repairCorrectionMetadata(state,{recordedAt:2});assert.deepEqual(state,once);
 for(const mutate of [s=>s.mind.memories[3].content=fixture.corrected,s=>delete s.mind.memories[3].correctsMemoryId,s=>delete s.mind.memories[0].research.classificationMethod,s=>s.mind.categories[0].name='Conflicting registry label']){const ambiguous=structuredClone(before);mutate(ambiguous);const expected=structuredClone(ambiguous);repairCorrectionMetadata(ambiguous);assert.deepEqual(ambiguous,expected);}
});
test('Teach and Deep keep the established shared classification path in normal/Preview callers',async()=>mocked(async()=>{
 for(const activity of ['TEACH','DEEP_TRAINING'])for(const name of ['normal','preview']){const a=app(newMindling(createSandbox(),{id:name,confirmed:true}));await teachMemory(a,{id:'event',text:fixture.definition,activity});assert.equal(a.state.mind.memories[0].category,'fictional worldbuilding');assert.equal(a.state.mind.memories[0].topic,'Lumora');}
}));
test('metadata repair skips invalid records and ambiguous duplicate identities without blocking hydration',()=>{
 const state=correctionState();state.mind.memories.unshift(null,{},'invalid');const before=structuredClone(state);repairCorrectionMetadata(state);assert.deepEqual(state,before);
 const parent=state.mind.memories.find(m=>m?.id==='original');parent.supersededBy='duplicate';parent.intelligence={current:false};
 const child={id:'duplicate',content:fixture.claim,category:'Notes: genres',correctsMemoryId:parent.id};state.mind.memories.push(child,structuredClone(child));const ambiguous=structuredClone(state);repairCorrectionMetadata(state);assert.deepEqual(state,ambiguous);
});
