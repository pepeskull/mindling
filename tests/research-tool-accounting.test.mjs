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

test('distinct pending IDs stay unknown for every provider pending status and output order',()=>{
 for(const status of ['queued','in_progress','searching','incomplete']){
  const items=[tool('one'),tool('two'),{id:'three',type:'web_search_call',status}];
  for(const output of [items,[items[2],items[0],items[1]],items.toReversed()]){
   const trace={};
   assert.throws(()=>accountTools({status:'completed',max_tool_calls:2,output},2,trace),e=>e.code==='TOOL_LIFECYCLE_INCOMPLETE'&&e.detail==='TOOL_LIMIT_OUTCOME_UNKNOWN');
   assert.equal(trace.toolAccounting.distinctIds,3);assert.equal(trace.toolAccounting.duplicateObservations,0);
   assert.equal(trace.toolAccounting.terminalCalls,2);assert.equal(trace.toolAccounting.dispatchUnknown,1);
   assert.equal(trace.completed,2);assert.equal(trace.outcomeUnknown,true);
  }
 }
});
test('same-ID announcements reconcile independently of order; distinct IDs are not deduplicated by identical action',()=>{
 for(const output of [
  [tool('one','searching'),tool('one'),tool('two')],
  [tool('two'),tool('one'),tool('one','searching')]
 ]){
  const trace={};assert.equal(accountTools({status:'completed',output},2,trace).length,2);
  assert.equal(trace.toolAccounting.distinctIds,2);assert.equal(trace.toolAccounting.duplicateObservations,1);assert.equal(trace.outcomeUnknown,false);
 }
 // Identical queries/actions cannot prove one invocation when IDs differ.
 const trace={};assert.throws(()=>accountTools({status:'completed',output:[tool('one'),tool('two'),tool('three','searching')]},2,trace),e=>e.detail==='TOOL_LIMIT_OUTCOME_UNKNOWN');
 assert.equal(trace.toolAccounting.distinctIds,3);
 const mixed={};assert.throws(()=>accountTools({status:'completed',output:[tool('one'),tool('two','failed'),tool('three','searching')]},2,mixed),e=>e.detail==='TOOL_LIMIT_OUTCOME_UNKNOWN');
 assert.equal(mixed.completed,1);assert.equal(mixed.failed,1);assert.equal(mixed.toolAccounting.terminalCalls,2);
});
test('ordered provider diagnostics retain reference presence without leaking content or certifying incomplete evidence',()=>{
 const secret='private-query-source-key';
 const a=tool(secret),b=tool('second'),c=tool('third','searching');
 a.action.sources=[{url:secret,title:secret}];c.action.sources=[{url:secret}];
 const trace={};
 assert.throws(()=>accountTools({status:'completed',incomplete_details:{reason:secret},output:[a,b,c,{type:'message',id:secret,status:'completed',content:[{type:'output_text',text:secret,annotations:[{type:'url_citation',url:secret}]}]}]},2,trace),e=>e.detail==='TOOL_LIMIT_OUTCOME_UNKNOWN');
 const d=trace.providerOutput;
 assert.equal(d.requestedMaxToolCalls,2);assert.equal(d.responseStatus,'completed');
 assert.deepEqual(d.items.map(i=>i.identity),[1,2,3,1]);
 assert.deepEqual(d.items.map(i=>i.status),['completed','completed','searching','completed']);
 assert.equal(d.items[0].sourceReferences,1);assert.equal(d.items[2].sourceReferences,1);
 assert.equal(d.items[3].citationReferences,1);assert.equal(d.items[3].textPresent,true);
 assert.equal(d.incompleteDetailsPresent,true);assert.equal(d.incompleteReason,'other');
 assert.equal(JSON.stringify(d).includes(secret),false);
 const diagnostic={correlationId:'a'.repeat(64),operation:'research-acquire',phase:'INFORMATION',endpoint:'responses',upstreamStatus:200,errorCategory:'TOOL_LIFECYCLE_INCOMPLETE',detail:'TOOL_LIMIT_OUTCOME_UNKNOWN',durationMs:1,searchRequested:true,searchDispatched:true,searchCompleted:true,completed:2,failed:0,outcomeUnknown:true,sourceCount:0,fallbackReason:'none',modelConfirmed:true,providerOutput:d};
 assert.deepEqual(validateServiceDiagnostic(JSON.parse(JSON.stringify(diagnostic))),diagnostic);
 assert.throws(()=>validateServiceDiagnostic({...diagnostic,providerOutput:{...d,raw:secret}}));
 assert.equal(canRetryResearch({code:diagnostic.errorCategory,pendingSourceEvidence:{},sourceRequests:2,modelCalls:3}),false);
});
test('provider diagnostics bound output and preserve repeated observation identity',()=>{
 const trace={};accountTools({status:'completed',output:[tool('same'),tool('same'),...Array.from({length:65},()=>({type:'private',status:'private'}))]},2,trace);
 assert.equal(trace.providerOutput.items.length,64);assert.equal(trace.providerOutput.omittedItems,3);
 assert.deepEqual(trace.providerOutput.items.slice(0,2).map(i=>i.identity),[1,1]);
 assert.equal(trace.providerOutput.items[2].type,'other');
});
