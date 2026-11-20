import test from 'node:test';
import assert from 'node:assert/strict';
import { scenario } from './support/research-success-harness.mjs';
import { canRetryResearch } from '../src/autonomous/service-diagnostics.js';

const hypotheses=[
  {id:'h1',claim:'Introductory science sources commonly describe a scientific hypothesis as a testable proposed explanation.',status:'unverified',relationship:null},
  {id:'h2',claim:'Scientific theories are generally presented as explanatory frameworks supported by multiple lines of evidence.',status:'unverified',relationship:null}
];
const passages=[
  'A scientific hypothesis is a testable proposed explanation.',
  'A scientific theory is a broad explanation supported by a substantial body of knowledge and evidence.'
];
const url='https://www.nationalacademies.org/read/13165/chapter/7';
const review=hypotheses.map(({id})=>({id,status:'insufficient',claimIndex:null,reason:'The passage does not establish the complete hypothesis.'}));
const empty=()=>({claims:[],limitations:[],nextQuestion:null,hypothesisReview:review});
const searches=c=>c.calls.filter(url=>url.endsWith('/responses')).length;

function scienceReport(){
  let text='';
  const annotations=passages.map((passage,i)=>{
    if(i)text+='\n\n';
    text+=passage+' ';
    const start_index=text.length;
    text+='['+i+']';
    return {type:'url_citation',url,title:'Synthetic science report',start_index,end_index:text.length};
  });
  return {id:'resp_science_fixture',status:'completed',output:[
    {id:'science-query',type:'web_search_call',status:'completed',action:{type:'search',sources:[{type:'url',url}]}},
    {id:'science-open',type:'web_search_call',status:'completed',action:{type:'open_page',url}},
    {type:'message',status:'completed',content:[{type:'output_text',text,annotations}]}
  ]};
}

const settings={topic:'Science',hypotheses,acquisitionPayload:scienceReport};
const narrower=(source,quote=passages[0])=>({
  sourceId:source.id,quote,category:'Science',topic:'Scientific hypotheses',reason:'Direct definition in a cited passage.',validAt:null
});

for(const autonomous of [true,false]){
  test(`Science refinement retains a narrower quote with insufficient original hypotheses (${autonomous?'autonomous':'manual'})`,async()=>{
    let evaluations=0;
    await scenario(async c=>{
      await c.run();
      const queued=c.saved();
      assert.equal(queued.evidenceRefinement.state,'QUEUED');
      assert.equal(queued.code,'NO_MODEL_CANDIDATES');
      assert.equal(queued.serviceDiagnostic.validation.candidates,0);
      assert.equal(c.app.state.mind.memories.length,0);
      await assert.rejects(c.engine.act('retry',queued.id),/managed automatically/);
      c.app.state=JSON.parse(JSON.stringify(c.app.state));
      if(!autonomous)delete c.app.state.mind.learningTasks[0].evidenceRefinement;
      c.reopen();
      await c.tick();
      const completed=c.saved();
      assert.equal(completed.status,'COMPLETED');
      assert.equal(completed.evidenceRefinement.state,'COMPLETED');
      assert.match(completed.evidenceRefinement.id,/^[a-f0-9]{64}$/);
      assert.equal(completed.serviceDiagnostic.refinement,true);
      assert.equal(completed.sourceRequests,2);
      assert.equal(completed.modelCalls,4);
      assert.equal(completed.evaluationCalls,2);
      assert.equal(searches(c),1);
      assert.equal(evaluations,2);
      assert.deepEqual(completed.hypothesisReview,review);
      const [memory]=c.app.state.mind.memories;
      assert.equal(c.app.state.mind.memories.length,1);
      assert.match(memory.content,/A scientific hypothesis is a testable proposed explanation\./);
      assert.equal(memory.research.verification,'tool-cited-unverified-synthesis');
      assert.equal(memory.research.sourceURL,url);
      assert.equal(memory.research.observedAt,queued.sourceReferences[0].observedAt);
      await c.run();
      assert.equal(searches(c),1);
      assert.equal(evaluations,2);
    },{...settings,autonomous,evaluate:sources=>++evaluations===1?empty():{...empty(),claims:[narrower(sources[0])]}});
  });
}

