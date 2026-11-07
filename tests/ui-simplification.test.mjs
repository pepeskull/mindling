import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {ActivityModel} from '../src/network/activity-model.js';import {BrainStateModel} from '../src/network/brain-state-model.js';import {VisualHistory,blendActivity} from '../src/network/visual-history.js';
import {pendingClarifications,taskClarification} from '../src/autonomous/clarification-tasks.js';import {defaultPermissions,validatePermissions} from '../src/autonomous/research-permissions.js';import {eligible} from '../src/network/public-network.js';import {validTask} from '../src/autonomous/tasks.js';
const model={version:1,kind:'model-scope',field:'detail',question:'Which aspect?',options:[{id:'rules',label:'Rules',value:'Rules'},{id:'history',label:'History',value:'History'}],freeText:false};
const task=(n,extra={})=>({version:1,engineVersion:4,id:String(n).repeat(64),mindlingId:'fixture',requestId:'request'+n,run:'run',mode:'FOUNDATION',originalText:'Learn about oceans',objective:'Learn about oceans',topic:'Oceans',status:'BLOCKED',code:'MODEL_CLARIFICATION',coordinatorClarification:model,createdAt:1,updatedAt:1,attempts:0,sourceRequests:0,completedWork:['understanding'],referenceIds:[],sourceReferences:[],knowledgeIds:[],plan:[],message:'Clarification needed',energyCharged:false,timeSensitive:false,...extra});
test('notifications derive only unique actionable canonical tasks owned by this Mindling',()=>{
 const first=task(1),second=task(2,{topic:'Marine biology'});assert(validTask(first,'fixture'));
 const memories=[{id:'kept',content:'Retained knowledge'}],mind={id:'fixture',memories,learningTasks:[first,second,first,task(3,{status:'CANCELLED'}),task(4,{status:'COMPLETED'}),task(5,{code:'NO_EVIDENCE'}),task(6,{mindlingId:'other'}),task(7,{coordinatorClarification:{...model,options:[]}})]};const before=JSON.stringify(mind);
 assert.deepEqual(pendingClarifications(mind).map(t=>t.id),[first.id,second.id]);assert.equal(JSON.stringify(mind),before);assert.deepEqual(pendingClarifications(JSON.parse(before)),pendingClarifications(mind));
 first.status='QUEUED';second.status='CANCELLED';assert.equal(pendingClarifications(mind).length,0);assert.equal(taskClarification(first),null);assert.equal(mind.memories,memories);
});
test('button-only clarification preserves valid legacy tasks and excludes finished or free-text tasks',()=>{
 assert(taskClarification(task(1,{engineVersion:3})));assert.equal(taskClarification(task(1,{status:'COMPLETED'})),null);assert.equal(taskClarification(task(1,{code:'CLARIFICATION_UNAVAILABLE'})),null);assert.equal(taskClarification(task(1,{coordinatorClarification:{...model,freeText:true}})),null);
 const local=task(1,{code:'CLARIFICATION',originalText:'Which football team in Spain is best?',coordinatorClarification:undefined});assert(taskClarification(local)?.options.length>0);
});
test('visual rolling history combines real events and correctly attributed playback without event writes',()=>{
 const brain=new BrainStateModel();brain.update({memories:Array.from({length:8},(_,i)=>({id:'m'+i,content:'Synthetic observation '+i,source:'SERVICE',analysis:i<3?{activity:['TALK','TEACH','DEEP_TRAINING'][i]}:undefined}))});
 const p=brain.playback,real=new ActivityModel(),history=new VisualHistory(real,p);history.resume(1000);p.advance(0);history.sample(1000);
 for(let i=1;i<850;i++){p.advance(50);if(i===30)real.ingest({id:'actual',activity:'TEACH',phase:'accepted'},1000+i*50);history.sample(1000+i*50);}
 const rows=history.history(history.now,30);assert.equal(rows.length,601);assert(rows.every(r=>r.time>=history.now-30000));assert(rows.some(r=>r.values.some(v=>v>0)));assert(rows.every(r=>r.values.every(v=>v>=0&&v<=.94)));assert.equal(real.events.length,1);
 assert.deepEqual(p.pending.slice(0,3).map(m=>m.channel),[0,1,2]);assert(p.pending.slice(3).every(m=>m.channel===-1));assert.deepEqual(blendActivity([0,0,0],[.2,.1,.3]),[.2,.1,.3].map(v=>1-(1-v)));
});
test('hidden interval records no invented playback and resumes without skipped coverage',()=>{
 const b=new BrainStateModel();b.update({memories:[{id:'one',content:'An offline fixture'}]});const p=b.playback,r=new ActivityModel(),h=new VisualHistory(r,p);h.resume(0);p.advance(450);h.sample(450);const cursor=p.cursor,time=p.time;
 h.resume(60000);h.sample(60000);assert(h.history(60000,30).filter(row=>row.time<60000).every(row=>row.values.every(v=>v===0)));assert.equal(p.cursor,cursor);assert.equal(p.time,time);p.advance(100);assert(h.sample(60100).some(v=>v>0));
});
test('new identity still needs explicit paid-research authorization, existing opt-outs and limits survive',()=>{
 const fresh=defaultPermissions('fixture');assert.equal(fresh.enabled,false);assert.equal(fresh.decided,false);
 for(const enabled of[false,true]){const saved={...fresh,enabled,decided:true,revision:3,updatedAt:100,semanticCallsPerDay:3,automaticRequestLimit:8};assert.deepEqual(validatePermissions(saved,'fixture'),saved);}
 assert.throws(()=>validatePermissions({...fresh,capability:'different'},'fixture'));assert(!eligible({stage:6}));assert(eligible({stage:7}));
});
test('requested UI copy and maintenance shortcut are removed; bar geometry stays rectangular',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');const view=read('src/network/network-view.js');assert(!view.includes('roundRect'));assert.match(view,/c\.rect\(/);assert.match(view,/Stored-memory playback and real interactions over 30 seconds/);
 assert(!read('src/network/external-view.js').includes("querySelector('#network-view span')"));
 const onboarding=read('src/ui/onboarding.js');for(const name of['onboarding-lead','onboarding-copy','identity-note'])assert(!onboarding.includes(`class="${name}"`));assert.match(onboarding,/minimum 3/);
 const memory=read('src/memory/neural-memory-view.js');assert(!memory.includes('KeyM'));assert(!memory.includes('openMemoryMaintenance'));assert(!read('src/ui/dashboard.js').includes('#mountResearchSettings'));
});
