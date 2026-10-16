import test from 'node:test';
import assert from 'node:assert/strict';
import { AutomaticNetworkCountdown } from '../src/preview/automatic-playback.js';
import { NetworkSimulation, PreviewTimeline } from '../src/preview/evolution-model.js';
import { readDashboardSnapshot } from '../src/preview/dashboard-snapshot.js';

test('countdown waits for the actual final morph, then starts once after five seconds', () => {
  const c = new AutomaticNetworkCountdown(), n = new NetworkSimulation(); n.configure(7);
  c.update(99,{stage:6,transitionComplete:true,network:n});assert.equal(c.remaining,5);
  c.update(99,{stage:7,transitionComplete:false,network:n});assert.equal(c.remaining,5);
  c.update(4.99,{stage:7,transitionComplete:true,network:n});assert.equal(n.state,'DISCONNECTED');
  c.update(.02,{stage:7,transitionComplete:true,network:n});assert.equal(n.state,'DISCOVERING');
  n.tick(15);for(let i=0;i<10;i++)c.update(100,{stage:7,transitionComplete:true,network:n});
  assert.equal(n.state,'EXCHANGING');assert.equal(n.elapsed,15);assert.equal(c.started,true);
});
test('automatic timeline visits all seven stages at five seconds and never loops', () => {
  const t = new PreviewTimeline();t.play();const stages=[t.stage];
  for(let i=0;i<6;i++){t.tick(4.999);assert.equal(t.stage,i+1);t.tick(.0011);stages.push(t.stage);}
  assert.deepEqual(stages,[1,2,3,4,5,6,7]);t.tick(1000);assert.equal(t.stage,7);assert.equal(t.playing,false);
});
test('absent or inaccessible storage never creates a database', async () => {
  let opens=0;const open=()=>{opens++;throw new Error('Must not open');};
  assert.equal((await readDashboardSnapshot({open})).status,'unavailable');
  assert.equal((await readDashboardSnapshot({open,databases:async()=>[]})).status,'empty');
  assert.equal((await readDashboardSnapshot({open,databases:async()=>{throw new Error('Denied');}})).status,'unavailable');
  assert.equal(opens,0);
});
test('snapshot hydration uses only readonly transactions and closes storage', async () => {
  const records={mindling:[{id:'primary',name:'Saved'}],neurons:[{id:'n'}],synapses:[],memories:[{id:'m',content:'Kept'}],pathways:[],life:[{id:'primary',energy:{remaining:3}}]};
  const names=Object.keys(records);names.contains=name=>names.includes(name);let closed=0;
  const db={objectStoreNames:names,close(){closed++;},transaction(stores,mode){
    assert.equal(mode,'readonly');const tx={objectStore(name){return {getAll(){const r={};queueMicrotask(()=>{r.result=structuredClone(records[name]);r.onsuccess();});return r;}};}};
    setTimeout(()=>tx.oncomplete(),0);return tx;
  }};
  const storage={databases:async()=>[{name:'mindling-db'}],open(){const r={};queueMicrotask(()=>{r.result=db;r.onsuccess();});return r;}};
  const result=await readDashboardSnapshot(storage);assert.equal(result.status,'saved');assert.equal(result.life.energy.remaining,3);assert.equal(result.state.memories[0].content,'Kept');assert.equal(closed,1);
  result.state.memories[0].content='Detached';assert.equal(records.memories[0].content,'Kept');
});
