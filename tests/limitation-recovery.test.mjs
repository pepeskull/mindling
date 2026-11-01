import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {sourceEvaluationSchemaFor,selectSourceEvaluation,validateSourceEvaluation,validateResearchCheckpoint} from '../src/autonomous/research-contract.js';
import {limitationFailureFor} from '../src/autonomous/research-limitations.js';
import {requestResearchAcquisition,requestResearchEvaluation} from '../src/cognition/reasoning-client.js';
import {validateServiceDiagnostic,matchingEvaluationFailure} from '../src/autonomous/service-diagnostics.js';
const require=createRequire(import.meta.url),{handler}=require('../src/server/mindling-reasoning.cjs');
const fixture=require('./support/gaming-research-fixture.cjs'),sha=text=>createHash('sha256').update(text).digest('hex');
const context={request:{topic:'Gaming',mode:'FOUNDATION',autonomous:true,freshness:false,scope:{criterion:null,geography:[],geographyMode:null,period:null,quantity:null}},queries:['Gaming game rules'],remainingCalls:2};
let sequence=0;
async function mocked(callback,{limitations=[fixture.limitation],mixed=false,invalidCheckpoint=false}={}){
 const old={fetch:globalThis.fetch,warn:console.warn,key:process.env.SERVICE_API,model:process.env.SERVICE_MODEL,enabled:process.env.MINDLING_WEB_SEARCH};
 process.env.SERVICE_API='synthetic-limitation-secret';process.env.SERVICE_MODEL='opaque-model';process.env.MINDLING_WEB_SEARCH='enabled';
 const control={limitations,mixed,invalidCheckpoint,calls:[],logs:[],last:null};console.warn=line=>control.logs.push(JSON.parse(line));
 globalThis.fetch=async(url,options)=>{
  control.calls.push(url);
  if(url==='/api/mindling/reason'){
   const req=Object.assign(new EventEmitter(),{method:'POST',headers:{host:'localhost','x-forwarded-for':`limitation-${++sequence}`},body:JSON.parse(options.body)});
   const res=Object.assign(new EventEmitter(),{status(code){this.code=code;return this;},json(body){this.body=body;this.writableEnded=true;return this;}});
   await handler(req,res);control.last=res;
   if(control.invalidCheckpoint&&res.body.sourceCheckpoint)res.body.sourceCheckpoint.evidence.sources[0].title='';
   return Response.json(res.body,{status:res.code});
  }
  if(url.endsWith('/models/opaque-model'))return Response.json({id:'opaque-model'});
  if(url.endsWith('/responses')){assert.equal(JSON.parse(options.body).max_tool_calls,2);return Response.json(fixture.searchPayload());}
  assert.equal(url,'https://api.openai.com/v1/chat/completions');const body=JSON.parse(options.body),data=JSON.parse(body.messages[1].content);
  assert.equal(body.max_completion_tokens,2600);assert.equal(body.model,'opaque-model');assert.deepEqual(body.response_format.json_schema.schema,sourceEvaluationSchemaFor(data.sources));
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(fixture.evaluation(data.sources,control.limitations,control.mixed))}}]});
 };
 try{return await callback(control);}finally{globalThis.fetch=old.fetch;console.warn=old.warn;for(const [key,value] of [['SERVICE_API',old.key],['SERVICE_MODEL',old.model],['MINDLING_WEB_SEARCH',old.enabled]])if(value===undefined)delete process.env[key];else process.env[key]=value;}
}
const acquire=()=>requestResearchAcquisition({id:sha('acquire-'+(++sequence)),context,signal:new AbortController().signal});
test('outgoing schema rejects blank placeholders and uses Unicode character boundaries consistently',()=>{
 const schema=sourceEvaluationSchemaFor([{id:'known'}]).properties.limitations.items;
 const conforms=value=>typeof value==='string'&&[...value].length>=schema.minLength&&[...value].length<=schema.maxLength&&new RegExp(schema.pattern,'u').test(value);
 for(const value of [fixture.limitation,'🎮'.repeat(240),'x'.repeat(240)]){assert.equal(conforms(value),true);assert.equal(limitationFailureFor(value,0),null);}
 for(const value of ['',' \n\t','x'.repeat(241),'🎮'.repeat(241)])assert.equal(conforms(value),false);
 // Schema length/whitespace support is not a substitute for Unicode safety.
 assert.equal(conforms('Uncertainty\u200bremains'),true);assert.equal(limitationFailureFor('Uncertainty\u200bremains',0).rule,'UNSAFE_CHARACTERS');
});
for(const [name,value] of [
 ['plain','No independent verification is established.'],['leading/trailing spaces','  Evidence remains uncertain.  '],['line breaks','A cited report may omit context.\nNo independent comparison was established.'],['tabs','Evidence\tremains uncertain.'],['Unicode whitespace','\u00a0No independent verification.\u00a0'],['one character','?'],['240 BMP characters','x'.repeat(240)],['240 Unicode code points','🎮'.repeat(240)]
])test(`${name}: supported limitations remain byte-for-byte unchanged`,async()=>mocked(async c=>{
 const result=await acquire();assert.equal(c.last.code,200);assert.deepEqual(result.acquisition.evaluation.limitations,[value]);assert.equal(result.execution.completed,2);assert.equal(result.acquisition.evaluation.claims.length,2);assert.equal(limitationFailureFor(value,0),null);
},{limitations:[value]}));
for(const [name,value,rule] of [
 ['empty','','BLANK'],['blank',' \n\t\u00a0','BLANK'],['nonstring',null,'NOT_A_STRING'],['241 BMP characters','x'.repeat(241),'TOO_LONG'],['241 Unicode code points','🎮'.repeat(241),'TOO_LONG'],['NUL','Evidence\u0000uncertain','UNSAFE_CHARACTERS'],['control','Evidence\u0008uncertain','UNSAFE_CHARACTERS'],['zero width format','Evidence\u200buncertain','UNSAFE_CHARACTERS'],['bidi override','Evidence\u202euncertain','UNSAFE_CHARACTERS'],['unpaired surrogate','Evidence\ud800uncertain','UNSAFE_CHARACTERS']
])test(`${name}: accurate recoverable failure, never erase uncertainty`,async()=>mocked(async c=>{
 let failed;try{await acquire();}catch(error){failed=error;}assert.ok(failed);assert.equal(failed.code,'RESPONSE_PARSE_ERROR');assert.equal(failed.diagnostic.detail,'LIMITATION_INVALID');assert.equal(failed.diagnostic.limitationFailure.rule,rule);assert.equal(failed.diagnostic.limitationFailure.index,0);assert.equal(c.last.code,502);
 validateServiceDiagnostic(failed.diagnostic);const checkpoint=validateResearchCheckpoint(failed.checkpoint);assert.equal(checkpoint.evidence.sources.length,2);assert.equal(checkpoint.evidence.requests,2);assert.equal(failed.diagnostic.completed,2);assert.equal(failed.diagnostic.sourceCount,2);assert.equal(failed.diagnostic.phase,'SOURCE_EVALUATION');
 assert.doesNotMatch(JSON.stringify(c.logs),/Evidence|uncertain|synthetic-limitation-secret|opaque-model|https:/);
},{limitations:[value]}));
test('the second invalid limitation is reported without losing the first qualification',async()=>mocked(async()=>{
 await assert.rejects(acquire(),error=>error.diagnostic.limitationFailure.index===1&&error.diagnostic.limitationFailure.rule==='BLANK'&&!!error.checkpoint);
},{limitations:['A material uncertainty remains.',' ']}));
test('safe evaluation retry uses the original signed sources, no second search or increased ceilings',async()=>mocked(async c=>{
 let failed;try{await acquire();}catch(error){failed=error;}const checkpoint=structuredClone(failed.checkpoint),before=structuredClone(checkpoint),searches=c.calls.filter(url=>url.endsWith('/responses')).length;
 c.limitations=[fixture.limitation];c.mixed=true;
 const result=await requestResearchEvaluation({id:sha('retry-'+(++sequence)),context:{checkpoint},signal:new AbortController().signal});assert.equal(result.acquisition.evaluation.claims.length,1);assert.deepEqual(result.acquisition.evaluation.limitations,[fixture.limitation]);assert.equal(result.execution.validation.rejections[0].rule,'QUOTE_NOT_IN_CITED_PASSAGE');assert.equal(result.execution.completed,2);assert.equal(c.calls.filter(url=>url.endsWith('/responses')).length,searches);assert.deepEqual(checkpoint,before);
},{limitations:['x'.repeat(241)]}));
test('strict browser validation and independent claim selection share the same limitation policy',()=>{
 const source={id:'known',passages:[fixture.quotes[0]],observedAt:Date.now()},value=fixture.evaluation([source]);const before=structuredClone(value);
 assert.doesNotThrow(()=>validateSourceEvaluation(value,[source]));assert.deepEqual(selectSourceEvaluation(value,[source]).evaluation.limitations,value.limitations);assert.deepEqual(value,before);
});
test('invalid recovery metadata cannot erase the received server category and failed limitation rule',async()=>mocked(async()=>{
 await assert.rejects(acquire(),error=>error.code==='RESPONSE_PARSE_ERROR'&&error.diagnostic.phase==='SOURCE_EVALUATION'&&error.diagnostic.detail==='LIMITATION_INVALID'&&error.recoveryBlockedReason==='CHECKPOINT_INVALID'&&!error.checkpoint);
},{limitations:[''],invalidCheckpoint:true}));
test('failure recovery uses only the matching request receipt, never an older task response',async()=>mocked(async()=>{
 let failed;try{await acquire();}catch(error){failed=error;}
 const task={serviceDiagnostic:failed.diagnostic,researchExecution:{correlationId:failed.diagnostic.correlationId,operation:'research-acquire'}};
 assert.equal(matchingEvaluationFailure(task),failed.diagnostic);assert.equal(matchingEvaluationFailure({...task,researchExecution:{...task.researchExecution,correlationId:sha('new-request')}}),null);assert.equal(matchingEvaluationFailure({...task,researchExecution:{...task.researchExecution,operation:'research-evaluate'}}),null);
},{limitations:['']}));
