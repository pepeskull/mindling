import test from 'node:test';import assert from 'node:assert/strict';
import {graphData,filterGraph,layoutGraph} from '../src/memory/graph-data.js';
import {mergeProposal,commitHierarchy,areaRadius} from '../src/memory/knowledge-hierarchy.js';
import {clusterPositions} from '../src/memory/cluster-drag.js';
import {readFileSync} from 'node:fs';
const fixture=()=>({id:'fixture',memories:['Sport','Association football','Association football','Science'].map((category,i)=>({id:'m'+i,content:'Stored claim '+i,category,topic:'Topic '+i,source:'SERVICE',relatedMemoryIds:i===1?['m2']:[]}))});
test('merged render root contains every incoming memory; child remains addressable without a second large cell',()=>{
 const m=fixture(),before=structuredClone(m),g=graphData(m),a=g.areas.find(a=>a.label==='Sport'),b=g.areas.find(a=>a.label==='Association football');
 const p=mergeProposal(g,null,a.id,b.id);assert.deepEqual(p,mergeProposal(g,null,b.id,a.id));const next=commitHierarchy(m,g,p),graph=graphData(next),layout=layoutGraph(filterGraph(graph)),preview=layoutGraph(filterGraph(graph,{area:a.id}));
 assert.deepEqual(m,before);assert.deepEqual(next.memories,before.memories);assert.equal(layout.nodes.filter(n=>n.kind==='area').length,2);const root=layout.nodes.find(n=>n.id===a.id),child=layout.nodes.find(n=>n.id===b.id);
 assert.equal(child.kind,'topic');assert(child.hierarchyArea);assert(root.r>areaRadius(a));assert(root.r>child.r*2);
 const members=clusterPositions(layout,a.id).map(p=>p.node);assert.equal(members.filter(n=>n.kind==='memory').length,3);assert.equal(preview.nodes.filter(n=>n.kind==='area').length,1);assert.equal(preview.nodes.filter(n=>n.kind==='memory').length,3);
 const pr=preview.nodes.find(n=>n.id===a.id);for(const n of preview.nodes){const actual=layout.nodes.find(v=>v.id===n.id);assert(Math.abs(n.x-pr.x-(actual.x-root.x))<1e-8);assert(Math.abs(n.y-pr.y-(actual.y-root.y))<1e-8);}
 assert.equal(graph.stats.associations,1);assert.equal(new Set(layout.nodes.map(n=>n.id)).size,layout.nodes.length);assert(preview.edges.some(e=>e.from===b.id&&e.to===preview.memories?.[0]?.id)||preview.edges.some(e=>e.from===b.id));
});
test('nested child coverage is distinct, finite, monotonic and bounded; no canonical record is rewritten',()=>{
 const m=fixture();m.memories.push({id:'nested',content:'A nested saved claim.',category:'Nested topic'});const g=graphData(m),ids=Object.fromEntries(g.areas.map(a=>[a.label,a.id]));m.knowledgeHierarchy={version:1,revision:2,links:[{parentId:ids.Sport,childId:ids['Association football']},{parentId:ids['Association football'],childId:ids['Nested topic']}]};
 const before=structuredClone(m),graph=graphData(m),layout=layoutGraph(filterGraph(graph,{area:ids.Sport}));assert.equal(layout.nodes.filter(n=>n.kind==='area').length,1);assert.equal(layout.nodes.filter(n=>n.kind==='memory').length,4);assert.deepEqual(m,before);
 let last=0;for(const count of [1,2,10,100,1000]){const r=areaRadius({memoryIds:Array.from({length:count},(_,i)=>String(i))});assert(r>=last&&r<=56);last=r;}assert.equal(areaRadius({memoryIds:['a','a']}),areaRadius({memoryIds:['a']}));
});
test('renderer uses full proposed topology, no separate preview halo; consent disclosure is available without a popup',()=>{
 const view=readFileSync(new URL('../src/memory/neural-memory-view.js',import.meta.url),'utf8'),toggle=readFileSync(new URL('../src/ui/research-access.js',import.meta.url),'utf8');assert(view.includes('concat(preview.layout.nodes)'));assert(view.includes('concat(preview.layout.edges)'));assert(!view.includes('preview.halo'));assert(!view.includes('ctx.arc(target.x,target.y'));assert(!toggle.includes('Turning on authorizes'));assert(!toggle.includes('<p id="research-consent">'));assert(!toggle.includes('globalThis.confirm'));assert(toggle.includes('Additional API costs may apply.'));
});
