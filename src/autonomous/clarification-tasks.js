import {tasksFor} from './tasks.js';
import {understandInput,LEARNING_MODES} from '../learning/input-understanding.js';
import {validClarification} from '../learning/clarification-model.js';
export const clarificationActivity=task=>task.mode===LEARNING_MODES.DEEP?'DEEP_TRAINING':task.mode===LEARNING_MODES.TALK_RESEARCH?'TALK':'TEACH';
export function taskClarification(task){
 if(task.status!=='BLOCKED'||!['CLARIFICATION','MODEL_CLARIFICATION'].includes(task.code))return null;
 const model=task.coordinatorClarification??understandInput(task.originalText||task.objective,clarificationActivity(task),{answers:task.interpretationAnswers||{}}).clarification;
 return validClarification(model)&&model.options.length>0&&!model.freeText?model:null;
}
export function pendingClarifications(mind={}){
 const unique=new Map();for(const task of tasksFor(mind))if(taskClarification(task)&&!unique.has(task.id))unique.set(task.id,task);
 return [...unique.values()].sort((a,b)=>a.createdAt-b.createdAt||(a.id<b.id?-1:1));
}
