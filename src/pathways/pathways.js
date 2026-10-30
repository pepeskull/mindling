import { classifyKnowledge, TAXONOMY_VERSION } from './knowledge-attribution.js';
import { knowledgeEvidence } from './knowledge-evidence.js';
import { SPECIALIZATIONS, specializationFor } from './specialization-taxonomy.js';
import { normalize } from '../learning/text.js';

// Existing onboarding identifiers, centralized without renaming any choice.
export const PATHWAY_DEFINITIONS = Object.freeze([
  ['Developer','Programming and technical problem-solving',['programming','software development','computer science','coding','programmering','web development','algorithms']],
  ['Social','Communication and collaboration',['communication','collaboration','social skills','kommunikation','samarbete','interpersonal communication','teamwork','social interaction']],
  ['Markets','Markets and financial analysis',['markets','financial markets','trading','stocks','finance','aktiemarknaden','investing','economics']],
  ['Gaming','Games and game strategy',['gaming','game design','game strategy','spelstrategi','video games','game development','game mechanics']],
  ['Researcher','Investigation and evidence gathering',['research','scientific method','evidence gathering','forskning','research methodology','scientific research','experiments','academic research']],
  ['Creator','Creative practice and expression',['creative writing','writing','art','design','creative practice','skrivande','visual arts','storytelling','music composition']],
  ['Analyst','Structured analysis and interpretation',['data analysis','statistics','statistical analysis','dataanalys','statistik','quantitative analysis','data interpretation','business analysis']],
  ['Assistant','Planning and practical support',['planning','task management','organization','planering','productivity','scheduling','administrative support']],
  ['General Intelligence','Cross-domain reasoning and knowledge integration',['general reasoning','interdisciplinary reasoning','problem solving','reasoning','tvärvetenskap','cross-domain reasoning','knowledge integration','logical reasoning']]
].map(([id,description,categories])=>Object.freeze({id,description,categories:Object.freeze(categories)})));
export const PATHWAYS = Object.freeze(PATHWAY_DEFINITIONS.map(item=>item.id));
export const DEFAULT_ORIGINS = Object.freeze(['Researcher','Social','Developer']);
export const PATHWAY_POLICY_VERSION = 3;
const EVIDENCE_LIMIT = 1000;
const list = value=>Array.isArray(value)?value:[];

export function originPathways(mind={}) {
  const explicit=Array.isArray(mind.originPathways);
  const raw=explicit?mind.originPathways:Array.isArray(mind.pathways)&&mind.pathways.length?mind.pathways:list(mind.pathwayRecords).filter(item=>item?.selected);
  const choices=[...new Set(list(raw).map(item=>typeof item==='string'?item:typeof item==='object'&&item?(item.name||item.title||item.pathway||item.id):'').filter(value=>typeof value==='string'&&value.trim()).map(value=>{const label=value.normalize('NFC').trim();return PATHWAYS.find(id=>normalize(id)===normalize(label))||label;}))];
  return {choices,source:explicit?'recorded-origin':'preserved-legacy-selections',unsupported:choices.filter(id=>!PATHWAYS.includes(id))};
}

export const classifyPathway=classifyKnowledge;

// Called from actual canonical claim/value formation in its existing transaction.
export function recordPathwayLearning(mind,memory,{eventId,activity,at,recordedAt=Date.now()}={}) {
  if(!mind?.id||typeof memory?.content!=='string'||!memory.id||!eventId||!list(mind.memories).some(item=>item.id===memory.id&&item.content===memory.content))return;
  const contentKey=normalize(memory.content);
  const evidence=list(mind.pathwayEvidence);
  if(!contentKey||evidence.some(item=>item.contentKey===contentKey))return;
  const attribution=classifyPathway(memory);
  if(!Object.hasOwn(mind,'originPathways'))mind.originPathways=[...originPathways(mind).choices];
  const item={id:`knowledge:${eventId}:${memory.id}`,mindlingId:mind.id,eventId,memoryId:memory.id,contentKey,
    source:'stored-knowledge',activity,at,recordedAt,policyVersion:PATHWAY_POLICY_VERSION,
    pathwayId:attribution.pathwayId,allocations:allocationsFor(attribution),units:attribution.pathwayId?1:0,attribution};
  mind.pathwayEvidence=[...evidence,item].slice(-EVIDENCE_LIMIT);
}

