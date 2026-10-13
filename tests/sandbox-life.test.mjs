import test from 'node:test';import assert from 'node:assert/strict';
import {createSandbox,newMindling,advanceTime,talk,evolve,DAY} from '../src/preview/sandbox/engine.js';
import {carePreview,condition,upgradePreviewLife,stimulatePreviewLife} from '../src/preview/sandbox/life.js';
import { formatLifePercentage } from '../src/ui/life-format.js';
const start=()=>newMindling(createSandbox(),{confirmed:true,id:'life-test'});
test('Life 2.0 neglect collapses in 48–96 hours with visible warnings and a zero vital sign',()=>{
  const initial=start(),wallet=structuredClone(initial.player);let s=initial,critical=false;
  while(s.mind.life.lifeState==='ALIVE'){s=advanceTime(s,1);critical ||= condition(s.mind.life)==='CRITICAL';}
  const hours=(s.mind.life.deathAt-s.mind.createdAt)/(DAY/24);assert.ok(hours>=48&&hours<=96,hours);assert.ok(critical);
  assert.equal(Math.min(s.mind.life.attributes.health,s.mind.life.attributes.neuralStability),0);
  assert.equal(condition(s.mind.life),'NEURAL COLLAPSE');assert.equal(s.tombstones.length,1);assert.throws(()=>carePreview(s,'CARE'));assert.throws(()=>talk(s,'A meaningful thought about the scientific world.'));assert.throws(()=>evolve(s));
  assert.deepEqual(advanceTime(JSON.parse(JSON.stringify(s)),168).tombstones,s.tombstones);assert.deepEqual(s.player,wallet);
  assert.throws(()=>newMindling(s,{confirmed:true,id:'life-test'}));const next=newMindling(s,{confirmed:true,id:'new-life'});assert.equal(next.mind.life.lifeState,'ALIVE');assert.deepEqual(next.player,wallet);
});
test('Life 2.0 partitions, fractional origins and reloads preserve exact death and tombstones',()=>{
  const initial=start();initial.now+=123456;initial.mind.life.lastAt=initial.now;initial.mind.createdAt=initial.now;let split=initial;
  for(let i=0;i<168;i++)split=advanceTime(JSON.parse(JSON.stringify(split)),1);
  assert.deepEqual(split,advanceTime(initial,168));
});
test('Life 2.0 stability recovers hourly, neither care nor activities instantly restore it',()=>{
  let s=advanceTime(advanceTime(start(),24),12);const old=s.mind.life.attributes.neuralStability;
  for(const type of ['NOURISH','REST','CARE'])s=carePreview(s,type);
  s=talk(s,'I have been thinking about how living systems recover.');
  assert.equal(s.mind.life.attributes.neuralStability,old);assert.throws(()=>carePreview(s,'NOURISH'),/cooldown/);
  assert.throws(()=>talk(s,'Another interesting thought about living systems.'),/cooldown/);
  for(let i=0;i<3;i++){s=advanceTime(advanceTime(s,1),1);s=talk(s,`I have a different meaningful thought about recovery number ${i}.`);}
  const before=s.mind.life.attributes.neuralStability;const next=advanceTime(s,1);assert.ok(next.mind.life.attributes.neuralStability>before);assert.ok(next.mind.life.attributes.neuralStability<100);
});
test('Life 2.0 legacy upgrade preserves death and converts visible stability without reviving',()=>{
  const s=start();delete s.mind.life.version;delete s.mind.life.attributes.neuralStability;s.mind.life.strain=14;
  upgradePreviewLife(s.mind.life);assert.equal(s.mind.life.attributes.neuralStability,50);
  const dead={attributes:{health:100},lifeState:'DECEASED',deathAt:123,strain:28};upgradePreviewLife(dead);assert.equal(dead.attributes.neuralStability,0);assert.equal(dead.deathAt,123);
});
test('Life percentages are centralized whole numbers without losing simulation precision',()=>{
  for(const [input,expected] of [[78.21999999999917,'78%'],[85.47999999999945,'85%'],[89.71500000000076,'90%'],[-1,'0%'],[101,'100%']])assert.equal(formatLifePercentage(input),expected);
  const s=advanceTime(start(),1);assert.notEqual(s.mind.life.attributes.nutrition,Math.round(s.mind.life.attributes.nutrition));
});
test('Life 2.0 Talk pays Energy, prevents repeated input farming, and never awards learning XP',()=>{
  const initial=start(),text='I am thinking about the relationship between care and learning.';
  const s=talk(initial,text);assert.equal(s.mind.energy.remaining,9);assert.equal(s.mind.lifetimeXP,0);assert.equal(s.mind.memories.length,0);assert.equal(initial.mind.energy.remaining,10);
  const later=advanceTime(advanceTime(s,1),1);assert.throws(()=>talk(later,text),/repeated/);
  assert.throws(()=>talk(later,'hello'),/meaningful/);assert.equal(later.mind.energy.remaining,9);
});
