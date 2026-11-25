const FILTERS={
  soft:'grayscale(1) brightness(1.24)',
  synapses:'grayscale(1) brightness(.82)',
  activity:'grayscale(1) brightness(1.08)',xray:'grayscale(1) brightness(.73)'
};
const ALPHAS={synapses:.46,xray:.49};

export class CanvasLook {
  constructor(view){
    this.view=view;
    this.canvas=this.view.scene.canvas;
    this.overlay=document.createElement('canvas');
    this.overlay.className='dashboard-brain-effects';
    this.overlay.setAttribute('aria-hidden','true');
    this.canvas.after(this.overlay);
    this.context=this.overlay.getContext('2d');
  }

  position(id){
    if(this.view.seed)return this.view.seed.projectedNeuron(id);
    const scene=this.view.scene,index=scene.canonicalIndices.get(id),point=new Float32Array(2);
    if(index===undefined||!scene.canonicalPoint(index,point))return null;
    return{x:point[0],y:point[1],radius:4};
  }

  trace(a,b,t){
    if(!this.view.seed)return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
    const control=Math.min(a.y,b.y)-8;
    return{x:a.x+(b.x-a.x)*t,y:(1-t)**2*a.y+2*(1-t)*t*control+t*t*b.y};
  }

  traceSegment(edge,start,end,color,width){
    const a=this.position(edge.from),b=this.position(edge.to);
    if(!a||!b)return;
    const c=this.context;
    c.strokeStyle=color;c.lineWidth=width;c.beginPath();
    for(let i=0;i<=12;i++){
      const {x,y}=this.trace(a,b,start+(end-start)*i/12);
      if(i)c.lineTo(x,y);else c.moveTo(x,y);
    }
    c.stroke();
  }

  draw(mode,profile,activity,selected){
    const {canvas,overlay,context:c}=this;
    canvas.style.filter=FILTERS[profile];canvas.style.opacity=ALPHAS[profile]??1;
    if(overlay.width!==canvas.width||overlay.height!==canvas.height){overlay.width=canvas.width;overlay.height=canvas.height;}
    const {width,height}=this.view;
    c.setTransform(overlay.width/width,0,0,overlay.height/height,0,0);
    c.clearRect(0,0,width,height);
    if(['synapses','xray'].includes(mode))for(const edge of this.view.data.canonicalNetwork.synapses){
      const weight=Number.isFinite(edge.strength)?Math.min(1,Math.max(0,edge.strength)):0;
      this.traceSegment(edge,0,1,mode==='xray'?'rgba(255,255,255,.56)':'rgba(255,255,255,.65)',.7+weight*.9);
    }
    if(mode==='xray'){
      c.strokeStyle='rgba(255,255,255,.48)';c.lineWidth=.65;c.beginPath();
      for(const node of this.view.data.canonicalNetwork.nodes){
        const p=this.position(node.id);if(!p)continue;
        c.moveTo(p.x+p.radius,p.y);c.ellipse(p.x,p.y,p.radius,p.radius*.88,0,0,Math.PI*2);
        c.moveTo(p.x+p.radius*.44,p.y);c.ellipse(p.x,p.y,p.radius*.44,p.radius*.88,0,0,Math.PI*2);
      }
      c.stroke();
    }
    if(selected?.type==='synapse'){
      const edge=this.view.data.canonicalNetwork.synapses.find(edge=>edge.id===selected.id);
      if(edge)this.traceSegment(edge,0,1,'#fff',1.8);
    }
    activity.forEach(event=>{
      const edge=event.edge;
      const a=this.position(edge.from),b=this.position(edge.to);
      if(!a||!b)return;
      const digits=Math.round(255*event.head).toString(16).padStart(2,'0');
      this.traceSegment(edge,Math.max(0,event.travel-event.trail),event.travel,event.color+digits,event.key==='idle'?1:1.5);
      for(let i=0;i<event.beads;i++){
        const travel=event.travel-i*(event.key==='research'?.11:.065);
        if(travel>=0)this.flash(this.trace(a,b,travel),event.color,i?6:11,event.head*(i?.6:1));
      }
      if(event.flash)this.flash(this.trace(a,b,1),event.color,18,event.flash*.64);
    });
  }

  flash(point,color,radius,intensity){
    const c=this.context,{x,y}=point;
    const light=c.createRadialGradient(x,y,0,x,y,radius);
    light.addColorStop(0,color+Math.round(intensity*255).toString(16).padStart(2,'0'));
    light.addColorStop(1,color+'00');
    c.fillStyle=light;c.fillRect(x-radius,y-radius,radius*2,radius*2);
  }

  dispose(){
    this.overlay.remove();
    this.canvas.style.filter='';this.canvas.style.opacity='';
  }
}
