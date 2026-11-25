import { BUDGET } from '../../preview/evolution-model.js';

function makeTexture(T){
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=128;
  const c=canvas.getContext('2d');
  const gradient=c.createRadialGradient(64,64,0,64,64,63);
  gradient.addColorStop(0,'rgba(255,255,255,1)');
  gradient.addColorStop(.12,'rgba(255,255,255,.84)');
  gradient.addColorStop(.39,'rgba(255,255,255,.23)');
  gradient.addColorStop(.72,'rgba(255,255,255,.035)');
  gradient.addColorStop(1,'rgba(255,255,255,0)');
  c.fillStyle=gradient;c.fillRect(0,0,128,128);
  return new T.CanvasTexture(canvas);
}

const neutral=0xffffff;
function change(material, opacity, depthWrite){
  const transparent=opacity<1;
  if(material.transparent!==transparent){material.transparent=transparent;material.needsUpdate=true;}
  material.opacity=opacity;material.depthWrite=depthWrite;
}

export class WebGLLook {
  constructor(T,scene,stageView){
    this.T=T;this.scene=scene;this.stageView=stageView;
    this.root=scene.children.find(object=>object.isGroup);
    this.overlay=new T.Group();this.root.add(this.overlay);
    this.texture=makeTexture(T);
    this.objects=new Map();this.lights=[];this.wires=new Map();this.nodes=new Map();this.paths=new Map();
    this.point=new T.Vector3();this.to=new T.Vector3();
    if(stageView.seed)this.captureSeed();else this.captureEvolution(stageView.scene);
    this.tracks=[];
  }

  capture(object,kind){
    if(!object)return;
    this.objects.set(object,{kind,original:object.material,variant:object.material.clone()});
  }

  captureSeed(){
    this.scene.traverse(object=>{
      if(object.isLight){this.lights.push([object,object.color.clone()]);return;}
      const pick=object.userData.selection;
      if(pick?.type==='neuron'){this.nodes.set(pick.id,object);this.capture(object,'soma');}
      else if(pick?.type==='synapse')this.capture(object,'synapse');
      else if(object.isSprite){
        const data=object.userData;
        if(data.route)this.paths.set(data.route.synapse,data.curve);
        this.capture(object,data.route?'pulse':Number.isFinite(data.phase)?'halo':'accent');
      }else if(object.isLineSegments)this.capture(object,'detail');
      else if(object.isPoints)this.capture(object,'ambient');
      else if(object.isMesh)this.capture(object,'core');
    });
  }

  captureEvolution(view){
    this.evolution=view;
    this.originalInstanceCount=view.soma.count;
    this.scene.children.filter(o=>o.isLight).forEach(light=>this.lights.push([light,light.color.clone()]));
    for(const [key,kind] of [['soma','soma'],['fibers','detail'],['links','detail'],['pulses','pulse'],['discovery','accent'],
        ['canonicalCores','core'],['canonicalFibers','canonical']]) this.capture(view[key],kind);

    const T=this.T, count=view.morph.count;
    const glowData=new T.BufferGeometry();
    glowData.setAttribute('position',new T.BufferAttribute(view.buffers.positions.subarray(0,count*3),3));
    glowData.setAttribute('radius',new T.BufferAttribute(view.buffers.radii.subarray(0,count),1));
    this.glow=new T.Points(glowData,new T.ShaderMaterial({
      transparent:true,depthWrite:false,blending:T.AdditiveBlending,
      uniforms:{density:{value:1},zoom:{value:1},haloRadius:{value:1},haloBrightness:{value:.25}},
      vertexShader:`
        attribute float radius;
        uniform float density;
        uniform float zoom;
        uniform float haloRadius;
        void main(){
          vec4 p=modelViewMatrix*vec4(position,1.0);
          gl_Position=projectionMatrix*p;
          gl_PointSize=clamp(radius*zoom*haloRadius*density*projectionMatrix[1][1]*(2.2/max(gl_Position.w,1.0)),1.0,64.0);
        }`,
      fragmentShader:`
        uniform float haloBrightness;
        void main(){
          float d=length(gl_PointCoord-.5)*2.0;
          float halo=max(0.0,exp(-5.5*d*d)-.005);
          gl_FragColor=vec4(1.0,1.0,1.0,haloBrightness*halo);
        }`
    }));
    this.glow.frustumCulled=false;this.overlay.add(this.glow);
    // Render only the existing synapse portion of the stage's line buffer.
    const edgeGeometry=new T.BufferGeometry();
    edgeGeometry.setAttribute('position',new T.BufferAttribute(view.buffers.lines,3));
    this.stageEdges=new T.LineSegments(edgeGeometry,new T.LineBasicMaterial({color:neutral,transparent:true,opacity:.29,depthWrite:false}));
    this.stageEdges.frustumCulled=false;this.overlay.add(this.stageEdges);
    const edgeColors=new Float32Array(view.canonicalNetwork.synapses.length*6);
    this.edgeColors=new T.BufferAttribute(edgeColors,3);
    view.canonicalFibers.geometry.setAttribute('color',this.edgeColors);
  }

