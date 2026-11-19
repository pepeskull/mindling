import test from 'node:test';
import assert from 'node:assert/strict';
import { researchEnergyReady, reconcileResearchEnergy } from '../src/autonomous/energy-readiness.js';
import { ENERGY_INTERVAL, spendEnergy } from '../src/economy/energy.js';
import { AutonomousLearningEngine } from '../src/autonomous/learning-engine.js';
import { reconcileAreaProfiles, areaProfileCandidates } from '../src/semantic/area-profiles.js';
import { areaPairVisualState, areaPairPlan } from '../src/semantic/area-pair-contract.js';
import { digest } from '../src/autonomous/tasks.js';
import { orbitFrame, ORBIT_GREY } from '../src/integration/orbit-motion.js';
import { StageChip } from '../src/ui/stage-chip.js';

const memory = (id, category, content) => ({id, categoryId: category, category, content, source:'SERVICE',
  contentIntegrity:{version:1,status:'captured',length:content.length},
  analysis:{name:'mindling-learning-service',verification:'unverified-player-claim'}, intelligence:{kind:'claim',current:true}});
const fixture=()=>({id:'profile-fixture',memories:[
  memory('a','Video games','Interactive rendering renders scenes in video games.'),
  memory('b','Game engines','Interactive rendering traces lighting across scenes.'),
  memory('c','Finance','Bonds have maturity dates and coupon payments.')
]});

test('canonical changes update profiles; inverted index suggests pairs without fabricating relations',()=>{
  const mind=fixture(), before=structuredClone(mind.memories);
  reconcileAreaProfiles(mind);
  assert.deepEqual(mind.memories,before);
  assert.equal(mind.semanticProfiles.version,1);
  assert.equal(areaProfileCandidates(mind).length,1);
  assert.equal(mind.semanticAreaRelations,undefined);
  const unchanged=mind.semanticProfiles;
  reconcileAreaProfiles(mind);
  assert.equal(mind.semanticProfiles,unchanged);
  mind.memories[1]={...mind.memories[1],supersededBy:'replacement'};
  reconcileAreaProfiles(mind);
  assert.equal(areaProfileCandidates(mind).length,0);
  assert.equal(mind.semanticProfiles.entries.b,undefined);
});

test('existing brains backfill at most 32 passages per write across reloads',()=>{
  const mind={memories:Array.from({length:40},(_,i)=>memory('m'+i,'Existing','Each canonical passage counts.'))};
  reconcileAreaProfiles(mind);
  assert.equal(mind.semanticProfiles.pending,8);
  const restored=JSON.parse(JSON.stringify(mind));
  reconcileAreaProfiles(restored);
  assert.equal(restored.semanticProfiles.pending,0);
  assert.equal(Object.keys(restored.semanticProfiles.entries).length,40);
});

test('current local receipts distinguish pending, insufficient and unknown without requests',async()=>{
  const mind=fixture();
  reconcileAreaProfiles(mind);
  const [ids]=areaProfileCandidates(mind), plan=areaPairPlan(mind,ids);
  assert.equal(await areaPairVisualState(mind,ids),'pending');
  const record={fingerprint:await digest(JSON.stringify({identity:mind.id,plan})),state:'COMPLETED',outcome:'INSUFFICIENT_EVIDENCE',steps:[]};
  mind.areaPairAttempts=[record];
  assert.equal(await areaPairVisualState(mind,ids),'unavailable');
  record.state='PARTIAL';record.steps=[{state:'OUTCOME_UNKNOWN'}];
  assert.equal(await areaPairVisualState(mind,ids),'paused');
});

test('Energy hysteresis remembers running and paused states across reload and regeneration',()=>{
  const now=Date.now(), mind={energy:{version:2,remaining:3,bonus:0,capacity:10,updatedAt:now}};
  reconcileResearchEnergy(mind,now);
  for(const remaining of [2,1,0]){
    mind.energy=spendEnergy(mind.energy,1,now);
    assert.equal(mind.energy.remaining,remaining);
    reconcileResearchEnergy(mind,now);
    assert.equal(researchEnergyReady(mind,now),remaining>0);
  }
  const restored=JSON.parse(JSON.stringify(mind));
  for(const points of [0,1,2,3])assert.equal(researchEnergyReady(restored,now+points*ENERGY_INTERVAL),points>2);
  reconcileResearchEnergy(restored,now+3*ENERGY_INTERVAL);
  assert.equal(researchEnergyReady(restored,now+2*ENERGY_INTERVAL),true);
});

test('Research provider stages respect Energy readiness without changing activity costs',()=>{
  const now=Date.now(), mind={researchEnergy:{version:1,ready:true},energy:{version:2,remaining:1,bonus:0,capacity:10,updatedAt:now}};
  const check=AutonomousLearningEngine.prototype.assertResearchEnergy;
  check(mind);
  assert.equal(mind.energy.remaining,1);
  mind.energy=spendEnergy(mind.energy,1,now);
  reconcileResearchEnergy(mind,now);
  assert.throws(()=>check(mind),/ENERGY_LOW/);
  mind.energy.remaining=2;
  assert.throws(()=>check(mind),/ENERGY_LOW/);
  mind.energy.remaining=3;
  check(mind);
});
test('all Orbit streams run independently and only the selected source gains color',()=>{
  const paths=Array.from({length:11},(_,i)=>({startX:20,startY:18*i,endX:150,endY:95,outputX:250,width:190}));
  const idle=orbitFrame(2,paths,-1), selected=orbitFrame(2,paths,3), later=orbitFrame(2.75,paths,3);
  for(const key of ['nodes','digits']){
    assert.equal(new Set(idle[key].map(p=>p.index)).size,11);
    assert(idle[key].every(p=>p.color===ORBIT_GREY));
    assert(selected[key].every(p=>(p.color!==ORBIT_GREY)===(p.index===3)));
    assert.deepEqual(idle[key],selected[key].map(p=>({...p,color:ORBIT_GREY})));
    assert.notDeepEqual(selected[key].map(p=>p.x),later[key].map(p=>p.x));
  }
  assert(selected.digits.every(p=>['0','1'].includes(p.digit)&&p.opacity>=0&&p.opacity<1&&p.x>=250));
});