test('a refined claim outside the retained source is rejected and the attempt is exhausted',async()=>{
  let evaluations=0;
  await scenario(async c=>{
    await c.run();
    await c.tick();
    const task=c.saved();
    assert.equal(task.status,'BLOCKED');
    assert.equal(task.evidenceRefinement.state,'EXHAUSTED');
    assert.equal(task.evidenceDiagnostics.candidates,1);
    assert.equal(task.evidenceDiagnostics.accepted,0);
    assert.equal(task.evidenceDiagnostics.rejections.length,1);
    assert.equal(c.app.state.mind.memories.length,0);
    assert.equal(canRetryResearch(task),false);
    await c.tick();
    assert.equal(evaluations,2);
    assert.equal(searches(c),1);
  },{...settings,evaluate:sources=>++evaluations===1?empty():{...empty(),claims:[narrower(sources[0],'All scientific hypotheses are mathematically proven before experiments.')] }});
});

for(const [reason,change] of [
  ['BUDGET_EXHAUSTED', task=>{task.modelCalls=4;}],
  ['CHECKPOINT_EXPIRED', task=>{task.pendingSourceEvidence.expiresAt=Date.now()-1;}]
]){
  test(`automatic refinement records ${reason} without dispatch`,async()=>{
    await scenario(async c=>{
      await c.run();
      change(c.saved());
      const calls=c.calls.length;
      await c.tick();
      assert.equal(c.saved().evidenceRefinement.state,'SKIPPED');
      assert.equal(c.saved().evidenceRefinement.reason,reason);
      assert.equal(c.calls.length,calls);
      assert.equal(canRetryResearch(c.saved()),false);
    },{...settings,evaluate:empty});
  });
}

test('Energy and revocation keep the assessment queued until authorized and ready',async()=>{
  await scenario(async c=>{
    await c.run();
    const count=c.calls.length;
    Object.assign(c.app.state.mind.energy,{remaining:0,bonus:0,updatedAt:Date.now()});
    await c.tick();
    assert.equal(c.saved().evidenceRefinement.state,'QUEUED');
    c.app.state.mind.energy.remaining=3;
    await c.app.store.saveResearchPermissions(c.app.state.mind.id,{enabled:false});
    await c.tick();
    assert.equal(c.calls.length,count);
    await c.app.store.saveResearchPermissions(c.app.state.mind.id,{enabled:true});
    await c.tick();
    assert.equal(c.saved().evidenceRefinement.state,'EXHAUSTED');
    assert.equal(searches(c),1);
  },{...settings,evaluate:empty});
});

test('a lost refinement response preserves its reservation and is not resent after reload',async()=>{
  await scenario(async c=>{
    await c.run();
    const fetch=globalThis.fetch;
    let dispatches=0;
    globalThis.fetch=async(url,options)=>{
      if(url==='/api/mindling/reason'&&JSON.parse(options.body).context.refinement){
        dispatches++;
        const saved=c.saved();
        assert.equal(saved.evidenceRefinement.state,'DISPATCHED');
        assert.equal(saved.modelCalls,4);
        assert.equal(saved.evaluationCalls,2);
        throw new TypeError('Synthetic connection failure');
      }
      return fetch(url,options);
    };
    await c.tick();
    const saved=JSON.parse(JSON.stringify(c.saved()));
    assert.equal(saved.evidenceRefinement.state,'INTERRUPTED');
    assert.equal(saved.researchExecution.toolState,'COMPLETED');
    assert.equal(saved.researchExecution.outcomeUnknown,false);
    assert.equal(canRetryResearch(saved),false);
    c.app.state=JSON.parse(JSON.stringify(c.app.state));
    c.reopen();
    await c.tick();
    assert.equal(dispatches,1);
    assert.equal(searches(c),1);
    assert.equal(c.app.state.mind.memories.length,0);
  },{...settings,evaluate:empty});
});

test('failed canonical write resumes locally from saved refined evidence without more inference',async()=>{
  let evaluations=0;
  await scenario(async c=>{
    await c.run();
    await c.tick();
    assert.equal(c.saved().code,'INTEGRATION_FAILED');
    assert.equal(c.saved().evidenceRefinement.state,'COMPLETED');
    assert.equal(c.saved().pendingEvidence.length,1);
    assert.equal(c.app.state.mind.memories.length,0);
    const before=c.calls.length;
    c.app.state=JSON.parse(JSON.stringify(c.app.state));
    c.reopen();
    c.elapsed+=60001;
    await c.tick();
    assert.equal(c.saved().status,'COMPLETED');
    assert.equal(c.app.state.mind.memories.length,1);
    assert.equal(c.calls.length,before);
    assert.equal(evaluations,2);
  },{...settings,fault:'integration',evaluate:sources=>++evaluations===1?empty():{...empty(),claims:[narrower(sources[0])]}});
});
