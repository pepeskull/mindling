import { normalize } from '../learning/text.js';

// Existing onboarding identifiers, centralized without renaming any choice.
export const PATHWAY_DEFINITIONS = Object.freeze([
  ['Developer','Programming and technical problem-solving',['programming','software development','computer science','coding','programmering']],
  ['Social','Communication and collaboration',['communication','collaboration','social skills','kommunikation','samarbete']],
  ['Markets','Markets and financial analysis',['markets','financial markets','trading','stocks','finance','aktiemarknaden']],
  ['Gaming','Games and game strategy',['gaming','game design','game strategy','spelstrategi']],
  ['Researcher','Investigation and evidence gathering',['research','scientific method','evidence gathering','forskning']],
  ['Creator','Creative practice and expression',['creative writing','writing','art','design','creative practice','skrivande']],
  ['Analyst','Structured analysis and interpretation',['data analysis','statistics','statistical analysis','dataanalys','statistik']],
  ['Assistant','Planning and practical support',['planning','task management','organization','planering']],
  ['General Intelligence','Cross-domain reasoning and knowledge integration',['general reasoning','interdisciplinary reasoning','problem solving','reasoning','tvärvetenskap']]
].map(([id,description,categories])=>Object.freeze({id,description,categories:Object.freeze(categories)})));
export const PATHWAYS = Object.freeze(PATHWAY_DEFINITIONS.map(item=>item.id));
export const DEFAULT_ORIGINS = Object.freeze(['Researcher','Social','Developer']);
export const PATHWAY_POLICY_VERSION = 1;
const EVIDENCE_LIMIT = 1000;
const aliases = new Map();
for(const definition of PATHWAY_DEFINITIONS)for(const value of [definition.id,...definition.categories])aliases.set(normalize(value),definition.id);
const list = value=>Array.isArray(value)?value:[];

export function originPathways(mind={}) {
  const explicit=Array.isArray(mind.originPathways);
  const choices=[...new Set(list(explicit?mind.originPathways:mind.pathways).filter(value=>typeof value==='string'&&value.trim()))];
  return {choices,source:explicit?'recorded-origin':'preserved-legacy-selections',unsupported:choices.filter(id=>!PATHWAYS.includes(id))};
}

export function classifyPathway(memory={}) {
  const kind=memory.intelligence?.kind||memory.kind;
  if(['preference','goal','intention','historical'].includes(kind)||memory.intelligence?.current===false||memory.supersededBy)return {pathwayId:null,method:'unassigned',reason:'Not a current knowledge claim'};
  // Exact structured domain labels only, not keyword scanning of body text.
  // Notes: labels are explicitly weaker native lexical category attribution,
  // never independently established domain knowledge or demonstrated ability.
  for(const field of ['category','areaSuggestion','topic','concept']){
    const value=typeof memory[field]==='string'?memory[field].trim():'';
    if(!value)continue;
    const lexical=/^Notes: /i.test(value),key=normalize(lexical?value.slice(7):value);
    const pathwayId=aliases.get(key);
    if(pathwayId)return {pathwayId,method:lexical?'exact-native-category-label':`exact-${field}`,field,value,reason:'Exact match to a documented domain label; attribution is not factual verification'};
    // An explicitly supplied category with no known mapping stays unassigned;
    // do not override it by mining a convenient word from another field.
    if(field==='category'||field==='areaSuggestion')return {pathwayId:null,method:'unassigned',field,value,reason:'Structured category has no supported exact domain mapping'};
  }
  return {pathwayId:null,method:'unassigned',reason:'No reliably attributable structured domain label'};
}

// Called only from real new-memory formation, inside its existing transaction.
export function recordPathwayLearning(mind,memory,{eventId,activity,at,recordedAt=Date.now()}={}) {
  if(!mind?.id||typeof memory?.content!=='string'||!memory.id||!eventId||!list(mind.memories).some(item=>item.id===memory.id&&item.content===memory.content))return;
  const contentKey=normalize(memory.content);
  const evidence=list(mind.pathwayEvidence);
  if(!contentKey||evidence.some(item=>item.contentKey===contentKey))return;
  const attribution=classifyPathway(memory);
  if(!Object.hasOwn(mind,'originPathways'))mind.originPathways=[...originPathways(mind).choices];
  const item={id:`knowledge:${memory.id}`,mindlingId:mind.id,eventId,memoryId:memory.id,contentKey,
    source:'stored-knowledge',activity,at,recordedAt,policyVersion:PATHWAY_POLICY_VERSION,
    pathwayId:attribution.pathwayId,units:attribution.pathwayId?1:0,attribution};
  mind.pathwayEvidence=[...evidence,item].slice(-EVIDENCE_LIMIT);
}

