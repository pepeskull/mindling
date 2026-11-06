// Cloud projection, matte/point layering and depth fog adapted from
// aiXander/Realtime_PyAudio_FFT (MIT). See third_party/realtime-fft-LICENSE.txt.
import {spectrum,COLORS} from './activity-model.js';
const COLS=320,ROWS=180;
const vertex=`#version 300 es
precision highp float;
in vec3 position;uniform vec2 resolution;uniform float dpr;out vec3 color;out float fade;
void main(){float u=position.x,z=position.z,h=position.y;float s=1.0/(1.0+1.7*z);float y0=.90*resolution.y;float yBack=.24*resolution.y;float y=y0-(1.0-s)/(1.0-1.0/2.7)*(y0-yBack)-h*.57*resolution.y*s;float x=resolution.x*.50+(u-.5)*resolution.x*.96*s;float w=1.0/s;gl_Position=vec4((x/resolution.x*2.0-1.0)*w,(1.0-y/resolution.y*2.0)*w,(.9-1.8*s)*w,w);gl_PointSize=max(1.0,1.65*dpr*sqrt(s));vec3 blue=vec3(.54,.67,.94),green=vec3(.51,.80,.56),amber=vec3(.91,.70,.40);color=u<.5?mix(blue,green,smoothstep(.15,.5,u)):mix(green,amber,smoothstep(.5,.85,u));fade=(1.0-smoothstep(.55,1.0,z)*.92)*(.22+.78*h);}`;
const fragment=`#version 300 es
precision highp float;in vec3 color;in float fade;uniform float layer;out vec4 outputColor;
void main(){float alpha=layer<.5?.23:1.0;if(layer>.5&&layer<1.5){float r=length(gl_PointCoord-.5);alpha=1.0-smoothstep(.15,.50,r);}outputColor=vec4(color*(layer<.5?.35:1.0),alpha*fade);}`;
export class SpectrumRenderer {
 constructor(canvas,fallback,onChange){this.canvas=canvas;
  this.fallback=fallback;
  this.ctx=fallback.getContext('2d');
  this.vertices=new Float32Array(COLS*ROWS*3);
  this.indices=new Uint16Array((COLS-1)*(ROWS-1)*6);
  let n=0;
  for(let r=0;r<ROWS-1;r++)for(let c=0;c<COLS-1;c++){const i=r*COLS+c;
  this.indices.set([i,i+1,i+COLS,i+1,i+COLS+1,i+COLS],n);
  n+=6;
  }this.abort=new AbortController();
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.lost=true;onChange();},{signal:this.abort.signal});
  canvas.addEventListener('webglcontextrestored',()=>{this.lost=false;this.init();onChange();},{signal:this.abort.signal});
  this.init();
  }
 init(){try{const g=this.canvas.getContext('webgl2',{alpha:true,antialias:true,powerPreference:'low-power'});
  if(!g)return;
  this.gl=g;
  const shaders=[];
  for(const [type,source]of[[g.VERTEX_SHADER,vertex],[g.FRAGMENT_SHADER,fragment]]){const s=g.createShader(type);
  g.shaderSource(s,source);
  g.compileShader(s);
  if(!g.getShaderParameter(s,g.COMPILE_STATUS))throw Error(g.getShaderInfoLog(s));
  shaders.push(s);
  }this.program=g.createProgram();
  shaders.forEach(s=>g.attachShader(this.program,s));
  g.linkProgram(this.program);
  shaders.forEach(s=>g.deleteShader(s));
  if(!g.getProgramParameter(this.program,g.LINK_STATUS))throw Error('Cloud shader link');
  this.vao=g.createVertexArray();
  g.bindVertexArray(this.vao);
  this.buffer=g.createBuffer();
  g.bindBuffer(g.ARRAY_BUFFER,this.buffer);
  g.bufferData(g.ARRAY_BUFFER,this.vertices.byteLength,g.DYNAMIC_DRAW);
  const a=g.getAttribLocation(this.program,'position');
  g.enableVertexAttribArray(a);
  g.vertexAttribPointer(a,3,g.FLOAT,false,0,0);
  this.index=g.createBuffer();
  g.bindBuffer(g.ELEMENT_ARRAY_BUFFER,this.index);
  g.bufferData(g.ELEMENT_ARRAY_BUFFER,this.indices,g.STATIC_DRAW);
  this.uniforms=Object.fromEntries(['resolution','dpr','layer'].map(k=>[k,g.getUniformLocation(this.program,k)]));
  }catch{this.disposeGPU();
  this.gl=null;
  }}
 draw(model,now,seconds,mode){const g=this.gl,useGL=!!g&&!this.lost&&mode==='3d';
  this.canvas.hidden=!useGL;
  this.fallback.hidden=useGL;
  const w=this.fallback.width,h=this.fallback.height;
  if(useGL){let n=0;
  for(let r=0;r<ROWS;r++){const z=r/(ROWS-1),values=model.values(now-z*seconds*1000);
  for(let c=0;c<COLS;c++){const u=c/(COLS-1);
  this.vertices[n++]=u;
  this.vertices[n++]=spectrum(values,u);
  this.vertices[n++]=z;
  }}g.viewport(0,0,w,h);
  g.clearColor(0,0,0,0);
  g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);
  g.useProgram(this.program);
  g.bindVertexArray(this.vao);
  g.bindBuffer(g.ARRAY_BUFFER,this.buffer);
  g.bufferSubData(g.ARRAY_BUFFER,0,this.vertices);
  g.uniform2f(this.uniforms.resolution,w,h);
  g.uniform1f(this.uniforms.dpr,this.dpr||1);
  g.enable(g.BLEND);
  g.blendFunc(g.SRC_ALPHA,g.ONE_MINUS_SRC_ALPHA);
  g.enable(g.DEPTH_TEST);
  g.depthFunc(g.LEQUAL);
  g.enable(g.POLYGON_OFFSET_FILL);
  g.polygonOffset(1,1);
  g.uniform1f(this.uniforms.layer,0);
  g.drawElements(g.TRIANGLES,this.indices.length,g.UNSIGNED_SHORT,0);
  g.disable(g.POLYGON_OFFSET_FILL);
  g.depthMask(false);
  g.blendFunc(g.SRC_ALPHA,g.ONE);
  g.uniform1f(this.uniforms.layer,1);
  g.drawArrays(g.POINTS,0,COLS*ROWS);
  g.disable(g.DEPTH_TEST);
  g.uniform1f(this.uniforms.layer,2);
  g.drawArrays(g.LINE_STRIP,0,COLS);
  g.depthMask(true);
  return;
  }
  const c=this.ctx;
  c.clearRect(0,0,w,h);
  const grad=c.createLinearGradient(0,0,w,0);
  COLORS.forEach((color,i)=>grad.addColorStop(i/2,color));
  c.strokeStyle=grad;
  c.fillStyle=grad;
  for(let r=64;r>=0;r--){const z=r/64,s=mode==='2d'?1:1/(1+1.7*z),values=model.values(now-z*seconds*1000);
  c.globalAlpha=(1-z*.87)*.65;
  c.beginPath();
  for(let x=0;x<=128;x++){const u=x/128,height=spectrum(values,u),px=w*.5+(u-.5)*w*.96*s,py=h*.90-(1-s)/(1-1/2.7)*h*.66-height*h*.57*s-(mode==='2d'?z*h*.55:0);
  if(x===0)c.moveTo(px,py);
  else c.lineTo(px,py);
  }c.lineWidth=r===0?1.3: .6;
  c.stroke();
  }c.globalAlpha=1;
 }
 fit(w,h,dpr){this.dpr=dpr;
  for(const canvas of[this.canvas,this.fallback]){if(canvas.width!==w)canvas.width=w;
  if(canvas.height!==h)canvas.height=h;
  }}
 disposeGPU(){const g=this.gl;
  if(!g)return;
  g.useProgram(null);
  g.bindVertexArray(null);
  g.bindBuffer(g.ARRAY_BUFFER,null);
  g.bindBuffer(g.ELEMENT_ARRAY_BUFFER,null);
  g.deleteBuffer(this.buffer);
  g.deleteBuffer(this.index);
  g.deleteVertexArray(this.vao);
  g.deleteProgram(this.program);
  }
 destroy(){this.abort.abort();
  this.disposeGPU();
  }
}
