import { talk } from '../preview/sandbox/engine.js';
import { trainingContext, assertTrainingContext } from '../training/retrieval.js';
import { requestTalkReasoning } from './reasoning-client.js';
import { EVENTS } from '../app/events.js';
import { understandInput, knowledgeGap } from '../learning/input-understanding.js';
import { learningEngine } from '../autonomous/learning-engine.js';
import { DAILY_RESEARCH_PAUSE, hasAcquiredResearch, researchXPCapped } from '../autonomous/research-xp.js';
import { conversationCopy, conversationLanguage, detectedLanguage } from './conversation-language.js';

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
    const talkText=interpretation.requestText||text;
    const context=trainingContext(talkText,app.state.mind);
    const language=conversationLanguage(text),copy=conversationCopy(text);
    if(interpretation.intent==='QUESTION'&&!context.candidates.length){
      const engine=learningEngine(app),existing=await engine.existing(interpretation);
      if(app.disposed||signal.aborted||app.state.mind?.id!==identity||app.state.mind?.life.lifeState!=='ALIVE')throw Error('Talk was closed or the Mindling is unavailable. No Energy was spent.');
      if(existing){
        if(researchXPCapped(app)&&!hasAcquiredResearch(existing))return {answer:copy.unknown,insufficientInformation:true,memoryIds:[],energySpent:0,researchDeferred:DAILY_RESEARCH_PAUSE,researchMessage:copy.pause};
        const resumed=await engine.requested(existing,interpretation);
        engine.follow(resumed,id);engine.startIfAuthorized(resumed);
        return {...engine.reply(resumed),energySpent:0};
      }
    }
    // Pure preflight: validates life, text, replay ID, repetition and spendable
    // Energy using the authoritative existing reducer, without saving this clone.
    talk(app.state,talkText,{id});
    app.events.emit(EVENTS.NEURAL_INPUT,{id,phase:'start',activity:'TALK'});
    let reasoning;
    if(interpretation.intent==='CONVERSATION'&&interpretation.selfInquiry){
      reasoning={answer:`Hi, I’m ${app.state.mind.name}. I’m learning as we spend time together.`,memoryIds:[],uncertainty:'low',insufficientInformation:false};
    }else if(!context.candidates.length){
      // An honest empty-knowledge state, not a simulated provider answer.
      reasoning={answer:copy.unknown,memoryIds:[],uncertainty:'high',insufficientInformation:true};
    }else{
      const bytes=new TextEncoder().encode(JSON.stringify({mode:'talk',identity,id,context}));
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      const requestId=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
      reasoning=(await requestTalkReasoning({id:requestId,context:{...context,agentName:app.state.mind.name},signal})).reasoning;
    }
    if(app.disposed||signal.aborted)throw Error('Talk was cancelled. No Energy was spent.');
    const coverage=interpretation.intent==='QUESTION'?knowledgeGap(interpretation,context,reasoning,Date.now(),app.state.mind):null;
    const gap=coverage?.needsResearch===true;
    // Preserve the evidence's language. When the prose clearly uses another
    // language, provide the exact validated quotes with a localized summary.
    const prose=reasoning.answer.replace(/(?:“[^”]*”|"[^"]*")/gu,'');
    const actual=detectedLanguage(prose);
    if(coverage?.freshnessGap||(coverage?.conflicted&&!reasoning.insufficientInformation)||(language&&actual&&actual!==language)){
      const facts=reasoning.facts?.map(fact=>fact.quote)||[];
      const introduction=coverage?.freshnessGap?copy.stale:coverage?.conflicted?copy.conflict:copy.recalled;
      reasoning={...reasoning,answer:facts.length?`${introduction}\n\n${facts.join('\n\n')}`:copy.unknown};
    }
    // Commit only after a validated reply (or genuine empty-knowledge state).
    // Fresh transactional validation prevents stale answers, double spending,
    // identity changes and failed writes from partially accepting a Talk.
    await app.change(state=>{
      guard();
      if(app.disposed||signal.aborted)throw Error('Talk was cancelled. No Energy was spent.');
      if(state.mind?.id!==identity)throw Error('Mindling identity changed. No Energy was spent.');
      assertTrainingContext(context,state.mind);
      return talk(state,talkText,{id,rewardEligible:reasoning.insufficientInformation===false&&!gap,usedMemoryIds:reasoning.memoryIds});
    },journal?{journal:{id,type:'TALK'}}:{});
    let reply={answer:reasoning.answer,memoryIds:reasoning.memoryIds,uncertainty:gap?'high':reasoning.uncertainty,insufficientInformation:gap||reasoning.insufficientInformation,energySpent:1};
    if(gap&&!signal.aborted){
      try{
        if(researchXPCapped(app))return {...reply,researchDeferred:DAILY_RESEARCH_PAUSE,researchMessage:copy.pause};
        const task=await learningEngine(app).prepare(interpretation,id,{reply:reasoning,guard});
        learningEngine(app).follow(task,id);
        learningEngine(app).startIfAuthorized(task);
        reply={...reply,researchTaskId:task.id,...(reply.memoryIds.length?{conversationalAnswer:reply.answer}:{})};
      }catch(error){
        if(error.code===DAILY_RESEARCH_PAUSE)return {...reply,researchDeferred:DAILY_RESEARCH_PAUSE,researchMessage:copy.pause};
        reply.researchPreparationFailed=true;
      }
    }
    return reply;
  });
  cache.set(key,entry);
  const settled=()=>{entry.settled=true;for(const [storedKey,item] of cache){if(cache.size<=32)break;if(item.settled)cache.delete(storedKey);}};
  entry.promise.then(settled,()=>{if(cache.get(key)===entry)cache.delete(key);settled();});
  return entry.promise;
}
