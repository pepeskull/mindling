import { learningContext } from '../preview/sandbox/learning-assessment.js';
import { requestLearningAssessment } from '../preview/sandbox/learning-service.js';
import { learn } from '../preview/sandbox/engine.js';

// Shared Teach/Deep Training flow, promoted from Stage Preview. The caller owns
// its database/clock/journal; this module never opens storage or uses fixtures.
export async function teachMemory(app,{id,text,activity,taskId=null},{guard=()=>{},journal=false}={}){
  if(!['TEACH','DEEP_TRAINING'].includes(activity))throw Error('Learning requires Teach or Deep Training.');
  app.external?.assertWritable();guard();
  const mind=app.state.mind,identity=mind?.id;
  if(app.disposed||!identity||mind.life.lifeState!=='ALIVE')throw Error('A living Mindling is required. No Energy or XP changed.');
  if(typeof id!=='string'||!id||id.length>100||mind.processed.includes(id)||mind.memories.some(memory=>memory.id===id))throw Error('Learning event already processed or invalid. No Energy or XP changed.');
  const submittedContext=JSON.stringify(learningContext(text,mind));
  const assessment=await requestLearningAssessment(text,structuredClone(mind));
  if(app.disposed)throw Error('Learning was closed before completion. No Energy or XP changed.');
  await app.change(state=>{
    app.external?.assertWritable();guard();
    if(app.disposed||state.mind?.id!==identity)throw Error('Mindling identity changed. Submit again. No Energy or XP changed.');
    if(JSON.stringify(learningContext(text,state.mind))!==submittedContext)throw Error('Relevant memories changed. Submit again. No Energy or XP changed.');
    const next=learn(state,{id,text,mindId:identity,activity,assessment});
    const previous=taskId&&next.mind.learningTasks?.find(task=>task.id===taskId);
    if(previous&&previous.code==='CLARIFICATION'){
      previous.status='CANCELLED';previous.code='CLARIFIED_AS_FACT';previous.message='Resolved through direct factual teaching; no research was performed.';previous.updatedAt=Math.max(previous.updatedAt,Date.now());
    }
    return next;
  },journal?{journal:{id,type:activity}}:{});
  const event=app.state.mind.history.find(item=>item.id===id);
  const messages={VERIFY_BEFORE_STORAGE:'This claim needs verification before storage.',REJECT_UNSAFE_INSTRUCTION:'This instruction cannot be stored.',ASK_FOR_CLARIFICATION:'Please clarify the subject and what you want remembered.',NO_MEMORY_CHANGE:'No memory change was needed.',FLAG_CONTRADICTION:'Conflicting claim recorded; existing knowledge was preserved.',UPDATE_EXISTING:'Current preference or goal updated. Previous values were preserved.',BATCH:'Independent statements processed together; existing history was preserved.'};
  const message=event?.kind==='reinforcement'?'Already learned. Memory reinforced.':messages[event?.operation]||'Input learned through the Mindling learning service; the claim remains player-provided and is not fact-checked.';
  const operations=event?.operations||[event?.operation];
  return {event,message,refused:operations.every(operation=>['REJECT_UNSAFE_INSTRUCTION','VERIFY_BEFORE_STORAGE','ASK_FOR_CLARIFICATION'].includes(operation))};
}
