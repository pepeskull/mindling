import test from 'node:test';
import assert from 'node:assert/strict';
import {MindlingApp} from '../src/app/app.js';
import {learningEngine,stopLearning} from '../src/autonomous/learning-engine.js';
import {renderTaskDiagnostics,renderTaskInspector} from '../src/autonomous/task-inspector.js';
import {resumeClarification} from '../src/learning/clarification.js';
import {understandInput} from '../src/learning/input-understanding.js';
import {createSandbox,newMindling} from '../src/preview/sandbox/engine.js';
import {activityResult,isCurrentInteraction,processingMessage,renderClarificationContent,renderResponseContent,researchPresentation} from '../src/ui/player-communication.js';

class Element {
  constructor(tag){this.tag=tag;this.children=[];this.attributes={};this.dataset={};this.listeners={};this.value='';}
  get textContent(){return (this.text||'')+this.children.map(node=>node.textContent).join(' ');}
  set textContent(value){this.text=value;this.children=[];}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(){this.children=[];}
  setAttribute(key,value){this.attributes[key]=value;}
  addEventListener(name,listener){this.listeners[name]=listener;}
  focus(){this.focused=true;}
  querySelector(selector){return this.children.find(node=>selector==='button:not([disabled])'?node.tag==='button'&&!node.disabled:Object.hasOwn(node.attributes,selector.slice(1,-1)));}
}

const documentFixture=()=>Object.assign(new EventTarget(),{
  hidden:false,createElement:tag=>new Element(tag),createTextNode(text){const node=new Element('#text');node.textContent=text;return node;}
});
function panel(){
  const host=new Element('section'),status=new Element('p'),content=new Element('div');
  status.setAttribute('data-talk-status','');content.setAttribute('data-talk-content','');host.append(status,content);
  return {host,status,content};
}
function replaceGlobal(testContext,name,value){
  const original=Object.getOwnPropertyDescriptor(globalThis,name);
  Object.defineProperty(globalThis,name,{configurable:true,value});
  testContext.after(()=>{if(original)Object.defineProperty(globalThis,name,original);else delete globalThis[name];});
}

test('Talk renders one natural status and the actual answer, with attributed HTTPS links',t=>{
  replaceGlobal(t,'document',documentFixture());
  const view=panel();
  renderResponseContent(view.host,{message:processingMessage('TALK','Nova')});
  assert.equal(view.status.textContent,'Nova is thinking...');
  assert.equal(view.content.textContent,'');
  const reply={answer:'Saturn has rings.',memoryIds:['saturn'],uncertainty:'low',sources:[{url:'https://example.com/saturn',title:'Saturn'},{url:'javascript:alert(1)',title:'Unsafe link'}]};
  renderResponseContent(view.host,{message:activityResult('TALK',{accepted:true,talkResponse:reply}),sources:reply.sources});
  assert.equal(view.status.textContent,reply.answer);
  assert.equal(view.content.children[0].children.length,1);
  assert.equal(view.content.children[0].children[0].children[0].href,reply.sources[0].url);
  assert.doesNotMatch(view.host.textContent,/uncertainty|referenced|supporting knowledge/i);
  assert.equal(activityResult('TALK',{accepted:true,talkResponse:{insufficientInformation:true,memoryIds:[]}}),"I don't know that yet.");
});

test('Teach and Deep report saved changes, including mixed and no-change decisions',()=>{
  const existing={id:'existing',submissionId:'previous'},created={id:'new:1',submissionId:'new'};
  const result=learningEvent=>({accepted:true,learningEvent});
  const mixed=result({id:'new',kind:'concept',memoryIds:[created.id],operations:['CREATE_NEW','VERIFY_BEFORE_STORAGE']});
  const reinforced=result({id:'new',kind:'reinforcement',memoryIds:[existing.id],operation:'REINFORCE_EXISTING'});
  const unchanged=result({id:'new',kind:'decision',memoryIds:[],operation:'NO_MEMORY_CHANGE'});
  assert.equal(processingMessage('TEACH','Nova'),'Nova is learning...');
  assert.equal(processingMessage('DEEP_TRAINING','Nova'),'Nova is exploring...');
  assert.equal(activityResult('TEACH',mixed,[created]),'New memory learned!');
  assert.equal(activityResult('TEACH',mixed,[]),"I couldn't verify that yet.");
  assert.equal(activityResult('TEACH',reinforced,[existing]),'Memory strengthened!');
  assert.equal(activityResult('TEACH',unchanged,[existing]),'Nothing new to remember yet.');
  assert.equal(activityResult('DEEP_TRAINING',reinforced,[existing]),'Training complete!');
  assert.equal(activityResult('DEEP_TRAINING',reinforced,[]),"I couldn't learn anything new this time.");
  assert.equal(activityResult('TEACH',result({operation:'REJECT_UNSAFE_INSTRUCTION'})),"I can't remember that.");
  assert.equal(activityResult('TEACH',{accepted:false,message:'upstream schema code'}),"I couldn't learn that this time.");
});

