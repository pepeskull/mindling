'use strict';
const {fail}=require('./research-http.cjs');
// Only identical provider IDs establish one invocation. Never deduplicate by
// query, URL, action text or position: a repeat search can consume another call.
const terminal=status=>['completed','failed'].includes(status);
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
  const output=Array.isArray(payload?.output)?payload.output:[],raw=output.filter(item=>item?.type==='web_search_call'),seen=new Map(),calls=[];
  trace.observedToolEvents=raw.length;
  const conflicts=new Set();
  for(const call of raw){
    if(typeof call.id==='string'&&call.id){
      if(seen.has(call.id)){
        const index=seen.get(call.id);
        try{calls[index]=mergeEvent(calls[index],call);}catch{conflicts.add(call.id);}
        continue;
      }
      seen.set(call.id,calls.length);
    }
    calls.push(call);
  }
  const bounded=calls.length<=64;
  const confirmed=calls.filter(c=>!conflicts.has(c.id));
  trace.completed=bounded?confirmed.filter(c=>c.status==='completed').length:0;
  trace.failed=bounded?confirmed.filter(c=>c.status==='failed').length:0;
  trace.searchCompleted=trace.completed>0;
  trace.outcomeUnknown=!bounded||conflicts.size>0||payload?.status!=='completed'||!Array.isArray(payload?.output)||calls.some(c=>!['completed','failed'].includes(c.status));
  if(!bounded)throw fail('RESPONSE_PARSE_ERROR','TOOL_ACCOUNTING_LIMIT');
  if(conflicts.size)throw fail('RESPONSE_PARSE_ERROR','TOOL_EVENT_CONFLICT');
  if(calls.length>ceiling){
    // Anonymous repeated-looking entries cannot safely be assumed to be
    // duplicate lifecycle events, nor evidence of distinct billable calls.
    if(calls.some(c=>typeof c.id!=='string'||!c.id)){
      trace.completed=calls.filter(c=>c.id&&c.status==='completed').length;trace.failed=calls.filter(c=>c.id&&c.status==='failed').length;
      trace.searchCompleted=trace.completed>0;trace.outcomeUnknown=true;throw fail('RESPONSE_PARSE_ERROR','TOOL_ACCOUNTING_AMBIGUOUS');
    }
    throw fail('RESPONSE_PARSE_ERROR','TOOL_BUDGET_EXCEEDED');
  }
  return calls;
}
module.exports={accountTools};
