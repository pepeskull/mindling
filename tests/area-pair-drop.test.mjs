import test from 'node:test';import assert from 'node:assert/strict';
import {areaPairPlan,areaPairSchema,validateAreaPairResult,combineAreaResults} from '../src/semantic/area-pair-contract.js';
import {connectAreas} from '../src/semantic/area-pair-worker.js';
import {graphData} from '../src/memory/graph-data.js';
import {defaultPermissions,assertResearchGrant} from '../src/autonomous/research-permissions.js';
import {EventEmitter} from 'node:events';import {createRequire} from 'node:module';
const {handler}=createRequire(import.meta.url)('../src/server/mindling-reasoning.cjs');
const memory=(id,categoryId,category,content)=>({id,categoryId,category,content,source:'SERVICE',contentIntegrity:{version:1,status:'captured',length:content.length},analysis:{name:'mindling-learning-service',verification:'unverified-player-claim'},intelligence:{kind:'claim',current:true},relatedMemoryIds:[]});
function setup(labels=['Video games','Game engines'],count=2){let prefs={...defaultPermissions('area-test'),enabled:true},calls=0;
 const app={state:{mind:{id:'area-test',life:{lifeState:'ALIVE'},categories:[],memories:labels.flatMap((label,side)=>Array.from({length:count},(_,i)=>memory(`${side}-${i}`,`${side}`,label,`${label} fixture claim ${i}.`))),energy:8,xp:0}},store:{async researchPermissions(){return prefs;}},async change(fn,opts={}){assertResearchGrant(opts.researchGrant,[prefs]);const s=fn(structuredClone(this.state));if(app.failSave&&s.mind.semanticAreaRelations)throw Error('Storage');this.state=s;}};
 const ids=graphData(app.state.mind).areas.map(a=>a.id);return {app,ids,prefs:v=>prefs={...prefs,...v},calls:()=>calls,fetch:async(url,options)=>{calls++;const b=JSON.parse(options.body);assert.equal(b.mode,'area-pair');return Response.json({service:'mindling-reasoning-service',id:b.id,result:proposal('RELATED')});}};}
