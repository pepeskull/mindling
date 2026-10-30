'use strict';
// Fixed public API only. Neither a browser/model URL nor a redirect can become
// a fetch target. Uses built-in Node transport/DNS/crypto; no proxy/dependency.
const https=require('node:https'),dns=require('node:dns').promises,net=require('node:net'),crypto=require('node:crypto');
const HOST='www.ebi.ac.uk',PATH='/europepmc/webservices/rest/search',PROVIDER='europe-pmc';
let nextSourceAt=0;
const enabled=()=>process.env.MINDLING_RESEARCH_SOURCE===PROVIDER;
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
function publicAddress(address){
  if(net.isIP(address)===4){const [a,b,c]=address.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||a===100&&b>=64&&b<=127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);}
  if(net.isIP(address)===6){const value=address.toLowerCase();return /^[23]/.test(value)&&!/^2002:|^3fff:|^2001:db8:/.test(value)&&!(value.startsWith('2001:')&&parseInt(value.split(':')[1]||'0',16)<0x200);}
  return false;
}
async function addresses(signal){
  if(signal.aborted)throw new DOMException('Research cancelled.','AbortError');
  let abort;try{const entries=await Promise.race([dns.lookup(HOST,{all:true,verbatim:true}),new Promise((_,reject)=>{abort=()=>reject(new DOMException('Research cancelled.','AbortError'));signal.addEventListener('abort',abort,{once:true});})]);if(!entries.length||entries.some(entry=>!publicAddress(entry.address)))throw Error('SOURCE_ADDRESS_REJECTED');return entries.find(entry=>entry.family===4)||entries[0];}finally{if(abort)signal.removeEventListener('abort',abort);}
}
async function sourceTurn(signal){if(signal.aborted)throw new DOMException('Research cancelled.','AbortError');const delay=Math.max(0,nextSourceAt-Date.now());if(delay>5000)throw Error('SOURCE_BUSY');nextSourceAt=Date.now()+delay+500;if(delay)await new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new DOMException('Research cancelled.','AbortError'));},timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},delay);signal.addEventListener('abort',abort,{once:true});});}
async function json(query,{signal,core=false,size=3}={}){
  if(!enabled())throw Error('INFORMATION_UNCONFIGURED');await sourceTurn(signal);const address=await addresses(signal);
  const params=new URLSearchParams({query,format:'json',resulttype:core?'core':'lite',pageSize:String(size)});
  return new Promise((resolve,reject)=>{
    let settled=false;const finish=(error,data)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(data);};
    const request=https.request({hostname:HOST,port:443,path:`${PATH}?${params}`,method:'GET',servername:HOST,rejectUnauthorized:true,signal,
      headers:{Accept:'application/json','Accept-Encoding':'identity','User-Agent':'PlayMindling/1.0 (bounded biomedical research)'},
      lookup:(host,options,callback)=>{if(host!==HOST)return callback(Error('SOURCE_HOST_REJECTED'));if(options?.all)callback(null,[address]);else callback(null,address.address,address.family);}},response=>{
      const type=String(response.headers['content-type']||'').split(';')[0].toLowerCase();
      if(response.statusCode!==200||type!=='application/json'||Number(response.headers['content-length']||0)>(core?49152:16384)){response.destroy();finish(Error('SOURCE_RESPONSE_REJECTED'));return;}
      const chunks=[];let bytes=0;response.on('data',chunk=>{bytes+=chunk.length;if(bytes>(core?49152:16384)){response.destroy();finish(Error('SOURCE_TOO_LARGE'));}else chunks.push(chunk);});
      response.on('error',()=>finish(Error('SOURCE_READ_FAILED')));response.on('aborted',()=>finish(Error('SOURCE_READ_FAILED')));
      response.on('end',()=>{try{const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));if(!Array.isArray(data?.resultList?.result))throw Error('invalid');finish(null,{data,bytes,observedAt:Date.now()});}catch{finish(Error('SOURCE_DATA_INVALID'));}});
    });
    const timer=setTimeout(()=>{request.destroy();finish(Error('SOURCE_TIMEOUT'));},8000);request.on('error',error=>finish(signal.aborted?new DOMException('Research cancelled.','AbortError'):Error(error.message==='SOURCE_HOST_REJECTED'?error.message:'SOURCE_UNAVAILABLE')));request.end();
  });
}
const signature=(value,key)=>crypto.createHmac('sha256',key).update(`mindling-source-ticket-v1:${value}`).digest('hex');
function ticket(id,topic,key){const payload=`${id}.${Date.now()+300000}.${hash(topic)}`;return `${payload}.${signature(payload,key)}`;}
function ticketId(value,topic,key){
  if(typeof value!=='string'||value.length>200)throw Error('SOURCE_TICKET_INVALID');const [id,expires,topicHash,mac,...extra]=value.split('.'),payload=`${id}.${expires}.${topicHash}`;
  if(extra.length||!/^\d{1,12}$/.test(id)||!/^\d{13}$/.test(expires)||Number(expires)<Date.now()||Number(expires)>Date.now()+330000||topicHash!==hash(topic)||!/^[a-f0-9]{64}$/.test(mac||'')||!crypto.timingSafeEqual(Buffer.from(mac,'hex'),Buffer.from(signature(payload,key),'hex')))throw Error('SOURCE_TICKET_EXPIRED');return id;
}
function plain(value,max){
  if(typeof value!=='string')return '';
  const result=value.replace(/<\/?(?:p|div|h[1-6]|br|i|b|sup|sub|strong|em)(?:\s[^<>]{0,300})?\s*\/?\s*>/gi,' ').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,code)=>{const point=code[0].toLowerCase()==='x'?parseInt(code.slice(1),16):Number(code);return point>=32&&point<=0x10ffff&&!(point>=0xd800&&point<=0xdfff)?String.fromCodePoint(point):' ';}).replace(/&(amp|lt|gt|quot|apos|nbsp);/g,(_,entity)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '})[entity]).replace(/\s+/gu,' ').trim();
  if(/<[^>]*>|[\p{Cc}\p{Cf}]/u.test(result)||result.length>max)return '';return result;
}
function metadata(record,observedAt){
  if(record.source!=='MED'||!/^\d{1,12}$/.test(record.id||'')||record.isOpenAccess!=='Y')return null;
  const title=plain(record.title,240);if(!title)return null;const date=record.firstPublicationDate,at=typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)?Date.parse(`${date}T00:00:00Z`):NaN;
  return {id:`MED:${record.id}`,recordId:String(record.id),provider:PROVIDER,title,url:`https://europepmc.org/article/MED/${record.id}`,domain:'europepmc.org',publisher:plain(record.publisher,160)||null,journal:plain(record.journalInfo?.journal?.title||record.journalTitle,160)||null,publishedAt:Number.isFinite(at)&&new Date(at).toISOString().slice(0,10)===date&&at<=observedAt?date:null,observedAt,type:'publication-abstract'};
}
async function discover({topic,queries,remainingQueries},key,signal){
  const selected=queries.slice(0,Math.min(2,remainingQueries)),results=await Promise.allSettled(selected.map(query=>json(`(${query}) AND SRC:MED AND OPEN_ACCESS:Y AND HAS_ABSTRACT:Y AND NOT PUB_TYPE:"retracted publication" AND NOT PUB_TYPE:preprint`,{signal}))),candidates=[],seen=new Set();let bytes=0;const failures=[];
  for(const result of results){if(result.status==='rejected'){if(result.reason.name==='AbortError')throw result.reason;failures.push('Search source unavailable.');continue;}bytes+=result.value.bytes;for(const record of result.value.data.resultList.result){const item=metadata(record,result.value.observedAt);if(item&&!seen.has(item.id)){seen.add(item.id);candidates.push({...item,ticket:ticket(item.recordId,topic,key)});}}}
  return {provider:PROVIDER,queries:selected.length,completedQueries:results.filter(result=>result.status==='fulfilled').length,bytes,candidates:candidates.slice(0,3),failures};
}
async function retrieve({topic,tickets},key,signal){
  const ids=[...new Set(tickets.map(value=>ticketId(value,topic,key)))];const results=await Promise.allSettled(ids.map(id=>json(`EXT_ID:${id} AND SRC:MED`,{signal,core:true,size:1}))),sources=[],failures=[];let bytes=0;
  for(const [index,result]of results.entries()){
    if(result.status==='rejected'){if(result.reason.name==='AbortError')throw result.reason;failures.push({sourceId:`MED:${ids[index]}`,reason:'The publication abstract could not be retrieved.'});continue;}bytes+=result.value.bytes;
    const records=result.value.data.resultList.result,record=records[0],meta=record&&metadata(record,result.value.observedAt),text=plain(record?.abstractText,6000);
    const retracted=(record?.pubTypeList?.pubType||[]).some(type=>/retracted publication|retraction|expression of concern|preprint/i.test(type));
    if(records.length!==1||!meta||meta.recordId!==ids[index]||text.length<80||retracted){failures.push({sourceId:`MED:${ids[index]}`,reason:'The publication had no suitable complete open abstract.'});continue;}
    sources.push({...meta,text,hash:hash(text),status:'retrieved',byteLength:result.value.bytes});
  }
  return {provider:PROVIDER,sources,bytes,failures,requests:ids.length};
}
module.exports={enabled,discover,retrieve};
