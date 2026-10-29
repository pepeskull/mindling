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
export const PATHWAY_POLICY_VERSION = 2;
const EVIDENCE_LIMIT = 1000;
const aliases = new Map();
for(const definition of PATHWAY_DEFINITIONS)for(const value of [definition.id,...definition.categories])aliases.set(normalize(value),definition.id);
const list = value=>Array.isArray(value)?value:[];

export function originPathways(mind={}) {
  const explicit=Array.isArray(mind.originPathways);
  const raw=explicit?mind.originPathways:Array.isArray(mind.pathways)&&mind.pathways.length?mind.pathways:list(mind.pathwayRecords).filter(item=>item?.selected);
  const choices=[...new Set(list(raw).map(item=>typeof item==='string'?item:typeof item==='object'&&item?(item.name||item.title||item.pathway||item.id):'').filter(value=>typeof value==='string'&&value.trim()).map(value=>{const label=value.normalize('NFC').trim();return PATHWAYS.find(id=>normalize(id)===normalize(label))||label;}))];
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
    const parts=key.split(/\s+(?:and|&)\s+|\s*[/;]\s*/).filter(Boolean);
    const ids=[...new Set(parts.map(part=>aliases.get(part)))];
    const pathwayId=ids.length&&ids.length<=3&&ids.every(Boolean)?ids[0]:null;
    if(pathwayId)return {pathwayId,pathwayIds:ids,method:lexical?'exact-native-category-label':`exact-${field}`,field,value,reason:'Exact match to a documented domain label; attribution is not factual verification'};
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
    pathwayId:attribution.pathwayId,allocations:allocationsFor(attribution),units:attribution.pathwayId?1:0,attribution};
  mind.pathwayEvidence=[...evidence,item].slice(-EVIDENCE_LIMIT);
}

export function pathwayProfile(mind={}) {
  const origins=originPathways(mind),seen=new Set(),identity=mind.mindlingId||mind.id;
  const evidence=[];
  for(const item of list(mind.pathwayEvidence)){
    if(!item||item.mindlingId!==identity||item.source!=='stored-knowledge'||![1,2].includes(item.policyVersion)||typeof item.contentKey!=='string'||!item.contentKey||seen.has(item.contentKey))continue;
    if(item.pathwayId!==null&&!PATHWAYS.includes(item.pathwayId))continue;
    if(item.policyVersion===2&&(!Array.isArray(item.allocations)||new Set(item.allocations.map(a=>a.id)).size!==item.allocations.length||item.allocations.some(a=>!PATHWAYS.includes(a.id)||!Number.isFinite(a.units)||a.units<=0)||Math.abs(item.allocations.reduce((n,a)=>n+a.units,0)-item.units)>1e-9))continue;
    if(item.units!==(item.pathwayId?1:0)||typeof item.id!=='string'||typeof item.eventId!=='string'||typeof item.memoryId!=='string'||!Number.isFinite(item.recordedAt)||!Number.isFinite(new Date(item.recordedAt).getTime())||item.attribution?.pathwayId!==item.pathwayId)continue;
    seen.add(item.contentKey);evidence.push(item);
  }
  const total=evidence.reduce((sum,item)=>sum+item.units,0);
  const pathways=PATHWAY_DEFINITIONS.map(definition=>{
    const rows=evidence.filter(item=>(item.allocations||[{id:item.pathwayId,units:item.units}]).some(a=>a.id===definition.id)),units=rows.reduce((sum,item)=>sum+(item.allocations||[{id:item.pathwayId,units:item.units}]).filter(a=>a.id===definition.id).reduce((n,a)=>n+a.units,0),0),origin=origins.choices.includes(definition.id);
    return {id:definition.id,description:definition.description,origin,evidenceUnits:units,evidenceCount:rows.length,
      originPriority:origin ? .25 : 0,priority:(origin ? .25 : 0)+(total?units/total:0),
      evidenceShare:total?units/total:null};
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
    provenance:{source:'newly-recorded-stored-knowledge',records:profile.evidence.slice(-12).map(item=>({id:item.id,eventId:item.eventId,memoryId:item.memoryId,pathwayId:item.pathwayId,units:item.units,allocations:item.allocations||null,recordedAt:item.recordedAt,method:item.attribution.method,field:item.attribution.field||null,value:item.attribution.value||null})),retainedEvidence:profile.evidence.length,ignoredEvidence:profile.ignoredEvidence,unassigned:profile.unassigned,lastUpdate:profile.lastUpdate,independentAbilityAvailable:false,providerEvaluationsIncluded:false},
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
  for(const item of list(mind.pathwayEvidence)){
    if(item.mindlingId!==mind.id||item.source!=='stored-knowledge'||typeof item.contentKey!=='string'||!item.contentKey||item.policyVersion!==1||!item.attribution?.field||typeof item.attribution.value!=='string')continue;
    const next=classifyPathway({[item.attribution.field]:item.attribution.value});
    item.classificationHistory=[...(item.classificationHistory||[]),{fromPolicy:1,toPolicy:2,at,previous:{pathwayId:item.pathwayId,units:item.units,attribution:item.attribution},next}];
    item.pathwayId=next.pathwayId;item.units=next.pathwayId?1:0;item.allocations=allocationsFor(next);item.attribution=next;item.policyVersion=2;
  }
}
