import { specializationFor, structuredTopicFacets } from './specialization-taxonomy.js';
import { sourceStatus } from '../memory/content-integrity.js';
const label=value=>typeof value==='string'?value.normalize('NFC').trim():'';
export const TAXONOMY_VERSION=1;
export function classifyKnowledge(memory={}){
  const kind=memory.intelligence?.kind||memory.kind;
  const empty=reason=>({version:TAXONOMY_VERSION,pathwayId:null,pathwayIds:[],specializationIds:[],topicIds:[],method:'unassigned',reason});
  if(memory.supersededBy||memory.intelligence?.current===false||['preference','goal','intention','historical'].includes(kind)||sourceStatus(memory)==='incomplete')return empty('Not a current complete knowledge claim');
  const field=label(memory.category)?'category':label(memory.areaSuggestion)?'areaSuggestion':label(memory.topic)?'topic':'concept',value=label(memory[field]);
  const weak=/^notes:\s*/i.test(value),categoryLabel=value.replace(/^notes:\s*/i,''),base=specializationFor(categoryLabel),topic=specializationFor(memory.topic);
  let definition=base;
  if(!definition&&weak){const facets=structuredTopicFacets(categoryLabel),families=[...new Set(facets.map(item=>item.family))];if(families.length===1)definition=specializationFor(families[0]);}
  if(!definition)return {...empty('No supported structured domain; claim text was not mined'),field,value};
  if(definition.family==='science'&&['biology','physics','chemistry','medicine','mathematics'].includes(topic?.family))definition=topic;
  const family=definition.family,facets=structuredTopicFacets([memory.topic,memory.concept].map(label).join(' '),family);
  const specific=[...new Set([...(definition.specific?[definition.id]:[]),...(topic?.family===family&&topic.specific?[topic.id]:[]),...facets.map(item=>item.specializationId)])];
  const topicIds=facets.map(item=>item.id);
  if(!topicIds.length&&label(memory.topic))topicIds.push(`label:${label(memory.topic).toLocaleLowerCase('en').slice(0,100)}`);
  return {version:TAXONOMY_VERSION,pathwayId:family,pathwayIds:[family],specializationIds:specific,topicIds,method:weak?'structured-native-label-and-topics':'structured-domain-and-topics',field,value,weak,
    reason:'Deterministic attribution from saved domain/topic metadata; not historical model classification or factual verification'};
}
