import test from 'node:test';
import assert from 'node:assert/strict';
import {BrainStateModel} from '../src/network/brain-state-model.js';
import {MemoryPlayback,INTERVAL,DURATION} from '../src/network/memory-playback.js';
import {ActivityModel} from '../src/network/activity-model.js';
import {graphData} from '../src/memory/graph-data.js';
import {areaColor} from '../src/memory/area-colors.js';
import {readFileSync} from 'node:fs';
const fixture=(count=43)=>({id:'offline-fixture',memories:Array.from({length:count},(_,i)=>({id:`memory-${String(i).padStart(3,'0')}`,content:`Synthetic retained fixture ${i}.`,categoryId:`area-${i%6}`,category:`Area ${i%6}`,source:i%5===3?'AUTONOMOUS':'SERVICE',analysis:i%5<3?{activity:['TALK','TEACH','DEEP_TRAINING'][i%5]}:undefined,relatedMemoryIds:i<4?[`memory-${String(i+1).padStart(3,'0')}`]:[]}))});
function make(state=fixture()){const b=new BrainStateModel();b.update(state);return b;}
test('all 43 canonical memories once per stable cycle, repeated indefinitely with four/five overlaps',()=>{
 const p=make().playback,cycles=new Map();let max=0;
 for(let t=0;t<INTERVAL*43*4;t+=100){for(const e of p.advance(t?100:0)){if(!cycles.has(e.cycle))cycles.set(e.cycle,[]);cycles.get(e.cycle).push(e.id);}max=Math.max(max,p.active().length);if(t>DURATION)assert(p.active().length>=4&&p.active().length<=5);}
 assert.equal(max,5);for(const ids of cycles.values()){assert.equal(ids.length,43);assert.equal(new Set(ids).size,43);assert.deepEqual(ids,[...ids].sort());}assert.equal(cycles.size,4);assert(p.journal.length<=40);
});
test('mixed origins, unknown and autonomous are retained without false activity inference; all areas/edges participate',()=>{
 const b=make(),p=b.playback,g=graphData(fixture());p.advance(INTERVAL*43-1);
 assert.deepEqual(new Set(p.pending.map(m=>m.channel)),new Set([0,1,2,-1]));assert(p.pending.filter(m=>m.origin==='AUTONOMOUS').every(m=>m.channel===-1));
 assert.equal(new Set(p.pending.map(m=>m.areaId)).size,6);for(const m of p.pending){const hex=areaColor(m.areaId);assert.deepEqual(m.color,[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255));}
 assert.equal(new Set(p.journal.map(e=>e.edge.id)).size,4);assert.equal(p.links.length,g.stats.associations);
 const h=new Float32Array(320),c=new Float32Array(960);p.paint(p.time,h,c);assert(Math.max(...h)>0);assert(c.some(v=>v>0));
});
test('safe cycle boundary adds new records, updates colors/edges, removes invalid data without restarting',()=>{
 const state=fixture(),b=make(state),p=b.playback;p.advance(1800);const cursor=p.cursor,time=p.time;
 const added=fixture(44).memories.at(-1);state.memories.push(added);b.update(state);assert.equal(p.cursor,cursor);assert.equal(p.time,time);
 const first=p.advance(INTERVAL*40);assert(!first.some(e=>e.id.includes('043')));const second=p.advance(INTERVAL*44);assert(second.some(e=>e.id.includes('043')));
 state.memories[0].intelligence={current:false};state.memories[1].contentIntegrity={version:1,status:'incomplete',length:1};b.update(state);
 assert(!p.latest.has('memory:"memory-000"'));assert(!p.latest.has('memory:"memory-001"'));assert(p.journal.every(e=>p.latest.has(e.memory.id)));
 assert(p.journal.every(e=>!e.edge||p.links.some(l=>l.id===e.edge.id)));
});
test('deterministic reload and duplicate IDs, no writes; small and empty populations do not duplicate active memories',()=>{
 const state=fixture(),before=JSON.stringify(state),a=make(state),b=make(JSON.parse(before));assert.deepEqual(a.playback.advance(12300),b.playback.advance(12300));assert.equal(JSON.stringify(state),before);
 state.memories.push(state.memories[0]);assert.equal(make(state).playback.pending.length,43);
 for(const count of[0,1,2,3,4,5000]){const p=make(fixture(count)).playback;for(let i=0;i<15;i++){p.advance(300);const ids=p.active().map(e=>e.memory.id);assert.equal(new Set(ids).size,ids.length);assert(ids.length<=5);}}
});
test('playback and real event intensity remain separate, bounded and deduplicated',()=>{
 const p=make().playback,events=new ActivityModel();p.advance(2600);assert(p.values().some(v=>v>0));assert.equal(events.events.length,0);
 const event={id:'submission',phase:'accepted',activity:'TEACH'};assert(events.ingest(event,1000));assert(!events.ingest(event,1000));
 const combined=events.values(1200).map((v,i)=>Math.min(.94,1-(1-v)*(1-p.values()[i])));assert(combined[1]>p.values()[1]);assert(combined.every(v=>v<=.94));assert.equal(events.events.length,1);
 const current=p.time;p.advance(0);assert.equal(p.time,current);assert.deepEqual(p.values(),p.values());
});
test('cloud background is transparent and accessible bars describe combined visual activity',()=>{
 assert.match(readFileSync(new URL('../css/network.css',import.meta.url),'utf8'),/\.network-cloud-plot\{background:transparent\}/);
 const view=readFileSync(new URL('../src/network/network-view.js',import.meta.url),'utf8');assert.match(view,/Combined visual activity from stored-memory playback/);assert(!view.includes('decorative brain activity is excluded'));
});
test('every persisted edge participates even when edges outnumber memories; deleted records cannot overlap themselves',()=>{
 const state=fixture(43);for(let i=0;i<43;i++)state.memories[i].relatedMemoryIds=[state.memories[(i+1)%43].id,state.memories[(i+7)%43].id];
 const b=make(state),p=b.playback,seen=new Set();for(let i=0;i<p.links.length*2;i++){p.advance(i?INTERVAL:0);seen.add(p.journal.at(-1).edge.id);}assert.equal(seen.size,p.links.length);assert(p.links.length>43);
 state.memories=state.memories.slice(0,1);state.memories[0].relatedMemoryIds=[];b.update(state);
 for(let i=0;i<60;i++){p.advance(100);assert(p.active().length<=1);}assert.equal(p.links.length,0);
});
