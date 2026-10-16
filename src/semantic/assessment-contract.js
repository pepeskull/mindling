// Shared generation constraints; semantic/evidence checks still run after decoding.
export const LABEL_PATTERN = "^[\\p{L}\\p{N}][\\p{L}\\p{N} &()+.,'’/:-]*[\\p{L}\\p{N}&()+.,'’/:-]$";
export const validLabel = value => typeof value === 'string' && value.trim() === value && value.length >= 2 && value.length <= 60 && new RegExp(LABEL_PATTERN, 'u').test(value);
const text = maxLength => ({type:'string',minLength:3,maxLength,pattern:'\\S[\\s\\S]+\\S'});
const label = {type:'string',minLength:2,maxLength:60,pattern:LABEL_PATTERN};
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
