import test from 'node:test';
import assert from 'node:assert/strict';
import {scenario} from './support/research-success-harness.mjs';
import {canRetryResearch} from '../src/autonomous/service-diagnostics.js';
import {XP,dailyXPEarned} from '../src/economy/xp.js';

test('23-second server success with three sources/accepted claims reaches canonical integration',async()=>scenario(async c=>{
 await c.run();const task=c.saved();assert.equal(c.server.code,200);assert.ok(c.server.body.execution.durationMs>=23087);assert.equal(c.server.body.execution.validation.accepted,3);assert.equal(task.status,'COMPLETED');assert.equal(task.sourceReferences.length,3);assert.equal(c.app.state.mind.memories.length,3);assert.equal(task.researchExecution.outcomeUnknown,false);assert.equal(task.sourceRequests,4);assert.equal(task.modelCalls,3);assert.equal(c.app.state.mind.lifetimeXP,0);assert.equal(c.app.state.mind.energy.remaining,10);
}));
for(const [kind,code,phase] of [['missing','TRANSPORT_INTERRUPTED','TRANSPORT'],['network','TRANSPORT_FAILED','TRANSPORT'],['timeout','TRANSPORT_TIMEOUT','TRANSPORT'],['body-abort','TRANSPORT_INTERRUPTED','TRANSPORT'],['parse','RESPONSE_PARSE_FAILED','RESPONSE_PARSE']])test(`${kind}: server completed does not fabricate browser receipt`,async()=>scenario(async c=>{
 await c.run();const task=c.saved();assert.equal(c.server.code,200);assert.equal(c.server.body.execution.detail,'COMPLETED');assert.equal(task.code,code);assert.equal(task.clientDiagnostic.phase,phase);assert.equal(task.sourceReferences.length,0);assert.equal(task.completedToolCalls||0,0);assert.equal(task.researchExecution.outcomeUnknown,true);assert.equal(task.sourceRequests,4);assert.equal(c.app.state.mind.memories.length,0);assert.equal(canRetryResearch(task),false);assert.equal(c.app.state.mind.energy.remaining,10);assert.equal(c.app.state.mind.lifetimeXP,0);
},{kind}));
test('fully received response followed by abort saves evidence instead of becoming unknown',async()=>scenario(async c=>{
 await c.run();let task=c.saved();assert.equal(task.code,'INTEGRATION_PAUSED');assert.equal(task.clientDiagnostic.validated,true);assert.equal(task.clientDiagnostic.abortReason,'HIDDEN');assert.equal(task.sourceReferences.length,3);assert.equal(task.completedToolCalls,1);assert.equal(task.researchExecution.outcomeUnknown,false);assert.ok(task.pendingSourceEvaluation&&task.pendingSourceEvidence);assert.equal(c.app.state.mind.memories.length,0);
 const searches=c.calls.filter(url=>url.endsWith('/responses')).length,calls=c.calls.length,signature=task.pendingSourceEvidence.signature;
 c.afterBody=null;const engine=c.reopen();await engine.loadPermissions();assert.equal(c.saved().pendingSourceEvidence.signature,signature);await c.run();task=c.saved();assert.equal(task.status,'COMPLETED');assert.equal(c.app.state.mind.memories.length,3);assert.equal(c.calls.length,calls);assert.equal(c.calls.filter(url=>url.endsWith('/responses')).length,searches);assert.equal(task.modelCalls,3);
},{afterBody:c=>c.engine.active.controller.abort('HIDDEN')}));
for(const [fault,code,pending] of [['receipt','CHECKPOINT_PERSISTENCE_FAILED',false],['evidence','EVIDENCE_PERSISTENCE_FAILED',true],['integration','INTEGRATION_FAILED',true]])test(`${fault} transaction failure preserves the known server outcome`,async()=>scenario(async c=>{
 await c.run();const task=c.saved();assert.equal(task.code,code);assert.equal(task.clientDiagnostic.validated,true);assert.equal(task.serviceDiagnostic.detail,'COMPLETED');assert.equal(task.researchExecution.outcomeUnknown,false);assert.equal(task.completedToolCalls,1);assert.equal(c.app.state.mind.memories.length,0);assert.equal(c.app.state.mind.lifetimeXP,0);assert.equal(c.app.state.mind.energy.remaining,10);assert.equal(canRetryResearch(task),pending);
 if(fault==='integration'){assert.equal(task.clientDiagnostic.integrationReason,'LOCAL_COMMIT_FAILED');assert.equal(task.pendingEvidence.length,3);assert.equal(task.clientDiagnostic.correlationId,task.serviceDiagnostic.correlationId);}
 if(pending){const calls=c.calls.length;await c.run();assert.equal(c.saved().status,'COMPLETED');assert.equal(c.app.state.mind.memories.length,3);assert.equal(c.calls.length,calls);}
 assert.doesNotMatch(JSON.stringify(c.logs),/Private|synthetic-received-secret|opaque-model|https:/);
},{fault}));
for(const [earned,award] of [[0,10],[95,5],[99,1],[100,0]])test(`Deep Research at ${earned} daily XP saves all candidates and awards ${award} XP once`,async()=>scenario(async c=>{
 const dayLength=86400000,day=Math.floor(c.app.state.now/dayLength);
 c.app.state.mind.history.push({id:'previous-day',day:day-1,xp:XP.daily},{id:'fixture-xp',day,xp:earned});
 c.app.state.mind.lifetimeXP=XP.daily+earned;
 c.app.state.mind.stageXP=earned;
 await c.run();
 const completed=c.saved(),mind=c.app.state.mind,calls=c.calls.length;
 assert.equal(completed.status,'COMPLETED');assert.equal(completed.learningRewarded,true);
 assert.equal(completed.pendingEvidence,undefined);assert.equal(completed.clientDiagnostic,undefined);
 assert.equal(mind.memories.length,3);assert.equal(new Set(completed.knowledgeIds).size,3);
 assert.equal(mind.history.filter(event=>event.requestId===completed.requestId).length,1);
 assert.equal(mind.history.find(event=>event.requestId===completed.requestId).xp,award);
 assert.equal(mind.stageXP,earned+award);assert.equal(mind.lifetimeXP,XP.daily+earned+award);
 assert.equal(dailyXPEarned(mind.history,c.app.state.now),earned+award);
 assert.equal(mind.energy.remaining,7);
 const snapshot=structuredClone(mind);
 c.app.state.now+=dayLength;
 assert.equal(dailyXPEarned(mind.history,c.app.state.now),0);
 await c.run();assert.equal(c.calls.length,calls);assert.deepEqual(c.app.state.mind,snapshot);
},{autonomous:false,activity:'DEEP_TRAINING'}));
test('a failed transaction at the cap recovers locally, with exactly one Energy charge and no XP',async()=>scenario(async c=>{
 const mind=c.app.state.mind,day=Math.floor(c.app.state.now/86400000);
 mind.history.push({id:'fixture-xp',day,xp:100});mind.stageXP=mind.lifetimeXP=100;
 await c.run();const blocked=c.saved(),calls=c.calls.length;
 assert.equal(blocked.status,'BLOCKED');assert.equal(blocked.pendingEvidence.length,3);
 assert.equal(c.app.state.mind.memories.length,0);assert.equal(c.app.state.mind.energy.remaining,10);
 assert.equal(c.app.state.mind.lifetimeXP,100);
 await c.run();assert.equal(c.calls.length,calls);assert.equal(c.saved().status,'COMPLETED');
 assert.equal(c.app.state.mind.memories.length,3);assert.equal(c.app.state.mind.energy.remaining,7);
 assert.equal(c.app.state.mind.lifetimeXP,100);
 assert.equal(c.app.state.mind.history.find(event=>event.requestId===c.saved().requestId).xp,0);
},{autonomous:false,activity:'DEEP_TRAINING',fault:'integration'}));
for(const [fault,followUp] of [['post-commit','STATE_REFRESH_FAILED'],['notification','COMPLETION_NOTIFICATION_FAILED']])test(`${fault} failure preserves the committed result and never resubmits it`,async()=>scenario(async c=>{
 if(fault==='notification')c.app.dashboard={showResearchResult(){throw Error('Private dashboard failure');}};
 await c.run();
 const task=c.saved(),snapshot=structuredClone(c.app.state.mind.memories),calls=c.calls.length;
 assert.equal(c.server.body.execution.validation.accepted,3);
 assert.equal(task.status,'COMPLETED');assert.equal(task.pendingEvidence,undefined);
 assert.equal(task.knowledgeIds.length,3);assert.equal(new Set(snapshot.map(memory=>memory.id)).size,3);
 assert.equal(c.engine.clientFailure,undefined);
 assert(c.logs.some(log=>log.phase==='POST_COMMIT'&&log.code===followUp&&log.correlationId===task.researchExecution.correlationId));
 assert.doesNotMatch(JSON.stringify(c.logs),/Private|INTEGRATION_FAILED/);
 await c.run();assert.equal(c.calls.length,calls);assert.deepEqual(c.app.state.mind.memories,snapshot);
},{fault,autonomous:fault!=='notification'}));
for(const [name,mutate,code] of [
 ['stale ID',r=>r.execution.correlationId='f'.repeat(64),'RECEIPT_VALIDATION_FAILED'],
 ['missing receipt',r=>delete r.execution,'RECEIPT_VALIDATION_FAILED'],
 ['incorrect accepted count',r=>r.execution.validation.accepted=2,'RECEIPT_VALIDATION_FAILED'],
 ['invalid source ID',r=>r.acquisition.evaluation.claims[0].sourceId='unknown','RECEIPT_VALIDATION_FAILED'],
 ['invalid limitation',r=>r.acquisition.evaluation.limitations=[''],'RECEIPT_VALIDATION_FAILED'],
 ['missing checkpoint',r=>delete r.sourceCheckpoint,'CHECKPOINT_VALIDATION_FAILED'],
 ['checkpoint scope',r=>r.sourceCheckpoint.request.topic='Another public topic','CHECKPOINT_VALIDATION_FAILED'],
 ['checkpoint evidence',r=>r.sourceCheckpoint.evidence.sources[0].text+=' altered','CHECKPOINT_VALIDATION_FAILED']
])test(`${name} cannot integrate an unvalidated acquisition`,async()=>scenario(async c=>{
 await c.run();assert.equal(c.saved().code,code);assert.equal(c.app.state.mind.memories.length,0);assert.equal(c.saved().sourceRequests,4);assert.equal(canRetryResearch(c.saved()),false);
},{mutate}));
test('source hash mismatch remains a distinct integrity failure after durable receipt',async()=>scenario(async c=>{
 await c.run();assert.equal(c.saved().code,'EVIDENCE_VALIDATION_FAILED');assert.equal(canRetryResearch(c.saved()),false);assert.ok(c.saved().pendingSourceEvidence);assert.equal(c.saved().researchExecution.outcomeUnknown,false);assert.equal(c.app.state.mind.memories.length,0);
},{mutate:r=>{r.acquisition.sources[0].hash='0'.repeat(64);r.sourceCheckpoint.evidence.sources[0].hash='0'.repeat(64);}}));
for(const kind of ['cancelled','changed-run','changed-identity'])test(`late result for ${kind} cannot change the current owner`,async()=>scenario(async c=>{
 await c.run();assert.equal(c.app.state.mind.memories.length,0);assert.equal(c.app.state.mind.learningTasks[0].sourceReferences.length,0);if(kind==='cancelled')assert.equal(c.app.state.mind.learningTasks[0].status,'CANCELLED');assert.ok(c.logs.some(log=>log.code==='STALE_RESEARCH_RESPONSE'));
},{afterBody:c=>{const task=c.saved();if(kind==='cancelled'){task.status='CANCELLED';task.code='CANCELLED';task.run='new-owner';}else if(kind==='changed-run')task.run='new-owner';else c.app.state.mind.id='new-mindling';}}));
test('previous canonical memories are unchanged by transport and persistence failures',async()=>scenario(async c=>{
 const memory={id:'existing',content:'An existing canonical claim.',category:'History',topic:'History',source:'NATIVE',relatedMemoryIds:[]};c.app.state.mind.memories.push(structuredClone(memory));await c.run();assert.deepEqual(c.app.state.mind.memories,[memory]);
},{fault:'receipt'}));
test('server serialization failures preserve completed work and its signed analysis checkpoint',async()=>scenario(async c=>{
 await c.run();const task=c.saved();assert.equal(c.server.code,502);assert.equal(task.code,'RESPONSE_SERIALIZATION_ERROR');assert.equal(task.serviceDiagnostic.phase,'RESPONSE_SERIALIZATION');assert.equal(task.serviceDiagnostic.detail,'RESPONSE_SERIALIZATION_FAILED');assert.ok(task.pendingSourceEvidence);assert.equal(task.researchExecution.outcomeUnknown,false);assert.equal(c.app.state.mind.memories.length,0);
},{kind:'serialization'}));
test('unavailable storage cannot silently erase a received server failure diagnostic',async()=>scenario(async c=>{
 await c.run();assert.equal(c.server.code,502);assert.equal(c.engine.clientFailure.diagnostic.code,'CHECKPOINT_PERSISTENCE_FAILED');assert.ok(c.engine.diagnostics.reason.includes('RESPONSE_SERIALIZATION_ERROR'));assert.ok(c.logs.some(log=>log.event==='mindling.research.server-receipt'&&log.detail==='RESPONSE_SERIALIZATION_FAILED'));assert.equal(c.app.state.mind.memories.length,0);assert.equal(c.app.state.mind.energy.remaining,10);assert.equal(c.app.state.mind.lifetimeXP,0);assert.doesNotMatch(JSON.stringify(c.logs),/Private|synthetic-received-secret|opaque-model|https:/);
},{kind:'serialization',fault:'all'}));

