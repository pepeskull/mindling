import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createSandbox,newMindling} from '../src/preview/sandbox/engine.js';
import {AutonomousLearningEngine} from '../src/autonomous/learning-engine.js';
import {memoryLabel} from '../src/memory/memory-label.js';
import {learningSummary} from '../src/autonomous/learning-summary.js';
import {quantityFrame} from '../src/autonomous/memory-evolution.js';
import {graphData} from '../src/memory/graph-data.js';
const sha=text=>createHash('sha256').update(text).digest('hex');
const old='A standard chessboard contains 60 squares.',fresh='A standard chessboard contains 64 squares.';
let sequence=0;
function harness(){const state=newMindling(createSandbox(),{confirmed:true,id:'evolution-local'});return {state,async change(reducer){this.state=reducer(structuredClone(this.state));},renderState(){}};}
async function integrate(app,quotes,{limitations=[],timeSensitive=false,mutate=()=>{}}={}){
 const id=sha('task'+(++sequence)),observedAt=Date.now()+sequence;
 const claims=quotes.map(([quote,sourceURL])=>({quote,quoteHash:sha(quote),sourceURL,sourceHash:sha(quote),observedAt,validAt:null,category:'Gaming',topic:'Chessboard structure'}));
 const task={id,version:1,engineVersion:4,mindlingId:app.state.mind.id,requestId:id,run:'run',mode:'FOUNDATION',topic:'Chessboard structure',objective:'Learn about chessboard structure',autonomous:true,energyCharged:true,status:'EVALUATING',code:'EVALUATING',message:'Evaluating evidence.',createdAt:observedAt,updatedAt:observedAt,attempts:1,sourceRequests:2,completedWork:['understanding','retrieval','plan','source','evidence'],referenceIds:[],knowledgeIds:[],plan:[],timeSensitive,limitations,pendingEvidence:claims,sourceReferences:claims.map(c=>({url:c.sourceURL,hash:c.sourceHash,authorizedAt:observedAt,observedAt,type:'web-search-synthesis'}))};
 app.state.mind.learningTasks||=[];app.state.mind.learningTasks.push(task);mutate(app.state,task);
 const engine={app,async loadPermissions(){return {enabled:true};},grant(){return null;},assertLive(){},notify(){},async patch(id,run,reducer){await app.change(s=>{reducer(s.mind.learningTasks.find(t=>t.id===id));return s;});return app.state.mind.learningTasks.find(t=>t.id===id);}};
 return AutonomousLearningEngine.prototype.integrate.call(engine,task,'run',new AbortController(),{enabled:true});
}
test('compact labels come only from safe semantic metadata, never raw source content',()=>{
 assert.deepEqual(memoryLabel({raw:{content:'Source observation (...) https://private.invalid',topic:'Binary Data',category:'Digital information'}}),{title:'Binary Data',topic:'Binary Data',subtitle:'Digital information',historical:false});
 assert.equal(memoryLabel({content:'https://secret.invalid/raw',topic:'https://secret.invalid',category:'Notes: my'}).title,'Untitled memory');
 assert.equal(memoryLabel({raw:{topic:'Video Game Genres',category:'Gaming',supersededBy:'next'}}).historical,true);
});
test('minimal task summary preserves actual completed, paused, failed and unknown work',()=>{
 for(const [status,expected]of [['COMPLETED','Completed'],['BLOCKED','Learning paused'],['FAILED','Research unavailable'],['RESEARCHING','Researching']]){
  const task={status,code:'REQUEST_INTERRUPTED',topic:'Gaming',knowledgeIds:[],sourceReferences:[],completedWork:['understanding','plan']};const summary=learningSummary(task);assert.equal(summary.status,expected);assert.equal(summary.progress,29);assert.equal(summary.sources,0);assert.doesNotMatch(summary.message,/HTTP|REQUEST_|endpoint|200/);
 }
});
test('exact repeat and independently cited support reuse one memory and cannot farm strength',async()=>{
 const app=harness();await integrate(app,[[old,'https://rules.org/board']]);const before=structuredClone(app.state.mind.memories[0]);
 await integrate(app,[[old,'https://rules.org/board']]);assert.deepEqual(app.state.mind.memories[0],before);
 const supportedTask=await integrate(app,[[old,'https://manual.net/board']]);const supported=structuredClone(app.state.mind.memories[0]);assert.equal(supported.strength,before.strength+.05);assert.equal(supported.researchSupport.length,1);assert.deepEqual(supported.research,before.research);
 assert.equal(AutonomousLearningEngine.prototype.reply.call({app},supportedTask).sources[0].url,'https://manual.net/board');
 await integrate(app,[[old,'https://manual.net/board']]);assert.deepEqual(app.state.mind.memories[0],supported);assert.equal(app.state.mind.memories.length,1);assert.equal(app.state.mind.lifetimeXP,0);assert.equal(app.state.mind.energy.remaining,10);
});
test('new complementary knowledge stays distinct and creates real associations',async()=>{
 const app=harness();await integrate(app,[['A chessboard has alternating light and dark squares arranged in a regular grid.','https://rules.org/board']]);
 await integrate(app,[['The light and dark squares on a chessboard provide visual contrast for players.','https://manual.net/contrast']]);
 assert.equal(app.state.mind.memories.length,2);assert.ok(app.state.mind.memories[1].relatedMemoryIds.includes(app.state.mind.memories[0].id));assert.ok(app.state.mind.memories[0].relatedMemoryIds.includes(app.state.mind.memories[1].id));
});
test('one contradictory report preserves incumbent and records unresolved evidence',async()=>{
 const app=harness();await integrate(app,[[old,'https://rules.org/board']]);const original=structuredClone(app.state.mind.memories[0]);
 const task=await integrate(app,[[fresh,'https://manual.net/board']]);const memory=app.state.mind.memories[0];assert.equal(task.status,'BLOCKED');assert.equal(memory.content,original.content);assert.equal(memory.supersededBy,undefined);assert.equal(memory.contradictions[0].evidence.quote,fresh);assert.equal(memory.contradictions[0].status,'unresolved');
});
test('corroborated same-frame correction creates one source-attributed successor with intact history',async()=>{
 const app=harness();await integrate(app,[[old,'https://rules.org/board']]);app.state.mind.memories[0].relatedMemoryIds=['neighbor'];app.state.mind.memories.push({id:'neighbor',content:'This chessboard is used for games played with pieces.',category:'Gaming',topic:'Board games',source:'NATIVE',relatedMemoryIds:[app.state.mind.memories[0].id]});const original=structuredClone(app.state.mind.memories[0]),nodes=structuredClone(app.state.mind.nodes),synapses=structuredClone(app.state.mind.synapses);
 await integrate(app,[[fresh,'https://manual.net/board']]);await integrate(app,[[fresh,'https://guide.edu/board']]);
 const [parent,neighbor,child]=app.state.mind.memories;assert.equal(parent.supersededBy,child.id);assert.equal(child.correctsMemoryId,parent.id);assert.equal(parent.content,original.content);assert.deepEqual(parent.research,original.research);assert.equal(child.research.evidenceText,fresh);assert.equal(child.research.sourceURL,'https://guide.edu/board');assert.equal(child.research.verification,'tool-cited-unverified-synthesis');assert.equal(child.researchSupport.length,2);assert.equal(child.category,'Gaming');assert.equal(child.topic,'Chessboard structure');assert.ok(child.relatedMemoryIds.includes(parent.id));assert.ok(child.relatedMemoryIds.includes(neighbor.id));assert.deepEqual(neighbor.relatedMemoryIds,[parent.id,child.id]);assert.equal(parent.contradictions.every(c=>c.status==='resolved'),true);
 assert.deepEqual(app.state.mind.nodes,nodes);assert.deepEqual(app.state.mind.synapses,synapses);assert.equal(graphData(app.state.mind).stats.current,2);
 const stable=JSON.stringify(app.state.mind.memories);await integrate(app,[[fresh,'https://guide.edu/board']]);assert.equal(JSON.stringify(app.state.mind.memories),stable);assert.equal(app.state.mind.energy.remaining,10);assert.equal(app.state.mind.lifetimeXP,0);
});
for(const kind of ['limitations','same-publisher','verified','time-sensitive','third-value','different-topic'])test(`automatic replacement refuses ${kind}`,async()=>{
 const app=harness();await integrate(app,[[old,'https://rules.org/board']]);
 const options={mutate:(state,task)=>{if(kind==='verified')state.mind.memories[0].intelligence={verification:'verified',current:true};if(kind==='different-topic')task.pendingEvidence.forEach(c=>c.topic='Other subject');}};
 if(kind==='limitations')options.limitations=['Counts may depend on the game variant.'];if(kind==='time-sensitive')options.timeSensitive=true;
 if(kind==='third-value')await integrate(app,[[old.replace('60','32'),'https://third.org/board']]);
 const sources=kind==='same-publisher'?['https://one.publisher.org/board','https://two.publisher.org/board']:['https://manual.net/board','https://guide.edu/board'];
 await integrate(app,sources.map(url=>[fresh,url]),options);assert.equal(app.state.mind.memories.length,1);assert.equal(app.state.mind.memories[0].supersededBy,undefined);
});
test('quantity replacement cannot infer broad semantic corrections, dates or arbitrary resemblance',()=>{
 for(const text of ['A tournament occurred in 2026.','The year is 1492 AD.','The board does not contain 64 squares.','A player has 16 pieces and 2 bishops.','First claim. A board has 64 squares.','DNA encodes genetic information.'])assert.equal(quantityFrame(text),null);
 assert.equal(quantityFrame(old),quantityFrame(fresh));
});
test('altered pending quote hash fails before any integration or counter mutation',async()=>{
 const app=harness(),before=structuredClone(app.state.mind);
 await assert.rejects(integrate(app,[[old,'https://rules.org/board']],{mutate:(s,t)=>t.pendingEvidence[0].quoteHash='0'.repeat(64)}),/evidence changed/);
 assert.deepEqual(app.state.mind.memories,before.memories);assert.equal(app.state.mind.energy.remaining,10);assert.equal(app.state.mind.lifetimeXP,0);
});
test('material limitations remain attached to support without increasing strength or verification',async()=>{
 const app=harness();await integrate(app,[[old,'https://rules.org/board']]);const original=structuredClone(app.state.mind.memories[0]);
 await integrate(app,[[old,'https://manual.net/board']],{limitations:['This count applies only to a particular variant.']});const memory=app.state.mind.memories[0];assert.equal(memory.strength,original.strength);assert.equal(memory.activations,original.activations);assert.deepEqual(memory.research,original.research);assert.deepEqual(memory.researchSupport[0].limitations,['This count applies only to a particular variant.']);
});
test('identical text with a different as-of date remains an unresolved temporal context',async()=>{
 const app=harness();await integrate(app,[[old,'https://rules.org/board']]);
 const task=await integrate(app,[[old,'https://manual.net/board']],{mutate:(s,t)=>t.pendingEvidence[0].validAt=Date.UTC(2026,10,3)});assert.equal(task.status,'BLOCKED');assert.equal(app.state.mind.memories.length,1);assert.equal(app.state.mind.memories[0].researchSupport,undefined);assert.equal(app.state.mind.memories[0].contradictions[0].evidence.validAt,Date.UTC(2026,10,3));
});
test('a competing canonical paraphrase still blocks a proposed numeric successor',async()=>{
 const app=harness();await integrate(app,[[old,'https://rules.org/board']]);const parent=app.state.mind.memories[0];
 app.state.mind.memories.push({...structuredClone(parent),id:'other-claim',content:'Source observation (1970-01-01T00:00:00.001Z) from https://other.org/board: A standard chessboard has 32 squares.',research:{...parent.research,sourceURL:'https://other.org/board',observedAt:1,evidenceText:'A standard chessboard has 32 squares.'}});
 await integrate(app,[[fresh,'https://manual.net/board'],[fresh,'https://guide.edu/board']]);assert.equal(app.state.mind.memories.length,2);assert.equal(app.state.mind.memories[0].supersededBy,undefined);
});
test('replacing a user claim never upgrades the original provenance or claims independent verification',async()=>{
 const app=harness();app.state.mind.memories.push({id:'player-claim',content:old,category:'Gaming',topic:'Chessboard structure',source:'SERVICE',intelligence:{kind:'claim',current:true,verification:'unverified-player-claim'},neuronIds:[],synapseIds:[],relatedMemoryIds:[]});
 await integrate(app,[[fresh,'https://manual.net/board'],[fresh,'https://guide.edu/board']]);const [parent,child]=app.state.mind.memories;
 assert.equal(parent.content,old);assert.equal(parent.source,'SERVICE');assert.equal(parent.research,undefined);assert.equal(parent.intelligence.verification,'unverified-player-claim');assert.equal(parent.supersededBy,child.id);assert.equal(child.source,'AUTONOMOUS');assert.equal(child.research.verification,'tool-cited-unverified-synthesis');assert.equal(app.state.mind.lifetimeXP,0);
});
