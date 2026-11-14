import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeProposal,commitHierarchy} from '../src/memory/knowledge-hierarchy.js';
import {learningSummary} from '../src/autonomous/learning-summary.js';
test('Sports containment, missing decisions and associations remain distinct and revalidated',()=>{
 const graph={areas:[{id:'s',label:'Sports'},{id:'f',label:'Association football'},{id:'g',label:'Sports competitions and governance'}],areaRelations:[]};
 const proposal=mergeProposal(graph,null,'f','s');assert(proposal.valid);
 const mind={memories:[{id:'retained'}],xp:8},next=commitHierarchy(mind,graph,proposal);
 assert.deepEqual(next.memories,mind.memories);assert.equal(next.xp,8);
 assert.equal(mergeProposal(graph,null,'g','s').code,'MISSING_CONTAINMENT');
 graph.areaRelations=[{from:'g',to:'s',type:'related-to'}];
 assert.equal(mergeProposal(graph,null,'g','s').code,'ASSOCIATION_ONLY');
 assert.throws(()=>commitHierarchy(mind,graph,{...proposal,areaRevision:1}));
 assert.equal(mergeProposal(graph,next.knowledgeHierarchy,'f','s').valid,false);
 assert.equal(mind.knowledgeHierarchy,undefined);
});
test('blocked summary distinguishes authorization, budget, interruption and unknown reasons',()=>{
 const base={status:'BLOCKED',steps:[],knowledgeIds:[],sourceReferences:[]};
 for(const code of ['ACCESS_DISABLED','BUDGET_EXHAUSTED','REQUEST_INTERRUPTED']){
 const result=learningSummary({...base,code});assert.equal(result.diagnosticCode,code);assert(!result.message.includes('Learning is paused;'));
 }
 assert(learningSummary({...base,code:'NEW_FAILURE'}).message.includes('diagnostic'));
 assert.equal(learningSummary({...base,status:'COMPLETED'}).message,'Supported knowledge retained.');
});
