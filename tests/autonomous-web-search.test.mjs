import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
import {validateAcquisition,validateRetrievalContext,INFORMATION_CAPABILITY,publicSourceURL} from '../src/autonomous/research-contract.js';
import {defaultPermissions,assertResearchGrant} from '../src/autonomous/research-permissions.js';
import {nextOpportunity,AUTONOMY,autonomousStatus} from '../src/autonomous/autonomous-schedule.js';
import {understandInput} from '../src/learning/input-understanding.js';
const require=createRequire(import.meta.url),information=require('../src/server/research-information.cjs'),{handler}=require('../src/server/mindling-reasoning.cjs');
const sha=text=>createHash('sha256').update(text).digest('hex');
const quote='Neurons communicate through electrical signals and release chemical messengers at synapses.';
const url='https://www.ninds.nih.gov/health-information/public-education/brain-basics';
const request={topic:'human brain and neuron communication',mode:'FOUNDATION',freshness:false,scope:{criterion:null,geography:[],geographyMode:null,period:null,quantity:null}};
const context={request,queries:['human neurons synapses signaling'],remainingCalls:2};
const evaluation={claims:[{sourceId:`web:${sha(url+'\n'+quote)}`,quote,category:'Biology',topic:'Neuroscience',reason:'Relevant source-cited report; not independent verification.',validAt:null}],limitations:['Search summaries are not raw source text.'],nextQuestion:'How do inhibitory synapses influence neural signaling'};
function payload({cite=true,search=true,status='completed'}={}){return {id:'resp_synthetic_local',status,output:[...(search?[{type:'web_search_call',status:'completed',action:{type:'search',queries:context.queries,sources:[{type:'url',url}]}}]:[]),{type:'message',status:'completed',content:[{type:'output_text',text:quote+' [1]',annotations:cite?[{type:'url_citation',start_index:quote.length+1,end_index:quote.length+4,title:'Synthetic NIH source fixture',url}]:[]}]}]};}
const originalFetch=globalThis.fetch;
let sequence=0;
async function api(mode,context,fetcher){
  const before={...process.env};process.env.SERVICE_API='synthetic-local-secret';process.env.SERVICE_MODEL='opaque-model';process.env.MINDLING_WEB_SEARCH='enabled';
  globalThis.fetch=fetcher;
  const req=Object.assign(new EventEmitter(),{method:'POST',headers:{'x-forwarded-for':`local-${++sequence}`,host:'localhost'},body:{id:sha(String(sequence)),mode,context}});
  const res=Object.assign(new EventEmitter(),{status(code){this.code=code;return this;},json(value){this.body=value;this.writableEnded=true;return this;}});
  try{await handler(req,res);return res;}finally{globalThis.fetch=originalFetch;for(const key of ['SERVICE_API','SERVICE_MODEL','MINDLING_WEB_SEARCH'])if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}
}
test('real Responses request shape, mandatory hosted search, same configured model and cited synthesis validation',async()=>{
  const calls=[];
  const response=await api('research-acquire',context,async(target,options)=>{
    calls.push({target,options});
    if(target.includes('/models/'))return Response.json({id:'opaque-model'});
    const body=JSON.parse(options.body);assert.equal(body.model,'opaque-model');
    if(target.endsWith('/responses')){
      assert.equal(body.tools[0].type,'web_search');assert.equal(body.tools[0].external_web_access,true);assert.equal(body.tool_choice,'required');assert.equal(body.max_tool_calls,2);assert.equal(body.store,false);assert.deepEqual(body.include,['web_search_call.action.sources']);assert.equal(options.redirect,'error');
      assert.deepEqual(JSON.parse(body.input),{request,queries:context.queries});return Response.json(payload());
    }
    assert.equal(target,'https://api.openai.com/v1/chat/completions');return Response.json({choices:[{message:{content:JSON.stringify(evaluation)}}]});
  });
  assert.equal(response.code,200,JSON.stringify(response.body));const result=validateAcquisition(response.body.acquisition);
  assert.equal(result.sources[0].text,quote);assert.equal(result.sources[0].type,'web-search-synthesis');assert.equal(result.sources[0].hash,sha(quote));assert.equal(result.responseId,'resp_synthetic_local');assert.equal(result.evaluation.claims.length,1);
  assert.equal(calls.length,3);assert.ok(calls.every(call=>call.target.startsWith('https://api.openai.com/')));
});
test('planning supports general/current questions and genuinely needed clarification without source fabrication',async()=>{
  const plan={plan:['Find current dated league evidence'],clarification:null,queries:['Allsvenskan standings Sweden'],sourceCategory:'web'};
  const res=await api('research',{...request,freshness:true},async(target)=>target.includes('/models/')?Response.json({id:'opaque-model'}):Response.json({choices:[{message:{content:JSON.stringify(plan)}}]}));
  assert.equal(res.code,200);assert.deepEqual(res.body.planning,plan);assert.equal(res.body.information.provider,'openai-web-search');
  const first=understandInput('Vilket lag i Sverige är bäst i fotboll just nu?','TALK');assert.equal(first.clarification.field,'metric');
  const next=understandInput(first.normalizedText,'TALK',{answers:{metric:'standings'}});assert.equal(next.clarification,null);assert.equal(next.timeSensitive,true);
});
test('unsupported, failed, incomplete, uncited and oversized hosted search never invent evidence',async t=>{
  for(const [name,response,expected] of [
    ['rate limit',()=>new Response('',{status:429}),'RATE_LIMITED'],
    ['unsupported',()=>Response.json({error:{}},{status:400}),'INFORMATION_UNSUPPORTED'],
    ['incomplete',()=>Response.json(payload({status:'incomplete'})),'INFORMATION_INCOMPLETE'],
    ['no tool',()=>Response.json(payload({search:false})),'INFORMATION_NO_SEARCH'],
    ['oversized',()=>new Response('x'.repeat(196609),{headers:{'content-type':'application/json'}}),'INFORMATION_RESPONSE_TOO_LARGE']
  ])await t.test(name,async()=>{const res=await api('research-acquire',context,async target=>target.includes('/models/')?Response.json({id:'opaque-model'}):response());assert.equal(res.body.error.code,expected);assert.equal(res.body.acquisition,undefined);});
  const res=await api('research-acquire',context,async target=>target.includes('/models/')?Response.json({id:'opaque-model'}):Response.json(payload({cite:false})));
  assert.equal(res.code,200);assert.equal(res.body.acquisition.sources.length,0);assert.equal(res.body.acquisition.evaluation.claims.length,0);
});
test('citations must belong to actual completed tool sources; failed tool calls cannot pass',async()=>{
  const mismatch=payload();mismatch.output[0].action.sources=[{type:'url',url:'https://www.nasa.gov/'}];
  const res=await api('research-acquire',context,async target=>target.includes('/models/')?Response.json({id:'opaque-model'}):Response.json(mismatch));
  assert.equal(res.code,200);assert.equal(res.body.acquisition.sources.length,0);
  const failed=payload();failed.output[0].status='failed';
  const rejected=await api('research-acquire',context,async target=>target.includes('/models/')?Response.json({id:'opaque-model'}):Response.json(failed));
  assert.equal(rejected.body.error.code,'INFORMATION_NO_SEARCH');
});
test('aborted hosted retrieval propagates cancellation and cannot return a candidate',async()=>{
  const original=process.env.MINDLING_WEB_SEARCH;process.env.MINDLING_WEB_SEARCH='enabled';const controller=new AbortController();
  globalThis.fetch=async(target,options)=>{assert.equal(options.signal,controller.signal);controller.abort();throw new DOMException('cancel','AbortError');};
  try{await assert.rejects(information.search(context,'synthetic-key','opaque-model',controller.signal),{name:'AbortError'});}finally{globalThis.fetch=originalFetch;if(original===undefined)delete process.env.MINDLING_WEB_SEARCH;else process.env.MINDLING_WEB_SEARCH=original;}
});
test('URL/source contracts reject local/credential targets, invented quotations and ungrounded dates',()=>{
  for(const unsafe of ['http://example.org','https://127.0.0.1/','https://localhost/','https://service.internal/','https://user:secret@example.org/','https://example.org/?token=secret'])assert.throws(()=>publicSourceURL(unsafe));
  assert.throws(()=>validateRetrievalContext({...context,tickets:['https://example.org']}));
  const source={id:evaluation.claims[0].sourceId,provider:'openai-web-search',url,title:'NIH fixture',domain:new URL(url).hostname,publishedAt:null,observedAt:Date.now(),type:'web-search-synthesis',status:'tool-cited',text:quote,hash:sha(quote)};
  const acquisition={provider:'openai-web-search',responseId:'resp_local',sources:[source],requests:1,bytes:1000,evaluation};
  assert.doesNotThrow(()=>validateAcquisition(acquisition));
  assert.throws(()=>validateAcquisition({...acquisition,evaluation:{...evaluation,claims:[{...evaluation.claims[0],quote:'A completely fabricated and unsupported factual assertion about neurons.'}]}}));
  assert.throws(()=>validateAcquisition({...acquisition,evaluation:{...evaluation,claims:[{...evaluation.claims[0],validAt:'2026-10-30'}]}}));
});
test('single global grant does not inherit older provider/planning permissions and revocation fences commits',()=>{
  const prefs=defaultPermissions('mind');assert.equal(prefs.enabled,false);
  const grant={mindlingId:'mind',capability:INFORMATION_CAPABILITY,revision:1};
  assert.throws(()=>assertResearchGrant(grant,[{id:'mindling-planning-access:mind',enabled:true,revision:1}]));
  assert.doesNotThrow(()=>assertResearchGrant(grant,[{...prefs,enabled:true,revision:1}]));
  assert.throws(()=>assertResearchGrant(grant,[{...prefs,enabled:false,revision:2}]));
});
test('autonomous initiation and follow-ups use persisted daily budgets, cooldown and current canonical areas',()=>{
  const now=Date.now(),mind={id:'mind',memories:[],pathways:['Developer'],learningTasks:[]};
  assert.equal(nextOpportunity(mind,now),'Technology');
  mind.learningTasks=[{engineVersion:4,status:'COMPLETED',topic:'Technology',nextQuestion:'How do databases ensure atomicity',updatedAt:now}];
  assert.equal(nextOpportunity(mind,now),'How do databases ensure atomicity');
  mind.autonomousLearning={day:new Date(now).toISOString().slice(0,10),started:AUTONOMY.dailyTasks,nextAt:0};assert.equal(nextOpportunity(mind,now),null);
  mind.autonomousLearning={day:'2000-01-01',started:3,nextAt:now+1};assert.equal(nextOpportunity(mind,now),null);
  const privateCategory={...mind,autonomousLearning:undefined,pathways:[],learningTasks:[],memories:[{id:'private',content:'A private retained claim.',category:'Sensitive client dealings'}]};assert.equal(nextOpportunity(privateCategory,now),null);
  assert.equal(autonomousStatus({preferences:{enabled:false}}),'PAUSED');
  assert.equal(autonomousStatus({preferences:{enabled:true},app:{state:{mind:{learningTasks:[]}}}}),'IDLE');
});
