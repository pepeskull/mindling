import { validateAnalysis, validateClassification, indexMemory } from '../../learning/intelligence-index.js';
import { energyAt, spendEnergy } from '../../economy/energy.js';
import { analyzeNative } from '../../learning/native-learning.js';
import { normalize } from '../../learning/text.js';
import { assignCategory } from '../../semantic/memory-intelligence.js';
import { developmentStatistics, retrieveMemories } from '../../learning/knowledge.js';
export { normalize } from '../../learning/text.js';
import { advancePreviewLife, stimulatePreviewLife, upgradePreviewLife } from './life.js';
import { LIFE_RULES } from '../../life/life-system.js';
import { neuralSeedRecords } from '../../brain/neural-seed-state.js';
import { STAGES } from '../evolution-model.js';
export const HOUR = 3600000, DAY = 24 * HOUR;
export const RULES = Object.freeze([ [1,100,2], [2,300,4], [4,700,8], [7,1400,12], [10,2400,16], [14,3800,20], [0,0,0] ].map(([days,xp,concepts]) => Object.freeze({days,xp,concepts})));
export const XP = Object.freeze({ concept:50, understanding:75, correction:60, daily:500 });
export class VirtualClock {
  constructor(now) { if (!Number.isSafeInteger(now) || now < 0) throw Error('Invalid virtual time'); this.now=now; }
  advance(hours) { if (![1,12,24,168].includes(hours)) throw Error('Unsupported time step'); this.now+=hours*HOUR; return this.now; }
}
export function createSandbox(now=Date.UTC(2026,0,1), playerId=crypto.randomUUID()) {
  return { version:1, revision:0, wallAt:Date.now(), now, origin:now, clockResets:0, player:{id:playerId, wallet:{mode:'SIMULATED',balance:'1000000000', receipts:[]}}, tombstones:[], mind:null };
}
export function newMindling(state,{name='Test Mindling',pathway='Researcher',id=crypto.randomUUID(),confirmed=false}={}) {
  if (!confirmed) throw Error('Confirm creation of a new test Mindling');
  if (state.tombstones.some(t=>t.id===id) || state.mind?.id===id) throw Error('Identity cannot be reused');
  if (!['Researcher','Developer','Social'].includes(pathway) || !name.trim() || name.length>40) throw Error('Invalid identity');
  const next=structuredClone(state), seed=neuralSeedRecords();
  if(next.mind && !next.tombstones.some(t=>t.id===next.mind.id)) next.tombstones.push({id:next.mind.id,at:next.now,reason:'REPLACED'});
  next.mind={id,name:name.trim(),pathways:[pathway],createdAt:next.now,stage:1,enteredAt:next.now,stageXP:0,lifetimeXP:0,milestones:[],history:[],processed:[],lastLearning:null,
    nodes:seed.neurons,synapses:seed.synapses,memories:[],areas:[],life:{version:2,attributes:{health:100,nutrition:100,rest:100,wellbeing:100,neuralStability:100},stimulation:100,lastActivity:null,lastAt:next.now,lifeState:'ALIVE',deathAt:null,care:{}},energy:energyAt(null,next.now),activityHistory:[],stageHistory:[]};
  return next;
}
export function eligibility(state) {
  const m=state.mind;if(!m)return {eligible:false,reason:'Create a test Mindling'};
  const rule=RULES[m.stage-1], elapsed=Math.max(0,state.now-m.enteredAt), concepts=m.milestones.length;
  return {eligible:m.stage<7 && m.life.lifeState==='ALIVE' && elapsed>=rule.days*DAY && m.stageXP>=rule.xp && concepts>=rule.concepts,elapsed,required:rule,concepts};
}
export function evolve(state) {
  if(!eligibility(state).eligible)throw Error('Time, XP, learning milestones and a living Mindling are required');
  const next=structuredClone(state),m=next.mind;
  m.stageHistory.push({stage:m.stage,enteredAt:m.enteredAt,leftAt:next.now,xp:m.stageXP,concepts:m.milestones.length});
  m.stage++;m.enteredAt=next.now;m.stageXP=0;m.milestones=[];return next;
}
export function cosine(a,b) { if(!a?.length||!b?.length||a.length!==b.length)return -1;let dot=0,x=0,y=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];x+=a[i]**2;y+=b[i]**2;}return x&&y?dot/Math.sqrt(x*y):-1; }
// Native analysis runs synchronously inside the caller's existing IndexedDB transaction.
export function learn(state,{id,text,mindId=state.mind?.id,activity='TEACH',analysis=null}) {
  const m=state.mind,key=normalize(text);
  if(!m||m.id!==mindId||m.life.lifeState!=='ALIVE'||state.tombstones.some(t=>t.id===m.id))throw Error('No living matching test Mindling');
  if(typeof id!=='string'||!id||id.length>100||(m.processed.includes(id)||m.memories.some(v=>v.id===id)))throw Error('Learning event already processed or invalid');
  if(analysis)validateAnalysis(analysis,text,m);
  const a=analyzeNative(text,m,{allowQuestion:Boolean(analysis)});
  if(analysis&&a.relationship!=='repeated'){
    const classification=validateClassification(analysis.classification,text);
    a.category=classification.domain;a.area=a.category;a.topic=classification.topic;
    a.categoryId=m.categories?.find(c=>normalize(c.name)===normalize(a.category))?.id||'';
  }
  if(a.relationship==='repeated')return reinforce(state,{id,text,memoryId:a.relatedMemoryId,mindId,activity});
  const day=Math.floor(state.now/DAY),earned=m.history.filter(e=>e.day===day).reduce((n,e)=>n+e.xp,0),award=XP[a.kind];
  if(earned+award>XP.daily)throw Error('Daily XP limit reached');
  if(!['TEACH','DEEP_TRAINING'].includes(activity))throw Error('Learning requires Teach or Deep Training');
  const cost=LIFE_RULES.activity[activity].energyCost;
  const energy=energyAt(m.energy,state.now);if(energy.remaining<cost)throw Error('Not enough Energy; wait for regeneration');
  if(m.memories.length>=1000)throw Error('Sandbox memory capacity reached');
  const next=structuredClone(state),n=next.mind;stimulatePreviewLife(n.life,activity,next.now);n.energy=spendEnergy(energy,cost,next.now);n.stageXP+=award;n.lifetimeXP+=award;n.lastLearning=next.now;n.processed.push(id);n.milestones.push(a.concept);
  n.history.push({id,day,at:next.now,xp:award,kind:a.kind,source:'NATIVE',concept:a.concept});
  // Canonical growth is bounded and independent of the stage's representation count.
  const foundation=n.synapses[n.memories.length%4];foundation.strength=Math.min(1,foundation.strength+.05);foundation.activations++;
  let nodeId=foundation.to, synapseId=foundation.id;
  // Learning in Neural Seed strengthens its original five-neuron/four-synapse circuit.
  if(n.stage>1){
    nodeId=n.nodes.length<64?`learned-${n.nodes.length}`:n.nodes[5+(n.memories.length%59)].id;
    if(n.nodes.length<64)n.nodes.push({id:nodeId,position:[0,0,0],size:.6});
    const edge=n.synapses.find(e=>e.to===nodeId);synapseId=edge?.id||`origin-${nodeId}`;
    if(edge){edge.strength=Math.min(1,edge.strength+.08);edge.activations++;}else n.synapses.push({id:synapseId,from:'origin',to:nodeId,strength:.28,activations:1});
  }
  const related=a.relatedMemoryIds.filter(id=>n.memories.some(memory=>memory.id===id&&!memory.supersededBy));
  n.memories.push({id,content:a.memory,concept:a.concept,normalized:key,createdAt:new Date(next.now).toISOString(),strength:.3,activations:1,neuronIds:[...new Set(['origin',foundation.to,nodeId])],synapseIds:[...new Set([foundation.id,synapseId])],relatedMemoryIds:related,source:'NATIVE',areaSuggestion:a.area});
  const memory=n.memories.at(-1);
  assignCategory(n,memory,a);memory.relationship=a.relationship;memory.normalizedConcept=normalize(a.concept);
  memory.native={...a.native,provenance:{...a.native.provenance,activity,learnedAt:memory.createdAt}};
  if(analysis)indexMemory(n,memory,analysis);
  n.nativeKnowledge=developmentStatistics(n.memories);
  n.areas=[...new Set([...(n.areas||[]),...n.memories.map(v=>v.areaSuggestion).filter(Boolean)])];
  return next;
}
// Repetitions spend the existing activity cost, with no XP or milestone reward.
export function reinforce(state,{id,text,memoryId,mindId=state.mind?.id,activity='TEACH'}) {
  const m=state.mind,key=normalize(text);
  if(!m||m.id!==mindId||m.life.lifeState!=='ALIVE'||state.tombstones.some(t=>t.id===m.id))throw Error('No living matching Mindling');
  if(typeof id!=='string'||!id||id.length>100||(m.processed.includes(id)||m.memories.some(v=>v.id===id)))throw Error('Learning event already processed or invalid');
  if(typeof text!=='string'||text.length>2000||!key)throw Error('Invalid learning text');
  const memory=m.memories.find(v=>v.id===memoryId);
  if(!memory||memory.supersededBy)throw Error('This historical memory has been corrected. Teach the current knowledge instead.');
  if((m.activityHistory||[]).some(e=>e.key===key&&state.now-e.at<DAY))throw Error('Already learned. This input was reinforced today.');
  if(!['TEACH','DEEP_TRAINING'].includes(activity))throw Error('Learning requires Teach or Deep Training');
  const day=Math.floor(state.now/DAY),cost=LIFE_RULES.activity[activity].energyCost,energy=energyAt(m.energy,state.now);
  if(energy.remaining<cost)throw Error('Not enough Energy');
  const next=structuredClone(state),n=next.mind,target=n.memories.find(v=>v.id===memoryId);
  stimulatePreviewLife(n.life,activity,next.now);n.energy=spendEnergy(energy,cost,next.now);n.lastLearning=next.now;n.processed.push(id);
  target.strength=Math.min(1,(target.strength||0)+.05);target.activations=(target.activations||0)+1;
  target.reinforcementCount=(target.reinforcementCount||0)+1;target.lastReinforcedAt=new Date(next.now).toISOString();
  target.matchedVariants=[...new Set([...(target.matchedVariants||[]),text])].slice(-5);
  for(const edge of n.synapses.filter(e=>target.synapseIds?.includes(e.id))){edge.strength=Math.min(1,edge.strength+.05);edge.activations++;}
  n.activityHistory=[...(n.activityHistory||[]),{at:next.now,key,type:activity}].slice(-200);
  n.history.push({id,day,at:next.now,xp:0,kind:'reinforcement',memoryId,concept:target.concept});
  n.nativeKnowledge=developmentStatistics(n.memories);
  return next;
}
export function talk(state,text,{id=crypto.randomUUID()}={}) {
  const m=state.mind,key=normalize(text);
  if(!m||m.life.lifeState!=='ALIVE'||state.tombstones.some(t=>t.id===m.id))throw Error('No living matching test Mindling');
  if(typeof id!=='string'||!id||id.length>100||m.processed.includes(id)||m.memories.some(v=>v.id===id))throw Error('Activity event already processed or invalid');
  if(typeof text!=='string'||text.length>2000||key.length<20||new Set(key.split(' ')).size<4)throw Error('Share a meaningful thought of at least four words');
  if((m.activityHistory||[]).some(e=>e.key===key&&state.now-e.at<DAY))throw Error('Share a different thought; repeated input earns no stimulation today');
  const day=Math.floor(state.now/DAY),energy=energyAt(m.energy,state.now);
  if(energy.remaining<1)throw Error('Not enough Energy; wait for regeneration');
  const next=structuredClone(state),n=next.mind;
  stimulatePreviewLife(n.life,'TALK',next.now);n.processed.push(id);n.energy=spendEnergy(energy,1,next.now);
  n.activityHistory=[...(n.activityHistory||[]),{at:next.now,key,type:'TALK'}].slice(-200);
  const recalled=retrieveMemories(text,n.memories);
  n.nativeRecall={at:next.now,memoryIds:recalled.map(item=>item.memory.id),method:'lexical',verification:'unverified-player-claims'};
  return next;
}
export function upgradeSandbox(input) {
  const next=structuredClone(input);if(next.mind){upgradePreviewLife(next.mind.life);next.mind.energy=energyAt(next.mind.energy,next.now);}return next;
}
// Sandbox physiological time advances independently; wall time adds offline elapsed time
// to that virtual clock, and debug time jumps remain confined to this database.
export function advanceSandbox(input,wallNow=Date.now()) {
  if(!Number.isSafeInteger(wallNow)||wallNow<0)throw Error('Invalid sandbox time');
  const next=upgradeSandbox(input),previous=Number.isSafeInteger(input.wallAt)?input.wallAt:wallNow;
  next.now+=Math.max(0,wallNow-previous);next.wallAt=Math.max(previous,wallNow);
  if(next.mind)next.mind.energy=energyAt(next.mind.energy,next.now);
  return advancePreviewLife(next);
}
export function advanceTime(state,hours) {
  const next=structuredClone(state);next.now=new VirtualClock(next.now).advance(hours);
  if(next.mind)next.mind.energy=energyAt(next.mind.energy,next.now);
  return advancePreviewLife(next);
}
// Reset the displayed offset, never rewind physiological time or award/cooldown history.
export function resetClock(state) { const next=structuredClone(state);next.origin=next.now;next.clockResets++;return next; }
export function visualMapping(mind,count) { return Array.from({length:count},(_,i)=>mind.nodes[i%mind.nodes.length].id); }
export function stageName(state) { return STAGES[(state.mind?.stage||1)-1].name; }
