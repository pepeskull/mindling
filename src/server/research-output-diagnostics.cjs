'use strict';
// Response-local identity ordinals preserve repeated-ID/order information without
// exposing arbitrary provider strings. References are observations, not evidence.
const statuses=['completed','failed','incomplete','searching','in_progress','queued','cancelled'];
const choice=(value,allowed)=>allowed.includes(value)?value:'other';
function outputDiagnostics(payload,limit){
  const output=Array.isArray(payload?.output)?payload.output:[],ids=new Map();
  const items=output.slice(0,64).map((item,index)=>{
    const id=typeof item?.id==='string'&&item.id?item.id:null;
    if(id&&!ids.has(id))ids.set(id,ids.size+1);
    const content=Array.isArray(item?.content)?item.content:[];
    return {index,identity:id?ids.get(id):null,
      type:choice(item?.type,['web_search_call','message','reasoning']),
      status:choice(item?.status,statuses),
      action:choice(item?.action?.type,['search','open_page','find_in_page']),
      sourceReferences:Array.isArray(item?.action?.sources)?Math.min(10000,item.action.sources.filter(s=>typeof s?.url==='string').length):0,
      actionURL:typeof item?.action?.url==='string',
      citationReferences:Math.min(10000,content.reduce((n,c)=>n+(Array.isArray(c?.annotations)?c.annotations.filter(a=>a?.type==='url_citation').length:0),0)),
      textPresent:content.some(c=>c?.type==='output_text'&&typeof c.text==='string'&&c.text.length>0)};
  });
  return {responseStatus:choice(payload?.status,statuses),requestedMaxToolCalls:limit,
    incompleteDetailsPresent:payload?.incomplete_details!=null,
    incompleteReason:choice(payload?.incomplete_details?.reason,['max_output_tokens','content_filter']),
    omittedItems:Math.min(10000,Math.max(0,output.length-items.length)),items};
}
module.exports={outputDiagnostics};
