import { graphData } from '../memory/graph-data.js';
import { normalize } from '../learning/text.js';
import { sourceStatus } from '../memory/content-integrity.js';
import { classifyKnowledge } from './knowledge-attribution.js';
import { SPECIALIZATIONS, broadSpecialization, SPECIALIZATION_POLICY as POLICY } from './specialization-taxonomy.js';
const list=value=>Array.isArray(value)?value:[];
// One canonical selector for domain evidence, narrow evidence and current titles.
export function knowledgeEvidence(mind={},graph=graphData(mind)){
  const identity=mind.mindlingId||mind.id,seen=new Set(),recorded=new Map(),records=[],groups=new Map();let ignoredEvidence=0;
  for(const item of list(mind.pathwayEvidence)){
    if(!item||item.mindlingId!==identity||item.source!=='stored-knowledge'||![1,2,3].includes(item.policyVersion)||typeof item.contentKey!=='string'||!item.contentKey||typeof item.id!=='string'||!item.id||typeof item.eventId!=='string'||!item.eventId||typeof item.memoryId!=='string'||!item.memoryId||![0,1].includes(item.units)||!Number.isFinite(item.recordedAt)||!Number.isFinite(new Date(item.recordedAt).getTime())){ignoredEvidence++;continue;}
    const key=JSON.stringify([item.memoryId,item.contentKey]);if(recorded.has(key)){ignoredEvidence++;continue;}recorded.set(key,item);
  }
  const areaNames=new Map(graph.areas.map(area=>[area.id,area.label]));
  for(const node of graph.memories){
    const memory=node.raw,kind=memory.intelligence?.kind||memory.kind,content=typeof memory.content==='string'?normalize(memory.content):'';
    if(node.historical||!content||seen.has(content)||['preference','goal','intention','historical'].includes(kind)||sourceStatus(memory)==='incomplete')continue;seen.add(content);
    const record=recorded.get(JSON.stringify([node.recordId,content])),attribution=classifyKnowledge({...memory,category:areaNames.get(node.areaId)||memory.category});
    const usable=!(memory.contradictions?.length),strong=Boolean(!attribution.weak&&(memory.source||memory.native?.provenance||memory.analysis||memory.research));
    const row={node,record,attribution,usable,strong,submission:memory.submissionId||memory.parentMemoryId||node.recordId,contentKey:content};records.push(row);
    if(!usable||!attribution.pathwayId)continue;
    if(!groups.has(attribution.pathwayId))groups.set(attribution.pathwayId,{id:attribution.pathwayId,definition:broadSpecialization(attribution.pathwayId),rows:[],specific:new Map()});
    const group=groups.get(attribution.pathwayId);group.rows.push(row);
    for(const id of attribution.specializationIds){if(!group.specific.has(id))group.specific.set(id,{definition:SPECIALIZATIONS.find(item=>item.id===id),rows:[]});group.specific.get(id).rows.push(row);}
  }
  const diversity=rows=>({topics:new Set(rows.flatMap(row=>row.attribution.topicIds)).size,submissions:new Set(rows.map(row=>row.submission)).size,canonicalTopics:new Set(rows.map(row=>normalize(row.node.raw.topic||row.node.raw.concept||''))).size,strong:rows.filter(row=>row.strong).length});
  const relationships=rows=>{const ids=new Set(rows.map(row=>row.node.recordId)),pairs=new Set();for(const row of rows)for(const target of list(row.node.raw.relatedMemoryIds))if(ids.has(target)&&target!==row.node.recordId)pairs.add(JSON.stringify([row.node.recordId,target].sort()));return pairs.size;};
  const domains=[],specializations=[],candidates=[];
  for(const group of groups.values()){
    const d=diversity(group.rows),links=relationships(group.rows),broadReady=group.rows.length>=POLICY.broadClaims&&d.canonicalTopics>=POLICY.broadTopics&&d.submissions>=POLICY.broadSubmissions&&(d.strong>=2||group.rows.length>=4&&links>=1);
    domains.push({id:group.id,title:group.definition.title,area:group.definition.aliases[0],count:group.rows.length,evidenceUnits:group.rows.filter(row=>row.record).length,ready:broadReady});
    const narrow=[...group.specific.values()].map(item=>{const e=diversity(item.rows),related=relationships(item.rows);return {id:item.definition.id,family:group.id,title:item.definition.title,count:item.rows.length,topics:e.topics,relationships:related,evidenceUnits:item.rows.filter(row=>row.record).length,
      ready:item.rows.length>=POLICY.specificClaims&&item.rows.length/group.rows.length>=POLICY.specificShare&&e.topics>=POLICY.specificTopics&&e.submissions>=POLICY.specificSubmissions&&e.strong>=3&&related>=POLICY.specificRelationships};}).sort((a,b)=>b.count-a.count||a.id.localeCompare(b.id,'en'));
    specializations.push(...narrow);
    if(broadReady){const best=narrow.find(item=>item.ready);candidates.push({id:group.id,title:best?.title||group.definition.title,area:group.definition.aliases[0],count:group.rows.length,share:graph.stats.current?group.rows.length/graph.stats.current:0,source:'knowledge',specific:Boolean(best),topics:d.canonicalTopics,relationships:links});}
  }
  domains.sort((a,b)=>b.count-a.count||a.id.localeCompare(b.id,'en'));candidates.sort((a,b)=>b.count-a.count||(a.id<b.id?-1:a.id>b.id?1:0));
  const retainedMatches=records.filter(row=>row.record).length;ignoredEvidence+=Math.max(0,recorded.size-retainedMatches);
  return {records,domains,specializations,candidates,ignoredEvidence,unassigned:records.filter(row=>row.record&&!row.attribution.pathwayId).length,contested:records.filter(row=>!row.usable).length,unrecorded:records.filter(row=>!row.record).length};
}
