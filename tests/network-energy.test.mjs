import test from 'node:test';
import assert from 'node:assert/strict';
import { PublicNetwork, ExternalVisit, CameraTrip, DEMO_NODES, publicNode } from '../src/network/public-network.js';
import { NetworkSimulation } from '../src/preview/evolution-model.js';
import { createSandbox, newMindling, learn, talk, advanceTime, DAY } from '../src/preview/sandbox/engine.js';
import { carePreview } from '../src/preview/sandbox/life.js';
const start=()=>newMindling(createSandbox(),{confirmed:true,id:'energy-test'});
const facts=['Photosynthesis converts sunlight into chemical energy stored in glucose.','Volcanoes release molten rock from deep beneath the crust.','Whales communicate through complex underwater sound patterns.','A compiler translates source code into executable machine instructions.','Bees transfer pollen between flowers while gathering nectar.'];
const event=(i,activity='TEACH')=>({id:`lesson-${i}`,text:facts[i],activity});
test('network enforces stage seven for owners and every peer, including direct starts',()=>{
  const n=new NetworkSimulation();for(let stage=1;stage<7;stage++){n.configure(stage);assert.equal(n.start(),false);n.tick(30);assert.equal(n.state,'DISCONNECTED');}
  n.configure(7,[{...DEMO_NODES[0],stage:6},DEMO_NODES[1]]);n.start();n.tick(30);assert.equal(n.peers[0].link,0);assert.equal(n.peers[1].link,1);
  n.ownerStage=6;n.tick(1);assert.equal(n.state,'DISCONNECTED');
});
test('public data whitelists status and never invents real player relationships',()=>{
  const node=publicNode({...DEMO_NODES[0],wallet:'secret',memories:['private'],life:{health:101,rest:80}});
  assert.equal(node.wallet,undefined);assert.equal(node.memories,undefined);assert.deepEqual(node.life,{rest:80});assert.ok(Object.isFrozen(node));
  const graph=new PublicNetwork([{id:'real',name:'Real',stage:7,connections:[]}]);assert.deepEqual(graph.connections('real'),[]);assert.deepEqual(graph.roots({stage:7}),[]);
  assert.deepEqual(new PublicNetwork().connections('demo:nova').map(n=>n.name),['Echo']);assert.deepEqual(new PublicNetwork().connections('demo:atlas'),[]);
});
test('all peers selectable, nested visits obey their graph, transition lock and missing nodes fail safe',()=>{
  for(const peer of DEMO_NODES){const v=new ExternalVisit();assert.ok(v.enter(peer.id,{owner:{stage:7},connectedIds:[peer.id]}));assert.equal(v.mode,'EXTERNAL_VIEW');assert.throws(()=>v.assertWritable(),/read-only/);assert.equal(v.enter(peer.id,{owner:{stage:7},connectedIds:[peer.id]}),false);v.settled();v.exit();v.assertWritable();}
  const v=new ExternalVisit();assert.equal(v.enter('demo:nova',{owner:{stage:6},connectedIds:['demo:nova']}),false);
  assert.equal(v.enter('demo:nova',{owner:{stage:7},connectedIds:[]}),false);
  v.enter('demo:nova',{owner:{stage:7},connectedIds:['demo:nova']});v.settled();assert.equal(v.enter('demo:atlas',{owner:{stage:7},connectedIds:['demo:atlas']}),false);
  assert.equal(v.enter('demo:echo',{owner:{stage:7},connectedIds:['demo:echo']}),true);v.graph.nodes.delete('demo:echo');assert.equal(v.valid({stage:7}),false);
});
test('camera interpolates, can reverse from interrupted pose and respects reduced motion',()=>{
  const home={focus:[0,0,0],scale:1},remote={focus:[3,1,0],scale:3};const trip=new CameraTrip(home,remote);let pose=trip.tick(.1);assert.ok(pose.scale>1&&pose.scale<3);
  const back=new CameraTrip(pose,home);for(let i=0;i<20;i++)pose=back.tick(.1);assert.deepEqual(pose,home);assert.ok(back.done);
  assert.deepEqual(new CameraTrip(home,remote,{reduced:true}).tick(0),remote);
});
test('five consecutive Teach actions spend ten Energy at the same instant, preserve XP and memories',()=>{
  let s=start();const at=s.now;for(let i=0;i<5;i++)s=learn(s,event(i));assert.equal(s.now,at);assert.equal(s.mind.energy.remaining,0);assert.equal(s.mind.memories.length,5);assert.equal(s.mind.lifetimeXP,250);
  const before=structuredClone(s);assert.throws(()=>talk(s,'We can discuss the meaning of these observations.'),/Energy/);assert.deepEqual(s,before);
  assert.deepEqual(JSON.parse(JSON.stringify(s)).mind.memories,s.mind.memories);
});
test('three Deep Training actions and one Talk require no wait and consume ten Energy',()=>{
  let s=start();for(let i=0;i<3;i++)s=learn(s,event(i,'DEEP_TRAINING'));s=talk(s,'These different ideas offer interesting things to consider.',{id:'talk'});assert.equal(s.mind.energy.remaining,0);assert.equal(s.mind.memories.length,3);assert.equal(s.mind.lifetimeXP,150);
});
test('ten unique consecutive Talk actions and mixed activities preserve exact costs',()=>{
  let s=start();for(let i=0;i<10;i++)s=talk(s,`I am considering an interesting observation with index ${i}.`,{id:`talk-${i}`});assert.equal(s.mind.energy.remaining,0);assert.equal(s.mind.lifetimeXP,0);
  s=start();s=talk(s,'I am ready to explore these interesting ideas.');s=learn(s,event(0));s=learn(s,event(1,'DEEP_TRAINING'));assert.equal(s.mind.energy.remaining,4);
});
test('replays and duplicate XP farming remain rejected; continuous regeneration and care cooldowns remain',()=>{
  let s=learn(start(),event(0));assert.throws(()=>learn(s,event(0)),/processed/);s=learn(s,{...event(0),id:'reinforce'});assert.equal(s.mind.lifetimeXP,50);assert.equal(s.mind.memories.length,1);
  assert.throws(()=>learn(s,{...event(0),id:'again'}),/reinforced/);
  s=talk(s,'Some meaningful observations deserve further discussion.',{id:'talk'});assert.throws(()=>talk(s,'A completely different thought uses the same transaction.',{id:'talk'}),/processed/);
  assert.throws(()=>talk(s,'Some meaningful observations deserve further discussion.'),/repeated/);
  s=advanceTime(s,24);assert.equal(s.mind.energy.remaining,10);assert.equal(s.mind.energy.version,2);
  for(const type of ['NOURISH','REST','CARE']){s=carePreview(s,type);assert.throws(()=>carePreview(s,type),/cooldown/);}
});
