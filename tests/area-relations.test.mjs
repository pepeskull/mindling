import test from 'node:test';import assert from 'node:assert/strict';
import {graphData,layoutGraph} from '../src/memory/graph-data.js';
import {mergeProposal,commitHierarchy} from '../src/memory/knowledge-hierarchy.js';
import {semanticCandidates,validateSemanticResult,semanticSnapshot,semanticPairReceipt} from '../src/semantic/model-contract.js';
import {semanticWireContext,semanticWireSchemaFor,decodeSemanticWire} from '../src/semantic/model-wire.js';
import {persistAreaRelations} from '../src/semantic/area-relations.js';
import {reconcileAreaEvidence} from '../src/semantic/reconcile-area-evidence.js';
const memory=(id,category,content)=>({id,categoryId:id,category,content,source:'SERVICE',contentIntegrity:{version:1,status:'captured',length:content.length},analysis:{name:'mindling-learning-service',verification:'unverified-player-claim'},intelligence:{kind:'claim',current:true},relatedMemoryIds:[]});
const fixture=()=>({id:'isolated',energy:8,xp:12,pathways:['Developer'],memories:[memory('hockey','Ice hockey','Ice hockey is a type of sport.'),memory('sport','Sport','Sport includes ice hockey and association football.'),memory('nhl','National Hockey League','The National Hockey League is a professional ice hockey league.')]});
const id=(g,label)=>g.areas.find(a=>a.label===label).id;
function model(m,type='narrower-than'){
 const context=semanticCandidates(m,['hockey']),g=graphData(m);
 const result=decodeSemanticWire({version:1,relationships:[],areaRelationships:[{from:id(g,'Ice hockey'),to:id(g,'Sport'),type,pair:0,evidenceA:{first:0,last:0},evidenceB:{first:0,last:0},support:'supported',scopePreserved:true,reason:'Synthetic model assessment using supplied domain assertions.'}]},context);
 return {context,result,verdict:validateSemanticResult(result,context)};
}
test('previously unknown area reaches model with identity and exact evidence; organization never merges memories',()=>{
 const m=fixture(),before=structuredClone(m),g=graphData(m);assert.equal(mergeProposal(g,null,id(g,'Ice hockey'),id(g,'Sport')).valid,false);
 const {context,verdict}=model(m);assert(semanticWireContext(context).areas.some(a=>a.label==='Ice hockey'));assert(semanticWireSchemaFor(context).required.includes('areaRelationships'));
 assert.equal(verdict.areas.accepted.length,1);assert.deepEqual(persistAreaRelations(m,verdict.areas.accepted,g.areas,1),['AREA_PERSISTED']);
 assert.deepEqual(persistAreaRelations(m,verdict.areas.accepted,g.areas,2),['AREA_UNCHANGED']);
 const next=graphData(m),p=mergeProposal(next,null,id(next,'Sport'),id(next,'Ice hockey'));assert(p.valid);assert.equal(p.parentId,id(next,'Sport'));assert.deepEqual(p,mergeProposal(next,null,p.childId,p.parentId));
 const merged=commitHierarchy(m,next,p),projection=graphData(merged);assert.equal(projection.stats.canonical,3);assert.equal(projection.stats.areas,2);assert.equal(layoutGraph(projection).nodes.filter(n=>n.kind==='area').length,2);
 assert.deepEqual(merged.memories,before.memories);assert.deepEqual(merged.pathways,before.pathways);assert.equal(merged.energy,8);assert.equal(merged.xp,12);
 assert.equal(projection.areas.find(a=>a.id===p.parentId).descendantMemoryIds.length,2);assert.equal(projection.memories.filter(n=>n.recordId==='nhl').length,1);
});
test('association, equivalence, instances and parts cannot silently become a hierarchy',()=>{
 for(const type of ['related-to','equivalent-label','instance-of','part-of']){const m=fixture(),{verdict}=model(m,type);persistAreaRelations(m,verdict.areas.accepted,graphData(m).areas);const g=graphData(m);assert.equal(mergeProposal(g,null,id(g,'Ice hockey'),id(g,'Sport')).valid,false);}
});
test('reject missing evidence, ambiguity and stale revisions without rewriting provenance',()=>{
 const m=fixture(),{context,result}=model(m);result.areaRelationships[0].evidenceA.last=99;assert.equal(validateSemanticResult(result,context).areas.rejections[0].code,'AREA_EVIDENCE_INVALID');
 result.areaRelationships[0].evidenceA.last=0;result.areaRelationships[0].support='uncertain';assert.equal(validateSemanticResult(result,context).areas.accepted.length,0);
 const accepted=model(m).verdict.areas.accepted;persistAreaRelations(m,accepted,graphData(m).areas);const g=graphData(m),p=mergeProposal(g,null,id(g,'Sport'),id(g,'Ice hockey'));
 m.semanticAreaRelations.revision++;assert.throws(()=>commitHierarchy(m,graphData(m),p));
 m.memories[0].content+=' This classification is disputed.';assert.equal(graphData(m).areaRelations.length,0);assert.equal(persistAreaRelations(m,accepted,graphData(m).areas)[0],'AREA_STALE_EVIDENCE');
 const n=fixture(),good=model(n).verdict.areas.accepted;persistAreaRelations(n,[...good,{...good[0],from:good[0].to,to:good[0].from}],graphData(n).areas);const ng=graphData(n);assert.equal(mergeProposal(ng,null,id(ng,'Sport'),id(ng,'Ice hockey')).valid,false);
});
test('bounded old-record proof resolution is idempotent, domain-independent, and not keyword classification',()=>{
 const state={mind:fixture()},original=structuredClone(state.mind.memories);reconcileAreaEvidence(state);assert.equal(state.mind.semanticAreaRelations.records.length,1);const saved=JSON.stringify(state);reconcileAreaEvidence(state);assert.equal(JSON.stringify(state),saved);assert.deepEqual(state.mind.memories,original);
 for(const [child,parent]of [['Quantum mechanics','Science'],['Electric vehicles','Automobiles'],['Unseen domain','Unseen parent']]){const s={mind:{memories:[memory('a',child,`${child} is a type of ${parent}.`),memory('b',parent,'A separate retained assertion.')]}};reconcileAreaEvidence(s);const g=graphData(s.mind);assert(mergeProposal(g,null,id(g,child),id(g,parent)).valid);}
 for(const content of ['Ice hockey may be a type of sport.','Ice hockey is not a type of sport.','Ice hockey is a type of sport. This is disputed.','National Hockey League is an ice hockey league.']){const s={mind:fixture()};s.mind.memories[0].content=content;reconcileAreaEvidence(s);assert.equal(s.mind.semanticAreaRelations,undefined);}
});
test('existing worker persists area decisions in its authorized inference transaction with no extra call or reward',async()=>{
 const {runSemantic}=await import('../src/semantic/model-worker.js');const old=globalThis.fetch;let calls=0;
 let state={mind:{...fixture(),learningTasks:[{id:'research',status:'COMPLETED',knowledgeIds:['hockey'],modelCalls:3}]}};
 const engine={session:'offline',app:{get state(){return state;}},abort:new AbortController(),loadPermissions:async()=>({enabled:true,revision:1}),grant:()=>({}),assertLive:id=>assert.equal(id,state.mind.id),async patch(id,run,fn){const next=structuredClone(state);fn(next.mind.learningTasks[0],next);state=next;}};
 try{globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'/api/mindling/reason');const {id,context}=JSON.parse(options.body),proposed=model(state.mind).result;assert(context.areas);return Response.json({service:'mindling-reasoning-service',id,result:proposed});};
 await runSemantic(engine,state.mind.learningTasks[0]);assert.equal(calls,1);assert.equal(state.mind.semanticAreaRelations.records.length,1);assert.equal(state.mind.learningTasks[0].semanticAreaAnalysis.persisted,1);assert.equal(state.mind.learningTasks[0].modelCalls,4);
 state=JSON.parse(JSON.stringify(state));await runSemantic(engine,state.mind.learningTasks[0]);assert.equal(calls,1);assert.equal(state.mind.xp,12);assert.equal(state.mind.energy,8);
 }finally{globalThis.fetch=old;}
});
test('validated equivalent labels can resolve containment without combining identities; multi-area evidence stays separate',()=>{
 const m=fixture();m.memories.push(memory('alias','Hockey on ice','Hockey on ice denotes ice hockey.'));
 const g=graphData(m),base=model(m).verdict.areas.accepted[0];persistAreaRelations(m,[base,{...base,from:id(g,'Hockey on ice'),to:id(g,'Ice hockey'),type:'equivalent-label',direction:'symmetric',evidence:[{snapshot:semanticSnapshot(m.memories[3]),span:{start:0,end:m.memories[3].content.length,quote:m.memories[3].content}},base.evidence[0]],areas:g.areas.filter(a=>['Hockey on ice','Ice hockey'].includes(a.label)).map(({id,label})=>({id,label}))}],g.areas);
 const after=graphData(m),proposal=mergeProposal(after,null,id(g,'Hockey on ice'),id(g,'Sport'));assert(proposal.valid);assert.equal(proposal.basis.decisions.length,2);assert.equal(m.memories.length,4);
 assert.equal(mergeProposal(after,null,id(g,'Hockey on ice'),id(g,'Ice hockey')).valid,false);
 const parent=commitHierarchy(m,after,proposal);assert.equal(graphData(parent).stats.canonical,4);assert.equal(parent.semanticAreaRelations.records.length,2);
});
test('legacy memory associations do not veto bounded area reconsideration; unknown dispatch still blocks it',()=>{
 const m=fixture();m.memories[0].relatedMemoryIds=['sport'];m.memories[1].relatedMemoryIds=['hockey'];
 const base=semanticCandidates(m,['hockey'],{includeAreaReconsideration:true}),pair=base.pairs.find(p=>[p.a.id,p.b.id].includes('sport'));assert(pair);
 m.learningTasks=[{semanticAttempts:[{state:'OUTCOME_UNKNOWN',pairs:[semanticPairReceipt(pair)]}]}];assert(!semanticCandidates(m,['hockey'],{includeAreaReconsideration:true}).pairs.some(p=>semanticPairReceipt(p)===semanticPairReceipt(pair)));
 m.learningTasks[0].semanticAttempts[0]={state:'COMPLETED',pairs:[semanticPairReceipt(pair)],areaPairs:[semanticPairReceipt(pair)]};assert(!semanticCandidates(m,['hockey'],{includeAreaReconsideration:true}).pairs.some(p=>semanticPairReceipt(p)===semanticPairReceipt(pair)));
});
