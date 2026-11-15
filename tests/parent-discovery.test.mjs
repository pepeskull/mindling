import test from 'node:test';import assert from 'node:assert/strict';
import {PARENT_DISCOVERY_ENABLED,discoveryContext,persistParents} from '../src/semantic/parent-discovery.js';
import {semanticCandidates,validateSemanticResult,semanticPairReceipt} from '../src/semantic/model-contract.js';
import {semanticTransportSchema,decodeSemanticWire} from '../src/semantic/model-wire.js';
import {graphData} from '../src/memory/graph-data.js';
const memory=(id,name,text)=>({id,categoryId:id,category:name,content:text,source:'SERVICE',contentIntegrity:{version:1,status:'captured',length:text.length},analysis:{name:'mindling-learning-service',verification:'unverified-player-claim'},intelligence:{kind:'claim',current:true}});
const fixture=()=>({categories:[],memories:[memory('h','Ice hockey','Ice hockey is a sport.'),memory('f','Association football','Association football is a sport.')]});
function proposal(m,name='Sport',reuseCategoryId=null){const context=discoveryContext(m,semanticCandidates(m,['h'],{includeAreaReconsideration:true}));const p={name,meaning:'Organized physical competitive activities.',reuseCategoryId,children:context.areas.filter(a=>a.memoryIds.length).map(a=>{const side=context.pairs[0].a.id===a.memoryIds[0]?'a':'b';return {areaId:a.id,pair:0,side,first:0,last:0,support:'supported',scopePreserved:true,reason:'Authored fixture explicitly states domain membership.'};})};return {context,wire:{version:1,relationships:[],areaRelationships:[],parentCategories:[p]}};}
const verdict=(wire,context)=>validateSemanticResult(decodeSemanticWire(wire,context),context).parents;
test('new parent is app-identified, atomically linked and projected without moving canonical memories',()=>{
 const m=fixture(),before=JSON.stringify(m.memories),{context,wire}=proposal(m),v=verdict(wire,context);assert.equal(v.accepted.length,1);
 assert.deepEqual(persistParents(m,v.accepted,context),['PARENT_PERSISTED']);assert.equal(JSON.stringify(m.memories),before);
 const g=graphData(m),parent=g.areas.find(a=>a.label==='Sport');assert.equal(parent.memoryIds.length,0);assert.equal(parent.childIds.length,2);assert.equal(g.stats.canonical,2);assert.equal(g.areas.filter(a=>!a.parentId).length,1);
 assert.match(m.categories[0].id,/^category-/);assert.notEqual(parent.label,parent.id);
 assert.deepEqual(graphData(JSON.parse(JSON.stringify(m))).edges,g.edges);
 const after=JSON.stringify(m);assert.deepEqual(persistParents(m,v.accepted,context),['PARENT_REGISTRY_CHANGED']);assert.equal(JSON.stringify(m),after);
});
test('existing semantic identity reused, duplicate label or insufficient evidence rejected',()=>{
 const m=fixture();m.categories=[{id:'existing',name:'Sport'}];let {context,wire}=proposal(m);
 assert.equal(verdict(wire,context).accepted.length,0);
 ({context,wire}=proposal(m,'Sport','existing'));assert.deepEqual(persistParents(m,verdict(wire,context).accepted,context),['PARENT_PERSISTED']);assert.equal(m.categories.length,1);assert.equal(m.categories[0].id,'existing');
 for(const change of [p=>p.children[0].support='uncertain',p=>p.children[0].first=999,p=>p.children[0].areaId='unknown',p=>p.id='invented',p=>p.name='category-private']){const f=fixture(),q=proposal(f);change(q.wire.parentCategories[0]);assert.equal(verdict(q.wire,q.context).accepted.length,0);assert.equal(f.categories.length,0);}
});
test('stale evidence and cycles roll back category creation and all child links',()=>{
 const m=fixture(),q=proposal(m),v=verdict(q.wire,q.context);m.memories[0].content='Changed evidence.';const before=JSON.stringify(m);assert.deepEqual(persistParents(m,v.accepted,q.context),['PARENT_STALE_EVIDENCE']);assert.equal(JSON.stringify(m),before);
 const f=fixture();f.categories=[{id:'h',name:'Ice hockey'}];const cycle=proposal(f,'Ice hockey','h');const initial=JSON.stringify(f);assert.deepEqual(persistParents(f,verdict(cycle.wire,cycle.context).accepted,cycle.context),['PARENT_CONFLICT']);assert.equal(JSON.stringify(f),initial);
});
test('feature disabled by default, provider grammar structural, old receipts reconsidered once only',()=>{
 assert.equal(PARENT_DISCOVERY_ENABLED,false);const m=fixture(),q=proposal(m);const schema=semanticTransportSchema(q.context);assert(schema.required.includes('parentCategories'));assert.equal(schema.properties.parentCategories.items.additionalProperties,false);
 const receipt=semanticPairReceipt(q.context.pairs[0]);m.learningTasks=[{semanticAttempts:[{state:'COMPLETED',pairs:[receipt],areaPairs:[receipt]}]}];
 const opts={includeAreaReconsideration:true,includeHistoricalAreas:true,includeParentDiscovery:true};assert.equal(semanticCandidates(m,['h'],opts).pairs.length,1);
 m.learningTasks[0].semanticAttempts[0].parentPairs=[receipt];assert.equal(semanticCandidates(m,['h'],opts).pairs.length,0);
 m.learningTasks[0].semanticAttempts[0].state='OUTCOME_UNKNOWN';assert.equal(semanticCandidates(m,['h'],opts).pairs.length,0);
});
test('conflicting existing parents cannot cause partial category persistence',()=>{
 const m=fixture(),q=proposal(m),v=verdict(q.wire,q.context),g=graphData(m);
 m.knowledgeHierarchy={version:1,revision:1,links:[{parentId:g.areas[0].id,childId:g.areas[1].id}]};
 const before=JSON.stringify(m);assert.deepEqual(persistParents(m,v.accepted,q.context),['PARENT_CONFLICT']);assert.equal(JSON.stringify(m),before);
});
test('new evidence is reconsidered but unknown dispatch and registry bounds remain protected',()=>{
 const m=fixture(),q=proposal(m),receipt=semanticPairReceipt(q.context.pairs[0]);m.learningTasks=[{semanticAttempts:[{state:'COMPLETED',pairs:[receipt],areaPairs:[receipt],parentPairs:[receipt]}]}];
 m.memories.push({...m.memories[0],id:'h-new',content:'Ice hockey is a competitive sport.',contentIntegrity:{version:1,status:'captured',length:'Ice hockey is a competitive sport.'.length}});
 assert(semanticCandidates(m,['h-new'],{includeAreaReconsideration:true,includeParentDiscovery:true}).pairs.length>0);
 const ctx=semanticCandidates(fixture(),['h']);assert.equal(discoveryContext({categories:Array.from({length:'Ice hockey is a competitive sport.'.length},(_,i)=>({id:'c'+i,name:'Area '+i}))},ctx),ctx);
});
test('matching stored meaning cannot create a second category under another label',()=>{
 const m=fixture();m.categories=[{id:'existing',name:'Existing label',organization:{version:1,meaning:'Organized physical competitive activities.'}}];
 const q=proposal(m);assert.equal(verdict(q.wire,q.context).accepted.length,0);assert.equal(m.categories.length,1);
});