function proposal(decision,parent='NONE'){return {decision,parent,support:'supported',scopePreserved:true,reason:'Synthetic model decision supported by the supplied fixture.',citations:['A','B'].map(area=>({area,memory:0,first:0,last:0}))};}
async function mocked(fn){const old=globalThis.fetch;try{await fn();}finally{globalThis.fetch=old;}}
test('full evidence reaches dedicated area contract; requested pairs persist without merging memories',()=>mocked(async()=>{
 for(const labels of [['Video games','Game engines'],['Game engines','Video game development'],['Finance','Stock trading']]){
  const h=setup(labels),before=structuredClone(h.app.state.mind.memories);globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body);assert.equal(body.context.areas.reduce((n,a)=>n+a.memories.length,0),4);return h.fetch(url,options);};
  assert.equal((await connectAreas(h.app,h.ids,'area-test')).code,'RELATED');assert.deepEqual(h.app.state.mind.memories,before);assert.equal(graphData(h.app.state.mind).areaRelations.length,1);assert(graphData(h.app.state.mind).edges.some(e=>e.origin==='semantic-area'));assert.equal(h.app.state.mind.knowledgeHierarchy,undefined);
  h.app.state=JSON.parse(JSON.stringify(h.app.state));assert.equal((await connectAreas(h.app,[...h.ids].reverse(),'area-test')).code,'RELATED');assert.equal(h.calls(),1);
 }
}));
test('overlap, containment and unrelated outcomes stay distinct',()=>mocked(async()=>{
 for(const decision of ['OVERLAPS','CONTAINS','UNRELATED','INSUFFICIENT_EVIDENCE']){const h=setup(),before=structuredClone(h.app.state.mind.memories);globalThis.fetch=async(_,o)=>Response.json({service:'mindling-reasoning-service',id:JSON.parse(o.body).id,result:proposal(decision,decision==='CONTAINS'?'A':'NONE')});assert.equal((await connectAreas(h.app,h.ids,'area-test')).code,decision);assert.deepEqual(h.app.state.mind.memories,before);const g=graphData(h.app.state.mind);assert.equal(g.areaRelations.length,['OVERLAPS','CONTAINS'].includes(decision)?1:0);if(decision==='CONTAINS')assert.equal(h.app.state.mind.knowledgeHierarchy.links.length,1);}
}));
test('bad citations, unsupported claims and invalid parent directions cannot pass validation',()=>{const h=setup(),c=areaPairPlan(h.app.state.mind,h.ids).stages[0];for(const mutate of [r=>r.citations[0].memory=100,r=>r.citations[0].last=100,r=>r.support='uncertain',r=>r.scopePreserved=false,r=>r.parent='A',r=>r.citations.pop()]){const r=proposal('RELATED');mutate(r);assert.throws(()=>validateAreaPairResult(r,c));}});
test('all evidence is batched even when a historical daily ledger is full',()=>mocked(async()=>{
 const h=setup(undefined,13);globalThis.fetch=h.fetch;
 const plan=areaPairPlan(h.app.state.mind,h.ids);assert.equal(plan.stages.length,4);
 assert.equal(new Set(plan.stages.flatMap(c=>c.areas.flatMap(a=>a.memories.map(m=>m.id)))).size,26);
 h.app.state.mind.semanticLedger={day:new Date().toISOString().slice(0,10),reserved:50};
 assert.equal((await connectAreas(h.app,h.ids,'area-test')).code,'RELATED');assert.equal(h.calls(),4);
 h.app.state=JSON.parse(JSON.stringify(h.app.state));assert.equal((await connectAreas(h.app,h.ids,'area-test')).code,'RELATED');
 assert.equal(h.calls(),4);assert.equal(graphData(h.app.state.mind).areaRelations.length,1);
}));
test('partial containment cannot be generalized into a global parent',()=>{const h=setup(undefined,13),plan=areaPairPlan(h.app.state.mind,h.ids),results=plan.stages.map(c=>validateAreaPairResult(proposal('CONTAINS','A'),c));results[1]=validateAreaPairResult(proposal('RELATED'),plan.stages[1]);assert.equal(combineAreaResults(results,plan).decision,'INSUFFICIENT_EVIDENCE');});
test('concurrency, unknown transport and API rejection preserve reservations',()=>mocked(async()=>{
 const h=setup();globalThis.fetch=h.fetch;const results=await Promise.all([connectAreas(h.app,h.ids,'area-test'),connectAreas(h.app,h.ids,'area-test')]);assert.equal(h.calls(),1);assert(results.some(r=>r.code==='RELATED'));
 for(const api of [false,true]){const x=setup();let calls=0;globalThis.fetch=async()=>{calls++;if(api)return Response.json({error:{code:'API_FAILURE'}},{status:502});throw TypeError('network');};assert.equal((await connectAreas(x.app,x.ids,'area-test')).code,api?'API_FAILURE':'OUTCOME_UNKNOWN');x.app.state=JSON.parse(JSON.stringify(x.app.state));assert.equal((await connectAreas(x.app,x.ids,'area-test')).code,'ALREADY_ASSESSED');assert.equal(calls,1);assert.equal(x.app.state.mind.areaPairAttempts[0].steps.length,1);}
}));
test('stale evidence, revoked grant, identity switch and persistence rollback leave memories and graph unchanged',()=>mocked(async()=>{
 for(const fault of ['stale','permission','identity','storage']){const h=setup();globalThis.fetch=async(...args)=>{const response=await h.fetch(...args);if(fault==='stale')h.app.state.mind.memories[0].content+=' Changed.';if(fault==='permission')h.prefs({enabled:false,revision:1});if(fault==='identity')h.app.state.mind.id='different';if(fault==='storage')h.app.failSave=true;return response;};assert.notEqual((await connectAreas(h.app,h.ids,'area-test')).code,'RELATED');assert.equal(h.app.state.mind.semanticAreaRelations,undefined);assert.equal(h.app.state.mind.areaPairAttempts[0].steps.length,1);assert.equal(h.app.state.mind.energy,8);}
}));
test('new evidence invalidates a stored area association instead of silently reusing its decision',()=>mocked(async()=>{const h=setup();globalThis.fetch=h.fetch;await connectAreas(h.app,h.ids,'area-test');h.app.state.mind.memories.push(memory('new','0','Video games','New canonical scope.'));assert.equal(graphData(h.app.state.mind).areaRelations.length,0);}));
test('actual server builds standalone strict area request and validates mocked provider output',async()=>{
 const old=globalThis.fetch,warn=console.warn,key=process.env.SERVICE_API,model=process.env.SERVICE_MODEL;process.env.SERVICE_API='synthetic-key';process.env.SERVICE_MODEL='configured-model';console.warn=()=>{};
 let calls=0;globalThis.fetch=async(url,options)=>{if(url.includes('/models/'))return Response.json({id:'configured-model'});calls++;const b=JSON.parse(options.body);assert.deepEqual(b.response_format.json_schema.schema,areaPairSchema);assert.equal(b.response_format.json_schema.strict,true);assert.equal(b.response_format.json_schema.name,'mindling_area_pair');assert.equal(b.max_completion_tokens,2600);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(proposal('RELATED'))}}]});};
 try{const h=setup(),req=Object.assign(new EventEmitter(),{method:'POST',headers:{host:'localhost','x-forwarded-for':'area-contract'},body:{id:'a'.repeat(64),mode:'area-pair',context:areaPairPlan(h.app.state.mind,h.ids).stages[0]}}),res=Object.assign(new EventEmitter(),{status(n){this.code=n;return this;},json(v){this.body=v;this.writableEnded=true;return this;}});await handler(req,res);assert.equal(res.code,200);assert.equal(res.body.result.decision,'RELATED');assert.equal(calls,1);}finally{globalThis.fetch=old;console.warn=warn;for(const [k,v] of [['SERVICE_API',key],['SERVICE_MODEL',model]])if(v===undefined)delete process.env[k];else process.env[k]=v;}
});

