import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {canRetryResearch} from '../src/autonomous/service-diagnostics.js';
const require=createRequire(import.meta.url);
const {search}=require('../src/server/research-information.cjs');
const {outputDiagnostics}=require('../src/server/research-output-diagnostics.cjs');

// Matches the supplied nine-item production ordering, statuses and counts.
// URLs/passages are authored fixtures, NOT recovered production evidence.
function payload({resolved=false,citation='completed',invalidRange=false}={}){
  const urls=['https://example.org/search-one','https://example.net/search-two'];
  const pendingURL='https://example.org/open-only';
  let text='';const annotations=[];
  for(const [i,url] of urls.entries()){
    if(text)text+='\n\n';
    text+='This synthetic passage describes a bounded example for source attribution checks. ';
    const start_index=text.length;text+='['+(i+1)+']';
    annotations.push({type:'url_citation',url:citation==='completed'?url:pendingURL,title:'Authored fixture',start_index:invalidRange?-1:start_index,end_index:text.length});
  }
  const reasoning=n=>({id:'item-'+n,type:'reasoning'});
  const tool=(n,count,url)=>({id:'item-'+n,type:'web_search_call',status:'completed',action:{type:'search',sources:Array.from({length:count},(_,i)=>({type:'url',url:i?url+'?reference='+i:url}))}});
  return {id:'resp_authored_nine_items',status:'completed',incomplete_details:null,output:[
    reasoning(1),tool(2,33,urls[0]),reasoning(3),tool(4,36,urls[1]),reasoning(5),
    {id:'item-6',type:'web_search_call',status:'searching',action:{type:'open_page',url:pendingURL}},
    reasoning(7),reasoning(8),{id:'item-9',type:'message',status:'completed',content:[{type:'output_text',text,annotations}]}
  ].filter((_,i)=>!resolved||i!==5)};
}
const input={request:{topic:'public source attribution',mode:'DEEP',freshness:false,scope:{criterion:null,geography:[],geographyMode:null,period:null,quantity:null}},queries:['public source attribution'],remainingCalls:2};
async function mocked(value,run){
  const previous=globalThis.fetch,enabled=process.env.MINDLING_WEB_SEARCH;let calls=0;
  process.env.MINDLING_WEB_SEARCH='enabled';
  globalThis.fetch=async()=>{calls++;return Response.json(value);};
  try{await run(trace=>search(input,'synthetic-only','opaque',new AbortController().signal,trace),()=>calls);}
  finally{globalThis.fetch=previous;if(enabled===undefined)delete process.env.MINDLING_WEB_SEARCH;else process.env.MINDLING_WEB_SEARCH=enabled;}
}
test('exact nine-item diagnostic shape reproduces production ordering and reference counts',()=>{
  const d=outputDiagnostics(payload(),2);
  assert.equal(d.responseStatus,'completed');assert.equal(d.incompleteDetailsPresent,false);assert.equal(d.omittedItems,0);
  assert.deepEqual(d.items.map(i=>[i.index,i.identity,i.type,i.status,i.action,i.sourceReferences,i.actionURL,i.citationReferences,i.textPresent]),[
    [0,1,'reasoning','other','other',0,false,0,false],
    [1,2,'web_search_call','completed','search',33,false,0,false],
    [2,3,'reasoning','other','other',0,false,0,false],
    [3,4,'web_search_call','completed','search',36,false,0,false],
    [4,5,'reasoning','other','other',0,false,0,false],
    [5,6,'web_search_call','searching','open_page',0,true,0,false],
    [6,7,'reasoning','other','other',0,false,0,false],
    [7,8,'reasoning','other','other',0,false,0,false],
    [8,9,'message','completed','other',0,false,2,true]
  ]);
});
test('identical production counters cannot distinguish completed-search citations from incomplete-open-only citations',()=>{
  assert.deepEqual(outputDiagnostics(payload(),2),outputDiagnostics(payload({citation:'pending'}),2));
  assert.deepEqual(outputDiagnostics(payload(),2),outputDiagnostics(payload({invalidRange:true}),2));
});
test('nine-item completed report cannot bypass unknown accounting even with matching search citations',async()=>{
  for(const citation of ['completed','pending']){
    await mocked(payload({citation}),async(run,calls)=>{
      const trace={sourceCount:0};
      await assert.rejects(run(trace),e=>e.code==='TOOL_LIFECYCLE_INCOMPLETE'&&e.detail==='TOOL_LIMIT_OUTCOME_UNKNOWN');
      assert.equal(trace.completed,2);assert.equal(trace.outcomeUnknown,true);assert.equal(trace.sourceCount,0);
      assert.equal(trace.toolAccounting.distinctIds,3);assert.equal(trace.toolAccounting.dispatchUnknown,1);
      assert.equal(trace.extraction,undefined);assert.equal(calls(),1);
      const task={code:'TOOL_LIFECYCLE_INCOMPLETE',sourceRequests:2,modelCalls:3,pendingSourceEvidence:{}};
      assert.equal(canRetryResearch(JSON.parse(JSON.stringify(task))),false);
    });
  }
});
test('fully accounted control retains matching cited passages but rejects open-only URLs and malformed ranges',async()=>{
  // This is a separate fully accounted response, never a transformation used by
  // production to drop unresolved calls from the incident response.
  for(const options of [{},{citation:'pending'},{invalidRange:true}]){
    await mocked(payload({...options,resolved:true}),async(run,calls)=>{
      const trace={};const result=await run(trace);
      assert.equal(trace.outcomeUnknown,false);assert.equal(result.requests,2);assert.equal(calls(),1);
      assert.equal(result.sources.length,Object.keys(options).length?0:2);
      if(options.citation)assert.equal(trace.extraction.dropped.NOT_IN_TOOL_SOURCES,2);
      if(options.invalidRange)assert.equal(trace.extraction.dropped.INVALID_CITATION_RANGE,2);
      for(const source of result.sources){assert.equal(source.type,'web-search-synthesis');assert.equal(source.status,'tool-cited');assert.match(source.hash,/^[a-f0-9]{64}$/);assert.equal(source.passages.length,1);}
    });
  }
});
