import test from 'node:test';import assert from 'node:assert/strict';import fixture from './support/knowledge-intelligence-fixture.cjs';
import {reconcileSemanticConnections,CONNECTION_LIMITS} from '../src/semantic/memory-connections.js';
import {graphData,layoutGraph,filterGraph,memoryNodeId} from '../src/memory/graph-data.js';
import {memoryLabel} from '../src/memory/memory-label.js';
import {createSandbox,newMindling,learn} from '../src/preview/sandbox/engine.js';
import {correctMemory} from '../src/learning/memory-corrections.js';
import {currentMemoryVersion} from '../src/learning/correction-content.js';
const state=()=>{const s=newMindling(createSandbox(),{id:'realistic',confirmed:true});s.mind.memories=structuredClone(fixture.records);return s;};
const decision=record=>({version:2,relationship:'NEW_MEMORY',operation:'CREATE_NEW',responseAction:'ACKNOWLEDGE',kind:'claim',certainty:'asserted',concept:record.topic,category:record.category,categoryId:'',topic:record.topic,relatedMemoryId:'',confidence:.96});
test('incident multi-sentence claims link explicit actors/operations across categories, sessions and topics; unrelated knowledge does not',()=>{
 const s=state(),before=structuredClone(s);reconcileSemanticConnections(s);const byId=new Map(s.mind.memories.map(m=>[m.id,m]));
 for(const [a,b] of [['tx','validation'],['tx','blocks'],['validation','consensus'],['solana','launch'],['game','feedback']]){
  assert.ok(byId.get(a).relatedMemoryIds?.includes(b),`${a} → ${b}`);assert.ok(byId.get(b).relatedMemoryIds.includes(a));
 }
 assert.equal(byId.get('unrelated').relatedMemoryIds,undefined);for(const m of s.mind.memories){assert.ok((m.semanticAssociations?.length||0)<=CONNECTION_LIMITS.links);if(['game','feedback'].includes(m.id))assert.ok(m.relatedMemoryIds.every(id=>['game','feedback'].includes(id)));const original=before.mind.memories.find(v=>v.id===m.id),copy={...m};delete copy.relatedMemoryIds;delete copy.semanticAssociations;assert.deepEqual(copy,original);}
 const once=structuredClone(s);reconcileSemanticConnections(s);assert.deepEqual(s,once);const reloaded=JSON.parse(JSON.stringify(s));reconcileSemanticConnections(reloaded);assert.deepEqual(reloaded,s);
});
test('Teach and Deep formation independently connect real multi-sentence claims through the shared commit path',()=>{
 let s=newMindling(createSandbox(),{id:'new-sessions',confirmed:true});for(const [i,r] of fixture.records.slice(0,2).entries())s=learn(s,{id:r.id,text:r.content,activity:i?'DEEP_TRAINING':'TEACH',assessment:decision(r)});
 assert.ok(s.mind.memories[0].relatedMemoryIds.includes('validation'));assert.equal(s.mind.lifetimeXP,10);assert.equal(s.mind.history.reduce((n,e)=>n+e.xp,0),10);assert.equal(s.mind.energy.remaining,5);
});
test('homonyms, weak category words, negation, speculation, fiction and unresolved contradictions never establish inferred links',()=>{
 const s=state();s.mind.memories=[{id:'a',content:'Token contracts process transactions.',category:'Computing',topic:'Token transactions'},{id:'b',content:'Token parsers validate transactions.',category:'Language',topic:'Token transactions'}];reconcileSemanticConnections(s);assert.ok(s.mind.memories.every(m=>!m.relatedMemoryIds));
 for(const prefix of ['Perhaps ','In a fictional world, ','']){const t=state();t.mind.memories=[{...fixture.records[0],id:'a',content:prefix+fixture.transaction,...(!prefix?{contradictions:[{status:'unresolved'}]}:{})},fixture.records[1]];reconcileSemanticConnections(t);assert.ok(t.mind.memories.every(m=>!m.relatedMemoryIds));}
});
test('graph audits separate hierarchy, exact historical links and proven same-submission grouping from genuine stored associations',()=>{
 const memories=[{...fixture.records[6],id:'game',submissionId:'one',coSubmittedMemoryIds:['tx'],relatedMemoryIds:['tx','manual']},{...fixture.records[0],submissionId:'one',coSubmittedMemoryIds:['game'],relatedMemoryIds:['game'],supersededBy:'new'},{...fixture.records[1],id:'new',correctsMemoryId:'tx',relatedMemoryIds:['tx']},{...fixture.records[7],id:'manual',relatedMemoryIds:['game']}];
 memories[0].semanticAssociations=[null];memories[0].modelAssociations=[null];const before=structuredClone(memories),g=graphData({memories});assert.equal(g.stats.associations,1);assert.equal(g.edges.filter(e=>e.kind==='association').length,1);assert.equal(g.edges.find(e=>e.kind==='association').sourceMemoryIds.join(','),'game,manual');assert.equal(g.edges.filter(e=>e.kind==='co-submitted').length,1);assert.equal(g.edges.filter(e=>e.kind==='history').length,1);
 assert.ok(g.edges.every(e=>e.origin&&Array.isArray(e.sourceMemoryIds)&&typeof e.persisted==='boolean'));assert.deepEqual(memories,before);
 // Explicit reviewed associations remain associations even between versioned records.
 memories[1].modelAssociations=[{memoryId:'new',operation:'LINK_TO_EXISTING'}];assert.equal(graphData({memories}).stats.associations,2);
});
test('display labels use actual subjects for generic topics without rewriting knowledge or leaking provenance',()=>{
 const m=structuredClone(fixture.records[6]);assert.equal(memoryLabel(m).title,'video game');assert.equal(m.topic,'Definition');const graph=graphData({memories:[m]});assert.equal(graph.nodes.find(n=>n.kind==='topic').displayLabel,'video game');
 assert.equal(memoryLabel({content:'???',topic:'Definition',category:''}).title,'Definition');
 const s=state();reconcileSemanticConnections(s);const g=graphData(s.mind),layout=layoutGraph(filterGraph(g));assert.ok(layout.width<1400&&layout.height<1200);assert.ok(Math.max(...layout.nodes.map(n=>n.r))/Math.min(...layout.nodes.map(n=>n.r))<=2);assert.equal(layout.edges.filter(e=>e.kind==='association').length,g.stats.associations);assert.ok(layout.edges.some(e=>e.from===memoryNodeId('validation')&&e.to===memoryNodeId('consensus')||e.from===memoryNodeId('consensus')&&e.to===memoryNodeId('validation')));
});
test('real incident correction activates a user version, preserves evidence, recalculates automatic links, and no-ops after reload',async()=>{
 const old=globalThis.fetch,s=state();const root=s.mind.memories[0];root.research={taskId:'task',sourceURL:'https://ethereum.org/developers/docs/transactions?utm_source=openai',observedAt:Date.parse('2026-11-04T16:56:12.870Z'),evidenceText:fixture.transaction,quoteHash:'a'.repeat(64)};root.content=`Source observation (2026-11-04T16:56:12.870Z) from ${root.research.sourceURL}: ${fixture.transaction}`;
 reconcileSemanticConnections(s);const original=structuredClone(root),app={state:s,async change(reducer){this.state=reducer(structuredClone(this.state));}};
 globalThis.fetch=async()=>Response.json({service:'mindling-learning-service',assessment:decision(fixture.records[0])});
 try{const result=await correctMemory(app,{memoryId:'tx',text:fixture.corrected}),active=currentMemoryVersion(app.state.mind.memories,'tx');assert.equal(active.id,result.memoryId);assert.equal(active.research,undefined);assert.equal(active.provenance.source,'player');assert.deepEqual(app.state.mind.memories[0].research,original.research);assert.equal(app.state.mind.memories[0].content,original.content);assert.ok(active.relatedMemoryIds.includes('validation'));assert.ok(!active.semanticAssociations.some(e=>e.memoryId==='tx'));assert.equal(app.state.mind.energy.remaining,8);assert.equal(app.state.mind.lifetimeXP,3);assert.equal(app.state.mind.history.at(-1).concept,fixture.records[0].topic);
 app.state=JSON.parse(JSON.stringify(app.state));const before=structuredClone(app.state);assert.equal((await correctMemory(app,{memoryId:active.id,text:fixture.corrected})).changed,false);assert.deepEqual(app.state,before);
 globalThis.fetch=async()=>Response.json({error:{code:'ANALYSIS_UNAVAILABLE'}},{status:502});await assert.rejects(correctMemory(app,{memoryId:active.id,text:fixture.corrected+' More context.'}));assert.deepEqual(app.state,before);
 }finally{globalThis.fetch=old;}
});
