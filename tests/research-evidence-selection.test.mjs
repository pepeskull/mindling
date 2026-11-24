import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {numberedParagraphs,selectSourceEvaluation,sourceEvaluationSchemaFor,validateSourceEvaluation} from '../src/autonomous/research-contract.js';
import {scenario} from './support/research-success-harness.mjs';

const {quotes}=createRequire(import.meta.url)('./support/research-success-fixture.cjs');
const claim=(source,overrides={})=>({
  sourceId:source.id,paragraphId:'p1',first:0,last:0,support:'supported',
  category:'Gaming',topic:'Game rules',reason:'Complete relevant statement in a retained source.',validAt:null,...overrides
});
const assessment=(claims,limitations=[])=>({claims,limitations,nextQuestion:null});
const initial=sources=>assessment([claim(sources[0]),claim(sources[1],{last:99}),claim(sources[2],{support:'insufficient'})],['Original evidence limitation.']);
const searches=c=>c.calls.filter(url=>url.endsWith('/responses')).length;

test('sentence selection materializes the exact range in one paragraph and independently rejects unsafe selections',()=>{
  const passages=[quotes[0],quotes[1]+' '+quotes[2]],source={id:'source-a',passages,text:passages.join(' ')};
  const paragraphs=numberedParagraphs(source);
  assert.deepEqual(paragraphs.map(p=>[p.id,p.sentences.map(s=>s.number)]),[['p1',[0]],['p2',[0,1]]]);
  const selected=selectSourceEvaluation(assessment([
    claim(source,{paragraphId:'p2',first:0,last:1}),
    claim(source,{paragraphId:'p99'}),
    claim(source,{support:'contradicted'})
  ]),[source]);
  assert.equal(selected.evaluation.claims[0].quote,passages[1]);
  assert.deepEqual(selected.validation.rejections.map(r=>r.rule),['PARAGRAPH_ID_UNKNOWN','PASSAGE_SUPPORT_INSUFFICIENT']);
  validateSourceEvaluation(selected.evaluation,[source]);
  const fabricated=selectSourceEvaluation(assessment([
    claim(source,{last:1}),claim(source,{sourceId:'missing'}),claim(source,{quote:quotes[0]})
  ]),[source]);
  assert.deepEqual(fabricated.validation.rejections.map(r=>r.rule),['SENTENCE_RANGE_INVALID','SOURCE_ID_UNKNOWN','CLAIM_FIELDS_INVALID']);
  validateSourceEvaluation(assessment([{sourceId:source.id,quote:quotes[0],category:'Gaming',topic:'Game rules',reason:'Legacy quote.',validAt:null}]),[source]);
});

test('canonical matching is optional for legacy receipts and cannot substitute for selected source evidence',()=>{
 const existingClaim='The duration of a waggle run increases with the distance to the food source.';
 const passage='A longer waggle run indicates that the food source is farther away.';
 const source={id:'waggle-source',text:passage,passages:[passage]};
 const existingCandidates=[{id:'current',content:existingClaim,complete:true}];
 const canonicalMatch={memoryId:'current',existingClaim,sharedSubject:'waggle run',relation:'equivalent',
  confidence:'high',reason:'The complete propositions have the same meaning.',scopeDifference:null,
  polarityPreserved:true,modalityPreserved:true,scopePreserved:true,evidenceSufficient:true};
 const selected=selectSourceEvaluation(assessment([
  claim(source,{canonicalMatch}),
  claim(source,{canonicalMatch:{...canonicalMatch,memoryId:'unknown'}}),
  claim(source,{canonicalMatch,last:2})
 ]),[source],{existingCandidates});
 const enriched=sourceEvaluationSchemaFor([source],{selection:true,existingCandidates}).properties.claims.items;
 assert.ok(enriched.required.includes('canonicalMatch'));
 assert.equal(enriched.properties.canonicalMatch.anyOf[1].additionalProperties,false);
 assert.equal(selected.evaluation.claims[0].quote,passage);
 assert.deepEqual(selected.evaluation.claims[0].canonicalMatch,canonicalMatch);
 assert.equal(selected.evaluation.claims[1].canonicalMatch,undefined);
 assert.equal(selected.validation.rejections[0].rule,'SENTENCE_RANGE_INVALID');
 validateSourceEvaluation(selected.evaluation,[source]);
 assert.throws(()=>validateSourceEvaluation(assessment([{...selected.evaluation.claims[0],canonicalMatch:{...canonicalMatch,sharedSubject:'not in the passage'}}]),[source]),{detail:'CANONICAL_MATCH_INVALID'});
});

