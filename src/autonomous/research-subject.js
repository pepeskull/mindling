import {understandInput} from '../learning/input-understanding.js';
// Existing originalText/topic/scope fields are the contract. A display title or
// an old manually approved broad category must never become the search subject.
export function researchSubject(task){
  let topic=task.topic||'';
  if(task.originalText){
    try{topic=understandInput(task.originalText,task.mode==='DEEP'?'DEEP_TRAINING':task.mode==='TALK_RESEARCH'?'TALK':'TEACH').topic;}catch{return null;}
  }
  return [topic,task.scope?.detail].filter(Boolean).join(' — ').trim()||null;
}
export function subjectMatches(task,topic){return typeof topic==='string'&&topic===researchSubject(task);}
export const SUBJECT_INSTRUCTIONS='The request topic is the immutable user subject plus any selected narrowing scope, not a knowledge-area label. Interpret spelling variations and synonyms within this subject using the current planning call. Do not replace a specific subject with its parent category. Ask a clarification only for material ambiguity; use two to four context-specific clickable options that narrow the original subject. Never request free text or ask the user to repeat an identifiable subject. If no safe choices exist, return sourceCategory=unsupported and clarification=null. A clarification does not authorize broadening or dropping a geographic, competition, temporal or other constraint.';
