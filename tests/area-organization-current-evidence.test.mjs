import test from 'node:test';
import assert from 'node:assert/strict';
import {graphData} from '../src/memory/graph-data.js';
import {semanticCandidates,validateSemanticResult} from '../src/semantic/model-contract.js';
import {decodeSemanticWire} from '../src/semantic/model-wire.js';
import {persistAreaRelations} from '../src/semantic/area-relations.js';
import {organizeAreas} from '../src/semantic/organize-areas.js';
import {mergeProposal} from '../src/memory/knowledge-hierarchy.js';
const mem=(id,category,content)=>({id,categoryId:id,category,content,source:'SERVICE',contentIntegrity:{version:1,status:'captured',length:content.length},analysis:{name:'mindling-learning-service',verification:'unverified-player-claim'},intelligence:{kind:'claim',current:true}});
function fixture(){return {memories:[mem('h','Ice hockey','Ice hockey is a sport.'),mem('s','Sports','Sports include ice hockey and association football.'),mem('f','Association football','Association football is a sport.'),mem('c','Sports classification','Sports classification describes ways of grouping sports.')]};}
function assess(m,from,to,type='narrower-than',support='supported'){
 const g=graphData(m),ctx=semanticCandidates(m,[from],{limit:4,includeAreaReconsideration:true});
 const a=g.areas.find(a=>a.memoryIds.includes(from)),b=g.areas.find(a=>a.memoryIds.includes(to));
 const pair=ctx.pairs.findIndex(p=>[p.a.id,p.b.id].includes(from)&&[p.a.id,p.b.id].includes(to));assert(pair>=0);
 const r={from:a.id,to:b.id,type,pair,evidenceA:{first:0,last:0},evidenceB:{first:0,last:0},support,scopePreserved:true,reason:'Authored mock assessment of explicit fixture claims.'};
 const selected=validateSemanticResult(decodeSemanticWire({version:1,relationships:[],areaRelationships:[r]},ctx),ctx).areas;
 persistAreaRelations(m,selected.accepted,g.areas);return selected;
}
test('current evidence returning invalidates organization cache without a new inference or relation revision',()=>{
 let m=fixture();assess(m,'h','s');const revision=m.semanticAreaRelations.revision;
 m.memories[0].intelligence.current=false;m=organizeAreas(m);assert.equal(m.knowledgeHierarchy,undefined);
 m.memories[0].intelligence.current=true;const before=JSON.stringify(m.memories);m=organizeAreas(m);
 assert.equal(m.knowledgeHierarchy?.links.length,1);assert.equal(m.semanticAreaRelations.revision,revision);assert.equal(JSON.stringify(m.memories),before);
 assert.equal(organizeAreas(m),m);
});
test('existing shared parent is organized, classification stays related and no parent is invented',()=>{
 let m=fixture();assess(m,'h','s');assess(m,'f','s');assess(m,'c','s','related-to');const before=JSON.stringify(m.memories);
 m=organizeAreas(m);const g=graphData(m),area=id=>g.areas.find(a=>a.memoryIds.includes(id));
 assert.equal(area('h').parentId,area('s').id);assert.equal(area('f').parentId,area('s').id);assert.equal(area('c').parentId,undefined);
 assert.equal(mergeProposal(g,m.knowledgeHierarchy,area('c').id,area('s').id).code,'ASSOCIATION_ONLY');assert.equal(JSON.stringify(m.memories),before);
 const noParent=fixture();noParent.memories=noParent.memories.filter(m=>m.id!=='s');assert.equal(organizeAreas(noParent),noParent);assert.equal(graphData(noParent).areas.length,3);
});
test('uncertain and unsupported proposals remain nonauthoritative',()=>{
 for(const support of ['uncertain','unsupported']){const m=fixture(),result=assess(m,'h','s','narrower-than',support);assert.equal(result.accepted.length,0);assert.equal(result.rejections[0].code,'AREA_SUPPORT_INSUFFICIENT');assert.equal(organizeAreas(m).knowledgeHierarchy,undefined);}
});
