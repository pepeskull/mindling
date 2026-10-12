import { advancePreviewLife } from './life.js';
import { neuralSeedRecords } from '../../brain/neural-seed-state.js';
import { STAGES } from '../evolution-model.js';
export const HOUR = 3600000, DAY = 24 * HOUR;
export const RULES = Object.freeze([ [1,100,2], [2,300,4], [4,700,8], [7,1400,12], [10,2400,16], [14,3800,20], [0,0,0] ].map(([days,xp,concepts]) => Object.freeze({days,xp,concepts})));
export const XP = Object.freeze({ concept:50, understanding:75, correction:60, daily:500, cooldown:60000 });
export class VirtualClock {
  constructor(now) { if (!Number.isSafeInteger(now) || now < 0) throw Error('Invalid virtual time'); this.now=now; }
  advance(hours) { if (![1,12,24,168].includes(hours)) throw Error('Unsupported time step'); this.now+=hours*HOUR; return this.now; }
}
export function createSandbox(now=Date.UTC(2026,0,1), playerId=crypto.randomUUID()) {
  return { version:1, revision:0, now, origin:now, clockResets:0, player:{id:playerId, wallet:{mode:'SIMULATED',balance:'1000000000', receipts:[]}}, tombstones:[], mind:null };
}
export function newMindling(state,{name='Test Mindling',pathway='Researcher',id=crypto.randomUUID(),confirmed=false}={}) {
  if (!confirmed) throw Error('Confirm creation of a new test Mindling');
  if (state.tombstones.some(t=>t.id===id) || state.mind?.id===id) throw Error('Identity cannot be reused');
  if (!['Researcher','Developer','Social'].includes(pathway) || !name.trim() || name.length>40) throw Error('Invalid identity');
  const next=structuredClone(state), seed=neuralSeedRecords();
  if(next.mind && !next.tombstones.some(t=>t.id===next.mind.id)) next.tombstones.push({id:next.mind.id,at:next.now,reason:'REPLACED'});
  next.mind={id,name:name.trim(),pathways:[pathway],createdAt:next.now,stage:1,enteredAt:next.now,stageXP:0,lifetimeXP:0,milestones:[],history:[],processed:[],lastLearning:null,
    nodes:seed.neurons,synapses:seed.synapses,memories:[],areas:[],life:{attributes:{health:100,nutrition:100,rest:100,wellbeing:100},lastAt:next.now,lifeState:'ALIVE',deathAt:null,strain:0,care:{}},energy:{day:Math.floor(next.now/DAY),remaining:10},stageHistory:[]};
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
export const normalize = value => String(value).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function cosine(a,b) { if(a.length!==b.length)return -1;let dot=0,x=0,y=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];x+=a[i]**2;y+=b[i]**2;}return dot/Math.sqrt(x*y); }
export function validateAssessment(a) {
  const keys=['meaningful','duplicate','quality','concept','memory','area','kind','embedding'];
  if(!a || Object.keys(a).sort().join()!==keys.sort().join() || typeof a.meaningful!=='boolean' || typeof a.duplicate!=='boolean' || !Number.isFinite(a.quality) || a.quality<0 || a.quality>1 || !['concept','understanding','correction'].includes(a.kind)) throw Error('Invalid learning assessment');
  for(const key of ['concept','memory','area'])if(typeof a[key]!=='string'||a[key].trim().length<3||a[key].length>(key==='memory'?1000:100))throw Error('Invalid learning text');
  if(!Array.isArray(a.embedding)||a.embedding.length<8||a.embedding.length>768||a.embedding.some(v=>!Number.isFinite(v)||Math.abs(v)>100)||!a.embedding.some(v=>v!==0))throw Error('Invalid semantic vector');
  return a;
}
export function learn(state,{id,text,assessment,source='fixture',mindId=state.mind?.id}) {
  validateAssessment(assessment);
  const m=state.mind,a=assessment,key=normalize(text);
  if(!m||m.id!==mindId||m.life.lifeState!=='ALIVE')throw Error('No living matching test Mindling');
  if(typeof id!=='string'||!id||id.length>100||m.processed.includes(id))throw Error('Learning event already processed or invalid');
  if(typeof text!=='string'||text.length>2000||key.length<20||new Set(key.split(' ')).size<4||!a.meaningful||a.duplicate||a.quality<.75)throw Error('Meaningful new learning is required');
  if(m.lastLearning!==null && state.now-m.lastLearning<XP.cooldown)throw Error('Learning cooldown: advance virtual time');
  if(m.memories.some(v=>v.normalized===key||normalize(v.concept)===normalize(a.concept)||cosine(v.embedding,a.embedding)>=.88))throw Error('Known or semantically duplicate knowledge');
  const day=Math.floor(state.now/DAY),earned=m.history.filter(e=>e.day===day).reduce((n,e)=>n+e.xp,0),award=XP[a.kind];
  if(earned+award>XP.daily)throw Error('Daily XP limit reached');
  const energy=m.energy.day===day?m.energy.remaining:10;if(energy<2)throw Error('Not enough Energy; next virtual day restores free Energy');
  if(m.memories.length>=1000)throw Error('Sandbox memory capacity reached');
  const next=structuredClone(state),n=next.mind;n.energy={day,remaining:energy-2};n.stageXP+=award;n.lifetimeXP+=award;n.lastLearning=next.now;n.processed.push(id);n.milestones.push(a.concept);
  n.history.push({id,day,at:next.now,xp:award,kind:a.kind,source,concept:a.concept});
  // Canonical growth is bounded and independent of the stage's representation count.
  const nodeId=n.nodes.length<64?`learned-${n.nodes.length}`:n.nodes[5+(n.memories.length%59)].id;
  if(n.nodes.length<64)n.nodes.push({id:nodeId,position:[0,0,0],size:.6});
  const edge=n.synapses.find(e=>e.to===nodeId);
  if(edge){edge.strength=Math.min(1,edge.strength+.08);edge.activations++;}else n.synapses.push({id:`origin-${nodeId}`,from:'origin',to:nodeId,strength:.28,activations:1});
  const foundation=n.synapses[n.memories.length%4];foundation.strength=Math.min(1,foundation.strength+.05);foundation.activations++;
  const related=n.memories.filter(v=>cosine(v.embedding,a.embedding)>=.62).map(v=>v.id);
  n.memories.push({id,content:a.memory,concept:a.concept,normalized:key,embedding:[...a.embedding],createdAt:new Date(next.now).toISOString(),strength:.3,activations:1,neuronIds:['origin',foundation.to,nodeId],synapseIds:[foundation.id,`origin-${nodeId}`],relatedMemoryIds:related,source,areaSuggestion:a.area});
  n.areas=[...new Set(n.memories.map(v=>v.areaSuggestion))];
  n.life.attributes.wellbeing=Math.min(100,n.life.attributes.wellbeing+10);
  return next;
}
export function advanceTime(state,hours) {
  const next=structuredClone(state);next.now=new VirtualClock(next.now).advance(hours);
  if(next.mind && next.mind.energy.day!==Math.floor(next.now/DAY))next.mind.energy={day:Math.floor(next.now/DAY),remaining:10};
  return advancePreviewLife(next);
}
// Reset the displayed offset, never rewind physiological time or award/cooldown history.
export function resetClock(state) { const next=structuredClone(state);next.origin=next.now;next.clockResets++;return next; }
export function visualMapping(mind,count) { return Array.from({length:count},(_,i)=>mind.nodes[i%mind.nodes.length].id); }
export function stageName(state) { return STAGES[(state.mind?.stage||1)-1].name; }
