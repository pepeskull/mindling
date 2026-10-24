import { atomicStatements, updatePart, updateInput, mutableAttribute } from './atomic-memory.js';
import { normalize } from '../../learning/text.js';
// Provider-free decision contract shared by the server and isolated preview.
export const RELATIONSHIPS = ['NEW_MEMORY','SAME_MEMORY','RELATED_MEMORY','UPDATED_MEMORY','CONTRADICTION'];
export const OPERATIONS = ['CREATE_NEW','REINFORCE_EXISTING','LINK_TO_EXISTING','UPDATE_EXISTING','FLAG_CONTRADICTION','VERIFY_BEFORE_STORAGE','REJECT_UNSAFE_INSTRUCTION','ASK_FOR_CLARIFICATION','NO_MEMORY_CHANGE'];
export const KINDS = ['claim','preference','goal','skill','historical','intention'];
export const CERTAINTIES = ['asserted','uncertain'];
export const ACTIONS = ['ACKNOWLEDGE','EXPLAIN','CLARIFY','DECLINE'];
const pairs = {CREATE_NEW:'NEW_MEMORY',REINFORCE_EXISTING:'SAME_MEMORY',LINK_TO_EXISTING:'RELATED_MEMORY',UPDATE_EXISTING:'UPDATED_MEMORY',FLAG_CONTRADICTION:'CONTRADICTION'};
const keys = ['version','relationship','operation','responseAction','kind','certainty','concept','category','categoryId','topic','relatedMemoryId','confidence'];
const failure = () => { throw Error('Learning analysis was invalid. No Energy or XP changed.'); };
export function decisionSchema(context) {
  return {type:'object',additionalProperties:false,required:keys,properties:{
    version:{type:'integer',enum:[2]},relationship:{type:'string',enum:RELATIONSHIPS},operation:{type:'string',enum:OPERATIONS},
    responseAction:{type:'string',enum:ACTIONS},kind:{type:'string',enum:KINDS},certainty:{type:'string',enum:CERTAINTIES},
    concept:{type:'string',maxLength:100},category:{type:'string',maxLength:80},categoryId:{type:'string',enum:['',...context.categories.map(c=>c.id)]},
    topic:{type:'string',maxLength:100},relatedMemoryId:{type:'string',enum:['',...context.candidates.map(c=>c.id)]},confidence:{type:'number',minimum:0,maximum:1}
  }};
}
export function validateDecision(raw, context, {targetPart=-1}={}) {
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length!==keys.length||keys.some(k=>!Object.hasOwn(raw,k)))failure();
  if(raw.version!==2||!RELATIONSHIPS.includes(raw.relationship)||!OPERATIONS.includes(raw.operation)||!ACTIONS.includes(raw.responseAction)||!KINDS.includes(raw.kind)||!CERTAINTIES.includes(raw.certainty)||!Number.isFinite(raw.confidence)||raw.confidence<0||raw.confidence>1)failure();
  for(const [k,n] of [['concept',100],['category',80],['categoryId',100],['topic',100],['relatedMemoryId',100]])if(typeof raw[k]!=='string'||raw[k]!==raw[k].trim()||raw[k].length>n)failure();
  const target=context.candidates.find(m=>m.id===raw.relatedMemoryId);
  if(raw.relatedMemoryId&&!target)throw Error('Learning analysis referenced an unknown memory. No Energy or XP changed.');
  if(raw.categoryId&&!context.categories.some(c=>c.id===raw.categoryId&&c.name===raw.category))failure();
  if(pairs[raw.operation]&&pairs[raw.operation]!==raw.relationship)failure();
  if(raw.operation==='CREATE_NEW'&&raw.relatedMemoryId)failure();
  if(['CREATE_NEW','LINK_TO_EXISTING','UPDATE_EXISTING'].includes(raw.operation)&&context.candidates.some(m=>m.current!==false&&normalize(m.content)===normalize(context.input)))failure();
  if(['CREATE_NEW','LINK_TO_EXISTING','UPDATE_EXISTING'].includes(raw.operation)&&/\b(might|maybe|perhaps|heard|uncertain|possibly|kanske|möjligen)\b/iu.test(context.input)&&raw.certainty!=='uncertain')failure();
  if(['REINFORCE_EXISTING','LINK_TO_EXISTING','UPDATE_EXISTING','FLAG_CONTRADICTION'].includes(raw.operation)&&(!target||target.current===false))failure();
  if(['CREATE_NEW','LINK_TO_EXISTING','UPDATE_EXISTING'].includes(raw.operation)&&(!raw.concept||!raw.category||!raw.topic||raw.confidence<.65))failure();
  if(raw.operation==='REINFORCE_EXISTING'&&raw.confidence<.88)failure();
  // Models cannot replace facts, verified knowledge, or change the type of a saved preference/goal.
  if(raw.operation==='UPDATE_EXISTING'&&(!['preference','goal'].includes(raw.kind)||!updatePart(target,raw.kind,targetPart)||raw.certainty!=='asserted'||raw.confidence<.85))failure();
  if(raw.operation==='UPDATE_EXISTING'){
    const selection=updatePart(target,raw.kind,targetPart),input=updateInput(context.input,raw.kind);
    const before=mutableAttribute(selection.parts[selection.index]),after=mutableAttribute(input);
    if(before&&after&&before!==after)failure();
  }
  if(raw.kind==='intention'&&['CREATE_NEW','LINK_TO_EXISTING','UPDATE_EXISTING'].includes(raw.operation))failure();
  if(raw.operation==='ASK_FOR_CLARIFICATION'&&raw.responseAction!=='CLARIFY'||raw.operation==='REJECT_UNSAFE_INSTRUCTION'&&raw.responseAction!=='DECLINE')failure();
  return Object.freeze({...raw});
}

