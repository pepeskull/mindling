import { acquireWebGL, releaseWebGL } from '../renderer/shared-webgl.js';
// Decorative only: no canonical neurons, memories or progression are modified.
// Borrow the existing context while the Dashboard scheduler is paused.
export class OnboardingSphere {
  constructor(host,three=null){
    this.host=host;this.abort=new AbortController();this.motion=matchMedia('(prefers-reduced-motion: reduce)');this.stage=0;this.target=0;this.pointer={x:0,y:0};this.time=0;this.last=null;
    if(three){try{this.mountThree(three);}catch{this.releaseThree();}}
    if(!this.renderer){this.canvas=document.createElement('canvas');this.context=this.canvas.getContext('2d');host.append(this.canvas);}
    this.canvas.setAttribute('aria-hidden','true');
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);
    host.addEventListener('pointermove',event=>{const rect=host.getBoundingClientRect();this.pointer.x=(event.clientX-rect.left)/Math.max(1,rect.width)-.5;this.pointer.y=(event.clientY-rect.top)/Math.max(1,rect.height)-.5;if(!this.motion.matches)this.schedule();},{signal:this.abort.signal});
    host.addEventListener('pointerleave',()=>{this.pointer.x=0;this.pointer.y=0;},{signal:this.abort.signal});
    document.addEventListener('visibilitychange',()=>{this.stop();if(!document.hidden)this.schedule();},{signal:this.abort.signal});
    window.addEventListener('pagehide',()=>this.stop(),{signal:this.abort.signal});
    window.addEventListener('pageshow',()=>this.schedule(),{signal:this.abort.signal});
    this.motion.addEventListener('change',()=>{this.stop();this.paint();this.schedule();},{signal:this.abort.signal});this.resize();
  }
  mountThree(T){
    this.T=T;this.renderer=acquireWebGL(T);this.returnHost=this.renderer.domElement.parentElement;this.previousRatio=this.renderer.getPixelRatio();this.previousSize=this.renderer.getSize(new T.Vector2());this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
    this.canvas=this.renderer.domElement;this.host.append(this.canvas);this.scene=new T.Scene();this.camera=new T.PerspectiveCamera(38,1,.1,10);this.camera.position.z=3.7;
    this.uniforms={uTime:{value:0},uStage:{value:0},uPointer:{value:new T.Vector2()}};
    this.geometry=new T.SphereGeometry(1,64,40);this.material=new T.ShaderMaterial({uniforms:this.uniforms,
      vertexShader:`uniform float uTime; uniform float uStage; uniform vec2 uPointer; varying vec3 vNormal; varying vec3 vPoint;
      void main(){vec3 p=position;float t=uTime*.38;float wave=sin(p.x*4.8+t)*cos(p.y*4.1-t*.7)+sin(p.z*5.6+p.y*2.5+t*.8)*.55;
      p+=normal*(wave*.033+sin(t*1.7)*.015);p.x+=uPointer.x*.035;p.y-=uPointer.y*.035;
      vPoint=p;vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}`,
      fragmentShader:`precision highp float;uniform float uTime;uniform float uStage;varying vec3 vNormal;varying vec3 vPoint;
      void main(){vec3 n=normalize(vNormal);float flow=sin(vPoint.x*4.0+vPoint.y*3.4+sin(vPoint.z*4.0+uTime*.23)+uTime*.32+uStage*.32)*.5+.5;
      vec3 purple=vec3(.27,.07,.63),pink=vec3(.94,.13,.58);vec3 color=mix(purple,pink,flow);
      float rim=pow(1.0-abs(n.z),2.0);float light=max(dot(n,normalize(vec3(-.5,.75,1.0))),0.0);float highlight=pow(light,23.0);
      color*=.48+.65*light;color+=vec3(.64,.30,.83)*rim*.65;color=mix(color,vec3(1.0,.82,.95),highlight*.82);
      float band=pow(.5+.5*sin(vPoint.y*5.0+vPoint.x*3.0+sin(uTime*.22+vPoint.z*4.0)),5.0);color+=vec3(.11,.035,.14)*band;
      gl_FragColor=vec4(color,1.0);}`});this.mesh=new T.Mesh(this.geometry,this.material);this.scene.add(this.mesh);
  }
  setStep(step){this.target=step;if(this.motion.matches)this.stage=step;this.paint();this.schedule();}
  resize(){const rect=this.host.getBoundingClientRect();this.width=Math.max(1,rect.width);this.height=Math.max(1,rect.height);if(this.renderer){this.renderer.setSize(this.width,this.height,false);this.camera.aspect=this.width/this.height;this.camera.updateProjectionMatrix();}else{const ratio=Math.min(devicePixelRatio,1.5);this.canvas.width=this.width*ratio;this.canvas.height=this.height*ratio;this.context?.setTransform(ratio,0,0,ratio,0,0);}this.paint();this.schedule();}
  paint(){
    if(this.disposed||document.hidden)return;const time=this.motion.matches?0:this.time;
    if(this.renderer){this.uniforms.uTime.value=time;this.uniforms.uStage.value=this.stage;this.uniforms.uPointer.value.set(this.motion.matches?0:this.pointer.x,this.motion.matches?0:this.pointer.y);this.mesh.rotation.y=Math.sin(time*.11)*.15;this.renderer.render(this.scene,this.camera);return;}
    const c=this.context;if(!c)return;const x=this.width/2+(this.motion.matches?0:this.pointer.x*4),y=this.height/2+(this.motion.matches?0:this.pointer.y*4),r=Math.min(this.width,this.height)*.39*(1+Math.sin(time*.65)*.012);
    c.clearRect(0,0,this.width,this.height);c.save();c.beginPath();
    for(let i=0;i<=100;i++){const angle=i/100*Math.PI*2,rad=r*(1+.018*Math.sin(angle*5+time*.5)+.012*Math.cos(angle*3-time*.4));const px=x+Math.cos(angle)*rad,py=y+Math.sin(angle)*rad;if(!i)c.moveTo(px,py);else c.lineTo(px,py);}c.closePath();c.clip();
    const base=c.createRadialGradient(x-r*.3,y-r*.5,r*.04,x,y,r);base.addColorStop(0,'#ffc4ec');base.addColorStop(.28,'#d645b3');base.addColorStop(.65,'#8a28ad');base.addColorStop(1,'#3a166d');c.fillStyle=base;c.fillRect(x-r*1.1,y-r*1.1,r*2.2,r*2.2);
    for(let i=0;i<4;i++){const px=x+Math.sin(time*.22+i*1.7)*r*.65,py=y+Math.cos(time*.19+i*2.1)*r*.65,g=c.createRadialGradient(px,py,0,px,py,r*.95);g.addColorStop(0,i%2?'rgba(69,54,196,.7)':'rgba(244,72,158,.5)');g.addColorStop(1,'rgba(90,10,140,0)');c.fillStyle=g;c.fillRect(x-r*1.1,y-r*1.1,r*2.2,r*2.2);}c.restore();
  }
  schedule(){if(!this.disposed&&!document.hidden&&!this.motion.matches&&this.frame==null)this.frame=requestAnimationFrame(this.tick);}
  tick=now=>{this.frame=null;if(this.disposed||document.hidden)return;if(this.last===null)this.last=now;if(now-this.last>=32){this.time+=Math.min(.08,(now-this.last)/1000);this.last=now;this.stage+=(this.target-this.stage)*.08;this.paint();}this.schedule();};
  stop(){if(this.frame!=null)cancelAnimationFrame(this.frame);this.frame=null;this.last=null;}
  releaseThree(){if(this.renderer){this.geometry?.dispose();this.material?.dispose();if(this.returnHost&&this.canvas?.parentElement===this.host)this.returnHost.append(this.canvas);if(this.previousSize){this.renderer.setPixelRatio(this.previousRatio);this.renderer.setSize(this.previousSize.x,this.previousSize.y,false);}releaseWebGL(this.renderer);this.renderer=null;}}
  destroy(){this.disposed=true;this.stop();this.abort.abort();this.observer?.disconnect();this.releaseThree();this.host.replaceChildren();}
}
