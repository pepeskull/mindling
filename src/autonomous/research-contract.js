// Shared by the existing inference endpoint and browser. No external tool is
// inferred from model output; source access is a separate configured capability.
export const RESEARCH_CAPABILITY='mindling-planning-v1';
export const INFORMATION_CAPABILITY='mindling-europe-pmc-v1';
export const INFORMATION_PROVIDER='europe-pmc';
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
export const planningSchema={type:'object',additionalProperties:false,required:['plan','clarification','queries','sourceCategory'],properties:{queries:{type:'array',items:{type:'string'},minItems:0,maxItems:2},sourceCategory:{type:'string',enum:['biomedical','unsupported']},plan:{type:'array',items:{type:'string'},minItems:1,maxItems:3},clarification:{anyOf:[{type:'null'},{type:'object',additionalProperties:false,required:['question','options'],properties:{question:{type:'string'},options:{type:'array',items:option,minItems:0,maxItems:4}}}]}}};
export function validatePlanningResult(value){
  if(!object(value)||Object.keys(value).sort().join(',')!=='clarification,plan,queries,sourceCategory'||!Array.isArray(value.plan)||!value.plan.length||value.plan.length>3||!value.plan.every(item=>text(item,160)))fail();
  if(!['biomedical','unsupported'].includes(value.sourceCategory)||!Array.isArray(value.queries)||value.queries.length>2||value.queries.some(query=>!validQuery(query)))fail();
  if(value.sourceCategory==='biomedical'&&value.clarification===null&&!value.queries.length)fail();
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
export function validateDiscoveryContext(value){
  if(!object(value)||Object.keys(value).sort().join(',')!=='queries,request,remainingQueries')fail();validatePlanningContext(value.request);
  if(value.request.freshness||!Array.isArray(value.queries)||!value.queries.length||value.queries.length>2||!value.queries.every(validQuery)||!Number.isSafeInteger(value.remainingQueries)||value.remainingQueries<1||value.remainingQueries>2)fail();return value;
}
export function validateRetrievalContext(value){
  if(!object(value)||Object.keys(value).sort().join(',')!=='request,tickets')fail();validatePlanningContext(value.request);
  if(value.request.freshness||!Array.isArray(value.tickets)||!value.tickets.length||value.tickets.length>3||value.tickets.some(ticket=>typeof ticket!=='string'||!/^\d{1,12}\.\d{13}\.[a-f0-9]{64}\.[a-f0-9]{64}$/.test(ticket)))fail();return value;
}
export function validateDiscovered(value){
  if(!object(value)||value.provider!==INFORMATION_PROVIDER||!Array.isArray(value.candidates)||value.candidates.length>3||!Number.isSafeInteger(value.queries)||value.queries<1||value.queries>2||!Number.isSafeInteger(value.completedQueries)||value.completedQueries<0||value.completedQueries>value.queries||!Number.isSafeInteger(value.bytes)||value.bytes<0||value.bytes>32768||!Array.isArray(value.failures))fail();
  for(const source of value.candidates){validateSourceMetadata(source);if(typeof source.ticket!=='string'||source.ticket.length>200)fail();}return value;
}
function validateSourceMetadata(source){
  if(!object(source)||!/^MED:\d{1,12}$/.test(source.id)||source.provider!==INFORMATION_PROVIDER||source.url!==`https://europepmc.org/article/MED/${source.id.slice(4)}`||source.domain!=='europepmc.org'||!text(source.title,240)||source.type!=='publication-abstract'||!Number.isSafeInteger(source.observedAt)||source.observedAt<0||!(source.publisher===null||text(source.publisher,160))||!(source.publishedAt===null||/^\d{4}-\d{2}-\d{2}$/.test(source.publishedAt)))fail();
}
const claimSchema={type:'object',additionalProperties:false,required:['sourceId','quote','category','topic','reason'],properties:{sourceId:{type:'string'},quote:{type:'string'},category:{type:'string',enum:['Biology','Medicine','Chemistry','Science']},topic:{type:'string'},reason:{type:'string'}}};
export const sourceEvaluationSchema={type:'object',additionalProperties:false,required:['claims','limitations'],properties:{claims:{type:'array',items:claimSchema,maxItems:3},limitations:{type:'array',items:{type:'string'},maxItems:3}}};
export function validateSourceEvaluation(value,sources){
  if(!object(value)||Object.keys(value).sort().join(',')!=='claims,limitations'||!Array.isArray(value.claims)||value.claims.length>3||!Array.isArray(value.limitations)||value.limitations.length>3||!value.limitations.every(item=>text(item,240)))fail();
  for(const claim of value.claims){const source=sources.find(item=>item.id===claim?.sourceId);if(!object(claim)||Object.keys(claim).sort().join(',')!=='category,quote,reason,sourceId,topic'||!source||!text(claim.quote,700)||claim.quote.length<40||!source.text.includes(claim.quote)||!['Biology','Medicine','Chemistry','Science'].includes(claim.category)||!text(claim.topic,100)||!text(claim.reason,240))fail();}return value;
}
export function validateAcquisition(value){
  if(!object(value)||value.provider!==INFORMATION_PROVIDER||!Array.isArray(value.sources)||value.sources.length>3||!Number.isSafeInteger(value.requests)||value.requests<1||value.requests>3||!Number.isSafeInteger(value.bytes)||value.bytes<0||value.bytes>147456)fail();
  for(const source of value.sources){validateSourceMetadata(source);if(!text(source.text,6000)||source.status!=='retrieved'||!/^[a-f0-9]{64}$/.test(source.hash))fail();}
  validateSourceEvaluation(value.evaluation,value.sources);return value;
}
