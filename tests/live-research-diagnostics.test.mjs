import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {supportsClaimDate,explicitDates} from '../src/autonomous/evidence-dates.js';
import {evidenceRejection,rejectionExplanation} from '../src/autonomous/research-evidence.js';
import {autonomousStatus,autonomousDiagnostics,nextOpportunity,blocksOpportunity} from '../src/autonomous/autonomous-schedule.js';
import {validateSourceEvaluation,validateAcquisition} from '../src/autonomous/research-contract.js';
const {search}=createRequire(import.meta.url)('../src/server/research-information.cjs');
const now=Date.parse('2026-10-30T12:00:00Z'),date='2026-10-30';
const quote='Synthetic Club A leads the standings in Spain’s top men’s football league.';
const cited=`As of October 30, 2026, ${quote}`;
const source={id:'web:'+ 'a'.repeat(64),text:cited,passages:[cited],observedAt:now};
const claim={sourceId:source.id,quote,validAt:date,category:'Sports',topic:'Football',reason:'Synthetic single-source fixture, not real standings.'};
const task={timeSensitive:true,scope:{},autonomous:false};
const evaluation={claims:[claim],limitations:['Only one cited source; no independent comparison demonstrated.'],nextQuestion:null};
const mind={id:'mind',memories:[],pathways:['Developer','Social','Researcher'],learningTasks:[]};
const engine=tasks=>({preferences:{enabled:true},app:{state:{mind:{...mind,learningTasks:tasks}}}});
const paused=(overrides={})=>({id:'auto',engineVersion:4,autonomous:true,status:'BLOCKED',code:'MODEL_CLARIFICATION',topic:'Technology',message:'Which topic interests you?',updatedAt:1,attempts:1,modelCalls:1,...overrides});
test('manual LaLiga 5/7 NO_EVIDENCE is an evidence outcome, not an autonomous engine ERROR',()=>{
  const manual=paused({id:'manual',autonomous:false,code:'NO_EVIDENCE',updatedAt:2});
  assert.equal(autonomousStatus(engine([manual])),'IDLE');
  const combined=engine([paused(),manual]);assert.equal(autonomousStatus(combined),'PAUSED');assert.equal(autonomousDiagnostics(combined).taskId,'auto');
  assert.equal(autonomousStatus(engine([paused({code:'NO_EVIDENCE'})])),'PAUSED');
  assert.equal(autonomousStatus(engine([paused({code:'PLANNING_UNAVAILABLE'})])),'ERROR');
});
test('paused optional autonomous focus or insufficient evidence cannot deadlock later bounded opportunities',()=>{
  for(const code of ['MODEL_CLARIFICATION','NO_EVIDENCE','BUDGET_EXHAUSTED']){
    const item=paused({code}),state={...mind,learningTasks:[item],autonomousLearning:{day:'2026-10-30',started:1,nextAt:now-1}};
    assert.equal(blocksOpportunity(item),false);assert.equal(nextOpportunity(state,now),'Social');
    assert.equal(item.code,code,'saved historical outcome changed');
    assert.equal(nextOpportunity({...state,autonomousLearning:{day:'2026-10-30',started:3,nextAt:0}},now),null);
    assert.equal(nextOpportunity({...state,autonomousLearning:{day:'2026-10-30',started:1,nextAt:now+1}},now),null);
  }
  assert.equal(blocksOpportunity(paused({status:'RESEARCHING',code:'SEARCHING'})),true);
  assert.equal(blocksOpportunity(paused({code:'RATE_LIMITED'})),true);
  assert.equal(blocksOpportunity(paused({code:'INFORMATION_UNCONFIGURED'})),true);
});
test('autonomous state transitions report active shared work, then recover the background outcome',()=>{
  const e=engine([paused()]);
  for(const [status,expected] of [['QUEUED','PLANNING'],['RESEARCHING','RESEARCHING'],['EVALUATING','ANALYZING'],['COMMITTING','LEARNING']]){
    e.app.state.mind.learningTasks.push(paused({id:'active',autonomous:false,status}));e.active={id:'active'};assert.equal(autonomousStatus(e),expected);e.app.state.mind.learningTasks.pop();
  }
  e.active=null;assert.equal(autonomousStatus(e),'PAUSED');e.preferences.enabled=false;assert.equal(autonomousStatus(e),'PAUSED');
});
test('single-source current fact can pass with an explicit same-passage as-of date outside the claim quote',()=>{
  assert.equal(supportsClaimDate(source,quote,date),true);assert.doesNotThrow(()=>validateSourceEvaluation(evaluation,[source]));assert.equal(evidenceRejection(claim,source,task,now),null);
  const iso={...source,text:`Updated on ${date}. ${quote}`,passages:[`Updated on ${date}. ${quote}`]};assert.equal(supportsClaimDate(iso,quote,date),true);
});
test('missing/stale dates, seasons, publication dates, retrieval dates and neighbouring passages cannot manufacture freshness',()=>{
  assert.equal(evidenceRejection({...claim,validAt:null},source,task,now),'MISSING_AS_OF_DATE');
  for(const text of [`LaLiga 2026/27: ${quote}`,`Published on ${date}. ${quote}`,`Retrieved ${date}. ${quote}`]){
    const other={...source,text,passages:[text]};assert.equal(evidenceRejection(claim,other,task,now),'UNSUPPORTED_AS_OF_DATE');assert.throws(()=>validateSourceEvaluation(evaluation,[other]));
  }
  const unrelated={...source,text:`As of ${date}, an unrelated update. ${quote}`,passages:[`As of ${date}, an unrelated update.`,quote]};assert.equal(supportsClaimDate(unrelated,quote,date),false);
  const staleDate='2026-10-01',stale={...source,text:`As of ${staleDate}, ${quote}`,passages:[`As of ${staleDate}, ${quote}`]};assert.equal(evidenceRejection({...claim,validAt:staleDate},stale,task,now),'STALE_AS_OF_DATE');
  assert.equal(explicitDates('2026-02-30; 2026/27').size,0);assert.match(rejectionExplanation('MISSING_AS_OF_DATE'),/season or retrieval date is insufficient/);
});
test('hosted source retention keeps later dated passages and a second source in one call; forwards the saved plan',async()=>{
  const previous=globalThis.fetch,flag=process.env.MINDLING_WEB_SEARCH;process.env.MINDLING_WEB_SEARCH='enabled';
  const url='https://www.laliga.com/en-GB/laliga-easports/standing',second='https://www.bbc.com/sport/football/spanish-la-liga/table';
  const paragraphs=['The official Spanish league standings provide a current season table for its participating clubs.',cited,'A second synthetic report independently describes the same selected league and standings criterion.'];
  let text='',annotations=[];for(const [i,p]of paragraphs.entries()){if(text)text+='\n\n';text+=p+' ';const start=text.length;text+='[source]';annotations.push({type:'url_citation',url:i===2?second:url,title:'Synthetic regression citation',start_index:start,end_index:text.length});}
  globalThis.fetch=async(target,options)=>{
    assert.equal(target,'https://api.openai.com/v1/responses');const body=JSON.parse(options.body),input=JSON.parse(body.input);assert.deepEqual(input.plan,['Find current standings','Compare a second reliable source']);assert.equal(body.max_tool_calls,2);
    return Response.json({id:'resp_synthetic_regression',status:'completed',output:[{type:'web_search_call',status:'completed',action:{type:'search',sources:[{type:'url',url},{type:'url',url:second}]}},{type:'message',status:'completed',content:[{type:'output_text',text,annotations}]}]});
  };
  try{
    const result=await search({request:{topic:'Spain top men league standings',mode:'TALK_RESEARCH',freshness:true,scope:{criterion:'standings',geography:[],geographyMode:null,period:null,quantity:null}},queries:['LaLiga standings'],remainingCalls:2,plan:['Find current standings','Compare a second reliable source']},'synthetic-key','opaque-model',new AbortController().signal);
    assert.equal(result.requests,1,'reservation ceiling must not be reported as completed/billed calls');assert.equal(result.sources.length,2);assert.equal(result.sources[0].passages.length,2);assert.equal(result.diagnostics.retainedPassages,3);assert.equal(result.diagnostics.citationsSeen,3);
    const retained=result.sources[0];assert.equal(retained.hash,createHash('sha256').update(retained.text).digest('hex'));
    assert.equal(supportsClaimDate(retained,quote,date),true);assert.doesNotThrow(()=>validateAcquisition(result));
  }finally{globalThis.fetch=previous;if(flag===undefined)delete process.env.MINDLING_WEB_SEARCH;else process.env.MINDLING_WEB_SEARCH=flag;}
});
