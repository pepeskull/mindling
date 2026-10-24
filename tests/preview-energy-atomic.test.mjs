import test from 'node:test';
import assert from 'node:assert/strict';
import {createSandbox,newMindling,learn,XP} from '../src/preview/sandbox/engine.js';
import {learningContext} from '../src/preview/sandbox/learning-assessment.js';
import {validateAssessment,assessmentSchema} from '../src/preview/sandbox/memory-decision.js';
import {atomicStatements} from '../src/preview/sandbox/atomic-memory.js';
import {requestLearningAssessment} from '../src/preview/sandbox/learning-service.js';

const ORIGINAL='Jag heter Alex och mitt favoritprogrammeringsspråk är JavaScript.';
const DUPLICATE='Mitt favoritprogrammeringsspråk är JavaScript.';
const CHANGE='Jag har ändrat mig. Mitt favoritprogrammeringsspråk är nu Python istället för JavaScript.';
const LEGACY_ID='313332f9-15d6-44c9-aaae-40974e871ab5';
const CATEGORY='category-234465f8-58ff-4ac6-92d6-ac4d7e595f87';
const fresh=()=>newMindling(createSandbox(),{confirmed:true,id:'energy-atomic-test'});
const decision=(extra={})=>({version:2,relationship:'NEW_MEMORY',operation:'CREATE_NEW',responseAction:'ACKNOWLEDGE',kind:'claim',certainty:'asserted',concept:'Player knowledge',category:'personal profile',categoryId:'',topic:'player knowledge',relatedMemoryId:'',confidence:.99,...extra});
const update=(extra={})=>decision({relationship:'UPDATED_MEMORY',operation:'UPDATE_EXISTING',kind:'preference',concept:'Programming preference',topic:'favorite programming language',relatedMemoryId:LEGACY_ID,...extra});
const duplicate=(extra={})=>decision({relationship:'SAME_MEMORY',operation:'REINFORCE_EXISTING',kind:'preference',relatedMemoryId:LEGACY_ID,...extra});
const batch=(text,decisions)=>({version:3,operations:atomicStatements(text).map((part,statement)=>({statement,targetPart:-1,decision:decisions[statement]}))});
const legacy=(content=ORIGINAL,kind='claim')=>{
  const s=fresh();s.mind.categories=[{id:CATEGORY,name:'personal profile'}];
  s.mind.memories=[{id:LEGACY_ID,content,concept:'Player profile',category:'personal profile',categoryId:CATEGORY,topic:'name and programming preference',createdAt:'2026-01-01T00:00:00.000Z',strength:.3,activations:1,neuronIds:['origin','seed-1'],synapseIds:[s.mind.synapses[0].id],relatedMemoryIds:[],source:'SERVICE',intelligence:{kind,certainty:'asserted',current:true,verification:'unverified-player-claim'}}];return s;
};
const apply=(state,text,assessment,id='submission',activity='TEACH')=>learn(state,{id,text,assessment,activity});

