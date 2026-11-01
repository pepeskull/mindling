import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {AutonomousLearningEngine} from '../../src/autonomous/learning-engine.js';
import {createSandbox,newMindling} from '../../src/preview/sandbox/engine.js';
import {defaultPermissions,assertResearchGrant} from '../../src/autonomous/research-permissions.js';
import {understandInput} from '../../src/learning/input-understanding.js';
const require=createRequire(import.meta.url),{handler}=require('../../src/server/mindling-reasoning.cjs'),fixture=require('./research-success-fixture.cjs');
let sequence=0;
export async function scenario(callback,{Engine=AutonomousLearningEngine,kind='success',fault=null,afterBody=null,mutate=null}={}){
 const originals={fetch:globalThis.fetch,warn:console.warn,now:Date.now,timer:globalThis.setTimeout,document:Object.getOwnPropertyDescriptor(globalThis,'document'),window:Object.getOwnPropertyDescriptor(globalThis,'window'),navigator:Object.getOwnPropertyDescriptor(globalThis,'navigator'),key:process.env.SERVICE_API,model:process.env.SERVICE_MODEL,web:process.env.MINDLING_WEB_SEARCH};
 const control={kind,fault,afterBody,mutate,calls:[],logs:[],server:null,elapsed:0};Date.now=()=>originals.now()+control.elapsed;
 for(const [name,value] of [['window',new EventTarget()],['document',Object.assign(new EventTarget(),{hidden:false})],['navigator',{onLine:true}]])Object.defineProperty(globalThis,name,{configurable:true,value});
 process.env.SERVICE_API='synthetic-received-secret';process.env.SERVICE_MODEL='opaque-model';process.env.MINDLING_WEB_SEARCH='enabled';
 console.warn=value=>control.logs.push(JSON.parse(value));
 let prefs=defaultPermissions('received-node');
 const store={async researchPermissions(){return prefs;},async saveResearchPermissions(id,{enabled}){prefs={...prefs,enabled,decided:true,revision:prefs.revision+1,updatedAt:Date.now()};return prefs;}};
 const app={store,state:newMindling(createSandbox(),{id:'received-node',confirmed:true,pathways:['Gaming','Developer','Social']}),renderState(){},async change(reducer,options={}){
  assertResearchGrant(options.researchGrant,[prefs]);const next=reducer(structuredClone(this.state));
  const before=this.state.mind.learningTasks?.[0],task=next.mind.learningTasks?.[0];
  if(control.fault==='all'&&control.server?.code===502)throw Error('Private unavailable database details');
  if(control.fault==='receipt'&&task?.pendingSourceEvaluation&&!before?.pendingSourceEvaluation){control.fault=null;throw new DOMException('Private storage details','QuotaExceededError');}
  if(control.fault==='evidence'&&task?.pendingEvidence?.length&&before?.pendingSourceEvaluation){control.fault=null;throw Error('Private evidence transaction details');}
  if(control.fault==='integration'&&task?.status==='COMPLETED'){control.fault=null;throw Error('Private integration transaction details');}
  this.state=next;
 }};
 let engine=new Engine(app);control.app=app;control.engine=engine;
 if(kind==='timeout')globalThis.setTimeout=(callback,ms,...args)=>originals.timer(callback,ms===55000&&app.state.mind.learningTasks?.[0]?.status==='RESEARCHING'?1:ms,...args);
 globalThis.fetch=async(url,options)=>{
  control.calls.push(url);
  if(url==='/api/mindling/reason'){
   const body=JSON.parse(options.body),req=Object.assign(new EventEmitter(),{method:'POST',headers:{host:'localhost','x-forwarded-for':`received-${++sequence}`},body});
   const res=Object.assign(new EventEmitter(),{status(code){this.code=code;return this;},json(value){if(kind==='serialization'&&this.code===200&&body.mode==='research-acquire')throw Error('Private serialization failure');this.body=value;this.writableEnded=true;return this;}});
   await handler(req,res);control.server=res;
   res.body=JSON.parse(JSON.stringify(res.body));
   if(body.mode==='research-acquire'){
    if(control.kind==='timeout'){
      if(options.signal.aborted)throw new DOMException('deadline','AbortError');
      return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('deadline','AbortError')),{once:true}));
    }
    if(control.kind==='missing')throw new DOMException('Private missing response','AbortError');
    if(control.kind==='network')throw TypeError('Private network details');
    if(control.kind==='body-abort')return {status:200,ok:true,async text(){throw new DOMException('Private body interruption','AbortError');}};
    if(control.kind==='parse')return new Response('{broken',{status:200});
    if(control.mutate)control.mutate(res.body,body,control);
   }
   const response=Response.json(res.body,{status:res.code});
   return {ok:response.ok,status:response.status,async text(){const text=await response.text();if(body.mode==='research-acquire')control.afterBody?.(control);return text;}};
  }
  if(url.endsWith('/models/opaque-model'))return Response.json({id:'opaque-model'});
  if(url.endsWith('/responses')){control.elapsed+=23087;return Response.json(fixture.searchPayload());}
  if(url!=='https://api.openai.com/v1/chat/completions')throw Error('External target forbidden');
  const request=JSON.parse(options.body),data=JSON.parse(request.messages[1].content);
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(request.response_format.json_schema.name==='mindling_planning'?{plan:['Find supported Gaming rules'],clarification:null,queries:['Gaming game rules'],sourceCategory:'web'}:fixture.evaluation(data.sources))}}]});
 };
 try{
  await engine.loadPermissions();await engine.setAccess(true);
  const task=await engine.prepare(understandInput('Learn about Gaming','TEACH'),'received-request',{autonomous:true});
  control.task=task;control.run=()=>engine.run(app.state.mind.learningTasks.find(t=>t.id===task.id),'Gaming');
  control.saved=()=>app.state.mind.learningTasks.find(t=>t.id===task.id);
  control.reopen=()=>{engine.destroy();engine=new Engine(app);control.engine=engine;return engine;};
  return await callback(control);
 }finally{
  engine.destroy();globalThis.fetch=originals.fetch;console.warn=originals.warn;Date.now=originals.now;globalThis.setTimeout=originals.timer;
  for(const name of ['document','window','navigator'])if(originals[name])Object.defineProperty(globalThis,name,originals[name]);else delete globalThis[name];
  for(const [name,value] of [['SERVICE_API',originals.key],['SERVICE_MODEL',originals.model],['MINDLING_WEB_SEARCH',originals.web]])if(value===undefined)delete process.env[name];else process.env[name]=value;
 }
}
