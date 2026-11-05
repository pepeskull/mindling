import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {semanticCandidates,semanticCandidateReport,semanticPairReceipt,validateSemanticResult,persistSemantic,VERSION} from '../src/semantic/model-contract.js';
import {semanticCoverage} from '../src/semantic/coverage.js';
import {runSemantic} from '../src/semantic/model-worker.js';
import {features} from '../src/learning/text.js';
globalThis.crypto??=webcrypto;
const hash=t=>createHash('sha256').update(t).digest('hex');
const memory=(content,i)=>({id:String(i),content,category:'area'+i,topic:'topic'+i,source:'AUTONOMOUS',research:{sourceHash:hash(content),quoteHash:hash(content),sourceURL:'https://example.org/'+i,observedAt:0}});
// Explicitly synthetic transport fixtures, NOT the user's six records.
const records=['A ribosome assembles proteins.','Cellular translation uses ribosomes.','Stars emit radiation.','Courts interpret legislation.','Glaciers erode valleys.','Musicians perform symphonies.'].map(memory);
const oldCandidates=mind=>{const pairs=[];for(let i=0;i<mind.memories.length;i++)for(let j=i+1;j<mind.memories.length;j++){const a=mind.memories[i],b=mind.memories[j],terms=new Set(features(a.content).terms),overlap=features(b.content).terms.filter(t=>terms.has(t)).length,metadata=a.topic===b.topic?2:a.category===b.category?1:0;if(overlap||metadata)pairs.push({ids:[a.id,b.id],score:overlap+metadata});}return pairs.sort((a,b)=>b.score-a.score||JSON.stringify(a.ids).localeCompare(JSON.stringify(b.ids))).slice(0,4);};
assert.equal(oldCandidates({memories:records}).length,0);
const model=context=>({version:VERSION,relationships:context.pairs.filter(p=>p.a.id==='0'&&p.b.id==='1').map(({a,b})=>({memoryA:a.id,memoryB:b.id,type:'process-related',direction:'symmetric',evidenceA:{start:0,end:a.text.length,quote:a.text},evidenceB:{start:0,end:b.text.length,quote:b.text},assessment:{support:'supported',reason:'Mock assessment: complementary descriptions of translation.',qualifications:[],polarityPreserved:true,modalityPreserved:true,scopePreserved:true,noEquivalence:true,evidenceSufficient:true}}))});
// Direct model-contract comparison: all 15 pairs in bounded four-pair batches,
// rather than bypassing the production schema's four-pair request ceiling.
const snapshot=m=>({id:m.id,text:m.content,...m.research});
const all=[];for(let i=0;i<6;i++)for(let j=i+1;j<6;j++)all.push({a:snapshot(records[i]),b:snapshot(records[j])});
const direct={memories:structuredClone(records)};for(let i=0;i<all.length;i+=4){const context={version:VERSION,pairs:all.slice(i,i+4)};persistSemantic(direct,validateSemanticResult(model(context),context).accepted);}
const originalNow=Date.now,originalFetch=globalThis.fetch;let day=Date.UTC(2026,10,5);Date.now=()=>day;
try{
 for(const preview of [false,true]){
  let state={mind:{id:preview?'preview':'normal',xp:25,energy:10,memories:structuredClone(records),learningTasks:[{id:'task',status:'COMPLETED',topic:'fixture',knowledgeIds:records.map(m=>m.id),modelCalls:4}]}};
  const seen=new Set();let calls=0;
  globalThis.fetch=async(url,options)=>{calls++;const {id,context}=JSON.parse(options.body);assert(context.pairs.length<=4);for(const pair of context.pairs){const key=semanticPairReceipt(pair);assert(!seen.has(key),'no repeated pair after abstention');seen.add(key);assert.equal(hash(pair.a.text),pair.a.quoteHash);}return Response.json({service:'mindling-reasoning-service',id,result:model(context)});};
  const engine={session:'offline',app:{get state(){return state;}},abort:new AbortController(),loadPermissions:async()=>({enabled:true,revision:1,semanticCallsPerDay:3}),grant:()=>({}),assertLive(id){assert.equal(id,state.mind.id);},async patch(id,run,fn){const next=structuredClone(state);fn(next.mind.learningTasks[0],next);state=next;}};
  for(let i=0;i<4;i++){
   await runSemantic(engine,state.mind.learningTasks[0]);assert.equal(calls,i+1);
   await runSemantic(engine,state.mind.learningTasks[0]);assert.equal(calls,i+1,'same-day recovery cannot spend twice');
   if(i<3)assert.equal(state.mind.learningTasks[0].semanticDeferral,'TASK_WINDOW_LIMIT');
   state=JSON.parse(JSON.stringify(state));day+=86400000;
  }
  assert.equal(seen.size,15);assert.equal(state.mind.learningTasks[0].modelCalls,4);assert.equal(state.mind.learningTasks[0].semanticAttempts.length,4);
  assert.equal(state.mind.xp,25);assert.equal(state.mind.energy,10);
  assert.deepEqual(state.mind.memories.map(m=>({content:m.content,research:m.research})),records.map(m=>({content:m.content,research:m.research})));
  assert.deepEqual(state.mind.memories.map(m=>m.relatedMemoryIds),direct.memories.map(m=>m.relatedMemoryIds));
  const coverage=semanticCoverage(state.mind);assert.equal(coverage.submittedPairsRecorded,15);assert.equal(coverage.persistedSemanticPairs,1);assert.equal(coverage.remainingCandidates,0);assert.deepEqual(coverage.persistedMissingFromProjection,[]);
  // Evidence-version changes invalidate only relevant receipts. Limits remain.
  const changed=structuredClone(state.mind);changed.memories[5].content+=' Meltwater moves sediment.';changed.memories[5].research.quoteHash=hash(changed.memories[5].content);
  assert(semanticCandidateReport(changed,records.map(m=>m.id)).generated>0);
  // Unknown dispatch cannot be recycled through a different task.
  const unknown={memories:structuredClone(records),learningTasks:[{semanticAttempts:[{state:'OUTCOME_UNKNOWN',pairs:[semanticPairReceipt(all[0])]}]}]};
  assert.equal(semanticCandidateReport(unknown,records.map(m=>m.id)).decisions.find(d=>d.ids.join()==='0,1').reason,'OUTCOME_UNRESOLVED');
  const other={memories:structuredClone(records)};assert.equal(semanticCandidateReport(other,records.map(m=>m.id)).generated,15);
 }
}finally{Date.now=originalNow;globalThis.fetch=originalFetch;}
// Available older five actual passages; metadata is reconstructed, explicitly
// NOT the current six-memory export. Compare discovery only, not model quality.
const corpus=JSON.parse(readFileSync(new URL('./support/semantic-production-five.json',import.meta.url))),mind={memories:corpus.passages.map(memory),learningTasks:[{semanticAttempts:[]}]};
const before=oldCandidates(mind);assert.equal(before.length,4);
const seen=new Set();for(let i=0;i<3;i++){const context=semanticCandidates(mind,mind.memories.map(m=>m.id));for(const p of context.pairs)seen.add(semanticPairReceipt(p));mind.learningTasks[0].semanticAttempts.push({state:'COMPLETED',pairs:context.pairs.map(semanticPairReceipt)});}
assert.equal(seen.size,10);assert.equal(semanticCandidates(mind,mind.memories.map(m=>m.id)).pairs.length,0);
// Exact evidence checks still reject forged quotations; projection reports
// corrupted missing reciprocal indexes rather than creating artificial edges.
const context={version:VERSION,pairs:[all[0]]},bad=model(context);bad.relationships[0].evidenceA.quote='fabricated';assert.equal(validateSemanticResult(bad,context).rejections[0].code,'EVIDENCE_NOT_FOUND');
const broken=structuredClone(direct);broken.memories.forEach(m=>{m.relatedMemoryIds=[];});assert.equal(semanticCoverage(broken).persistedMissingFromProjection.length,1);
console.log('Synthetic six: baseline 0/15 reachable; new 15/15 over four daily windows, one mocked relation persisted/projected. Older five passages: baseline 4/10 frozen after abstention; new 10/10 over three batches. No live model evaluation.');
// Authorized complete export supplied for this audit: 12 records, of which
// four are historical corrections and two are newer Gaming memories.
const exported=JSON.parse(readFileSync(new URL('./support/semantic-audit-export.json',import.meta.url))).memories;
const six=[2,3,6,7,10,11].map(i=>exported[i]);
assert.equal(new Set(six.map(m=>m.category)).size,5);
const beforeSix=six.filter(m=>m.source==='AUTONOMOUS');assert.equal(beforeSix.length,2);assert.equal(oldCandidates({memories:beforeSix}).length,1);
const productionMind={memories:structuredClone(exported.filter((m,i)=>![8,9].includes(i))),learningTasks:[]};
const selected=six.map(m=>m.id),allCurrent=semanticCandidateReport(productionMind,selected);assert.equal(allCurrent.generated,15);assert.equal(allCurrent.eligibleMemories,6);
// Original task IDs follow explicit reciprocal correction chains; no history
// evidence is copied to corrected text. Both tasks jointly reach all six.
const originIds=[0,1,2].map(i=>exported[i].id);
assert(semanticCandidateReport(productionMind,originIds).decisions.some(d=>d.ids.includes(exported[10].id)&&d.reason==='SELECTED'));
const pairs=[];for(let i=0;i<4;i++){
 const ctx=semanticCandidates(productionMind,selected);pairs.push(...ctx.pairs);
 productionMind.learningTasks.push({semanticAttempts:[{state:'COMPLETED',pairs:ctx.pairs.map(semanticPairReceipt)}]});
}
assert.equal(pairs.length,15);assert.equal(new Set(pairs.map(semanticPairReceipt)).size,15);
const corrected=pairs.flatMap(p=>[p.a,p.b]).find(m=>m.id===exported[10].id);
assert.equal(corrected.text,exported[10].content);assert.equal(corrected.sourceHash,null);assert.equal(corrected.sourceURL,null);assert.equal(corrected.provenance.verification,'unverified-player-claim');
// A mocked hierarchical link between an actual general passage and example.
// Direct vs production both validate the same exact passages; this does not
// purport to reproduce the configured model's actual semantic judgement.
const target=pairs.find(p=>[p.a.id,p.b.id].includes(exported[10].id)&&[p.a.id,p.b.id].includes(exported[2].id));
const instance=target.a.id===exported[2].id?target.a:target.b,general=target.a.id===exported[10].id?target.a:target.b;
const proposed={version:VERSION,relationships:[{memoryA:instance.id,memoryB:general.id,type:'example-of',direction:'a-to-b',evidenceA:{start:0,end:instance.text.length,quote:instance.text},evidenceB:{start:0,end:general.text.length,quote:general.text},assessment:{support:'supported',reason:'Mock: the protocol is an example of block agreement described by the general passage.',qualifications:['Unverified stored claims, not independently established facts.'],polarityPreserved:true,modalityPreserved:true,scopePreserved:true,noEquivalence:true,evidenceSufficient:true}}]};
for(const batch of [[target],pairs.slice(pairs.indexOf(target)-pairs.indexOf(target)%4,pairs.indexOf(target)-pairs.indexOf(target)%4+4)]){
 const context={version:VERSION,pairs:batch},verdict=validateSemanticResult(proposed,context);assert.equal(verdict.accepted.length,1);
 const copy={memories:structuredClone(exported)},before=JSON.stringify(copy.memories.map(m=>({content:m.content,research:m.research,provenance:m.provenance})));
 assert.equal(persistSemantic(copy,verdict.accepted)[0].code,'RELATIONSHIP_PERSISTED');assert.equal(semanticCoverage(copy).persistedMissingFromProjection.length,0);
 assert.equal(JSON.stringify(copy.memories.map(m=>({content:m.content,research:m.research,provenance:m.provenance}))),before);
 const persisted=copy.memories.find(m=>m.id===general.id).semanticAssociations.at(-1);assert.equal(persisted.sourceHashB,null);assert.equal(persisted.provenanceB.verification,'unverified-player-claim');
 const edited=copy.memories.find(m=>m.id===general.id);edited.content+=' changed';edited.contentIntegrity.length=edited.content.length;assert.equal(persistSemantic(copy,verdict.accepted)[0].code,'STALE_EVIDENCE');
}
assert.equal(semanticCoverage({memories:exported}).persistedMissingFromProjection.length,0);
console.log('Actual six blockchain records: baseline 2/6 visible and 1/15 possible pairs; new 6/6 visible and 15/15 candidate pairs. One mocked example-of relation accepted in direct and production batches; existing historical association projects correctly.');
// Run the actual worker on the authorized correction lineage, with isolated
// transactional copies and mocked responses. Original task IDs resolve to the
// corrected records. No source hashes are inherited by player corrections.
{
 let state={mind:{id:'real-fixture-offline',memories:structuredClone(exported.filter((m,i)=>![8,9].includes(i))),learningTasks:[{id:'first',topic:'Blockchain',status:'COMPLETED',knowledgeIds:originIds,modelCalls:4},{id:'second',topic:'Comparison',status:'COMPLETED',knowledgeIds:[3,4,5].map(i=>exported[i].id),modelCalls:4}]}};
 let day=Date.UTC(2026,10,5),submitted=new Set(),calls=0;
 const oldNow=Date.now,oldFetch=globalThis.fetch;Date.now=()=>day;
 globalThis.fetch=async(url,options)=>{calls++;const {id,context}=JSON.parse(options.body);for(const p of context.pairs)submitted.add(semanticPairReceipt(p));const ids=[instance.id,general.id];const found=context.pairs.some(p=>ids.includes(p.a.id)&&ids.includes(p.b.id));return Response.json({service:'mindling-reasoning-service',id,result:found?proposed:{version:VERSION,relationships:[]}});};
 const engine={session:'actual-records-offline',app:{get state(){return state;}},abort:new AbortController(),loadPermissions:async()=>({enabled:true,revision:1,semanticCallsPerDay:3}),grant:()=>({}),assertLive(id){assert.equal(id,state.mind.id);},async patch(id,run,fn){const next=structuredClone(state);fn(next.mind.learningTasks.find(t=>t.id===id),next);state=next;}};
 try{for(let d=0;d<4;d++){for(const id of ['first','second'])await runSemantic(engine,state.mind.learningTasks.find(t=>t.id===id));state=JSON.parse(JSON.stringify(state));day+=86400000;}
  assert.equal(submitted.size,15);assert.equal(calls,4);assert.equal(semanticCoverage(state.mind).persistedSemanticPairs,2);assert.equal(semanticCoverage(state.mind).persistedMissingFromProjection.length,0);assert(state.mind.learningTasks.every(t=>t.modelCalls===4));
 }finally{Date.now=oldNow;globalThis.fetch=oldFetch;}
 console.log('Actual worker: all 15 current blockchain pairs delivered across original task/correction IDs in four mocked calls; one new reciprocal link plus original historical link, no missing graph edges.');
}