test('life stage label follows the hydrated name without restarting the learning phase',()=>{
  const old=globalThis.document;globalThis.document=Object.assign(new EventTarget(),{hidden:false});
  const node={textContent:'Neural Seed',classList:{toggle(){},remove(){}}};
  const chip=new StageChip(node);
  try{
    chip.setStage('Neural Seed');
    chip.elapsed=31000;
    chip.setName('Mira');
    assert.equal(node.textContent,'Mira is learning.');
    chip.setName('Orion');
    assert.equal(node.textContent,'Orion is learning.');
  }finally{chip.destroy();globalThis.document=old;}
});

test('Talk sends the saved name as literal identity data to the configured model',async()=>{
  const {createRequire}=await import('node:module');
  const {EventEmitter}=await import('node:events');
  const {trainingContext}=await import('../src/training/retrieval.js');
  const {handler}=createRequire(import.meta.url)('../src/server/mindling-reasoning.cjs');
  const {requestTalkReasoning}=await import('../src/cognition/reasoning-client.js');
  const old=globalThis.fetch, key=process.env.SERVICE_API, model=process.env.SERVICE_MODEL;
  process.env.SERVICE_API='mock-service-key';process.env.SERVICE_MODEL='test-completion';
  let system;
  try{
    globalThis.fetch=async(url,options)=>{
      if(url.startsWith('/api/')){
        const req=Object.assign(new EventEmitter(),{method:'POST',body:JSON.parse(options.body),headers:{host:'localhost','x-forwarded-for':'identity-test'}});
        const res=Object.assign(new EventEmitter(),{status(code){this.code=code;return this;},json(data){this.body=data;this.writableEnded=true;return this;}});
        await handler(req,res);
        return Response.json(res.body,{status:res.code});
      }
      if(url.includes('/models/'))return Response.json({id:'test-completion'});
      system=JSON.parse(options.body).messages[0].content;
      return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({
        answer:'I’m Mira.',explanation:'Identity from the session.',facts:[],inferences:[],memoryIds:[],
        uncertainty:'high',insufficientInformation:true,missingInformation:['No relevant claim.']
      })}}]});
    };
    const context={...trainingContext('How does interactive rendering work?',fixture()),agentName:'Mira'};
    const answer=await requestTalkReasoning({id:'1'.repeat(64),context,signal:new AbortController().signal});
    assert.match(system,/Your display name is the literal JSON string "Mira"/);
    assert.equal(answer.reasoning.answer,'I’m Mira.');
  }finally{
    globalThis.fetch=old;
    for(const [k,v] of [['SERVICE_API',key],['SERVICE_MODEL',model]])if(v===undefined)delete process.env[k];else process.env[k]=v;
  }
});

test('automatic area assessment runs from indexed candidates and reuses the result after reload',async()=>{
  const {defaultPermissions,assertResearchGrant}=await import('../src/autonomous/research-permissions.js');
  const originalFetch=globalThis.fetch, documentDescriptor=Object.getOwnPropertyDescriptor(globalThis,'document');
  Object.defineProperty(globalThis,'document',{value:{hidden:false},configurable:true});
  const mind={...fixture(),life:{lifeState:'ALIVE'},energy:{remaining:3},learningTasks:[],autonomousLearning:{nextAt:Date.now()+60000}};
  reconcileAreaProfiles(mind);
  const permissions={...defaultPermissions(mind.id),enabled:true};
  const app={state:{mind},store:{researchPermissions:async()=>permissions},
    async change(reducer,{researchGrant}={}){assertResearchGrant(researchGrant,[permissions]);this.state=reducer(structuredClone(this.state));}};
  const engine={app,loadPermissions:async()=>permissions,schedule(){},recoverSemantic(){}};
  let calls=0;
  try{
    globalThis.fetch=async(url,options)=>{
      calls++;
      const {id,mode}=JSON.parse(options.body);
      assert.equal(mode,'area-pair');
      return Response.json({service:'mindling-reasoning-service',id,result:{
        decision:'OVERLAPS',parent:'NONE',support:'supported',scopePreserved:true,
        reason:'Both passages discuss rendering scenes.',
        citations:['A','B'].map(area=>({area,memory:0,first:0,last:0}))
      }});
    };
    await AutonomousLearningEngine.prototype.tick.call(engine);
    assert.equal(calls,1);
    assert.equal(app.state.mind.semanticAreaRelations.records[0].type,'overlaps');
    app.state=JSON.parse(JSON.stringify(app.state));
    await AutonomousLearningEngine.prototype.tick.call({...engine,nextAreaAssessment:0});
    assert.equal(calls,1);
  }finally{
    globalThis.fetch=originalFetch;
    if(documentDescriptor)Object.defineProperty(globalThis,'document',documentDescriptor);
    else delete globalThis.document;
  }
});
