import { talk } from '../preview/sandbox/engine.js';
import { trainingContext, assertTrainingContext } from '../training/retrieval.js';
import { requestTalkReasoning } from './reasoning-client.js';
import { EVENTS } from '../app/events.js';
import { understandInput, knowledgeGap } from '../learning/input-understanding.js';
import { learningEngine } from '../autonomous/learning-engine.js';
import { graphData } from '../memory/graph-data.js';

// Thin explicit Talk orchestration over existing retrieval/transport/gameplay.
// This is neither a second cognitive engine nor an evaluation/training session.
const requests = new WeakMap();
export function knowledgeTalk(app,text,id,{journal=false,interpretation=null,guard=()=>{}}={}){
  if(app.disposed) return Promise.reject(Error('Talk was closed. No Energy was spent.'));
  if(typeof id!=='string'||!id||id.length>100)return Promise.reject(Error('Invalid Talk request. No Energy was spent.'));
  let cache=requests.get(app);if(!cache){cache=new Map();requests.set(app,cache);}
  const identity=app.state.mind?.id,key=JSON.stringify([identity,id]);
  if(cache.has(key)){const prior=cache.get(key);return prior.text===text?prior.promise:Promise.reject(Error('This Talk request ID was already used for another message. No Energy was spent.'));}
  const entry={settled:false,text},signal=app.talkAbort.signal;
  entry.promise=Promise.resolve().then(async()=>{
    if(app.disposed||signal.aborted)throw Error('Talk was cancelled. No Energy was spent.');
    if(app.state.mind?.id!==identity)throw Error('Mindling identity changed. No Energy was spent.');
    interpretation??=understandInput(text,'TALK');
    guard();if(interpretation.clarification)throw Error('Resolve the pending clarification before Talk. No Energy was spent.');
    if(interpretation.intent==='QUESTION'){
      const existing=await learningEngine(app).existing(interpretation);
      if(app.disposed||signal.aborted||app.state.mind?.id!==identity||app.state.mind?.life.lifeState!=='ALIVE')throw Error('Talk was closed or the Mindling is unavailable. No Energy was spent.');
      if(existing){const resumed=await learningEngine(app).requested(existing,interpretation);learningEngine(app).follow(resumed,id);learningEngine(app).startIfAuthorized(resumed);return {...learningEngine(app).reply(resumed),energySpent:0};}
    }
    // Pure preflight: validates life, text, replay ID, repetition and spendable
    // Energy using the authoritative existing reducer, without saving this clone.
    const talkText=interpretation.requestText||text;
    talk(app.state,talkText,{id});
    const context=trainingContext(interpretation.requestText||text,app.state.mind);
    const initialGap=knowledgeGap(interpretation,context,null,Date.now(),app.state.mind);
    app.events.emit(EVENTS.NEURAL_INPUT,{id,phase:'start',activity:'TALK'});
    let reasoning;
    if(interpretation.intent==='CONVERSATION'&&interpretation.selfInquiry){
      reasoning={answer:`Hello. I’m ${app.state.mind.name}. I have ${graphData(app.state.mind).stats.current} current stored memories. Teaching and care shape my development.`,memoryIds:[],uncertainty:'low',insufficientInformation:false};
    }else if(interpretation.intent==='QUESTION'&&(initialGap.needsResearch||interpretation.clarification)){
      reasoning={answer:interpretation.clarification||'I need additional source-backed information to answer this question reliably.',memoryIds:[],uncertainty:'high',insufficientInformation:true};
    }else if(!context.candidates.length){
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
      guard();
      if(app.disposed||signal.aborted)throw Error('Talk was cancelled. No Energy was spent.');
      if(state.mind?.id!==identity)throw Error('Mindling identity changed. No Energy was spent.');
      assertTrainingContext(context,state.mind);
      return talk(state,talkText,{id});
    },journal?{journal:{id,type:'TALK'}}:{});
    let reply={answer:reasoning.answer,memoryIds:reasoning.memoryIds,uncertainty:reasoning.uncertainty,insufficientInformation:reasoning.insufficientInformation,energySpent:1};
    if(interpretation.intent==='QUESTION'&&!signal.aborted&&knowledgeGap(interpretation,context,reasoning,Date.now(),app.state.mind).needsResearch){
      try{
        const task=await learningEngine(app).prepare(interpretation,id,{reply:reasoning,guard});
        learningEngine(app).follow(task,id);
        learningEngine(app).startIfAuthorized(task);
        reply={...reply,answer:task.message===reply.answer?reply.answer:`${reply.answer}\n\n${task.message}`,researchTaskId:task.id};
      }catch{reply.answer+='\n\nResearch could not be prepared safely. The accepted Talk used 1 Energy; no research knowledge was saved.';}
    }
    return reply;
  });
  cache.set(key,entry);
  const settled=()=>{entry.settled=true;for(const [storedKey,item] of cache){if(cache.size<=32)break;if(item.settled)cache.delete(storedKey);}};
  entry.promise.then(settled,()=>{if(cache.get(key)===entry)cache.delete(key);settled();});
  return entry.promise;
}
