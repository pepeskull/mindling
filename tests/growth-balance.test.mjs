import test from 'node:test';
import assert from 'node:assert/strict';
import {energyAt,energyCapacityForStage,setEnergyStage,creditEnergy,spendEnergy,energyProjection,energyLabel,ENERGY_INTERVAL} from '../src/economy/energy.js';
import {createSandbox,newMindling,learn,evolve,XP,RULES,learningReward,upgradeGrowth} from '../src/preview/sandbox/engine.js';
import {growCanonical,repairCanonicalPositions,NEURAL_CAPACITY} from '../src/brain/canonical-growth.js';
import {classifyPathway,recordPathwayLearning,reclassifyPathwayEvidence,pathwayProfile} from '../src/pathways/pathways.js';
import {canonicalBrain} from '../src/renderer/canonical-brain.js';
const fresh=()=>newMindling(createSandbox(0,'player'),{id:'mind',name:'Mind',confirmed:true});
test('exact stage capacities, no refill, bonus separation, offline ticks and rollback',()=>{
 assert.deepEqual([1,2,3,4,5,6,7].map(energyCapacityForStage),[10,12,15,18,22,26,32]);
 for(let stage=1;stage<=7;stage++)for(const base of [0,7,10]){
  const input={version:2,remaining:base+5,bonus:5,updatedAt:1000,capacity:10};
  const e=setEnergyStage(input,stage,1000);assert.equal(e.remaining,input.remaining);assert.equal(e.bonus,5);
  assert.equal(energyProjection(e,1000).maximum,energyCapacityForStage(stage));assert.equal(energyAt(e,0).remaining,e.remaining);
  assert.equal(energyAt(e,1000+ENERGY_INTERVAL).remaining,e.remaining+Math.min(1,energyCapacityForStage(stage)-base));
 }
 const legacy=setEnergyStage({remaining:17},7,0);assert.equal(legacy.remaining,17);assert.equal(legacy.bonus,7);
 let e=creditEnergy(setEnergyStage(energyAt(null,0),7,0),20,0);e=energyAt(e,22*ENERGY_INTERVAL);
 assert.equal(e.remaining,52);assert.equal(e.bonus,20);assert.equal(spendEnergy(e,2,22*ENERGY_INTERVAL).bonus,20);assert.match(energyLabel(e,22*ENERGY_INTERVAL).value,/32 \/ 32/);
});
test('new rewards and anti-farming preserve old history',()=>{
 assert.deepEqual(XP,{concept:5,understanding:12,correction:3,daily:100});assert.equal(learningReward('correction'),3);
 assert.equal(learningReward('understanding'),5);assert.equal(learningReward('understanding',{independentlyVerified:true}),12);
 let s=fresh();const text='Programming uses functions to organize reusable source code.';
 s=learn(s,{id:'first',text,activity:'TEACH'});assert.equal(s.mind.stageXP,5);assert.equal(s.mind.energy.remaining,8);assert.equal(s.mind.memories[0].content,text);
 s=learn(s,{id:'repeat',text,activity:'TEACH'});assert.equal(s.mind.stageXP,5);assert.equal(s.mind.milestones.length,1);
 assert.throws(()=>learn(s,{id:'first',text,activity:'TEACH'}));
 const capped=fresh();capped.mind.history=[{id:'old',day:0,xp:150}];capped.mind.stageXP=150;const history=JSON.stringify(capped.mind.history);
 assert.throws(()=>learn(capped,{id:'new',text,activity:'TEACH'}),/Daily XP/);upgradeGrowth(capped.mind,0);assert.equal(capped.mind.stageXP,150);assert.equal(JSON.stringify(capped.mind.history),history);
});
test('six attainable transitions preserve depleted/full/zero and bonus balances',()=>{
 for(let stage=1;stage<7;stage++)for(const base of [0,7,energyCapacityForStage(stage)]){
  const s=fresh();s.mind.stage=stage;s.mind.stageXP=RULES[stage-1].xp;s.mind.milestones=Array.from({length:RULES[stage-1].concepts},(_,i)=>String(i));s.now=RULES[stage-1].days*86400000;
  s.mind.energy={version:2,remaining:base+4,bonus:4,updatedAt:s.now,capacity:energyCapacityForStage(stage)};
  const next=evolve(s);assert.equal(next.mind.stage,stage+1);assert.equal(next.mind.energy.remaining,base+4);assert.equal(next.mind.energy.bonus,4);assert.equal(next.mind.energy.capacity,energyCapacityForStage(stage+1));assert.equal(next.mind.nodes.length,5);
 }
});
test('canonical growth is persisted data, bounded, distinct and endpoint safe',()=>{
 const m=fresh().mind;growCanonical(m,'seed');assert.equal(m.nodes.length,5);m.stage=2;const memories=JSON.stringify(m.memories);
 for(let i=0;i<50;i++)growCanonical(m,`event-${i}`);
 assert.equal(m.nodes.length,NEURAL_CAPACITY[1]);assert.equal(JSON.stringify(m.memories),memories);
 assert.equal(new Set(m.nodes.map(n=>JSON.stringify(n.position))).size,m.nodes.length);
 assert.ok(m.synapses.every(e=>m.nodes.some(n=>n.id===e.from)&&m.nodes.some(n=>n.id===e.to)));
 const restored=JSON.parse(JSON.stringify(m));assert.equal(canonicalBrain(restored).nodes.length,m.nodes.length);assert.equal(canonicalBrain(restored).synapses.length,m.synapses.length);
 const old=fresh().mind;old.nodes.push({id:'learned-5',position:[0,0,0],size:.6});old.synapses.push({id:'kept',from:'origin',to:'learned-5'});const seed=JSON.stringify(old.nodes.slice(0,5));repairCanonicalPositions(old,1);const once=JSON.stringify(old);repairCanonicalPositions(old,2);assert.equal(JSON.stringify(old),once);assert.equal(JSON.stringify(old.nodes.slice(0,5)),seed);assert.equal(old.synapses.at(-1).id,'kept');
});
test('nine-domain mapping, fractional evidence and retained migration are idempotent',()=>{
 for(const label of ['Programming','Communication','Research methodology','Finance','Gaming','Writing','Statistics','Planning','Logical reasoning'])assert.ok(classifyPathway({category:label}).pathwayId);
 const m={id:'scope',pathways:['Social'],memories:[]},memory={id:'claim',content:'Independent mixed claim',category:'Programming and Research methodology'};m.memories.push(memory);
 recordPathwayLearning(m,memory,{eventId:'event',activity:'TEACH',at:0,recordedAt:0});assert.equal(m.pathwayEvidence[0].allocations.reduce((sum,a)=>sum+a.units,0),1);assert.equal(pathwayProfile(m).pathways.find(p=>p.id==='Developer').evidenceUnits,.5);
 recordPathwayLearning(m,memory,{eventId:'event',at:0});assert.equal(m.pathwayEvidence.length,1);
 const row=m.pathwayEvidence[0];row.policyVersion=1;row.pathwayId=null;row.units=0;row.attribution={field:'category',value:'Research methodology',pathwayId:null};delete row.allocations;
 reclassifyPathwayEvidence(m,1);assert.equal(row.pathwayId,'Researcher');const once=JSON.stringify(m);reclassifyPathwayEvidence(m,2);assert.equal(JSON.stringify(m),once);assert.equal(row.eventId,'event');assert.equal(row.recordedAt,0);assert.deepEqual(m.originPathways,['Social']);
 assert.equal(classifyPathway({category:'Programming and unsupported mystery'}).pathwayId,null);
});
