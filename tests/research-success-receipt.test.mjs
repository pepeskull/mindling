import test from 'node:test';
import assert from 'node:assert/strict';
import {scenario} from './support/research-success-harness.mjs';
import {canRetryResearch} from '../src/autonomous/service-diagnostics.js';

test('23-second server success with three sources/accepted claims reaches canonical integration',async()=>scenario(async c=>{
 await c.run();const task=c.saved();assert.equal(c.server.code,200);assert.ok(c.server.body.execution.durationMs>=23087);assert.equal(c.server.body.execution.validation.accepted,3);assert.equal(task.status,'COMPLETED');assert.equal(task.sourceReferences.length,3);assert.equal(c.app.state.mind.memories.length,3);assert.equal(task.researchExecution.outcomeUnknown,false);assert.equal(task.sourceRequests,2);assert.equal(task.modelCalls,3);assert.equal(c.app.state.mind.lifetimeXP,0);assert.equal(c.app.state.mind.energy.remaining,10);
}));
for(const [kind,code,phase] of [['missing','TRANSPORT_INTERRUPTED','TRANSPORT'],['network','TRANSPORT_FAILED','TRANSPORT'],['timeout','TRANSPORT_TIMEOUT','TRANSPORT'],['body-abort','TRANSPORT_INTERRUPTED','TRANSPORT'],['parse','RESPONSE_PARSE_FAILED','RESPONSE_PARSE']])test(`${kind}: server completed does not fabricate browser receipt`,async()=>scenario(async c=>{
 await c.run();const task=c.saved();assert.equal(c.server.code,200);assert.equal(c.server.body.execution.detail,'COMPLETED');assert.equal(task.code,code);assert.equal(task.clientDiagnostic.phase,phase);assert.equal(task.sourceReferences.length,0);assert.equal(task.completedToolCalls||0,0);assert.equal(task.researchExecution.outcomeUnknown,true);assert.equal(task.sourceRequests,2);assert.equal(c.app.state.mind.memories.length,0);assert.equal(canRetryResearch(task),false);assert.equal(c.app.state.mind.energy.remaining,10);assert.equal(c.app.state.mind.lifetimeXP,0);
},{kind}));
test('fully received response followed by abort saves evidence instead of becoming unknown',async()=>scenario(async c=>{
 await c.run();let task=c.saved();assert.equal(task.code,'INTEGRATION_PAUSED');assert.equal(task.clientDiagnostic.validated,true);assert.equal(task.clientDiagnostic.abortReason,'HIDDEN');assert.equal(task.sourceReferences.length,3);assert.equal(task.completedToolCalls,1);assert.equal(task.researchExecution.outcomeUnknown,false);assert.ok(task.pendingSourceEvaluation&&task.pendingSourceEvidence);assert.equal(c.app.state.mind.memories.length,0);
 const searches=c.calls.filter(url=>url.endsWith('/responses')).length,calls=c.calls.length,signature=task.pendingSourceEvidence.signature;
 c.afterBody=null;const engine=c.reopen();await engine.loadPermissions();assert.equal(c.saved().pendingSourceEvidence.signature,signature);await c.run();task=c.saved();assert.equal(task.status,'COMPLETED');assert.equal(c.app.state.mind.memories.length,3);assert.equal(c.calls.length,calls);assert.equal(c.calls.filter(url=>url.endsWith('/responses')).length,searches);assert.equal(task.modelCalls,3);
},{afterBody:c=>c.engine.active.controller.abort('HIDDEN')}));
for(const [fault,code,pending] of [['receipt','CHECKPOINT_PERSISTENCE_FAILED',false],['evidence','EVIDENCE_PERSISTENCE_FAILED',true],['integration','INTEGRATION_FAILED',true]])test(`${fault} transaction failure preserves the known server outcome`,async()=>scenario(async c=>{
 await c.run();const task=c.saved();assert.equal(task.code,code);assert.equal(task.clientDiagnostic.validated,true);assert.equal(task.serviceDiagnostic.detail,'COMPLETED');assert.equal(task.researchExecution.outcomeUnknown,false);assert.equal(task.completedToolCalls,1);assert.equal(c.app.state.mind.memories.length,0);assert.equal(c.app.state.mind.lifetimeXP,0);assert.equal(c.app.state.mind.energy.remaining,10);assert.equal(canRetryResearch(task),pending);
 if(pending){const calls=c.calls.length;await c.run();assert.equal(c.saved().status,'COMPLETED');assert.equal(c.app.state.mind.memories.length,3);assert.equal(c.calls.length,calls);}
 assert.doesNotMatch(JSON.stringify(c.logs),/Private|synthetic-received-secret|opaque-model|https:/);
},{fault}));
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
 await c.run();assert.equal(c.saved().code,code);assert.equal(c.app.state.mind.memories.length,0);assert.equal(c.saved().sourceRequests,2);assert.equal(canRetryResearch(c.saved()),false);
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
