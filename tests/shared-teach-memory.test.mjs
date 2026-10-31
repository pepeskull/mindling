import test from 'node:test';
import assert from 'node:assert/strict';
import {teachMemory} from '../src/learning/teach-memory.js';
import {createSandbox,newMindling,XP} from '../src/preview/sandbox/engine.js';
import {atomicStatements} from '../src/preview/sandbox/atomic-memory.js';
import {graphData} from '../src/memory/graph-data.js';
const cases=[
 {text:'In my fictional world, the word Lumora means a glowing blue tree that grows only at night. Remember this definition.',category:'fictional worldbuilding',topic:'Lumora',concept:'Lumora definition'},
 {text:'A database transaction uses atomicity to ensure that all its changes commit or roll back together.',category:'computer science',topic:'database transactions',concept:'transaction atomicity'},
 {text:'Photosynthesis converts light energy into chemical energy.',category:'biology',topic:'photosynthesis',concept:'photosynthesis'},
 {text:'That system handles the thing in the usual way.',clarify:true}
];
function assessment(example){return {version:3,operations:atomicStatements(example.text).map((text,statement)=>({statement,targetPart:-1,decision:{version:2,relationship:'NEW_MEMORY',operation:example.clarify?'ASK_FOR_CLARIFICATION':statement?'NO_MEMORY_CHANGE':'CREATE_NEW',responseAction:example.clarify?'CLARIFY':'ACKNOWLEDGE',kind:statement?'intention':'claim',certainty:'asserted',concept:example.clarify||statement?'':example.concept,category:example.clarify||statement?'':example.category,categoryId:'',topic:example.clarify||statement?'':example.topic,relatedMemoryId:'',confidence:.95}}))};}
function app(id){return {state:newMindling(createSandbox(),{confirmed:true,id}),async change(reducer,options){this.state=reducer(structuredClone(this.state));this.options=options;}};}
const metadata=memory=>[memory.content,memory.concept,memory.category,memory.topic,memory.analysis,memory.intelligence,memory.contentIntegrity];
for(const example of cases)test(`shared normal/preview assessment and canonical metadata: ${example.category||'ambiguous input'}`,async()=>{
 const fetcher=globalThis.fetch,calls=[];globalThis.fetch=async(url,options)=>{assert.equal(url,'/api/mindling/learn');assert.equal(options.credentials,'same-origin');calls.push(JSON.parse(options.body));return Response.json({service:'mindling-learning-service',assessment:assessment(example)});};
 try{
  const normal=app('normal'),preview=app('preview');await teachMemory(normal,{id:'event',text:example.text,activity:'TEACH'},{journal:true});await teachMemory(preview,{id:'event',text:example.text,activity:'TEACH'});
  assert.deepEqual(calls[0],calls[1]);assert.deepEqual(normal.options,{journal:{id:'event',type:'TEACH'}});assert.deepEqual(preview.options,{});
  if(example.clarify){assert.equal(normal.state.mind.memories.length,0);assert.equal(preview.state.mind.memories.length,0);assert.equal(normal.state.mind.energy.remaining,10);assert.equal(normal.state.mind.lifetimeXP,0);}
  else{
   const a=normal.state.mind.memories[0],b=preview.state.mind.memories[0];assert.deepEqual(metadata(a),metadata(b));assert.equal(a.category,example.category);assert.equal(a.topic,example.topic);assert.equal(a.analysis.confidence,.95);assert.equal(a.intelligence.verification,'unverified-player-claim');assert.equal(a.source,'SERVICE');assert.equal(normal.state.mind.memories.length,1);assert.equal(normal.state.mind.energy.remaining,8);assert.equal(normal.state.mind.lifetimeXP,XP.concept);assert.equal(graphData(normal.state.mind).areas[0].label,example.category);
  }
 }finally{globalThis.fetch=fetcher;}
});
test('failure/low-confidence assessment/closed view/stale memory leave canonical state and rewards unchanged',async()=>{
 const originalFetch=globalThis.fetch,example=cases[2];
 try{
  for(const failure of ['network','low-confidence','closed','stale']){
   const a=app(failure),before=JSON.stringify(a.state);globalThis.fetch=async()=>{
    if(failure==='network')throw TypeError('synthetic offline');
    if(failure==='closed')a.disposed=true;
    if(failure==='stale')(a.state.mind.categories||=[]).push({id:'another',name:'Another saved area'});
    const body=assessment(example);if(failure==='low-confidence')body.operations[0].decision.confidence=.4;
    return Response.json({service:'mindling-learning-service',assessment:body});
   };
   await assert.rejects(teachMemory(a,{id:'event',text:example.text,activity:'TEACH'}),failure==='stale'?/Relevant memories changed/:undefined);
   if(failure!=='stale')assert.equal(JSON.stringify(a.state),before);assert.equal(a.state.mind.memories.length,0);assert.equal(a.state.mind.energy.remaining,10);assert.equal(a.state.mind.lifetimeXP,0);
  }
 }finally{globalThis.fetch=originalFetch;}
});
test('legacy memories stay readable and unchanged; new classification does not migrate old labels',async()=>{
 const originalFetch=globalThis.fetch,a=app('legacy'),example=cases[2];
 a.state.mind.memories.push({id:'legacy-memory',content:'An older saved claim stays in its original category.',category:'Notes: my',categoryId:'legacy-category',topic:'legacy topic',source:'NATIVE',neuronIds:[],synapseIds:[],relatedMemoryIds:[],createdAt:'2026-01-01T00:00:00.000Z'});
 const before=structuredClone(a.state.mind.memories[0]);
 globalThis.fetch=async()=>Response.json({service:'mindling-learning-service',assessment:assessment(example)});
 try{await teachMemory(a,{id:'new',text:example.text,activity:'TEACH'});assert.deepEqual(a.state.mind.memories[0],before);assert.equal(a.state.mind.memories[1].category,'biology');assert.equal(graphData(a.state.mind).stats.canonical,2);}finally{globalThis.fetch=originalFetch;}
});
test('replay is rejected before another inference; exact reinforcement reuses the existing Stage Preview shortcut',async()=>{
 const originalFetch=globalThis.fetch,a=app('repeat'),example=cases[2];let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({service:'mindling-learning-service',assessment:assessment(example)});};
 try{await teachMemory(a,{id:'first',text:example.text,activity:'TEACH'});await assert.rejects(teachMemory(a,{id:'first',text:example.text,activity:'TEACH'}),/already processed/);await teachMemory(a,{id:'second',text:example.text,activity:'TEACH'});assert.equal(calls,1);assert.equal(a.state.mind.memories.length,1);assert.equal(a.state.mind.lifetimeXP,XP.concept);assert.equal(a.state.mind.energy.remaining,8);}finally{globalThis.fetch=originalFetch;}
});
test('the shared Deep Training branch retains Stage Preview metadata and existing activity cost',async()=>{
 const originalFetch=globalThis.fetch,example=cases[1];globalThis.fetch=async()=>Response.json({service:'mindling-learning-service',assessment:assessment(example)});
 try{for(const a of [app('normal-deep'),app('preview-deep')]){await teachMemory(a,{id:'deep-event',text:example.text,activity:'DEEP_TRAINING'});assert.equal(a.state.mind.memories[0].category,example.category);assert.equal(a.state.mind.memories[0].analysis.activity,'DEEP_TRAINING');assert.equal(a.state.mind.energy.remaining,7);assert.equal(a.state.mind.lifetimeXP,XP.concept);}}finally{globalThis.fetch=originalFetch;}
});
test('existing production hydration/migration remains compatible with service-classified new memories',async()=>{
 const {migrateGameplay}=await import('../src/app/gameplay-state.js');
 const a=app('migrated'),m=a.state.mind;
 const legacy={id:'old-record',content:'An older saved claim keeps its classification metadata.',categoryId:'old-category',category:'Notes: my',topic:'old topic',source:'NATIVE',analysis:{confidence:.7,verification:'unverified-player-claim'},createdAt:'2025-12-01T00:00:00.000Z'};
 const data={mindling:[{...m,id:'primary',mindlingId:m.id}],identity:[{id:'local-identity',mindlingId:m.id,playerId:'preserved-player'}],life:[{...m.life,id:'primary',energy:m.energy}],neurons:m.nodes,synapses:m.synapses,memories:[legacy],pathways:[],memorials:[],energyJournal:[]};
 const original=structuredClone(data);a.state=migrateGameplay(data,a.state.now);const hydrated=structuredClone(a.state.mind.memories[0]);
 const originalFetch=globalThis.fetch;globalThis.fetch=async()=>Response.json({service:'mindling-learning-service',assessment:assessment(cases[2])});
 try{await teachMemory(a,{id:'new-after-hydration',text:cases[2].text,activity:'TEACH'});assert.deepEqual(data,original);assert.equal(a.state.mind.id,'migrated');assert.equal(a.state.player.id,'preserved-player');assert.deepEqual(a.state.mind.memories[0],hydrated);assert.equal(hydrated.categoryId,'old-category');assert.equal(a.state.mind.memories[1].category,'biology');}finally{globalThis.fetch=originalFetch;}
});