test('containment cycles roll back both relationship and hierarchy writes',()=>mocked(async()=>{const h=setup();h.app.state.mind.knowledgeHierarchy={version:1,revision:1,links:[{parentId:h.ids[1],childId:h.ids[0]}]};const before=structuredClone(h.app.state.mind);globalThis.fetch=async(_,o)=>Response.json({service:'mindling-reasoning-service',id:JSON.parse(o.body).id,result:proposal('CONTAINS','A')});assert.equal((await connectAreas(h.app,h.ids,'area-test')).code,'CONFLICT');assert.equal(h.app.state.mind.semanticAreaRelations,undefined);assert.deepEqual(h.app.state.mind.knowledgeHierarchy,before.knowledgeHierarchy);assert.deepEqual(h.app.state.mind.memories,before.memories);}));
test('oversized evidence never silently truncates or dispatches, and explicit consent is required',()=>mocked(async()=>{const h=setup(undefined,97);globalThis.fetch=h.fetch;assert.equal((await connectAreas(h.app,h.ids,'area-test')).code,'EVIDENCE_LIMIT');assert.equal(h.calls(),0);const x=setup();x.prefs({enabled:false});globalThis.fetch=x.fetch;assert.equal((await connectAreas(x.app,x.ids,'area-test')).code,'PERMISSION_REQUIRED');assert.equal(x.calls(),0);}));

test('a correlated rate-limit receipt preserves completed stages and permits a later explicit continuation',()=>mocked(async()=>{
 const h=setup(undefined,13);let attempts=0;
 globalThis.fetch=async(url,options)=>{
  const {id}=JSON.parse(options.body);
  if(++attempts===2)return Response.json({service:'mindling-reasoning-service',id,inferenceDispatched:false,error:{code:'RATE_LIMITED'}},{status:429});
  return h.fetch(url,options);
 };
 const paused=await connectAreas(h.app,h.ids,'area-test');
 assert.equal(paused.code,'ANALYSIS_PAUSED');assert.equal(paused.completed,1);
 assert.equal(h.app.state.mind.areaPairAttempts[0].steps[1].state,'DEFERRED');
 h.app.state=JSON.parse(JSON.stringify(h.app.state));
 assert.equal((await connectAreas(h.app,h.ids,'area-test')).code,'ANALYSIS_PAUSED');
 assert.equal(attempts,2);
 h.app.state.mind.areaPairAttempts[0].steps[1].retryAt=0;
 h.app.state.mind.semanticDispatch.until=0;
 assert.equal((await connectAreas(h.app,h.ids,'area-test')).code,'RELATED');
 assert.equal(h.calls(),4);
}));
