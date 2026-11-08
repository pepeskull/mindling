import test from 'node:test';import assert from 'node:assert/strict';
import {graphData,filterGraph,layoutGraph,memorySignature} from '../src/memory/graph-data.js';
import {mergeProposal,commitHierarchy,hierarchyLinks} from '../src/memory/knowledge-hierarchy.js';
import {clusterPositions} from '../src/memory/cluster-drag.js';
import {cleanView} from '../src/memory/view-state.js';
import {understandInput} from '../src/learning/input-understanding.js';
import {learningSummary} from '../src/autonomous/learning-summary.js';
const mind=()=>({id:'fixture',memories:[{id:'a',content:'A broad sport observation.',categoryId:'sport',category:'Sport',relatedMemoryIds:['b']},{id:'b',content:'A football observation.',categoryId:'football',category:'Association football',relatedMemoryIds:['a'],research:{sourceURL:'https://example.org/evidence',quoteHash:'preserved'}},{id:'c',content:'A scientific observation.',categoryId:'science',category:'Science'}]});
const area=(g,label)=>g.areas.find(a=>a.label===label).id;
test('canonical hierarchy is direction-independent, retains claims and child identity; root distribution has no double count',()=>{
 const m=mind(),before=structuredClone(m),g=graphData(m),a=area(g,'Sport'),b=area(g,'Association football');
 const p=mergeProposal(g,null,a,b);assert.deepEqual(p,mergeProposal(g,null,b,a));const next=commitHierarchy(m,g,p),after=graphData(next);
 assert.deepEqual(m,before);assert.deepEqual(next.memories,before.memories);assert.equal(after.stats.areas,2);assert.equal(after.stats.canonical,3);assert.equal(after.stats.associations,1);assert.equal(after.areas.length,3);
 assert.equal(after.areas.find(a=>a.id===b).parentId,a);assert.equal(after.coverage.reduce((n,a)=>n+a.count,0),3);assert.equal(after.coverage.find(n=>n.id===a).count,2);assert.equal(after.distribution.find(n=>n.id===b).count,1);
 assert.equal(filterGraph(after,{area:a}).memories.length,2);assert.equal(filterGraph(after,{area:b}).memories.length,1);assert.notEqual(memorySignature(m),memorySignature(next));
 const layout=layoutGraph(filterGraph(after)),root=layout.nodes.find(n=>n.id===a);assert(root.r>18);assert(clusterPositions(layout,a).some(p=>p.node.id===b));assert.equal(layout.nodes.find(n=>n.id===b).kind,'topic');assert(!clusterPositions(layout,b).some(p=>p.node.id===a));
 assert.throws(()=>commitHierarchy(next,after,p),/changed/);assert.equal(mergeProposal(after,next.knowledgeHierarchy,a,b).valid,false);
});
test('unrelated, siblings, substring-only, unknown, dangling and cyclic proposals fail closed',()=>{
 const m=mind(),g=graphData(m);assert.equal(mergeProposal(g,null,area(g,'Sport'),area(g,'Science')).valid,false);
 const taxonomy={memories:['Biology','Genetics','Cell biology','Unknown biology'].map((category,i)=>({id:String(i),content:'Fixture '+i,category}))},t=graphData(taxonomy);
 assert(mergeProposal(t,null,area(t,'Biology'),area(t,'Genetics')).valid);assert(!mergeProposal(t,null,area(t,'Genetics'),area(t,'Cell biology')).valid);assert(!mergeProposal(t,null,area(t,'Biology'),area(t,'Unknown biology')).valid);
 const a=area(t,'Biology'),b=area(t,'Genetics');assert(!mergeProposal(t,{version:1,links:[{parentId:b,childId:a}]},a,b).valid);
 assert.equal(hierarchyLinks({version:1,links:[{parentId:a,childId:b},{parentId:b,childId:a},{parentId:a,childId:'absent'}]},t.areas).length,1);
});
test('layout preferences sanitize bounded UI-only data',()=>{
 const v=cleanView({positions:{'area:ok':{x:10,y:20},bad:{x:0,y:1},'area:bad':{x:Infinity,y:0}},zoom:3,taskPage:2,taskFilter:'actionable',memories:[1],energy:10});assert.deepEqual(v.positions,{'area:ok':{x:10,y:20}});assert.equal(v.taskPage,2);assert.equal(v.memories,undefined);assert.equal(v.energy,undefined);
});
test('NHL typo keeps the public subject; uncertain lifecycle explains the reservation instead of generic pause',()=>{
 assert.equal(understandInput('Learn aboout NHL league','TEACH').topic,'NHL league');
 const summary=learningSummary({topic:'NHL league',status:'BLOCKED',code:'TOOL_LIFECYCLE_INCOMPLETE',knowledgeIds:[],sourceReferences:[],completedWork:['understanding','retrieval','plan']});assert.match(summary.message,/unknown outcome/);assert.match(summary.message,/repeat search is blocked/);
});

