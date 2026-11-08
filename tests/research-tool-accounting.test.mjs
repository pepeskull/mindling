import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {canRetryResearch,researchFailureMessage,validateServiceDiagnostic} from '../src/autonomous/service-diagnostics.js';
const require=createRequire(import.meta.url),{accountTools}=require('../src/server/research-tool-accounting.cjs'),{search}=require('../src/server/research-information.cjs'),fixture=require('./support/semantic-research-fixture.cjs');
const tool=(id,status='completed')=>({id,type:'web_search_call',status,action:{type:'search',sources:[]}});
for(const count of [1,2])test(`${count} distinct completed tools; exact duplicate event IDs count once`,()=>{
 const t={},calls=Array.from({length:count},(_,i)=>tool('call'+i)),selected=accountTools({status:'completed',output:[...calls,...calls]},2,t);assert.equal(selected.length,count);assert.equal(t.completed,count);assert.equal(t.observedToolEvents,count*2);assert.equal(t.outcomeUnknown,false);
});
test('confirmed overrun preserves actual distinct counters and precise diagnosis without increasing ceilings or authorizing retry',()=>{
 const trace={};assert.throws(()=>accountTools({status:'completed',output:[tool('a'),tool('b'),tool('c')]},2,trace),e=>e.detail==='TOOL_BUDGET_EXCEEDED');assert.equal(trace.completed,3);assert.equal(trace.searchCompleted,true);assert.equal(trace.outcomeUnknown,false);
 const task={code:'RESPONSE_PARSE_ERROR',sourcePlan:{},sourceRequests:2,modelCalls:3,attempts:1};assert.equal(canRetryResearch(JSON.parse(JSON.stringify(task))),false);assert.match(researchFailureMessage({detail:'TOOL_BUDGET_EXCEEDED',outcomeUnknown:false}),/more distinct/);
});
test('anonymous over-ceiling output cannot prove distinct billable calls; incomplete and conflicting events preserve uncertainty',()=>{
 for(const [payload,detail,completed] of [[{status:'completed',output:[tool(null),tool(null),tool(null)]},'TOOL_ACCOUNTING_AMBIGUOUS',0],[{status:'completed',output:[tool('a'),tool('a','failed')]},'TOOL_EVENT_CONFLICT',0]]){const trace={};assert.throws(()=>accountTools(payload,2,trace),e=>e.detail===detail);assert.equal(trace.completed,completed);assert.equal(trace.outcomeUnknown,true);}
 const trace={};assert.throws(()=>accountTools({status:'incomplete',output:[tool('a','in_progress')]},2,trace),e=>e.code==='TOOL_LIFECYCLE_INCOMPLETE');assert.equal(trace.completed,0);assert.equal(trace.outcomeUnknown,true);accountTools({status:'completed'},2,trace);assert.equal(trace.outcomeUnknown,true);
});
test('real search transport enforces existing max_tool_calls and accepts deduplicated cited output; unusable HTTP200 fails safely',async()=>{
 const original=globalThis.fetch,enabled=process.env.MINDLING_WEB_SEARCH;process.env.MINDLING_WEB_SEARCH='enabled';let payload=fixture.searchPayload();payload.output.filter(t=>t.type==='web_search_call').forEach((t,i)=>t.id='call'+i);payload.output.push(structuredClone(payload.output[0]));let requests=0;
 globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(options.body);assert.equal(body.max_tool_calls,2);assert.equal(body.max_output_tokens,2400);requests++;return Response.json(payload);};
 const input={request:{topic:'public computing',mode:'FOUNDATION',freshness:false,scope:{criterion:null,geography:[],geographyMode:null,period:null,quantity:null}},queries:['public computing'],remainingCalls:2};
 try{const trace={},result=await search(input,'synthetic-only','opaque',new AbortController().signal,trace);assert.equal(result.requests,2);assert.equal(result.sources.length,3);assert.equal(trace.completed,2);assert.equal(trace.observedToolEvents,3);
 payload={id:'resp_empty',status:'completed',output:[]};await assert.rejects(search(input,'synthetic-only','opaque',new AbortController().signal,{}),e=>e.detail==='NO_TOOL_CALLS');assert.equal(requests,2);payload=null;const unknown={};await assert.rejects(search(input,'synthetic-only','opaque',new AbortController().signal,unknown),e=>e.detail==='RESPONSE_INCOMPLETE');assert.equal(unknown.outcomeUnknown,true);
 }finally{globalThis.fetch=original;if(enabled===undefined)delete process.env.MINDLING_WEB_SEARCH;else process.env.MINDLING_WEB_SEARCH=enabled;}
});
test('observation counters may report rejected provider overrun, while reservations and four model-request ceiling remain unchanged',()=>{
 const d={correlationId:'a'.repeat(64),operation:'research-acquire',phase:'INFORMATION',endpoint:'responses',upstreamStatus:200,errorCategory:'RESPONSE_PARSE_ERROR',detail:'TOOL_BUDGET_EXCEEDED',durationMs:19084,searchRequested:true,searchDispatched:true,searchCompleted:true,completed:3,failed:0,outcomeUnknown:false,sourceCount:0,fallbackReason:'none',modelConfirmed:true,observedToolEvents:3};assert.deepEqual(validateServiceDiagnostic(JSON.parse(JSON.stringify(d))),d);
 assert.equal(canRetryResearch({pendingSourceEvidence:{},sourceRequests:2,modelCalls:3,attempts:1}),true);assert.equal(canRetryResearch({pendingSourceEvidence:{},sourceRequests:2,modelCalls:4,attempts:1}),false);assert.equal(canRetryResearch({sourcePlan:{},sourceRequests:2,modelCalls:3,attempts:1}),false);
});
test('production HTTP200: two completed IDs and one unfinished ID is uncertain, not three completed searches',()=>{
 const trace={};assert.throws(()=>accountTools({status:'completed',output:[tool('a'),tool('b'),tool('c','in_progress')]},2,trace),e=>e.code==='TOOL_LIFECYCLE_INCOMPLETE'&&e.detail==='TOOL_LIMIT_OUTCOME_UNKNOWN');
 assert.equal(trace.completed,2);assert.equal(trace.observedToolEvents,3);assert.equal(trace.outcomeUnknown,true);assert.deepEqual(trace.toolAccounting,{distinctIds:3,anonymous:0,conflicts:0,incomplete:1,responseCompleted:true,requestedLimit:2,reportedCalls:3,duplicateObservations:0,terminalCalls:2,dispatchUnknown:1,queued:0,inProgress:1,searching:0,otherPending:0});
 const task={code:'TOOL_LIFECYCLE_INCOMPLETE',sourceRequests:2,modelCalls:3,pendingSourceEvidence:{}};assert.equal(canRetryResearch(task),false);
});
test('same-ID lifecycle merges without counting another invocation; conflicting terminal states fail',()=>{
 const trace={};const calls=accountTools({status:'completed',output:[tool('a','in_progress'),tool('a'),tool('b')]},2,trace);assert.equal(calls.length,2);assert.equal(trace.completed,2);assert.equal(trace.toolAccounting.duplicateObservations,1);
 assert.throws(()=>accountTools({status:'completed',output:[tool('a'),tool('a','failed')]},2,{}),e=>e.code==='INVALID_TOOL_ACCOUNTING');
});
test('uncertain over-limit HTTP200 never extracts sources or retries fetch',async()=>{
 const original=globalThis.fetch,enabled=process.env.MINDLING_WEB_SEARCH;process.env.MINDLING_WEB_SEARCH='enabled';let count=0;
 globalThis.fetch=async()=>{count++;const payload=fixture.searchPayload();payload.output=payload.output.filter(t=>t.type!=='web_search_call');payload.output.unshift(tool('a'),tool('b'),tool('c','in_progress'));return Response.json(payload);};
 try{const trace={sourceCount:0};await assert.rejects(search({request:{topic:'public computing',mode:'FOUNDATION',freshness:false,scope:{criterion:null,geography:[],geographyMode:null,period:null,quantity:null}},queries:['public computing'],remainingCalls:2},'synthetic-only','opaque',new AbortController().signal,trace),e=>e.code==='TOOL_LIFECYCLE_INCOMPLETE');assert.equal(trace.sourceCount,0);assert.equal(count,1);assert.equal(trace.completed,2);}finally{globalThis.fetch=original;if(enabled===undefined)delete process.env.MINDLING_WEB_SEARCH;else process.env.MINDLING_WEB_SEARCH=enabled;}
});
