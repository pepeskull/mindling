import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createSandbox, newMindling, learn, talk } from '../src/preview/sandbox/engine.js';
import { creditEnergy, energyAt, ENERGY_INTERVAL } from '../src/economy/energy.js';
import { learningContext, validateServiceAssessment } from '../src/preview/sandbox/learning-assessment.js';

const require = createRequire(import.meta.url);
const server = require('../src/server/mindling-learning.cjs');
const start = () => newMindling(createSandbox(), { confirmed:true, id:'service-test' });
const input = index => `Subject${index} relates property${index} with process${index} in context${index}.`;
const assessment = index => ({ meaningful:true, relationship:'new', concept:`subject${index} property${index}`, category:`Notes ${index}`, categoryId:'', topic:`subject${index} process${index}`, relatedMemoryId:'', confidence:.9, evidence:'none' });

// Server inference is mocked; the configured identifier is deliberately synthetic.
process.env.SERVICE_MODEL='configured-test-model';
const serverAssessment = index => ({version:2,relationship:'NEW_MEMORY',operation:'CREATE_NEW',responseAction:'ACKNOWLEDGE',kind:'claim',certainty:'asserted',concept:`subject${index} property${index}`,category:`Notes ${index}`,categoryId:'',topic:`subject${index} process${index}`,relatedMemoryId:'',confidence:.9});
const withModelLookup = callback => async (url, options) => String(url).includes('/models/') ? {ok:true,json:async()=>({id:process.env.SERVICE_MODEL})} : callback(url,options);

test('ten Stage Preview messages need no elapsed time when Energy is sufficient', () => {
  let state=start();state.mind.energy=creditEnergy(state.mind.energy,10,state.now);const at=state.now;
  for(let index=0;index<10;index++)state=learn(state,{id:`service-${index}`,text:input(index),assessment:assessment(index)});
  assert.equal(state.now,at);assert.equal(state.mind.energy.remaining,0);assert.equal(state.mind.memories.length,10);assert.equal(state.mind.lifetimeXP,500);
});

test('Energy alone blocks input, replay IDs cannot double-charge, and regeneration is unchanged', () => {
  let state=start();state.mind.energy={...state.mind.energy,remaining:2};state=learn(state,{id:'once',text:input(1),assessment:assessment(1)});
  const spent=structuredClone(state);assert.throws(()=>learn(state,{id:'once',text:input(2),assessment:assessment(2)}),/processed/);assert.deepEqual(state,spent);
  assert.throws(()=>learn(state,{id:'twice',text:input(2),assessment:assessment(2)}),/Energy/);assert.deepEqual(state,spent);
  assert.equal(energyAt(state.mind.energy,state.now+ENERGY_INTERVAL).remaining,1);
  let talkState=start();for(let index=0;index<10;index++)talkState=talk(talkState,`I am sharing meaningful thought number ${index} without waiting.`,{id:`talk-${index}`});
  assert.equal(talkState.mind.energy.remaining,0);assert.throws(()=>talk(talkState,'This next meaningful thought has no Energy available.',{id:'talk-11'}),/Energy/);
});

test('unknown IDs and malformed decisions are rejected before state mutation', () => {
  const state=start(),context=learningContext(input(1),state.mind),before=structuredClone(state);
  assert.throws(()=>validateServiceAssessment({...serverAssessment(1),relationship:'RELATED_MEMORY',operation:'LINK_TO_EXISTING',relatedMemoryId:'invented'},context),/unknown memory/);
  assert.throws(()=>learn(state,{id:'bad',text:input(1),assessment:{...assessment(1),categoryId:'invented'}}),/unknown category/);
  assert.deepEqual(state,before);
});

test('only bounded relevant memory candidates and category labels leave the browser', () => {
  const state=start();state.mind.memories=[
    {id:'related',content:'Whales communicate through complex underwater sound patterns.',categoryId:'marine',category:'Marine notes',topic:'whale communication'},
    {id:'private-unrelated',content:'My unrelated private journal entry contains different terms.',categoryId:'journal',category:'Journal',topic:'private entry'}
  ];
  state.mind.categories=[{id:'marine',name:'Marine notes'},{id:'journal',name:'Journal'}];
  const context=learningContext('Whales use underwater sound patterns to communicate.',state.mind);
  assert.deepEqual(context.candidates.map(item=>item.id),['related']);assert.equal(context.candidates[0].content,state.mind.memories[0].content);assert.equal(context.candidates.length<=8,true);assert.equal(context.categories.length,2);
  assert.throws(()=>validateServiceAssessment({...assessment(1),categoryId:'marine',category:'Changed label'},context),/changed an existing category label/);
});

