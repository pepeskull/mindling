const isAreaNode=node=>node?.kind==='area'||node?.hierarchyArea===true;

// Organization defines the rigid layout group, including areas nested in it.
export function clusterPositions(layout,areaId){
  const areas=new Set([areaId,...layout.nodes.filter(node=>isAreaNode(node)&&node.ancestorIds?.includes(areaId)).map(n=>n.id)]);
  const ids=new Set(layout.nodes.filter(node=>areas.has(node.id)||areas.has(node.areaId)||node.ancestorAreaIds?.includes(areaId)).map(n=>n.id));
  // Display-only task groups anchored to this area belong to its layout cluster.
  for(const node of layout.nodes)if(node.kind==='research'&&areas.has(node.anchor))ids.add(node.id);
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

const FOLLOW_RATIO=.55;
const FOLLOW_LIMIT=4;
const LINK_SLACK=120;

export function areaSpringNeighbors(layout, positions){
  const neighbors=new Map();
  for(const edge of layout.edges){
    if(edge.kind!=='association'||edge.origin!=='semantic-area'||edge.persisted!==true)continue;
    const first=positions.get(edge.from),second=positions.get(edge.to);
    if(first?.kind!=='area'||second?.kind!=='area'||first===second)continue;
    const restLength=Math.hypot(first.x-second.x,first.y-second.y);
    for(const [from,to] of [[edge.from,edge.to],[edge.to,edge.from]]){
      if(!neighbors.has(from))neighbors.set(from,new Map());
      neighbors.get(from).set(to,restLength);
    }
  }
  return neighbors;
}

const boundsFor=({x,y,node},box)=>({
  left:Math.min(0,box.left+node.r-x),right:Math.max(0,box.right-node.r-x),
  top:Math.min(0,box.top+node.r-y),bottom:Math.max(0,box.bottom-node.r-y)
});
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const setOffset=(group,x,y)=>{
  group.x=x;group.y=y;
  for(const point of group.points){point.node.x=point.x+x;point.node.y=point.y+y;}
};

export class ConnectedAreaDrag {
  constructor(layout,positions,areaId,neighbors=new Map()){
    const points=clusterPositions(layout,areaId);
    this.group={points,x:0,y:0,anchor:points.find(p=>p.node.id===areaId),ids:new Set(points.map(p=>p.node.id))};
    this.followers=[];
    this.active=false;
    const assigned=new Set(this.group.ids);
    const distance=node=>Math.hypot(node.x-this.group.anchor.x,node.y-this.group.anchor.y);
    const nearest=[...neighbors.keys()].map(id=>positions.get(id)).filter(node=>node&&!assigned.has(node.id))
      .sort((a,b)=>distance(a)-distance(b)).slice(0,FOLLOW_LIMIT);
    for(const node of nearest){
      const followers=clusterPositions(layout,node.id);
      if(followers.some(p=>assigned.has(p.node.id)))continue;
      this.followers.push({points:followers,anchor:followers.find(p=>p.node===node),maxLinkLength:neighbors.get(node.id)+LINK_SLACK,x:0,y:0,vx:0,vy:0});
      for(const point of followers)assigned.add(point.node.id);
    }
  }

  move(dx,dy,box,reduced){
    const bounds=boundsFor(this.group.anchor,box);
    const x=clamp(dx,bounds.left,bounds.right),y=clamp(dy,bounds.top,bounds.bottom);
    setOffset(this.group,x,y);
    for(const group of this.followers){
      const limits=boundsFor(group.anchor,box);
      group.limits=limits;
      // The unedited layout provides the resting link length across gestures.
      let targetX=x*FOLLOW_RATIO,targetY=y*FOLLOW_RATIO;
      const gapX=this.group.anchor.node.x-group.anchor.x-targetX,gapY=this.group.anchor.node.y-group.anchor.y-targetY;
      const length=Math.hypot(gapX,gapY);
      if(length>group.maxLinkLength){
        const stretch=1-group.maxLinkLength/length;
        targetX+=gapX*stretch;targetY+=gapY*stretch;
      }
      group.targetX=clamp(targetX,limits.left,limits.right);
      group.targetY=clamp(targetY,limits.top,limits.bottom);
      if(reduced){setOffset(group,group.targetX,group.targetY);group.vx=group.vy=0;}
    }
    this.active=!reduced&&this.followers.length>0;
  }

  step(seconds){
    if(!this.active)return false;
    const dt=clamp(seconds,0,.05),frequency=13,decay=Math.exp(-frequency*dt);
    let moving=false;
    for(const group of this.followers){
      const {limits}=group;
      const offsets=[];
      // Analytical critically damped spring keeps each owned group rigid and
      // stable after long frames, without pushing on further graph branches.
      for(const [axis,velocity,target,min,max] of [
        ['x','vx',group.targetX,limits.left,limits.right],
        ['y','vy',group.targetY,limits.top,limits.bottom]
      ]){
        const delta=group[axis]-target,term=group[velocity]+frequency*delta;
        const value=target+(delta+term*dt)*decay,bounded=clamp(value,min,max);
        group[velocity]=bounded===value?(group[velocity]-frequency*term*dt)*decay:0;
        const unsettled=Math.abs(bounded-target)>.04||Math.abs(group[velocity])>.08;
        moving||=unsettled;
        if(!unsettled)group[velocity]=0;
        offsets.push(unsettled?bounded:target);
      }
      setOffset(group,...offsets);
    }
    this.active=moving;
    return moving;
  }

  restore(){
    setOffset(this.group,0,0);
    for(const group of this.followers)setOffset(group,0,0);
    this.active=false;
  }
}
