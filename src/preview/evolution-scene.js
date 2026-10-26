import { BrainIdentities } from '../network/brain-identity.js';
import { SceneInteraction } from "../renderer/scene-interaction.js";
import { NEURAL_SEED_MORPHOLOGY, seededValue } from "../renderer/neural-morphology.js";
import { BUDGET, generateStage, Morphology, smooth } from "./evolution-model.js";
import { previewFraming, morphologyRadius } from '../renderer/scene-framing.js';

const COLORS = [0x9bd5c5, 0x7daebe, 0xb7c9de, 0x9abfcb, 0xc0b3d2, 0x9bd1ba];
export const REMOTE_SCALE = .32;
export const REMOTE_CENTERS = [[-3.05, .45, 0], [2.85, 1.15, -.4], [2.65, -1.4, .2]];
const MAX_SEGMENTS = BUDGET.edges * BUDGET.curveSteps + BUDGET.neurons * 18 + BUDGET.remoteBrains * BUDGET.remoteSegments;
const MAX_NODES = BUDGET.neurons + BUDGET.remoteBrains * BUDGET.remoteNeurons;

function curve(out, offset, ax, ay, az, bx, by, bz, t, bend) {
  const arc = 4 * t * (1 - t);
  out[offset] = ax + (bx - ax) * t;
  out[offset + 1] = ay + (by - ay) * t + arc * bend;
  out[offset + 2] = az + (bz - az) * t + arc * bend * .5;
}

// Bounded shared render buffers: both backends display the same morphology and protocol.
export class RenderBuffers {
  positions = new Float32Array(MAX_NODES * 3);
  radii = new Float32Array(MAX_NODES);
  regions = new Uint8Array(MAX_NODES);
  lines = new Float32Array(MAX_SEGMENTS * 6);
  networkLines = new Float32Array(3 * 32 * 6);
  pulses = new Float32Array(BUDGET.impulses * 3);
  pulseCount = 0; segmentCount = 0; networkCount = 0;
  identities=new BrainIdentities();
  remote=REMOTE_CENTERS.map(center=>({center}));
  focusedId=null;
  scratch = new Float32Array(6);