const response = () => ({ statusCode:0, body:null, status(code){this.statusCode=code;return this;}, json(body){this.body=body;return this;} });
const request = body => ({ method:'POST', headers:{host:'playmindling.com',origin:'https://playmindling.com','x-forwarded-for':crypto.randomUUID()}, body });

test('server validates structured analysis and never returns the credential or raw provider data', async () => {
  const originalFetch=globalThis.fetch,originalKey=process.env.SERVICE_API;let upstream;
  process.env.SERVICE_API='server-secret-test-value';server._resetRateLimits();
  globalThis.fetch=withModelLookup(async (url,options)=>{upstream={url,options};return {ok:true,async json(){return {choices:[{message:{content:JSON.stringify(serverAssessment(1))}}],providerDebug:'private'};}};});
  try {
    const res=response();await server.handler(request({input:input(1),candidates:[],categories:[]}),res);
    assert.equal(res.statusCode,200);assert.equal(res.body.service,'mindling-learning-service');assert.deepEqual(res.body.assessment,serverAssessment(1));
    assert.doesNotMatch(JSON.stringify(res.body),/server-secret|providerDebug|openai/i);
    const sent=JSON.parse(upstream.options.body);assert.equal(sent.messages[1].content,JSON.stringify({input:input(1),candidates:[],categories:[],statements:[input(1)]}));assert.equal(upstream.options.headers.Authorization,'Bearer server-secret-test-value');assert.equal(sent.response_format.type,'json_schema');
  } finally {globalThis.fetch=originalFetch;if(originalKey===undefined)delete process.env.SERVICE_API;else process.env.SERVICE_API=originalKey;}
});

test('server rejects invented references and upstream failures with stable public errors', async () => {
  const originalFetch=globalThis.fetch,originalKey=process.env.SERVICE_API;process.env.SERVICE_API='secret';
  const context={input:input(1),candidates:[{id:'known',content:'A prior claim with useful context.',categoryId:'category-known',category:'Known',topic:'Prior'}],categories:[{id:'category-known',name:'Known'}]};
  try {
    server._resetRateLimits();globalThis.fetch=withModelLookup(async()=>({ok:true,async json(){return {choices:[{message:{content:JSON.stringify({...serverAssessment(1),relationship:'RELATED_MEMORY',operation:'LINK_TO_EXISTING',relatedMemoryId:'invented'})}}]};}}));
    let res=response();await server.handler(request(context),res);assert.equal(res.statusCode,502);assert.deepEqual(res.body.error,{code:'ANALYSIS_INVALID'});assert.doesNotMatch(JSON.stringify(res.body),/invented|secret/);
    server._resetRateLimits();globalThis.fetch=withModelLookup(async()=>({ok:false,status:503,async json(){return {raw:'provider failure'};}}));
    res=response();await server.handler(request(context),res);assert.equal(res.statusCode,502);assert.deepEqual(res.body.error,{code:'ANALYSIS_UNAVAILABLE'});assert.doesNotMatch(JSON.stringify(res.body),/provider failure|503/);
  } finally {globalThis.fetch=originalFetch;if(originalKey===undefined)delete process.env.SERVICE_API;else process.env.SERVICE_API=originalKey;}
});

test('missing configuration and cross-origin requests fail before inference', async () => {
  const originalKey=process.env.SERVICE_API;delete process.env.SERVICE_API;server._resetRateLimits();
  try {
    let res=response();await server.handler(request({input:input(1),candidates:[],categories:[]}),res);assert.equal(res.statusCode,503);assert.deepEqual(res.body.error,{code:'SERVICE_UNAVAILABLE'});
    const cross=request({input:input(1),candidates:[],categories:[]});cross.headers.origin='https://attacker.example';res=response();await server.handler(cross,res);assert.equal(res.statusCode,403);assert.deepEqual(res.body.error,{code:'ORIGIN_INVALID'});
  } finally {if(originalKey!==undefined)process.env.SERVICE_API=originalKey;}
});
