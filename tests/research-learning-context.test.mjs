import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {researchLearningContext,validateResearchLearningContext} from '../src/learning/research-learning-context.js';
import {learningContext} from '../src/preview/sandbox/learning-assessment.js';
import {researchRelation} from '../src/autonomous/memory-evolution.js';
import {semanticCandidates,validateSemanticResult,persistSemantic,VERSION} from '../src/semantic/model-contract.js';
import {assignCategory} from '../src/semantic/memory-intelligence.js';
import {validateRetrievalContext,validateResearchEvaluationContext,selectSourceEvaluation} from '../src/autonomous/research-contract.js';
import {createSandbox,newMindling} from '../src/preview/sandbox/engine.js';
import {AutonomousLearningEngine} from '../src/autonomous/learning-engine.js';
globalThis.crypto??=webcrypto;
const sha=v=>createHash('sha256').update(v).digest('hex');
const {records:[taught,researched]}=JSON.parse(readFileSync(new URL('./support/neuroscience-integration.json',import.meta.url)));
assert.equal(taught.content.length,taught.contentIntegrity.length);assert.equal(researched.content.length,researched.contentIntegrity.length);assert.equal(sha(researched.research.evidenceText),researched.research.quoteHash);
const mind={memories:[taught],categories:[{id:taught.categoryId,name:taught.category}]},before=JSON.stringify(mind);
const learning=researchLearningContext('Neuroscience',mind);
assert.equal(learning.candidates.length,1);assert.equal(learning.candidates[0].content,taught.content);assert.equal(learning.candidates[0].complete,true);assert.equal(JSON.stringify(mind),before);
assert.equal(learningContext('Learn about Neuroscience',mind).candidates.length,0,'reproduce missing lexical topic match');
assert.equal(researchRelation(mind,{quote:researched.research.evidenceText,validAt:null}).kind,'new','local engine has no model equivalence decision');
assert.equal(researchRelation(mind,{quote:taught.content,validAt:null}).kind,'support');
 assert.equal(researchRelation(mind,{quote:'Neurons are not specialized cells that transmit information through electrical and chemical signals.',validAt:null}).kind,'conflict');
