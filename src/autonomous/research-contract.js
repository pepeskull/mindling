// Shared by the existing inference endpoint and browser. No external tool is
// inferred from model output; the current integration exposes planning only.
export const RESEARCH_CAPABILITY='mindling-planning-v1';
export const RESEARCH_TOOLS=Object.freeze({planning:true,search:false,retrieval:false});
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const text=(value,max)=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=max&&!/[\p{Cc}\p{Cf}]/u.test(value);
const fail=()=>{throw Error('Mindling could not validate the research plan. No research knowledge was saved.');};
export function validatePlanningContext(value){
  if(!object(value)||Object.keys(value).sort().join(',')!=='freshness,mode,scope,topic'||!['FOUNDATION','DEEP','TALK_RESEARCH'].includes(value.mode)||typeof value.freshness!=='boolean'||!text(value.topic,120))fail();
  const scope=value.scope;
  if(!object(scope)||Object.keys(scope).sort().join(',')!=='criterion,geography,geographyMode,period,quantity'||![null,'standings','form','history','performance','cost','reliability','features'].includes(scope.criterion)||![null,'week','month','year'].includes(scope.period)||![null,'intersection','comparison'].includes(scope.geographyMode)||!Array.isArray(scope.geography)||scope.geography.length>2||scope.geography.some(region=>!['Europe','Sweden'].includes(region))||!(scope.quantity===null||Number.isSafeInteger(scope.quantity)&&scope.quantity>=1&&scope.quantity<=999))fail();
  return value;
}
const option={type:'object',additionalProperties:false,required:['id','label','value'],properties:{id:{type:'string'},label:{type:'string'},value:{type:'string'}}};
export const planningSchema={type:'object',additionalProperties:false,required:['plan','clarification'],properties:{plan:{type:'array',items:{type:'string'},minItems:1,maxItems:3},clarification:{anyOf:[{type:'null'},{type:'object',additionalProperties:false,required:['question','options'],properties:{question:{type:'string'},options:{type:'array',items:option,minItems:0,maxItems:4}}}]}}};
export function validatePlanningResult(value){
  if(!object(value)||Object.keys(value).sort().join(',')!=='clarification,plan'||!Array.isArray(value.plan)||!value.plan.length||value.plan.length>3||!value.plan.every(item=>text(item,160)))fail();
  const question=value.clarification;
  if(question!==null&&(!object(question)||Object.keys(question).sort().join(',')!=='options,question'||!text(question.question,400)||!Array.isArray(question.options)||question.options.length>4||new Set(question.options.map(item=>item?.id)).size!==question.options.length||question.options.some(item=>!object(item)||Object.keys(item).sort().join(',')!=='id,label,value'||!text(item.label,80)||!text(item.value,160)||!/^[a-z][a-z_-]{0,31}$/.test(item.id))))fail();
  return value;
}
// Conservative public-topic screening, never a claim of complete PII detection.
export function publicResearchTopic(task,reviewed=null){
  const identifier=/@|https?:|\b[A-Za-z0-9+/_=-]{32,}\b|\b(?:[0-9]{6,}|password|secret|wallet|address|phone|personnummer|lösenord|plånbok|adress|telefon)\b/iu;
  const personal=/\b(?:my|mine|our|mitt|min|mina|vår|jag|patient|diagnosis|medical record|diagnos|journal|legal case|salary|lön)\b/iu;
  if(reviewed!==null){if(!text(reviewed,120)||identifier.test(reviewed)||personal.test(reviewed))throw Error('Use a short public topic without personal identifiers or private details.');return reviewed;}
  const subject=[task.topic,task.scope?.detail].filter(Boolean).join(' ').trim();
  if(identifier.test(task.objective)||personal.test(task.objective)||/(?:^|\s)\p{Lu}[\p{Ll}\p{M}]{2,}\s+\p{Lu}[\p{Ll}\p{M}]{2,}(?:\s|$|[,.!?])/u.test(subject)||subject.length>120)return null;
  return text(subject,120)?subject:null;
}
