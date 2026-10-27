import { talk } from '../preview/sandbox/engine.js';
import { trainingContext, assertTrainingContext } from '../training/retrieval.js';
import { requestTalkReasoning } from './reasoning-client.js';
import { EVENTS } from '../app/events.js';

// Thin explicit Talk orchestration over existing retrieval/transport/gameplay.
// This is neither a second cognitive engine nor an evaluation/training session.
const requests = new WeakMap();
export function knowledgeTalk(app,text,id,{journal=false}={}){
  if(app.disposed) return Promise.reject(Error('Talk was closed. No Energy was spent.'));
  if(typeof id!=='string'||!id||id.length>100)return Promise.reject(Error('Invalid Talk request. No Energy was spent.'));
  let cache=requests.get(app);if(!cache){cache=new Map();requests.set(app,cache);}
  const identity=app.state.mind?.id,key=JSON.stringify([identity,id]);
  if(cache.has(key)){const prior=cache.get(key);return prior.text===text?prior.promise:Promise.reject(Error('This Talk request ID was already used for another message. No Energy was spent.'));}
  const entry={settled:false,text},signal=app.talkAbort.signal;
  entry.promise=Promise.resolve().then(async()=>{
    if(app.disposed||signal.aborted)throw Error('Talk was cancelled. No Energy was spent.');
    if(app.state.mind?.id!==identity)throw Error('Mindling identity changed. No Energy was spent.');
    // Pure preflight: validates life, text, replay ID, repetition and spendable
    // Energy using the authoritative existing reducer, without saving this clone.
    talk(app.state,text,{id});
    const context=trainingContext(text,app.state.mind);
    app.events.emit(EVENTS.NEURAL_INPUT,{id,phase:'start',activity:'TALK'});
    let reasoning;
    if(!context.candidates.length){
      // An honest empty-knowledge state, not a simulated provider answer.
      reasoning={answer:'I do not have any current stored knowledge to answer that yet. Teach me the relevant information first.',memoryIds:[],uncertainty:'high',insufficientInformation:true};
    }else{
      const bytes=new TextEncoder().encode(JSON.stringify({mode:'talk',identity,id,context}));
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      const requestId=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
      reasoning=(await requestTalkReasoning({id:requestId,context,signal})).reasoning;
    }
    if(app.disposed||signal.aborted)throw Error('Talk was cancelled. No Energy was spent.');
    // Commit only after a validated reply (or genuine empty-knowledge state).
    // Fresh transactional validation prevents stale answers, double spending,
    // identity changes and failed writes from partially accepting a Talk.
    await app.change(state=>{
      if(app.disposed||signal.aborted)throw Error('Talk was cancelled. No Energy was spent.');
      if(state.mind?.id!==identity)throw Error('Mindling identity changed. No Energy was spent.');
      assertTrainingContext(context,state.mind);
      return talk(state,text,{id});
    },journal?{journal:{id,type:'TALK'}}:{});
    return {answer:reasoning.answer,memoryIds:reasoning.memoryIds,uncertainty:reasoning.uncertainty,insufficientInformation:reasoning.insufficientInformation};
  });
  cache.set(key,entry);
  const settled=()=>{entry.settled=true;for(const [storedKey,item] of cache){if(cache.size<=32)break;if(item.settled)cache.delete(storedKey);}};
  entry.promise.then(settled,settled);
  return entry.promise;
}
