import {recordTaskActivity} from '../src/app/activity-journal.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {nextOpportunity,automaticPause,dayKey} from '../src/autonomous/autonomous-schedule.js';
import {SEMANTIC_POLICY} from '../src/semantic/scheduling.js';
import {defaultPermissions,validatePermissions} from '../src/autonomous/research-permissions.js';
import {classifyKnowledge} from '../src/pathways/knowledge-attribution.js';
import {knowledgeEvidence} from '../src/pathways/knowledge-evidence.js';
import {recordPathwayLearning,reclassifyPathwayEvidence} from '../src/pathways/pathways.js';
import {livePathways} from '../src/pathways/live-pathways.js';
import {graphData} from '../src/memory/graph-data.js';
import {activityEvents,binary,decodeBinary,semanticSummary,connectedAgents,relationOrigins} from '../src/network/activity-data.js';
const now=Date.now();
test('configurable automatic reservation ceiling replaces fixed task count without raising defaults or semantic limits',()=>{
 const mind={pathways:['Developer'],memories:[],learningTasks:[],autonomousLearning:{day:dayKey(now),started:3,reservedRequests:12,nextAt:0}};
 assert.equal(nextOpportunity(mind,now),null);
 assert.equal(nextOpportunity(mind,now,{automaticRequestLimit:20}),'Technology');
 assert.match(automaticPause({...mind,autonomousLearning:{...mind.autonomousLearning,reservedRequests:20}}, {automaticRequestLimit:20},now),/reservation/);
 assert.match(automaticPause({...mind,autonomousLearning:{nextAt:now+1}},{},now),/cooldown/);
 assert.match(automaticPause({...mind,autonomousLearning:{},energy:{version:2,remaining:0,bonus:0,updatedAt:now}},{},now),/energy/);
 assert.equal(SEMANTIC_POLICY.maxDaily,3);
 const prefs=defaultPermissions('one');assert.equal(prefs.enabled,false);assert.equal(prefs.automaticRequestLimit,12);
 assert.throws(()=>validatePermissions({...prefs,automaticRequestLimit:100},'one'));
 assert.equal(validatePermissions({...prefs,automaticRequestLimit:20},'one').automaticRequestLimit,20);
 assert.equal(defaultPermissions('two').automaticRequestLimit,12);
});
// Counts reproduce the user's distribution; passages and metadata are synthetic,
// not an invented export or proof that the user's 17 records qualify.
const domains=[['Distributed ledger technology',6],['Science',4],['Healthcare',3],['Association football',3],['Technology',1]];
function fixture(){const mind={id:'fixture',pathways:['Developer','Social','Researcher'],memories:[],categories:[],pathwayEvidence:[]};for(const [category,count]of domains)for(let i=0;i<count;i++){
 const id=`${category}:${i}`,m={id,content:`Synthetic ${category} claim number ${i} states a distinct scoped proposition.`,category,topic:`${category} topic ${i}`,source:'SERVICE',submissionId:id,intelligence:{kind:'claim',current:true},relatedMemoryIds:[]};mind.memories.push(m);recordPathwayLearning(mind,m,{eventId:id,activity:'TEACH',at:now,recordedAt:now});}return mind;}
