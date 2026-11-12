import {areaSchema} from './area-relations.js';
import {semanticSchema,validateSemanticContext,VERSION,RELATIONS} from './model-contract.js';
import {sentenceSpans,materialize} from './evidence-spans.js';
export {sentenceSpans} from './evidence-spans.js';
// Compact model transport only. The browser/persistence contract stays v2.
// The model selects evidence; code only materializes its exact selection.
export function semanticWireContext(context){
 validateSemanticContext(context);
 return {version:1,...(context.areas?{areas:context.areas}:{}),pairs:context.pairs.map((pair,index)=>({index,...Object.fromEntries(['a','b'].map(side=>[side,{...pair[side],sentences:sentenceSpans(pair[side].text).map(({quote},index)=>({index,text:quote}))}]))}))};
}
const selection={type:'object',additionalProperties:false,required:['first','last'],properties:{first:{type:'integer',minimum:0,maximum:1999},last:{type:'integer',minimum:0,maximum:1999}}};
export const semanticWireSchema={type:'object',additionalProperties:false,required:['version','relationships'],properties:{version:{type:'integer',enum:[1]},relationships:{type:'array',maxItems:4,items:{type:'object',additionalProperties:false,required:['pair','reverse','type','evidenceA','evidenceB','assessment'],properties:{pair:{type:'integer',minimum:0,maximum:3},reverse:{type:'boolean'},type:{type:'string',enum:Object.keys(RELATIONS)},evidenceA:selection,evidenceB:selection,assessment:structuredClone(semanticSchema.properties.relationships.items.properties.assessment)}}}}};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
export function decodeSemanticWire(value,context){
 validateSemanticContext(context);
 if(!exact(value,value?.areaRelationships===undefined?['version','relationships']:['version','relationships','areaRelationships'])||value.version!==1||!Array.isArray(value.relationships)||value.relationships.length>4)throw Object.assign(Error('Invalid semantic envelope'),{code:'INVALID_SCHEMA',detail:'RESULT_ENVELOPE_INVALID'});
 return {version:VERSION,...(value.areaRelationships!==undefined?{areaRelationships:value.areaRelationships}:{}),relationships:value.relationships.map(r=>{
  // Keep invalid individual proposals rejectable by the unchanged canonical
  // validator, without losing other fully supported proposals in this batch.
  if(!exact(r,['pair','reverse','type','evidenceA','evidenceB','assessment'])||!Number.isSafeInteger(r.pair)||r.pair<0||typeof r.reverse!=='boolean'||!context.pairs[r.pair])return {};
  const pair=context.pairs[r.pair],a=r.reverse?pair.b:pair.a,b=r.reverse?pair.a:pair.b;
  return {memoryA:a.id,memoryB:b.id,type:r.type,direction:RELATIONS[r.type]?.direction||'',evidenceA:materialize(r.evidenceA,a.text),evidenceB:materialize(r.evidenceB,b.text),assessment:r.assessment};
 })};
}
export function semanticWireSchemaFor(context){
 validateSemanticContext(context);const schema=structuredClone(semanticWireSchema);
 schema.properties.relationships.maxItems=context.pairs.length;
 schema.properties.relationships.items.properties.pair.maximum=Math.max(0,context.pairs.length-1);
 if(context.areas){schema.required.push('areaRelationships');schema.properties.areaRelationships=structuredClone(areaSchema);schema.properties.areaRelationships.maxItems=context.pairs.length;schema.properties.areaRelationships.items.properties.from.enum=context.areas.map(a=>a.id);schema.properties.areaRelationships.items.properties.to.enum=context.areas.map(a=>a.id);}
 return schema;
}
