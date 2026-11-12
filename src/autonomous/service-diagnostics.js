import { validateExtractionDiagnostics } from './extraction-diagnostics.js';
import { validateLimitationFailure } from './research-limitations.js';
import { validateSourceEvaluationDiagnostics } from './research-contract.js';
export const SERVICE_MESSAGES=Object.freeze({
  TOOL_BUDGET_VIOLATION:'The provider reported more completed or failed tool invocations than authorized. No knowledge was accepted; the request will not be repeated.',
  TOOL_LIFECYCLE_INCOMPLETE:'The provider reported an unfinished tool invocation. Its dispatch or completion is uncertain. No knowledge was accepted; the reserved budget is protected.',
  INVALID_TOOL_ACCOUNTING:'The provider returned conflicting or ambiguous tool identities. No knowledge was accepted; the reserved budget is protected.',
  RESPONSE_SERIALIZATION_ERROR:'The completed research result could not be serialized by the server. Signed source evidence may be available for a bounded retry.',
  UPSTREAM_HTTP_ERROR:'The information service rejected this operation. The task details contain a safe request reference.',
  UPSTREAM_NETWORK_ERROR:'The information service connection failed. Remote work may still have run; the reserved budget is protected.',
  UPSTREAM_TIMEOUT:'The information service exceeded the application deadline. Completed remote work may be unknown.',
  MODEL_UNAVAILABLE:'The configured reasoning model could not be confirmed. Check the server configuration.',
  TOOL_UNSUPPORTED:'The configured service rejected the required web-search tool. No uncited answer was substituted.',
  INVALID_REQUEST:'The service rejected the research request format. No unsupported knowledge was saved.',
  RESPONSE_PARSE_ERROR:'The service response could not be safely read or validated. No unsupported knowledge was saved.',
  NO_SEARCH_EXECUTED:'The service returned no completed web-search action. No research facts were invented.',
  NO_CITABLE_EVIDENCE:'The completed search returned no usable cited evidence.',
  REQUEST_INTERRUPTED:'Research was interrupted. Remote work may be unknown; its budget remains reserved.',
  BUDGET_EXHAUSTED:'The task has no remaining authorized remote-call budget. Its original failure is preserved.',
  RATE_LIMITED:'The information service rate limit was reached. Work remains within its existing budget.'
});
export function validateServiceDiagnostic(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['correlationId','operation','phase','endpoint','upstreamStatus','upstreamRequestId','errorCategory','detail','durationMs','searchRequested','searchDispatched','searchCompleted','completed','failed','outcomeUnknown','sourceCount','fallbackReason','modelConfirmed','validation','limitationFailure','candidateOutcome','observedToolEvents','extraction','toolAccounting'].includes(key)))throw Error('Invalid service diagnostic');
  if(!/^[a-f0-9]{64}$/.test(value.correlationId)||!['research','research-acquire','research-evaluate','research-capabilities'].includes(value.operation)||!['SERVICE','MODEL','PLANNING','INFORMATION','ACQUISITION_VALIDATION','CHECKPOINT_VALIDATION','RESPONSE_VALIDATION','SOURCE_EVALUATION','RESPONSE_SERIALIZATION'].includes(value.phase)||![null,'models','responses','completions'].includes(value.endpoint)||!(value.upstreamStatus===null||Number.isSafeInteger(value.upstreamStatus)&&value.upstreamStatus>=100&&value.upstreamStatus<=599)||value.errorCategory!==null&&!Object.hasOwn(SERVICE_MESSAGES,value.errorCategory)||!/^[A-Z_]{1,60}$/.test(value.detail)||!Number.isSafeInteger(value.durationMs)||value.durationMs<0||value.durationMs>120000||['searchRequested','searchDispatched','searchCompleted','outcomeUnknown'].some(key=>typeof value[key]!=='boolean')||['completed','failed'].some(key=>!Number.isSafeInteger(value[key])||value[key]<0||value[key]>64)||!Number.isSafeInteger(value.sourceCount)||value.sourceCount<0||value.sourceCount>3||value.fallbackReason!=='none'||value.modelConfirmed!==undefined&&typeof value.modelConfirmed!=='boolean'||value.upstreamRequestId!==undefined&&!/^[A-Za-z0-9_-]{1,120}$/.test(value.upstreamRequestId))throw Error('Invalid service diagnostic');
  if(value.candidateOutcome!==undefined&&!['NO_USABLE_PASSAGES','NO_GENERATED_CANDIDATES','CANDIDATE_PARSE_FAILED','CANDIDATE_SCHEMA_FAILED','CANDIDATE_RELEVANCE_REJECTED','CANDIDATE_EVIDENCE_REJECTED','CANDIDATES_ACCEPTED','EVALUATION_INTERRUPTED'].includes(value.candidateOutcome))throw Error('Invalid candidate outcome');
  if(value.observedToolEvents!==undefined&&(!Number.isSafeInteger(value.observedToolEvents)||value.observedToolEvents<0||value.observedToolEvents>10000))throw Error('Invalid observed tool count');
  if(value.toolAccounting!==undefined){const t=value.toolAccounting;if(!t||Object.keys(t).some(k=>!['anonymous','conflicts','distinctIds','incomplete','responseCompleted','requestedLimit','reportedCalls','duplicateObservations','terminalCalls','dispatchUnknown','queued','inProgress','searching','otherPending'].includes(k))||typeof t.responseCompleted!=='boolean'||['anonymous','conflicts','distinctIds','incomplete'].some(k=>!Number.isSafeInteger(t[k])||t[k]<0||t[k]>10000))throw Error('Invalid tool accounting diagnostic');for(const k of ['requestedLimit','reportedCalls','duplicateObservations','terminalCalls','dispatchUnknown','queued','inProgress','searching','otherPending'])if(t[k]!==undefined&&(!Number.isSafeInteger(t[k])||t[k]<0||t[k]>10000))throw Error('Invalid tool accounting counter');}
  if(value.extraction!==undefined)validateExtractionDiagnostics(value.extraction);
  if(value.validation!==undefined)validateSourceEvaluationDiagnostics(value.validation);
  if(value.limitationFailure!==undefined)validateLimitationFailure(value.limitationFailure);
  return value;
}
// A previous run's diagnostic must not diagnose a newer dispatched request.
export function matchingEvaluationFailure(task){
  const diagnostic=task.serviceDiagnostic,receipt=task.researchExecution;
  try{validateServiceDiagnostic(diagnostic);}catch{return null;}
  return diagnostic.phase==='SOURCE_EVALUATION'&&diagnostic.errorCategory&&receipt?.correlationId===diagnostic.correlationId&&receipt.operation===diagnostic.operation?diagnostic:null;
}
export function researchFailureMessage(diagnostic,hasCheckpoint=false){
  if(diagnostic?.errorCategory==='TOOL_LIFECYCLE_INCOMPLETE')return 'Research paused — The provider reported incomplete tool work, possibly beyond the requested limit. No sources were accepted and no repeat search is authorized.';
  if(diagnostic?.detail==='TOOL_BUDGET_EXCEEDED')return 'Research paused — The service returned more distinct tool calls than authorized. Potentially spent budget remains reserved; no repeat search is allowed.';
  if(['TOOL_ACCOUNTING_AMBIGUOUS','TOOL_EVENT_CONFLICT','TOOL_ACCOUNTING_LIMIT'].includes(diagnostic?.detail))return diagnostic.outcomeUnknown?'Research paused — The service returned ambiguous tool-call accounting. Potentially spent budget remains reserved; no repeat search is allowed.':'Research paused — The service returned more distinct tool calls than authorized. No knowledge was accepted and the search will not be repeated.';
  if(diagnostic?.detail==='LIMITATION_INVALID')return `Research paused — An evidence limitation could not be represented safely. ${hasCheckpoint?'Retrieved sources are saved for a bounded evaluation-only retry.':'No research knowledge was saved.'}`;
  return SERVICE_MESSAGES[diagnostic?.errorCategory]||'Research paused. The task details preserve the service failure.';
}
const invalidReceipt=task=>['TOOL_BUDGET_VIOLATION','TOOL_LIFECYCLE_INCOMPLETE','INVALID_TOOL_ACCOUNTING','RECEIPT_VALIDATION_FAILED','CHECKPOINT_VALIDATION_FAILED','EVIDENCE_VALIDATION_FAILED','STALE_RESEARCH_RESPONSE'].includes(task.code);
export const retryableServiceFailure=task=>!invalidReceipt(task)&&(!!task.pendingSourceEvaluation||!!task.pendingEvidence?.length||task.code==='RESPONSE_PARSE_ERROR'&&!!task.pendingSourceEvidence||['INTERRUPTED','OFFLINE','RATE_LIMITED','PLANNING_UNAVAILABLE','UPSTREAM_NETWORK_ERROR','UPSTREAM_TIMEOUT','REQUEST_INTERRUPTED','UPSTREAM_HTTP_ERROR','RESPONSE_SERIALIZATION_ERROR'].includes(task.code));
// A saved source plan must never trigger another search when its ceiling was reserved.
export function canRetryResearch(task){
  if(invalidReceipt(task))return false;
  if(task.pendingEvidence?.length||task.pendingSourceEvaluation)return true;
  if(task.attempts>2||task.attempts===2&&task.code!=='QUEUED')return false;
  if(task.pendingSourceEvidence)return (task.modelCalls||0)<4;
  if(task.sourcePlan)return (task.sourceRequests||0)<2&&(task.modelCalls||0)+2<=4;
  return (task.planningCalls||0)<2&&(task.modelCalls||0)<4;
}
