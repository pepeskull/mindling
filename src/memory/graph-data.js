import {projectHierarchy,areaRadius} from './knowledge-hierarchy.js';
import { memoryLabel, contextualLabel, memoryContext } from './memory-label.js';
// Read-only presentation projection. Never opens a database, classifies text or
// guesses a relationship from similarity. Saved IDs are the only memory identity.
const string=value=>typeof value==='string'?value.trim():'';
const list=value=>Array.isArray(value)?value:[];
const identity=value=>typeof value==='string'&&value.trim()?value:'';
const key=(type,value)=>`${type}:${JSON.stringify(value)}`;
const fold=value=>value.normalize('NFC').toLocaleLowerCase('en');
const compare=(a,b)=>a<b?-1:a>b?1:0;
export const memoryNodeId=id=>key('memory',id);
export function graphData(state={}) {
  const records=new Map(),categories=new Map(),topics=new Map(),nodes=[],edges=[],pairs=new Set(),edgeKeys=new Set();
  let ignoredRecords=list(state?.memories).filter(value=>!value||typeof value!=='object').length,dangling=0;
  const sorted=list(state?.memories).filter(value=>value&&typeof value==='object').slice().sort((a,b)=>compare(identity(a.id),identity(b.id))||compare(string(a.content),string(b.content)));
  for(const memory of sorted){
    const id=identity(memory.id);if(!id||records.has(id)){ignoredRecords++;continue;}
    records.set(id,memory);
  }
  const categoryNames=new Map(list(state?.categories).filter(c=>identity(c?.id)&&string(c?.name)).map(c=>[c.id,c.name.trim()]));
  for(const [id,memory] of records){
    const categoryId=identity(memory.categoryId),label=categoryNames.get(categoryId)||string(memory.category)||string(memory.areaSuggestion)||'Uncategorized';
    const areaKey=key('area',categoryId?['id',categoryId]:['label',fold(label)]);
    if(!categories.has(areaKey))categories.set(areaKey,{id:areaKey,kind:'area',label,memoryIds:[],topicIds:[]});
    const area=categories.get(areaKey),topicLabel=string(memory.topic)||string(memory.concept)||'Unsorted memories';
    const topicKey=key('topic',[areaKey,fold(topicLabel)]);
    if(!topics.has(topicKey)){topics.set(topicKey,{id:topicKey,kind:'topic',label:topicLabel,areaId:areaKey,memoryIds:[]});area.topicIds.push(topicKey);}
    area.memoryIds.push(id);topics.get(topicKey).memoryIds.push(id);
    const historical=Boolean(memory.supersededBy||memory.intelligence?.current===false||memory.kind==='historical'||memory.intelligence?.kind==='historical');
    nodes.push({id:memoryNodeId(id),recordId:id,kind:'memory',displayLabel:memoryLabel(memory).title,label:string(memory.content)||'Memory text unavailable',areaLabel:area.label,areaId:areaKey,topicId:topicKey,historical,raw:memory});
    edges.push({from:topicKey,to:memoryNodeId(id),kind:'hierarchy',persisted:false,sourceMemoryIds:[id],origin:'topic-membership'});
  }
  const add=(from,to,kind)=>{
    if(typeof to!=='string'||!records.has(to)){if(to)dangling++;return;}
    if(from===to)return;
    const pair=[from,to].sort(compare),edgeKey=key(kind,pair);
    if(edgeKeys.has(edgeKey))return;
    edgeKeys.add(edgeKey);if(kind==='association')pairs.add(key('pair',pair));
    const a=records.get(from),b=records.get(to),semantic=list(a.semanticAssociations).find(e=>e?.memoryId===to)||list(b.semanticAssociations).find(e=>e?.memoryId===from),model=list(a.modelAssociations).find(e=>e?.memoryId===to)||list(b.modelAssociations).find(e=>e?.memoryId===from);
    edges.push({from:memoryNodeId(from),to:memoryNodeId(to),kind,persisted:true,sourceMemoryIds:pair,origin:kind==='association'?(semantic?'semanticAssociations':model?'modelAssociations':'relatedMemoryIds'):kind==='co-submitted'?'coSubmittedMemoryIds':kind==='history'?'version-metadata':'component-metadata',...(kind==='association'&&semantic?{basis:{rule:semantic.rule,entity:semantic.entity,...(semantic.scope?{scope:semantic.scope}:{})}}:{})});
  };
  for(const [id,memory] of records){
    for(const target of list(memory.relatedMemoryIds)){
      const other=records.get(target),audited=list(memory.semanticAssociations).some(e=>e?.memoryId===target)||list(other?.semanticAssociations).some(e=>e?.memoryId===id)||list(memory.modelAssociations).some(e=>e?.memoryId===target)||list(other?.modelAssociations).some(e=>e?.memoryId===id);
      const version=memory.correctsMemoryId===target||other?.correctsMemoryId===id||memory.supersededBy===target||other?.supersededBy===id;
      const submission=memory.submissionId&&memory.submissionId===other?.submissionId&&list(memory.coSubmittedMemoryIds).includes(target)&&list(other?.coSubmittedMemoryIds).includes(id);
      add(id,target,!audited&&version?'history':!audited&&submission?'co-submitted':'association');
    }
    if(string(memory.correctsMemoryId))add(id,memory.correctsMemoryId,'history');
    for(const target of list(memory.coSubmittedMemoryIds))add(id,target,'co-submitted');
    if(string(memory.parentMemoryId))add(id,memory.parentMemoryId,'part-of');
    for(const target of list(memory.componentMemoryIds))add(id,target,'part-of');
    if(string(memory.supersededBy))add(id,memory.supersededBy,'history');
    for(const target of list(memory.supersededByIds))add(id,target,'history');
  }
  const areas=[...categories.values()].sort((a,b)=>compare(a.label,b.label)||compare(a.id,b.id));
  for(const area of areas){const ts=area.topicIds.map(id=>topics.get(id));area.displayLabel=ts.length>1&&/^(definition|definitions)$/iu.test(area.label)?`Definitions · ${ts.length} topics`:contextualLabel(area.label,ts.length===1?ts[0].label:null)||area.label;for(const topic of ts){const first=nodes.find(n=>n.topicId===topic.id);topic.displayLabel=contextualLabel(topic.label,first&&memoryLabel(first).title)||topic.label;}}
  const titles=new Map();for(const node of nodes){const label=memoryLabel(node).title;titles.set(label,(titles.get(label)||0)+1);}for(const node of nodes)if(titles.get(memoryLabel(node).title)>1)node.labelContext=memoryContext(node.raw);
  projectHierarchy(areas,nodes,edges,state?.knowledgeHierarchy);
  const topicNodes=[...topics.values()].sort((a,b)=>compare(a.id,b.id));
  for(const area of areas)for(const topicId of area.topicIds)edges.push({from:area.id,to:topicId,kind:'hierarchy',persisted:false,sourceMemoryIds:topics.get(topicId).memoryIds,origin:'area-membership'});
  // Keep unreadable records inspectable in the graph, but exclude them from
  // acquired-knowledge counts alongside historical and superseded records.
  const current=nodes.filter(node=>!node.historical&&string(node.raw.content)),totals=new Map();
  for(const node of current)totals.set(node.areaId,(totals.get(node.areaId)||0)+1);
  const counts=areas.map(area=>({id:area.id,label:area.label,count:totals.get(area.id)||0})).filter(axis=>axis.count).sort((a,b)=>b.count-a.count||compare(a.id,b.id));
  const distribution=counts.map(area=>({...area,share:current.length?area.count/current.length:0}));
  const rootCounts=areas.filter(a=>!a.parentId).map(a=>({id:a.id,label:a.label,count:current.filter(n=>n.rootAreaId===a.id).length})).filter(a=>a.count).sort((a,b)=>b.count-a.count||compare(a.id,b.id));
  const axes=rootCounts.length>6?[...rootCounts.slice(0,5),{id:'other',label:'Other areas',count:rootCounts.slice(5).reduce((sum,axis)=>sum+axis.count,0),members:rootCounts.slice(5)}]:rootCounts;
  return {nodes:[...areas,...topicNodes,...nodes],edges,areas,memories:nodes,distribution,stats:{canonical:records.size,areas:areas.filter(a=>!a.parentId).length,associations:pairs.size,current:current.length,ignoredRecords,dangling},coverage:axes.map(axis=>({...axis,share:current.length?axis.count/current.length:0}))};
}
export function filterGraph(graph,{area='all',query=''}={}) {
  const needle=fold(string(query)),byId=new Map(graph.nodes.map(node=>[node.id,node]));
  const memoryIds=new Set(graph.memories.filter(node=>(area==='all'||node.areaId===area||node.ancestorAreaIds?.includes(area))&&(!needle||fold(`${node.label} ${byId.get(node.topicId)?.label||''}`).includes(needle))).map(node=>node.id));
  const keep=new Set(memoryIds);
  for(const node of graph.memories)if(keep.has(node.id)){keep.add(node.areaId);keep.add(node.topicId);for(const id of node.ancestorAreaIds||[])keep.add(id);}
  return {nodes:graph.nodes.filter(node=>keep.has(node.id)),edges:graph.edges.filter(edge=>keep.has(edge.from)&&keep.has(edge.to)),memories:graph.memories.filter(node=>memoryIds.has(node.id))};
}
export function layoutGraph(graph) {
  const result=new Map(),byId=new Map(graph.nodes.map(node=>[node.id,node]));
  const areas=graph.nodes.filter(node=>node.kind==='area').sort((a,b)=>compare(a.id,b.id));
  const membersByTopic=new Map(),topicsByArea=new Map();
  for(const node of graph.memories){if(!membersByTopic.has(node.topicId))membersByTopic.set(node.topicId,[]);membersByTopic.get(node.topicId).push(node);}
  for(const node of graph.nodes)if(node.kind==='topic'){if(!topicsByArea.has(node.areaId))topicsByArea.set(node.areaId,[]);topicsByArea.get(node.areaId).push(node);}
  const clusters=areas.map(area=>{
    const topics=(topicsByArea.get(area.id)||[]).slice().sort((a,b)=>compare(a.id,b.id));
    const maxLeaf=Math.max(28,...topics.map(topic=>24*Math.sqrt((membersByTopic.get(topic.id)||[]).length)));
    const orbit=topics.length===1?100:Math.max(maxLeaf+65,(maxLeaf*2+45)/(2*Math.sin(Math.PI/topics.length)));
    return {area,topics,maxLeaf,orbit,radius:orbit+maxLeaf+65};
  });
  const columns=Math.max(1,Math.ceil(Math.sqrt(clusters.length))),widths=Array(columns).fill(0),heights=[];
  clusters.forEach((cluster,i)=>{widths[i%columns]=Math.max(widths[i%columns],cluster.radius*2+90);const row=Math.floor(i/columns);heights[row]=Math.max(heights[row]||0,cluster.radius*2+90);});
  for(let index=0;index<clusters.length;index++){
    const {area,topics,orbit,radius}=clusters[index],col=index%columns,row=Math.floor(index/columns);
    const cx=widths.slice(0,col).reduce((a,b)=>a+b,0)+widths[col]/2,cy=heights.slice(0,row).reduce((a,b)=>a+b,0)+heights[row]/2;
    result.set(area.id,{...area,x:cx,y:cy,r:areaRadius(area),clusterRadius:radius});
    topics.forEach((topic,j)=>{
      const angle=-Math.PI/2+j*Math.PI*2/topics.length+index*.73;
      const x=cx+Math.cos(angle)*orbit,y=cy+Math.sin(angle)*orbit;
      result.set(topic.id,{...topic,x,y,r:8});
      const members=(membersByTopic.get(topic.id)||[]).slice().sort((a,b)=>compare(a.id,b.id));
      members.forEach((node,k)=>{const theta=k*2.399963229728653+angle,dist=35+22*Math.sqrt(k);result.set(node.id,{...node,x:x+Math.cos(theta)*dist,y:y+Math.sin(theta)*dist,r:node.historical?4:5.5});});
    });
  }
  for(const area of areas.filter(a=>a.parentId).sort((a,b)=>a.ancestorIds.length-b.ancestorIds.length)){
    const node=result.get(area.id),parent=result.get(area.parentId);if(!parent)continue;
    const siblings=areas.filter(a=>a.parentId===area.parentId),i=siblings.indexOf(area),angle=i*2*Math.PI/siblings.length;
    const distance=parent.clusterRadius+node.clusterRadius*.65,dx=parent.x+Math.cos(angle)*distance-node.x,dy=parent.y+Math.sin(angle)*distance-node.y;
    for(const n of result.values())if(n.id===area.id||n.areaId===area.id){n.x+=dx;n.y+=dy;}
  }
  // The parent halo contains its retained child clusters; core size remains bounded.
  for(const area of areas.filter(a=>a.parentId).sort((a,b)=>b.ancestorIds.length-a.ancestorIds.length)){
    const node=result.get(area.id),parent=result.get(area.parentId);if(parent)parent.clusterRadius=Math.max(parent.clusterRadius,Math.hypot(node.x-parent.x,node.y-parent.y)+node.clusterRadius);
  }
  const hierarchical=areas.some(a=>a.parentId);
  const values=[...result.values()],minX=Math.min(0,...values.map(n=>n.x-n.r-50)),minY=Math.min(0,...values.map(n=>n.y-n.r-50));
  for(const n of values){n.x-=minX;n.y-=minY;}
  return {nodes:[...result.values()],edges:graph.edges.filter(edge=>byId.has(edge.from)&&byId.has(edge.to)),width:hierarchical?Math.max(300,...values.map(n=>n.x+n.r+80)):Math.max(300,widths.reduce((a,b)=>a+b,0)),height:hierarchical?Math.max(260,...values.map(n=>n.y+n.r+80)):Math.max(260,heights.reduce((a,b)=>a+b,0))};
}

