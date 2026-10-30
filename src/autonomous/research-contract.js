import { citedPassages, supportsClaimDate } from './evidence-dates.js';
// Shared by the existing inference endpoint and browser. No external tool is
// inferred from model output; source access is a separate configured capability.
export const INFORMATION_CAPABILITY='mindling-web-search-v1';
export const INFORMATION_PROVIDER='openai-web-search';
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const text=(value,max)=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=max&&!/[\p{Cc}\p{Cf}]/u.test(value);
const fail=()=>{throw Error('Mindling could not validate the research plan. No research knowledge was saved.');};
export function validatePlanningContext(value){
  if(!object(value)||!['freshness,mode,scope,topic','autonomous,freshness,mode,scope,topic'].includes(Object.keys(value).sort().join(','))||value.autonomous!==undefined&&typeof value.autonomous!=='boolean'||!['FOUNDATION','DEEP','TALK_RESEARCH'].includes(value.mode)||typeof value.freshness!=='boolean'||!text(value.topic,120))fail();
  const scope=value.scope;
  if(!object(scope)||Object.keys(scope).sort().join(',')!=='criterion,geography,geographyMode,period,quantity'||![null,'standings','form','history','performance','cost','reliability','features'].includes(scope.criterion)||![null,'week','month','year'].includes(scope.period)||![null,'intersection','comparison'].includes(scope.geographyMode)||!Array.isArray(scope.geography)||scope.geography.length>2||scope.geography.some(region=>!['Europe','Sweden'].includes(region))||!(scope.quantity===null||Number.isSafeInteger(scope.quantity)&&scope.quantity>=1&&scope.quantity<=999))fail();
  return value;
}
const option={type:'object',additionalProperties:false,required:['id','label','value'],properties:{id:{type:'string'},label:{type:'string'},value:{type:'string'}}};
export const planningSchema={type:'object',additionalProperties:false,required:['plan','clarification','queries','sourceCategory'],properties:{queries:{type:'array',items:{type:'string'},minItems:0,maxItems:2},sourceCategory:{type:'string',enum:['web','unsupported']},plan:{type:'array',items:{type:'string'},minItems:1,maxItems:3},clarification:{anyOf:[{type:'null'},{type:'object',additionalProperties:false,required:['question','options'],properties:{question:{type:'string'},options:{type:'array',items:option,minItems:0,maxItems:4}}}]}}};
export function validatePlanningResult(value){
  if(!object(value)||Object.keys(value).sort().join(',')!=='clarification,plan,queries,sourceCategory'||!Array.isArray(value.plan)||!value.plan.length||value.plan.length>3||!value.plan.every(item=>text(item,160)))fail();
  if(!['web','unsupported'].includes(value.sourceCategory)||!Array.isArray(value.queries)||value.queries.length>2||value.queries.some(query=>!validQuery(query)))fail();
  if(value.sourceCategory==='web'&&value.clarification===null&&!value.queries.length)fail();
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

export const validQuery=value=>text(value,120)&&/^[\p{L}\p{N}][\p{L}\p{M}\p{N} '\-]*$/u.test(value)&&!/@|https?:|\b(?:password|secret|wallet|personnummer)\b/iu.test(value);
// No arbitrary URLs, source tickets, private memories or identifiers cross this boundary.
export function validateRetrievalContext(value){
  if(!object(value)||!['queries,remainingCalls,request','plan,queries,remainingCalls,request'].includes(Object.keys(value).sort().join(',')))fail();
  validatePlanningContext(value.request);
  if(value.plan!==undefined&&(!Array.isArray(value.plan)||value.plan.length>3||!value.plan.every(item=>text(item,160))))fail();
  if(!Array.isArray(value.queries)||!value.queries.length||value.queries.length>2||!value.queries.every(validQuery)||!Number.isSafeInteger(value.remainingCalls)||value.remainingCalls<1||value.remainingCalls>2)fail();return value;
}
export function publicSourceURL(value){
  if(!text(value,500))fail();const url=new URL(value),host=url.hostname.toLowerCase();
  if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||!host.includes('.')||host.includes(':')||/^[0-9.]+$/.test(host)||/(?:^|\.)(?:localhost|local|internal|test|invalid|example)$/.test(host)||/[?&](?:key|token|secret|auth|signature|credential)[^=]*=/i.test(url.search))fail();
  url.hash='';return url.href;
}
const claimSchema={type:'object',additionalProperties:false,required:['sourceId','quote','category','topic','reason','validAt'],properties:{sourceId:{type:'string'},quote:{type:'string'},category:{type:'string'},topic:{type:'string'},reason:{type:'string'},validAt:{type:['string','null']}}};
export const sourceEvaluationSchema={type:'object',additionalProperties:false,required:['claims','limitations','nextQuestion'],properties:{claims:{type:'array',items:claimSchema,maxItems:3},limitations:{type:'array',items:{type:'string'},maxItems:3},nextQuestion:{type:['string','null']}}};
export function validateSourceEvaluation(value,sources){
  if(!object(value)||Object.keys(value).sort().join(',')!=='claims,limitations,nextQuestion'||!Array.isArray(value.claims)||value.claims.length>3||!Array.isArray(value.limitations)||value.limitations.length>3||!value.limitations.every(item=>text(item,240))||!(value.nextQuestion===null||validQuery(value.nextQuestion)))fail();
  for(const claim of value.claims){
    const source=sources.find(item=>item.id===claim?.sourceId);
    if(!object(claim)||Object.keys(claim).sort().join(',')!=='category,quote,reason,sourceId,topic,validAt'||!source||!text(claim.quote,700)||claim.quote.length<40||!citedPassages(source).some(passage=>passage.includes(claim.quote))||!text(claim.category,80)||!text(claim.topic,100)||!text(claim.reason,240))fail();
    if(claim.validAt!==null){const at=Date.parse(claim.validAt+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(claim.validAt)||!Number.isFinite(at)||new Date(at).toISOString().slice(0,10)!==claim.validAt||!supportsClaimDate(source,claim.quote,claim.validAt)||at>source.observedAt)fail();}
  }return value;
}
export function validateAcquisition(value){
  if(!object(value)||value.provider!==INFORMATION_PROVIDER||!Array.isArray(value.sources)||value.sources.length>3||!Number.isSafeInteger(value.requests)||value.requests<1||value.requests>2||!Number.isSafeInteger(value.bytes)||value.bytes<0||value.bytes>196608||!text(value.responseId,160))fail();
  for(const source of value.sources){
    if(!object(source)||!/^web:[a-f0-9]{64}$/.test(source.id)||source.provider!==INFORMATION_PROVIDER||publicSourceURL(source.url)!==source.url||source.domain!==new URL(source.url).hostname||!text(source.title,240)||source.type!=='web-search-synthesis'||source.status!=='tool-cited'||!Number.isSafeInteger(source.observedAt)||source.observedAt<0||!text(source.text,2400)||!/^[a-f0-9]{64}$/.test(source.hash)||source.publishedAt!==null)fail();
    if(source.passages!==undefined&&(!Array.isArray(source.passages)||!source.passages.length||source.passages.length>6||!source.passages.every(passage=>text(passage,2400))||source.passages.join(' ')!==source.text))fail();
  }
  validateSourceEvaluation(value.evaluation,value.sources);return value;
}
