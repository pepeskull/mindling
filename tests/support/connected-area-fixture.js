import {graphData} from '../../src/memory/graph-data.js';
import {persistAreaRelations} from '../../src/semantic/area-relations.js';
import {semanticSnapshot} from '../../src/semantic/model-contract.js';

export function seedConnectedAreas(mind){
  mind.memories=[
    ['b1','Biology','Cell structure','Cell membranes regulate movement of substances into and out of cells.'],
    ['b2','Biology','Genetics','Genes carry information used by cells to make functional products.'],
    ['s1','Science','Scientific method','Scientists test explanations against observations from experiments.'],
    ['s2','Science','Microscopy','Scientists use microscopes to observe cells and test biological explanations.'],
    ['c1','Computing','Algorithms','A sorting algorithm arranges a collection according to a specified order.']
  ].map(([id,category,topic,content])=>({
    id,category,categoryId:category.toLowerCase(),topic,content,source:'SERVICE',
    contentIntegrity:{version:1,status:'captured',length:content.length},
    analysis:{name:'mindling-learning-service',verification:'unverified-player-claim'},
    intelligence:{kind:'claim',current:true},relatedMemoryIds:[]
  }));
  mind.memories.find(m=>m.id==='s1').relatedMemoryIds.push('c1');
  const {areas}=graphData(mind);
  const ends=['Biology','Science'].map(label=>areas.find(area=>area.label===label));
  const evidence=['b1','s2'].map(id=>{
    const snapshot=semanticSnapshot(mind.memories.find(memory=>memory.id===id));
    return {snapshot,span:{start:0,end:snapshot.text.length,quote:snapshot.text}};
  });
  const relation={
    version:1,from:ends[0].id,to:ends[1].id,type:'related-to',direction:'symmetric',
    reason:'Both sets of memories address observing and explaining cells.',
    validation:'model-supported-not-independently-verified',
    areas:ends.map(({id,label})=>({id,label})),evidence
  };
  if(persistAreaRelations(mind,[relation],areas,1)[0]!=='AREA_PERSISTED')throw Error('Invalid area fixture.');
  return mind;
}