export function pathwayProfile(mind={}) {
  const origins=originPathways(mind),seen=new Set(),identity=mind.mindlingId||mind.id;
  const evidence=[];
  for(const item of list(mind.pathwayEvidence)){
    if(!item||item.mindlingId!==identity||item.source!=='stored-knowledge'||item.policyVersion!==1||typeof item.contentKey!=='string'||!item.contentKey||seen.has(item.contentKey))continue;
    if(item.pathwayId!==null&&!PATHWAYS.includes(item.pathwayId))continue;
    if(item.units!==(item.pathwayId?1:0)||typeof item.id!=='string'||typeof item.eventId!=='string'||typeof item.memoryId!=='string'||!Number.isFinite(item.recordedAt)||!Number.isFinite(new Date(item.recordedAt).getTime())||item.attribution?.pathwayId!==item.pathwayId)continue;
    seen.add(item.contentKey);evidence.push(item);
  }
  const total=evidence.reduce((sum,item)=>sum+item.units,0);
  const pathways=PATHWAY_DEFINITIONS.map(definition=>{
    const rows=evidence.filter(item=>item.pathwayId===definition.id),origin=origins.choices.includes(definition.id);
    return {id:definition.id,description:definition.description,origin,evidenceUnits:rows.length,evidenceCount:rows.length,
      originPriority:origin ? .25 : 0,priority:(origin ? .25 : 0)+(total?rows.length/total:0),
      evidenceShare:total?rows.length/total:null};
  }).sort((a,b)=>b.evidenceUnits-a.evidenceUnits||PATHWAYS.indexOf(a.id)-PATHWAYS.indexOf(b.id));
  const times=evidence.map(item=>item.recordedAt).filter(Number.isFinite);
  return {origin:origins,pathways,evidence,totalUnits:total,unassigned:evidence.filter(item=>!item.pathwayId).length,
    lastUpdate:times.length?Math.max(...times):null,retentionLimit:EVIDENCE_LIMIT,ignoredEvidence:list(mind.pathwayEvidence).length-evidence.length,
    independentlyVerifiedAbilityAvailable:false,providerEvaluationsUsedForStrength:false};
}

export function pathwayContext(mind={}) {
  const profile=pathwayProfile(mind);
  return {version:PATHWAY_POLICY_VERSION,origins:profile.origin.choices.filter(id=>id.length<=80).slice(0,20),originSource:profile.origin.source,
    priorities:profile.pathways.map(({id,priority,originPriority,evidenceUnits})=>({id,priority,originPriority,evidenceUnits})),
    developed:profile.pathways.filter(item=>item.evidenceUnits).map(({id,evidenceUnits,evidenceShare})=>({id,evidenceUnits,evidenceShare})),
    provenance:{source:'newly-recorded-stored-knowledge',records:profile.evidence.slice(-12).map(item=>({id:item.id,eventId:item.eventId,memoryId:item.memoryId,pathwayId:item.pathwayId,units:item.units,recordedAt:item.recordedAt,method:item.attribution.method,field:item.attribution.field||null,value:item.attribution.value||null})),retainedEvidence:profile.evidence.length,ignoredEvidence:profile.ignoredEvidence,unassigned:profile.unassigned,lastUpdate:profile.lastUpdate,independentAbilityAvailable:false,providerEvaluationsIncluded:false},
    missingAttribution:profile.unassigned>0||profile.ignoredEvidence>0||!profile.evidence.length};
}

// Preference only: consumers use this solely to resolve equal relevance scores.
export function memoryPriority(memory,context) {
  const {pathwayId}=classifyPathway(memory);
  return context?.priorities?.find(item=>item.id===pathwayId)?.priority||0;
}

// Recorded conflicts win a relevance tie before any orientation preference.
// This is a context-preservation hint, never proof a conflicting claim is true.
export function learningTiePriority(memory,context) {
  return (Array.isArray(memory.contradictions)&&memory.contradictions.some(item=>typeof item?.claim==='string'&&item.claim.trim())?2:0)+memoryPriority(memory,context);
}
