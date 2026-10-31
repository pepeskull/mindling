'use strict';
const fail=(category,reason)=>Object.assign(Error(category),{category,reason});
async function readProviderJSON(response,limit=65536){
  if(response.headers?.get&&Number(response.headers.get('content-length'))>limit)throw fail('RESPONSE_PARSE_ERROR','BODY_LIMIT');
  if(response.body?.getReader){
    const reader=response.body.getReader(),parts=[];let size=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw fail('RESPONSE_PARSE_ERROR','BODY_LIMIT');parts.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
    try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw fail('RESPONSE_PARSE_ERROR','JSON_INVALID');}
  }
  // Also supports the existing minimal fetch adapters; native nonempty Fetch
  // responses use the bounded streaming path above.
  let payload;try{payload=await response.json();}catch{throw fail('RESPONSE_PARSE_ERROR','JSON_INVALID');}
  if(Buffer.byteLength(JSON.stringify(payload))>limit)throw fail('RESPONSE_PARSE_ERROR','BODY_LIMIT');return payload;
}
async function providerJSON(url,options,trace){
  trace.endpoint=url.includes('/models/')?'models':'completions';trace.upstreamStatus=null;delete trace.upstreamRequestId;
  let response;try{response=await fetch(url,{...options,redirect:'error'});}catch(error){throw fail(error.name==='AbortError'?'REQUEST_INTERRUPTED':'UPSTREAM_NETWORK_ERROR','FETCH_FAILED');}
  trace.upstreamStatus=response.status??(response.ok?200:null);
  const id=response.headers?.get('x-request-id'),key=String(options.headers?.Authorization||'').replace(/^Bearer /,'');
  if(/^req_[A-Za-z0-9_-]{1,100}$/.test(id||'')&&(!key||!id.includes(key)))trace.upstreamRequestId=id;
  if(!response.ok){
    let body;try{body=await readProviderJSON(response,8192);}catch{/* Never expose an error body. */}
    const code=body?.error?.code,param=body?.error?.param;
    trace.upstreamErrorCode=['invalid_json_schema','model_not_found','invalid_api_key','insufficient_quota','rate_limit_exceeded','unsupported_parameter','unsupported_value','invalid_request_error'].includes(code)?code:null;
    trace.upstreamErrorParam=typeof param==='string'?['model','response_format','max_completion_tokens','messages'].find(root=>param===root||param.startsWith(root+'.')||param.startsWith(root+'['))||null:null;
    throw fail(code==='model_not_found'?'MODEL_UNAVAILABLE':response.status===400?'INVALID_REQUEST':response.status===429?'RATE_LIMITED':'UPSTREAM_HTTP_ERROR','UPSTREAM_HTTP_REJECTED');
  }
  if(trace.endpoint==='completions')trace.phase='RESPONSE_PARSE';
  try{return await readProviderJSON(response);}catch(error){if(error.category)throw error;throw fail(options.signal.aborted?'REQUEST_INTERRUPTED':'UPSTREAM_NETWORK_ERROR','RESPONSE_BODY_FAILED');}
}
function assessmentText(payload,trace){
  const choice=payload?.choices?.[0],message=choice?.message;
  trace.finishReason=['stop','length','content_filter','tool_calls','function_call'].includes(choice?.finish_reason)?choice.finish_reason:null;
  if(message?.refusal)throw fail('RESPONSE_PARSE_ERROR','MODEL_REFUSAL');
  if(choice?.finish_reason&&choice.finish_reason!=='stop')throw fail('RESPONSE_PARSE_ERROR',choice.finish_reason==='length'?'OUTPUT_TRUNCATED':'UNEXPECTED_FINISH_REASON');
  const content=message?.content;
  const output=typeof content==='string'?content:Array.isArray(content)&&content.every(item=>item?.type==='text'&&typeof item.text==='string')?content.map(item=>item.text).join(''):'';
  if(!output.trim())throw fail('RESPONSE_PARSE_ERROR','ASSESSMENT_TEXT_MISSING');
  if(output.length>32000)throw fail('RESPONSE_PARSE_ERROR','ASSESSMENT_TEXT_LIMIT');
  return output;
}
module.exports={fail,providerJSON,assessmentText};