  sprite(){
    const sprite=new this.T.Sprite(new this.T.SpriteMaterial({map:this.texture,color:neutral,transparent:true,depthWrite:false,blending:this.T.AdditiveBlending}));
    sprite.visible=false;
    this.overlay.add(sprite);
    return sprite;
  }

  wireframe(mesh){
    if(this.wires.has(mesh))return this.wires.get(mesh);
    const T=this.T;
    let wire;
    if(mesh.isInstancedMesh){
      const material=new T.MeshBasicMaterial({color:neutral,transparent:true,opacity:.24,wireframe:true,depthWrite:false});
      wire=new T.InstancedMesh(mesh.geometry,material,this.originalInstanceCount);
      wire.instanceMatrix.setUsage(T.DynamicDrawUsage);
      wire.frustumCulled=false;
    }else{
      const geometry=new T.WireframeGeometry(mesh.geometry);
      wire=new T.LineSegments(geometry,new T.LineBasicMaterial({color:neutral,transparent:true,opacity:.25,depthWrite:false}));
    }
    mesh.add(wire);
    wire.renderOrder=2;
    this.wires.set(mesh,wire);
    return wire;
  }

  nodePosition(id,out){
    if(this.evolution){
      const index=this.evolution.canonicalIndices.get(id);
      if(index!==undefined)return out.fromArray(this.evolution.canonicalPositions,index*3);
    }else if(this.nodes.has(id))return out.copy(this.nodes.get(id).position);
    return null;
  }

  edgePoint(edge,t,out){
    const curve=this.paths.get(edge.id);
    if(curve)return curve.getPoint(t,out);
    const from=this.nodePosition(edge.from,out);
    const to=this.nodePosition(edge.to,this.to);
    return from&&to?from.lerp(to,t):null;
  }

