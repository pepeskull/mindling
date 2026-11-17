'use strict';
// Fixed categories only: never copy upstream messages, arbitrary property paths,
// schema enums (which may contain area IDs), prompts or provider bodies.
function semanticRequestRejection(error){
 const code=['invalid_json_schema','invalid_request_error','unsupported_parameter','unsupported_value'].includes(error?.code)?error.code:'other';
 const param=typeof error?.param==='string'?error.param:'';
 const parameter=['response_format','response_format.type','response_format.json_schema','response_format.json_schema.name','response_format.json_schema.strict','response_format.json_schema.schema','model','max_completion_tokens'].includes(param)?param:param.startsWith('response_format.json_schema.schema.')?'schema_nested':param.startsWith('response_format.')?'response_format_nested':'other';
 const message=typeof error?.message==='string'?error.message.slice(0,8192):'';
 // Hints describe only explicit provider wording, not a proven local root cause.
 const rules=[['SCHEMA_COMPILATION',/compil(?:e|ation|ing)|grammar|automaton|state limit/i],['SCHEMA_SIZE',/schema.{0,40}(?:large|size|complex)|too many properties|total.{0,20}properties/i],['DUPLICATE_VALUES',/duplicate|non.unique/i],['UNSUPPORTED_TYPE',/unsupported type|invalid type|type.{0,20}not supported/i],['REFERENCE_CONSTRAINT',/\$ref|reference|recursive/i],['ADDITIONAL_PROPERTIES',/additionalProperties/i],['REQUIRED_FIELDS',/\brequired\b/i],['ENUM_CONSTRAINT',/\benum\b/i],['NESTING_LIMIT',/nesting|nested too deeply/i],['UNSUPPORTED_FORMAT',/json_schema.*not supported|does not support.*json_schema/i],['UNSUPPORTED_KEYWORD',/not permitted|unsupported keyword/i]];
 return {code,parameter,providerType:['invalid_request_error','server_error'].includes(error?.type)?error.type:'other',codePresent:typeof error?.code==='string',messagePresent:!!message,constraintHint:rules.find(([,pattern])=>pattern.test(message))?.[0]||'UNCLASSIFIED'};
}
module.exports={semanticRequestRejection};