// Observe only fields the visualization consumes. Life/Energy ticks must not
// rebuild an unchanged memory graph. Projection avoids serializing cyclic extras.
export function memorySignature(state={}) {
  const scalar=value=>['string','boolean'].includes(typeof value)||(typeof value==='number'&&Number.isFinite(value))?value:null;
  const ids=value=>list(value).filter(id=>typeof id==='string').slice().sort(compare);
  return JSON.stringify([[scalar(state?.knowledgeHierarchy?.version),scalar(state?.knowledgeHierarchy?.revision),list(state?.knowledgeHierarchy?.links).map(l=>[scalar(l?.parentId),scalar(l?.childId)])],list(state?.categories).map(c=>[scalar(c?.id),scalar(c?.name)]),list(state?.memories).map(m=>m&&typeof m==='object'?[...[m.id,m.correctsMemoryId,m.submissionId,m.content,m.complete,m.contentIntegrity?.version,m.contentIntegrity?.status,m.contentIntegrity?.length,m.categoryId,m.category,m.areaSuggestion,m.topic,m.concept,m.strength,m.activations,m.supersededBy,m.parentMemoryId,m.source,m.kind,m.verification,m.intelligence?.kind,m.intelligence?.certainty,m.intelligence?.current,m.intelligence?.verification,m.analysis?.verification,m.native?.verification,m.analysis?.name,m.createdAt,m.updatedAt].map(scalar),ids(m.relatedMemoryIds),list(m.semanticAssociations).map(e=>[scalar(e?.memoryId),scalar(e?.rule),scalar(e?.entity),scalar(e?.scope)]),list(m.modelAssociations).map(e=>scalar(e?.memoryId)),ids(m.coSubmittedMemoryIds),ids(m.componentMemoryIds),ids(m.supersededByIds),ids(m.neuronIds),ids(m.synapseIds),list(m.valueHistory).map(v=>scalar(v?.content)),list(m.contradictions).map(v=>scalar(v?.claim)),list(m.parts||m.atomicParts).map(p=>typeof p==='string'?p:scalar(p?.content||p?.text))]:null)]);
}