  rebuild(morph) {
    this.positions.set(morph.positions); this.radii.set(morph.radii);
    this.segmentCount = 0;
    const nodes = morph.target.nodes;
    for (let i = 0; i < morph.count; i++) {
      this.regions[i] = nodes[i]?.region || 0;
      const x = this.positions[i * 3], y = this.positions[i * 3 + 1], z = this.positions[i * 3 + 2];
      const length = this.radii[i] * (3 + morph.stage * .17);
      for (let branch = 0; branch < NEURAL_SEED_MORPHOLOGY.primaryDendrites; branch++) {
        const angle = branch / 6 * Math.PI * 2 + seededValue(i * 31 + branch);
        const dx = Math.cos(angle) * length, dy = Math.sin(angle) * length, dz = (seededValue(i + branch * 7) - .5) * length;
        this.segment(x, y, z, x + dx, y + dy, z + dz);
        if (morph.stage >= 3) {
          this.segment(x + dx * .6, y + dy * .6, z + dz * .6, x + dx - dy * .35, y + dy + dx * .35, z + dz);
          if (morph.stage >= 5) this.segment(x + dx * .75, y + dy * .75, z + dz * .75, x + dx + dy * .25, y + dy - dx * .25, z + dz * 1.3);
        }
      }
    }
    for (const contour of morph.target.contours || []) {
      const growth = smooth(morph.progress);
      for (let i = 1; i < contour.length; i++) {
        const a = contour[i - 1], b = contour[i];
        this.segment(a[0], a[1], a[2], a[0] + (b[0] - a[0]) * growth, a[1] + (b[1] - a[1]) * growth, a[2] + (b[2] - a[2]) * growth);
      }
    }
    for (const [a, b] of morph.target.edges) {
      const k = a * 3, j = b * 3;
      const grow = morph.progress === 1 ? 1 : smooth(morph.progress * 1.8 - .3);
      this.path(this.positions[k], this.positions[k + 1], this.positions[k + 2], this.positions[j], this.positions[j + 1], this.positions[j + 2], .13 + (a % 4) * .055, grow);
    }
  }
  segment(ax, ay, az, bx, by, bz) {
    if(this.segmentCount>=MAX_SEGMENTS)return;
    const k = this.segmentCount++ * 6;
    this.lines[k] = ax; this.lines[k + 1] = ay; this.lines[k + 2] = az; this.lines[k + 3] = bx; this.lines[k + 4] = by; this.lines[k + 5] = bz;
  }
  path(ax, ay, az, bx, by, bz, bend, grow = 1) {
    for (let j = 0; j < BUDGET.curveSteps; j++) {
      curve(this.scratch, 0, ax, ay, az, bx, by, bz, j / BUDGET.curveSteps * grow, bend);
      curve(this.scratch, 3, ax, ay, az, bx, by, bz, (j + 1) / BUDGET.curveSteps * grow, bend);
      this.segment(...this.scratch);
    }
  }
  writeBrain(brain,start,center,scale,visibility,elapsed,reduced){
    for(let i=0;i<brain.radii.length;i++){
      const k=(start+i)*3,j=i*3;
      for(let axis=0;axis<3;axis++)this.positions[k+axis]=center[axis]+brain.positions[j+axis]*scale;
      const breath=reduced?1:1+.04*Math.sin(elapsed+i+brain.seed%100);
      this.radii[start+i]=brain.radii[i]*scale*visibility*breath;this.regions[start+i]=brain.regions[i];
    }
    if(!visibility)return;
    const lines=brain.lines;
    for(let k=0;k<lines.length;k+=6)this.segment(center[0]+lines[k]*scale,center[1]+lines[k+1]*scale,center[2]+lines[k+2]*scale,
      center[0]+(lines[k]+(lines[k+3]-lines[k])*visibility)*scale,center[1]+(lines[k+1]+(lines[k+4]-lines[k+1])*visibility)*scale,center[2]+(lines[k+2]+(lines[k+5]-lines[k+2])*visibility)*scale);
  }
  animate(morph, network, elapsed, reduced, hideCenter = false) {
    this.pulseCount=0;this.networkCount=0;
    const focused=this.focusedId?this.identities.get(this.focusedId):null;
    if(focused){this.segmentCount=0;this.radii.fill(0,0,BUDGET.neurons);this.writeBrain(focused,0,[0,0,0],1,1,elapsed,reduced);}
    if(hideCenter&&!focused){this.segmentCount=0;this.radii.fill(0,0,BUDGET.neurons);}
    const edges=focused?focused.edges:morph.target.edges;
    if(!focused&&!reduced&&!hideCenter&&edges.length)for(let i=0;i<Math.min(24,morph.stage*3);i++){
      const [a,b,bend]=edges[(Math.floor(elapsed/3)*13+i*17)%edges.length],k=a*3,j=b*3;
      curve(this.pulses,this.pulseCount++*3,this.positions[k],this.positions[k+1],this.positions[k+2],this.positions[j],this.positions[j+1],this.positions[j+2],(elapsed/3+i/7)%1,bend??(.13+(a%4)*.055));
    }
    this.remote.forEach(({center},index)=>{
      const peer=network.peers[index],visibility=morph.stage===7&&peer.stage===7?peer.visibility*network.fade:0,start=BUDGET.neurons+index*BUDGET.remoteNeurons;
      if(!peer.id||!visibility){this.radii.fill(0,start,start+BUDGET.remoteNeurons);return;}
      this.writeBrain(this.identities.get(peer.id),start,center,REMOTE_SCALE,visibility,elapsed,reduced);
      const length=peer.link*network.fade;
      for(let s=0;s<32&&length>0;s++){const k=this.networkCount++*6;curve(this.networkLines,k,0,0,0,...center,s/32*length,.7);curve(this.networkLines,k+3,0,0,0,...center,(s+1)/32*length,.7);}
      if(!reduced)for(const progress of [peer.outgoing,peer.incoming])if(progress>=0&&this.pulseCount<BUDGET.impulses)curve(this.pulses,this.pulseCount++*3,0,0,0,...center,progress,.7);
    });
  }

}

