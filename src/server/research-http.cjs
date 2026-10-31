'use strict';
// Fixed metadata only: never retain/log prompts, upstream error messages or headers.
const fail=(code,detail)=>Object.assign(Error(code),{code,detail});
function endpoint(url){return url.includes('/models/')?'models':url.endsWith('/responses')?'responses':'completions';}
async function readJSON(response,limit){
  if(!/application\/json/i.test(response.headers.get('content-type')||''))throw fail('RESPONSE_PARSE_ERROR','CONTENT_TYPE_INVALID');
  if(Number(response.headers.get('content-length'))>limit)throw fail('RESPONSE_PARSE_ERROR','BODY_LIMIT');
  const reader=response.body?.getReader();if(!reader)throw fail('RESPONSE_PARSE_ERROR','BODY_MISSING');
  const chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw fail('RESPONSE_PARSE_ERROR','BODY_LIMIT');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
  try{return {payload:JSON.parse(Buffer.concat(chunks).toString('utf8')),bytes:size};}catch{throw fail('RESPONSE_PARSE_ERROR','JSON_INVALID');}
}
async function requestJSON(url,options,trace,limit=65536){
  const target=endpoint(url);trace.endpoint=target;trace.upstreamStatus=null;delete trace.upstreamRequestId;
  if(target==='responses'){trace.searchDispatched=true;trace.outcomeUnknown=true;}
  let response;
  try{response=await fetch(url,{...options,redirect:'error'});}catch(error){throw fail(error.name==='AbortError'?'REQUEST_INTERRUPTED':'UPSTREAM_NETWORK_ERROR','FETCH_FAILED');}
  trace.upstreamStatus=response.status;
  const requestId=response.headers.get('x-request-id'),credential=String(options.headers?.Authorization||'').replace(/^Bearer /,'');if(/^[A-Za-z0-9_-]{1,120}$/.test(requestId||'')&&(!credential||!requestId.includes(credential)))trace.upstreamRequestId=requestId;
  if(!response.ok){
    let body;try{body=(await readJSON(response,8192)).payload;}catch{/* An HTML/error body is never logged. */}
    if(target==='responses'&&[400,401,403,404,422,429].includes(response.status))trace.outcomeUnknown=false;
    const code=body?.error?.code,param=body?.error?.param;
    const category=target==='models'&&response.status===404||code==='model_not_found'||param==='model'?'MODEL_UNAVAILABLE':code==='unsupported_tool'||code==='tool_not_supported'||response.status===400&&typeof param==='string'&&/^(?:tools|tool_choice)(?:\b|\[|\.)/.test(param)?'TOOL_UNSUPPORTED':response.status===400?'INVALID_REQUEST':response.status===429?'RATE_LIMITED':'UPSTREAM_HTTP_ERROR';
    throw Object.assign(fail(category,'HTTP_REJECTED'),{status:response.status});
  }
  try{return await readJSON(response,limit);}catch(error){if(error.code)throw error;throw fail(options.signal?.aborted?'REQUEST_INTERRUPTED':error.name==='TypeError'?'UPSTREAM_NETWORK_ERROR':'RESPONSE_PARSE_ERROR','RESPONSE_BODY_FAILED');}
}
function snapshot(trace,code,detail){
  const result={correlationId:trace.correlationId,operation:trace.operation,phase:trace.phase,endpoint:trace.endpoint,upstreamStatus:trace.upstreamStatus,errorCategory:code,detail:detail||'UNCLASSIFIED',durationMs:Date.now()-trace.startedAt,searchRequested:trace.searchRequested,searchDispatched:trace.searchDispatched,searchCompleted:trace.searchCompleted,completed:trace.completed,failed:trace.failed,outcomeUnknown:trace.outcomeUnknown,sourceCount:trace.sourceCount,fallbackReason:'none',modelConfirmed:!!trace.modelConfirmed};
  if(trace.upstreamRequestId)result.upstreamRequestId=trace.upstreamRequestId;
  return result;
}
module.exports={fail,requestJSON,snapshot};
