import {decisionSchema,validateDecision} from '../preview/sandbox/memory-decision.js';
import {meaningfulKnowledgeLabels} from './knowledge-labels.js';
export function correctionAssessmentSchema(context){
  return {type:'object',additionalProperties:false,required:['decision','subjectChanged'],properties:{decision:decisionSchema(context),subjectChanged:{type:'boolean'}}};
}
export function validateCorrectionAssessment(value,context){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='decision,subjectChanged'||typeof value.subjectChanged!=='boolean')throw Object.assign(Error('Invalid correction assessment.'),{code:'MEMORY_ASSESSMENT_INVALID',reason:'CORRECTION_ASSESSMENT_INVALID'});
  const decision=validateDecision(value.decision,context);
  // The model must explicitly assess subject continuity. Retaining existing
  // descriptive labels never transfers the original source's evidentiary status.
  if(decision.operation==='CREATE_NEW'&&!value.subjectChanged&&meaningfulKnowledgeLabels(context.correction)){
    const {category,categoryId,topic}=context.correction;
    return validateDecision({...decision,category,categoryId,topic},context);
  }
  return decision;
}
