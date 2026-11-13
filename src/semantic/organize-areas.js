import {graphData} from '../memory/graph-data.js';
import {mergeProposal,commitHierarchy} from '../memory/knowledge-hierarchy.js';
// Reuse established model decisions at existing atomic write boundaries. No
// inference, record reassignment, multiple-parent choice or navigation dispatch.
export function organizeAreas(mind){
 if(!mind?.semanticAreaRelations?.records?.some(r=>r.validation==='model-supported-not-independently-verified'))return mind;
 const revision=()=>JSON.stringify([mind.semanticAreaRelations.revision,mind.knowledgeHierarchy?.revision||0]);
 if(mind.areaOrganizationRevision===revision())return mind;
 let current=mind,graph=graphData(current);
 const children=new Set(graph.areaRelations.filter(r=>r.validation==='model-supported-not-independently-verified'&&['broader-than','narrower-than'].includes(r.type)).map(r=>r.type==='broader-than'?r.to:r.from));
 for(const child of [...children].slice(0,16)){
  if(graph.areas.find(a=>a.id===child)?.parentId)continue;
  const proposals=graph.areas.map(a=>mergeProposal(graph,current.knowledgeHierarchy,child,a.id)).filter(p=>p.valid&&p.childId===child);
  const parents=new Map(proposals.map(p=>[p.parentId,p]));if(parents.size!==1)continue;
  current=commitHierarchy(current,graph,[...parents.values()][0]);graph=graphData(current);
 }
 return {...current,areaOrganizationRevision:JSON.stringify([current.semanticAreaRelations.revision,current.knowledgeHierarchy?.revision||0])};
}