export function pathwayProfile(mind={}) {
  const origins=originPathways(mind),current=knowledgeEvidence(mind);
  const evidence=current.records.filter(row=>row.record).map(row=>({...row.record,pathwayId:row.usable?row.attribution.pathwayId:null,units:row.usable&&row.attribution.pathwayId?1:0,allocations:row.usable?allocationsFor(row.attribution):[],attribution:row.attribution}));
  const total=evidence.reduce((sum,item)=>sum+item.units,0);
  const pathways=SPECIALIZATIONS.filter(item=>!item.specific).map(definition=>{const rows=evidence.filter(item=>item.pathwayId===definition.id),units=rows.reduce((sum,item)=>sum+item.units,0),origin=origins.choices.some(id=>specializationFor(id)?.family===definition.id);return {id:definition.id,title:definition.title,description:definition.aliases[0],origin,evidenceUnits:units,evidenceCount:rows.length,originPriority:origin ? .25 : 0,priority:(origin ? .25 : 0)+(total?units/total:0),evidenceShare:total?units/total:null};}).sort((a,b)=>b.evidenceUnits-a.evidenceUnits||a.id.localeCompare(b.id,'en'));
  const times=evidence.map(item=>item.recordedAt).filter(Number.isFinite);
  return {origin:origins,pathways,evidence,totalUnits:total,unassigned:current.unassigned,contested:current.contested,unrecorded:current.unrecorded,specializations:current.specializations,domains:current.domains,
    lastUpdate:times.length?Math.max(...times):null,retentionLimit:EVIDENCE_LIMIT,ignoredEvidence:current.ignoredEvidence,independentlyVerifiedAbilityAvailable:false,providerEvaluationsUsedForStrength:false};
}

export function pathwayContext(mind={}) {
  const profile=pathwayProfile(mind);
  return {version:PATHWAY_POLICY_VERSION,origins:profile.origin.choices.filter(id=>id.length<=80).slice(0,20),originSource:profile.origin.source,
    priorities:profile.pathways.map(({id,priority,originPriority,evidenceUnits})=>({id,priority,originPriority,evidenceUnits})),
    developed:profile.pathways.filter(item=>item.evidenceUnits).map(({id,evidenceUnits,evidenceShare})=>({id,evidenceUnits,evidenceShare})),
    provenance:{source:'current-canonical-knowledge-and-recorded-events',records:profile.evidence.slice(-12).map(item=>({id:item.id,eventId:item.eventId,memoryId:item.memoryId,pathwayId:item.pathwayId,units:item.units,allocations:item.allocations||null,recordedAt:item.recordedAt,method:item.attribution.method,field:item.attribution.field||null,value:item.attribution.value||null})),retainedEvidence:profile.evidence.length,ignoredEvidence:profile.ignoredEvidence,unassigned:profile.unassigned,lastUpdate:profile.lastUpdate,independentAbilityAvailable:false,providerEvaluationsIncluded:false},
    missingAttribution:profile.unassigned>0||profile.ignoredEvidence>0||!profile.evidence.length};
}

// Preference only: consumers use this solely to resolve equal relevance scores.
export function memoryPriority(memory,context) {
  const classification=classifyPathway(memory),ids=classification.pathwayIds||(classification.pathwayId?[classification.pathwayId]:[]);
  return ids.length?ids.reduce((sum,id)=>sum+(context?.priorities?.find(item=>item.id===id)?.priority||0),0)/ids.length:0;
}

// Recorded conflicts win a relevance tie before any orientation preference.
// This is a context-preservation hint, never proof a conflicting claim is true.
export function learningTiePriority(memory,context) {
  return (Array.isArray(memory.contradictions)&&memory.contradictions.some(item=>typeof item?.claim==='string'&&item.claim.trim())?2:0)+memoryPriority(memory,context);
}

function allocationsFor(attribution){const ids=attribution.pathwayIds||(attribution.pathwayId?[attribution.pathwayId]:[]);return ids.map(id=>({id,units:1/ids.length}));}
export function reclassifyPathwayEvidence(mind,at){
  const memories=new Map(list(mind.memories).map(memory=>[memory.id,memory])),categories=new Map(list(mind.categories).map(category=>[category.id,category.name]));
  for(const item of list(mind.pathwayEvidence)){
    if(item.mindlingId!==mind.id||item.source!=='stored-knowledge'||![1,2,3].includes(item.policyVersion)||typeof item.contentKey!=='string'||!item.contentKey)continue;
    const memory=memories.get(item.memoryId);if(!memory||normalize(memory.content)!==item.contentKey)continue;
    const next=classifyKnowledge({...memory,category:categories.get(memory.categoryId)||memory.category});if(!next.pathwayId||item.policyVersion===3&&item.attribution?.version===TAXONOMY_VERSION&&JSON.stringify(next)===JSON.stringify(item.attribution))continue;
    item.classificationHistory=[...(item.classificationHistory||[]),{fromPolicy:item.policyVersion,toPolicy:3,at,method:'deterministic-saved-metadata',previous:{pathwayId:item.pathwayId,units:item.units,allocations:item.allocations||null,attribution:item.attribution},next}];
    item.pathwayId=next.pathwayId;item.units=1;item.allocations=allocationsFor(next);item.attribution=next;item.policyVersion=3;
  }
}
