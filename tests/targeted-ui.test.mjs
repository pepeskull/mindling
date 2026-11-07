import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {clusterPositions,moveCluster} from '../src/memory/cluster-drag.js';
import {planningSchema,planningTransportSchema,validatePlanningResult} from '../src/autonomous/research-contract.js';
import {learningNodes} from '../src/autonomous/research-graph.js';
const {requestJSON}=createRequire(import.meta.url)('../src/server/research-http.cjs');
test('cluster motion preserves offsets and semantic bridges without moving unrelated areas',()=>{
 const nodes=[{id:'a',kind:'area',x:30,y:30,r:10},{id:'m',kind:'memory',areaId:'a',x:60,y:70,r:3},{id:'b',kind:'area',x:150,y:40,r:10},{id:'n',kind:'memory',areaId:'b',x:180,y:60,r:3}];const layout={nodes,edges:[{from:'m',to:'n',kind:'association'}]},points=clusterPositions(layout,'a');
 moveCluster(points,20,10,{left:0,right:300,top:0,bottom:300});assert.deepEqual(nodes.map(n=>[n.x,n.y]),[[50,40],[80,80],[150,40],[180,60]]);assert.equal(nodes[1].x-nodes[0].x,30);assert.equal(layout.edges[0].to,'n');
 moveCluster(points,1000,-1000,{left:0,right:300,top:0,bottom:300});assert.equal(nodes[1].x+nodes[1].r,300);assert.equal(nodes[0].y-nodes[0].r,0);
});
test('planning wire schema excludes regex/text constraints while local validator remains strict',()=>{
 const schema=planningTransportSchema();assert(!JSON.stringify(schema).includes('pattern'));assert(!JSON.stringify(schema).includes('maxLength'));assert.equal(schema.additionalProperties,false);assert.equal(schema.properties.plan.maxItems,3);assert(planningSchema.properties.queries.items.pattern);
 assert.throws(()=>validatePlanningResult({plan:['A'],queries:['technology & devices'],sourceCategory:'web',clarification:null}),e=>e.detail==='PLAN_QUERY_CHARACTERS_INVALID');
 assert(validatePlanningResult({plan:['Compare technology domains'],queries:['different technology domains'],sourceCategory:'web',clarification:null}));
});
test('provider rejection metadata becomes a fixed safe diagnostic without raw error text',async()=>{
 const original=globalThis.fetch;try{for(const [error,detail]of [[{code:'invalid_json_schema',message:'private response and API key'},'SCHEMA_REJECTED'],[{param:'response_format.json_schema',message:'private'},'RESPONSE_FORMAT_REJECTED'],[{code:'unsupported_parameter'},'PARAMETER_UNSUPPORTED']]){
 globalThis.fetch=async()=>Response.json({error},{status:400});const trace={};await assert.rejects(requestJSON('https://api.openai.com/v1/chat/completions',{},trace),e=>e.code==='INVALID_REQUEST'&&e.detail===detail&&!e.message.includes('private'));assert.equal(trace.upstreamStatus,400);
 }}finally{globalThis.fetch=original;}
});