test('real case 1: name and programming preference become linked atoms, charged/rewarded once',()=>{
  const before=fresh(),d=batch(ORIGINAL,[decision(),decision({kind:'preference'})]);
  const next=apply(before,ORIGINAL,d);
  assert.equal(next.mind.memories.length,2);assert.equal(next.mind.energy.remaining,8);assert.equal(next.mind.lifetimeXP,XP.concept);
  assert.equal(next.mind.milestones.length,1);assert.equal(next.mind.history.length,1);assert.equal(next.mind.history[0].input,ORIGINAL);
  assert.deepEqual(next.mind.memories.map(m=>m.content),['Jag heter Alex','mitt favoritprogrammeringsspråk är JavaScript.']);
  assert.deepEqual(next.mind.memories.map(m=>m.intelligence.kind),['claim','preference']);
  assert.equal(next.mind.memories[0].submissionId,next.mind.memories[1].submissionId);assert.ok(next.mind.memories[0].relatedMemoryIds.includes(next.mind.memories[1].id));
  assert.deepEqual(next.mind.memories[0].neuronIds,next.mind.memories[1].neuronIds);
  assert.equal(before.mind.energy.remaining,10);assert.equal(before.mind.memories.length,0);
});
for(const activity of ['TALK','TEACH','DEEP_TRAINING'])test(`real case 2: duplicate in ${activity} costs zero even with no Energy`,()=>{
  const s=legacy();s.mind.energy.remaining=0;
  const n=apply(s,DUPLICATE,duplicate(),'duplicate',activity);
  assert.equal(n.mind.energy.remaining,0);assert.equal(n.mind.lifetimeXP,0);assert.equal(n.mind.memories.length,1);
  assert.equal(n.mind.memories[0].activations,2);assert.equal(n.mind.history.at(-1).energySpent,0);
  assert.equal(n.mind.life.stimulation,s.mind.life.stimulation);
});
test('real case 3: legacy claim compound update preserves Alex, JavaScript history and original ID',()=>{
  const s=legacy(),original=structuredClone(s.mind.memories[0]);
  const n=apply(s,CHANGE,update());
  const parent=n.mind.memories.find(m=>m.id===LEGACY_ID),name=n.mind.memories.find(m=>m.parentMemoryId===LEGACY_ID&&m.intelligence.kind==='claim'),preference=n.mind.memories.find(m=>m.parentMemoryId===LEGACY_ID&&m.intelligence.kind==='preference');
  assert.equal(parent.content,ORIGINAL);assert.equal(parent.intelligence.current,false);assert.equal(parent.strength,original.strength);
  assert.equal(name.content,'Jag heter Alex');assert.equal(name.intelligence.current,true);
  assert.match(preference.content,/nu Python istället för JavaScript/);assert.equal(preference.valueHistory[0].content,'mitt favoritprogrammeringsspråk är JavaScript.');
  assert.deepEqual(preference.neuronIds,original.neuronIds);assert.deepEqual(preference.synapseIds,original.synapseIds);assert.equal(preference.strength,original.strength);assert.equal(preference.activations,original.activations);
  assert.ok(parent.componentMemoryIds.includes(preference.id));assert.equal(n.mind.energy.remaining,8);assert.equal(n.mind.lifetimeXP,XP.correction);
});
test('real case 3 also succeeds as a strictly validated v3 preamble plus targeted operation',()=>{
  const s=legacy(),assessment=batch(CHANGE,[decision({operation:'NO_MEMORY_CHANGE'}),update()]);assessment.operations[1].targetPart=1;
  const n=apply(s,CHANGE,assessment);
  assert.equal(n.mind.memories.length,3);assert.equal(n.mind.energy.remaining,8);assert.equal(n.mind.history.length,1);assert.equal(n.mind.lifetimeXP,60);
});
test('real case 4: finance preference keeps its category, starting strength, activations and cost',()=>{
  const s=fresh();s.mind.categories=[{id:CATEGORY,name:'personal profile'}];
  const d=decision({kind:'preference',concept:'Enjoys finance',categoryId:CATEGORY,topic:'finance interest',confidence:.9});
  const n=apply(s,'Jag tycker om finans',d,'aaad0828-8e0d-4240-b790-ed9d8b827b54');
  const m=n.mind.memories[0];assert.equal(m.id,'aaad0828-8e0d-4240-b790-ed9d8b827b54');assert.equal(m.intelligence.kind,'preference');assert.equal(m.categoryId,CATEGORY);assert.equal(m.strength,.3);assert.equal(m.activations,1);assert.equal(m.neuronIds.length,2);assert.equal(m.synapseIds.length,1);assert.equal(n.mind.energy.remaining,8);
});
for(const [activity,cost,xp] of [['TALK',1,0],['TEACH',2,50],['DEEP_TRAINING',3,50]])test(`${activity} charges exactly ${cost} for committed new learning; XP stays ${xp}`,()=>{
  const n=apply(fresh(),'Jag tycker om finans',decision({kind:'preference'}),'paid',activity);
  assert.equal(n.mind.energy.remaining,10-cost);assert.equal(n.mind.history[0].energySpent,cost);assert.equal(n.mind.lifetimeXP,xp);
});
test('already typed and misclassified atomic preferences retain their stable ID and history',()=>{
  for(const kind of ['claim','preference']){
    const n=apply(legacy(DUPLICATE,kind),CHANGE,update());assert.equal(n.mind.memories.length,1);assert.equal(n.mind.memories[0].id,LEGACY_ID);assert.equal(n.mind.memories[0].valueHistory[0].content,DUPLICATE);assert.equal(n.mind.memories[0].intelligence.kind,'preference');
  }
});
test('later updates address the same component ID without another decomposition or losing history',()=>{
  const first=apply(legacy(),CHANGE,update()),pref=first.mind.memories.find(m=>m.parentMemoryId&&m.intelligence.kind==='preference');
  const n=apply(first,'Mitt favoritprogrammeringsspråk är nu Rust.',update({relatedMemoryId:pref.id}),'later');
  assert.equal(n.mind.memories.length,3);assert.equal(n.mind.memories.find(m=>m.id===pref.id).valueHistory.length,2);assert.equal(n.mind.energy.remaining,6);
});
test('unrelated factual claims, name parts, verified knowledge and different preference attributes cannot be overwritten',()=>{
  for(const [s,d] of [[legacy('JavaScript was created in 1995.'),update()],[legacy(),update()],[legacy(DUPLICATE,'preference'),update()]]){
    if(s.mind.memories[0].content===ORIGINAL){const raw=batch(CHANGE,[decision({operation:'NO_MEMORY_CHANGE'}),d]);raw.operations[1].targetPart=0;assert.throws(()=>apply(s,CHANGE,raw));}
    else if(s.mind.memories[0].content===DUPLICATE){assert.throws(()=>apply(s,'Mitt favoritmat är nu sushi.',d));s.mind.memories[0].verification='verified';assert.throws(()=>apply(s,CHANGE,d));}
    else assert.throws(()=>apply(s,CHANGE,d));
  }
});
test('invalid/invented/conflicting multi-operation references never partially mutate resources or neurons',()=>{
  const s=legacy(),before=structuredClone(s);
  const base=batch(CHANGE,[decision({operation:'NO_MEMORY_CHANGE'}),update()]);
  for(const change of [v=>v.operations[1].decision.relatedMemoryId='invented',v=>v.operations[1].decision.operation='DELETE',v=>v.operations[1].targetPart=7,v=>v.operations[1].statement=0,v=>v.operations.pop(),v=>v.operations[1].decision.confidence=.5]){
    const invalid=structuredClone(base);change(invalid);assert.throws(()=>apply(s,CHANGE,invalid));assert.deepEqual(s,before);
  }
  const conflict=batch('I prefer light interfaces now. I prefer blue interfaces now.',[update(),update()]);
  assert.throws(()=>validateAssessment(conflict,learningContext('I prefer light interfaces now. I prefer blue interfaces now.',s.mind)));
});
test('two independent preference updates on one legacy compound are one transaction and one correction reward',()=>{
  const s=legacy('My favorite programming language is JavaScript and my favorite color is blue.');
  const input='My favorite programming language is now Python. My favorite color is now green.';
  const d=batch(input,[update(),update()]);d.operations[0].targetPart=0;d.operations[1].targetPart=1;
  const n=apply(s,input,d);assert.equal(n.mind.memories.length,3);assert.equal(n.mind.energy.remaining,8);assert.equal(n.mind.lifetimeXP,60);assert.equal(n.mind.history.length,1);
  assert.equal(n.mind.memories.filter(m=>m.parentMemoryId===LEGACY_ID&&m.valueHistory.length===1).length,2);
});
test('free operations remain available at zero; failed chargeable batches preserve all state',()=>{
  const s=legacy();s.mind.energy.remaining=0;const frozen=structuredClone(s);
  for(const operation of ['NO_MEMORY_CHANGE','ASK_FOR_CLARIFICATION','REJECT_UNSAFE_INSTRUCTION','VERIFY_BEFORE_STORAGE']){
    const n=apply(s,'Please remember that other option.',decision({operation,responseAction:operation==='ASK_FOR_CLARIFICATION'?'CLARIFY':operation==='REJECT_UNSAFE_INSTRUCTION'?'DECLINE':'ACKNOWLEDGE'}));assert.equal(n.mind.energy.remaining,0);assert.equal(n.mind.lifetimeXP,0);assert.deepEqual(n.mind.memories,s.mind.memories);
  }
  assert.throws(()=>apply(s,CHANGE,update()),/Energy/);assert.deepEqual(s,frozen);
});
test('duplicates accept repeated submissions but reinforcement is bounded per value, not by cooldown',()=>{
  let s=legacy();s.mind.energy.remaining=0;const startStrength=s.mind.memories[0].strength;
  for(let i=0;i<30;i++)s=apply(s,i<10?DUPLICATE:`Mitt favoritprogrammeringsspråk är JavaScript, variant ${i}.`,duplicate(),`repeat-${i}`);
  assert.equal(s.mind.memories.length,1);assert.equal(s.mind.energy.remaining,0);assert.equal(s.mind.lifetimeXP,0);assert.ok(s.mind.memories[0].strength<=startStrength+.151);assert.equal(s.mind.memories[0].activations,4);assert.equal(s.mind.memories[0].reinforcementVariants.length,3);assert.equal(s.mind.processed.length,30);
});
test('request replay, daily XP limit and insufficient Energy cannot create double rewards or half-decompositions',()=>{
  const s=legacy(),n=apply(s,CHANGE,update());assert.throws(()=>apply(n,CHANGE,update()),/processed/);
  for(const energy of [0,1]){const failed=legacy();failed.mind.energy.remaining=energy;const before=structuredClone(failed);assert.throws(()=>apply(failed,CHANGE,update()),/Energy/);assert.deepEqual(failed,before);}
  const capped=legacy();capped.mind.history=[{day:Math.floor(capped.now/86400000),xp:500}];assert.throws(()=>apply(capped,CHANGE,update()),/XP limit/);
});
test('contradictions charge only for a newly committed meaningful record, never an identical flag twice',()=>{
  const s=legacy('Earth orbits the Sun.');const d=decision({relationship:'CONTRADICTION',operation:'FLAG_CONTRADICTION',relatedMemoryId:LEGACY_ID});
  const first=apply(s,'The Sun orbits Earth.',d,'flag');const second=apply(first,'The Sun orbits Earth.',d,'flag-again');
  assert.equal(first.mind.energy.remaining,8);assert.equal(second.mind.energy.remaining,8);assert.equal(second.mind.memories[0].contradictions.length,1);assert.equal(second.mind.lifetimeXP,0);
});
test('bounded extractive splitting preserves unified information and refuses truncated legacy updates',()=>{
  assert.deepEqual(atomicStatements('Neurons and synapses form a neural network.'),['Neurons and synapses form a neural network.']);
  assert.equal(atomicStatements(ORIGINAL).length,2);
  const s=legacy(DUPLICATE+' '+('Extra information '.repeat(40)));assert.throws(()=>apply(s,CHANGE,update()));
  const schema=assessmentSchema(learningContext(ORIGINAL,fresh().mind));assert.equal(schema.properties.version.enum[0],3);assert.equal(schema.properties.operations.maxItems,2);
});
test('local exact duplicate never calls a provider and remains free in every mode',async()=>{
  for(const activity of ['TALK','TEACH','DEEP_TRAINING']){
    const s=legacy(DUPLICATE,'preference');const d=await requestLearningAssessment(DUPLICATE,s.mind,{fetcher:()=>{throw Error('No paid call allowed');}});assert.equal(apply(s,DUPLICATE,d,'local',activity).mind.energy.remaining,10);
  }
});

