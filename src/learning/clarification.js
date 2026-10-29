import { understandInput } from './input-understanding.js';
import { validClarification } from './clarification-model.js';
const managers=new WeakMap();
const stateFor=app=>{let state=managers.get(app);if(!state){state={pending:null,generation:0,capabilities:new WeakMap()};managers.set(app,state);}return state;};
export function cancelClarification(app,id=null){const state=stateFor(app);if(!id||state.pending?.token===id){state.pending=null;state.generation++;}}
export function cancelTaskClarification(app,taskId){if(stateFor(app).pending?.taskId===taskId)cancelClarification(app);}
export function beginClarification(app,text,activity,requestId,interpretation,{taskId=null,paid=false,answers={}}={}){
  if(!validClarification(interpretation.clarification))throw Error('The clarification could not be validated.');
  const state=stateFor(app),pending={token:crypto.randomUUID(),identity:app.state.mind.id,text,activity,requestId,taskId,paid,answers:{...answers},model:interpretation.clarification,generation:++state.generation,processing:false};state.pending=pending;
  return {accepted:false,needsClarification:true,message:'Clarification needed.',talkResponse:{answer:pending.model.question,clarification:{...pending.model,id:pending.token,activity,requestId},memoryIds:[],uncertainty:'high',insufficientInformation:true,energySpent:0}};
}
export function interpretInteraction(app,text,activity,id,continuation=null){
  const state=stateFor(app);let context=null;
  if(continuation){context=state.capabilities.get(continuation);state.capabilities.delete(continuation);if(!context||state.pending!==context.pending||context.pending.identity!==app.state.mind?.id||context.pending.requestId!==id||context.pending.activity!==activity)throw Error('This clarification is stale. Submit your request again.');}
  else cancelClarification(app);
  const answers=context?.answers||{},interpretation=understandInput(text,activity,{answers});
  const generation=state.generation;
  const guard=()=>{if(app.disposed||state.generation!==generation||context&&state.pending!==context.pending||context&&app.state.mind?.id!==context.pending.identity)throw Error('This interaction was cancelled, superseded or changed identity.');};
  const result=interpretation.clarification?beginClarification(app,text,activity,id,interpretation,{taskId:context?.pending.taskId,paid:context?.pending.paid,answers}):null;
  return {interpretation,result,guard,taskId:context?.pending.taskId||null,paid:context?.pending.paid||false};
}
export async function resumeClarification(app,token,choice,detail=''){
  const state=stateFor(app),pending=state.pending;
  if(!pending||pending.token!==token||pending.identity!==app.state.mind?.id||app.disposed||pending.processing)throw Error('This clarification is no longer available.');
  const answers={...pending.answers};
  if(choice==='text'){
    if(!pending.model.freeText||typeof detail!=='string'||!detail.trim()||detail.length>300)throw Error('Enter a clarification of at most 300 characters.');answers.detail=detail.trim();
  }else{const option=pending.model.options.find(item=>item.id===choice);if(!option)throw Error('Unknown clarification option.');answers[pending.model.field]=pending.model.field==='detail'?option.value:option.id;}
  pending.processing=true;const capability=Object.freeze({});state.capabilities.set(capability,{pending,answers});
  try{
    const result=typeof app.submitInput==='function'?await app.submitInput(pending.text,pending.activity,pending.requestId,{continuation:capability}):await app.action(()=>app.submitLearning({text:pending.text,activity:pending.activity,id:pending.requestId,continuation:capability}));
    if(state.pending===pending&&result?.accepted)state.pending=null;
    return result;
  }finally{pending.processing=false;}
}
