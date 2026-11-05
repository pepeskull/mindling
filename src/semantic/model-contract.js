import {semanticText} from './semantic-text.js';
import {features} from '../learning/text.js';
import {CONNECTION_LIMITS} from './memory-connections.js';
export const VERSION=1;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys.sort().join(',');
export function validateSemanticContext(value){
 if(!exact(value,['version','pairs'])||value.version!==VERSION||!Array.isArray(value.pairs)||value.pairs.length>CONNECTION_LIMITS.links)throw Error('Invalid semantic context');
 const seen=new Set();for(const pair of value.pairs){if(!exact(pair,['a','b']))throw Error('Invalid pair');for(const m of [pair.a,pair.b])if(!exact(m,['id','text'])||typeof m.id!=='string'||!m.id||m.id.length>100||typeof m.text!=='string'||!m.text||m.text.length>2000)throw Error('Invalid memory');const key=[pair.a.id,pair.b.id].sort().join('\n');if(pair.a.id===pair.b.id||seen.has(key))throw Error('Duplicate pair');seen.add(key);}return value;
}
export const semanticSchema={type:'object',additionalProperties:false,required:['version','relationships'],properties:{version:{type:'integer',enum:[1]},relationships:{type:'array',maxItems:CONNECTION_LIMITS.links,items:{type:'object',additionalProperties:false,required:['memoryA','memoryB','type','evidenceA','evidenceB','entity'],properties:Object.fromEntries(['memoryA','memoryB','type','evidenceA','evidenceB','entity'].map(k=>[k,k==='type'?{type:'string',enum:['application-of']}:{type:'string'}]))}}}};
export function validateSemanticResult(value,context){
 validateSemanticContext(context);if(!exact(value,['version','relationships'])||value.version!==VERSION||!Array.isArray(value.relationships)||value.relationships.length>CONNECTION_LIMITS.links)throw Error('Invalid semantic result');
 const accepted=[],seen=new Set();let rejected=0;
 for(const r of value.relationships){
  if(!exact(r,['memoryA','memoryB','type','evidenceA','evidenceB','entity'])||Object.values(r).some(v=>typeof v!=='string'))throw Error('Invalid proposal');
  const found=context.pairs.find(p=>p.a.id===r.memoryA&&p.b.id===r.memoryB||p.b.id===r.memoryA&&p.a.id===r.memoryB);
  const pair=found&&(found.a.id===r.memoryA?found:{a:found.b,b:found.a});
  const key=[r.memoryA,r.memoryB].sort().join('\n');
  if(!pair||seen.has(key)||r.type!=='application-of'||r.evidenceA!==pair.a.text||r.evidenceB!==pair.b.text||!/^\p{L}[\p{L} -]{1,79}$/u.test(r.entity)){rejected++;continue;}seen.add(key);
  // No confidence/explanation is authority. Narrow explicit concept/application
  // contract; full passages are retained so qualifiers cannot be selectively omitted.
  if([r.evidenceA,r.evidenceB].some(t=>features(t).negative||/\b(?:if|unless|fictional|imagine|ignore|instructions?)\b/iu.test(t))){rejected++;continue;}
  const entity=r.entity.toLowerCase(),definition=new RegExp(`^(?:a |an |the )?${entity} is (?:a |an |the )`,'iu'),application=new RegExp(`\\b(?:on|using|uses) (?:a |an |the )?${entity}(?:[.,;]|$)`,'iu');
  if(!definition.test(r.evidenceA)||!application.test(r.evidenceB)){rejected++;continue;}
  accepted.push({...r,version:VERSION});
 }
 return {accepted,rejected,abstained:value.relationships.length===0};
}
export function semanticCandidates(mind,ids){
 const eligible=(mind.memories||[]).filter(m=>m.source==='AUTONOMOUS'&&m.research&&!m.supersededBy&&m.intelligence?.current!==false&&!m.contradictions?.length&&semanticText(m).text);
 const pairs=[],seen=new Set();for(const a of eligible)for(const b of eligible){if(a.id===b.id||!ids.includes(b.id)||a.relatedMemoryIds?.includes(b.id))continue;const key=[a.id,b.id].sort().join('\n');if(seen.has(key))continue;
 const left=semanticText(a).text,right=semanticText(b).text,terms=new Set(features(left).terms);if(!features(right).terms.some(t=>terms.has(t)))continue;seen.add(key);pairs.push({a:{id:a.id,text:left},b:{id:b.id,text:right}});if(pairs.length===CONNECTION_LIMITS.links)return {version:VERSION,pairs};}
 return {version:VERSION,pairs};
}
export function persistSemantic(mind,accepted){
 for(const r of accepted){const a=mind.memories.find(m=>m.id===r.memoryA),b=mind.memories.find(m=>m.id===r.memoryB);if(!a||!b||[a,b].some(m=>m.source!=='AUTONOMOUS'||m.intelligence?.current===false||m.contradictions?.length)||a.supersededBy||b.supersededBy||semanticText(a).text!==r.evidenceA||semanticText(b).text!==r.evidenceB)continue;
 for(const [self,other]of [[a,b],[b,a]]){self.relatedMemoryIds=[...new Set([...(self.relatedMemoryIds||[]),other.id])];self.semanticAssociations||=[];if(!self.semanticAssociations.some(e=>e.memoryId===other.id))self.semanticAssociations.push({version:1,memoryId:other.id,rule:'model-proposed-application',entity:r.entity,analysisVersion:VERSION});}}
}
