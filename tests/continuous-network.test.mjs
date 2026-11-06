import test from 'node:test';import assert from 'node:assert/strict';
import {BrainStateModel} from '../src/network/brain-state-model.js';
import {ActivityModel} from '../src/network/activity-model.js';
const state=(count=0)=>({id:'fixture',nodes:[{id:'origin',position:[0,0,0]},{id:'upper',position:[0,1,0]}],synapses:[{id:'edge',from:'origin',to:'upper',strength:.3}],memories:Array.from({length:count},(_,i)=>({id:'memory-'+i,content:`Synthetic retained observation number ${i}.`,category:'Fixture',relatedMemoryIds:i?['memory-'+(i-1)]:[]}))});
test('persisted brain creates bounded deterministic living baseline without fabricating activity records',()=>{
 const empty=new BrainStateModel();empty.update({});assert.equal(empty.alive,false);assert.equal(empty.height(.5,1000),0);
 const fresh=new BrainStateModel(),grown=new BrainStateModel(),fixture=state(24),before=JSON.stringify(fixture);fresh.update(state());grown.update(fixture);
 assert(fresh.alive&&grown.alive);assert(Math.max(...fresh.profile)<Math.max(...grown.profile));assert.equal(grown.summary.memories,24);assert.equal(grown.summary.associations,23);
 assert.notDeepEqual(Array.from(grown.profile),Array.from(fresh.profile));const copy=new BrainStateModel();copy.update(structuredClone(fixture));assert.deepEqual(copy.profile,grown.profile);
 assert.equal(grown.update(structuredClone(fixture)),false);assert.equal(JSON.stringify(fixture),before);
 const events=new ActivityModel();for(let i=0;i<100;i++){const a=grown.surface(events.values(1000),i/99,1000),b=grown.surface(events.values(7000),i/99,7000);assert(a>=0&&a<=1&&b>=0&&b<=1);}assert.equal(events.events.length,0);assert.notEqual(grown.height(.4,1000),grown.height(.4,7000));
});
test('historical, incomplete and dangling relationships cannot enrich the living baseline; ordering is deterministic',()=>{
 const fixture=state(4),model=new BrainStateModel();fixture.memories[0].intelligence={current:false};fixture.memories[1].contentIntegrity={version:1,status:'incomplete',length:fixture.memories[1].content.length};fixture.memories[3].relatedMemoryIds.push('unknown');fixture.synapses.push({id:'dangling',from:'origin',to:'missing'});model.update(fixture);assert.equal(model.summary.memories,2);assert.equal(model.summary.synapses,1);assert.equal(model.summary.associations,1);
 const reordered=structuredClone(fixture);reordered.memories.reverse();reordered.nodes.reverse();const copy=new BrainStateModel();copy.update(reordered);assert.deepEqual(copy.profile,model.profile);
});
test('real interaction overlays decay back to existing structure and frozen snapshots remain independent',()=>{const brain=new BrainStateModel(),events=new ActivityModel();brain.update(state(8));const frozen=brain.frozen();events.ingest({id:'teach',activity:'TEACH',phase:'accepted'},1000);assert(brain.surface(events.values(1300),.5,1300)>brain.height(.5,1300));assert.equal(brain.surface(events.values(15000),.5,15000),brain.height(.5,15000));brain.update(state(0));assert.notDeepEqual(brain.profile,frozen.profile);assert.equal(events.events.length,1);});
