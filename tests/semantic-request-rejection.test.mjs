import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {semanticCandidates} from '../src/semantic/model-contract.js';
import {semanticTransportSchema} from '../src/semantic/model-wire.js';
import {semanticDiagnostic} from '../src/semantic/diagnostics.js';
const require=createRequire(import.meta.url),{handler}=require('../src/server/mindling-reasoning.cjs');
const memory=(id,content)=>({id,content,category:id,categoryId:id,source:'SERVICE',contentIntegrity:{version:1,status:'captured',length:content.length},analysis:{name:'mindling-learning-service',verification:'unverified-player-claim'},intelligence:{kind:'claim',current:true}});
const context=semanticCandidates({memories:[memory('a','A is a type of B.'),memory('b','B includes A.')]},['a']);
async function invoke(upstream){
 const oldFetch=globalThis.fetch,oldWarn=console.warn,key=process.env.SERVICE_API,model=process.env.SERVICE_MODEL,logs=[],requests=[];
 process.env.SERVICE_API='private-key';process.env.SERVICE_MODEL='unchanged-model';console.warn=s=>logs.push(JSON.parse(s));
 globalThis.fetch=async(url,options)=>{requests.push(url);if(url.includes('/models/'))return Response.json({id:'unchanged-model'});const body=JSON.parse(options.body);assert.equal(body.model,'unchanged-model');assert.equal(body.max_completion_tokens,2600);assert.deepEqual(body.response_format,{type:'json_schema',json_schema:{name:'mindling_semantic',strict:true,schema:semanticTransportSchema(context)}});return upstream(body);};
 const req=Object.assign(new EventEmitter(),{method:'POST',headers:{host:'localhost','x-forwarded-for':'offline-semantic'},body:{id:'b'.repeat(64),mode:'semantic',context}});
 const res=Object.assign(new EventEmitter(),{status(code){this.code=code;return this;},json(body){this.body=body;this.writableEnded=true;return this;}});
 try{await handler(req,res);return {res,logs,requests};}finally{globalThis.fetch=oldFetch;console.warn=oldWarn;for(const [k,v] of [['SERVICE_API',key],['SERVICE_MODEL',model]])if(v===undefined)delete process.env[k];else process.env[k]=v;}
}
test('actual semantic request retains model, strict format and evidence schema; successful structured output parses',async()=>{
 const {res,requests}=await invoke(()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({version:1,relationships:[],areaRelationships:[]})}}]}));
 assert.equal(res.code,200);assert.deepEqual(res.body.result.relationships,[]);assert.equal(requests.length,2);
});
test('provider response-format rejection retains allowlisted cause without retry or private text',async()=>{
 const {res,logs,requests}=await invoke(()=>Response.json({error:{code:'invalid_request_error',param:'response_format.json_schema.schema.properties.private-memory',message:'additionalProperties must be false; private-key PRIVATE-MEMORY'}},{status:400}));
 assert.equal(res.code,502);const d=res.body.error.diagnostic;assert.equal(d.detail,'RESPONSE_FORMAT_REJECTED');assert.equal(d.upstreamStatus,400);
 assert.deepEqual(d.requestRejection,{code:'invalid_request_error',parameter:'schema_nested',constraintHint:'ADDITIONAL_PROPERTIES'});
 assert.equal(requests.length,2);assert.doesNotMatch(JSON.stringify({logs,body:res.body}),/private-key|PRIVATE-MEMORY|private-memory|A is a type/);
 assert.deepEqual(semanticDiagnostic(d).requestRejection,d.requestRejection);
});
test('unknown rejection wording and malformed model output do not become valid relationships',async()=>{
 const first=await invoke(()=>Response.json({error:{code:'PRIVATE',param:'PRIVATE',message:'PRIVATE'}},{status:400}));
 assert.deepEqual(first.res.body.error.diagnostic.requestRejection,{code:'other',parameter:'other',constraintHint:'UNCLASSIFIED'});
 const second=await invoke(()=>Response.json({choices:[{finish_reason:'stop',message:{content:'{broken'}}]}));assert.equal(second.res.code,502);assert.equal(second.res.body.error.code,'INVALID_SCHEMA');
});
