// Synthetic, explicitly authored upstream responses; no inference or live data.
import {atomicStatements} from '../../src/preview/sandbox/atomic-memory.js';
export const TEACH='In my fictional world, the word Veloria means a floating crystal island that appears only during a full moon. Remember this definition.';
export const DEEP='In my fictional world, Veloria is a floating crystal island that appears during a full moon. Its crystals absorb moonlight and release stored energy to keep the island floating. Connect this new information to what you already know about Veloria.';
export const decision=(operation='CREATE_NEW',relatedMemoryId='',categoryId='')=>({version:2,relationship:{CREATE_NEW:'NEW_MEMORY',LINK_TO_EXISTING:'RELATED_MEMORY',REINFORCE_EXISTING:'SAME_MEMORY',NO_MEMORY_CHANGE:'NEW_MEMORY',UPDATE_EXISTING:'UPDATED_MEMORY',FLAG_CONTRADICTION:'CONTRADICTION'}[operation],operation,responseAction:'ACKNOWLEDGE',kind:'claim',certainty:'asserted',concept:'Veloria',category:'fictional worldbuilding',categoryId,topic:'Veloria',relatedMemoryId,confidence:.95});
export function proposed(context){
 const statements=atomicStatements(context.input),first=context.candidates.find(m=>m.content.startsWith('In my fictional world'));
 return {version:3,operations:statements.map((part,statement)=>{
  let d;
  if(/^(Remember|Connect)/.test(part))d={...decision('NO_MEMORY_CHANGE'),concept:'',category:'',topic:'',kind:'intention'};
  else if(statement===0&&first)d=decision('REINFORCE_EXISTING',first.id);
  else if(statement>0&&first){const exact=context.candidates.find(m=>m.content===part);d=decision(exact?'REINFORCE_EXISTING':'LINK_TO_EXISTING',exact?.id||first.id,first.categoryId);}
  else d=decision();return {statement,targetPart:-1,decision:d};
 })};
}
