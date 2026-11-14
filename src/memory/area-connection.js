// Connect reuses a durable, current model decision; it never authors evidence.
import {persistAreaRelations} from '../semantic/area-relations.js';
export function connectionProposal(graph,from,to){
 if(from===to||![from,to].every(id=>graph.areas.some(a=>a.id===id)))return {valid:false,reason:'Choose two different knowledge areas.'};
 const records=(graph.areaRelations||[]).filter(r=>r.type==='related-to'&&[r.from,r.to].includes(from)&&[r.from,r.to].includes(to));
 if(!records.length)return {valid:false,reason:'No validated association is stored for these areas. Authorized learning may assess new evidence; Connect does not request AI analysis.'};
 return {valid:true,operation:'connect',from,to,decision:records[0].id,areaRevision:graph.areaRevision||0};
}
export function commitConnection(mind,graph,proposal){
 const fresh=connectionProposal(graph,proposal.from,proposal.to);
 if(!fresh.valid||fresh.decision!==proposal.decision||fresh.areaRevision!==proposal.areaRevision)throw Error('The association evidence changed. Select the areas again.');
 const relation=graph.areaRelations.find(r=>r.id===fresh.decision);
 const outcomes=persistAreaRelations(mind,[relation],graph.areas);
 if(!outcomes.every(code=>['AREA_PERSISTED','AREA_UNCHANGED'].includes(code)))throw Error('Association could not be retained.');
 return mind;
}