test('mocked server validates the complete v3 assessment, including the exact legacy update',async()=>{
  const {createRequire}=await import('node:module');const server=createRequire(import.meta.url)('../src/server/mindling-learning.cjs');
  const originalFetch=globalThis.fetch,originalKey=process.env.SERVICE_API,originalModel=process.env.SERVICE_MODEL;
  const context=learningContext(CHANGE,legacy().mind),valid=batch(CHANGE,[decision({operation:'NO_MEMORY_CHANGE'}),update()]);valid.operations[1].targetPart=1;
  let modelOutput=valid,submitted;
  process.env.SERVICE_API='synthetic-energy-key';process.env.SERVICE_MODEL='synthetic-energy-model';
  globalThis.fetch=async(url,options)=>{
    if(String(url).includes('/models/'))return {ok:true,json:async()=>({id:'synthetic-energy-model'})};
    submitted=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(modelOutput)}}]})};
  };
  const res=()=>({status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}});
  const request=()=>({method:'POST',headers:{'x-forwarded-for':crypto.randomUUID()},body:context});
  try{
    let response=res();await server.handler(request(),response);assert.equal(response.statusCode,200);assert.deepEqual(response.body.assessment,valid);
    const sent=JSON.parse(submitted.messages[1].content);assert.equal(sent.statements.length,2);assert.equal(sent.candidates.find(c=>c.id===LEGACY_ID).parts.length,2);assert.equal(submitted.response_format.json_schema.schema.properties.version.enum[0],3);assert.equal(submitted.model,'synthetic-energy-model');
    modelOutput=structuredClone(valid);modelOutput.operations[1].decision.relatedMemoryId='invented';response=res();await server.handler(request(),response);assert.equal(response.statusCode,502);assert.equal(response.body.error.code,'ANALYSIS_INVALID');
    modelOutput=structuredClone(valid);modelOutput.operations[1].targetPart=0;response=res();await server.handler(request(),response);assert.equal(response.statusCode,502);
    assert.doesNotMatch(JSON.stringify(response.body),/synthetic-energy|invented/);
  }finally{globalThis.fetch=originalFetch;for(const [key,value] of [['SERVICE_API',originalKey],['SERVICE_MODEL',originalModel]])if(value===undefined)delete process.env[key];else process.env[key]=value;server._resetRateLimits();}
});

