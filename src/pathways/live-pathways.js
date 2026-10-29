import { sourceStatus } from '../memory/content-integrity.js';
import { originPathways } from './pathways.js';
import { specializationFor, broadSpecialization, SPECIALIZATION_POLICY as POLICY } from './specialization-taxonomy.js';
// All inputs come from the canonical graph projection, never pending tasks or
// rendered 'Other areas'. No memory, origin choice or evidence unit is mutated.
const readable=label=>typeof label==='string'?label.normalize('NFC').replace(/[\p{Cc}\p{Cf}]/gu,'').replace(/\s+/gu,' ').trim().slice(0,120):'';
const key=value=>readable(value).toLocaleLowerCase('en');
const technical=/^(?:(?:area|category|topic|memory):|(?:(?:area|category|topic|memory)[_-])?[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$)/i;
const unformed=/^(?:uncategorized|unclassified claims?|unsorted memories|other areas|emerging knowledge(?: \d+)?)$/i;
export function pathwayTitle(label){const subject=readable(label).replace(/^notes:\s*/i,'').trim();return !subject||technical.test(subject)||unformed.test(subject)?null:specializationFor(subject)?.title||`${subject} Explorer`;}
function classify(node,area){
  const label=readable(area.label),weak=/^notes:/i.test(label),category=specializationFor(label.replace(/^notes:\s*/i,'')),topic=specializationFor(node.raw.topic);
  if(category){
    const science=category.family==='science'&&['biology','physics','chemistry','medicine','mathematics'].includes(topic?.family);
    return {definition:!category.specific&&topic&&(topic.family===category.family||science)?topic:category,weak};
  }
  // Do not replace an unknown explicit category with a convenient topic label.
  return {definition:null,weak:true};
}
export function livePathways(graph={},state={}){
  const distribution=Array.isArray(graph.distribution)?graph.distribution:[],areas=new Map(distribution.map(area=>[area.id,area])),seen=new Set(),groups=new Map();
  for(const node of graph.memories||[]){
    const memory=node.raw,area=areas.get(node.areaId),kind=memory.intelligence?.kind||memory.kind;
    if(!area||node.historical||!readable(memory.content)||['preference','goal','intention','historical'].includes(kind)||memory.contradictions?.length||sourceStatus(memory)==='incomplete')continue;
    const content=key(memory.content);if(seen.has(content))continue;seen.add(content);
    const {definition,weak}=classify(node,area),family=definition?.family||`area:${area.id}`;
    if(!pathwayTitle(area.label))continue;
    if(!groups.has(family))groups.set(family,{id:family,area:definition?broadSpecialization(family).aliases[0]:readable(area.label),records:[],areaIds:new Set(),specific:new Map()});
    const group=groups.get(family),provenance=Boolean(memory.source||memory.native?.provenance||memory.analysis||memory.research);
    const row={node,weak,strong:!weak&&provenance,topic:key(memory.topic||memory.concept),submission:memory.submissionId||memory.parentMemoryId||node.recordId};
    group.records.push(row);group.areaIds.add(area.id);
    if(definition?.specific){if(!group.specific.has(definition.id))group.specific.set(definition.id,{definition,rows:[]});group.specific.get(definition.id).rows.push(row);}
  }
  const diversity=rows=>({topics:new Set(rows.map(row=>row.topic).filter(Boolean)).size,submissions:new Set(rows.map(row=>row.submission)).size,strong:rows.filter(row=>row.strong).length});
  const relationships=rows=>{const ids=new Set(rows.map(row=>row.node.recordId)),links=new Set();for(const row of rows)for(const target of row.node.raw.relatedMemoryIds||[])if(ids.has(target)&&target!==row.node.recordId)links.add([row.node.recordId,target].sort().join('|'));return links.size;};
  const candidates=[];
  for(const group of groups.values()){
    const rows=group.records,d=diversity(rows),links=relationships(rows);
    if(rows.length<POLICY.broadClaims||d.topics<POLICY.broadTopics||d.submissions<POLICY.broadSubmissions||!(d.strong>=2||rows.length>=4&&links>=1))continue;
    const specific=[...group.specific.values()].filter(item=>{const e=diversity(item.rows);return item.rows.length>=POLICY.specificClaims&&item.rows.length/rows.length>=POLICY.specificShare&&e.topics>=POLICY.specificTopics&&e.submissions>=POLICY.specificSubmissions&&e.strong>=3&&relationships(item.rows)>=POLICY.specificRelationships;}).sort((a,b)=>b.rows.length-a.rows.length||a.definition.id.localeCompare(b.definition.id,'en'))[0];
    const broad=broadSpecialization(group.id),title=specific?.definition.title||broad?.title||pathwayTitle(group.area);
    candidates.push({id:group.id,title,area:group.area,count:rows.length,share:graph.stats?.current?rows.length/graph.stats.current:0,source:'knowledge',specific:Boolean(specific),topics:d.topics,relationships:links});
  }
  candidates.sort((a,b)=>b.count-a.count||(a.id<b.id?-1:a.id>b.id?1:0));const selected=candidates.slice(0,3),families=new Set(selected.map(item=>item.id));
  for(const title of originPathways(state).choices){
    if(selected.length>=3)break;const family=title==='Developer'?'technology':title==='Markets'?'economics':null;
    if(technical.test(title)||selected.some(item=>item.title===title)||family&&families.has(family))continue;
    selected.push({id:`origin:${title}`,title,area:'Origin interest',count:null,share:null,source:'origin'});if(family)families.add(family);
  }
  while(selected.length<3)selected.push({id:`emerging:${selected.length}`,title:'Emerging Pathway',area:'Develops through learning.',count:null,share:null,source:'emerging'});
  return selected;
}
