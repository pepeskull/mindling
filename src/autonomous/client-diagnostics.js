// Fixed browser-side phases only. Never attach source text or exception messages.
export const CLIENT_RESEARCH_CODES=Object.freeze({
  TRANSPORT_INTERRUPTED:'Research transport was interrupted before a complete response was received. Remote work is unknown.',
  TRANSPORT_TIMEOUT:'The browser research deadline elapsed before a complete response was received. Remote work is unknown.',
  TRANSPORT_FAILED:'The browser could not receive the research response. Remote work is unknown.',
  RESPONSE_PARSE_FAILED:'The received research response could not be parsed safely.',
  RECEIPT_VALIDATION_FAILED:'The research response did not match the submitted request or evidence contract.',
  CHECKPOINT_VALIDATION_FAILED:'The received signed source checkpoint did not match the research result.',
  CHECKPOINT_PERSISTENCE_FAILED:'The received research outcome could not be saved locally. No new search is authorized.',
  EVIDENCE_VALIDATION_FAILED:'The received evidence failed a browser integrity check.',
  EVIDENCE_PERSISTENCE_FAILED:'The evidence checks could not be saved. The previously saved receipt remains available.',
  INTEGRATION_PAUSED:'Received research evidence is saved; integration is paused until the application is active and authorized.',
  INTEGRATION_FAILED:'The saved research evidence could not be integrated. Existing canonical knowledge was preserved.',
  STALE_RESEARCH_RESPONSE:'A late research response no longer owns this task and cannot change it.'
});
const phases=['TRANSPORT','RESPONSE_PARSE','RECEIPT_VALIDATION','CHECKPOINT_VALIDATION','CHECKPOINT_PERSISTENCE','EVIDENCE_VALIDATION','EVIDENCE_PERSISTENCE','INTEGRATION'];
const reasons=['HIDDEN','PAGEHIDE','OFFLINE','CANCELLED','DISPOSED','ACCESS_CHANGED','CLIENT_DEADLINE','RUN_DEADLINE'];
export function clientResearchFailure(code,{id,mode,phase,received=false,validated=false,status=null,reason=null}){
  const clientDiagnostic={version:1,correlationId:id,operation:mode,phase,code,received,validated,httpStatus:status,abortReason:reasons.includes(reason)?reason:null};
  validateClientDiagnostic(clientDiagnostic);
  return Object.assign(Error(CLIENT_RESEARCH_CODES[code]),{code,clientDiagnostic});
}
export function validateClientDiagnostic(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='abortReason,code,correlationId,httpStatus,operation,phase,received,validated,version'||value.version!==1||!/^[a-f0-9]{64}$/.test(value.correlationId)||!['research-acquire','research-evaluate'].includes(value.operation)||!phases.includes(value.phase)||!Object.hasOwn(CLIENT_RESEARCH_CODES,value.code)||typeof value.received!=='boolean'||typeof value.validated!=='boolean'||value.validated&&!value.received||!(value.httpStatus===null||Number.isSafeInteger(value.httpStatus)&&value.httpStatus>=100&&value.httpStatus<=599)||!(value.abortReason===null||reasons.includes(value.abortReason)))throw Error('Invalid client research diagnostic');
  return value;
}