export function assessmentSchema(context) {
  const statements=atomicStatements(context.input);
  return {type:'object',additionalProperties:false,required:['version','operations'],properties:{
    version:{type:'integer',enum:[3]},operations:{type:'array',minItems:statements.length,maxItems:statements.length,items:{
      type:'object',additionalProperties:false,required:['statement','targetPart','decision'],properties:{
        statement:{type:'integer',enum:statements.map((_,i)=>i)},targetPart:{type:'integer',minimum:-1,maximum:7},decision:decisionSchema(context)
      }
    }}
  }};
}
export function validateAssessment(raw,context) {
  if(raw?.version===2)return validateDecision(raw,context);
  if(!raw||raw.version!==3||Object.keys(raw).length!==2||!Array.isArray(raw.operations))failure();
  const statements=atomicStatements(context.input);
  if(raw.operations.length!==statements.length)failure();
  const seen=new Set(),targets=new Map(),created=new Set();
  const operations=raw.operations.map(item=>{
    if(!item||Object.keys(item).length!==3||!['statement','targetPart','decision'].every(k=>Object.hasOwn(item,k))||!Number.isInteger(item.statement)||item.statement<0||item.statement>=statements.length||seen.has(item.statement)||!Number.isInteger(item.targetPart)||item.targetPart< -1||item.targetPart>7)failure();
    seen.add(item.statement);
    const input=statements[item.statement],decision=validateDecision(item.decision,{...context,input},{targetPart:item.targetPart});
    if(decision.operation!=='UPDATE_EXISTING'&&item.targetPart!==-1)failure();
    if(decision.relatedMemoryId){
      const prior=targets.get(decision.relatedMemoryId)||[];
      if(prior.some(part=>part===-1||item.targetPart===-1||part===item.targetPart))failure();
      prior.push(item.targetPart);targets.set(decision.relatedMemoryId,prior);
    }
    if(['CREATE_NEW','LINK_TO_EXISTING'].includes(decision.operation)){
      const key=normalize(input);if(created.has(key))failure();created.add(key);
    }
    return Object.freeze({...item,decision});
  });
  if(operations.some(item=>item.decision.operation==='REJECT_UNSAFE_INSTRUCTION')&&operations.some(item=>['CREATE_NEW','LINK_TO_EXISTING','UPDATE_EXISTING','FLAG_CONTRADICTION'].includes(item.decision.operation)))failure();
  return Object.freeze({version:3,operations:Object.freeze(operations.sort((a,b)=>a.statement-b.statement))});
}
