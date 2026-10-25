import test from 'node:test';
import assert from 'node:assert/strict';
import {graphData,filterGraph,layoutGraph,memorySignature,memoryNodeId} from '../src/memory/graph-data.js';
const memory=(id,extra={})=>({id,content:`Stored claim ${id}`,category:'Science',topic:'Neurons',...extra});
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const item of Object.values(value))freeze(item);}return value;};

test('empty and missing optional data produce no invented knowledge or radar axes',()=>{
  for(const state of [{},null,{memories:[]},{memories:null}]){const g=graphData(state);assert.equal(g.stats.canonical,0);assert.equal(g.nodes.length,0);assert.equal(g.edges.length,0);assert.deepEqual(g.coverage,[]);assert.equal(layoutGraph({...filterGraph(g),memories:[]}).nodes.length,0);}
});
test('three embedded atomic statements are ONE canonical memory, not three fabricated nodes',()=>{
  const g=graphData({memories:[memory('compound',{content:'Name Alex. Prefers Python. Enjoys finance.',parts:[{text:'Name Alex.'},{text:'Prefers Python.'},{text:'Enjoys finance.'}]})]});
  assert.equal(g.stats.canonical,1);assert.equal(g.memories.length,1);assert.equal(g.memories[0].recordId,'compound');assert.equal(g.coverage[0].count,1);
});
test('stored atomic child records remain canonical and preserve their actual parent identity',()=>{
  const g=graphData({memories:[memory('parent',{componentMemoryIds:['name','preference'],supersededBy:'name',supersededByIds:['name','preference']}),memory('name',{parentMemoryId:'parent'}),memory('preference',{parentMemoryId:'parent',intelligence:{current:true,kind:'preference'},valueHistory:[{content:'Old preference'}]})]});
  assert.equal(g.stats.canonical,3);assert.equal(g.stats.current,2);assert.equal(g.stats.associations,2);assert.equal(g.edges.filter(e=>e.kind==='part-of').length,2);assert.equal(g.memories.find(m=>m.recordId==='parent').historical,true);assert.equal(g.memories.find(m=>m.recordId==='preference').raw.valueHistory[0].content,'Old preference');
});
test('category IDs, existing labels and topics determine hierarchy without text reclassification',()=>{
  const g=graphData({categories:[{id:'x',name:'Stored category'}],memories:[memory('a',{categoryId:'x',category:'Old label'}),memory('b',{category:'Languages',topic:'Vocabulary'}),memory('c',{category:'Science',topic:'Cells'})]});
  assert.equal(g.stats.areas,3);assert.ok(g.areas.some(a=>a.label==='Stored category'));assert.equal(g.edges.filter(e=>e.kind==='hierarchy').length,6);assert.equal(g.stats.associations,0);
});
test('only real references create associations; self, dangling and duplicate references are safe',()=>{
  const g=graphData({memories:[memory('a',{relatedMemoryIds:['b','b','missing','a']}),memory('b',{relatedMemoryIds:['a']})]});
  assert.equal(g.stats.associations,1);assert.equal(g.edges.filter(e=>e.kind==='association').length,1);assert.ok(g.stats.dangling>0);assert.equal(graphData({memories:[memory('a'),memory('b')]}).stats.associations,0);
});
test('descriptive links and explicit history/parts/provenance remain distinct, with unique-pair counts',()=>{
  const g=graphData({memories:[memory('a',{relatedMemoryIds:['b'],coSubmittedMemoryIds:['b'],componentMemoryIds:['b'],supersededBy:'b'}),memory('b')]});
  assert.equal(g.stats.associations,1);assert.deepEqual(new Set(g.edges.filter(e=>e.kind!=='hierarchy').map(e=>e.kind)),new Set(['association','co-submitted','part-of','history']));
});
test('filter/search never fabricates new relationships and includes the matching hierarchy',()=>{
  const g=graphData({memories:[memory('a',{content:'A language memory',category:'Language',topic:'Vocabulary',relatedMemoryIds:['b']}),memory('b',{content:'An unrelated subject',category:'Science'})]});
  const area=g.areas.find(a=>a.label==='Language').id,f=filterGraph(g,{area,query:'vocabulary'});
  assert.equal(f.memories.length,1);assert.ok(f.nodes.some(n=>n.kind==='area'));assert.ok(f.nodes.some(n=>n.kind==='topic'));assert.equal(f.edges.some(e=>e.kind==='association'),false);assert.equal(filterGraph(g,{query:'not present'}).nodes.length,0);
});
test('coverage measures current-memory shares, never strength, activations, or inferred skills',()=>{
  const g=graphData({memories:[memory('a',{category:'A',strength:1,activations:999}),memory('b',{category:'A'}),memory('c',{category:'B'}),memory('old',{category:'C',intelligence:{current:false}})]});
  assert.equal(g.stats.canonical,4);assert.equal(g.stats.current,3);assert.equal(g.coverage.find(a=>a.label==='A').share,2/3);assert.equal(g.coverage.some(a=>a.label==='C'),false);assert.equal(g.coverage.reduce((n,a)=>n+a.share,0),1);
});
test('more than six real areas use five plus an explicitly counted Other area',()=>{
  const g=graphData({memories:Array.from({length:8},(_,i)=>memory(String(i),{category:`Area ${i}`}))});
  assert.equal(g.coverage.length,6);assert.equal(g.coverage.at(-1).label,'Other areas');assert.equal(g.coverage.at(-1).count,3);assert.equal(g.coverage.reduce((n,a)=>n+a.count,0),8);
});
test('identical/reordered inputs have a deterministic layout, with one node per memory ID',()=>{
  const memories=Array.from({length:65},(_,i)=>memory(`m-${i}`,{category:`Area ${i%4}`,topic:`Topic ${i%7}`}));
  const coordinates=items=>layoutGraph(filterGraph(graphData({memories:items}))).nodes.map(({id,x,y})=>({id,x,y}));
  assert.deepEqual(coordinates(memories),coordinates([...memories].reverse()));assert.equal(new Set(coordinates(memories).map(n=>n.id)).size,coordinates(memories).length);assert.ok(coordinates(memories).every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)));
});
test('visualization of frozen saved history and associations never mutates the source',()=>{
  const state=freeze({memories:[memory('a',{relatedMemoryIds:['b'],valueHistory:[{content:'Previous value'}],parts:['First','Second']}),memory('b')]});
  const before=JSON.stringify(state);const g=graphData(state);filterGraph(g,{query:'Stored'});layoutGraph(filterGraph(g));memorySignature(state);assert.equal(JSON.stringify(state),before);assert.equal(g.memories[0].raw,state.memories[0]);
});
test('optional corruption and duplicate identities are reported safely; cycles in unused metadata do not break signatures',()=>{
  const odd={};odd.cycle=odd;
  const state={memories:[null,{},memory('a',{relatedMemoryIds:'wrong',category:odd,topic:42,parts:[odd]}),memory('a',{content:'Duplicate record'})]};
  assert.doesNotThrow(()=>memorySignature(state));const g=graphData(state);assert.equal(g.stats.canonical,1);assert.equal(g.stats.ignoredRecords,3);assert.doesNotThrow(()=>layoutGraph(filterGraph(g)));
});
test('life/Energy-only updates do not invalidate the graph; memory updates do',()=>{
  const state={memories:[memory('a')],energy:{remaining:10}};const signature=memorySignature(state);assert.equal(memorySignature({...state,energy:{remaining:1},life:{health:50}}),signature);assert.notEqual(memorySignature({memories:[memory('a',{strength:.9})]}),signature);assert.notEqual(memorySignature({memories:[memory('a',{neuronIds:['new-neuron']})]}),signature);
});
test('five thousand stored memories use finite deterministic positions without quadratic layout searches',()=>{
  const state={memories:Array.from({length:5000},(_,i)=>memory(`large-${i}`,{category:`Area ${i%10}`,topic:`Topic ${i%23}`,relatedMemoryIds:i?[`large-${i-1}`]:[]}))};
  const start=performance.now(),g=graphData(state),layout=layoutGraph(filterGraph(g));assert.equal(g.stats.canonical,5000);assert.equal(g.stats.associations,4999);assert.equal(layout.nodes.filter(n=>n.kind==='memory').length,5000);assert.ok(layout.nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)));assert.ok(performance.now()-start<5000,'Layout unexpectedly blocked for over five seconds');assert.ok(g.memories.some(n=>n.id===memoryNodeId('large-4999')));
});
test('saved identity strings are preserved exactly rather than trimmed or merged',()=>{
  const g=graphData({memories:[memory(' a ',{relatedMemoryIds:['b']}),memory('a'),memory('b')]});assert.equal(g.stats.canonical,3);assert.equal(g.stats.associations,1);assert.ok(g.memories.some(n=>n.recordId===' a '&&n.id===memoryNodeId(' a ')));
});
