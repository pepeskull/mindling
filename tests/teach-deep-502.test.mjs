import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {teachMemory} from '../src/learning/teach-memory.js';
import {createSandbox,newMindling,XP} from '../src/preview/sandbox/engine.js';
import {learningContext} from '../src/preview/sandbox/learning-assessment.js';
import {assessmentSchema,validateAssessment} from '../src/preview/sandbox/memory-decision.js';
import {atomicStatements} from '../src/preview/sandbox/atomic-memory.js';
import {validateLearningDiagnostic} from '../src/learning/learning-diagnostics.js';
const require=createRequire(import.meta.url),{handler,_resetRateLimits}=require('../src/server/mindling-learning.cjs');
import {TEACH,DEEP,decision,proposed} from './support/teach-deep-assessment.mjs';
const app=()=>({state:newMindling(createSandbox(),{confirmed:true,id:'teach-deep-fixture'}),async change(reducer){this.state=reducer(structuredClone(this.state));}});
async function mocked(callback,{outcome='good',mutateAssessment=null,status=400,modelOutcome='good'}={}){
 const oldFetch=globalThis.fetch,oldWarn=console.warn,oldKey=process.env.SERVICE_API,oldModel=process.env.SERVICE_MODEL;
 process.env.SERVICE_API='synthetic-secret';process.env.SERVICE_MODEL='synthetic-model';
 const control={outcome,mutateAssessment,status,modelOutcome,calls:[],logs:[],lastResponse:null};console.warn=line=>control.logs.push(JSON.parse(line));
 globalThis.fetch=async(url,options)=>{
  control.calls.push(url);
  if(url==='/api/mindling/learn'){
   const req=Object.assign(new EventEmitter(),{method:'POST',headers:{host:'localhost',...Object.fromEntries(Object.entries(options.headers).map(([k,v])=>[k.toLowerCase(),v]))},body:JSON.parse(options.body)});
   const res=Object.assign(new EventEmitter(),{status(code){this.code=code;return this;},json(body){if(control.outcome==='serialization'&&this.code===200)throw Error('PRIVATE SERIALIZATION DETAILS');this.body=body;this.writableEnded=true;return this;}});
   await handler(req,res);control.lastResponse=res;return Response.json(res.body,{status:res.code});
  }
  if(url==='https://api.openai.com/v1/models/synthetic-model')return control.modelOutcome==='missing'?Response.json({error:{code:'model_not_found',message:'PRIVATE MODEL DETAILS'}},{status:404}):Response.json({id:control.modelOutcome==='mismatch'?'different-model':'synthetic-model'});
  assert.equal(url,'https://api.openai.com/v1/chat/completions');
  const request=JSON.parse(options.body),context=JSON.parse(request.messages[1].content);
  assert.equal(request.max_completion_tokens,2600);assert.equal(request.model,'synthetic-model');assert.equal(request.response_format.json_schema.strict,true);assert.deepEqual(request.response_format.json_schema.schema,assessmentSchema(context));assert.equal(context.statements.length,atomicStatements(context.input).length);
  const out=control.outcome;
  if(out==='network')throw TypeError('PRIVATE CONNECTION DETAILS');
  if(out==='http')return Response.json({error:{message:'PRIVATE INPUT synthetic-secret',code:'invalid_json_schema',param:'response_format.json_schema.schema'}},{status:control.status,headers:{'x-request-id':'req_safe_learning'}});
  if(out==='bad-envelope')return new Response('{broken',{headers:{'content-type':'application/json'}});
  if(out==='oversize')return new Response('x'.repeat(65537));
  const assessment=proposed(context);control.mutateAssessment?.(assessment,context);
  return Response.json({choices:[{finish_reason:out==='truncated'?'length':'stop',message:{refusal:out==='refusal'?'PRIVATE REFUSAL':null,content:out==='missing-content'?null:out==='bad-json'?'{broken':out==='text-array'?[{type:'text',text:JSON.stringify(assessment)}]:JSON.stringify(assessment)}}]});
 };
 try{return await callback(control);}finally{globalThis.fetch=oldFetch;console.warn=oldWarn;_resetRateLimits();for(const [key,value] of [['SERVICE_API',oldKey],['SERVICE_MODEL',oldModel]])if(value===undefined)delete process.env[key];else process.env[key]=value;}
}
test('actual Teach service contract creates Veloria canonically without storing the teaching directive',async()=>mocked(async c=>{
 const a=app();await teachMemory(a,{id:'teach',text:TEACH,activity:'TEACH'});assert.equal(c.lastResponse.code,200);assert.equal(a.state.mind.memories.length,1);assert.equal(a.state.mind.memories[0].content,atomicStatements(TEACH)[0]);assert.equal(a.state.mind.memories[0].category,'fictional worldbuilding');assert.equal(a.state.mind.energy.remaining,8);assert.equal(a.state.mind.lifetimeXP,XP.concept);
 await teachMemory(a,{id:'teach-repeat',text:TEACH,activity:'TEACH'});const calls=c.calls.length;
 await teachMemory(a,{id:'teach-exact',text:atomicStatements(TEACH)[0],activity:'TEACH'});assert.equal(c.calls.length,calls);assert.equal(a.state.mind.memories.length,1);assert.equal(a.state.mind.energy.remaining,8);assert.equal(a.state.mind.lifetimeXP,XP.concept);
}));
test('Deep reinforces the known definition and links a distinct claim to that same target without 502 or overwrite',async()=>mocked(async c=>{
 const a=app();await teachMemory(a,{id:'teach',text:TEACH,activity:'TEACH'});const original=a.state.mind.memories[0].content;
 await teachMemory(a,{id:'deep',text:DEEP,activity:'DEEP_TRAINING'});assert.equal(c.lastResponse.code,200);assert.equal(a.state.mind.memories.length,2);assert.equal(a.state.mind.memories[0].content,original);assert.equal(a.state.mind.memories[1].content,atomicStatements(DEEP)[1]);assert.ok(a.state.mind.memories[1].relatedMemoryIds.includes('teach'));assert.ok(a.state.mind.memories[0].relatedMemoryIds.includes('deep'));assert.equal(a.state.mind.energy.remaining,5);assert.equal(a.state.mind.lifetimeXP,XP.concept*2);
 const before=c.calls.length;await assert.rejects(teachMemory(a,{id:'deep',text:DEEP,activity:'DEEP_TRAINING'}),/already processed/);assert.equal(c.calls.length,before);
 await teachMemory(a,{id:'deep-again',text:DEEP,activity:'DEEP_TRAINING'});assert.equal(a.state.mind.memories.length,2);assert.equal(a.state.mind.energy.remaining,5);assert.equal(a.state.mind.lifetimeXP,XP.concept*2);
}));
test('target reuse remains restrictive for duplicate reinforcement, overwrites, unknown targets and repeated new claims',()=>{
 const a=app(),target={id:'known',content:'A saved claim about Veloria.',category:'fictional worldbuilding',categoryId:'fiction',topic:'Veloria',kind:'claim',current:true};
 const context={input:DEEP,candidates:[target],categories:[{id:'fiction',name:target.category}]};
 const value=proposed(context);value.operations[0].decision=decision('REINFORCE_EXISTING','known');value.operations[1].decision=decision('LINK_TO_EXISTING','known','fiction');assert.doesNotThrow(()=>validateAssessment(value,context));
 for(const mutate of [v=>v.operations[1].decision=decision('REINFORCE_EXISTING','known'),v=>v.operations[1].decision.relatedMemoryId='invented',v=>v.operations[1].decision=decision('UPDATE_EXISTING','known')]){const broken=structuredClone(value);mutate(broken);assert.throws(()=>validateAssessment(broken,context));}
 const links=structuredClone(value);links.operations[0].decision=decision('LINK_TO_EXISTING','known','fiction');assert.doesNotThrow(()=>validateAssessment(links,context));
 const repeat={...context,input:'Veloria reflects moonlight. Veloria reflects moonlight.'};const duplicate=proposed(repeat);duplicate.operations.forEach(item=>item.decision=decision('LINK_TO_EXISTING','known','fiction'));assert.throws(()=>validateAssessment(duplicate,repeat),error=>error.reason==='DUPLICATE_NEW_CLAIM');
});
for(const [outcome,reason,phase] of [['http','UPSTREAM_HTTP_REJECTED','UPSTREAM_REQUEST'],['network','FETCH_FAILED','UPSTREAM_REQUEST'],['bad-envelope','JSON_INVALID','RESPONSE_PARSE'],['bad-json','ASSESSMENT_JSON_INVALID','RESPONSE_PARSE'],['truncated','OUTPUT_TRUNCATED','RESPONSE_PARSE'],['missing-content','ASSESSMENT_TEXT_MISSING','RESPONSE_PARSE'],['refusal','MODEL_REFUSAL','RESPONSE_PARSE'],['oversize','BODY_LIMIT','RESPONSE_PARSE'],['serialization','OPERATION_FAILED','RESPONSE_SERIALIZATION']])test(`${outcome}: structured private-safe diagnostics and zero changes for Teach and Deep`,async()=>mocked(async c=>{
 for(const activity of ['TEACH','DEEP_TRAINING']){
  const a=app(),before=JSON.stringify(a.state);await assert.rejects(teachMemory(a,{id:'failed',text:TEACH,activity}));assert.equal(JSON.stringify(a.state),before);
  const d=validateLearningDiagnostic(c.lastResponse.body.diagnostic);assert.equal(d.phase,phase);assert.equal(d.reason,reason);assert.equal(c.lastResponse.code,502);assert.equal(d.modelConfirmed,true);if(outcome==='http'){assert.equal(d.upstreamStatus,400);assert.equal(d.upstreamErrorCode,'invalid_json_schema');assert.equal(d.upstreamErrorParam,'response_format');}
 }
 const logs=JSON.stringify(c.logs),body=JSON.stringify(c.lastResponse.body);for(const value of [logs,body])assert.doesNotMatch(value,/Veloria|floating|synthetic-secret|synthetic-model|PRIVATE/);
},{outcome}));
test('missing assessment fields and invalid references are rejected with specific validation reasons',async()=>{
 for(const [mutate,reason] of [[v=>delete v.operations[0].decision.topic,'DECISION_FIELDS_INVALID'],[v=>v.operations.pop(),'STATEMENT_COUNT_MISMATCH'],[v=>v.operations[0].decision=decision('LINK_TO_EXISTING','invented'),'UNKNOWN_MEMORY_REFERENCE']]){
  await mocked(async c=>{const a=app(),before=JSON.stringify(a.state);await assert.rejects(teachMemory(a,{id:'invalid',text:TEACH,activity:'TEACH'}));assert.equal(JSON.stringify(a.state),before);assert.equal(c.lastResponse.body.diagnostic.phase,'ASSESSMENT_VALIDATION');assert.equal(c.lastResponse.body.diagnostic.reason,reason);},{mutateAssessment:mutate});
 }
});
test('an explicit retry after failure can commit once using the same event ID',async()=>mocked(async c=>{
 const a=app(),before=JSON.stringify(a.state);await assert.rejects(teachMemory(a,{id:'retry',text:TEACH,activity:'TEACH'}));assert.equal(JSON.stringify(a.state),before);
 c.outcome='good';await teachMemory(a,{id:'retry',text:TEACH,activity:'TEACH'});const after=JSON.stringify(a.state),calls=c.calls.length;await assert.rejects(teachMemory(a,{id:'retry',text:TEACH,activity:'TEACH'}));assert.equal(JSON.stringify(a.state),after);assert.equal(c.calls.length,calls);assert.equal(a.state.mind.memories.length,1);assert.equal(a.state.mind.energy.remaining,8);assert.equal(a.state.mind.lifetimeXP,XP.concept);
},{outcome:'http'}));
test('concurrent delivery of one event cannot duplicate canonical writes or charges',async()=>mocked(async()=>{
 const a=app(),outcomes=await Promise.allSettled([teachMemory(a,{id:'once',text:TEACH,activity:'TEACH'}),teachMemory(a,{id:'once',text:TEACH,activity:'TEACH'})]);assert.equal(outcomes.filter(item=>item.status==='fulfilled').length,1);assert.equal(a.state.mind.memories.length,1);assert.equal(a.state.mind.energy.remaining,8);assert.equal(a.state.mind.lifetimeXP,XP.concept);
}));
test('supported text-part envelopes still deliver the unchanged assessment contract',async()=>mocked(async c=>{
 const a=app();await teachMemory(a,{id:'text-parts',text:TEACH,activity:'TEACH'});assert.equal(c.lastResponse.code,200);assert.equal(a.state.mind.memories.length,1);
},{outcome:'text-array'}));
test('model lookup failure cannot fall back to another model or reach inference',async()=>{
 for(const [modelOutcome,reason] of [['missing','UPSTREAM_HTTP_REJECTED'],['mismatch','MODEL_ID_MISMATCH']])await mocked(async c=>{
  const a=app(),before=structuredClone(a.state);await assert.rejects(teachMemory(a,{id:'model-failed',text:TEACH,activity:'TEACH'}));assert.deepEqual(a.state,before);assert.equal(c.calls.length,2);assert.equal(c.lastResponse.code,503);assert.equal(c.lastResponse.body.diagnostic.phase,'MODEL_CHECK');assert.equal(c.lastResponse.body.diagnostic.reason,reason);assert.equal(c.lastResponse.body.diagnostic.modelConfirmed,false);
 },{modelOutcome});
});
test('authentication, permission, rate and provider failures retain upstream status without leaking error bodies',async()=>{
 for(const status of [401,403,404,429,500,503])await mocked(async c=>{
  const a=app(),before=structuredClone(a.state);await assert.rejects(teachMemory(a,{id:'provider-failed',text:TEACH,activity:'TEACH'}));assert.deepEqual(a.state,before);assert.equal(c.lastResponse.code,status===429?429:502);assert.equal(c.lastResponse.body.diagnostic.upstreamStatus,status);assert.doesNotMatch(JSON.stringify(c.logs),/PRIVATE|synthetic-secret/);
 },{outcome:'http',status});
});
test('unsafe labels and insufficient confidence still reject before canonical storage',async()=>{
 for(const [mutateAssessment,reason] of [[v=>v.operations[0].decision.category='synthetic-secret','LABEL_REDACTION'],[v=>v.operations[0].decision.confidence=.5,'CONFIDENCE_TOO_LOW']])await mocked(async c=>{
  const a=app(),before=structuredClone(a.state);await assert.rejects(teachMemory(a,{id:'unsafe-output',text:TEACH,activity:'TEACH'}));assert.deepEqual(a.state,before);assert.equal(c.lastResponse.code,502);assert.equal(c.lastResponse.body.diagnostic.reason,reason);assert.doesNotMatch(JSON.stringify(c.logs),/synthetic-secret|Veloria/);
 },{mutateAssessment});
});
