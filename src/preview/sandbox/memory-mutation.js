import { energyAt, spendEnergy } from '../../economy/energy.js';
import { LIFE_RULES } from '../../life/life-system.js';
import { stimulatePreviewLife } from './life.js';
import { developmentStatistics } from '../../learning/knowledge.js';
import { assignCategory } from '../../semantic/memory-intelligence.js';
import { normalize } from '../../learning/text.js';

const noStorage = new Set(['VERIFY_BEFORE_STORAGE','REJECT_UNSAFE_INSTRUCTION','ASK_FOR_CLARIFICATION','NO_MEMORY_CHANGE','FLAG_CONTRADICTION']);
// Called synchronously by learn inside PreviewStore.change's one readwrite transaction.
export function applyMemoryDecision(state, event, decision, rules) {
  if(!['TEACH','DEEP_TRAINING'].includes(event.activity))throw Error('Learning requires Teach or Deep Training');
  const {operation,relatedMemoryId}=decision;
  const at=new Date(state.now).toISOString();
  let next;
  if(noStorage.has(operation)) {
    next=structuredClone(state);
    if(operation==='FLAG_CONTRADICTION'){
      const target=next.mind.memories.find(m=>m.id===relatedMemoryId);
      target.contradictions=[...(target.contradictions||[]),{eventId:event.id,claim:event.text,at,verification:'unverified-player-claim'}].slice(-50);
    }
    next.mind.processed.push(event.id);
    next.mind.history.push({id:event.id,day:Math.floor(state.now/86400000),at:state.now,xp:0,kind:'decision',operation,responseAction:decision.responseAction,memoryId:relatedMemoryId});
    return next;
  }
  if(operation==='REINFORCE_EXISTING')return rules.reinforce(state,{...event,memoryId:relatedMemoryId,allowRepeated:true});
  if(operation==='UPDATE_EXISTING') {
    const earned=state.mind.history.filter(e=>e.day===Math.floor(state.now/86400000)).reduce((n,e)=>n+e.xp,0);
    if(earned+60>500)throw Error('Daily XP limit reached');
    const energy=energyAt(state.mind.energy,state.now),cost=LIFE_RULES.activity[event.activity].energyCost;
    if(energy.remaining<cost)throw Error('Not enough Energy; wait for regeneration');
    next=structuredClone(state);
    const m=next.mind,target=m.memories.find(item=>item.id===relatedMemoryId);
    if(normalize(target.content)===normalize(event.text))throw Error('Unchanged memory cannot earn update rewards');
    // Stable identifier, append-only previous values. No schema/store migration required.
    target.valueHistory=[...(target.valueHistory||[]),{content:target.content,concept:target.concept,category:target.category,categoryId:target.categoryId,topic:target.topic,intelligence:target.intelligence||null,native:target.native||null,analysis:target.analysis||null,source:target.source||null,at:target.updatedAt||target.createdAt,eventId:event.id}];
    Object.assign(target,{content:event.text.trim(),normalized:normalize(event.text),concept:decision.concept,normalizedConcept:normalize(decision.concept),updatedAt:at});
    target.intelligence={kind:decision.kind,certainty:decision.certainty,current:true,verification:'unverified-player-claim',operation,relationship:decision.relationship};
    assignCategory(m,target,decision);
    target.source='SERVICE';target.analysis={name:'mindling-learning-service',confidence:decision.confidence,verification:'unverified-player-claim',activity:event.activity,learnedAt:at};
    delete target.native;
    m.energy=spendEnergy(energy,cost,state.now);stimulatePreviewLife(m.life,event.activity,state.now);
    m.stageXP+=60;m.lifetimeXP+=60;m.lastLearning=state.now;m.processed.push(event.id);
    // Updating a known preference/goal does not create a new concept milestone.
    m.history.push({id:event.id,day:Math.floor(state.now/86400000),at:state.now,xp:60,kind:'correction',source:'SERVICE',memoryId:target.id,operation});
    m.nativeKnowledge=developmentStatistics(m.memories);
    return next;
  }
  // Reuse the established formation/growth/XP rules after deterministic validation.
  next=rules.learn(state,{...event,assessment:{meaningful:true,relationship:operation==='LINK_TO_EXISTING'?'related':'new',concept:decision.concept,category:decision.category,categoryId:decision.categoryId,topic:decision.topic,relatedMemoryId,confidence:decision.confidence,evidence:operation==='LINK_TO_EXISTING'?'semantic_match':'none'}});
  const target=next.mind.memories.find(m=>m.id===event.id);
  target.intelligence={kind:decision.kind,certainty:decision.certainty,current:decision.kind!=='historical',verification:'unverified-player-claim',operation,relationship:decision.relationship};
  if(relatedMemoryId){const prior=next.mind.memories.find(m=>m.id===relatedMemoryId);prior.relatedMemoryIds=[...new Set([...(prior.relatedMemoryIds||[]),event.id])];}
  return next;
}
