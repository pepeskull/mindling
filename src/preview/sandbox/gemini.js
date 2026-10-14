import { validateAssessment } from './engine.js';
export async function analyzeLearning({text,pathway,token,identity,signal,fetcher=fetch}) {
  let body={text,pathway},endpoint='/api/preview-learning';
  const headers={'Content-Type':'application/json'};
  if(identity){
    const {kty,crv,x,y}=identity.publicKey;
    body={text,pathway,identity:{mindlingId:identity.mindlingId,publicKey:{kty,crv,x,y}},nonce:crypto.randomUUID(),issuedAt:Date.now()};
    const key=await crypto.subtle.importKey('jwk',identity.privateKey,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
    const signature=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,new TextEncoder().encode(JSON.stringify(body))));
    body.signature=btoa(String.fromCharCode(...signature));endpoint='/api/learning';
  }else{
    if(!token)throw Error('Gemini unavailable: enter a preview access token in diagnostics.');
    headers.Authorization=`Bearer ${token}`;
  }
  let response;try{response=await fetcher(endpoint,{method:'POST',headers,body:JSON.stringify(body),signal});}catch{throw Error('Gemini request failed. No Energy or XP changed.');}
  if(!response.ok){const body=await response.json().catch(()=>({}));const messages={GEMINI_NOT_CONFIGURED:'Gemini learning is unavailable on this deployment. No Energy or rewards changed.',PREVIEW_ACCESS_REQUIRED:'Preview access token or allowed origin is invalid.',LEARNING_ACCESS_REQUIRED:'Learning authentication or allowed origin is invalid.',REQUEST_REPLAYED:'This learning request was already submitted. Try again.',RATE_LIMITED:'Gemini request limit reached. Try later.',RATE_LIMIT_UNAVAILABLE:'Gemini abuse controls are unavailable.'};throw Error(messages[body.error]||'Gemini analysis failed. No Energy or XP changed.');}
  const result=await response.json();validateAssessment(result.assessment);return result.assessment;
}