test('ambiguous completed response retains only a quarantined report and never resumes or creates memories',async()=>{
 const {createRequire}=await import('node:module');
 const {searchPayload}=createRequire(import.meta.url)('./support/research-success-fixture.cjs');
 const {canRetryResearch}=await import('../src/autonomous/service-diagnostics.js');
 const {validateResearchCheckpoint}=await import('../src/autonomous/research-contract.js');
 await scenario(async c=>{
  await c.run();
  assert.equal(c.server.code,409);
  assert.equal(c.server.body.sourceCheckpoint,undefined);
  const saved=JSON.parse(JSON.stringify(c.saved()));
  assert.equal(saved.status,'BLOCKED');
  assert.equal(saved.researchExecution.outcomeUnknown,true);
  assert.equal(saved.sourceRequests,4);
  assert.equal(saved.modelCalls,3);
  assert.equal(saved.completedToolCalls,2);
  assert.equal(saved.sourceReferences.length,0);
  assert.equal(saved.researchObservation.sources.length,3);
  assert.equal(saved.completedWork.includes('source'),false);
  assert.equal(saved.knowledgeIds.length,0);
  assert.equal(c.app.state.mind.memories.length,0);
  assert.equal(canRetryResearch(saved),false);
  assert.throws(()=>validateResearchCheckpoint(saved.researchObservation));
  assert.doesNotMatch(JSON.stringify(c.logs),/https:\/\/|The rules of a game/);
  const calls=c.calls.length;
  c.reopen().recover();
  assert.equal(c.calls.length,calls);
 },{acquisitionPayload:()=>{
  const response=searchPayload();
  response.output.splice(1,0,{id:'second',type:'web_search_call',status:'completed',action:{type:'search',sources:[]}},
   {id:'third',type:'web_search_call',status:'searching',action:{type:'open_page',url:'https://example.org/pending'}});
  return response;
 }});
});
