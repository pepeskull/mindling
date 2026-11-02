import {editableMemoryText,submittedCorrectionText,unchangedCorrection} from './correction-content.js';
import {learningContext} from '../preview/sandbox/learning-assessment.js';
import {requestLearningAssessment} from '../preview/sandbox/learning-service.js';
import {recordMemory} from '../preview/sandbox/memory-records.js';
import {XP} from '../preview/sandbox/engine.js';
import {developmentStatistics} from './knowledge.js';
import {energyAt,spendEnergy} from '../economy/energy.js';
import {LIFE_RULES} from '../life/life-system.js';
import {stimulatePreviewLife} from '../preview/sandbox/life.js';

const noChange=()=>({accepted:true,changed:false,code:'NO_CHANGE',message:'No changes to save. The existing memory and its sources are unchanged.'});
const noChangeError=()=>Object.assign(Error('No changes to save.'),{code:'CORRECTION_NO_CHANGE'});
const current=memory=>memory&&!memory.supersededBy&&memory.intelligence?.current!==false&&memory.kind!=='historical'&&memory.intelligence?.kind!=='historical';
function correctionBudget(state){
  const energy=energyAt(state.mind.energy,state.now),cost=LIFE_RULES.activity.TEACH.energyCost,day=Math.floor(state.now/86400000);
  if(energy.remaining<cost)throw Error('Not enough Energy for a correction.');
  if(state.mind.history.filter(event=>event.day===day).reduce((sum,event)=>sum+event.xp,0)+XP.correction>XP.daily)throw Error('Daily XP limit reached.');
  if(state.mind.memories.length>=1000)throw Error('Memory capacity reached.');
  return {energy,cost,day};
}
function correctionTarget(mind,memoryId,text){
  const original=mind.memories.find(memory=>memory.id===memoryId);if(!original)throw Error('This memory is unavailable.');
  if(current(original))return {memory:original,unchanged:unchangedCorrection(text,original)};
  let memory=original;const seen=new Set();
  while(memory?.supersededBy&&!seen.has(memory.id)){
    seen.add(memory.id);const next=mind.memories.find(value=>value.id===memory.supersededBy&&value.correctsMemoryId===memory.id);if(!next)break;memory=next;
  }
  if(current(memory)&&memory!==original&&unchangedCorrection(submittedCorrectionText(text,original),memory))return {memory,unchanged:true};
  throw Error('This memory has changed. Open its current version before making another correction.');
}
export function belongsToResearchTask(mind,memoryId,taskId){
  let memory=mind.memories.find(value=>value.id===memoryId);const seen=new Set();
  while(memory&&!seen.has(memory.id)){if(memory.research?.taskId===taskId)return true;seen.add(memory.id);memory=mind.memories.find(value=>value.id===memory.correctsMemoryId);}
  return false;
}
export async function correctMemory(app,{memoryId,text},{guard=()=>{},journal=false}={}){
  app.external?.assertWritable();guard();
  const identity=app.state.mind?.id;if(app.disposed||!identity||app.state.mind.life.lifeState!=='ALIVE')throw Error('A living Mindling is required.');
  const initial=correctionTarget(app.state.mind,memoryId,text);
  if(initial.unchanged)return noChange();
  const input=submittedCorrectionText(text,initial.memory);
  if(!input.trim()||input.length>2000)throw Error('Enter a readable correction of at most 2,000 characters.');
  correctionBudget(app.state);
  const snapshot=JSON.stringify(initial.memory),context=JSON.stringify(learningContext(input,app.state.mind,{correctionTargetId:memoryId}));
  const decision=await requestLearningAssessment(input,structuredClone(app.state.mind),{correctionTargetId:memoryId});
  if(decision.version!==2||decision.operation!=='CREATE_NEW'||decision.kind==='intention')throw Error('The correction needs a clear, distinct claim. No memory, Energy or XP changed.');
  const id=crypto.randomUUID();
  try{
    await app.change(state=>{
      app.external?.assertWritable();guard();
      if(app.disposed||state.mind?.id!==identity||state.mind.life.lifeState!=='ALIVE')throw Error('The correction identity changed. No memory was changed.');
      const target=correctionTarget(state.mind,memoryId,text);if(target.unchanged)throw noChangeError();
      if(JSON.stringify(target.memory)!==snapshot||JSON.stringify(learningContext(input,state.mind,{correctionTargetId:memoryId}))!==context)throw Error('Relevant knowledge changed. Reopen the memory and submit again.');
      const {energy,cost,day}=correctionBudget(state);
      const next=structuredClone(state),mind=next.mind,original=mind.memories.find(memory=>memory.id===memoryId),at=new Date(state.now).toISOString();
      const replacement=recordMemory(mind,{id,text:input,decision,event:{id,activity:'TEACH'},at,associations:{neuronIds:original.neuronIds||[],synapseIds:original.synapseIds||[]}});
      replacement.correctsMemoryId=memoryId;replacement.provenance={source:'player',method:'explicit-memory-correction'};
      replacement.relatedMemoryIds=[...new Set([...(original.relatedMemoryIds||[]),memoryId])].filter(value=>typeof value==='string'&&value!==id);
      for(const neighbor of mind.memories)if(neighbor.id!==memoryId&&neighbor.id!==id&&replacement.relatedMemoryIds.includes(neighbor.id))neighbor.relatedMemoryIds=[...new Set([...(neighbor.relatedMemoryIds||[]),id])];
      original.supersededBy=id;original.supersededAt=at;original.intelligence={...original.intelligence,current:false};
      if(original.research?.quoteHash)mind.researchExclusions=[...new Set([...(mind.researchExclusions||[]),original.research.quoteHash])].slice(-1000);
      mind.energy=spendEnergy(energy,cost,state.now);stimulatePreviewLife(mind.life,'TEACH',state.now);mind.lastLearning=state.now;
      mind.stageXP+=XP.correction;mind.lifetimeXP+=XP.correction;mind.processed.push(id);
      mind.history.push({id,day,at:state.now,xp:XP.correction,kind:'correction',source:'SERVICE',operation:'CORRECT_MEMORY',memoryIds:[memoryId,id],energySpent:cost});
      mind.nativeKnowledge=developmentStatistics(mind.memories);mind.areas=[...new Set(mind.memories.map(memory=>memory.areaSuggestion).filter(Boolean))];return next;
    },{preserveGameplay:true,...(journal?{journal:{id,type:'TEACH'}}:{})});
  }catch(error){if(error.code==='CORRECTION_NO_CHANGE')return noChange();throw error;}
  return {accepted:true,changed:true,memoryId:id,message:'Correction saved as user-provided knowledge. The original and its source records remain historical.'};
}
