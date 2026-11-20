'use strict';
const {fail}=require('./research-http.cjs');
const {outputDiagnostics}=require('./research-output-diagnostics.cjs');
// Only identical provider IDs establish one invocation. Never deduplicate by
// query, URL, action text or position: a repeat search can consume another call.
const terminal=status=>['completed','failed'].includes(status);
const knownId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(id);
const pending=status=>['queued','in_progress','searching'].includes(status);
function mergeFields(a,b,key=''){
  if(a===undefined)return b;
  if(b===undefined)return a;
  if(a===b)return a;
  if(Array.isArray(a)&&Array.isArray(b)){
    if(key==='sources')return [...a,...b]; // Actual provider source entries only.
    if(a.length!==b.length)throw Error('conflict');
    return a.map((value,i)=>mergeFields(value,b[i]));
  }
  if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){
    const result={...a};for(const key of Object.keys(b))result[key]=mergeFields(a[key],b[key],key);return result;
  }
  throw Error('conflict');
}
function mergeEvent(a,b){
  if(a.status!==b.status&&!(pending(a.status)&&terminal(b.status))&&!(terminal(a.status)&&pending(b.status))&&!(pending(a.status)&&pending(b.status)))throw Error('conflict');
  const {status:before,...first}=a,{status:after,...second}=b;
  return {...mergeFields(first,second),status:terminal(before)?before:after};
}
// Reservations limit dispatch. Observed counters describe provider output and
// may exceed that reservation on a rejected response; they are not billing data.
function accountTools(payload,ceiling,trace){
  trace.providerOutput=outputDiagnostics(payload,ceiling);
  const output=Array.isArray(payload?.output)?payload.output:[],raw=output.filter(item=>item?.type==='web_search_call'),seen=new Map(),calls=[];
  trace.observedToolEvents=raw.length;
  const conflicts=new Set(),completedActions=new Map();
  for(const call of raw){
    if(knownId(call.id)){
      if(call.status==='completed'){
        // A same-ID pending event can supply lifecycle information, never
        // citation authority. Only terminal success may supply source fields.
        try{completedActions.set(call.id,mergeFields(completedActions.get(call.id),call.action));}
        catch{conflicts.add(call.id);}
      }
      if(seen.has(call.id)){
        const index=seen.get(call.id);
        try{calls[index]=mergeEvent(calls[index],call);}catch{conflicts.add(call.id);}
        continue;
      }
      seen.set(call.id,calls.length);
    }
    calls.push(call);
  }
  trace.toolAccounting={distinctIds:seen.size,anonymous:calls.filter(c=>!knownId(c.id)).length,conflicts:conflicts.size,incomplete:calls.filter(c=>!['completed','failed'].includes(c.status)).length,responseCompleted:payload?.status==='completed',requestedLimit:ceiling,reportedCalls:calls.length,duplicateObservations:raw.length-calls.length,terminalCalls:calls.filter(c=>terminal(c.status)&&knownId(c.id)&&!conflicts.has(c.id)).length,dispatchUnknown:calls.filter(c=>!terminal(c.status)||!knownId(c.id)||conflicts.has(c.id)).length};
  // Status counts distinguish provider lifecycle shapes without logging IDs,
  // queries, source text or assuming that a pending invocation was dispatched.
  if(trace.toolAccounting.incomplete){const unfinished=calls.filter(c=>!terminal(c.status));Object.assign(trace.toolAccounting,{queued:unfinished.filter(c=>c.status==='queued').length,inProgress:unfinished.filter(c=>c.status==='in_progress').length,searching:unfinished.filter(c=>c.status==='searching').length,otherPending:unfinished.filter(c=>!pending(c.status)).length});}
  const bounded=calls.length<=64;
  const confirmed=calls.filter(c=>knownId(c.id)&&!conflicts.has(c.id));
  trace.completed=bounded?confirmed.filter(c=>c.status==='completed').length:0;
  trace.failed=bounded?confirmed.filter(c=>c.status==='failed').length:0;
  trace.searchCompleted=trace.completed>0;
  trace.outcomeUnknown=!bounded||trace.toolAccounting.anonymous>0||conflicts.size>0||payload?.status!=='completed'||Boolean(payload?.incomplete_details)||!Array.isArray(payload?.output)||calls.some(c=>!['completed','failed'].includes(c.status));
  if(!bounded)throw fail('INVALID_TOOL_ACCOUNTING','TOOL_ACCOUNTING_LIMIT');
  if(conflicts.size)throw fail('INVALID_TOOL_ACCOUNTING','TOOL_EVENT_CONFLICT');
  if(trace.toolAccounting.anonymous)throw fail('INVALID_TOOL_ACCOUNTING','TOOL_ACCOUNTING_AMBIGUOUS');
  const terminalOutput=calls.map(call=>call.status==='completed'?{...call,action:completedActions.get(call.id)}:call);
  if(trace.completed+trace.failed>ceiling)throw fail('TOOL_BUDGET_VIOLATION','TOOL_BUDGET_EXCEEDED');
  if(trace.toolAccounting.incomplete){
    const detail=calls.length>ceiling?'TOOL_LIMIT_OUTCOME_UNKNOWN':'TOOL_LIFECYCLE_INCOMPLETE';
    const failure=fail('TOOL_LIFECYCLE_INCOMPLETE',detail);
    // Only a completed report can yield observations. The unfinished items
    // cannot supply source authority, even if they fit inside the ceiling.
    if(payload.status==='completed'&&!payload.incomplete_details&&trace.completed>0){
      failure.completedObservations=terminalOutput.filter(call=>call.status==='completed');
    }
    throw failure;
  }
  return terminalOutput;
}
module.exports={accountTools};
