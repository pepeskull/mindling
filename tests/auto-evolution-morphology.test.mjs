import test from 'node:test';
import assert from 'node:assert/strict';
import { createSandbox,newMindling,reconcileEvolution,eligibility,RULES,XP,DAY,learn,advanceSandbox,advanceTime } from '../src/preview/sandbox/engine.js';
import { advanceGameplay } from '../src/app/gameplay-state.js';
import { energyCapacityForStage } from '../src/economy/energy.js';
import { generateStage, Morphology } from '../src/preview/evolution-model.js';
import { stagePresentation } from '../src/renderer/stage-presentation.js';
import { growCanonical, NEURAL_CAPACITY } from '../src/brain/canonical-growth.js';
import { PreviewStore } from '../src/preview/sandbox/storage.js';
import { MindlingDatabase } from '../src/storage/database.js';
import { StageBrainScene } from '../src/renderer/stage-brain-scene.js';
import { SceneInteraction } from '../src/renderer/scene-interaction.js';
import { applyMemoryDecision } from '../src/preview/sandbox/memory-mutation.js';
import { acquireWebGL, releaseWebGL } from '../src/renderer/shared-webgl.js';

const fresh=()=>newMindling(createSandbox(0,'player'),{id:'mind',confirmed:true});
function ready(stage=1){
 const s=fresh(),m=s.mind,rule=RULES[stage-1];m.stage=stage;s.now=rule.days*DAY;
 m.stageXP=rule.xp;m.lifetimeXP=900;m.milestones=Array.from({length:rule.concepts},(_,i)=>`concept-${i}`);
 m.life.lastAt=s.now;m.energy={version:2,capacity:energyCapacityForStage(stage),remaining:11,bonus:4,updatedAt:s.now};
 return s;
}
test('six automatic transitions: all gates, unique milestones, death, no refill or invented growth',()=>{
 for(let stage=1;stage<7;stage++){
  const s=ready(stage),before=structuredClone(s),next=reconcileEvolution(s);
  assert.equal(next.mind.stage,stage+1);assert.equal(next.mind.stageHistory.length,1);
  assert.equal(next.mind.stageXP,0);assert.deepEqual(next.mind.milestones,[]);assert.equal(next.mind.enteredAt,s.now);
  assert.equal(next.mind.lifetimeXP,900);assert.deepEqual(next.mind.history,s.mind.history);
  assert.deepEqual(next.mind.nodes,s.mind.nodes);assert.deepEqual(next.mind.synapses,s.mind.synapses);assert.deepEqual(next.mind.memories,[]);
  assert.equal(next.mind.energy.remaining,11);assert.equal(next.mind.energy.bonus,4);assert.equal(next.mind.energy.capacity,energyCapacityForStage(stage+1));
  assert.deepEqual(s,before);assert.deepEqual(reconcileEvolution(next),next);
  const restored=JSON.parse(JSON.stringify(next));assert.deepEqual(reconcileEvolution(restored),restored);
  for(const missing of ['xp','milestones','duration','dead','tombstone','health','stability']){
   const input=ready(stage);
   if(missing==='xp')input.mind.stageXP--;
   if(missing==='milestones')input.mind.milestones=Array(ruleCount(stage)).fill('same concept');
   if(missing==='duration')input.now--;
   if(missing==='dead')input.mind.life.lifeState='DECEASED';
   if(missing==='tombstone')input.tombstones.push({id:'mind',at:input.now});
   if(missing==='health')input.mind.life.attributes.health=0;
   if(missing==='stability')input.mind.life.attributes.neuralStability=0;
   assert.equal(eligibility(input).eligible,false,missing);assert.equal(reconcileEvolution(input).mind.stage,stage,missing);
  }
 }
 const final=ready(7);assert.equal(reconcileEvolution(final).mind.stage,7);
});
const ruleCount=stage=>RULES[stage-1].concepts;
test('final legitimate learning, elapsed time, offline life and Preview virtual time reconcile',()=>{
 const s=ready();s.mind.stageXP=25;s.mind.milestones.pop();
 const learned=reconcileEvolution(learn(s,{id:'last-learning',text:'Programming uses reusable functions to organize source code.'}));
 assert.equal(learned.mind.stage,2);assert.equal(learned.mind.lifetimeXP,905);assert.equal(learned.mind.memories.length,1);assert.equal(learned.mind.nodes.length,5);
 const elapsed=ready();elapsed.now=DAY-3600000;elapsed.mind.life.lastAt=elapsed.now;elapsed.mind.energy.updatedAt=elapsed.now;
 assert.equal(reconcileEvolution(advanceTime(elapsed,1)).mind.stage,2);
 elapsed.wallAt=1000;assert.equal(reconcileEvolution(advanceSandbox(elapsed,3601000)).mind.stage,2);
 assert.equal(reconcileEvolution(advanceGameplay(elapsed,DAY)).mind.stage,2);
 const deadOffline=ready();deadOffline.mind.life.lastAt=0;deadOffline.now=30*DAY;
 assert.equal(reconcileEvolution(advanceGameplay(deadOffline,30*DAY)).mind.stage,1);
});

