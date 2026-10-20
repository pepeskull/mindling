import test from 'node:test';
import assert from 'node:assert/strict';
import {energyAt,spendEnergy,creditEnergy,energyProjection,ENERGY_INTERVAL as I} from '../src/economy/energy.js';
import {desktopSupport} from '../src/platform/desktop.js';
import {createSandbox,newMindling} from '../src/preview/sandbox/engine.js';
import {RenderBuffers,REMOTE_SCALE} from '../src/preview/evolution-scene.js';
import {BrainIdentities} from '../src/network/brain-identity.js';
const start=()=>newMindling(createSandbox(),{confirmed:true,id:'index-player'});
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