assert.equal(researchLearningContext('Neuroscience',{memories:[{...taught,supersededBy:'next'}]}).candidates.length,0);
assert.throws(()=>validateResearchLearningContext({...learning,secret:'bad'}));assert.throws(()=>validateResearchLearningContext({...learning,candidates:Array(9).fill(learning.candidates[0])}));
const request={topic:'Neuroscience',mode:'FOUNDATION',autonomous:true,freshness:false,scope:{criterion:null,geography:[],geographyMode:null,period:null,quantity:null}};
const input={request,queries:['neuron anatomy'],remainingCalls:2,plan:['Explain the basic parts of a neuron and their roles in signaling.'],learning};
validateRetrievalContext(input);validateRetrievalContext({...input,learning:undefined});
const {handler}=createRequire(import.meta.url)('../src/server/mindling-reasoning.cjs');
const prior={fetch:globalThis.fetch,warn:console.warn,key:process.env.SERVICE_API,model:process.env.SERVICE_MODEL,search:process.env.MINDLING_WEB_SEARCH};
process.env.SERVICE_API='offline-private-key';process.env.SERVICE_MODEL='offline-model';process.env.MINDLING_WEB_SEARCH='enabled';console.warn=()=>{};
let serial=0;
async function api(context,{mode='research-acquire',finish='stop',forgedQuote=false}={}){
 let searches=0,inferences=0;
 globalThis.fetch=async(url,options)=>{
  if(url.includes('/models/'))return Response.json({id:'offline-model'});
  const body=JSON.parse(options.body);
  if(url.endsWith('/responses')){
   searches++;assert(!options.body.includes(taught.id));assert(!options.body.includes(taught.content));assert.equal(body.max_tool_calls,2);
   const quote=researched.research.evidenceText,text=quote+' [1]',sourceURL=researched.research.sourceURL;
   return Response.json({id:'resp_offline_neuron',status:'completed',output:[{type:'web_search_call',id:'offline_search',status:'completed',action:{type:'search',sources:[{type:'url',url:sourceURL}]}},{type:'message',status:'completed',content:[{type:'output_text',text,annotations:[{type:'url_citation',url:sourceURL,title:researched.research.title,start_index:quote.length+1,end_index:text.length}]}]}]});
  }
  inferences++;assert.equal(body.max_completion_tokens,2600);const data=JSON.parse(body.messages[1].content);
  assert.deepEqual(data.existingKnowledge,learning);assert.match(body.messages[0].content,/Different provenance does not imply/);
  const claim={sourceId:data.sources[0].id,quote:forgedQuote?taught.content:data.sources[0].text,category:data.existingKnowledge.categories[0].name,topic:'Dendrites, soma, and axon',reason:'Mock classification: substantial anatomical overlap, with additional nucleus detail; not whole-claim equivalence.',validAt:null};
  return Response.json({choices:[{finish_reason:finish,message:{content:JSON.stringify({claims:[claim],limitations:['Tool-cited synthesis is not independently verified.'],nextQuestion:null})}}]});
 };
 const req=Object.assign(new EventEmitter(),{method:'POST',headers:{host:'localhost','x-forwarded-for':'neuron-'+(++serial)},body:{id:sha(String(serial)),mode,context}});
 const res=Object.assign(new EventEmitter(),{setHeader(){},status(n){this.code=n;return this;},json(b){this.body=b;this.writableEnded=true;return this;}});
 await handler(req,res);return {res,searches,inferences};
}
try{
 const {res,searches,inferences}=await api(input);assert.equal(res.code,200);assert.equal(searches,1);assert.equal(inferences,1);
 const deep=await api({...input,request:{...request,mode:'DEEP',autonomous:false}});assert.equal(deep.res.code,200);assert.equal(deep.inferences,1);assert.equal(deep.res.body.acquisition.evaluation.claims[0].category,'Neuroscience');
 const claim=res.body.acquisition.evaluation.claims[0];
 const privateFollowup=selectSourceEvaluation({...res.body.acquisition.evaluation,nextQuestion:'Private remembered subject'},res.body.acquisition.sources,{allowFollowup:false});assert.equal(privateFollowup.evaluation.nextQuestion,null);assert.equal(privateFollowup.validation.metadataRejections[0].rule,'FOLLOWUP_INVALID');assert.equal(claim.category,'Neuroscience');assert.equal(claim.quote,researched.research.evidenceText);
 // Real shared category persistence reuses identity without merging records.
 const categorized={memories:structuredClone([taught]),categories:structuredClone(mind.categories)},newMemory=structuredClone(researched);
 assignCategory(categorized,newMemory,claim);assert.equal(newMemory.categoryId,taught.categoryId);assert.equal(newMemory.content,researched.content);assert.deepEqual(newMemory.research,researched.research);assert.equal(categorized.categories.length,1);
 assignCategory(categorized,newMemory,claim);assert.equal(categorized.categories.length,1);
 const failed=await api(input,{finish:'length'});assert.equal(failed.res.code,502);assert.equal(failed.res.body.error.diagnostic.detail,'COMPLETION_INCOMPLETE');assert(failed.res.body.sourceCheckpoint);
 const retryContext={checkpoint:failed.res.body.sourceCheckpoint,learning};validateResearchEvaluationContext(retryContext);
 const resumed=await api(retryContext,{mode:'research-evaluate'});assert.equal(resumed.res.code,200);assert.equal(resumed.searches,0);assert.equal(resumed.inferences,1);
 const forged=await api(input,{forgedQuote:true});assert.equal(forged.res.body.acquisition.evaluation.claims.length,0,'existing private memory cannot substitute for retrieved source evidence');
 // Actual canonical integration receives the model-selected area, with no extra
 // model call, no merging of the overlapping records and no autonomous XP.
 const app={state:newMindling(createSandbox(),{confirmed:true,id:'neuron-integration'}),async change(fn){this.state=fn(structuredClone(this.state));},renderState(){}};
 app.state.mind.memories=[structuredClone(taught)];app.state.mind.categories=structuredClone(mind.categories);
 const at=Date.now(),id=sha('neuron-task'),source=res.body.acquisition.sources[0];
 const pending={quote:claim.quote,quoteHash:sha(claim.quote),sourceURL:source.url,sourceHash:source.hash,observedAt:at,validAt:null,category:claim.category,topic:claim.topic};
 const task={id,version:1,engineVersion:4,mindlingId:app.state.mind.id,requestId:id,run:'run',mode:'FOUNDATION',topic:'Neuroscience',objective:'Learn about Neuroscience',autonomous:true,energyCharged:true,status:'EVALUATING',code:'EVALUATING',message:'Checking evidence.',createdAt:at,updatedAt:at,attempts:1,sourceRequests:2,completedWork:['understanding','plan','source','evidence','retrieval'],referenceIds:[taught.id],knowledgeIds:[],plan:input.plan,timeSensitive:false,limitations:res.body.acquisition.evaluation.limitations,pendingEvidence:[pending],sourceReferences:[{url:source.url,hash:source.hash,authorizedAt:at,observedAt:at,type:'web-search-synthesis'}]};
 app.state.mind.learningTasks=[task];const energy=structuredClone(app.state.mind.energy),xp=app.state.mind.lifetimeXP;
 const engine={app,loadPermissions:async()=>({enabled:true}),grant:()=>null,assertLive(){},notify(){},recover(){},async patch(id,run,fn){await app.change(s=>{fn(s.mind.learningTasks[0]);return s;});return app.state.mind.learningTasks[0];}};
 await AutonomousLearningEngine.prototype.integrate.call(engine,task,'run',new AbortController(),{enabled:true});
 assert.equal(app.state.mind.memories.length,2);assert.equal(app.state.mind.memories[1].categoryId,taught.categoryId);assert.equal(app.state.mind.memories[1].research.evidenceText,claim.quote);assert.equal(app.state.mind.lifetimeXP,xp);assert.deepEqual(app.state.mind.energy,energy);assert.deepEqual(app.state.mind.memories[0],taught);
 // Existing separate semantic contract can represent the overlap without
 // equivalence; mocked reasoning is not evidence of live model performance.
 const semanticMind={memories:structuredClone([taught,researched])},context=semanticCandidates(semanticMind,[researched.id]),pair=context.pairs[0];assert(pair);
 const proposal={memoryA:pair.a.id,memoryB:pair.b.id,type:'complements',direction:'symmetric',evidenceA:{start:0,end:pair.a.text.length,quote:pair.a.text},evidenceB:{start:0,end:pair.b.text.length,quote:pair.b.text},assessment:{support:'supported',reason:'Mock: overlapping anatomical roles with different additional information.',qualifications:['Neither passage independently verifies the other.'],polarityPreserved:true,modalityPreserved:true,scopePreserved:true,noEquivalence:true,evidenceSufficient:true}};
 const accepted=validateSemanticResult({version:VERSION,relationships:[proposal]},context).accepted;
 assert.equal(persistSemantic(semanticMind,accepted)[0].code,'RELATIONSHIP_PERSISTED');assert.equal(persistSemantic(semanticMind,accepted)[0].code,'DUPLICATE_RELATION');assert.equal(semanticMind.memories.length,2);
 const contradiction=structuredClone(proposal);contradiction.assessment.polarityPreserved=false;assert.equal(validateSemanticResult({version:VERSION,relationships:[contradiction]},context).rejections[0].code,'SEMANTIC_CONTRADICTION');
 assert.equal(JSON.stringify(mind),before);
 console.log('Actual neuron records: shared bounded context, broad-category reuse, strict source isolation, separate overlapping identities, canonical integration with 0 XP/Energy, incomplete-response checkpoint recovery without repeated search, and idempotent cross-category linking passed. Model responses mocked.');
}finally{globalThis.fetch=prior.fetch;console.warn=prior.warn;for(const [key,value]of [['SERVICE_API',prior.key],['SERVICE_MODEL',prior.model],['MINDLING_WEB_SEARCH',prior.search]])if(value===undefined)delete process.env[key];else process.env[key]=value;}
