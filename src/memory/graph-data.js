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
    nodes.push({id:memoryNodeId(id),recordId:id,kind:'memory',label:string(memory.content)||'Memory text unavailable',areaId:areaKey,topicId:topicKey,historical,raw:memory});
    edges.push({from:topicKey,to:memoryNodeId(id),kind:'hierarchy'});
  }
  const add=(from,to,kind)=>{
    if(typeof to!=='string'||!records.has(to)){if(to)dangling++;return;}
    if(from===to)return;
    const pair=[from,to].sort(compare),edgeKey=key(kind,pair);
    if(edgeKeys.has(edgeKey))return;
    edgeKeys.add(edgeKey);pairs.add(key('pair',pair));
    edges.push({from:memoryNodeId(from),to:memoryNodeId(to),kind});
  };
  for(const [id,memory] of records){
    for(const target of list(memory.relatedMemoryIds))add(id,target,'association');
    for(const target of list(memory.coSubmittedMemoryIds))add(id,target,'co-submitted');
    if(string(memory.parentMemoryId))add(id,memory.parentMemoryId,'part-of');
    for(const target of list(memory.componentMemoryIds))add(id,target,'part-of');
    if(string(memory.supersededBy))add(id,memory.supersededBy,'history');
    for(const target of list(memory.supersededByIds))add(id,target,'history');
  }
  const areas=[...categories.values()].sort((a,b)=>compare(a.label,b.label)||compare(a.id,b.id));
  const topicNodes=[...topics.values()].sort((a,b)=>compare(a.id,b.id));
  for(const area of areas)for(const topicId of area.topicIds)edges.push({from:area.id,to:topicId,kind:'hierarchy'});
  const current=nodes.filter(node=>!node.historical),totals=new Map();
  for(const node of current)totals.set(node.areaId,(totals.get(node.areaId)||0)+1);
  const counts=areas.map(area=>({id:area.id,label:area.label,count:totals.get(area.id)||0})).filter(axis=>axis.count).sort((a,b)=>b.count-a.count||compare(a.id,b.id));
  const axes=counts.length>6?[...counts.slice(0,5),{id:'other',label:'Other areas',count:counts.slice(5).reduce((sum,axis)=>sum+axis.count,0),members:counts.slice(5)}]:counts;
  return {nodes:[...areas,...topicNodes,...nodes],edges,areas,memories:nodes,stats:{canonical:records.size,areas:areas.length,associations:pairs.size,current:current.length,ignoredRecords,dangling},coverage:axes.map(axis=>({...axis,share:current.length?axis.count/current.length:0}))};
}
export function filterGraph(graph,{area='all',query=''}={}) {
  const needle=fold(string(query)),byId=new Map(graph.nodes.map(node=>[node.id,node]));
  const memoryIds=new Set(graph.memories.filter(node=>(area==='all'||node.areaId===area)&&(!needle||fold(`${node.label} ${byId.get(node.topicId)?.label||''}`).includes(needle))).map(node=>node.id));
  const keep=new Set(memoryIds);
  for(const node of graph.memories)if(keep.has(node.id)){keep.add(node.areaId);keep.add(node.topicId);}
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
    result.set(area.id,{...area,x:cx,y:cy,r:18,clusterRadius:radius});
    topics.forEach((topic,j)=>{
      const angle=-Math.PI/2+j*Math.PI*2/topics.length+index*.73;
      const x=cx+Math.cos(angle)*orbit,y=cy+Math.sin(angle)*orbit;
      result.set(topic.id,{...topic,x,y,r:8});
      const members=(membersByTopic.get(topic.id)||[]).slice().sort((a,b)=>compare(a.id,b.id));
      members.forEach((node,k)=>{const theta=k*2.399963229728653+angle,dist=35+22*Math.sqrt(k);result.set(node.id,{...node,x:x+Math.cos(theta)*dist,y:y+Math.sin(theta)*dist,r:node.historical?4:5.5});});
    });
  }
  return {nodes:[...result.values()],edges:graph.edges.filter(edge=>byId.has(edge.from)&&byId.has(edge.to)),width:Math.max(300,widths.reduce((a,b)=>a+b,0)),height:Math.max(260,heights.reduce((a,b)=>a+b,0))};
}

// Observe only fields the visualization consumes. Life/Energy ticks must not
// rebuild an unchanged memory graph. Projection avoids serializing cyclic extras.
export function memorySignature(state={}) {
  const scalar=value=>['string','boolean'].includes(typeof value)||(typeof value==='number'&&Number.isFinite(value))?value:null;
  const ids=value=>list(value).filter(id=>typeof id==='string').slice().sort(compare);
  return JSON.stringify([list(state?.categories).map(c=>[scalar(c?.id),scalar(c?.name)]),list(state?.memories).map(m=>m&&typeof m==='object'?[...[m.id,m.content,m.complete,m.contentIntegrity?.version,m.contentIntegrity?.status,m.contentIntegrity?.length,m.categoryId,m.category,m.areaSuggestion,m.topic,m.concept,m.strength,m.activations,m.supersededBy,m.parentMemoryId,m.source,m.kind,m.verification,m.intelligence?.kind,m.intelligence?.certainty,m.intelligence?.current,m.intelligence?.verification,m.analysis?.verification,m.native?.verification,m.analysis?.name,m.createdAt,m.updatedAt].map(scalar),ids(m.relatedMemoryIds),ids(m.coSubmittedMemoryIds),ids(m.componentMemoryIds),ids(m.supersededByIds),ids(m.neuronIds),ids(m.synapseIds),list(m.valueHistory).map(v=>scalar(v?.content)),list(m.contradictions).map(v=>scalar(v?.claim)),list(m.parts||m.atomicParts).map(p=>typeof p==='string'?p:scalar(p?.content||p?.text))]:null)]);
}
