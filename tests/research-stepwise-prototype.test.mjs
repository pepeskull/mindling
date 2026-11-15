import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{step}=require('../src/server/research-stepwise-prototype.cjs'),{verify}=require('../src/server/research-checkpoint.cjs');
const request={topic:'public computing',mode:'FOUNDATION',freshness:false,scope:{criterion:null,geography:[],geographyMode:null,period:null,quantity:null}};
function response(n,{extra=false,empty=false,two=false}={}){
 const url=`https://example.org/source-${n}`,quote=n===2?'The synthetic system does not retain records after a restart.':'The synthetic system retains records after a restart.';
 return {id:'response-'+n,status:'completed',output:[{id:'search-'+n,type:'web_search_call',status:'completed',action:{type:'search',sources:[{type:'url',url}]}},...(two?[{id:'search-other',type:'web_search_call',status:'completed',action:{type:'search',sources:[]}}]:[]),...(extra?[{id:'pending',type:'web_search_call',status:'searching',action:{type:'open_page',url}}]:[]),{id:'message',type:'message',status:'completed',content:empty?[]:[{type:'output_text',text:quote+' [1]',annotations:[{type:'url_citation',url,title:'Authored fixture',start_index:quote.length+1,end_index:quote.length+4}]}]}]};
}
async function fixture(run){
 const before=globalThis.fetch,flag=process.env.MINDLING_STEPWISE_RESEARCH,web=process.env.MINDLING_WEB_SEARCH;
 process.env.MINDLING_STEPWISE_RESEARCH='prototype';process.env.MINDLING_WEB_SEARCH='enabled';
 let state={status:'READY',modelCalls:1,reservedTools:0,completedSteps:0},requests=0,next=response(1),failSave=false;
 const options={load:async()=>structuredClone(state),save:async value=>{if(failSave)throw Error('storage');state=structuredClone(value);},context:{request,queries:['public computing'],remainingCalls:2},originalId:'a'.repeat(64),apiKey:'offline-secret',model:'opaque',signal:new AbortController().signal,authorize:async()=>true};
 globalThis.fetch=async(url,opts)=>{requests++;assert.equal(state.status,'RESERVED');assert.equal(JSON.parse(opts.body).max_tool_calls,1);if(next instanceof Error)throw next;return Response.json(next);};
 try{await run({options,get state(){return state;},get requests(){return requests;},set next(v){next=v;},set failSave(v){failSave=v;}});}finally{globalThis.fetch=before;for(const [k,v] of [['MINDLING_STEPWISE_RESEARCH',flag],['MINDLING_WEB_SEARCH',web]])if(v===undefined)delete process.env[k];else process.env[k]=v;}
}
test('disabled by default; authorized one-step evidence is signed and reloaded without repeat',()=>fixture(async f=>{
 delete process.env.MINDLING_STEPWISE_RESEARCH;await assert.rejects(step(f.options),e=>e.detail==='STEPWISE_DISABLED');assert.equal(f.requests,0);
 process.env.MINDLING_STEPWISE_RESEARCH='prototype';await step(f.options);
 assert.equal(f.state.modelCalls,2);assert.equal(f.state.reservedTools,1);
 const checked=await verify(f.state.checkpoint,'offline-secret');assert.equal(checked.evidence.sources[0].responseId,'response-1');
 await step({...f.options});assert.equal(f.requests,1);
}));
test('explicit second evidence gap combines independent provenance and leaves only evaluation slot',()=>fixture(async f=>{
 await step(f.options);f.next=response(2);await step({...f.options,needSecond:true});
 assert.equal(f.requests,2);assert.equal(f.state.modelCalls,3);assert.equal(f.state.reservedTools,2);
 const sources=f.state.checkpoint.evidence.sources;assert.deepEqual(sources.map(s=>s.responseId),['response-1','response-2']);
 assert.match(sources[0].text,/retains/);assert.match(sources[1].text,/does not retain/);
 assert.equal(f.state.checkpoint.evidence.evaluation.claims.length,0); // Contradiction is not resolved by acquisition.
 await step({...f.options,needSecond:true});assert.equal(f.requests,2);
}));
test('one completed plus pending and two completed plus pending never yield a checkpoint',()=>fixture(async f=>{
 f.next=response(1,{extra:true});const result=await step(f.options);assert.equal(result.blocked,true);assert.equal(f.state.status,'UNKNOWN');assert.equal(f.state.checkpoint,undefined);
 await step(f.options);assert.equal(f.requests,1);
}));
test('two terminal plus pending remains blocked with a one-call ceiling',()=>fixture(async f=>{
 f.next=response(1,{extra:true,two:true});await step(f.options);assert.equal(f.state.status,'UNKNOWN');assert.equal(f.state.accounting.distinctIds,3);await step(f.options);assert.equal(f.requests,1);
}));
test('second-request interruption preserves first signed work and reservation without replay',()=>fixture(async f=>{
 await step(f.options);const checkpoint=f.state.checkpoint;f.next=Error('network');await step({...f.options,needSecond:true});
 assert.equal(f.state.status,'UNKNOWN');assert.deepEqual(f.state.checkpoint,checkpoint);assert.equal(f.state.reservedTools,2);assert.equal(f.state.modelCalls,3);
 await verify(checkpoint,'offline-secret');await step({...f.options,needSecond:true});assert.equal(f.requests,2);
}));
test('empty evidence is not fabricated and storage failure cannot dispatch',()=>fixture(async f=>{
 f.failSave=true;await assert.rejects(step(f.options),/storage/);assert.equal(f.requests,0);f.failSave=false;
 f.next=response(1,{empty:true});await step(f.options);assert.equal(f.state.checkpoint,null);assert.equal(f.state.completedSteps,1);
 await step(f.options);assert.equal(f.requests,1);
}));
test('authorization and inference exhaustion stop before dispatch',()=>fixture(async f=>{
 await assert.rejects(step({...f.options,authorize:async()=>false}),e=>e.detail==='AUTHORIZATION_REQUIRED');
 await assert.rejects(step({...f.options,load:async()=>({...f.state,modelCalls:3})}),e=>e.code==='BUDGET_EXHAUSTED');assert.equal(f.requests,0);
}));
test('concurrent callers cannot duplicate dispatch and saved reservation survives checkpoint write failure',()=>fixture(async f=>{
 let release;const gate=new Promise(resolve=>{release=resolve;});
 const first=step({...f.options,authorize:async()=>{await gate;return true;}});
 await assert.rejects(step(f.options),e=>e.code==='EVALUATION_IN_PROGRESS');release();await first;assert.equal(f.requests,1);
 f.next=response(2);let writes=0;
 await assert.rejects(step({...f.options,needSecond:true,save:async value=>{if(++writes===2)throw Error('checkpoint storage failed');await f.options.save(value);}}),/checkpoint storage failed/);
 assert.equal(f.state.status,'RESERVED');assert.equal(f.state.reservedTools,2);assert.equal(f.state.checkpoint.evidence.sources.length,1);
 await step({...f.options,needSecond:true});assert.equal(f.requests,2);
}));
test('changed identity or hypothesis binding cannot resume an authenticated checkpoint',()=>fixture(async f=>{
 await step(f.options);
 await assert.rejects(step({...f.options,originalId:'b'.repeat(64),needSecond:true}),e=>e.detail==='CHECKPOINT_CONTEXT_MISMATCH');assert.equal(f.requests,1);
}));
