import {materialize} from './evidence-spans.js';
import {persistAreaRelations} from './area-relations.js';
import {graphData} from '../memory/graph-data.js';
import {mergeProposal,commitHierarchy} from '../memory/knowledge-hierarchy.js';
// Requires a reviewed client build AND server opt-in. No setting or URL enables it.
export const PARENT_DISCOVERY_ENABLED=false;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const text=(v,n)=>typeof v==='string'&&v===v.trim()&&v.length>0&&v.length<=n&&!/[\p{Cc}\p{Cf}]/u.test(v);
const publicText=(v,n)=>text(v,n)&&!/(?:category-[a-z0-9-]+|area:|[a-f0-9]{8}-[a-f0-9-]{27})/iu.test(v);
const fold=s=>s.normalize('NFC').toLowerCase().trim();
const registryOf=mind=>{const categories=[...(mind.categories||[])];for(const m of mind.memories||[])if(m.categoryId&&m.category&&!categories.some(c=>c.id===m.categoryId))categories.push({id:m.categoryId,name:m.category});return categories;};
export function discoveryContext(mind,context){
 const categories=registryOf(mind);
 // Never create against an unseen registry; defer larger registries in Phase 1.
 if(categories.length>32||categories.some(c=>!text(c.id,100)||!text(c.name,80)))return context;
 return {...context,parentDiscovery:{version:1,categories:categories.map(c=>({id:c.id,name:c.name,meaning:c.organization?.meaning||null}))}};
}
export function validateDiscoveryContext(v){
 if(!exact(v,['version','categories'])||v.version!==1||!Array.isArray(v.categories)||v.categories.length>32||new Set(v.categories.map(c=>c.id)).size!==v.categories.length)throw Error('Invalid parent discovery context');
 for(const c of v.categories)if(!exact(c,['id','name','meaning'])||!text(c.id,100)||!text(c.name,80)||!(c.meaning===null||text(c.meaning,240)))throw Error('Invalid category registry');
}
const fields={name:{type:'string'},meaning:{type:'string'},reuseCategoryId:{type:['string','null']},children:{type:'array',items:{type:'object',additionalProperties:false,required:['areaId','pair','side','first','last','support','scopePreserved','reason'],properties:{areaId:{type:'string'},pair:{type:'integer'},side:{type:'string',enum:['a','b']},first:{type:'integer'},last:{type:'integer'},support:{type:'string',enum:['supported','uncertain','unsupported']},scopePreserved:{type:'boolean'},reason:{type:'string'}}}}};
export const parentSchema={type:'array',items:{type:'object',additionalProperties:false,required:Object.keys(fields),properties:fields}};
export const PARENT_INSTRUCTIONS='When parentDiscovery is supplied, return parentCategories (at most one proposal, two to four distinct existing child areas). Propose a concise human-readable name and meaning, not a database ID. Compare the complete supplied category registry; reuseCategoryId must reference a fitting existing category or be null only when none fits. Labels alone are not evidence. For EACH child identify its supplied areaId and a pair/side with exact first/last sentence indices that support domain containment, with scopePreserved=true and support=supported only when all qualifications permit it. A shared topic, instance, part or association is not domain containment. Do not infer a parent merely from category names or outside knowledge. Abstain with [] if support or reuse is uncertain. Name max80, meaning max240, reason max240. No new sources, private reasoning or invented IDs.';
export function validateParents(proposals,context){
 if(!context.parentDiscovery){if(proposals!==undefined)throw Error('Parent discovery disabled');return {accepted:[],rejections:[]};}
 if(!Array.isArray(proposals)||proposals.length>1)throw Error('Invalid parent envelope');
 const accepted=[],rejections=[];
 for(const [index,p] of proposals.entries()){
  try{
   if(!exact(p,Object.keys(fields))||!publicText(p.name,80)||!publicText(p.meaning,240)||!Array.isArray(p.children)||p.children.length<2||p.children.length>4)throw Error();
   const registry=context.parentDiscovery.categories;if(registry.some(c=>c.id===p.name)||context.areas?.some(a=>a.id===p.name))throw Error();const existing=registry.find(c=>c.id===p.reuseCategoryId),matches=registry.filter(c=>fold(c.name)===fold(p.name)||c.meaning&&fold(c.meaning)===fold(p.meaning));
   if(p.reuseCategoryId!==null&&!existing||matches.length>1||matches.length&&matches[0].id!==existing?.id||existing&&existing.name!==p.name||existing?.meaning&&existing.meaning!==p.meaning)throw Error();
   const children=[],seen=new Set();
   for(const c of p.children){
    if(!exact(c,['areaId','pair','side','first','last','support','scopePreserved','reason'])||!Number.isInteger(c.pair)||!['a','b'].includes(c.side)||c.support!=='supported'||c.scopePreserved!==true||!publicText(c.reason,240)||seen.has(c.areaId))throw Error();
    const area=context.areas?.find(a=>a.id===c.areaId),snapshot=context.pairs[c.pair]?.[c.side],span=snapshot&&materialize({first:c.first,last:c.last},snapshot.text);
    if(!area||!snapshot||!area.memoryIds.includes(snapshot.id)||!span)throw Error();
    seen.add(c.areaId);children.push({area,evidence:[{snapshot,span}],reason:c.reason});
   }
   accepted.push({...p,children});
  }catch{rejections.push({index,code:'PARENT_PROPOSAL_UNSUPPORTED'});}
 }
 return {accepted,rejections};
}
// Called only inside the existing authorized semantic state transaction.
export function persistParents(mind,accepted,context){
 const outcomes=[];
 for(const p of accepted){
  const draft=structuredClone(mind),registry=draft.categories||=[];
  if(JSON.stringify(registryOf(draft).map(c=>({id:c.id,name:c.name,meaning:c.organization?.meaning||null})))!==JSON.stringify(context.parentDiscovery.categories)){outcomes.push('PARENT_REGISTRY_CHANGED');continue;}
  let category=registry.find(c=>c.id===p.reuseCategoryId);
  if(!category&&p.reuseCategoryId){const legacy=registryOf(draft).find(c=>c.id===p.reuseCategoryId);if(legacy){category={...legacy};registry.push(category);}}
  if(!category){if(registry.some(c=>fold(c.name)===fold(p.name))){outcomes.push('PARENT_DUPLICATE');continue;}category={id:`category-${crypto.randomUUID()}`,name:p.name,organization:{version:1,meaning:p.meaning}};registry.push(category);}
  // Existing categories without direct memories also need an organizational node.
  category.organization||={version:1,meaning:p.meaning};
  let graph=graphData(draft);const parent=graph.areas.find(a=>a.categoryId===category.id);
  if(!parent){outcomes.push('PARENT_PROJECTION_INVALID');continue;}
  if(p.children.some(c=>c.area.id===parent.id)){outcomes.push('PARENT_CONFLICT');continue;}
  const relations=p.children.map(c=>({version:1,from:c.area.id,to:parent.id,type:'narrower-than',direction:'from-to',reason:c.reason,validation:'model-supported-not-independently-verified',areas:[{id:c.area.id,label:c.area.label},{id:parent.id,label:parent.label}],evidence:c.evidence}));
  const stored=persistAreaRelations(draft,relations,graph.areas);
  if(stored.some(s=>!['AREA_PERSISTED','AREA_UNCHANGED'].includes(s))){outcomes.push('PARENT_STALE_EVIDENCE');continue;}
  let staged=draft,valid=true;
  for(const child of p.children){graph=graphData(staged);const current=graph.areas.find(a=>a.id===child.area.id);if(current?.parentId===parent.id)continue;const proposal=mergeProposal(graph,staged.knowledgeHierarchy,child.area.id,parent.id);if(!proposal.valid||proposal.parentId!==parent.id){valid=false;break;}staged=commitHierarchy(staged,graph,proposal);}
  if(!valid){outcomes.push('PARENT_CONFLICT');continue;}
  mind.categories=staged.categories;mind.semanticAreaRelations=staged.semanticAreaRelations;mind.knowledgeHierarchy=staged.knowledgeHierarchy;outcomes.push('PARENT_PERSISTED');
 }
 return outcomes;
}
