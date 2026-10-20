import test from 'node:test';import assert from 'node:assert/strict';
import {createSandbox,newMindling,learn,talk,advanceTime,evolve,eligibility,RULES,XP,DAY,resetClock,visualMapping} from '../src/preview/sandbox/engine.js';
import {creditEnergy} from '../src/economy/energy.js';
export const start=()=>newMindling(createSandbox(),{confirmed:true,id:'test'});
const code=value=>{let number=value,label='';do{label=String.fromCharCode(97+number%26)+label;number=Math.floor(number/26)-1;}while(number>=0);return label;};
export const event=(i)=>{const key=code(i);return {id:`event-${i}`,text:`Concept${key} pattern${key} process${key} context${key}.`};};
test('M4.1 stage durations total 38 days and require time, XP, learning and life',()=>{assert.equal(RULES.reduce((n,r)=>n+r.days,0),38);let s=start();s=advanceTime(s,24);assert.equal(eligibility(s).eligible,false);assert.throws(()=>evolve(s));s=learn(s,event(1));s=advanceTime(advanceTime(s,1),1);s=learn(s,event(2));assert.equal(eligibility(s).eligible,true);s=evolve(s);assert.equal(s.mind.stage,2);assert.equal(s.mind.enteredAt,s.now);assert.equal(s.mind.stageXP,0);assert.equal(s.mind.milestones.length,0);});
test('M4.1 learning is atomic, idempotent, duplicates rejected, growth detached',()=>{const original=start();let s=learn(original,event(1));assert.equal(original.mind.nodes.length,5);assert.equal(s.mind.nodes.length,5);assert.equal(s.mind.memories.length,1);assert.equal(s.mind.energy.remaining,8);assert.throws(()=>learn(s,event(1)));s=advanceTime(s,1);s=learn(s,{...event(1),id:'other'});assert.equal(s.mind.lifetimeXP,50);assert.equal(s.mind.memories.length,1);assert.equal(visualMapping(s.mind,240).length,240);assert.equal(new Set(visualMapping(s.mind,240)).size,5);});
test('M4.1 XP alone, clock reset and purchases cannot bypass time',()=>{let s=start();s.mind.stageXP=100;s.mind.milestones=['a','b'];s.player.wallet.balance='999999999999';assert.equal(eligibility(s).eligible,false);s=advanceTime(s,12);const reset=resetClock(s);assert.equal(reset.now,s.now);assert.equal(reset.mind.enteredAt,s.mind.enteredAt);assert.equal(reset.mind.lifetimeXP,0);assert.throws(()=>evolve(reset));});

test('M4.1 a free cared-for Mindling can reach Agent Mind at exactly 38 virtual days',async()=>{
  const {carePreview}=await import('../src/preview/sandbox/life.js');
  let s=start(),counter=0;const born=s.now;
  const hour=()=>{s=advanceTime(s,1);if((s.now-born)%(DAY/2)===0){for(const type of ['CARE','NOURISH','REST']){try{s=carePreview(s,type);}catch(e){if(e.message!=='No care needed')throw e;}}}};
  for(let stage=1;stage<=6;stage++){
    const entered=s.now,rule=RULES[stage-1];
    while(s.mind.stageXP<rule.xp||s.mind.milestones.length<rule.concepts){
      const day=Math.floor(s.now/DAY),earned=s.mind.history.filter(entry=>entry.day===day).reduce((total,entry)=>total+entry.xp,0);
      if(earned+XP.concept<=XP.daily&&s.mind.energy.remaining>=2&&(s.mind.life.lastActivity===null||s.now-s.mind.life.lastActivity>=DAY/12))s=learn(s,event(++counter));
      hour();
    }
    while(s.now<entered+rule.days*DAY){assert.equal(eligibility(s).eligible,false);if(s.mind.energy.remaining>=1&&s.mind.life.stimulation<85&&s.now-s.mind.life.lastActivity>=DAY/12)s=talk(s,`I am exploring how my growing mind develops at virtual hour ${s.now}.`);hour();}
    assert.equal(eligibility(s).eligible,true);s=evolve(s);
  }
  assert.equal(s.mind.stage,7);assert.equal((s.now-born)/DAY,38);assert.equal(s.player.wallet.receipts.length,0);assert.equal(s.mind.life.lifeState,'ALIVE');assert.ok(s.mind.nodes.length<=64);
});

test('M4.1 spam, repetition, meaningless input and daily XP farming fail atomically',()=>{
  let s=start();s.mind.energy=creditEnergy(s.mind.energy,100,s.now);
  s=learn(s,event(1));assert.throws(()=>learn(s,event(1)),/processed/);
  s=learn(s,{...event(1),id:'reinforce'});assert.equal(s.mind.lifetimeXP,50);assert.equal(s.mind.memories.length,1);
  assert.throws(()=>learn(s,{...event(1),id:'reinforce-again'}),/reinforced/);
  assert.throws(()=>learn(s,{...event(2),text:'hello'}),/readable claim/);
  for(let i=2;i<=10;i++)s=learn(s,event(i));
  const before=JSON.stringify(s);assert.throws(()=>learn(s,event(11)),/Daily XP/);assert.equal(JSON.stringify(s),before);assert.equal(s.mind.lifetimeXP,500);
});
