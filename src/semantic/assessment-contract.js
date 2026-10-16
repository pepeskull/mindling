// Provider schemas are guidance; local Unicode and semantic validation is authoritative.
// Do not send JavaScript Unicode property escapes to an unspecified regex engine.
const LABEL_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}\p{M} &()+.,'’/:\p{Pd}]*$/u;
export function normalizeLabel(value) {
  // Canonical Unicode composition and spacing only. No truncation, translation,
  // case folding, punctuation stripping, markdown removal or ID normalization.
  return typeof value === 'string' ? value.normalize('NFC').replace(/[\p{Zs}\t]+/gu, ' ').trim() : value;
}
export function labelFailureReason(value) {
  if (typeof value !== 'string') return 'TYPE';
  if (value.length < 2 || value.length > 60) return 'LENGTH';
  if (value.trim() !== value || !LABEL_PATTERN.test(value)) return 'FORMAT';
  return null;
}
export const validLabel = value => labelFailureReason(value) === null;
const text = maxLength => ({type:'string',minLength:3,maxLength});
const label = {type:'string',minLength:2,maxLength:60};
export function assessmentSchema(context) {
  const memories=context.memories.map(m=>m.id),categories=context.categories.map(c=>c.id);
  const properties={
    meaningful:{type:'boolean'},duplicate:{type:'boolean'},quality:{type:'number',minimum:0,maximum:1},
    concept:text(100),memory:text(1000),area:text(100),kind:{type:'string',enum:['concept','understanding','correction']},
    category:{...label},categoryId:{type:'string',maxLength:100,enum:['',...categories]},topic:{...label},
    relationship:{type:'string',enum:memories.length?['new','repeated','related','corrective','uncertain']:['new']},
    relatedMemoryId:{type:'string',maxLength:100,enum:['',...memories]},
    confidence:{type:'number',minimum:0,maximum:1},evidence:{type:'string',maxLength:500}
  };
  const branches=[{properties:{relationship:{enum:['new']},relatedMemoryId:{enum:['']},duplicate:{enum:[false]},kind:{enum:['concept','understanding']}}}];
  if(memories.length)branches.push(
    {properties:{relationship:{enum:['related','uncertain']},relatedMemoryId:{enum:memories},duplicate:{enum:[false]},kind:{enum:['concept','understanding']}}},
    {properties:{relationship:{enum:['repeated']},relatedMemoryId:{enum:memories},duplicate:{enum:[true]},kind:{enum:['concept','understanding']},confidence:{minimum:.95}}},
    {properties:{relationship:{enum:['corrective']},relatedMemoryId:{enum:memories},duplicate:{enum:[false]},kind:{enum:['correction']},confidence:{minimum:.95},evidence:{minLength:40}}}
  );
  return {type:'object',properties,required:Object.keys(properties),additionalProperties:false,anyOf:branches};
}
