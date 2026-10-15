import { EMBEDDING_MODEL, validEmbedding, memoryVector, applyMemoryEmbeddings } from '../../semantic/embeddings.js';
import { validateMemoryAssessment, validateMemoryContext, memoryContext } from '../../semantic/memory-intelligence.js';
import { validateAssessment } from './engine.js';
async function requestLearning({text,pathway,token,identity,context,operation,signal,fetcher=fetch}) {
  let body={text,pathway,context,operation},endpoint='/api/preview-learning';
  const headers={'Content-Type':'application/json'};
  if(context){validateMemoryContext(context);body.context=context;}
  if(identity){
    const {kty,crv,x,y}=identity.publicKey;
    body={text,pathway,context,operation,identity:{mindlingId:identity.mindlingId,publicKey:{kty,crv,x,y}},nonce:crypto.randomUUID(),issuedAt:Date.now()};
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
  try { return await response.json(); }
  catch { throw Error('Learning is temporarily unavailable. No Energy or rewards changed.'); }
}

// Two bounded operations: embed once to retrieve context, then assess once.
// No browser inference, automatic retries, or alternate provider fallback.
export async function prepareLearning({mind,...options}) {
  const pending=mind.memories.filter(m=>!memoryVector(m));
  if(mind.memories.some(m=>typeof m.content!=='string'||!m.content.length||m.content.length>1000))throw Error('An older memory cannot be prepared within the safe content limit. Your memories are preserved.');
  const batch=pending.slice(0,3).map(({id,content})=>({id,content}));
  const context={memories:batch,categories:[]};
  validateMemoryContext(context);
  const embedded=await requestLearning({...options,context,operation:'embed'});
  let updates;
  try {
    if(embedded.embeddingModel!==EMBEDDING_MODEL || !validEmbedding(embedded.embedding) || !Array.isArray(embedded.memories) || embedded.memories.length!==batch.length)throw Error();
    updates=batch.map((m,i)=>{
      const result=embedded.memories[i];
      if(result?.id!==m.id || !validEmbedding(result.embedding))throw Error();
      return {...m,values:result.embedding};
    });
  } catch { throw Error('Memory preparation is temporarily unavailable. No Energy or rewards changed.'); }
  if(pending.length>batch.length)return {updates,remaining:pending.length-batch.length};
  const projected=structuredClone(mind);applyMemoryEmbeddings(projected,updates);
  const learningContext=memoryContext(embedded.embedding,projected);
  const result=await requestLearning({...options,context:learningContext,operation:'assess'});
  let assessment;
  try {
    if(result.assessment?.embeddingModel!==EMBEDDING_MODEL || 'embedding' in result.assessment)throw Error();
    assessment={...result.assessment,embedding:embedded.embedding};
    validateAssessment(assessment);validateMemoryAssessment(assessment,learningContext,options.text);
  } catch { throw Error('Learning is temporarily unavailable. No Energy or rewards changed.'); }
  return {assessment,context:learningContext,updates,remaining:0};
}