// A small transactional request double exercises the real store methods (including
// rollback and serialized concurrent reads). It is not a browser IndexedDB test.
class AtomicRequestDB {
 constructor(entries={}){this.stores=new Map(Object.entries(entries).map(([name,rows])=>[name,new Map(rows)]));this.tail=Promise.resolve();this.failStore=null;}
 close(){}
 transaction(names,mode='readonly'){
  names=Array.isArray(names)?names:[names];const jobs=[];let aborted=false,finish,working;
  const done=new Promise(resolve=>finish=resolve),previous=this.tail;this.tail=done;
  const tx={error:null,abort:()=>{aborted=true;},objectStore:name=>({
   get:key=>request(()=>structuredClone(working.get(name).get(key))),
   getAll:()=>request(()=>structuredClone([...working.get(name).values()])),
   put:(value,key=value.id)=>{if(this.failStore===name)throw Error('forced write failure');return request(()=>working.get(name).set(key,structuredClone(value)));}
  })};
  const request=fn=>{const r={};jobs.push(()=>{r.result=fn();r.onsuccess?.();});return r;};
  previous.then(()=>queueMicrotask(()=>{
   working=new Map(names.map(name=>[name,new Map(this.stores.get(name)||[])]));
   try{while(jobs.length&&!aborted)jobs.shift()();}catch(error){tx.error=error;aborted=true;}
   if(aborted){tx.onabort?.();}else{if(mode==='readwrite')for(const [name,rows] of working)this.stores.set(name,rows);tx.oncomplete?.();}finish();
  }));return tx;
 }
}
test('actual Preview transaction: concurrency, reload, reducer failure and failed writes are atomic',async()=>{
 const initial=ready(),db=new AtomicRequestDB({sandbox:[['state',initial]]}),store=new PreviewStore();store.db=db;
 const [a,b]=await Promise.all([store.change(s=>s),store.change(s=>s)]);
 assert.equal(a.mind.stage,2);assert.equal(b.mind.stage,2);assert.equal(b.mind.stageHistory.length,1);
 assert.equal((await store.read()).mind.stageHistory.length,1);
 const reloaded=new PreviewStore();reloaded.db=db;assert.equal((await reloaded.change(s=>s)).mind.stageHistory.length,1);
 db.stores.get('sandbox').set('state',structuredClone(initial));
 await assert.rejects(store.change(s=>{const next=reconcileEvolution(s);assert.equal(next.mind.stage,2);throw Error('rollback');}),/rollback/);
 assert.deepEqual(await store.read(),initial);
 db.failStore='sandbox';await assert.rejects(store.change(s=>s),/forced write/);db.failStore=null;assert.deepEqual(await store.read(),initial);
});
test('actual production transaction: history and projections commit once, failed persistence rolls back',async()=>{
 const initial=ready(),db=new AtomicRequestDB({gameplay:[['primary',{id:'primary',state:initial}]]});
 const previous=globalThis.indexedDB;
 globalThis.indexedDB={open:()=>{const r={};queueMicrotask(()=>{r.result=db;r.onsuccess();});return r;}};
 try{
  const store=await new MindlingDatabase().open();
  const [a,b]=await Promise.all([store.changeGameplay(s=>s),store.changeGameplay(s=>s)]);
  assert.equal(a.mind.stage,2);assert.equal(b.mind.stageHistory.length,1);
  assert.equal((await store.get('mindling','primary')).stage,2);
  assert.equal((await store.getAll('neurons')).length,5);assert.equal((await store.getAll('synapses')).length,4);
  db.stores.get('gameplay').set('primary',{id:'primary',state:structuredClone(initial)});
  const snapshot=structuredClone(db.stores);db.failStore='synapses';await assert.rejects(store.changeGameplay(s=>s),/forced write/);db.failStore=null;
  assert.deepEqual(db.stores,snapshot);store.close();
 }finally{globalThis.indexedDB=previous;}
});
test('all Replay definitions are identical; primary counts remain canonical; mapping survives growth/reload',()=>{
 const targets=[5,24,64,104,148,196,240],morph=new Morphology();
 for(let stage=1;stage<=7;stage++){
  const m=fresh().mind;m.stage=stage;const saved=JSON.stringify(m);
  const dashboard=stagePresentation(m),development=stagePresentation(JSON.parse(saved));
  assert.deepEqual(dashboard.visualMorphology,generateStage(stage));assert.deepEqual(dashboard.visualMorphology,morph.stages[stage-1]);
  assert.equal(dashboard.visualMorphology,development.visualMorphology);
  assert.equal(dashboard.visualNeuronCount,targets[stage-1]);assert.equal(dashboard.canonicalNeuronCount,5);assert.equal(dashboard.canonicalSynapseCount,4);
  assert.equal(JSON.stringify(m),saved);assert.deepEqual(dashboard.projection,development.projection);
 }
 const m=fresh().mind;m.stage=2;const before=stagePresentation(m).projection;
 growCanonical(m,'genuine-formation');const after=stagePresentation(m);
 assert.equal(after.visualNeuronCount,24);assert.equal(after.canonicalNeuronCount,6);assert.deepEqual(after.projection.slice(0,5),before);
 assert.equal(new Set(after.projection.map(p=>p.visualIndex)).size,6);assert.equal(new Set(after.projection.map(p=>JSON.stringify(p.position))).size,6);
 assert.deepEqual(stagePresentation(JSON.parse(JSON.stringify(m))).projection,after.projection);
 assert.deepEqual(NEURAL_CAPACITY,[5,12,20,30,42,54,64]);
});
function canvasEnvironment(){
 const originals=Object.fromEntries(['document','matchMedia','devicePixelRatio'].map(k=>[k,globalThis[k]]));
 const context=new Proxy({}, {get:(target,key)=>target[key]??((...args)=>{for(const arg of args)if(typeof arg==='number')assert.ok(Number.isFinite(arg),`${String(key)} non-finite coordinate`);return {addColorStop(){}};}),set:(t,k,v)=>(t[k]=v,true)});
 globalThis.matchMedia=()=>({matches:false});globalThis.devicePixelRatio=1;
 const host={children:[],dataset:{},clientWidth:800,clientHeight:600,append(canvas){canvas.parentElement?.children.splice(canvas.parentElement.children.indexOf(canvas),1);this.children.push(canvas);canvas.parentElement=this;}};
 globalThis.document={querySelector:()=>({clientHeight:900}),createElement:()=>({dataset:{},setAttribute(){},getContext:()=>context,getBoundingClientRect:()=>({left:0,top:0,width:800,height:600}),remove(){this.parentElement.children.splice(this.parentElement.children.indexOf(this),1);this.parentElement=null;}})};
 return {host,restore:()=>Object.assign(globalThis,originals)};
}
test('Canvas adapter renders seven stages, selects only saved topology, supports reduced motion and teardown',()=>{
 const env=canvasEnvironment();
 try{
  const m=fresh().mind,scene=new StageBrainScene(null,()=>{},new SceneInteraction(),null);
  scene.mount(env.host,m);scene.resize(800,600);scene.render(0,.016);assert.ok(scene.seed);assert.equal(env.host.children.length,1);
  for(let stage=2;stage<=7;stage++){
   m.stage=stage;scene.update(m);scene.setReducedMotion(true);scene.render(1,.016);
   assert.equal(scene.scene.morph.progress,1);assert.equal(scene.scene.morph.target.nodes.length,[5,24,64,104,148,196,240][stage-1]);
   assert.equal(scene.seed,null);assert.equal(env.host.children.length,1);
   const point=new Float32Array(2);scene.scene.canonicalPoint(0,point);
   assert.deepEqual(scene.selectAt({clientX:point[0],clientY:point[1]}),{type:'neuron',id:'origin'});
   for(let i=5;i<scene.scene.morph.target.nodes.length;i++){
    scene.scene.project(scene.scene.buffers.positions,i*3,point);const hit=scene.selectAt({clientX:point[0],clientY:point[1]});
    assert.ok(!hit||m.nodes.some(n=>n.id===hit.id)||m.synapses.some(e=>e.id===hit.id));
   }
   assert.equal(scene.scene.buffers.pulseCount,0);
  }
  const saved=JSON.stringify(m);scene.destroy();assert.equal(env.host.children.length,0);assert.equal(JSON.stringify(m),saved);
 }finally{env.restore();}
});
test('Dashboard/Development share one context and dispose it only after the last owner',()=>{
 let allocations=0,disposals=0,losses=0;globalThis.devicePixelRatio=1;
 class Renderer{constructor(){allocations++;this.domElement={remove(){}};}setPixelRatio(){}dispose(){disposals++;}forceContextLoss(){losses++;}}
 const T={WebGLRenderer:Renderer},a=acquireWebGL(T),b=acquireWebGL(T);
 assert.equal(a,b);assert.equal(allocations,1);releaseWebGL(a);assert.equal(disposals,0);releaseWebGL(b);assert.equal(disposals,1);assert.equal(losses,1);
});

