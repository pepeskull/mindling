import {specializationFor} from '../pathways/specialization-taxonomy.js';

// Canonical area membership only. Claims and their original area IDs never move.
export function hierarchyLinks(hierarchy,areas){
 const known=new Set(areas.map(a=>a.id)),parents=new Map(),links=[];
 for(const link of hierarchy?.version===1&&Array.isArray(hierarchy.links)?hierarchy.links:[]){
  if(!known.has(link?.parentId)||!known.has(link?.childId)||link.parentId===link.childId||parents.has(link.childId))continue;
  let cursor=link.parentId,cycle=false;while(cursor){if(cursor===link.childId){cycle=true;break;}cursor=parents.get(cursor);}if(cycle)continue;
  parents.set(link.childId,link.parentId);links.push(link);
 }return links;
}
export function mergeProposal(graph,hierarchy,first,second){
 const fail=reason=>({valid:false,reason});
 if(hierarchy&&(hierarchy.version!==1||!Number.isSafeInteger(hierarchy.revision)||hierarchy.revision<0||!Array.isArray(hierarchy.links)||hierarchyLinks(hierarchy,graph.areas).length!==hierarchy.links.length))return fail('Existing hierarchy requires review before merging.');
 const a=graph.areas.find(a=>a.id===first),b=graph.areas.find(a=>a.id===second);if(!a||!b||a===b)return fail('Choose two existing knowledge areas.');
 const ta=specializationFor(a.label),tb=specializationFor(b.label);
 if(!ta||!tb||ta.family!==tb.family||ta.specific===tb.specific)return fail('No supported parent–child relationship.');
 const parent=ta.specific?b:a,child=ta.specific?a:b;
 const links=hierarchyLinks(hierarchy,graph.areas),parents=new Map(links.map(l=>[l.childId,l.parentId]));
 if(parents.has(child.id))return fail('This area already belongs to a parent.');
 let cursor=parent.id;while(cursor){if(cursor===child.id)return fail('A hierarchy cannot contain a cycle.');cursor=parents.get(cursor);}
 return {valid:true,parentId:parent.id,childId:child.id,revision:hierarchy?.revision||0,basis:{taxonomy:'specialization-taxonomy',parent:ta.specific?tb.id:ta.id,child:ta.specific?ta.id:tb.id}};
}
export function commitHierarchy(mind,graph,proposal){
 if(!proposal?.valid||(mind.knowledgeHierarchy?.revision||0)!==proposal.revision)throw Error('Knowledge hierarchy changed. Select the areas again.');
 const fresh=mergeProposal(graph,mind.knowledgeHierarchy,proposal.parentId,proposal.childId);
 if(!fresh.valid||fresh.parentId!==proposal.parentId)throw Error(fresh.reason||'Hierarchy validation failed.');
 return {...mind,knowledgeHierarchy:{version:1,revision:proposal.revision+1,links:[...hierarchyLinks(mind.knowledgeHierarchy,graph.areas),{parentId:fresh.parentId,childId:fresh.childId,basis:fresh.basis}]}};
}
export const areaRadius=area=>18+Math.min(24,Math.sqrt(Math.max(0,(area.descendantMemoryIds?.length||area.memoryIds.length)-area.memoryIds.length))*4);
export function projectHierarchy(areas,memories,edges,hierarchy){
 const byId=new Map(areas.map(a=>[a.id,a]));
 for(const a of areas){a.childIds=[];a.ancestorIds=[];a.descendantMemoryIds=[...a.memoryIds];}
 for(const link of hierarchyLinks(hierarchy,areas)){byId.get(link.childId).parentId=link.parentId;byId.get(link.parentId).childIds.push(link.childId);edges.push({from:link.parentId,to:link.childId,kind:'hierarchy',persisted:true,origin:'canonical-area-membership',sourceMemoryIds:[]});}
 for(const a of areas){let p=byId.get(a.parentId);while(p){a.ancestorIds.push(p.id);p.descendantMemoryIds.push(...a.memoryIds);p=byId.get(p.parentId);}a.rootId=a.ancestorIds.at(-1)||a.id;}
 for(const n of memories){const a=byId.get(n.areaId);n.rootAreaId=a.rootId;n.ancestorAreaIds=a.ancestorIds;n.areaPath=[...a.ancestorIds].reverse().map(id=>byId.get(id).label).concat(a.label);}
}
