// Only organization descendants move. Semantic bridges must not pull unrelated areas.
export function clusterPositions(layout,areaId){
  const areas=new Set([areaId,...layout.nodes.filter(node=>(node.kind==='area'||node.hierarchyArea)&&node.ancestorIds?.includes(areaId)).map(n=>n.id)]);
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

// Critically damped, analytical spring integration: stable across frame rates.
// Positions/velocities are view-local. No canonical graph fields are touched.
export class ElasticCluster {
  constructor(points,rootId,followRoot=false){
    this.points=points.map(p=>({...p,vx:0,vy:0}));this.root=this.points.find(p=>p.node.id===rootId);
    if(followRoot)this.points=[this.root,...this.points.filter(p=>p!==this.root)];
    this.followRoot=followRoot;this.dx=0;this.dy=0;this.held=!followRoot;this.active=false;
  }
  move(dx,dy,bounds,reduced=false){
    // Reuse the existing cluster bounds without moving the displayed children.
    const ghosts=this.points.map(p=>({...p,node:{...p.node}}));moveCluster(ghosts,dx,dy,bounds);
    this.dx=ghosts[0].node.x-ghosts[0].x;this.dy=ghosts[0].node.y-ghosts[0].y;this.bounds=bounds;
    if(reduced){for(const p of this.points){p.node.x=p.x+this.dx;p.node.y=p.y+this.dy;p.vx=p.vy=0;}this.active=false;return;}
    if(!this.followRoot){this.root.node.x=this.root.x+this.dx;this.root.node.y=this.root.y+this.dy;}
    this.active=true;
  }
  release(){this.held=false;}
  step(seconds){
    if(!this.active)return false;
    const dt=Math.max(0,Math.min(.05,seconds));let moving=false;
    for(const p of this.points){
      if(p===this.root&&this.held)continue;
      const distance=Math.hypot(p.x-this.root.x,p.y-this.root.y),omega=15/(1+distance/170),decay=Math.exp(-omega*dt);
      for(const [axis,velocity,delta]of [['x','vx',this.dx],['y','vy',this.dy]]){
        const displacement=this.followRoot&&p!==this.root?this.root.node[axis]-this.root[axis]:delta;
        const target=p[axis]+displacement,offset=p.node[axis]-target,term=p[velocity]+omega*offset;
        p.node[axis]=target+(offset+term*dt)*decay;p[velocity]=(p[velocity]-omega*term*dt)*decay;
        if(Math.abs(p.node[axis]-target)>.04||Math.abs(p[velocity])>.08)moving=true;else{p.node[axis]=target;p[velocity]=0;}
      }
      if(this.bounds){for(const [axis,lo,hi]of [['x','left','right'],['y','top','bottom']]){const min=Math.min(p[axis],this.bounds[lo]+p.node.r),max=Math.max(p[axis],this.bounds[hi]-p.node.r),bounded=Math.max(min,Math.min(max,p.node[axis]));if(bounded!==p.node[axis])p['v'+axis]=0;p.node[axis]=bounded;}}
    }
    // Bounded local separation. The pointer-owned root never yields; siblings
    // are checked in nearby buckets, not with an all-pairs physics simulation.
    const buckets=new Map(),size=64;
    for(const p of [this.root,...this.points.filter(p=>p!==this.root)]){
      const gx=Math.floor(p.node.x/size),gy=Math.floor(p.node.y/size);let checked=0;
      for(let x=gx-1;x<=gx+1&&checked<16;x++)for(let y=gy-1;y<=gy+1&&checked<16;y++)for(const other of buckets.get(x+','+y)||[]){
        if(checked++>=16)break;const dx=p.node.x-other.node.x,dy=p.node.y-other.node.y,distance=Math.hypot(dx,dy),minimum=p.node.r+other.node.r+2;
        if(distance<minimum){const angle=distance?Math.atan2(dy,dx):Math.atan2(p.y-other.y,p.x-other.x),push=minimum-distance;p.node.x+=Math.cos(angle)*push;p.node.y+=Math.sin(angle)*push;moving=true;}
      }
      if(this.bounds){p.node.x=Math.max(Math.min(p.x,this.bounds.left+p.node.r),Math.min(Math.max(p.x,this.bounds.right-p.node.r),p.node.x));p.node.y=Math.max(Math.min(p.y,this.bounds.top+p.node.r),Math.min(Math.max(p.y,this.bounds.bottom-p.node.r),p.node.y));}
      const key=Math.floor(p.node.x/size)+','+Math.floor(p.node.y/size);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(p);
    }
    this.active=moving;return moving;
  }
}

export class ElasticAreaDrag extends ElasticCluster {
  constructor(layout,areaId){
    super(clusterPositions(layout,areaId),areaId);
    const neighbors=new Set();
    for(const edge of layout.edges){
      if(edge.kind!=='association'||edge.origin!=='semantic-area'||edge.persisted!==true)continue;
      if(edge.from===areaId)neighbors.add(edge.to);
      if(edge.to===areaId)neighbors.add(edge.from);
    }
    this.followers=layout.nodes.filter(node=>node.kind==='area'&&node.id!==areaId&&neighbors.has(node.id)).slice(0,4)
      .map(node=>new ElasticCluster(clusterPositions(layout,node.id),node.id,true));
  }
  move(dx,dy,bounds,reduced=false){
    super.move(dx,dy,bounds,reduced);
    if(!reduced)for(const follower of this.followers)follower.move(this.dx*.55,this.dy*.55,bounds);
  }
  step(seconds){
    let moving=super.step(seconds);
    for(const follower of this.followers)if(follower.step(seconds))moving=true;
    return moving;
  }
  restore(){
    for(const cluster of [this,...this.followers])for(const p of cluster.points){p.node.x=p.x;p.node.y=p.y;}
  }
}
