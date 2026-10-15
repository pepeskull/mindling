import { validateMemoryAssessment, validateMemoryContext } from '../../semantic/memory-intelligence.js';
import { validateAssessment } from './engine.js';
export async function analyzeLearning({text,pathway,token,identity,context,signal,fetcher=fetch}) {
  let body={text,pathway},endpoint='/api/preview-learning';
  const headers={'Content-Type':'application/json'};
  if(context){validateMemoryContext(context);body.context=context;}
  if(identity){
    const {kty,crv,x,y}=identity.publicKey;
    body={text,pathway,...(context?{context}:{}),identity:{mindlingId:identity.mindlingId,publicKey:{kty,crv,x,y}},nonce:crypto.randomUUID(),issuedAt:Date.now()};
    const key=await crypto.subtle.importKey('jwk',identity.privateKey,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
    const signature=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,new TextEncoder().encode(JSON.stringify(body))));
    body.signature=btoa(String.fromCharCode(...signature));endpoint='/api/learning';
  }else{
    if(!token)throw Error('Learning is temporarily unavailable. Check preview access in diagnostics.');
    headers.Authorization=`Bearer ${token}`;
  }
  if(new TextEncoder().encode(JSON.stringify(body)).length>9000)throw Error('Learning context is too large. No Energy or rewards changed.');
  let response;try{response=await fetcher(endpoint,{method:'POST',headers,body:JSON.stringify(body),signal});}catch{throw Error('Learning is temporarily unavailable. No Energy or XP changed.');}
  if(!response.ok){const body=await response.json().catch(()=>({}));throw Error(body.error==='REQUEST_REPLAYED'?'This learning request was already submitted. Try again.':'Learning is temporarily unavailable. No Energy or rewards changed.');}
  try {
    const result=await response.json();validateAssessment(result.assessment);
    if(identity)validateMemoryAssessment(result.assessment,context || {memories:[],categories:[]},text);
    return result.assessment;
  } catch { throw Error('Learning is temporarily unavailable. No Energy or rewards changed.'); }
}