test('17-memory distribution uses shared evidence thresholds, aliases, stable reconciliation and immutable Origin DNA',()=>{
 const mind=fixture(),origin=JSON.stringify(mind.originPathways),before=JSON.stringify(mind.memories);
 assert.equal(mind.memories.length,17);const evidence=knowledgeEvidence(mind);assert.equal(evidence.unassigned,0);
 const titles=livePathways(graphData(mind),mind).map(p=>p.title);assert(titles.includes('Distributed Systems Explorer'));assert(titles.includes('Scientist'));
 assert.equal(evidence.domains.find(d=>d.id==='technology').ready,false);
 const row=mind.pathwayEvidence[0];row.pathwayId=null;row.units=0;row.attribution={version:1,method:'unassigned'};
 reclassifyPathwayEvidence(mind,now);assert.equal(row.units,1);assert.equal(row.classificationHistory[0].previous.units,0);
 const once=JSON.stringify(mind);reclassifyPathwayEvidence(mind,now+1);assert.equal(JSON.stringify(mind),once);
 assert.equal(JSON.stringify(mind.memories),before);assert.equal(JSON.stringify(mind.originPathways),origin);
 mind.memories.push({...mind.memories[0],id:'duplicate'});assert.equal(knowledgeEvidence(mind).domains.find(d=>d.id==='distributed-systems').count,6);
 assert.equal(classifyKnowledge({category:'Unknown private domain'}).pathwayId,null);
 const weak=fixture();weak.memories=weak.memories.filter(m=>m.category==='Distributed ledger technology').map(m=>({...m,submissionId:'same',topic:'same'}));assert.equal(knowledgeEvidence(weak).domains[0].ready,false);
 const conflicts=fixture();for(const m of conflicts.memories)if(m.category==='Distributed ledger technology')m.contradictions=['unresolved'];assert(!knowledgeEvidence(conflicts).candidates.some(c=>c.id==='distributed-systems'));
});
test('event projection is bounded, deterministic, privacy-safe and distinguishes successful abstention from failure',()=>{
 const mind={history:[{id:'one',at:now,kind:'reinforcement',concept:'PRIVATE SECRET'},{id:'one',at:now,kind:'reinforcement'}],learningTasks:[{id:'task',createdAt:now-100,updatedAt:now,status:'COMPLETED',objective:'PRIVATE PROMPT',semanticAnalysis:{status:'COMPLETED',accepted:0,rejected:0,persisted:0,fingerprint:'a'.repeat(64)},semanticWork:{state:'COMPLETED',updatedAt:now}}]};
 const events=activityEvents(mind);assert.equal(events.filter(e=>e.type==='MEMORY_REINFORCED').length,1);assert(events.some(e=>e.type==='SEMANTIC_ANALYSIS_COMPLETED'));assert(!events.some(e=>e.type==='MEMORY_RELATION_ACCEPTED'));
 assert(!JSON.stringify(events).includes('PRIVATE'));assert.equal(decodeBinary(binary('SEMANTIC_ANALYSIS_COMPLETED')),'SEMANTIC_ANALYSIS_COMPLETED');assert.equal(decodeBinary(binary('Kunskap ✓')),'Kunskap ✓');
 assert(events.every((e,i)=>i===0||events[i-1].timestamp>=e.timestamp));assert.deepEqual(activityEvents(mind),events);
 assert.equal(activityEvents({history:Array.from({length:200},(_,i)=>({id:String(i),at:now+i,kind:'talk'}))}).length,80);
 assert.equal(semanticSummary(mind).failed,0);assert.equal(semanticSummary(mind).completed,1);
 assert.deepEqual(connectedAgents(),[]);assert.deepEqual(connectedAgents({authorized:false,publicConnections:()=>{throw Error('must not access');}}),[]);
 for(const status of ['CONNECTED','CONNECTING','PENDING','OFFLINE','DISCONNECTED','ERROR']){const agents=connectedAgents({authorized:true,publicConnections:()=>[{name:'Fixture',publicId:'public',status,privateKey:'SECRET'},{name:'Demo',publicId:'demo',status,demo:true}]});assert.equal(agents.length,1);assert.equal(agents[0].status,status);assert(!JSON.stringify(agents).includes('SECRET'));}
 assert.deepEqual(relationOrigins({memories:[{id:'a',modelAssociations:[{memoryId:'b'}],coSubmittedMemoryIds:['c']},{id:'b',modelAssociations:[{memoryId:'a'}],semanticAssociations:[{memoryId:'c',rule:'model-assessed-relation'}]}]}),{teach:1,semantic:1,coSubmitted:1});
});

test('identical claims from different source wrappers contribute only one domain evidence unit',()=>{
 const mind=fixture(),original=mind.memories[0],url='https://example.org/evidence';
 mind.memories.push({...original,id:'source-copy',content:`Source observation (${new Date(now).toISOString()}) from ${url}: ${original.content}`,research:{sourceURL:url,observedAt:now}});
 const size=mind.pathwayEvidence.length;recordPathwayLearning(mind,mind.memories.at(-1),{eventId:'new-source',activity:'TEACH',at:now,recordedAt:now});assert.equal(mind.pathwayEvidence.length,size);
 assert.equal(knowledgeEvidence(mind).domains.find(d=>d.id==='distributed-systems').count,6);
});

test('bounded transition journal retains real stages, deduplicates updates and excludes private payloads',()=>{
 const task={status:'QUEUED',objective:'PRIVATE',semanticWork:null};recordTaskActivity({status:'BLOCKED'},task,now);
 recordTaskActivity({status:'QUEUED'},task,now+1);assert.equal(task.activityEvents.length,1);
 for(let i=0;i<30;i++){const before={status:task.status};task.status=i%2?'RESEARCHING':'BLOCKED';recordTaskActivity(before,task,now+i+2);}
 assert.equal(task.activityEvents.length,16);assert(!JSON.stringify(task.activityEvents).includes('PRIVATE'));
 const saved=JSON.parse(JSON.stringify(task));assert.deepEqual(saved.activityEvents,task.activityEvents);
});
