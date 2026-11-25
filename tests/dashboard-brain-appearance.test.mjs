import test from 'node:test';
import assert from 'node:assert/strict';
import { DashboardBrainAppearance } from '../src/renderer/dashboard-appearance/appearance.js';
import { emitBrainActivity } from '../src/app/brain-activity.js';
import { EVENTS } from '../src/app/events.js';
import { scenario } from './support/research-success-harness.mjs';

const edge={id:'origin-upper',from:'origin',to:'upper',strength:.4};
const view={data:{canonicalNetwork:{synapses:[edge]}}};
const memory={id:'stored',synapseIds:[edge.id,'removed']};

test('brain activity emits only routes from the current committed identity',()=>{
  const observed=[];
  const app={state:{mind:{id:'live',life:{lifeState:'ALIVE'},synapses:[edge],memories:[memory]}},events:{emit(...args){observed.push(args);}}};
  emitBrainActivity(app,'other','recall',['stored']);
  emitBrainActivity(app,'live','recall',['unknown']);
  emitBrainActivity(app,'live','recall',['stored']);
  emitBrainActivity(app,'live','talk');
  assert.deepEqual(observed,[
    [EVENTS.BRAIN_ACTIVITY,{identity:'live',category:'recall',synapseIds:[edge.id]}],
    [EVENTS.BRAIN_ACTIVITY,{identity:'live',category:'talk',synapseIds:[edge.id]}]
  ]);
  app.state.mind.life.lifeState='DECEASED';
  emitBrainActivity(app,'live','research',['stored']);
  assert.equal(observed.length,2);
});

test('Activity cues use saved edges, clear when switching modes, and expire',()=>{
  const appearance=new DashboardBrainAppearance();
  assert.equal(appearance.profile,'soft');
  appearance.record({category:'research',synapseIds:[edge.id]},1);
  assert.equal(appearance.events.length,0);
  appearance.mode='activity';
  appearance.record({category:'research',synapseIds:[edge.id,'absent',edge.id]},1);
  appearance.record({category:'recall',synapseIds:[edge.id]},1.1);
  appearance.prepare(view,1.55,false);
  assert.deepEqual(appearance.activeCues.map(cue=>[cue.key,cue.edge.id]),[['research',edge.id],['recall',edge.id]]);
  appearance.prepare(view,1.55,true);
  assert.ok(appearance.activeCues.every(cue=>cue.travel===.72));
  appearance.prepare(view,2.2,true);
  assert.equal(appearance.activeCues.length,0);
  appearance.clear();
  appearance.prepare(view,10,false);
  appearance.prepare(view,20,false);
  assert.deepEqual(appearance.activeCues.map(cue=>cue.key),['idle']);
  appearance.clear();
  assert.equal(appearance.events.length,0);
});

test('Research publishes a cue after receipt recovery and only once persistence succeeds',()=>scenario(async fixture=>{
  const cues=[];
  fixture.app.events={emit(type,event){if(type===EVENTS.BRAIN_ACTIVITY)cues.push(event);}};
  await fixture.run();
  assert.equal(fixture.saved().code,'INTEGRATION_FAILED');
  assert.deepEqual(cues,[]);
  await fixture.run();
  assert.equal(fixture.saved().status,'COMPLETED');
  assert.equal(cues.length,1);
  assert.equal(cues[0].category,'research');
  assert.ok(cues[0].synapseIds.every(id=>fixture.app.state.mind.synapses.some(edge=>edge.id===id)));
  await fixture.run();
  assert.equal(cues.length,1);
},{fault:'integration'}));
