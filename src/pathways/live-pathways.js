import { knowledgeEvidence } from './knowledge-evidence.js';
import { originPathways } from './pathways.js';
import { specializationFor } from './specialization-taxonomy.js';
// All inputs come from the canonical graph projection, never pending tasks or
// rendered 'Other areas'. No memory, origin choice or evidence unit is mutated.
const readable=label=>typeof label==='string'?label.normalize('NFC').replace(/[\p{Cc}\p{Cf}]/gu,'').replace(/\s+/gu,' ').trim().slice(0,120):'';
const technical=/^(?:(?:area|category|topic|memory):|(?:(?:area|category|topic|memory)[_-])?[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$)/i;
const unformed=/^(?:uncategorized|unclassified claims?|unsorted memories|other areas|emerging knowledge(?: \d+)?)$/i;
export function pathwayTitle(label){const subject=readable(label).replace(/^notes:\s*/i,'').trim();return !subject||technical.test(subject)||unformed.test(subject)?null:specializationFor(subject)?.title||`${subject} Explorer`;}
export function livePathways(graph={},state={}){
  const selected=knowledgeEvidence(state,graph).candidates.slice(0,3),families=new Set(selected.map(item=>item.id));
  for(const title of originPathways(state).choices){
    if(selected.length>=3)break;const family=title==='Developer'?'technology':title==='Markets'?'economics':null;
    if(technical.test(title)||selected.some(item=>item.title===title)||family&&families.has(family))continue;
    selected.push({id:`origin:${title}`,title,area:'Origin interest',count:null,share:null,source:'origin'});if(family)families.add(family);
  }
  while(selected.length<3)selected.push({id:`emerging:${selected.length}`,title:'Emerging Pathway',area:'Develops through learning.',count:null,share:null,source:'emerging'});
  return selected;
}
