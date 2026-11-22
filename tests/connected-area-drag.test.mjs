import test from 'node:test';
import assert from 'node:assert/strict';
import {areaSpringNeighbors, ConnectedAreaDrag} from '../src/memory/cluster-drag.js';
import {filterGraph, graphData, layoutGraph} from '../src/memory/graph-data.js';
import {cleanView} from '../src/memory/view-state.js';
import {seedConnectedAreas} from './support/connected-area-fixture.js';

const bounds={left:-200,top:-200,right:1600,bottom:900};
const snapshots=layout=>new Map(layout.nodes.map(({id,x,y})=>[id,{x,y}]));
const displacement=(node,before)=>[node.x-before.get(node.id).x,node.y-before.get(node.id).y];
const near=(a,b)=>a.forEach((value,i)=>assert(Math.abs(value-b[i])<.001,JSON.stringify([a,b])));

function arrange(){
  const mind=seedConnectedAreas({});
  const graph=graphData(mind),layout=layoutGraph(filterGraph(graph));
  const positions=new Map(layout.nodes.map(node=>[node.id,node]));
  const areas=Object.fromEntries(layout.nodes.filter(node=>node.kind==='area').map(node=>[node.label,node]));
  const neighbors=areaSpringNeighbors(layout,positions);
  return {mind,layout,positions,areas,neighbors};
}

for(const [name,linked] of [['Biology','Science'],['Science','Biology']]){
  test(`${name} and its memories move together, with a damped ${linked} follower`,()=>{
    const {mind,layout,positions,areas,neighbors}=arrange(),before=snapshots(layout),original=structuredClone(mind);
    const root=areas[name],peer=areas[linked],drag=new ConnectedAreaDrag(layout,positions,root.id,neighbors.get(root.id));
    const items=area=>layout.nodes.filter(item=>item.id===area.id||item.areaId===area.id);
    drag.move(-50,60,bounds);
    for(const item of items(root))near(displacement(item,before),[-50,60]);
    near(displacement(peer,before),[0,0]);
    assert(drag.step(1/60));
    let previous=0;
    for(let i=0;i<120&&drag.active;i++){
      const offset=displacement(peer,before);
      assert(offset[1]>=previous&&offset[1]<=33);
      previous=offset[1];
      for(const item of items(peer))near(displacement(item,before),offset);
      drag.step(1/60);
    }
    assert.equal(drag.active,false);
    near(displacement(peer,before),[-27.5,33]);
    for(const item of items(areas.Computing))near(displacement(item,before),[0,0]);
    assert.deepEqual(mind,original);
  });
}

test('only current persisted area associations influence nearby groups',()=>{
  const {mind,layout,positions,areas,neighbors}=arrange();
  assert.deepEqual([...neighbors.get(areas.Science.id).keys()],[areas.Biology.id]);
  assert(!neighbors.has(areas.Computing.id));
  assert(layout.edges.some(edge=>edge.origin==='relatedMemoryIds'));
  const visual={kind:'association',origin:'semantic-area',persisted:false,from:areas.Computing.id,to:areas.Science.id};
  assert(!areaSpringNeighbors({...layout,edges:[...layout.edges,visual]},positions).has(areas.Computing.id));
  mind.memories.find(memory=>memory.id==='b1').content+=' Updated claim.';
  assert(!graphData(mind).edges.some(edge=>edge.origin==='semantic-area'));
});

test('neighbor propagation is one hop, bounded to four peers, and cancellable',()=>{
  const areas=Array.from({length:8},(_,i)=>({id:String(i),kind:'area',x:100+i*90,y:180,r:20}));
  const edge=(from,to)=>({from:String(from),to:String(to),kind:'association',origin:'semantic-area',persisted:true});
  const layout={nodes:areas,edges:[...areas.slice(1,7).map((_,i)=>edge(0,i+1)),edge(1,7),edge(6,1)]};
  const positions=new Map(areas.map(area=>[area.id,area])),neighbors=areaSpringNeighbors(layout,positions);
  const before=snapshots(layout),drag=new ConnectedAreaDrag(layout,positions,'0',neighbors.get('0'));
  drag.move(330,0,bounds,true);
  assert.equal(drag.active,false);
  assert.equal(drag.followers.length,4);
  near(displacement(areas[0],before),[330,0]);
  near(displacement(areas[4],before),[181.5,0]);
  for(const area of areas.slice(5))near(displacement(area,before),[0,0]);
  drag.restore();
  assert.deepEqual(snapshots(layout),before);
});

test('spring remains bounded on rapid reversals and has consistent integration at different frame rates',()=>{
  const create=()=>{
    const {layout,positions,areas,neighbors}=arrange(),root=areas.Biology;
    return {layout,root,drag:new ConnectedAreaDrag(layout,positions,root.id,neighbors.get(root.id)),peer:areas.Science};
  };
  const after=dt=>{
    const {peer,drag}=create();
    drag.move(65,-36,bounds);
    for(let elapsed=0;elapsed<.5-1e-8;elapsed+=dt)drag.step(dt);
    return [peer.x,peer.y];
  };
  near(after(1/30),after(1/120));
  const {peer,root,drag}=create();
  for(let i=0;i<120;i++){
    drag.move(i%2?2000:-2000,i%2?-2000:2000,bounds);
    drag.step(.15);
    for(const node of [peer,root]){
      assert(node.x>=bounds.left+node.r&&node.x<=bounds.right-node.r);
      assert(node.y>=bounds.top+node.r&&node.y<=bounds.bottom-node.r);
    }
  }
});

test('repeated movement cannot accumulate link stretch against the original layout',()=>{
  const {layout,positions,areas,neighbors}=arrange(),root=areas.Biology,peer=areas.Science;
  const initial=neighbors.get(root.id).get(peer.id);
  const viewport={left:-5000,top:-5000,right:5000,bottom:5000};
  for(let i=0;i<12;i++){
    const drag=new ConnectedAreaDrag(layout,positions,root.id,neighbors.get(root.id));
    drag.move(10,-140,viewport,true);
    assert(Math.hypot(root.x-peer.x,root.y-peer.y)<=initial+120+.001);
  }
});

test('view preferences accept older layouts and only save owner-relative memory offsets',()=>{
  const positions={'area:a':{x:12,y:34}};
  assert.deepEqual(cleanView({positions}).memoryOffsets,{});
  const kept={'memory:m':{areaId:'area:a',x:42,y:-15}};
  const view=cleanView({positions,memoryOffsets:{...kept,
    'memory:n':{areaId:'area:a',x:Infinity,y:2},'memory:o':{areaId:'invalid',x:1,y:2},other:{areaId:'area:a',x:1,y:2}
  }});
  assert.deepEqual(view.positions,positions);
  assert.deepEqual(view.memoryOffsets,kept);
});
