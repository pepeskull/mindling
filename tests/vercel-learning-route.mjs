// Optional integration regression using pinned official Vercel tooling installed
// outside the repository. See docs/preview-learning-api-routing.md for commands.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {pipeline} from 'node:stream/promises';
import {execFileSync} from 'node:child_process';

const root=fileURLToPath(new URL('..',import.meta.url));
assert.ok(process.env.VERCEL_TOOLING_ROOT,'Set VERCEL_TOOLING_ROOT to the external tooling installation');
const tooling=createRequire(path.join(process.env.VERCEL_TOOLING_ROOT,'package.json'));
const {detectBuilders}=tooling('@vercel/fs-detectors');
const {FileFsRef}=tooling('@vercel/build-utils');
const nodeBuilder=tooling('@vercel/node');
const names=execFileSync('git',['ls-files'],{cwd:root,encoding:'utf8'}).trim().split('\n');
const options={workPath:root,projectSettings:{framework:null}};
const old=await detectBuilders(names.map(name=>name==='api/mindling/learn.js'?'api/mindling/learn.cjs':name),null,options);
assert.equal((old.builders||[]).filter(builder=>builder.use==='@vercel/node').length,0);
const detected=await detectBuilders(names,null,options);
assert.equal(detected.errors,null);
assert.deepEqual(detected.builders.filter(builder=>builder.use==='@vercel/node').map(builder=>builder.src),['api/mindling/learn.js']);
const route=detected.defaultRoutes.find(route=>route.dest==='/api/mindling/learn.js');
assert.ok(new RegExp(route.src).test('/api/mindling/learn'));
console.log('PASS official Vercel discovery: old .cjs is ignored; .js is a Node function with an extensionless API route.');
const config=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
const filesystem=config.routes.findIndex(route=>route.handle==='filesystem');
assert.ok(filesystem>=0&&filesystem<config.routes.findIndex(route=>route.dest==='/index.html'));
for(const route of config.routes.slice(0,filesystem))assert.ok(!new RegExp(`^(?:${route.src})$`).test('/api/mindling/learn'));

const files=Object.fromEntries(names.map(name=>[name,new FileFsRef({fsPath:path.join(root,name),mode:fs.statSync(path.join(root,name)).mode})]));
const workPath=fs.mkdtempSync('/tmp/mindling-vercel-function-');
const {output:fn}=await nodeBuilder.build({files,entrypoint:'api/mindling/learn.js',workPath,repoRootPath:workPath,config:{zeroConfig:true,projectSettings:{nodeVersion:'24.x'}},meta:{}});
assert.equal(fn.type,'Lambda');
for(const name of ['api/mindling/learn.js','src/server/mindling-learning.cjs','src/preview/sandbox/memory-decision.js','src/learning/text.js'])assert.ok(fn.files[name],`Missing traced dependency: ${name}`);
console.log(`PASS official Node build: ${fn.runtime} Lambda includes the handler and dynamic decision-schema dependencies.`);

const artifact=fs.mkdtempSync('/tmp/mindling-vercel-artifact-');
for(const [name,file] of Object.entries(fn.files)){
  const output=path.join(artifact,name);fs.mkdirSync(path.dirname(output),{recursive:true});
  await pipeline(file.toStream(),fs.createWriteStream(output));
}
const entry=createRequire(import.meta.url)(path.join(artifact,'api/mindling/learn.js'));
const response=()=>({status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}});
const originalFetch=globalThis.fetch,originalKey=process.env.SERVICE_API,originalModel=process.env.SERVICE_MODEL;
const assessment={version:2,relationship:'NEW_MEMORY',operation:'CREATE_NEW',responseAction:'ACKNOWLEDGE',kind:'claim',certainty:'asserted',concept:'neural signals',category:'Science',categoryId:'',topic:'neurons',relatedMemoryId:'',confidence:.95};
try{
  process.env.SERVICE_API='synthetic-build-key';process.env.SERVICE_MODEL='synthetic-build-model';
  globalThis.fetch=async(url,options)=>{
    if(url==='https://api.openai.com/v1/models/synthetic-build-model')return {ok:true,json:async()=>({id:'synthetic-build-model'})};
    assert.equal(url,'https://api.openai.com/v1/chat/completions');assert.equal(options.method,'POST');
    return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(assessment)}}]})};
  };
  const post=response();await entry({method:'POST',headers:{},body:{input:'Neurons communicate through chemical signals.',candidates:[],categories:[]}},post);
  assert.equal(post.statusCode,200);assert.deepEqual(post.body,{service:'mindling-learning-service',assessment});
  for(const method of ['GET','HEAD','PUT','DELETE','PATCH','OPTIONS']){const res=response();await entry({method,headers:{}},res);assert.equal(res.statusCode,405);assert.deepEqual(res.body.error,{code:'METHOD_NOT_ALLOWED'});}
  console.log('PASS compiled Lambda export: POST returns a validated mocked assessment; unsupported methods return application 405. No paid API calls.');
}finally{
  globalThis.fetch=originalFetch;
  for(const [key,value] of [['SERVICE_API',originalKey],['SERVICE_MODEL',originalModel]])if(value===undefined)delete process.env[key];else process.env[key]=value;
}
