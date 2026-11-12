import {sourceStatus} from '../memory/content-integrity.js';
import {editableMemoryText} from '../learning/correction-content.js';
// Organizational assertions are separate from canonical memory identity.
export const AREA_RELATIONS=Object.freeze({
 'equivalent-label':'The two area labels denote the same concept; never merge memory records.',
 'broader-than':'The source area is a broader domain containing the target area.',
 'narrower-than':'The source area is a narrower domain within the target area.',
 'instance-of':'The source is an instance of the target concept, not necessarily a subdomain.',
 'part-of':'The source is a component of the target, not necessarily a subdomain.',
 'related-to':'An explicit supported association without containment or equivalence.'
});
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const text=(v,n)=>typeof v==='string'&&v.trim().length>0&&v.length<=n;
export function validateAreaContext(areas,pairs){
 if(!Array.isArray(areas)||areas.length>32)throw Object.assign(Error('Invalid area context'),{code:'INVALID_SCHEMA',detail:'AREA_CONTEXT_INVALID'});
 const ids=new Set(),memories=new Set(pairs.flatMap(p=>[p.a.id,p.b.id]));
 for(const a of areas){if(!exact(a,['id','label','memoryIds'])||!text(a.id,300)||!text(a.label,160)||ids.has(a.id)||!Array.isArray(a.memoryIds)||a.memoryIds.some(id=>!memories.has(id))||new Set(a.memoryIds).size!==a.memoryIds.length)throw Object.assign(Error('Invalid area context'),{code:'INVALID_SCHEMA',detail:'AREA_CONTEXT_INVALID'});ids.add(a.id);}
}
const string=maxLength=>({type:'string',minLength:1,maxLength});
export const areaSchema={type:'array',maxItems:4,items:{type:'object',additionalProperties:false,required:['from','to','type','pair','evidenceA','evidenceB','support','scopePreserved','reason'],properties:{from:string(300),to:string(300),type:{type:'string',enum:Object.keys(AREA_RELATIONS)},pair:{type:'integer',minimum:0,maximum:3},evidenceA:{type:'object',additionalProperties:false,required:['first','last'],properties:{first:{type:'integer',minimum:0,maximum:1999},last:{type:'integer',minimum:0,maximum:1999}}},evidenceB:{type:'object',additionalProperties:false,required:['first','last'],properties:{first:{type:'integer',minimum:0,maximum:1999},last:{type:'integer',minimum:0,maximum:1999}}},support:{type:'string',enum:['supported','uncertain','unsupported']},scopePreserved:{type:'boolean'},reason:string(480)}}};
export function validateAreaResults(proposals,context,materialize){
 const accepted=[],rejections=[],seen=new Set(),areas=new Map((context.areas||[]).map(a=>[a.id,a]));
 if(!Array.isArray(proposals)||proposals.length>4)throw Object.assign(Error('Invalid area results'),{code:'INVALID_SCHEMA',detail:'AREA_ENVELOPE_INVALID'});
 for(const [index,r]of proposals.entries()){
  const reject=code=>rejections.push({index,code});
  if(!exact(r,areaSchema.items.required)||!Object.hasOwn(AREA_RELATIONS,r.type)||!Number.isSafeInteger(r.pair)||!text(r.reason,480)||typeof r.scopePreserved!=='boolean'||!['supported','uncertain','unsupported'].includes(r.support)){reject('AREA_SCHEMA_INVALID');continue;}
  const pair=context.pairs[r.pair],from=areas.get(r.from),to=areas.get(r.to);
  if(!pair||!from||!to||from===to){reject('AREA_REFERENCE_INVALID');continue;}
  const a=materialize(r.evidenceA,pair.a.text),b=materialize(r.evidenceB,pair.b.text);
  if(!a||!b){reject('AREA_EVIDENCE_INVALID');continue;}
  if(r.support!=='supported'||!r.scopePreserved){reject('AREA_SUPPORT_INSUFFICIENT');continue;}
  const key=JSON.stringify([r.from,r.to,r.type]);if(seen.has(key)){reject('AREA_DUPLICATE');continue;}seen.add(key);
  accepted.push({version:1,from:r.from,to:r.to,type:r.type,direction:['equivalent-label','related-to'].includes(r.type)?'symmetric':'from-to',reason:r.reason,validation:'model-supported-not-independently-verified',areas:[{id:from.id,label:from.label},{id:to.id,label:to.label}],evidence:[{snapshot:pair.a,span:a},{snapshot:pair.b,span:b}]});
 }return {accepted,rejections};
}
const current=m=>m&&sourceStatus(m)!=='incomplete'&&!m.supersededBy&&m.intelligence?.current!==false&&!['historical','preference','goal','intention'].includes(m.intelligence?.kind||m.kind)&&(!m.contradictions||Array.isArray(m.contradictions)&&m.contradictions.every(c=>c.status==='resolved'));
export function currentAreaRelation(r,memories,areas){
 if(r?.version!==1||!['model-supported-not-independently-verified','explicit-stored-claim-not-independently-verified'].includes(r.validation)||!Object.hasOwn(AREA_RELATIONS,r.type)||!Array.isArray(r.areas)||r.areas.length!==2||!Array.isArray(r.evidence)||![1,2].includes(r.evidence.length))return false;
 if(r.from===r.to||!r.areas.some(a=>a?.id===r.from)||!r.areas.some(a=>a?.id===r.to)||r.areas.some(a=>!a||!areas.some(b=>a.id===b.id&&a.label===b.label)))return false;
 return r.evidence.every(e=>{
  if(!e||!e.snapshot)return false;const {snapshot:s,span}=e;
  const matches=memories.filter(m=>m.id===s?.id),m=matches[0];if(matches.length!==1||!current(m)||editableMemoryText(m)!==s.text||!span||s.text.slice(span.start,span.end)!==span.quote)return false;
  if(s.provenance)return m.source==='SERVICE'&&m.intelligence?.kind==='claim'&&m.analysis?.name==='mindling-learning-service'&&m.analysis?.verification===s.provenance.verification&&(m.correctsMemoryId||null)===s.provenance.correctsMemoryId;
  return m.source==='AUTONOMOUS'&&['sourceHash','quoteHash','sourceURL','observedAt'].every(k=>m.research?.[k]===s[k]);
 });
}
export function persistAreaRelations(mind,accepted,areas,now=Date.now()){
 if(!accepted.length)return [];
 const previous=mind.semanticAreaRelations||{version:1,revision:0,records:[]};
 if(previous.version!==1||!Number.isSafeInteger(previous.revision)||previous.revision<0||!Array.isArray(previous.records))return accepted.map(()=> 'AREA_STORE_INVALID');
 const records=previous.records.slice(),outcomes=[];
 for(const r of accepted){
  if(!currentAreaRelation(r,mind.memories||[],areas)){outcomes.push('AREA_STALE_EVIDENCE');continue;}
  const id=JSON.stringify([r.from,r.to,r.type]);
  const old=records.findIndex(x=>x?.id===id);
  if(old>=0&&currentAreaRelation(records[old],mind.memories||[],areas)){outcomes.push('AREA_UNCHANGED');continue;}
  if(old<0&&records.length>=256){outcomes.push('AREA_RECORD_LIMIT');continue;}
  const record={...r,id,resolverVersion:1,createdAt:old<0?now:records[old].createdAt,updatedAt:now,revision:previous.revision+1};
  if(old<0)records.push(record);else records[old]=record;outcomes.push('AREA_PERSISTED');
 }
 if(outcomes.includes('AREA_PERSISTED'))mind.semanticAreaRelations={version:1,revision:previous.revision+1,records};
 return outcomes;
}
// Equivalence expands labels only, never records or canonical area IDs. A
// bounded path retains every supporting decision for commit-time revalidation.
export function areaDirections(relations,a,b){
 const aliases=start=>{const paths=new Map([[start,[]]]),queue=[start];
  while(queue.length&&paths.size<32){const id=queue.shift();for(const r of relations)if(r.type==='equivalent-label'&&(r.from===id||r.to===id)){const other=r.from===id?r.to:r.from;if(!paths.has(other)){paths.set(other,[...paths.get(id),r]);queue.push(other);}}}return paths;};
 const aa=aliases(a),bb=aliases(b);if(aa.has(b))return {equivalent:true,directions:[]};
 const directions=[];
 for(const r of relations){if(!['broader-than','narrower-than'].includes(r.type))continue;
  const parent=r.type==='broader-than'?r.from:r.to,child=r.type==='broader-than'?r.to:r.from;
  for(const [parents,children,parentId,childId]of [[aa,bb,a,b],[bb,aa,b,a]])if(parents.has(parent)&&children.has(child))directions.push({parentId,childId,basis:{resolver:'semantic-area',decisions:[...parents.get(parent),r,...children.get(child)].map(d=>({id:d.id,revision:d.revision}))}});
 }
 return {equivalent:false,directions};
}
