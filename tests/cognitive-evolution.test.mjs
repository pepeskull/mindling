import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMemoryEvolution, newMemoryEvolution, displayMemoryStrength } from '../src/memory/evolution-policy.js';
import { createSandbox, newMindling, learn, reinforce } from '../src/preview/sandbox/engine.js';
import { graphData, filterGraph, layoutGraph, memoryCircleRing } from '../src/memory/graph-data.js';
import { knowledgeTalk } from '../src/cognition/talk-response.js';
import { stopLearning } from '../src/autonomous/learning-engine.js';
import { defaultPermissions } from '../src/autonomous/research-permissions.js';
import { capturedContent } from '../src/memory/content-integrity.js';
import { DAILY_RESEARCH_PAUSE } from '../src/autonomous/research-xp.js';

const passages=[
 'Worker honeybees perform a waggle dance to communicate the location of nectar and pollen to nestmates.',
 'The angle of the waggle run relative to vertical corresponds to the direction of the food source relative to the Sun.',
 'The duration of a waggle run increases with the distance to the food source.',
 'Honeybees have a seasonal diet that can vary significantly with food availability.'
];
const questions=[
 'What does the waggle dance communicate to other honeybees, and how are direction and distance represented?',
 'How do honeybees tell each other where to find food using their dance, including which way to fly and how far to travel?'
];
const example=(id,content,category='Behavior')=>({id,content,category,concept:content,kind:'claim',source:'NATIVE',
 contentIntegrity:capturedContent(content),strength:.3,activations:1,relatedMemoryIds:[]});
const fresh=()=>newMindling(createSandbox(Date.now()),{confirmed:true,id:'cognitive-test'});

test('memory evolution starts at 10%, aggregates strongest event and never rounds up to 100%',()=>{
 const at='2026-11-24T12:00:00.000Z';
 assert.deepEqual(newMemoryEvolution(at),{strength:.1,activations:1,lastActivatedAt:at,memoryPolicyVersion:1});
 const memories=[{id:'a',strength:.3,activations:3},{id:'b',strength:.9,activations:1},{id:'c',strength:1,activations:7},{id:'d',strength:NaN,activations:-1},{id:'e',strength:.5,activations:3,kind:'historical'}];
 const [a,b,c,d,e]=memories;
 const reinforced=applyMemoryEvolution(memories,[['a','TEACH_REINFORCEMENT'],['a','DEEP_USE'],['b','RESEARCH_CORROBORATION'],['c','TALK_RECALL'],['d','TALK_RECALL'],['e','TALK_RECALL']],at);
 assert.deepEqual(reinforced,['a','b','d']);
 assert.equal(a.strength,.3+.05*(1-.3));assert.equal(a.activations,4);
 assert.equal(b.strength,.9+.08*(1-.9));assert.equal(b.activations,2);
 assert.equal(c.strength,1);assert.equal(c.activations,8);assert.equal(c.lastReinforcedAt,undefined);
 assert.equal(d.strength,.01);assert.equal(d.activations,1);
 assert.deepEqual(e,{id:'e',strength:.5,activations:3,kind:'historical'});
 assert.equal(displayMemoryStrength(.99999),'99.9%');assert.equal(displayMemoryStrength(1),'100%');
 assert.equal(displayMemoryStrength(.109),'10.9%');assert.equal(displayMemoryStrength(NaN),'Not recorded');
});

test('native Teach and Deep use the correct diminishing weights and durable event identity',()=>{
 let state=fresh();
 state=learn(state,{id:'learn-one',text:passages[0]});
 assert.equal(state.mind.memories[0].strength,.1);
 const old=structuredClone(state.mind.memories[0]);old.strength=.3;
 state.mind.memories[0]=old;
 const taught=reinforce(state,{id:'teach-one',text:passages[1],memoryId:old.id});
 assert.equal(taught.mind.memories[0].strength,.3+.03*(1-.3));
 assert.equal(taught.mind.memories[0].activations,2);
 const deep=reinforce(taught,{id:'deep-one',text:passages[2],memoryId:old.id,activity:'DEEP_TRAINING'});
 const before=taught.mind.memories[0].strength;
 assert.equal(deep.mind.memories[0].strength,before+.05*(1-before));
 assert.equal(deep.mind.memories[0].activations,3);
 deep.mind.activityHistory=[];
 assert.throws(()=>reinforce(deep,{id:'deep-one',text:passages[2],memoryId:old.id,activity:'DEEP_TRAINING'}),/already processed/);
 assert.equal(state.mind.memories[0].strength,.3);
});