test('partial success reloads with its checkpoint and adds only new validated claims in one refinement',async()=>{
  let evaluations=0;
  await scenario(async c=>{
    const fetch=globalThis.fetch;
    globalThis.fetch=async(url,options)=>{
      if(url.endsWith('/chat/completions')){
        const request=JSON.parse(options.body),format=request.response_format.json_schema;
        if(format.name==='mindling_source_evaluation'){
          const input=JSON.parse(request.messages[1].content);
          assert(!Object.hasOwn(format.schema.properties.claims.items.properties,'quote'));
          assert.deepEqual(input.sources[0].paragraphs,[{id:'p1',sentences:[{number:0,text:quotes[0]}]}]);
          if(evaluations)assert.deepEqual(input.retainedQuotes,[quotes[0]]);
        }
      }
      return fetch(url,options);
    };
    await c.run();
    const queued=c.saved(),original=structuredClone(queued.pendingEvidence[0]);
    assert.equal(queued.evidenceRefinement.state,'QUEUED');
    assert.equal(queued.evidenceDiagnostics.accepted,1);
    assert.deepEqual(queued.evidenceDiagnostics.rejections.map(r=>r.code),['SENTENCE_RANGE_INVALID','PASSAGE_SUPPORT_INSUFFICIENT']);
    assert(queued.pendingSourceEvidence.signature);
    assert.equal(queued.modelCalls,3);
    c.app.state=JSON.parse(JSON.stringify(c.app.state));
    c.reopen();
    await c.tick();
    const saved=c.saved(),memories=c.app.state.mind.memories;
    assert.equal(saved.status,'COMPLETED');
    assert.equal(saved.evidenceRefinement.state,'COMPLETED');
    assert.equal(saved.pendingSourceEvidence,undefined);
    assert.equal(saved.modelCalls,4);
    assert.equal(saved.evaluationCalls,2);
    assert.equal(saved.sourceRequests,4);
    assert.equal(searches(c),1);
    assert.equal(memories.length,2);
    assert.equal(memories.filter(m=>m.research.evidenceText===original.quote).length,1);
    assert.equal(memories.find(m=>m.research.evidenceText===original.quote).research.observedAt,original.observedAt);
    assert.deepEqual(saved.limitations,['Original evidence limitation.','Refinement limitation.']);
    const before=structuredClone(memories);
    await c.run();
    await c.tick();
    assert.equal(evaluations,2);
    assert.equal(searches(c),1);
    assert.deepEqual(c.app.state.mind.memories,before);
  },{evaluate:sources=>++evaluations===1?initial(sources):assessment([
    claim(sources[0]),claim(sources[1]),claim(sources[2],{paragraphId:'p9'})
  ],['Refinement limitation.'])});
});

test('lost refinement response completes with the original candidate and never retries',async()=>{
  await scenario(async c=>{
    await c.run();
    const fetch=globalThis.fetch;
    let requests=0;
    globalThis.fetch=async(url,options)=>{
      if(url==='/api/mindling/reason'&&JSON.parse(options.body).context.refinement){
        requests++;
        throw new TypeError('Synthetic connection loss');
      }
      return fetch(url,options);
    };
    await c.tick();
    const saved=c.saved();
    assert.equal(saved.status,'COMPLETED');
    assert.equal(saved.evidenceRefinement.state,'INTERRUPTED');
    assert.equal(saved.researchExecution.outcomeUnknown,false);
    assert.equal(saved.researchExecution.completed,1);
    assert.equal(saved.modelCalls,4);
    assert.equal(saved.pendingSourceEvidence,undefined);
    assert.deepEqual(c.app.state.mind.memories.map(m=>m.research.evidenceText),[quotes[0]]);
    c.reopen();
    await c.tick();
    assert.equal(requests,1);
    assert.equal(searches(c),1);
  },{evaluate:initial});
});

test('partial success integrates originals when no refinement budget or valid checkpoint remains',async()=>{
  for(const [reason,change] of [
    ['BUDGET_EXHAUSTED',task=>{task.modelCalls=4;}],
    ['CHECKPOINT_EXPIRED',task=>{task.pendingSourceEvidence.expiresAt=Date.now()-1;}]
  ])await scenario(async c=>{
    await c.run();
    change(c.saved());
    const requests=c.calls.length;
    await c.tick();
    assert.equal(c.saved().status,'COMPLETED');
    assert.equal(c.saved().evidenceRefinement.reason,reason);
    assert.equal(c.saved().pendingSourceEvidence,undefined);
    assert.equal(c.calls.length,requests);
    assert.deepEqual(c.app.state.mind.memories.map(m=>m.research.evidenceText),[quotes[0]]);
  },{evaluate:initial});
});

test('a reloaded in-flight refinement integrates the first assessment after the dispatch lease expires',async()=>{
  await scenario(async c=>{
    await c.run();
    const task=c.saved(),id='a'.repeat(64);
    task.evidenceRefinement={...task.evidenceRefinement,id,state:'DISPATCHED',startedAt:Date.now()};
    Object.assign(task.researchExecution,{correlationId:id,operation:'research-evaluate'});
    Object.assign(task,{status:'EVALUATING',code:'REFINING_EVIDENCE',modelCalls:4,evaluationCalls:2});
    c.app.state=JSON.parse(JSON.stringify(c.app.state));
    c.reopen();
    const requests=c.calls.length;
    await c.tick();
    assert.equal(c.saved().evidenceRefinement.state,'DISPATCHED');
    assert.equal(c.calls.length,requests);
    c.elapsed+=120001;
    await c.tick();
    assert.equal(c.saved().status,'COMPLETED');
    assert.equal(c.saved().evidenceRefinement.state,'INTERRUPTED');
    assert.equal(c.calls.length,requests);
    assert.deepEqual(c.app.state.mind.memories.map(m=>m.research.evidenceText),[quotes[0]]);
  },{evaluate:initial});
});
