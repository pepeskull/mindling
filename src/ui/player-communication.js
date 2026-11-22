import {editableMemoryText} from '../learning/correction-content.js';
import {taskClarification} from '../autonomous/clarification-tasks.js';

export const UNKNOWN_ANSWER="I don't know that yet.";
export const LEARNING_PAUSED="I couldn't finish learning this time.";
export const RESEARCH_RUNNING="I'm exploring this topic...";

export function processingMessage(activity,name='Mindling'){
  const verb={TALK:'thinking',TEACH:'learning',DEEP_TRAINING:'exploring'}[activity]||'thinking';
  return `${name} is ${verb}...`;
}

export function talkAnswer(reply){
  if(reply?.insufficientInformation&&!reply.memoryIds?.length)return reply.researchPreparationFailed?`${UNKNOWN_ANSWER} I couldn't look into it this time.`:UNKNOWN_ANSWER;
  return reply?.answer||"I couldn't answer that this time.";
}

export function activityResult(activity,result,memories=[]){
  if(!result?.accepted){
    if(result?.reason==='OUT_OF_ENERGY')return 'I need more Energy first.';
    if(result?.reason==='MINDLING_DECEASED')return 'This Mindling can no longer learn.';
    return activity==='TALK'?"I couldn't answer that this time.":"I couldn't learn that this time.";
  }
  if(activity==='TALK')return talkAnswer(result.talkResponse);
  const event=result.learningEvent,operations=event?.operations||[event?.operation];
  const affected=event&&memories.some(memory=>(event.memoryIds||[event.memoryId]).includes(memory.id));
  const created=event&&memories.some(memory=>memory.submissionId===event.id&&(event.memoryIds||[event.id]).includes(memory.id));
  const strengthened=affected&&(event.kind==='reinforcement'||operations.includes('REINFORCE_EXISTING'));
  const updated=affected&&event.kind==='correction'&&operations.includes('UPDATE_EXISTING');
  if(created||strengthened||updated){
    if(activity==='DEEP_TRAINING')return 'Training complete!';
    if(created)return 'New memory learned!';
    return updated?'Memory updated!':'Memory strengthened!';
  }
  if(operations.includes('VERIFY_BEFORE_STORAGE'))return "I couldn't verify that yet.";
  if(operations.includes('ASK_FOR_CLARIFICATION'))return 'Can you tell me a little more?';
  if(operations.includes('REJECT_UNSAFE_INSTRUCTION'))return "I can't remember that.";
  if(affected&&operations.includes('FLAG_CONTRADICTION'))return 'I remember that differently.';
  return activity==='DEEP_TRAINING'?"I couldn't learn anything new this time.":'Nothing new to remember yet.';
}

export function researchPresentation(task,memories=[],{enabled,unanswered=false}={}){
  const known=task.status==='COMPLETED'?memories.filter(memory=>task.knowledgeIds.includes(memory.id)&&!memory.supersededBy&&memory.kind!=='historical'&&memory.intelligence?.kind!=='historical'&&memory.intelligence?.current!==false):[];
  const learned=known.filter(memory=>memory.research?.taskId===task.id).length;
  const unknown=task.researchExecution?.outcomeUnknown===true||task.researchObservation||task.code==='TOOL_LIFECYCLE_INCOMPLETE';
  const active=!unknown&&(['RESEARCHING','EVALUATING','COMMITTING'].includes(task.status)||task.status==='QUEUED'&&task.code==='PLANNING');
  let status='Paused',message=LEARNING_PAUSED;
  if(task.status==='COMPLETED'&&known.length){status='Completed';message=learned?'I learned something new!':'I found more support for something I remember.';}
  else if(task.status==='COMPLETED'){status='Finished';message='There are no saved memories from this topic.';}
  else if(task.status==='CANCELLED'){status='Cancelled';message='I stopped looking into this topic.';}
  else if(active){status='Exploring';message=unanswered?`${UNKNOWN_ANSWER} Let me look into it.`:RESEARCH_RUNNING;}
  else if(!unknown&&['NO_EVIDENCE','INSUFFICIENT_EVIDENCE','NO_MODEL_CANDIDATES','NO_CITED_PASSAGES'].includes(task.code)){status='Finished';message="I couldn't verify anything new yet.";}
  else if(!unknown&&['CLARIFICATION','MODEL_CLARIFICATION','QUERY_REVIEW'].includes(task.code)){status='Waiting for you';message=taskClarification(task)?.question||'Can you tell me a little more?';}
  else if(!unknown&&['PERMISSION_REQUIRED','ACCESS_DISABLED'].includes(task.code)){status='Waiting';message=enabled?'I’m ready to explore this topic.':'Turn on Research if you’d like me to explore this topic.';}
  else if(!unknown&&task.code==='ENERGY_LOW'){status='Waiting';message='I need more Energy before I can continue.';}
  else if(!unknown&&(task.code==='QUEUED'||task.evidenceRefinement?.state==='QUEUED')){status='Waiting';message='I’m ready to continue exploring this topic.';}
  if(unanswered&&status==='Waiting')message=`${UNKNOWN_ANSWER} ${message}`;
  return {status,message,active,learned,known,excerpts:known.map(editableMemoryText)};
}

export function renderResponseContent(panel,{message,excerpts=[]}){
  panel.querySelector('[data-talk-status]').textContent=message;
  const content=panel.querySelector('[data-talk-content]');
  content.replaceChildren();
  for(const excerpt of excerpts){const paragraph=document.createElement('p');paragraph.textContent=excerpt;content.append(paragraph);}
}

export function renderClarificationContent(panel,model,onChoice){
  panel.querySelector('[data-talk-status]').textContent=model.question;
  const content=panel.querySelector('[data-talk-content]');
  content.replaceChildren();
  if(!model.options.length)return;
  const choices=document.createElement('div');choices.className='clarification-choices';choices.setAttribute('role','group');choices.setAttribute('aria-label',model.question);
  for(const option of model.options){
    const button=document.createElement('button');button.type='button';button.textContent=option.label;button.disabled=!onChoice;
    if(onChoice)button.addEventListener('click',()=>onChoice(option.id));
    choices.append(button);
  }
  content.append(choices);
  choices.querySelector('button:not([disabled])')?.focus();
}

// A response is scoped to the interaction that started it and its Mindling.
export function isCurrentInteraction(interaction,id,identity){
  return !!interaction&&interaction.id===id&&interaction.identity===identity;
}