async function talkFixture(run,{cap=false,withMemories=true,preview=false}={}){
 const oldFetch=globalThis.fetch;
 const globals=Object.fromEntries(['window','document','navigator'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 Object.defineProperty(globalThis,'document',{configurable:true,value:Object.assign(new EventTarget(),{hidden:false})});
 Object.defineProperty(globalThis,'window',{configurable:true,value:new EventTarget()});
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true}});
 const permissions={async researchPermissions(){return defaultPermissions('cognitive-test');}};
 const app={state:fresh(),[preview?'store':'db']:permissions,talkAbort:new AbortController(),events:{emit(){}},async change(fn){
   const next=fn(structuredClone(this.state));
   if(this.fail&&next.mind.history.some(event=>event.kind==='talk'))throw Error('Local write failed.');
   this.state=next;
 },renderState(){}};
 if(withMemories){
  app.state.mind.memories=passages.map((content,index)=>example('bee-'+index,content));
  app.state.mind.memories[3].complete=false;
  app.state.mind.memories[3].contradictions=[{claim:'Diet does not change with seasonal conditions.'}];
 }
 if(cap)app.state.mind.history.push({id:'cap',day:Math.floor(app.state.now/86400000),xp:100});
 const control={used:[0,1,2],answer:'The dance tells other bees where to find food and how far to fly.',partial:false,calls:[]};
 globalThis.fetch=async(url,options)=>{
   assert.equal(url,'/api/mindling/reason');const body=JSON.parse(options.body);assert.equal(body.mode,'talk');control.calls.push(body);
   const memoryIds=control.used.map(index=>'bee-'+index);
   return Response.json({service:'mindling-reasoning-service',kind:'talk',reasoning:{answer:control.answer,explanation:'Based on stored claims.',facts:control.used.map(index=>({memoryId:'bee-'+index,quote:passages[index],basis:'stored_claim'})),inferences:[],memoryIds,uncertainty:control.partial?'high':'low',insufficientInformation:control.partial,missingInformation:control.partial?['I cannot establish the distance relationship.']:[]}});
 };
 try{await run(app,control);}finally{
  stopLearning(app);globalThis.fetch=oldFetch;
  for(const [key,descriptor] of Object.entries(globals))if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
 }
}

for(const preview of [false,true])test(`waggle-dance recall uses current evidence at 100 daily XP (${preview?'Stage Preview':'normal'})`,()=>talkFixture(async(app,control)=>{
 const unused=structuredClone(app.state.mind.memories[3]);
 const first=await knowledgeTalk(app,questions[0],'first');
 assert.equal(first.answer,control.answer);assert.equal(first.researchTaskId,undefined);assert.deepEqual(first.memoryIds,['bee-0','bee-1','bee-2']);
 assert.equal((await knowledgeTalk(app,questions[0],'first')).answer,first.answer);
 assert.equal(control.calls.length,1);
 assert.ok(control.calls[0].context.candidates.some(memory=>memory.id===unused.id));
 assert.deepEqual(app.state.mind.memories[3],unused);
 assert.ok(app.state.mind.memories.slice(0,3).every(memory=>memory.strength===.3+.01*(1-.3)&&memory.activations===2));
 app.state.now+=61000;app.state=JSON.parse(JSON.stringify(app.state));
 const rephrased=await knowledgeTalk(app,questions[1],'rephrase');
 assert.equal(rephrased.researchTaskId,undefined);
 assert.ok(app.state.mind.memories.slice(0,3).every(memory=>memory.activations===3));
 assert.equal(app.state.mind.memories.length,4);assert.equal(app.state.mind.learningTasks?.length||0,0);
 assert.equal(app.state.mind.history.at(-1).xp,0);
},{cap:true,preview}));

test('partial recall at the cap preserves its answer and uses only cited knowledge',()=>talkFixture(async(app,control)=>{
 control.used=[0];control.partial=true;control.answer='The waggle dance communicates the location of food.';
 const reply=await knowledgeTalk(app,questions[0],'partial');
 assert.equal(reply.researchDeferred,DAILY_RESEARCH_PAUSE);
 assert.equal(reply.answer,control.answer);assert.equal(reply.researchTaskId,undefined);
 assert.match(reply.researchMessage,/Daily XP limit reached/);
 assert.deepEqual(app.state.mind.memories.map(m=>m.activations),[2,1,1,1]);
 assert.equal(app.state.mind.learningTasks?.length||0,0);
},{cap:true}));

test('a rapid rephrasing can be answered without a second activation',()=>talkFixture(async(app,control)=>{
 await knowledgeTalk(app,questions[0],'original');
 const state=structuredClone(app.state.mind.memories);
 const reply=await knowledgeTalk(app,questions[1],'rapid-rephrase');
 assert.equal(reply.answer,control.answer);assert.equal(reply.researchTaskId,undefined);
 assert.deepEqual(app.state.mind.memories,state);
}));

