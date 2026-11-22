import test from 'node:test';
import assert from 'node:assert/strict';
import {clusterPositions, ElasticAreaDrag, ElasticCluster} from '../src/memory/cluster-drag.js';
import {filterGraph, graphData, layoutGraph} from '../src/memory/graph-data.js';
import {seedConnectedAreas} from './support/connected-area-fixture.js';

const bounds={left:-200,top:-200,right:1600,bottom:900};
const positions=layout=>Object.fromEntries(layout.nodes.map(({id,x,y})=>[id,[x,y]]));
const arrange=()=>{
  const mind=seedConnectedAreas({});
  const layout=layoutGraph(filterGraph(graphData(mind)));
  const area=label=>layout.nodes.find(node=>node.kind==='area'&&node.label===label);
  const memory=id=>layout.nodes.find(node=>node.kind==='memory'&&node.areaId===id);
  return {mind,layout,area,memory};
};

for(const [name,linked] of [['Biology','Science'],['Science','Biology']]){
  test(`area drag keeps ${name} elastic and passes movement from ${linked} to its own memories`,()=>{
    const {mind,layout,area,memory}=arrange(),before=positions(layout),original=structuredClone(mind);
    const root=area(name),peer=area(linked),own=memory(root.id),peerMemory=memory(peer.id);
    const baselineLayout=structuredClone(layout),baseline=new ElasticCluster(clusterPositions(baselineLayout,root.id),root.id);
    const drag=new ElasticAreaDrag(layout,root.id);
    const moved=node=>node.y-before[node.id][1];

    drag.move(0,60,bounds);
    baseline.move(0,60,bounds);
    assert.equal(moved(root),60);
    for(const node of [own,peer,peerMemory])assert.equal(moved(node),0);
    drag.step(1/60);
    baseline.step(1/60);
    assert(0<moved(own)&&moved(own)<moved(root));
    assert(0<moved(peerMemory)&&moved(peerMemory)<moved(peer)&&moved(peer)<moved(root));
    drag.release();
    baseline.release();
    for(let i=0;i<240;i++){
      const moving=drag.step(1/60);
      baseline.step(1/60);
      for(const point of baseline.points){
        const node=layout.nodes.find(n=>n.id===point.node.id);
        assert.deepEqual([node.x,node.y],[point.node.x,point.node.y]);
      }
      if(!moving)break;
      assert(i<239,'connected springs did not settle');
    }
    assert.equal(moved(peer),33);
    assert.equal(moved(peerMemory),33);
    assert.equal(moved(area('Computing')),0);
    assert.deepEqual(mind,original);
  });
}

test('area springs ignore drawing-only edges, memory links and stale evidence',()=>{
  const {layout,mind,area}=arrange(),biology=area('Biology'),science=area('Science'),computing=area('Computing');
  layout.edges.push({from:biology.id,to:computing.id,kind:'association',origin:'semantic-area',persisted:false});
  assert(layout.edges.some(edge=>edge.origin==='relatedMemoryIds'));
  const before=positions(layout),drag=new ElasticAreaDrag(layout,biology.id);
  drag.move(0,60,bounds);drag.step(1/60);
  assert(science.y>before[science.id][1]);
  assert.equal(computing.y,before[computing.id][1]);
  drag.restore();
  assert.deepEqual(positions(layout),before);

  mind.memories.find(memory=>memory.id==='b1').content+=' Updated claim.';
  const stale=layoutGraph(filterGraph(graphData(mind)));
  const noLink=new ElasticAreaDrag(stale,biology.id);
  assert.equal(noLink.followers.length,0);
});

test('area drag keeps the original reduced-motion behavior without animating peers',()=>{
  const {layout,area,memory}=arrange(),root=area('Biology'),peer=area('Science');
  const before=positions(layout),drag=new ElasticAreaDrag(layout,root.id);
  drag.move(0,60,bounds,true);
  for(const node of [root,memory(root.id)])assert.equal(node.y-before[node.id][1],60);
  for(const node of [peer,memory(peer.id)])assert.equal(node.y-before[node.id][1],0);
  assert.equal(drag.step(1/60),false);
});
