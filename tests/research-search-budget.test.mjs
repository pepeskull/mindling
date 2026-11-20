import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { scenario } from './support/research-success-harness.mjs';
import { MAX_WEB_SEARCH_CALLS, webSearchLimit, remainingWebSearchCalls } from '../src/autonomous/research-budget.js';
import { canRetryResearch } from '../src/autonomous/service-diagnostics.js';
import { tasksFor } from '../src/autonomous/tasks.js';

const require=createRequire(import.meta.url);
const {searchPayload}=require('./support/research-success-fixture.cjs');

function reportWithCalls(completed, pending=false){
  const response=searchPayload();
  const [sourceAction,message]=response.output;
  const calls=Array.from({length:completed},(_,index)=>({
    ...sourceAction,
    id:'search-'+index,
    action:index===0?sourceAction.action:{type:'search',sources:[]}
  }));
  if(pending)calls.push({id:'pending-search',type:'web_search_call',status:'searching',action:{type:'search',sources:[]}});
  response.output=[...calls,message];
  return response;
}

for(const count of [1,2,3,4]){
  test(`a complete cited report can integrate ${count} confirmed tool calls within a four-call reservation`,async()=>{
    await scenario(async c=>{
      const fetch=globalThis.fetch,requests=[];
      globalThis.fetch=async(url,options)=>{
        if(url.endsWith('/responses'))requests.push(JSON.parse(options.body));
        return fetch(url,options);
      };
      await c.run();
      const saved=c.saved();
      assert.equal(requests.length,1);
      assert.equal(requests[0].max_tool_calls,MAX_WEB_SEARCH_CALLS);
      assert.match(requests[0].instructions,/stop and write the cited report as soon as enough evidence/);
      assert.equal(saved.status,'COMPLETED');
      assert.equal(saved.completedToolCalls,count);
      assert.equal(saved.sourceRequests,4);
      assert.equal(saved.researchExecution.reserved,4);
      assert.equal(saved.serviceDiagnostic.toolAccounting.reportedCalls,count);
      assert.equal(saved.serviceDiagnostic.providerOutput.requestedMaxToolCalls,4);
      assert.equal(saved.sourceReferences.length,3);
      assert.equal(saved.modelCalls,3);
      const before=JSON.stringify(c.app.state.mind.memories);
      assert.equal(c.app.state.mind.memories.length,3);
      c.app.state=JSON.parse(JSON.stringify(c.app.state));
      c.reopen().recover();
      await c.run();
      assert.equal(JSON.stringify(c.app.state.mind.memories),before);
      assert.equal(requests.length,1);
    },{autonomous:count!==2,acquisitionPayload:()=>reportWithCalls(count)});
  });
}

for(const count of [3,4]){
  test(`a pending observation alongside ${count} completed calls retains only quarantined citations and never redispatches`,async()=>{
    await scenario(async c=>{
      await c.run();
      const saved=c.saved();
      assert.equal(c.server.code,409);
      assert.equal(saved.serviceDiagnostic.detail,count===4?'TOOL_LIMIT_OUTCOME_UNKNOWN':'TOOL_LIFECYCLE_INCOMPLETE');
      assert.equal(saved.serviceDiagnostic.toolAccounting.reportedCalls,count+1);
      assert.equal(saved.serviceDiagnostic.toolAccounting.dispatchUnknown,1);
      assert.equal(saved.completedToolCalls,count);
      assert.equal(saved.sourceReferences.length,0);
      assert.equal(saved.researchObservation.sources.length,3);
      assert.equal(saved.pendingSourceEvidence,undefined);
      assert.equal(saved.researchExecution.outcomeUnknown,true);
      const calls=c.calls.length;
      c.app.state=JSON.parse(JSON.stringify(c.app.state));
      c.reopen().recover();
      await c.run();
      assert.equal(c.calls.length,calls);
      assert.equal(c.saved().sourceRequests,4);
      assert.equal(c.app.state.mind.memories.length,0);
    },{acquisitionPayload:()=>reportWithCalls(count,true)});
  });
}

test('a fifth confirmed tool operation is an overrun and cannot supply a checkpoint or memories',async()=>{
  await scenario(async c=>{
    await c.run();
    const saved=c.saved();
    assert.equal(saved.code,'TOOL_BUDGET_VIOLATION');
    assert.equal(saved.completedToolCalls,5);
    assert.equal(saved.sourceRequests,4);
    assert.equal(saved.researchExecution.outcomeUnknown,false);
    assert.equal(saved.pendingSourceEvidence,undefined);
    assert.equal(saved.researchObservation,undefined);
    assert.equal(canRetryResearch(saved),false);
    assert.equal(c.app.state.mind.memories.length,0);
  },{acquisitionPayload:()=>reportWithCalls(5)});
});

test('legacy two-call tasks remain readable with their original ceiling and unknown reservations',async()=>{
  await scenario(async c=>{
    delete c.saved().searchToolLimit;
    await c.run();
    const saved=c.saved();
    assert.equal(saved.sourceRequests,2);
    assert.equal(saved.researchExecution.reserved,2);
    assert.equal(webSearchLimit(saved),2);
    assert.equal(saved.serviceDiagnostic.providerOutput.requestedMaxToolCalls,2);
    const json=JSON.stringify(saved),calls=c.calls.length;
    c.app.state=JSON.parse(JSON.stringify(c.app.state));
    c.reopen().recover();
    await c.run();
    assert.equal(JSON.stringify(tasksFor(c.app.state.mind)[0]),json);
    assert.equal(c.calls.length,calls);
    assert.equal(remainingWebSearchCalls(saved),0);
    assert.equal(canRetryResearch({...saved,sourceRequests:1,code:'REQUEST_INTERRUPTED',researchObservation:undefined}),false);
    assert.equal(c.app.state.mind.memories.length,0);
  },{acquisitionPayload:()=>reportWithCalls(2,true)});
});

test('a claimed success over its local legacy reservation is rejected at receipt validation',async()=>{
  await scenario(async c=>{
    delete c.saved().searchToolLimit;
    await c.run();
    assert.equal(c.saved().code,'RECEIPT_VALIDATION_FAILED');
    assert.equal(c.saved().sourceRequests,2);
    assert.equal(c.app.state.mind.memories.length,0);
  },{mutate:(body,request)=>{
    if(request.mode!=='research-acquire')return;
    body.execution.completed=3;
    body.acquisition.requests=3;
  }});
});

test('an evaluation failure cannot attach a checkpoint over its local legacy reservation',async()=>{
  await scenario(async c=>{
    delete c.saved().searchToolLimit;
    await c.run();
    const saved=c.saved();
    assert.equal(saved.code,'RESPONSE_SERIALIZATION_ERROR');
    assert.equal(saved.retryBlockedReason,'CHECKPOINT_INVALID');
    assert.equal(saved.pendingSourceEvidence,undefined);
    assert.equal(saved.sourceRequests,2);
    assert.equal(canRetryResearch(saved),false);
    assert.equal(c.app.state.mind.memories.length,0);
  },{kind:'serialization',mutate:body=>{
    if(body.sourceCheckpoint)body.sourceCheckpoint.evidence.requests=3;
  }});
});
