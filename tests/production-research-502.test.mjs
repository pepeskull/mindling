import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {autonomousDiagnostics} from '../src/autonomous/autonomous-schedule.js';
import {validateServiceDiagnostic,canRetryResearch} from '../src/autonomous/service-diagnostics.js';
import {validateResearchCheckpoint} from '../src/autonomous/research-contract.js';
const require=createRequire(import.meta.url),{handler}=require('../src/server/mindling-reasoning.cjs');
const sha=s=>createHash('sha256').update(s).digest('hex');
const quote='Social norms are shared expectations that guide behavior within a community.';
const sourceURL='https://openstax.org/books/introduction-sociology-3e/pages/3-2-elements-of-culture';
const request={topic:'social norms',mode:'FOUNDATION',autonomous:true,freshness:false,scope:{criterion:null,geography:[],geographyMode:null,period:null,quantity:null}};
const context={request,queries:['social norms values laws'],remainingCalls:2};
const result={claims:[{sourceId:`web:${sha(sourceURL+'\n'+quote)}`,quote,category:'Social',topic:'Social norms',reason:'Relevant synthetic cited claim.',validAt:null}],limitations:[],nextQuestion:null};
function searchPayload(action='search',status='completed'){
 return {id:'resp_synthetic_production',status:'completed',output:[{type:'web_search_call',status,action:action==='search'?{type:action,sources:[{type:'url',url:sourceURL}]}:{type:action,url:sourceURL}},{type:'message',status:'completed',content:[{type:'output_text',text:quote+' [1]',annotations:[{type:'url_citation',url:sourceURL,title:'Synthetic research fixture',start_index:quote.length+1,end_index:quote.length+4}]}]}]};
}
let sequence=0;
async function call(mode,input,upstream,{timeout=false}={}){
 const before={...process.env},fetcher=globalThis.fetch,warn=console.warn,timer=globalThis.setTimeout,logs=[],calls=[];
 process.env.SERVICE_API='synthetic-secret-not-for-logs';process.env.SERVICE_MODEL='opaque-model';process.env.MINDLING_WEB_SEARCH='enabled';
 console.warn=line=>logs.push(JSON.parse(line));
 globalThis.fetch=async(url,options)=>{calls.push(url);return upstream(url,options);};
 if(timeout)globalThis.setTimeout=(callback,ms,...rest)=>timer(callback,ms===45000?5:ms,...rest);
 const req=Object.assign(new EventEmitter(),{method:'POST',headers:{host:'localhost','x-forwarded-for':`production-test-${++sequence}`},body:{id:sha(String(sequence)),mode,context:input}});
 const res=Object.assign(new EventEmitter(),{status(code){this.code=code;return this;},json(body){this.body=body;this.writableEnded=true;return this;}});
 try{await handler(req,res);return {...res,logs,calls};}finally{globalThis.fetch=fetcher;console.warn=warn;globalThis.setTimeout=timer;for(const key of ['SERVICE_API','SERVICE_MODEL','MINDLING_WEB_SEARCH'])if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}
}
const okay=async url=>url.includes('/models/')?Response.json({id:'opaque-model'}):url.endsWith('/responses')?Response.json(searchPayload()):Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]});
test('success retains mandatory hosted search and fixed ceilings, with safe completed execution metadata',async()=>{
 const res=await call('research-acquire',context,okay);assert.equal(res.code,200);assert.equal(res.body.acquisition.evaluation.claims.length,1);
 const d=validateServiceDiagnostic(res.body.execution);assert.equal(d.completed,1);assert.equal(d.searchCompleted,true);assert.equal(d.fallbackReason,'none');assert.equal(res.calls.length,3);
});
test('incident A: evidence-analysis 502 preserves successful search and a signed analysis-only recovery',async()=>{
 const initial=await call('research-acquire',context,async(url,options)=>url.endsWith('/chat/completions')?Response.json({error:{message:'PRIVATE PROMPT synthetic-secret-not-for-logs',type:'server_error'}},{status:503,headers:{'x-request-id':'req_safe_upstream'}}):okay(url,options));
 assert.equal(initial.code,502);const d=validateServiceDiagnostic(initial.body.error.diagnostic);assert.equal(d.errorCategory,'UPSTREAM_HTTP_ERROR');assert.equal(d.phase,'SOURCE_EVALUATION');assert.equal(d.upstreamStatus,503);assert.equal(d.completed,1);assert.equal(d.sourceCount,1);assert.equal(d.outcomeUnknown,false);
 const checkpoint=validateResearchCheckpoint(initial.body.sourceCheckpoint);assert.equal(checkpoint.evidence.sources.length,1);
 for(const value of [JSON.stringify(initial.logs),JSON.stringify(initial.body)]){assert.ok(!value.includes('PRIVATE PROMPT'));assert.ok(!value.includes('synthetic-secret-not-for-logs'));assert.ok(!value.includes('opaque-model'));}
 const resumed=await call('research-evaluate',{checkpoint},okay);assert.equal(resumed.code,200);assert.equal(resumed.body.acquisition.evaluation.claims.length,1);assert.equal(resumed.calls.some(url=>url.endsWith('/responses')),false);assert.equal(resumed.body.execution.completed,1);assert.equal(resumed.body.execution.searchDispatched,false);
 const failed=await call('research-evaluate',{checkpoint},async url=>url.includes('/models/')?okay(url):new Response('{invalid',{headers:{'content-type':'application/json'}}));
 assert.equal(failed.code,502);assert.equal(failed.body.error.code,'RESPONSE_PARSE_ERROR');assert.equal(failed.body.error.diagnostic.phase,'SOURCE_EVALUATION');assert.equal(failed.calls.some(url=>url.endsWith('/responses')),false);assert.equal(failed.body.error.diagnostic.fallbackReason,'none');
});
test('signed checkpoints cannot be forged, changed or used after expiry; rejected before model dispatch',async()=>{
 const initial=await call('research-acquire',context,async(url,options)=>url.endsWith('/chat/completions')?Response.json({error:{}},{status:500}):okay(url,options));
 for(const mutate of [c=>c.evidence.sources[0].text+=' invented',c=>c.signature='0'.repeat(64),c=>c.expiresAt=1]){
  const checkpoint=structuredClone(initial.body.sourceCheckpoint);mutate(checkpoint);
  const res=await call('research-evaluate',{checkpoint},()=>{throw Error('No upstream allowed');});assert.ok([400].includes(res.code));assert.equal(res.calls.length,0);
 }
});
test('incident B: no/failed hosted action is distinct from a retrieval success; no completions fallback',async()=>{
 for(const output of [[],searchPayload('search','failed').output]){
  const res=await call('research-acquire',context,async url=>url.includes('/models/')?okay(url):Response.json({id:'resp_no_search',status:'completed',output}));
  assert.equal(res.code,502);assert.equal(res.body.error.code,'NO_SEARCH_EXECUTED');assert.equal(res.body.error.diagnostic.endpoint,'responses');assert.equal(res.body.error.diagnostic.completed,0);assert.equal(res.calls.some(url=>url.endsWith('/chat/completions')),false);assert.equal(res.body.sourceCheckpoint,undefined);
 }
});
test('documented open_page/find_in_page hosted actions can supply validated citations without an artificial search action',async()=>{
 for(const action of ['open_page','find_in_page']){
  const res=await call('research-acquire',context,async(url,options)=>url.endsWith('/responses')?Response.json(searchPayload(action)):okay(url,options));assert.equal(res.code,200);assert.equal(res.body.acquisition.sources[0].url,sourceURL);assert.equal(res.body.execution.searchCompleted,true);
 }
});
test('upstream HTTP, unsupported tool, invalid request and unavailable model remain distinct and safe',async()=>{
 for(const [status,error,code] of [[500,{message:'secret'},'UPSTREAM_HTTP_ERROR'],[400,{param:'tools[0].type',code:'unsupported_value'},'TOOL_UNSUPPORTED'],[400,{param:'input'},'INVALID_REQUEST'],[404,{code:'model_not_found'},'MODEL_UNAVAILABLE']]){
  const res=await call('research-acquire',context,async(url,options)=>url.endsWith('/responses')?Response.json({error},{status}):okay(url,options));assert.equal(res.body.error.code,code);assert.equal(res.body.error.diagnostic.upstreamStatus,status);assert.equal(res.body.error.diagnostic.searchCompleted,false);
 }
 const missing=await call('research-acquire',context,async()=>Response.json({error:{code:'model_not_found'}},{status:404}));assert.equal(missing.code,503);assert.equal(missing.calls.length,1);assert.equal(missing.body.error.diagnostic.searchDispatched,false);
 const mismatch=await call('research-acquire',context,async()=>Response.json({id:'different-model'}));assert.equal(mismatch.body.error.code,'MODEL_UNAVAILABLE');assert.equal(mismatch.body.error.diagnostic.detail,'MODEL_ID_MISMATCH');
});
test('network errors and application deadlines do not get attributed to Vercel maximum duration',async()=>{
 const network=await call('research-acquire',context,async(url,options)=>{if(url.includes('/models/'))return okay(url,options);throw TypeError('private network message');});assert.equal(network.body.error.code,'UPSTREAM_NETWORK_ERROR');assert.equal(network.body.error.diagnostic.outcomeUnknown,true);
 const deadline=await call('research-acquire',context,async(url,options)=>{if(url.includes('/models/'))return okay(url,options);return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('timeout','AbortError')),{once:true}));},{timeout:true});assert.equal(deadline.code,504);assert.equal(deadline.body.error.code,'UPSTREAM_TIMEOUT');assert.equal(deadline.body.error.diagnostic.outcomeUnknown,true);
});
test('unknown/exhausted search reservations cannot restart; only available signed-evidence analysis budget can retry',()=>{
 const task={attempts:1,sourcePlan:{},sourceRequests:2,modelCalls:3,planningCalls:1};assert.equal(canRetryResearch(task),false);assert.equal(canRetryResearch({...task,pendingSourceEvidence:{}}),true);assert.equal(canRetryResearch({...task,pendingSourceEvidence:{},modelCalls:4}),false);assert.equal(canRetryResearch({...task,attempts:2,pendingEvidence:[{}]}),true);
});

test('an older task/run cannot supply the phase of the current active research operation',()=>{
 const tasks=[{id:'old',engineVersion:4,autonomous:true,status:'QUEUED',code:'PLANNING',updatedAt:2,topic:'Old topic',run:'old-run'},{id:'current',engineVersion:4,autonomous:false,status:'RESEARCHING',code:'SEARCHING',updatedAt:1,topic:'Current topic',run:'new-run'}];
 const e={preferences:{enabled:true},active:{id:'current',run:'new-run'},app:{state:{mind:{learningTasks:tasks}}}};
 const current=autonomousDiagnostics(e);assert.equal(current.status,'RESEARCHING');assert.equal(current.taskId,'current');assert.equal(current.topic,'Current topic');
 e.active.run='outdated-run';assert.equal(autonomousDiagnostics(e).status,'PAUSED');assert.equal(autonomousDiagnostics(e).taskId,'current');
});