test('same-value legacy update is free reinforcement without decomposition or correction XP',()=>{
  const s=legacy();s.mind.energy.remaining=0;
  const n=apply(s,'Mitt favoritprogrammeringsspråk är nu JavaScript.',update());
  assert.equal(n.mind.memories.length,1);assert.equal(n.mind.memories[0].content,ORIGINAL);assert.equal(n.mind.energy.remaining,0);assert.equal(n.mind.lifetimeXP,0);
});

test('validated legacy duplicate responses also use the free policy; malformed exact responses cannot mutate',()=>{
  const s=legacy(DUPLICATE,'preference');s.mind.energy.remaining=0;
  const old={meaningful:true,relationship:'repeated',concept:'language preference',category:'personal profile',categoryId:CATEGORY,topic:'programming preference',relatedMemoryId:LEGACY_ID,confidence:.99,evidence:'semantic_match'};
  const n=apply(s,DUPLICATE,old);assert.equal(n.mind.energy.remaining,0);assert.equal(n.mind.memories.length,1);
  const before=structuredClone(s);assert.throws(()=>apply(s,DUPLICATE,{invalid:true}));assert.deepEqual(s,before);
});
test('ignored personal fragments are not retained in successful submission provenance',()=>{
  const input='My name is Alex. My password is synthetic-do-not-retain.';
  const d=batch(input,[decision(),decision({operation:'NO_MEMORY_CHANGE'})]);const n=apply(fresh(),input,d);
  assert.equal(n.mind.memories.length,1);assert.doesNotMatch(JSON.stringify(n),/synthetic-do-not-retain/);
});
test('free duplicate settlement preserves the ordinary twelve-minute Energy regeneration',()=>{
  const s=legacy(DUPLICATE,'preference');s.mind.energy.remaining=0;s.now+=12*60*1000;
  const n=apply(s,DUPLICATE,duplicate());assert.equal(n.mind.energy.remaining,1);assert.equal(n.mind.history.at(-1).energySpent,0);assert.equal(n.mind.lifetimeXP,0);
});