export class EvolutionScene {
  constructor({ three = null, interaction = new SceneInteraction(), reduced = false, provider = generateStage, fitDashboard = false, originalFraming = false } = {}) {
    this.focus=[0,0,0];this.focusScale=1;
    this.fitDashboard = fitDashboard; this.three = three; this.interaction = interaction; this.reduced = reduced;
    this.useSharedFraming = fitDashboard && !originalFraming;
    this.morph = new Morphology(17, provider); this.buffers = new RenderBuffers(); this.centralSegments = 0;
    // One envelope covers all seven stages, avoiding camera jumps during morphs.
    this.framingRadius = Math.max(...Array.from({length:7},(_,i)=>morphologyRadius(provider(i+1))));
  }
  mount(host) {
    this.host = host;
    if (this.three) this.mountThree();
    else { this.canvas = document.createElement('canvas'); this.context = this.canvas.getContext('2d'); if (!this.context) throw new Error('Canvas unavailable'); host.append(this.canvas); }
    this.canvas.dataset.previewBackend = this.three ? 'three' : 'canvas';
    this.canvas.setAttribute('aria-hidden', 'true'); this.buffers.rebuild(this.morph); this.centralSegments = this.buffers.segmentCount;
  }
  mountThree() {
    const T = this.three;
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); this.canvas = this.renderer.domElement; this.host.append(this.canvas);
    this.scene = new T.Scene(); this.root = new T.Group(); this.scene.add(this.root);
    this.camera = this.useSharedFraming ? new T.OrthographicCamera(-1,1,1,-1,.1,40) : new T.PerspectiveCamera(36, 1, .1, 40); this.camera.position.z = 9;
    this.scene.add(new T.AmbientLight(0xd5eee8, 2)); const light = new T.DirectionalLight(0xffffff, 2.5); light.position.set(-2, 3, 5); this.scene.add(light);
    this.soma = new T.InstancedMesh(new T.IcosahedronGeometry(1, 1), new T.MeshStandardMaterial({ color: 0xffffff, roughness: .38, metalness: .1, emissive: 0x29423c, emissiveIntensity: .5 }), MAX_NODES);
    this.soma.instanceMatrix.setUsage(T.DynamicDrawUsage); this.soma.frustumCulled = false; this.root.add(this.soma);
    this.matrix = new T.Object3D(); this.color = new T.Color();
    this.fibers = this.lineObject(this.buffers.lines, 0x8fc9bb, .26);
    this.links = this.lineObject(this.buffers.networkLines, 0x91c7df, .7);
    const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.BufferAttribute(this.buffers.pulses, 3).setUsage(T.DynamicDrawUsage));
    this.pulses = new T.Points(geometry, new T.PointsMaterial({ color: 0xe1fff4, size: .075, transparent: true, opacity: .9, depthWrite: false })); this.pulses.frustumCulled = false; this.root.add(this.pulses);
    this.discovery = new T.Mesh(new T.RingGeometry(.98, 1, 80), new T.MeshBasicMaterial({ color: 0x8ccbbd, transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false })); this.root.add(this.discovery);
  }
  lineObject(array, color, opacity) {
    const T = this.three, geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.BufferAttribute(array, 3).setUsage(T.DynamicDrawUsage));
    const object = new T.LineSegments(geometry, new T.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false })); object.frustumCulled = false; this.root.add(object); return object;
  }
  focusBrain(id){
    if(id)this.buffers.identities.get(id);
    this.buffers.focusedId=id;
    if(!id){this.buffers.rebuild(this.morph);this.centralSegments=this.buffers.segmentCount;}
  }
  select(stage) { this.morph.select(stage, this.reduced); this.buffers.rebuild(this.morph); this.centralSegments = this.buffers.segmentCount; }
  resize(width, height) {
    if (!width || !height) return; this.width = width; this.height = height;
    if (this.useSharedFraming) this.updateFraming();
    if (this.three) { this.renderer.setSize(width, height, false); this.camera.aspect = width / height;
      if(this.fitDashboard&&!this.useSharedFraming){
        // Original preview perspective/portrait framing, before Life System 2.0.
        const framing=width<height?Math.min(1,width/height*1.3):1;
        this.camera.position.z=Math.max(9,4.2*framing/(Math.tan(Math.PI/10)*this.camera.aspect));
      }
      this.camera.updateProjectionMatrix(); }
    else { const dpr = Math.min(devicePixelRatio, 1.5); this.canvas.width = width * dpr; this.canvas.height = height * dpr; this.context.setTransform(dpr, 0, 0, dpr, 0, 0); }
  }
  render(elapsed, delta, network) {
    if (this.morph.progress < 1) { this.morph.tick(delta); this.buffers.rebuild(this.morph); this.centralSegments = this.buffers.segmentCount; }
    this.buffers.segmentCount = this.centralSegments; this.buffers.animate(this.morph, network, elapsed, this.reduced, this.hideCanonicalCenter);
    if(this.useSharedFraming)this.updateFraming(network);
    if (this.three) this.renderThree(elapsed, network); else this.renderCanvas(elapsed, network);
  }
  renderThree(elapsed, network) {
    const b = this.buffers;
    this.root.rotation.set(this.interaction.rotation.x, this.interaction.rotation.y, 0);
    const framing = this.width < this.height ? Math.min(1, this.width / this.height * 1.3) : 1;
    this.root.scale.setScalar(this.focusScale*(this.useSharedFraming?this.framing.zoom:this.interaction.zoom*framing) * (this.reduced ? 1 : 1 + .008 * Math.sin(elapsed)));
    const shift=new this.three.Vector3(...this.focus).applyEuler(this.root.rotation).multiplyScalar(-this.root.scale.x);this.root.position.copy(shift);
    for (let i = 0; i < MAX_NODES; i++) {
      this.matrix.position.fromArray(b.positions, i * 3); this.matrix.scale.setScalar(b.radii[i]); this.matrix.updateMatrix(); this.soma.setMatrixAt(i, this.matrix.matrix);
      this.color.setHex(this.selectedCanonical && this.canonicalMapping?.[i] === this.selectedCanonical ? 0xffffff : COLORS[b.regions[i]]); this.soma.setColorAt(i, this.color);
    }
    this.soma.instanceMatrix.needsUpdate = true; this.soma.instanceColor.needsUpdate = true;
    for (const [object, count] of [[this.fibers, b.segmentCount * 2], [this.links, b.networkCount * 2], [this.pulses, b.pulseCount]]) { object.geometry.setDrawRange(0, count); object.geometry.attributes.position.needsUpdate = true; }
    this.discovery.visible = network.state === 'DISCOVERING' && !this.reduced;
    this.discovery.scale.setScalar(1 + network.elapsed * 1.6); this.discovery.material.opacity = Math.max(0, .35 - network.elapsed * .16);
    this.renderer.render(this.scene, this.camera);
  }
  project(array, k, out, offset = 0) {
    const ry = this.interaction.rotation.y, rx = this.interaction.rotation.x;
    const ax=array[k]-this.focus[0],ay=array[k+1]-this.focus[1],az=array[k+2]-this.focus[2];
    const x = ax * Math.cos(ry) + az * Math.sin(ry), z = -ax * Math.sin(ry) + az * Math.cos(ry);
    const y = ay * Math.cos(rx) - z * Math.sin(rx);
    const scale = this.focusScale*(this.useSharedFraming ? this.framing.unit * this.framing.zoom : Math.min(this.width / 7.8, this.height / 5.3) * this.interaction.zoom);
    out[offset] = this.width / 2 + x * scale; out[offset + 1] = this.height / 2 - y * scale;
    return scale;
  }
  updateFraming(network) {
    const networkWeight=network ? smooth(network.elapsed/1.2)*network.fade : 0;
    const radius=this.framingRadius+(4.2-this.framingRadius)*networkWeight;
    this.framing=previewFraming(this.width,this.height,document.querySelector('#app').clientHeight,radius,this.interaction.zoom);
    if(this.three){this.camera.left=-this.width/(2*this.framing.unit);this.camera.right=-this.camera.left;this.camera.top=this.height/(2*this.framing.unit);this.camera.bottom=-this.camera.top;this.camera.updateProjectionMatrix();}
  }
  projected = new Float32Array(4);
  renderCanvas(elapsed, network) {
    const c = this.context, b = this.buffers, p = this.projected;
    c.clearRect(0, 0, this.width, this.height); c.lineWidth = .7;
    for (const [array, count, color] of [[b.lines, b.segmentCount, 'rgba(143,201,187,.34)'], [b.networkLines, b.networkCount, 'rgba(145,199,223,.75)']]) {
      c.strokeStyle = color; c.beginPath();
      for (let i = 0; i < count; i++) { this.project(array, i * 6, p); this.project(array, i * 6 + 3, p, 2); c.moveTo(p[0], p[1]); c.lineTo(p[2], p[3]); } c.stroke();
    }
    for (let i = 0; i < MAX_NODES; i++) if (b.radii[i] > .001) {
      const scale = this.project(b.positions, i * 3, p); c.fillStyle = this.selectedCanonical && this.canonicalMapping?.[i] === this.selectedCanonical ? "#ffffff" : `#${COLORS[b.regions[i]].toString(16)}`;
      const breath = this.reduced || b.focusedId || i>=BUDGET.neurons ? 1 : 1 + .04 * Math.sin(elapsed + i);
      c.beginPath(); c.arc(p[0], p[1], Math.max(.5, b.radii[i] * scale * breath), 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(170,225,210,.15)'; c.beginPath(); c.arc(p[0], p[1], b.radii[i] * scale * 1.7, 0, Math.PI * 2); c.stroke();
    }
    c.fillStyle = '#e1fff4'; for (let i = 0; i < b.pulseCount; i++) { this.project(b.pulses, i * 3, p); c.beginPath(); c.arc(p[0], p[1], 2.2, 0, Math.PI * 2); c.fill(); }
    if (network.state === 'DISCOVERING' && !this.reduced) { c.strokeStyle = `rgba(145,199,223,${Math.max(0,.4-network.elapsed*.2)})`; c.beginPath(); c.arc(this.width / 2, this.height / 2, (1 + network.elapsed) * Math.min(this.width, this.height) * .18, 0, Math.PI * 2); c.stroke(); }
  }
  pickCanonical(event) {
    const rect=this.canvas.getBoundingClientRect(), pointer={x:event.clientX-rect.left,y:event.clientY-rect.top};
    let best=null,distance=18;const p=new Float32Array(2);
    for(let i=0;i<this.morph.target.nodes.length;i++){
      if(this.three){const v=new this.three.Vector3().fromArray(this.buffers.positions,i*3).applyMatrix4(this.root.matrixWorld).project(this.camera);if(v.z< -1||v.z>1)continue;p[0]=(v.x+1)*this.width/2;p[1]=(1-v.y)*this.height/2;}
      else this.project(this.buffers.positions,i*3,p);
      const d=Math.hypot(pointer.x-p[0],pointer.y-p[1]);if(d<distance){distance=d;best=this.canonicalMapping?.[i]||null;}
    }
    return best;
  }
  // Project the same remote geometry used for rendering, including camera/root transforms.
  projectRemote(index) {
    const remote = this.buffers.remote[index], point = new Float32Array(2);
    const project = position => {
      if (this.three) {
        const v = new this.three.Vector3(...position).applyMatrix4(this.root.matrixWorld).project(this.camera);
        return { x: (v.x + 1) * this.width / 2, y: (1 - v.y) * this.height / 2, visible: v.z >= -1 && v.z <= 1 };
      }
      this.project(position, 0, point); return { x: point[0], y: point[1], visible: true };
    };
    const center = project(remote.center);
    let top = center.y;
    for (let i = 0; i < BUDGET.remoteNeurons; i++) {
      const k = (BUDGET.neurons + index * BUDGET.remoteNeurons + i) * 3;
      top = Math.min(top, project(this.buffers.positions.subarray(k, k + 3)).y);
    }
    return { x: center.x, y: top - 9,centerY:center.y,radius:Math.max(18,center.y-top), visible: center.visible };
  }
  pickPeer(event) {
    const rect=this.canvas.getBoundingClientRect(),x=(event.clientX-rect.left)*this.width/rect.width,y=(event.clientY-rect.top)*this.height/rect.height;
    return this.labelPeers?.find((peer,index)=>{
      if(!peer.connected||peer.visibility<.99)return false;
      const p=this.projectRemote(index);return p.visible&&Math.hypot(x-p.x,y-p.centerY)<=p.radius;
    })?.id || null;
  }
  updateLabels(peers) {
    this.labelPeers=peers;
    if (!this.labels) this.labels = Array.from({length:BUDGET.remoteBrains},(_,index) => {
      const label=document.createElement('button');label.type='button';label.className='preview-peer-label';
      label.addEventListener('click',event=>{event.stopPropagation();const peer=this.labelPeers[index];if(peer?.connected)this.onVisit?.(peer.id);});
      label.hidden=true;this.host.append(label);return label;
    });
    const placed=[];
    this.labels.forEach((label,index)=>{
      const peer=peers[index];
      label.textContent=peer ? `${peer.name}${peer.demo?' · Demo':''}` : '';label.disabled=!peer?.connected||Boolean(this.interaction.locked);
      label.setAttribute('aria-label',`Visit ${peer?.name||'Mindling'} — Agent Mind, ${BUDGET.remoteNeurons} visual neurons${peer?.demo?', demo network':''}`);
      if(!peer||peer.visibility<=.01){label.hidden=true;return;}
      const anchor=this.projectRemote(index);
      label.hidden=!anchor.visible||anchor.x<0||anchor.x>this.width||anchor.y<0||anchor.y>this.height;
      if(label.hidden)return;
      const half=label.offsetWidth/2,x=Math.max(half,Math.min(this.width-half,anchor.x));let y=Math.max(20,anchor.y);
      for(const other of placed)if(Math.abs(x-other.x)<half+other.half+4&&Math.abs(y-other.y)<22)y=other.y-22;
      placed.push({x,y,half});label.style.left=`${x}px`;label.style.top=`${y}px`;label.style.opacity=String(peer.visibility);
    });
  }
  destroy() {
    if (this.scene) { this.scene.traverse(object => { object.geometry?.dispose(); if (object.material) object.material.dispose(); }); this.renderer?.dispose(); this.renderer?.forceContextLoss(); }
    this.buffers.identities.clear();
    this.labels?.forEach(label => label.remove()); this.labels = null;
    this.canvas?.remove();
  }
}