test('a current question does not present an undated memory as a current source',()=>talkFixture(async(app,control)=>{
 control.used=[0];
 const reply=await knowledgeTalk(app,'What do we currently know about the waggle dance?','freshness');
 assert.match(reply.answer,/don’t have a current source to confirm/);
 assert.ok(reply.answer.includes(passages[0]));
 assert.equal(reply.researchDeferred,DAILY_RESEARCH_PAUSE);
},{cap:true}));

test('a genuine gap below the cap queues one task and waits for authorization',()=>talkFixture(async(app,control)=>{
 const reply=await knowledgeTalk(app,questions[0],'unknown');
 assert.ok(reply.researchTaskId);assert.equal(reply.insufficientInformation,true);assert.equal(control.calls.length,0);
 assert.equal(app.state.mind.learningTasks.length,1);
 const existing=await knowledgeTalk(app,questions[0],'unknown-new-id');
 assert.equal(existing.researchTaskId,reply.researchTaskId);assert.equal(app.state.mind.learningTasks.length,1);
},{withMemories:false}));

test('language mismatch preserves the original quote and a failed write does not activate it',()=>talkFixture(async(app,control)=>{
 control.used=[0];control.answer='The dance tells the other bees where they can find food.';
 const query='Hur berättar honungsbin var maten finns med sin dans?';
 app.fail=true;const before=structuredClone(app.state);
 await assert.rejects(knowledgeTalk(app,query,'sweden'),/Local write failed/);
 assert.deepEqual(app.state,before);
 app.fail=false;const reply=await knowledgeTalk(app,query,'sweden');
 assert.match(reply.answer,/Det här minns jag:/);assert.ok(reply.answer.includes(passages[0]));
 assert.equal(app.state.mind.memories[0].activations,2);
}));

test('circle growth counts unique, visible or filtered, typed cross-area connections without mutation',()=>{
 const memories=[example('a',passages[0]),example('b',passages[1],'Navigation'),example('c',passages[2]),example('historical',passages[3]),example('legacy',passages[3]),example('sibling',passages[3])];
 const [a,b,c,h,legacy,sibling]=memories;
 h.kind='historical';a.relatedMemoryIds=['b','b','c','a','unknown','historical','legacy'];
 a.modelAssociations=a.relatedMemoryIds.filter(id=>id!=='legacy').map(memoryId=>({memoryId,operation:'LINK_TO_EXISTING'}));
 a.coSubmittedMemoryIds=[sibling.id];b.relatedMemoryIds=['a'];b.modelAssociations=[{memoryId:'a',operation:'LINK_TO_EXISTING'}];
 const before=JSON.stringify(memories),graph=graphData({memories});
 assert.deepEqual(Object.fromEntries(graph.memories.map(n=>[n.recordId,n.connectionDegree])),{a:2,b:1,c:1,historical:0,legacy:0,sibling:0});
 const grown=layoutGraph(graph).nodes.find(n=>n.recordId==='a');
 const filtered=layoutGraph(filterGraph(graph,{query:'communicate the location'})).nodes.find(n=>n.recordId==='a');
 assert.equal(grown.r,filtered.r);assert.equal(grown.r,5.5+2.7*Math.sqrt(2));
 assert.ok(memoryCircleRing(grown,1)+.5<grown.ownerRadius);
 assert.equal(layoutGraph(graph).nodes.find(n=>n.recordId===legacy.id).r,5.5);
 assert.equal(JSON.stringify(memories),before);
});

test('a highly connected memory fits inside its rendered merged child area and grows again when detached',()=>{
 const center=example('center',passages[0],'Child');
 const memories=[center,...Array.from({length:32},(_,index)=>example(`related-${index}`,`${passages[1]} Fixture ${index}.`,'Root'))];
 center.relatedMemoryIds=memories.slice(1).map(m=>m.id);
 center.modelAssociations=center.relatedMemoryIds.map(memoryId=>({memoryId,operation:'LINK_TO_EXISTING'}));
 const graph=graphData({memories}),root=graph.areas.find(a=>a.label==='Root'),child=graph.areas.find(a=>a.label==='Child');
 const projected=graphData({memories,knowledgeHierarchy:{version:1,revision:1,links:[{parentId:root.id,childId:child.id}]}});
 const grouped=layoutGraph(filterGraph(projected)).nodes.find(n=>n.recordId===center.id);
 assert.equal(grouped.connectionDegree,32);assert.equal(grouped.ownerRadius,8);assert.equal(grouped.r,6.8);
 assert.ok(memoryCircleRing(grouped,.7)+.35<grouped.ownerRadius);
 const detached=layoutGraph(filterGraph(graph)).nodes.find(n=>n.recordId===center.id);
 assert.equal(detached.connectionDegree,32);assert.ok(detached.r>grouped.r&&detached.r<detached.ownerRadius);
});
