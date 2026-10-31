export const SERVICE_MESSAGES=Object.freeze({
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
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['correlationId','operation','phase','endpoint','upstreamStatus','upstreamRequestId','errorCategory','detail','durationMs','searchRequested','searchDispatched','searchCompleted','completed','failed','outcomeUnknown','sourceCount','fallbackReason','modelConfirmed'].includes(key)))throw Error('Invalid service diagnostic');
  if(!/^[a-f0-9]{64}$/.test(value.correlationId)||!['research','research-acquire','research-evaluate','research-capabilities'].includes(value.operation)||!['SERVICE','MODEL','PLANNING','INFORMATION','SOURCE_EVALUATION'].includes(value.phase)||![null,'models','responses','completions'].includes(value.endpoint)||!(value.upstreamStatus===null||Number.isSafeInteger(value.upstreamStatus)&&value.upstreamStatus>=100&&value.upstreamStatus<=599)||value.errorCategory!==null&&!Object.hasOwn(SERVICE_MESSAGES,value.errorCategory)||!/^[A-Z_]{1,60}$/.test(value.detail)||!Number.isSafeInteger(value.durationMs)||value.durationMs<0||value.durationMs>120000||['searchRequested','searchDispatched','searchCompleted','outcomeUnknown'].some(key=>typeof value[key]!=='boolean')||['completed','failed'].some(key=>!Number.isSafeInteger(value[key])||value[key]<0||value[key]>2)||!Number.isSafeInteger(value.sourceCount)||value.sourceCount<0||value.sourceCount>3||value.fallbackReason!=='none'||value.modelConfirmed!==undefined&&typeof value.modelConfirmed!=='boolean'||value.upstreamRequestId!==undefined&&!/^[A-Za-z0-9_-]{1,120}$/.test(value.upstreamRequestId))throw Error('Invalid service diagnostic');
  return value;
}
export const retryableServiceFailure=task=>task.code==='RESPONSE_PARSE_ERROR'&&!!task.pendingSourceEvidence||['INTERRUPTED','OFFLINE','RATE_LIMITED','PLANNING_UNAVAILABLE','UPSTREAM_NETWORK_ERROR','UPSTREAM_TIMEOUT','REQUEST_INTERRUPTED','UPSTREAM_HTTP_ERROR'].includes(task.code);
// A saved source plan must never trigger another search when its ceiling was reserved.
export function canRetryResearch(task){
  if(task.pendingEvidence?.length)return true;
  if(task.attempts>2||task.attempts===2&&task.code!=='QUEUED')return false;
  if(task.pendingSourceEvidence)return (task.modelCalls||0)<4;
  if(task.sourcePlan)return (task.sourceRequests||0)<2&&(task.modelCalls||0)+2<=4;
  return (task.planningCalls||0)<2&&(task.modelCalls||0)<4;
}
