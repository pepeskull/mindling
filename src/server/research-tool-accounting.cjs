'use strict';
const {fail}=require('./research-http.cjs');
// Reservations limit dispatch. Observed counters describe provider output and
// may exceed that reservation on a rejected response; they are not billing data.
function accountTools(payload,ceiling,trace){
  const output=Array.isArray(payload?.output)?payload.output:[],raw=output.filter(item=>item?.type==='web_search_call'),seen=new Map(),calls=[];
  trace.observedToolEvents=raw.length;
  const conflicts=new Set();
  for(const call of raw){
    if(typeof call.id==='string'&&call.id){
      if(seen.has(call.id)){if(JSON.stringify(seen.get(call.id))!==JSON.stringify(call))conflicts.add(call.id);continue;}
      seen.set(call.id,call);
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
