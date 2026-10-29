import { readResearchResponse, publicTextURL } from './research-sources.js';
import { digest } from './tasks.js';
import { features } from '../learning/text.js';
export const DISCOVERY_PROVIDERS=Object.freeze([
  Object.freeze({id:'wikipedia-en',host:'en.wikipedia.org',language:'en',name:'Wikipedia · English',supportsFreshness:false,coverage:'General, scientific, historical and sports reference material; no live standings, prices or primary research search.'}),
  Object.freeze({id:'wikipedia-sv',host:'sv.wikipedia.org',language:'sv',name:'Wikipedia · Svenska',supportsFreshness:false,coverage:'Svenskt referensmaterial om allmänkunskap, vetenskap, historia och sport; inga livetabeller eller aktuella priser.'})
]);
export const providerById=id=>DISCOVERY_PROVIDERS.find(provider=>provider.id===id)||null;
export function discoveryQuery(task,approvedQuery=null){
  const original=task.objective,topic=[task.topic,task.scope?.detail].filter(Boolean).join(' ');
  const privateData=/[\p{Cf}]|@|https?:|\b[A-Za-z0-9+/_=-]{32,}\b|\b(?:0x[0-9a-f]{8,}|[0-9]{6,}|password|secret|wallet|address|phone|personnummer|lösenord|plånbok|adress|telefon)\b/iu;
  const personal=/\b(?:my|mine|our|mitt|min|mina|vår|jag|patient|diagnosis|medical record|diagnos|journal|legal case|salary|lön)\b/iu;
  if(approvedQuery!==null){if(typeof approvedQuery!=='string'||approvedQuery.length>120||/[\p{Cc}\p{Cf}]/u.test(approvedQuery)||privateData.test(approvedQuery)||personal.test(approvedQuery)||!approvedQuery.trim())throw Error('Use a short public topic without personal identifiers or private details.');return {query:approvedQuery.trim(),sensitive:false};}
  if(privateData.test(original)||personal.test(original)||/(?:^|\s)\p{Lu}[\p{Ll}\p{M}]{2,}\s+\p{Lu}[\p{Ll}\p{M}]{2,}(?:\s|$|[,.!?])/u.test(topic))return {query:'',sensitive:true};
  const excluded=new Set(['learn','about','study','research','analyze','analyse','compare','top','first','last','every','please','what','which','who','how','best','current','currently','now','the','lär','dig','om','undersök','jämför','vilket','vilken','vad','bäst','just','nu','senaste']);
  const query=features(topic).terms.filter(term=>!excluded.has(term)&&!/^\d+$/u.test(term)).join(' ').slice(0,120).trim();
  if((task.scope?.excludedTopics||[]).some(topic=>features(topic).terms.some(term=>features(query).terms.includes(term))))return {query:'',sensitive:true};
  if(!query||privateData.test(query)||personal.test(query))return {query:'',sensitive:true};
  return {query,sensitive:false};
}
function endpoint(provider,params){return `https://${provider.host}/w/api.php?${new URLSearchParams({action:'query',format:'json',formatversion:'2',origin:'*',maxlag:'5',...params})}`;}
function payload(response){let data;try{data=JSON.parse(response.text);}catch{throw Error('The discovery provider returned unreadable data.');}if(data.error||!data.query||!Array.isArray(data.query.pages))throw Error('No suitable reference sources were returned.');return data;}
function pageURL(provider,page){
  const url=new URL(publicTextURL(page.canonicalurl||page.fullurl));
  if(url.hostname!==provider.host||!url.pathname.startsWith('/wiki/'))throw Error('The reference source identity could not be validated.');return url.href;
}
export async function discoverSources({providerId,query,signal,byteLimit}){
  const provider=providerById(providerId);if(!provider||typeof query!=='string'||!query||query.length>120)throw Error('No compatible discovery provider or bounded query is available.');
  const response=await readResearchResponse(endpoint(provider,{generator:'search',gsrsearch:query,gsrnamespace:'0',gsrlimit:'4',gsrprop:'',prop:'info',inprop:'url'}),{signal,types:['application/json'],byteLimit});
  try{
    const pages=payload(response).query.pages;if(pages.length>4)throw Error('The discovery result exceeded its candidate bound.');
    const candidates=pages.filter(page=>Number.isSafeInteger(page.pageid)&&page.pageid>0&&page.ns===0&&!page.missing&&typeof page.title==='string'&&page.title.length<=160).map(page=>({pageId:page.pageid,url:pageURL(provider,page),title:page.title,provider:provider.id,discoveredAt:response.observedAt,format:'MediaWiki plaintext extract',queryMatch:features(query).terms.filter(term=>features(page.title).terms.includes(term)).length}));
    // Relevance ranking is a selection hint, never factual validation.
    candidates.sort((a,b)=>b.queryMatch-a.queryMatch||a.pageId-b.pageId);
    return {candidates,byteLength:response.byteLength};
  }catch(error){error.bytesRead=response.byteLength;throw error;}
}
export async function retrieveDiscovered(candidate,{signal,byteLimit}){
  const provider=providerById(candidate?.provider);if(!provider||!Number.isSafeInteger(candidate.pageId)||candidate.pageId<=0)throw Error('Invalid source candidate.');
  const response=await readResearchResponse(endpoint(provider,{pageids:String(candidate.pageId),prop:'extracts|info|revisions',explaintext:'1',exintro:'1',exchars:'1200',inprop:'url',rvprop:'timestamp'}),{signal,types:['application/json'],byteLimit});
  try{
    const pages=payload(response).query.pages,page=pages.find(page=>page.pageid===candidate.pageId);
    if(pages.length!==1||!page||page.missing||page.ns!==0||typeof page.extract!=='string'||!page.extract.trim()||page.extract.length>10000)throw Error('The selected reference has no usable plain-text extract.');
    const url=pageURL(provider,page);if(url!==candidate.url)throw Error('The source identity changed; discovery must be repeated.');
    const revised=page.revisions?.[0]?.timestamp;
    return {url,text:page.extract,hash:await digest(page.extract),observedAt:response.observedAt,byteLength:response.byteLength,provider:provider.id,title:page.title,revisionAt:typeof revised==='string'&&Number.isFinite(Date.parse(revised))?revised:null};
  }catch(error){error.bytesRead=response.byteLength;throw error;}
}
