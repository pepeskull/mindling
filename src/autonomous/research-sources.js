import { features, sentences } from '../learning/text.js';
import { LIMITS, digest } from './tasks.js';
import { understandInput } from '../learning/input-understanding.js';

export function publicTextURL(value){
  if(typeof value!=='string'||value.length>500)throw Error('Use a public HTTPS text-document URL of at most 500 characters.');
  let url;try{url=new URL(value);}catch{throw Error('Enter a complete public HTTPS document URL.');}
  const host=url.hostname.toLowerCase();
  // No proxy, credentials, private-network targets or signed credential URLs.
  if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||host.includes(':')||/^\d+(?:\.\d+){3}$/.test(host)||!host.includes('.')||/[?&](?:key|token|secret|auth|signature|credential)[^=]*=/i.test(url.search))throw Error('Use a public HTTPS hostname without credentials, private-network addresses or access tokens.');
  url.hash='';if(url.href.length>500)throw Error('The normalized document URL exceeds 500 characters.');return url.href;
}

export async function retrieveDocument(url,{signal}={}){
  url=publicTextURL(url);
  const controller=new AbortController(),abort=()=>controller.abort();
  if(signal?.aborted)abort();signal?.addEventListener('abort',abort,{once:true});
  const timeout=setTimeout(abort,18000);
  try{
    const response=await fetch(url,{method:'GET',mode:'cors',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',cache:'no-store',signal:controller.signal});
    if(!response.ok||response.type==='opaque')throw Error('The authorized document could not be read. It must permit browser CORS access.');
    const type=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
    if(!['text/plain','text/markdown','text/x-markdown'].includes(type))throw Error('Only public plain-text or Markdown documents are supported. HTML, search pages and authenticated sources are not imported.');
    if(Number(response.headers.get('content-length'))>LIMITS.sourceBytes)throw Error('The source exceeds the 64 KiB research limit.');
    if(!response.body?.getReader)throw Error('Bounded document streaming is unavailable in this browser.');
    const reader=response.body.getReader(),parts=[];let size=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>LIMITS.sourceBytes)throw Error('The source exceeds the 64 KiB research limit.');parts.push(value);}}finally{await reader.cancel().catch(()=>{});}
    const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    if(!text.trim()||/[\p{Cc}\p{Cf}]/u.test(text.replace(/[\n\r\t]/g,'')))throw Error('The source has no safe readable text.');
    return {url,text,hash:await digest(text),observedAt:Date.now()};
  }catch(error){if(controller.signal.aborted)throw new DOMException('Research was interrupted or timed out.','AbortError');if(error.name==='TypeError')throw Error('The document is not browser-accessible. Public CORS access is required; redirects and restricted sources are not followed.');throw error;}
  finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
}

export async function evaluateDocument(document,interpretation){
  const terms=features(interpretation.topic).anchors.filter(term=>!['learn','about','analyze','analyse','compare','study','research','explain','lära','lär','om','analysera','jämför','top','every','all','alla','now','currently','current'].includes(term));
  const ranked=sentences(document.text).map((quote,index)=>{
    const f=features(quote),shared=terms.filter(term=>f.terms.includes(term));
    return {quote,index,shared:shared.length,score:shared.length/Math.max(1,terms.length)};
  }).filter(item=>item.quote.length>=40&&item.quote.length<=700&&item.shared>=Math.min(2,Math.max(1,terms.length))&&item.score>=.25
    &&!/[?？]$/.test(item.quote)&&!/^\s*(?:#|>|```|https?:|learn\b|please\b|ignore\b|system\b|instruction\b|click\b|subscribe\b)/iu.test(item.quote))
    .sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,LIMITS.memories);
  const accepted=[];
  for(const item of ranked){
    if(understandInput(item.quote,'TEACH').intent!=='FACT_TEACHING')continue;
    const region=interpretation.scope.region;
    if(region==='Europe'&&!/\b(?:Europe|European|Europa|europeiska)\b/iu.test(item.quote)||region==='Sweden'&&!/\b(?:Sweden|Swedish|Sverige|svensk[at]?)\b/iu.test(item.quote))continue;
    const dates=[...item.quote.matchAll(/\b(?:as of|updated(?: on)?|observed on|data as at|standings on|uppdaterad|gäller)\s*:?\s*(\d{4}-\d{2}-\d{2})\b/giu)].flatMap(match=>{const value=Date.parse(`${match[1]}T00:00:00Z`);return Number.isFinite(value)&&new Date(value).toISOString().slice(0,10)===match[1]?[value]:[];});
    const validAt=dates.length?Math.max(...dates):null;
    // Fetch time does not prove that a reported league table or price is current.
    if(interpretation.timeSensitive&&(validAt===null||validAt>document.observedAt||document.observedAt-validAt>86400000))continue;
    accepted.push({quote:item.quote,quoteHash:await digest(item.quote),validAt});
  }
  return accepted;
}
