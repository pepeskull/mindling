import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
import {requestLearningAssessment} from '../src/preview/sandbox/learning-service.js';

const require=createRequire(import.meta.url);
const entry=require('../api/mindling/learn.js');
const server=require('../src/server/mindling-learning.cjs');
const assessment={version:2,relationship:'NEW_MEMORY',operation:'CREATE_NEW',responseAction:'ACKNOWLEDGE',kind:'claim',certainty:'asserted',concept:'neural signals',category:'Science',categoryId:'',topic:'neurons',relatedMemoryId:'',confidence:.95};

test('recognized API entry exports the existing handler and filesystem routing precedes the SPA',()=>{
  assert.equal(entry,server.handler);
  assert.equal(existsSync(new URL('../api/mindling/learn.cjs',import.meta.url)),false);
  const {routes}=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
  const filesystem=routes.findIndex(route=>route.handle==='filesystem');
  assert.ok(filesystem>=0&&filesystem<routes.findIndex(route=>route.dest==='/index.html'));
  for(const route of routes.slice(0,filesystem))assert.equal(new RegExp(`^(?:${route.src})$`).test('/api/mindling/learn'),false);
});

test('HTTP POST reaches the API export, while unsupported methods return application JSON 405',async t=>{
  const realFetch=globalThis.fetch,originalKey=process.env.SERVICE_API,originalModel=process.env.SERVICE_MODEL;
  const received=[];let upstreamCalls=0;
  globalThis.fetch=async()=>{throw Error('No upstream request is allowed in this test');};
  const http=createServer(async(req,res)=>{
    if(req.url!=='/api/mindling/learn'){res.writeHead(404).end();return;}
    received.push({method:req.method,url:req.url,contentType:req.headers['content-type']});
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    req.body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):undefined;
    res.status=code=>{res.statusCode=code;return res;};
    res.json=body=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));return res;};
    await entry(req,res);
  });
  await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${http.address().port}`;
  try{
    await t.test('POST is dispatched to validation, never the static page',async()=>{
      const response=await realFetch(`${base}/api/mindling/learn`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
      assert.equal(response.status,400);assert.match(response.headers.get('content-type'),/application\/json/);
      assert.deepEqual(await response.json(),{service:'mindling-learning-service',error:{code:'REQUEST_INVALID'}});
    });
    await t.test('missing configuration returns neutral 503 after POST routing',async()=>{
      delete process.env.SERVICE_MODEL;
      const response=await realFetch(`${base}/api/mindling/learn`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({input:'Neurons communicate through chemical signals.',candidates:[],categories:[]})});
      assert.equal(response.status,503);assert.deepEqual((await response.json()).error,{code:'SERVICE_UNAVAILABLE'});
    });
    for(const method of ['GET','HEAD','PUT','PATCH','DELETE','OPTIONS'])await t.test(`${method} is rejected by the learning handler`,async()=>{
      const response=await realFetch(`${base}/api/mindling/learn`,{method});
      assert.equal(response.status,405);assert.match(response.headers.get('content-type'),/application\/json/);
      if(method!=='HEAD')assert.deepEqual(await response.json(),{service:'mindling-learning-service',error:{code:'METHOD_NOT_ALLOWED'}});
    });
    await t.test('the real frontend POST receives a validated assessment through the exported handler',async()=>{
      process.env.SERVICE_API='synthetic-route-key';process.env.SERVICE_MODEL='synthetic-route-model';
      globalThis.fetch=async(url,options)=>{
        upstreamCalls++;
        if(url==='https://api.openai.com/v1/models/synthetic-route-model')return {ok:true,json:async()=>({id:'synthetic-route-model'})};
        assert.equal(url,'https://api.openai.com/v1/chat/completions');assert.equal(options.method,'POST');
        return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(assessment)}}]})};
      };
      const result=await requestLearningAssessment('Neurons communicate through chemical signals.',{memories:[],categories:[]},{fetcher:(url,options)=>{
        assert.equal(url,'/api/mindling/learn');assert.equal(options.method,'POST');assert.equal(options.credentials,'same-origin');
        return realFetch(`${base}${url}`,{...options,headers:{...options.headers,Origin:base}});
      }});
      assert.deepEqual(result,assessment);assert.equal(upstreamCalls,2);
      assert.deepEqual(received.at(-1),{method:'POST',url:'/api/mindling/learn',contentType:'application/json'});
      assert.doesNotMatch(JSON.stringify(result),/synthetic-route|openai|SERVICE_/i);
    });
  }finally{
    globalThis.fetch=realFetch;
    for(const [key,value] of [['SERVICE_API',originalKey],['SERVICE_MODEL',originalModel]])if(value===undefined)delete process.env[key];else process.env[key]=value;
    server._resetRateLimits();
    await new Promise(resolve=>http.close(resolve));
  }
});
