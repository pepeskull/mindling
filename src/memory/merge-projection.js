// Read-only render projection. Canonical area and topic identities remain in graphData.
export function renderHierarchy(graph){
 const areas=new Map(graph.nodes.filter(n=>n.kind==='area').map(n=>[n.id,n]));
 const children=new Set([...areas.values()].filter(a=>a.parentId).map(a=>a.id));
 if(!children.size)return graph;
 const removedTopics=new Set(graph.nodes.filter(n=>n.kind==='topic'&&children.has(n.areaId)).map(n=>n.id));
 const nodes=graph.nodes.filter(n=>!removedTopics.has(n.id)).map(n=>children.has(n.id)?{...n,kind:'topic',hierarchyArea:true,colorAreaId:n.id,areaId:n.rootId,memoryIds:n.descendantMemoryIds}:n.kind==='memory'&&children.has(n.areaId)?{...n,topicId:n.areaId}:n);
 const edges=graph.edges.filter(e=>!removedTopics.has(e.from)&&!removedTopics.has(e.to));
 for(const n of nodes)if(n.kind==='memory'&&children.has(n.areaId))edges.push({from:n.areaId,to:n.id,kind:'hierarchy',persisted:false,origin:'retained-child-membership',sourceMemoryIds:[n.recordId]});
 return {...graph,nodes,edges,memories:nodes.filter(n=>n.kind==='memory')};
}
