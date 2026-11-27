import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {scenario} from './support/research-success-harness.mjs';
import {teachMemory} from '../src/learning/teach-memory.js';
import {knowledgeTalk} from '../src/cognition/talk-response.js';
import {advanceGameplay} from '../src/app/gameplay-state.js';

const require=createRequire(import.meta.url);
const redis=require('../src/server/payment/store.cjs');
const fixtureRedis='https://redis.unavailable.invalid';
let requestCount=0,redisCommands=0;
const completion=body=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(body)}}]});

test('ten simulated minutes through real AI routes and local reducers produce zero Redis commands',async()=>{
  // A tripwire on the real adapter observes actual REST commands, even if a
  // future AI wrapper uses a configured Redis instance again.
  const original=redis.redisStore;
  redis.redisStore=options=>original({...options,fetcher:async()=>{
    redisCommands++;
    assert.fail('Ordinary Mindling work attempted a Redis command');
  }});
  const env=Object.fromEntries(['UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','ENCRYPTION_KEY'].map(key=>[key,process.env[key]]));
  Object.assign(process.env,{UPSTASH_REDIS_REST_URL:fixtureRedis,UPSTASH_REDIS_REST_TOKEN:'mock-only',ENCRYPTION_KEY:'ab'.repeat(32)});
  try {
    const learn=require('../api/mindling/learn.js');
    await scenario(async c=>{
      const originalFetch=globalThis.fetch;
      const expected=[];
      const first=Date.now();
      c.app.state.now=first;
      c.app.state.mind.life.lastAt=first;
      c.app.state.mind.energy.updatedAt=first;
      c.app.events={emit(){}};
      c.app.talkAbort=new AbortController();
      const change=c.app.change.bind(c.app);
      c.app.change=(reducer,options)=>change(state=>reducer(options?.preserveGameplay?state:advanceGameplay(state,Date.now())),options);
      globalThis.fetch=async(url,options)=>{
        if(String(url).startsWith(fixtureRedis)){redisCommands++;assert.fail('Ordinary work reached Redis');}
        if(url==='/api/mindling/learn'){
          expected.push('learn');
          assert.equal(new Headers(options.headers).has('X-Mindling-Signature'),false);
          const req=Object.assign(new EventEmitter(),{method:'POST',headers:{host:'localhost'},body:JSON.parse(options.body)});
          const res=Object.assign(new EventEmitter(),{status(code){this.code=code;return this;},
            json(data){this.data=data;this.writableEnded=true;return this;}});
          await learn(req,res);
          assert.equal(res.code,200,JSON.stringify(res.data));
          return Response.json(res.data,{status:res.code});
        }
        if(url==='/api/mindling/reason'){
          const mode=JSON.parse(options.body).mode;
          expected.push(mode);
          assert.equal(new Headers(options.headers).has('X-Mindling-Signature'),false);
          return originalFetch(url,options);
        }
        if(url==='https://api.openai.com/v1/chat/completions'){
          const request=JSON.parse(options.body),name=request.response_format.json_schema.name;
          const data=JSON.parse(request.messages[1].content);
          if(name==='mindling_memory_assessment'){
            const database=data.input.includes('transaction');
            const term=database?'Transaction atomicity':'Cell membranes';
            return completion({version:3,operations:[{statement:0,targetPart:-1,decision:{
              version:2,relationship:'NEW_MEMORY',operation:'CREATE_NEW',responseAction:'ACKNOWLEDGE',
              kind:'claim',certainty:'asserted',concept:term,category:database?'Databases':'Biology',
              categoryId:'',topic:term,relatedMemoryId:'',confidence:.95
            }}]});
          }
          if(name==='mindling_talk'){
            const memory=(data.memories??data.candidates)[0];
            return completion({answer:memory.content,explanation:'Recalling the stored claim.',
              facts:[{memoryId:memory.id,quote:memory.content,basis:'stored_claim'}],
              inferences:[],memoryIds:[memory.id],uncertainty:'low',insufficientInformation:false,missingInformation:[]});
          }
        }
        return originalFetch(url,options);
      };
      const check=(operation)=>assert.equal(redisCommands,0,operation);
      try {
        c.elapsed+=60000;
        await teachMemory(c.app,{id:'light-teach',text:'A database transaction uses atomicity to ensure all changes commit or roll back together.',activity:'TEACH'});
        assert.equal(c.app.state.mind.energy.remaining,8);check('Teach');
        c.elapsed+=60000;
        await teachMemory(c.app,{id:'light-deep',text:'A membrane separates the cell interior from its environment.',activity:'DEEP_TRAINING'});
        assert.equal(c.app.state.mind.energy.remaining,5);check('Deep');
        c.elapsed+=60000;
        await knowledgeTalk(c.app,'Please discuss how atomicity applies to the database transaction','local-talk');
        assert.equal(c.app.state.mind.energy.remaining,4);check('Talk');
        c.elapsed+=60000;
        await c.run();
        assert.equal(c.saved().status,'COMPLETED');
        assert(c.saved().autonomous);
        check('Autonomous Research');
        const requestCountBefore=expected.length;
        c.elapsed=10*60*1000;
        c.app.state=JSON.parse(JSON.stringify(c.app.state));
        await c.reopen().loadPermissions();
        await c.app.change(state=>state);
        c.app.renderState();
        assert(c.app.state.now-first>=10*60*1000);
        assert.equal(expected.length,requestCountBefore);
        assert(expected.includes('talk'),String(expected));
        assert(expected.includes('research-acquire'),String(expected));
        assert.equal(expected.filter(name=>name==='learn').length,2);
        check('Reload and local clock projection');
        requestCount=expected.length;
      } finally{globalThis.fetch=originalFetch;}
    });
    assert(requestCount>=5);
    assert.equal(redisCommands,0);
  }finally{
    redis.redisStore=original;
    for(const [key,value] of Object.entries(env))if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
});
