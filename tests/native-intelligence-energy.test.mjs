import test from 'node:test';
import assert from 'node:assert/strict';
import {energyAt,spendEnergy,creditEnergy,energyProjection,ENERGY_INTERVAL as I} from '../src/economy/energy.js';
import {desktopSupport} from '../src/platform/desktop.js';
import {memoryBasis,validateClassification,validateAnalysis,migrateIndex,indexedEntry,semanticCandidates} from '../src/learning/intelligence-index.js';
import {MODEL_KEY,CLASSIFIER_KEY,ANALYSIS_VERSION,INFORMATION_TYPES} from '../src/learning/model-config.js';
import {createSandbox,newMindling,learn} from '../src/preview/sandbox/engine.js';
import {RenderBuffers,REMOTE_SCALE} from '../src/preview/evolution-scene.js';
import {BrainIdentities} from '../src/network/brain-identity.js';
const start=()=>newMindling(createSandbox(),{confirmed:true,id:'index-player'});
const vector=i=>Array.from({length:384},(_,j)=>j===i?1:0);
// Deliberate fixtures test contracts, NOT pretrained classification accuracy.
const analysis=(mind,text,i=0,type='FACT_CLAIM')=>({mode:'ai',version:ANALYSIS_VERSION,model:MODEL_KEY,classifier:CLASSIFIER_KEY,basis:memoryBasis(mind),text,embedding:vector(i),classification:{type,domain:'Astronomy',topic:'Planetary rotation',confidence:.9,evidence:text}});
test('regeneration retains partial intervals across serialization and spends',()=>{
 let e=spendEnergy(energyAt(null,0),4,0);e=energyAt(e,I/2);assert.equal(e.remaining,6);e=spendEnergy(JSON.parse(JSON.stringify(e)),1,I*3/4);assert.equal(energyAt(e,I).remaining,6);assert.equal(energyAt(e,2*I).remaining,7);
 assert.equal(energyProjection(e,I*3/4).nextIn,I/4);
});
test('full balance never banks time and spending starts a new interval',()=>{
 const e=spendEnergy(energyAt(null,0),2,100*I);assert.equal(energyAt(e,100*I+I-1).remaining,8);assert.equal(energyAt(e,101*I).remaining,9);assert.equal(energyAt(e,1000*I).remaining,10);
});
test('legacy balances migrate without UTC refill; bonus survives and normal capacity is ten',()=>{
 const midnight=Date.UTC(2026,9,18),old={day:1,remaining:4};const e=energyAt(old,midnight-1000);assert.equal(energyAt(e,midnight+1000).remaining,4);assert.deepEqual(old,{day:1,remaining:4});
 const paid=creditEnergy(energyAt({remaining:14},0),5,0);assert.equal(paid.bonus,9);const spent=spendEnergy(paid,12,0);assert.equal(spent.bonus,7);assert.equal(energyAt(spent,100*I).remaining,17);
 assert.throws(()=>energyAt({...paid,version:99},0));
});
test('backwards clock, malformed time and rejected spending preserve balance',()=>{
 const e=spendEnergy(energyAt(null,2*I),10,2*I),snapshot=structuredClone(e);assert.deepEqual(energyAt(e,I),e);assert.throws(()=>spendEnergy(e,1,I));assert.throws(()=>energyAt(e,NaN));assert.deepEqual(e,snapshot);
});
test('desktop signals allow narrow laptops and reject phones/tablets/ambiguous touch devices',()=>{
 for(const platform of ['Win32','MacIntel','Linux x86_64'])assert.equal(desktopSupport({platform,fine:true,hover:true}).allowed,true);
 for(const signals of [{ua:'Android',platform:'Linux',fine:true,hover:true},{platform:'MacIntel',touch:5,fine:true,hover:true},{platform:'Linux',touch:5,coarse:true},{}])assert.equal(desktopSupport(signals).allowed,false);
});
test('all information types validate independently of topic; uncertain classifications remain explicit',()=>{
 for(const type of INFORMATION_TYPES)assert.equal(validateClassification({type,domain:'Finance',topic:'Trading education',confidence:.9,evidence:'Learn'},'Learn to trade').type,type);
 assert.equal(validateClassification({type:'GOAL',confidence:.1,evidence:'Become'},'Become a trader').type,'UNCERTAIN');
 assert.throws(()=>validateClassification({type:'FACT_CLAIM',domain:'Science',topic:'Earth',confidence:1,evidence:'invented'},'Earth rotates'));
});
test('five legacy examples gain a resumable additive index without changing original records or gameplay',()=>{
 const texts=['Become a trader','Learn to trade','You need to learn trade finance',"Earth’s rotation makes the Sun appear to rise in the east and set in the west.",'The Earth rotates around its own axis, causing day and night.'];
 const s=start();s.mind.memories=texts.map((content,i)=>({id:`legacy-${i}`,content,strength:3,activations:7,embeddingModel:'legacy-provider',embedding:[1,2],neuronIds:['old']}));const original=structuredClone(s);
 const items=s.mind.memories.map((m,i)=>({id:m.id,analysis:analysis(s.mind,m.content,i,['AMBITION','INSTRUCTION','ADVICE','FACT_CLAIM','FACT_CLAIM'][i])}));
 let next=migrateIndex(s,items.slice(0,3));next=migrateIndex(next,items.slice(3));assert.deepEqual(next.mind.memories,original.mind.memories);assert.deepEqual(next.mind.energy,original.mind.energy);assert.equal(next.mind.lifetimeXP,original.mind.lifetimeXP);assert.deepEqual(migrateIndex(next,items),next);assert.deepEqual(s,original);
 assert.equal(Object.keys(next.mind.intelligence.entries).length,5);
});
test('semantic candidates require matching model, content and dimensions; strong factual links are never guessed',()=>{
 const s=start();s.mind.memories=[{id:'a',content:'The Earth rotates around its own axis.'},{id:'b',content:'Rotation changes the apparent position of the Sun.'}];
 const next=migrateIndex(s,s.mind.memories.map(m=>({id:m.id,analysis:analysis(s.mind,m.content)})));
 assert.equal(semanticCandidates(next.mind,vector(0)).length,2);assert.equal(indexedEntry(next.mind,next.mind.memories[1]).relations[0].type,'SAME_TOPIC');
 next.mind.intelligence.entries.a.model='another-model';assert.equal(indexedEntry(next.mind,next.mind.memories[0]),null);next.mind.memories[1].content='Changed';assert.equal(semanticCandidates(next.mind,vector(0)).length,0);
});
test('stale, fabricated and ambiguous semantic analysis cannot spend Energy or mutate memories',()=>{
 const s=start(),text='The Earth rotates around its own axis, causing day and night.',a=analysis(s.mind,text);const good=learn(s,{id:'first',text,analysis:a});assert.equal(good.mind.energy.remaining,8);assert.equal(good.mind.lifetimeXP,50);
 const snapshot=structuredClone(good);assert.throws(()=>learn(good,{id:'stale',text,analysis:a}),/stale/);
 const other='Planetary rotation produces alternating daylight and darkness.';assert.throws(()=>validateAnalysis(analysis(good.mind,other),other,good.mind),/repeat/);assert.deepEqual(good,snapshot);
});
test('each demo brain retains geometry, topology, color and breathing phase in both rendering roles',()=>{
 const cache=new BrainIdentities();for(const id of ['demo:nova','demo:echo','demo:atlas']){
 const brain=cache.get(id),before=structuredClone(brain),b=new RenderBuffers();b.writeBrain(brain,240,[3,1,0],REMOTE_SCALE,1,12,false);const remote=b.positions.slice(720,720+brain.positions.length),radii=b.radii.slice(240,336),colors=b.regions.slice(240,336);b.segmentCount=0;b.writeBrain(brain,0,[0,0,0],1,1,12,false);
 for(let i=0;i<remote.length;i++)assert.ok(Math.abs((remote[i]-[3,1,0][i%3])/REMOTE_SCALE-b.positions[i])<1e-6);
 for(let i=0;i<radii.length;i++)assert.ok(Math.abs(radii[i]/REMOTE_SCALE-b.radii[i])<1e-6);
 assert.deepEqual(colors,b.regions.slice(0,96));assert.equal(cache.get(id),brain);assert.deepEqual(brain,before);
 }
 assert.notDeepEqual(cache.get('demo:nova').positions,cache.get('demo:echo').positions);
});
test('empty Energy gains one, five and ten points at 12, 60 and 120 minutes without duplicate credit',()=>{
 const e=spendEnergy(energyAt(null,0),10,0);
 for(const [elapsed,balance] of [[I,1],[5*I,5],[10*I,10]]){const next=energyAt(e,elapsed);assert.equal(next.remaining,balance);assert.deepEqual(energyAt(JSON.parse(JSON.stringify(next)),elapsed),next);}
});
test('sandbox wall time and simulated time remain separate from production state',async()=>{
 const {advanceSandbox,advanceTime}=await import('../src/preview/sandbox/engine.js');const state=start(),original=structuredClone(state);state.wallAt=1000;state.mind.energy=spendEnergy(state.mind.energy,10,state.now);
 const offline=advanceSandbox(state,1000+5*I);assert.equal(offline.mind.energy.remaining,5);assert.equal(advanceTime(state,1).mind.energy.remaining,5);assert.equal(original.mind.energy.remaining,10);assert.throws(()=>advanceSandbox(state,NaN));
});
