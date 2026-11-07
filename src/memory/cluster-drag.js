// Only organization descendants move. Semantic bridges must not pull unrelated areas.
export function clusterPositions(layout,areaId){
  const ids=new Set([areaId,...layout.nodes.filter(node=>node.areaId===areaId).map(node=>node.id)]);
  // Display-only task groups anchored to this area belong to its layout cluster.
  for(const node of layout.nodes)if(node.kind==='research'&&node.anchor===areaId)ids.add(node.id);
  return layout.nodes.filter(node=>ids.has(node.id)).map(node=>({node,x:node.x,y:node.y}));
}
export function moveCluster(points,dx,dy,bounds){
  if(!points.length)return;
  const minX=Math.min(...points.map(p=>p.x-p.node.r)),maxX=Math.max(...points.map(p=>p.x+p.node.r));
  const minY=Math.min(...points.map(p=>p.y-p.node.r)),maxY=Math.max(...points.map(p=>p.y+p.node.r));
  // Permit an already partially offscreen/oversize cluster without jumping it.
  dx=Math.max(Math.min(0,bounds.left-minX),Math.min(Math.max(0,bounds.right-maxX),dx));
  dy=Math.max(Math.min(0,bounds.top-minY),Math.min(Math.max(0,bounds.bottom-maxY),dy));
  for(const p of points){p.node.x=p.x+dx;p.node.y=p.y+dy;}
}
