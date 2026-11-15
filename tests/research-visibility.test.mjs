import test from 'node:test';
import assert from 'node:assert/strict';
import {scenario} from './support/research-success-harness.mjs';
const visible=hidden=>{document.hidden=hidden;document.dispatchEvent(new Event('visibilitychange'));};
for(const cycles of [1,4])test(`visibility changes ${cycles} times retain validated receipt and resume locally`,()=>scenario(async c=>{
 await c.run();let task=c.saved();
 assert.equal(task.code,'INTEGRATION_PAUSED');assert.equal(task.clientDiagnostic.received,true);assert.equal(task.clientDiagnostic.validated,true);
 assert.equal(task.researchExecution.outcomeUnknown,false);assert.equal(task.sourceReferences.length,3);assert.ok(task.pendingSourceEvidence&&task.pendingSourceEvaluation);
 assert.equal(c.app.state.mind.memories.length,0);assert.equal(task.sourceRequests,2);assert.equal(task.modelCalls,3);
 const count=c.calls.length;document.hidden=false;await c.run();task=c.saved();
 assert.equal(task.status,'COMPLETED');assert.equal(c.app.state.mind.memories.length,3);assert.equal(c.calls.length,count);assert.equal(task.modelCalls,3);
 assert.ok(c.app.state.mind.memories.every(m=>m.research&&m.category));
},{beforeAcquisition:async(c,signal)=>{for(let i=0;i<cycles;i++){visible(true);assert.equal(signal.aborted,false);if(i<cycles-1)visible(false);}}}));
test('return before response arrives does not abort or duplicate acquisition',()=>scenario(async c=>{
 await c.run();assert.equal(c.saved().status,'COMPLETED');assert.equal(c.saved().modelCalls,3);assert.equal(c.calls.filter(u=>u.endsWith('/responses')).length,1);
},{beforeAcquisition:async(c,signal)=>{visible(true);visible(false);assert.equal(signal.aborted,false);}}));
test('visibility restoration automatically integrates saved evidence without another research request',()=>scenario(async c=>{
 await c.run();assert.equal(c.saved().code,'INTEGRATION_PAUSED');
 const searches=c.calls.filter(u=>u.endsWith('/responses')).length;
 visible(false);
 const deadline=Date.now()+2000;
 while(c.saved().status!=='COMPLETED'){if(Date.now()>deadline)assert.fail('local visibility recovery did not complete');await new Promise(resolve=>setTimeout(resolve,5));}
 assert.equal(c.calls.filter(u=>u.endsWith('/responses')).length,searches);assert.equal(c.saved().modelCalls,3);assert.equal(c.app.state.mind.memories.length,3);
},{beforeAcquisition:async()=>visible(true)}));