  track(index){
    if(this.tracks[index])return this.tracks[index];
    const T=this.T,points=new Float32Array(14*3),geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.BufferAttribute(points,3));
    const line=new T.Line(geometry,new T.LineBasicMaterial({transparent:true,depthWrite:false,blending:T.AdditiveBlending}));
    line.frustumCulled=false;line.renderOrder=4;this.overlay.add(line);
    const track={line,sparks:Array.from({length:3},()=>this.sprite()),glow:this.sprite()};
    this.tracks[index]=track;
    return track;
  }

  apply(mode,look,frame,selected,renderer){
    for(const [light] of this.lights)light.color.setHex(neutral);
    const xray=mode==='xray',edgeMode=mode==='synapses';
    for(const [object,{kind,variant:m}] of this.objects){
      const previous=object.material.opacity;
      object.material=m;
      m.color?.setHex(neutral);
      if(kind==='soma'){
        const picked=selected?.type==='neuron'&&object.userData.selection?.id===selected.id;
        m.color.setHex(picked?neutral:look.surface);m.emissive.setHex(neutral);
        m.emissiveIntensity=look.emissive+(picked?.52:0);m.metalness=.18;
        change(m,look.alpha,!xray&&look.alpha===1);
        if(xray||this.wires.has(object))this.wireframe(object).visible=xray;
      }else if(kind==='halo'){
        m.map=this.texture;m.opacity=look.glow+Math.max(0,previous-.10)*.35;
        if(!this.haloSizes)this.haloSizes=new WeakMap();
        if(!this.haloSizes.has(object))this.haloSizes.set(object,object.scale.x);
        object.scale.setScalar(this.haloSizes.get(object)*look.radius*1.37);
      }else if(kind==='synapse'){
        const edge=this.stageView.data.canonicalNetwork.synapses.find(item=>item.id===object.userData.selection.id);
        const weight=Number.isFinite(edge?.strength)?Math.min(1,Math.max(0,edge.strength)):null;
        const picked=selected?.type==='synapse'&&selected.id===edge?.id;
        m.opacity=picked?1:edgeMode?(weight===null?.67:.49+.41*weight):look.fibers*1.6;
        m.depthWrite=false;
      }else if(kind==='core'){
        m.opacity=look.core;
        if(object.isPoints){m.map=this.texture;m.size=.092;m.depthTest=false;}
      }else if(kind==='detail')m.opacity=look.detail;
      else if(kind==='ambient')m.opacity=.18;
      else{
        if(object.isSprite||object.isPoints)m.map=this.texture;
        if(kind==='pulse'&&object.isPoints)m.opacity=mode==='activity'?.10:.55;
        if(kind==='pulse'&&object.isSprite&&mode==='activity')m.opacity=previous*.34;
      }
    }
    if(this.evolution)this.applyEvolution(mode,look,selected,renderer);
    this.applyActivity(frame);
  }

  applyEvolution(mode,look,selected,renderer){
    const view=this.evolution,{glow,stageEdges}=this;
    glow.material.uniforms.haloBrightness.value=look.glow;
    glow.material.uniforms.zoom.value=this.root.scale.x;
    glow.material.uniforms.density.value=view.height*renderer.getPixelRatio();
    glow.material.uniforms.haloRadius.value=look.radius;
    glow.geometry.attributes.position.needsUpdate=true;
    glow.geometry.attributes.radius.needsUpdate=true;
    stageEdges.visible=mode==='synapses'||mode==='xray';
    const count=view.morph.target.edges.length*BUDGET.curveSteps;
    stageEdges.geometry.setDrawRange(Math.max(0,view.centralSegments-count)*2,count*2);
    stageEdges.geometry.attributes.position.needsUpdate=true;
    stageEdges.material.opacity=mode==='synapses'?.42:.22;
    view.fibers.material.opacity=look.detail*.44;
    // The isolated fixture has no remote brains. Skip the reserved empty slots.
    const hasRemotes=view.morph.stage===7&&view.buffers.radii.subarray(BUDGET.neurons).some(radius=>radius>.001);
    view.soma.count=hasRemotes?this.originalInstanceCount:view.morph.count;
    const wire=this.wires.get(view.soma);
    if(wire){
      wire.count=view.soma.count;
      if(wire.visible){
        wire.instanceMatrix.array.set(view.soma.instanceMatrix.array.subarray(0,wire.count*16));
        wire.instanceMatrix.needsUpdate=true;
      }
    }
    view.soma.instanceColor.array.fill(1);
    view.soma.instanceColor.needsUpdate=true;
    view.canonicalCores.geometry.attributes.color.array.fill(1);
    view.canonicalCores.geometry.attributes.color.needsUpdate=true;
    const material=view.canonicalFibers.material;
    if(!material.vertexColors){material.vertexColors=true;material.needsUpdate=true;}
    material.opacity=mode==='synapses'?.90:Math.max(.27,look.fibers);
    view.canonicalNetwork.synapses.forEach((edge,index)=>{
      const picked=selected?.type==='synapse'&&selected.id===edge.id;
      const strength=Number.isFinite(edge.strength)?Math.min(1,Math.max(0,edge.strength)):null;
      const value=picked?1:mode==='synapses'?(strength===null?.46:.30+strength*.43):.51;
      for(let i=0;i<2;i++)this.edgeColors.setXYZ(index*2+i,value,value,value);
    });
    this.edgeColors.needsUpdate=true;
    if(selected?.type==='synapse'){
      const edge=view.canonicalNetwork.synapses.find(item=>item.id===selected.id);
      if(edge){
        if(!this.pickedEdge){
          const T=this.T,geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(new Float32Array(6),3));
          this.pickedEdge=new T.Line(geo,new T.LineBasicMaterial({color:neutral,transparent:true,opacity:.96,depthTest:false,depthWrite:false}));
          this.pickedEdge.frustumCulled=false;this.pickedEdge.renderOrder=9;this.overlay.add(this.pickedEdge);
        }
        const positions=this.pickedEdge.geometry.attributes.position;
        this.edgePoint(edge,0,this.point)?.toArray(positions.array,0);
        this.edgePoint(edge,1,this.point)?.toArray(positions.array,3);
        positions.needsUpdate=true;this.pickedEdge.visible=true;
      }
    }else if(this.pickedEdge)this.pickedEdge.visible=false;
  }

  applyActivity(frame){
    this.tracks.forEach(({line,sparks,glow})=>{line.visible=glow.visible=false;sparks.forEach(sprite=>sprite.visible=false);});
    frame.forEach((event,index)=>{
      const edge=event.edge;
      const track=this.track(index);
      const {line,sparks,glow}=track;
      line.visible=true;line.material.color.set(event.color);
      line.material.opacity=(event.key==='idle'?.30:event.key==='research'?.92:.76)*event.head;
      const positions=line.geometry.attributes.position;
      for(let i=0;i<positions.count;i++){
        const progress=event.travel-event.trail*(1-i/(positions.count-1));
        this.edgePoint(edge,Math.max(0,progress),this.point)?.toArray(positions.array,i*3);
      }
      positions.needsUpdate=true;
      for(let i=0;i<event.beads;i++){
        const progress=event.travel-i*(event.key==='research'?.105:.066);
        const sprite=sparks[i];
        sprite.visible=progress>=0;
        if(!sprite.visible)continue;
        this.edgePoint(edge,progress,sprite.position);
        sprite.material.color.set(event.color);sprite.material.opacity=event.head*(i? .67:.96);
        sprite.scale.setScalar((event.key==='idle'?.16:.23)*(i? .64:1));
        sprite.renderOrder=5;
      }
      glow.visible=event.flash>0;
      if(glow.visible){
        this.edgePoint(edge,1,glow.position);
        glow.material.color.set(event.color);
        glow.material.opacity=event.flash*(event.key==='idle'?.31:.58);
        glow.scale.setScalar(.19+event.flash*.22);
      }
    });
  }

  reset(){
    this.overlay.visible=false;
    if(this.evolution)this.evolution.soma.count=this.originalInstanceCount;
    for(const [object,{original}] of this.objects){
      object.material=original;
      if(this.haloSizes?.has(object))object.scale.setScalar(this.haloSizes.get(object));
    }
    for(const [light,color] of this.lights)light.color.copy(color);
    for(const wire of this.wires.values())wire.visible=false;
  }

  dispose(){
    this.reset();
    if(this.evolution)this.evolution.canonicalFibers.geometry.deleteAttribute('color');
    for(const [mesh,wire] of this.wires){
      mesh.remove(wire);wire.material.dispose();
      if(wire.isInstancedMesh)wire.dispose();else wire.geometry.dispose();
    }
    this.overlay.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});
    this.overlay.removeFromParent();
    for(const {variant} of this.objects.values())variant.dispose();
    this.texture.dispose();
  }
}
