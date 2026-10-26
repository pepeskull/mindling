import { capturedContent } from '../../memory/content-integrity.js';
import { energyAt, spendEnergy } from '../../economy/energy.js';
import { LIFE_RULES } from '../../life/life-system.js';
import { stimulatePreviewLife } from './life.js';
import { developmentStatistics } from '../../learning/knowledge.js';
import { assignCategory } from '../../semantic/memory-intelligence.js';
import { normalize } from '../../learning/text.js';
import { atomicStatements, explicitMutableKind, updatePart, updateInput, mutableValue } from './atomic-memory.js';
import { formationAssociations, recordMemory, decomposeLegacy, reinforceMemory, serviceMetadata } from './memory-records.js';

// All operations run synchronously in the caller's ONE IndexedDB transaction.
// Native production learning never enters this operation-aware service path.
export function applyMemoryDecision(state,event,assessment,{XP}) {
  if(!['TALK','TEACH','DEEP_TRAINING'].includes(event.activity))throw Error('Unsupported learning activity');
  const statements=atomicStatements(event.text);
  const operations=assessment.version===3?assessment.operations:compatibilityOperations(assessment,statements);
  const next=structuredClone(state),mind=next.mind,at=new Date(state.now).toISOString();
  const affected=new Set();let formed=null,updated=false,changed=false,associations=null;
  const results=[];
  for(const item of operations){
    const d=item.decision,text=statements[item.statement],operation=d.operation;
    let target=mind.memories.find(memory=>memory.id===d.relatedMemoryId);
    if(operation==='REINFORCE_EXISTING'){
      reinforceMemory(mind,target,text,at);affected.add(target.id);
    }else if(operation==='CREATE_NEW'||operation==='LINK_TO_EXISTING'){
      // Legacy single-decision compound responses cannot duplicate an existing atomic value.
      const existing=mind.memories.find(memory=>!memory.supersededBy&&memory.intelligence?.current!==false&&normalize(memory.content)===normalize(text));
      if(existing){reinforceMemory(mind,existing,text,at);affected.add(existing.id);results.push('REINFORCE_EXISTING');continue;}
      associations??=formationAssociations(mind);
      const id=formed?`${event.id}:${item.statement}`:event.id;
      const memory=recordMemory(mind,{id,text,decision:d,event,at,associations});
      if(target){memory.relatedMemoryIds.push(target.id);target.relatedMemoryIds=[...new Set([...(target.relatedMemoryIds||[]),memory.id])];}
      formed??=memory;changed=true;affected.add(memory.id);
    }else if(operation==='UPDATE_EXISTING'){
      const selection=updatePart({...target,kind:target.intelligence?.kind||target.kind||'claim'},d.kind,item.targetPart);
      if(!selection)throw Error('Preference or goal target changed. No Energy or XP changed.');
      const content=updateInput(text,d.kind),prior=selection.parts[selection.index],beforeValue=mutableValue(prior),afterValue=mutableValue(content);
      if(normalize(prior)===normalize(content)||(beforeValue&&afterValue&&beforeValue===afterValue)){reinforceMemory(mind,target,content,at);affected.add(target.id);results.push('REINFORCE_EXISTING');continue;}
      if(selection.parts.length>1)target=decomposeLegacy(mind,target,at)[selection.index];
      target.valueHistory=[...(target.valueHistory||[]),{content:target.content,concept:target.concept,category:target.category,categoryId:target.categoryId,topic:target.topic,intelligence:target.intelligence||null,native:target.native||null,analysis:target.analysis||null,source:target.source||null,at:target.updatedAt||target.createdAt,eventId:event.id}];
      Object.assign(target,{content,contentIntegrity:capturedContent(content),normalized:normalize(content),concept:d.concept,normalizedConcept:normalize(d.concept),updatedAt:at,source:'SERVICE',analysis:serviceMetadata(d,event.activity,at),
        intelligence:{kind:d.kind,certainty:d.certainty,current:true,verification:'unverified-player-claim',operation,relationship:d.relationship}});
      assignCategory(mind,target,d);delete target.native;
      changed=true;updated=true;affected.add(target.id);
    }else if(operation==='FLAG_CONTRADICTION'){
      if(!(target.contradictions||[]).some(record=>normalize(record.claim)===normalize(text))&&!state.mind.history.some(record=>record.operations?.includes('FLAG_CONTRADICTION')&&record.memoryIds?.includes(target.id)&&normalize(record.input)===normalize(text))){
        target.contradictions=[...(target.contradictions||[]),{eventId:event.id,claim:text,at,verification:'unverified-player-claim'}].slice(-50);
        changed=true;affected.add(target.id);
      }
    }
    // Verification/clarification/rejection/no-change intentionally save no factual record.
    results.push(operation);
  }
  const siblings=mind.memories.filter(memory=>memory.submissionId===event.id);
  for(const memory of siblings){memory.coSubmittedMemoryIds=siblings.filter(other=>other.id!==memory.id).map(other=>other.id);memory.relatedMemoryIds=[...new Set([...memory.relatedMemoryIds,...memory.coSubmittedMemoryIds])];}
  if(mind.memories.length>1000)throw Error('Sandbox memory capacity reached');
  const cost=changed?LIFE_RULES.activity[event.activity].energyCost:0;
  const energy=energyAt(state.mind.energy,state.now);
  if(energy.remaining<cost)throw Error('Not enough Energy; wait for regeneration');
  const award=event.activity==='TALK'?0:updated?XP.correction:formed?XP.concept:0;
  const day=Math.floor(state.now/86400000),earned=state.mind.history.filter(entry=>entry.day===day).reduce((sum,entry)=>sum+entry.xp,0);
  if(earned+award>XP.daily)throw Error('Daily XP limit reached');
  mind.energy=cost?spendEnergy(energy,cost,state.now):energy;
  if(cost){stimulatePreviewLife(mind.life,event.activity,state.now);mind.lastLearning=state.now;}
  mind.stageXP+=award;mind.lifetimeXP+=award;if(formed&&award)mind.milestones.push(formed.concept);
  mind.processed.push(event.id);
  const operation=results.length===1?results[0]:'BATCH';
  const stored=operations.filter(item=>['CREATE_NEW','LINK_TO_EXISTING','UPDATE_EXISTING','FLAG_CONTRADICTION'].includes(item.decision.operation));
  const history={id:event.id,day,at:state.now,xp:award,kind:updated?'correction':formed?'concept':results.includes('REINFORCE_EXISTING')?'reinforcement':'decision',source:'SERVICE',operation,operations:results,energySpent:cost,memoryIds:[...affected],concept:formed?.concept,responseAction:operations.find(item=>item.decision.responseAction==='CLARIFY')?.decision.responseAction||operations[0].decision.responseAction};
  // Do not retain unrelated no-change/rejected fragments as raw personal provenance.
  if(changed)history.input=stored.length===operations.length?event.text:stored.map(item=>statements[item.statement]).join(' ');
  mind.history.push(history);
  mind.nativeKnowledge=developmentStatistics(mind.memories);
  mind.areas=[...new Set([...(mind.areas||[]),...mind.memories.map(memory=>memory.areaSuggestion).filter(Boolean)])];
  return next;
}
function compatibilityOperations(decision,statements) {
  if(['CREATE_NEW','LINK_TO_EXISTING'].includes(decision.operation))return statements.map((text,statement)=>({statement,targetPart:-1,decision:{...decision,kind:statements.length>1?(explicitMutableKind(text)||'claim'):decision.kind}}));
  // A legacy update with a change-of-mind preamble remains one targeted update.
  if(decision.operation==='UPDATE_EXISTING'){
    const statement=statements.indexOf(updateInput(statements.join(' '),decision.kind));
    if(statement<0)throw Error('Ambiguous update statement. No Energy or XP changed.');
    return [{statement,targetPart:-1,decision}];
  }
  return [{statement:0,targetPart:-1,decision}];
}
