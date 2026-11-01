import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {sourceEvaluationSchema,sourceEvaluationSchemaFor,validateSourceEvaluation,selectSourceEvaluation,validateAcquisition,validateResearchCheckpoint} from '../src/autonomous/research-contract.js';
import {validateServiceDiagnostic} from '../src/autonomous/service-diagnostics.js';
const require=createRequire(import.meta.url),{handler}=require('../src/server/mindling-reasoning.cjs');
const {quotes,urls,searchPayload,claim,evaluation}=require('./support/source-evaluation-fixtures.cjs');
const sha=text=>createHash('sha256').update(text).digest('hex');
const sources=quotes.map((text,index)=>({id:`web:${sha(urls[index]+'\n'+text)}`,provider:'openai-web-search',url:urls[index],domain:new URL(urls[index]).hostname,title:`Synthetic source ${index+1}`,publisher:null,publishedAt:null,observedAt:Date.now(),type:'web-search-synthesis',status:'tool-cited',text,passages:[text],hash:sha(text)}));
const request={topic:'neural communication',mode:'FOUNDATION',autonomous:true,freshness:false,scope:{criterion:null,geography:[],geographyMode:null,period:null,quantity:null}};
const context={request,queries:['neurons synapses communication'],remainingCalls:2,plan:['Compare actual cited source passages']};
let sequence=0;
async function api({mode='research-acquire',context:input=context,propose=evaluation,upstreamFailure=false}={}){
  const old={fetch:globalThis.fetch,warn:console.warn,api:process.env.SERVICE_API,model:process.env.SERVICE_MODEL,enabled:process.env.MINDLING_WEB_SEARCH};
  process.env.SERVICE_API='synthetic-private-key';process.env.SERVICE_MODEL='opaque-model';process.env.MINDLING_WEB_SEARCH='enabled';
  const calls=[],logs=[];console.warn=line=>logs.push(JSON.parse(line));
  globalThis.fetch=async(url,options)=>{
    calls.push({url,options});if(url.endsWith('/models/opaque-model'))return Response.json({id:'opaque-model'});
    if(url.endsWith('/responses')){assert.equal(JSON.parse(options.body).max_tool_calls,2);return Response.json(searchPayload());}
    assert.equal(url,'https://api.openai.com/v1/chat/completions');
    const body=JSON.parse(options.body),data=JSON.parse(body.messages[1].content);
    assert.equal(body.max_completion_tokens,2600);assert.equal(body.model,'opaque-model');assert.deepEqual(body.response_format.json_schema.schema,sourceEvaluationSchemaFor(data.sources));
    assert.ok(data.sources.every(source=>Number.isSafeInteger(source.observedAt)));
    if(upstreamFailure==='abort')throw new DOMException('PRIVATE interrupted evaluation','AbortError');
    if(upstreamFailure)return Response.json({error:{message:'PRIVATE upstream failure'}},{status:503});
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(propose(data.sources)),refusal:null}}]});
  };
  const req=Object.assign(new EventEmitter(),{method:'POST',headers:{host:'localhost','x-forwarded-for':`source-eval-${++sequence}`},body:{id:sha(String(sequence)),mode,context:input}});
  const res=Object.assign(new EventEmitter(),{status(code){this.code=code;return this;},json(body){this.body=body;this.writableEnded=true;return this;}});
  try{await handler(req,res);return {...res,calls,logs};}finally{
    globalThis.fetch=old.fetch;console.warn=old.warn;
    for(const [key,value] of [['SERVICE_API',old.api],['SERVICE_MODEL',old.model],['MINDLING_WEB_SEARCH',old.enabled]])if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
}
test('bounded output schema and supplied source IDs align with the application evidence contract',()=>{
  const schema=sourceEvaluationSchemaFor(sources),props=schema.properties.claims.items.properties;
  assert.deepEqual(props.sourceId.enum,sources.map(s=>s.id));assert.equal(props.quote.minLength,40);assert.equal(props.quote.maxLength,700);assert.equal(props.reason.maxLength,240);assert.equal(schema.properties.nextQuestion.maxLength,120);
  assert.equal(sourceEvaluationSchema.properties.claims.items.properties.sourceId.enum,undefined,'dynamic IDs leaked into shared schema');
});
test('exact cited claims across two sources remain unchanged and verifiably attributed',async()=>{
  const res=await api();assert.equal(res.code,200);const a=validateAcquisition(res.body.acquisition);
  assert.equal(a.sources.length,2);assert.equal(a.evaluation.claims.length,2);assert.equal(a.requests,1);
  for(const c of a.evaluation.claims){const source=a.sources.find(s=>s.id===c.sourceId);assert.ok(source.passages.includes(c.quote));assert.equal(source.hash,sha(source.text));assert.equal(source.id,`web:${sha(source.url+'\n'+source.text)}`);}
  const d=validateServiceDiagnostic(res.body.execution);assert.equal(d.phase,'SOURCE_EVALUATION');assert.equal(d.upstreamStatus,200);assert.equal(d.completed,1);assert.equal(d.sourceCount,2);assert.equal(d.validation.accepted,2);
});
const invalidCases=[
  ['missing fields',c=>delete c.topic,'CLAIM_FIELDS_INVALID'],
  ['wrong source',c=>c.sourceId='not-a-source PRIVATE','SOURCE_ID_UNKNOWN'],
  ['paraphrase',c=>c.quote='This paraphrase describes neural signaling but was not in the cited passage.','QUOTE_NOT_IN_CITED_PASSAGE'],
  ['quote from another source',c=>c.quote=quotes[1],'QUOTE_NOT_IN_CITED_PASSAGE'],
  ['short quote',c=>c.quote='Neurons communicate','QUOTE_FORMAT_INVALID'],
  ['long quote',c=>c.quote='x'.repeat(701),'QUOTE_FORMAT_INVALID'],
  ['rewritten punctuation',c=>c.quote=c.quote.replace('.','!'),'QUOTE_NOT_IN_CITED_PASSAGE'],
  ['whitespace repair forbidden',c=>c.quote=' '+c.quote,'QUOTE_FORMAT_INVALID'],
  ['category',c=>c.category='x'.repeat(81),'CATEGORY_INVALID'],
  ['topic',c=>c.topic='','TOPIC_INVALID'],
  ['reason',c=>c.reason='x'.repeat(241),'REASON_INVALID'],
  ['invalid calendar date',c=>c.validAt='2026-02-30','DATE_FORMAT_INVALID'],
  ['nonstring date',c=>c.validAt=20261031,'DATE_FORMAT_INVALID'],
  ['unsupported date',c=>c.validAt='2020-01-01','DATE_UNSUPPORTED']
];
for(const [name,mutate,rule] of invalidCases)test(`${name}: reject only the invalid proposal; never repair its support`,()=>{
  const raw=evaluation(sources);mutate(raw.claims[0]);const before=structuredClone(raw);
  assert.throws(()=>validateSourceEvaluation(raw,sources),error=>error.detail===rule);
  const selected=selectSourceEvaluation(raw,sources);assert.deepEqual(raw,before);assert.deepEqual(selected.evaluation.claims,[raw.claims[1]]);assert.deepEqual(selected.validation.rejections,[{index:0,rule}]);assert.equal(selected.validation.accepted,1);validateSourceEvaluation(selected.evaluation,sources);
});
test('verbatim substrings work, but concatenating two cited passages never creates new support',()=>{
  const source={...sources[0],text:quotes.join(' '),passages:quotes};
  const good={claims:[claim(source,quotes[0].slice(8))],limitations:[],nextQuestion:null};assert.doesNotThrow(()=>validateSourceEvaluation(good,[source]));
  const crossing={...good,claims:[claim(source,quotes.join(' '))]};assert.throws(()=>validateSourceEvaluation(crossing,[source]),e=>e.detail==='QUOTE_NOT_IN_CITED_PASSAGE');
});
test('dates must be real, explicitly as-of, in the same cited passage, and no later than retrieval',()=>{
  const date='2020-01-02',text=`As of ${date}, ${quotes[0]}`,source={...sources[0],text,passages:[text]};
  const value={claims:[{...claim(source,quotes[0]),validAt:date}],limitations:[],nextQuestion:null};assert.doesNotThrow(()=>validateSourceEvaluation(value,[source]));
  assert.throws(()=>validateSourceEvaluation(value,[{...source,passages:[quotes[0],`As of ${date}, a different observation was reported.`]}]),e=>e.detail==='DATE_UNSUPPORTED');
  assert.throws(()=>validateSourceEvaluation(value,[{...source,text:`For the ${date} season, ${quotes[0]}`,passages:[`For the ${date} season, ${quotes[0]}`]}]),e=>e.detail==='DATE_UNSUPPORTED');
  assert.throws(()=>validateSourceEvaluation(value,[{...source,observedAt:Date.parse('2020-01-01T00:00:00Z')}]),e=>e.detail==='DATE_AFTER_RETRIEVAL');
});
test('invalid optional questions do not discard independent supported claims or evidence limitations',async()=>{
  for(const nextQuestion of ['How do neurons communicate?','https://private.invalid/','x'.repeat(121),['invalid'],null]){
    const res=await api({propose:s=>({...evaluation(s),nextQuestion,limitations:['A valid synthetic limitation.']})});assert.equal(res.code,200);assert.equal(res.body.acquisition.evaluation.claims.length,2);assert.equal(res.body.acquisition.evaluation.nextQuestion,null);assert.deepEqual(res.body.acquisition.evaluation.limitations,['A valid synthetic limitation.']);
    const rejected=res.body.execution.validation.metadataRejections;assert.equal(rejected.some(x=>x.rule==='FOLLOWUP_INVALID'),nextQuestion!==null);
  }
  const compliant=await api({propose:s=>({...evaluation(s),nextQuestion:'How do inhibitory synapses influence neural signaling'})});assert.equal(compliant.body.acquisition.evaluation.nextQuestion,'How do inhibitory synapses influence neural signaling');
});
test('invalid limitations fail safely rather than silently erasing possible qualifications',async()=>{
  const res=await api({propose:s=>({...evaluation(s),limitations:['x'.repeat(241)]})});assert.equal(res.code,502);assert.equal(res.body.error.diagnostic.detail,'LIMITATION_INVALID');assert.equal(res.body.acquisition,undefined);validateResearchCheckpoint(res.body.sourceCheckpoint);
});
test('mixed production-shaped HTTP 200 assessments retain only exact supported claims with private-safe rules',async()=>{
  const res=await api({propose:s=>evaluation(s,'mixed')});assert.equal(res.code,200);assert.equal(res.body.acquisition.evaluation.claims.length,1);const d=validateServiceDiagnostic(res.body.execution);
  assert.equal(d.detail,'EVALUATION_FILTERED');assert.deepEqual(d.validation.rejections,[{index:1,rule:'QUOTE_NOT_IN_CITED_PASSAGE'}]);assert.equal(d.validation.metadataRejections[0].rule,'FOLLOWUP_INVALID');
  assert.doesNotMatch(JSON.stringify(res.logs),/Neurons|Synapses|PRIVATE|synthetic-private-key|opaque-model|https:/);
});
test('zero acceptable claims is explicit insufficient evidence, not HTTP 502 or invented knowledge',async()=>{
  const res=await api({propose:s=>evaluation(s,'zero')});assert.equal(res.code,200);assert.deepEqual(res.body.acquisition.evaluation.claims,[]);assert.equal(res.body.execution.detail,'INSUFFICIENT_EVIDENCE');assert.equal(res.body.execution.validation.accepted,0);assert.equal(res.body.execution.validation.rejections.length,2);validateResearchCheckpoint(res.body.sourceCheckpoint);
});
test('malformed evaluation envelopes fail precisely and preserve a signed evidence checkpoint',async()=>{
  for(const propose of [()=>({claims:[],limitations:[]}),s=>({...evaluation(s),claims:[...evaluation(s).claims,...evaluation(s).claims]})]){
    const res=await api({propose});assert.equal(res.code,502);assert.equal(res.body.error.diagnostic.detail,'EVALUATION_FIELDS_INVALID');const checkpoint=validateResearchCheckpoint(res.body.sourceCheckpoint);assert.equal(checkpoint.evidence.sources.length,2);assert.deepEqual(checkpoint.evidence.evaluation.claims,[]);
  }
});
test('interrupted evaluation resumes only the signed source evidence, with unchanged budgets and no second search',async()=>{
  for(const upstreamFailure of [true,'abort']){
    const failed=await api({upstreamFailure});assert.ok([499,502].includes(failed.code));const checkpoint=validateResearchCheckpoint(failed.body.sourceCheckpoint);assert.equal(checkpoint.evidence.sources.length,2);const before=structuredClone(checkpoint);
    const retry=await api({mode:'research-evaluate',context:{checkpoint},propose:s=>evaluation(s,'mixed')});assert.equal(retry.code,200);assert.equal(retry.body.acquisition.evaluation.claims.length,1);assert.equal(retry.calls.length,2);assert.equal(retry.calls.some(c=>c.url.endsWith('/responses')),false);assert.deepEqual(checkpoint,before);assert.equal(retry.body.execution.completed,1);assert.equal(retry.body.execution.searchDispatched,false);
    const tampered=structuredClone(checkpoint);tampered.evidence.sources[0].text+=' altered';const denied=await api({mode:'research-evaluate',context:{checkpoint:tampered}});assert.equal(denied.code,400);assert.equal(denied.calls.length,0);
  }
});
test('legacy signed source text without separate passage metadata retains its exact-text fallback',async()=>{
  const failed=await api({upstreamFailure:true}),{seal}=require('../src/server/research-checkpoint.cjs');
  const evidence=structuredClone(failed.body.sourceCheckpoint.evidence);for(const source of evidence.sources)delete source.passages;
  const checkpoint=seal(evidence,request,sha('legacy-checkpoint'),'synthetic-private-key',context.plan);
  validateResearchCheckpoint(checkpoint);const before=structuredClone(checkpoint);
  const res=await api({mode:'research-evaluate',context:{checkpoint}});assert.equal(res.code,200);assert.equal(res.body.acquisition.evaluation.claims.length,2);assert.deepEqual(checkpoint,before);assert.equal(res.calls.some(c=>c.url.endsWith('/responses')),false);
});