test('a valid stored correction can supply the final XP without creating neural structure',()=>{
 const s=ready();s.mind.stageXP=27;
 s.mind.memories.push({id:'preference',content:'I prefer tea.',concept:'Tea preference',kind:'preference',intelligence:{kind:'preference'},neuronIds:['origin'],synapseIds:['origin-upper']});
 const updated=applyMemoryDecision(s,{id:'correct',text:'I prefer coffee.',activity:'TEACH'},
  {version:3,operations:[{statement:0,targetPart:-1,decision:{operation:'UPDATE_EXISTING',kind:'preference',relatedMemoryId:'preference',concept:'Coffee preference',category:'Preferences',certainty:'asserted',relationship:'UPDATED'}}]},{XP});
 const next=reconcileEvolution(updated);assert.equal(next.mind.stage,2);assert.equal(next.mind.lifetimeXP,903);assert.equal(next.mind.nodes.length,5);assert.equal(next.mind.memories.length,1);assert.equal(next.mind.history.at(-1).xp,3);
});
test('initial/reloaded stage is immediate; later committed stages morph; XP-only updates keep buffers',()=>{
 const env=canvasEnvironment();
 try{
  const m=fresh().mind;m.stage=2;const scene=new StageBrainScene(null,null,new SceneInteraction(),null);scene.mount(env.host,m);scene.resize(800,600);
  assert.equal(scene.scene.morph.stage,2);assert.equal(scene.scene.morph.progress,1);
  const positions=scene.scene.canonicalPositions,lines=scene.scene.canonicalLines;
  m.stageXP=5;scene.update(m);assert.equal(scene.scene.canonicalPositions,positions);assert.equal(scene.scene.canonicalLines,lines);
  m.stage=3;scene.update(m);assert.equal(scene.scene.morph.progress,0);scene.render(0,.8);assert.equal(scene.scene.morph.progress,.5);scene.render(1,.8);assert.equal(scene.scene.morph.progress,1);
  const before=scene.data.projection;growCanonical(m,'real-structure');scene.update(m);
  assert.deepEqual(scene.data.projection.slice(0,5),before);assert.equal(scene.data.canonicalNeuronCount,6);assert.ok(scene.scene.canonicalSignal);
  scene.destroy();const restored=new StageBrainScene(null,null,new SceneInteraction(),null);restored.mount(env.host,JSON.parse(JSON.stringify(m)));assert.equal(restored.scene.morph.progress,1);assert.equal(restored.scene.canonicalSignal,undefined);restored.destroy();
 }finally{env.restore();}
});
test('all sixty-four canonical IDs retain distinct stable slots',()=>{
 const m=fresh().mind;
 for(let stage=2;stage<=7;stage++){
  m.stage=stage;
  for(let i=0;i<400;i++)growCanonical(m,`stage-${stage}-event-${i}`);
  const view=stagePresentation(m),slots=view.projection.map(p=>p.visualIndex);
  assert.equal(m.nodes.length,NEURAL_CAPACITY[stage-1]);assert.ok(slots.every(slot=>Number.isInteger(slot)));assert.equal(new Set(slots).size,slots.length);
  assert.equal(new Set(view.projection.map(p=>JSON.stringify(p.position))).size,m.nodes.length);
 }
});
