// Allowlisted metadata only. Never retain upstream error text or model content.
export function semanticDiagnostic(value){
 if(!value||typeof value!=='object')return null;
 const details=['COMPLETION_INCOMPLETE','COMPLETION_INVALID','COMPLETION_JSON_INVALID','CONTENT_TYPE_INVALID','BODY_LIMIT','BODY_MISSING','JSON_INVALID','RESPONSE_BODY_FAILED','HTTP_REJECTED','FETCH_FAILED','MODEL_ID_MISMATCH','RESULT_ENVELOPE_INVALID','RESULT_VALIDATION_FAILED'];
 return {phase:['MODEL','SEMANTIC'].includes(value.phase)?value.phase:null,endpoint:['models','completions'].includes(value.endpoint)?value.endpoint:null,upstreamStatus:Number.isInteger(value.upstreamStatus)&&value.upstreamStatus>=100&&value.upstreamStatus<=599?value.upstreamStatus:null,detail:details.includes(value.detail)?value.detail:'RESULT_VALIDATION_FAILED'};
}