test('clarification shows the contextual question and resumes the original paid task without another charge',async t=>{
  replaceGlobal(t,'document',documentFixture());
  replaceGlobal(t,'window',new EventTarget());
  const original='Learn about the Solar System';
  const interpretation=understandInput(original,'TEACH');
  assert.equal(interpretation.clarification,null);
  assert.equal(interpretation.requiresResearch,true);
  const app={
    state:newMindling(createSandbox(),{id:'clarification-fixture',confirmed:true}),
    async change(reducer){if(reducer)this.state=reducer(structuredClone(this.state));return this.state;},
    async refreshState(){},
    submitInput:MindlingApp.prototype.submitInput
  };
  const engine=learningEngine(app);
  t.after(()=>stopLearning(app));
  const prepared=await engine.prepare(interpretation,'original-request');
  const question={version:1,kind:'model-scope',field:'detail',question:'Shall I focus on the planets?',options:[{id:'planets',label:'The planets',value:'The planets'}],freeText:false};
  const task=await engine.patch(prepared.id,null,item=>Object.assign(item,{code:'MODEL_CLARIFICATION',energyCharged:true,coordinatorClarification:question}));
  const before=structuredClone(app.state.mind.energy);
  let resumed;
  engine.startIfAuthorized=updated=>{resumed=updated;};
  const model=engine.clarification(task).talkResponse.clarification,view=panel();
  let completion;
  renderClarificationContent(view.host,model,choice=>{completion=resumeClarification(app,model.id,choice);});
  assert.equal(view.status.textContent,question.question);
  const button=view.content.children[0].children[0];
  assert.equal(button.textContent,'The planets');
  assert.equal(button.type,'button');
  assert.equal(button.focused,true);
  button.listeners.click();
  assert.equal((await completion).accepted,true);
  assert.equal(resumed.id,task.id);
  assert.equal(resumed.requestId,'original-request');
  assert.equal(resumed.originalText,original);
  assert.equal(resumed.mode,task.mode);
  assert.equal(resumed.scope.detail,'The planets');
  assert.deepEqual(app.state.mind.energy,before);
  assert.equal(app.state.mind.learningTasks.length,1);
  await assert.rejects(resumeClarification(app,model.id,'planets'),/no longer available/);
});

const researchTask=(extra={})=>({
  id:'research',topic:'Solar System',objective:'Learn about the Solar System',mode:'FOUNDATION',engineVersion:4,status:'BLOCKED',code:'NO_EVIDENCE',
  completedWork:['understanding','source'],sourceReferences:[],knowledgeIds:[],sourceRequests:1,plan:[],message:'Internal research message.',...extra
});

test('Research success requires a saved memory and links only retained provenance',()=>{
  const sourceURL='https://example.com/saturn',quote='Saturn has rings.',research={taskId:'research',sourceURL,observedAt:100,sourceHash:'hash',quoteHash:'hash'};
  const memory={id:'saved',content:`Source observation (${new Date(100).toISOString()}) from ${sourceURL}: ${quote}`,research};
  const task=researchTask({status:'COMPLETED',knowledgeIds:[memory.id],sourceReferences:[{url:sourceURL,title:'Saturn'},{url:'https://example.com/other'}]});
  const before=structuredClone({memory,task});
  const model=researchPresentation(task,[memory]);
  assert.equal(model.message,'I learned something new!');
  assert.equal(model.learned,1);
  assert.deepEqual(model.excerpts,[quote]);
  assert.deepEqual(model.sources,[task.sourceReferences[0]]);
  assert.equal(researchPresentation(task,[]).learned,0);
  assert.doesNotMatch(researchPresentation(task,[{...memory,supersededBy:'edited'}]).message,/learned something new/);
  const supporting={id:'saved',content:quote,researchSupport:[research]};
  assert.equal(researchPresentation(task,[supporting]).message,'I found more support for something I remember.');
  assert.equal(researchPresentation(researchTask()).message,"I couldn't verify anything new yet.");
  assert.equal(researchPresentation(researchTask({status:'RESEARCHING',code:'SEARCHING'}),[],{unanswered:true}).message,"I don't know that yet. Let me look into it.");
  assert.deepEqual({memory,task},before);
});

test('technical Research details and hypotheses stay out of normal rendering without changing the record',t=>{
  replaceGlobal(t,'document',documentFixture());
  const task=researchTask({
    code:'TOOL_LIFECYCLE_INCOMPLETE',researchExecution:{outcomeUnknown:true,toolState:'OUTCOME_UNKNOWN',reserved:1,completed:0,failed:0},
    hypotheses:[{claim:'A preliminary claim'}],pendingSourceEvidence:{signature:'saved'},
    serviceDiagnostic:{detail:'TOOL_LIMIT_OUTCOME_UNKNOWN',phase:'INFORMATION',upstreamStatus:200,correlationId:'diagnostic-id'}
  });
  const before=structuredClone(task),normal=new Element('div'),maintenance=new Element('div');
  renderTaskInspector(normal,{task},{onAction:()=>assert.fail('No action was selected.')});
  assert.match(normal.textContent,/I couldn't finish learning this time/);
  assert.doesNotMatch(normal.textContent,/hypothes|preliminary claim|TOOL_|prior request|budget|try again|retry/i);
  assert.equal(researchPresentation({...task,status:'RESEARCHING'}).active,false);
  renderTaskDiagnostics(maintenance,{task});
  assert.match(maintenance.textContent,/TOOL_LIMIT_OUTCOME_UNKNOWN/);
  assert.match(maintenance.textContent,/Signed source evidence is saved/);
  assert.deepEqual(task,before);
});

test('late responses cannot replace a newer interaction, another Mindling or a dismissed panel',async()=>{
  let current={id:'first',identity:'one'},message;
  const deliver=(id,identity,value)=>Promise.resolve().then(()=>{if(isCurrentInteraction(current,id,identity))message=value;});
  const late=deliver('first','one','Old answer');
  current={id:'second',identity:'one'};
  await deliver('second','one','Current answer');
  await late;
  await deliver('second','other','Another Mindling');
  current=null;
  await deliver('second','one','Dismissed answer');
  assert.equal(message,'Current answer');
});