import {livePathways} from '../src/pathways/live-pathways.js';
import {areaColor} from '../src/memory/area-colors.js';
import {ResearchAccess} from '../src/ui/research-access.js';
test('Live Pathways retains child colors, per-area attribution, ranking and percentages after canonical merge',()=>{
 const m=mind();m.memories.push({id:'d',content:'Another distinct football claim.',categoryId:'football',category:'Association football'});
 for(const [i,r] of m.memories.entries()){r.source='SERVICE';r.topic='Structured topic '+i;}
 const g=graphData(m),before=livePathways(g,m),p=mergeProposal(g,null,area(g,'Sport'),area(g,'Association football')),next=commitHierarchy(m,g,p),after=livePathways(graphData(next),next);
 assert.equal(before[0].source,'knowledge');assert.equal(before[0].count,3);assert.equal(after[0].count,3);assert.equal(after[0].share,before[0].share);assert.equal(after[0].title,before[0].title);
 const child=after[0].areas.find(a=>a.label==='Association football');assert.deepEqual(child.path,['Sport','Association football']);assert.equal(child.count,2);assert.equal(areaColor(child.id),areaColor(before[0].areas.find(a=>a.id===child.id).id));
});
test('research switch shows only persisted authorization, locks pending writes and preserves explicit opt-out after failures',async()=>{
 const oldConfirm=globalThis.confirm;globalThis.confirm=()=>true;const old=globalThis.document;class Element{constructor(){this.attrs={};this.children=[];}setAttribute(k,v){this.attrs[k]=v;}append(n){this.children.push(n);}addEventListener(){}querySelector(s){return this.children[s]??=new Element();}remove(){}}
 globalThis.document={createElement:()=>new Element()};let state={mindlingId:'one',researchPermissions:{loaded:true,enabled:false,decided:true,semanticCallsPerDay:3}},resolve;
 const control=new ResearchAccess(new Element(),{getState:()=>state,onSave:enabled=>new Promise(r=>{resolve=()=>{state.researchPermissions={...state.researchPermissions,enabled};r(state.researchPermissions);};})});
 try{assert.equal(control.save.attrs['aria-checked'],'false');const pending=control.commit();assert.equal(control.save.disabled,true);assert.equal(control.save.attrs['aria-checked'],'false');resolve();await pending;assert.equal(control.save.attrs['aria-checked'],'true');assert.equal(state.researchPermissions.semanticCallsPerDay,3);
 control.onSave=async()=>{throw Error('write rejected');};await control.commit();assert.equal(control.save.attrs['aria-checked'],'true');assert.match(control.status.textContent,/unchanged/);
 state={mindlingId:'two',researchPermissions:{loaded:true,enabled:false,decided:true}};control.refresh();assert.equal(control.save.attrs['aria-checked'],'false');
 }finally{control.destroy();globalThis.document=old;globalThis.confirm=oldConfirm;}
});
