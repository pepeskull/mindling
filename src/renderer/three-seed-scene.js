import { SceneInteraction } from "./scene-interaction.js";
import { NEURAL_SEED_MORPHOLOGY as MORPHOLOGY, seededValue } from "./neural-morphology.js";
import { previewFraming, SEED_CAMERA } from './scene-framing.js';

export class ThreeSeedScene {
  #three;
  #host;
  #renderer;
  #scene;
  #camera;
  #seedGroup;
  #particles;
  #nodeMeshes = [];
  #activationPulses = [];
  #somaMaterial;
  #dendriteMaterial;
  #synapseMaterial;
  #interactiveObjects = [];
  #selected = null;
  #hovered = null;
  #onSelection;
  #raycaster;
  #nodeVisuals = new Map();
  #signal = null;
  #nextAmbient = 7;
  #ambientIndex = 0;
  #entryPulse;
  #synapseVisuals = new Map();
  #routeHighlight = { neuronIds: [], synapseIds: [] };
  #interaction = new SceneInteraction();
  #ownsInteraction = true;
  #reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor(three, onSelection, interaction = null, framing = null) {
    this.framing = framing;
    if (interaction) { this.#interaction = interaction; this.#ownsInteraction = false; }
    this.#three = three;
    this.#onSelection = onSelection;
    this.#raycaster = new three.Raycaster();
  }

  mount(host, model) {
    const T = this.#three;
    this.#host = host;
    this.#renderer = new T.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });
    this.#renderer.setClearColor(0x000000, 0);
    this.#renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.#renderer.outputColorSpace = T.SRGBColorSpace;
    host.append(this.#renderer.domElement);

    this.#scene = new T.Scene();
    this.#camera = new T.PerspectiveCamera(SEED_CAMERA.fov, 1, 0.1, 30);
    this.#camera.position.z = SEED_CAMERA.distance;
    this.#seedGroup = new T.Group();
    this.#scene.add(this.#seedGroup);
    this.#addLighting();
    this.#buildSeed(model);
    this.structure = this.#structure(model);
    this.#addDepthParticles();
    if (this.#ownsInteraction) this.#interaction.connect(host, { onTap: event => this.#pick(event, true), onHover: event => this.#pick(event, false) });
  }

  #addLighting() {
    const T = this.#three;
    this.#scene.add(new T.AmbientLight(0xd5eee8, 2));
    const keyLight = new T.DirectionalLight(0xffffff, 2.5);
    keyLight.position.set(-2, 3, 5);
    this.#scene.add(keyLight);
  }

  #buildSeed(model) {
    const T = this.#three;
    const positions = new Map(
      model.nodes.map((node) => [node.id, new T.Vector3(...node.position)])
    );
    const glowTexture = this.#createGlowTexture();
    this.#entryPulse = new T.Sprite(new T.SpriteMaterial({ map: glowTexture, color: 0xd9fff7, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
    this.#entryPulse.scale.setScalar(0.12); this.#entryPulse.visible = false; this.#seedGroup.add(this.#entryPulse);
    // Match Neural Cluster's surface and palette without changing seed dimensions.
    this.#somaMaterial = new T.MeshStandardMaterial({
      color: 0x9bd5c5, emissive: 0x29423c, emissiveIntensity: 0.5,
      roughness: 0.38, metalness: 0.1
    });
    this.#dendriteMaterial = new T.LineBasicMaterial({ color: 0x8fc9bb, transparent: true, opacity: 0.26 });
    this.#synapseMaterial = new T.MeshBasicMaterial({ color: 0x8fc9bb, transparent: true, opacity: 0.26 });
    const colors = [0x9bd5c5, 0x7daebe, 0xb7c9de, 0x9abfcb, 0xc0b3d2];
    const dendriteVertices = [];
    const coreGeometry = new T.SphereGeometry(0.105, 16, 12);

    model.nodes.forEach((node, index) => {
      const mesh = new T.Mesh(
        this.#createSomaGeometry(index),
        index === 0 ? this.#somaMaterial : this.#somaMaterial.clone()
      );
      mesh.material.color.setHex(colors[index % colors.length]);
      mesh.position.copy(positions.get(node.id));
      mesh.scale.setScalar(node.size);
      mesh.userData = { phase: index * 1.31, baseSize: node.size };
      mesh.userData.selection = { type: "neuron", id: node.id };
      this.#seedGroup.add(mesh);
      this.#nodeMeshes.push(mesh);
      this.#interactiveObjects.push(mesh);
      this.#addDendriteVertices(dendriteVertices, mesh.position, node.size, index);

      const core = new T.Mesh(coreGeometry, new T.MeshBasicMaterial({ color: 0xd9fff7, transparent: true, opacity: 0.06, depthWrite: false, blending: T.AdditiveBlending }));
      core.position.copy(mesh.position); core.scale.setScalar(node.size);
      this.#seedGroup.add(core);

      const halo = new T.Sprite(
        new T.SpriteMaterial({
          map: glowTexture,
          color: colors[index % colors.length],
          transparent: true,
          opacity: 0.06,
          depthWrite: false,
          blending: T.AdditiveBlending
        })
      );
      halo.position.copy(mesh.position);
      halo.scale.setScalar(0.9 * node.size);
      halo.userData.phase = mesh.userData.phase;
      this.#seedGroup.add(halo);
      this.#nodeMeshes.push(halo);
      this.#nodeVisuals.set(node.id, { mesh, halo, core });
    });

    if(!model.nodes.length)coreGeometry.dispose();
    const dendriteGeometry = new T.BufferGeometry();
    dendriteGeometry.setAttribute("position", new T.Float32BufferAttribute(dendriteVertices, 3));
    this.#seedGroup.add(new T.LineSegments(dendriteGeometry, this.#dendriteMaterial));

    for (const synapse of model.synapses) {
      this.#addSynapse(
        synapse,
        positions.get(synapse.from),
        positions.get(synapse.to),
        glowTexture
      );
    }
  }

  #createSomaGeometry(index) {
    const geometry = new this.#three.IcosahedronGeometry(0.23, 1);
    const positions = geometry.attributes.position;
    for (let vertex = 0; vertex < positions.count; vertex += 1) {
      const x = positions.getX(vertex); const y = positions.getY(vertex); const z = positions.getZ(vertex);
      const noise = Math.sin(x * 19 + index * 1.7) * Math.cos(y * 23 - index) * Math.sin(z * 17 + index * 0.6);
      const deformation = 1 + noise * MORPHOLOGY.somaIrregularity;
      positions.setXYZ(vertex, x * deformation * (1 + index * 0.008), y * deformation, z * deformation * (0.96 + index * 0.006));
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }

  #addDendriteVertices(vertices, origin, scale, nodeIndex) {
    const T = this.#three;
    for (let branch = 0; branch < MORPHOLOGY.primaryDendrites; branch += 1) {
      const seed = nodeIndex * 31 + branch;
      const theta = (branch / MORPHOLOGY.primaryDendrites) * Math.PI * 2 + seededValue(seed);
      const length = MORPHOLOGY.dendriteLength * scale * (0.72 + seededValue(seed + 7) * 0.42);
      const tip = origin.clone().add(new T.Vector3(
        Math.cos(theta),
        Math.sin(theta),
        seededValue(nodeIndex + branch * 7) - 0.5
      ).normalize().multiplyScalar(length));
      this.#pushSegment(vertices, origin, tip);
    }
  }

  #pushSegment(vertices, start, end) { vertices.push(start.x, start.y, start.z, end.x, end.y, end.z); }

  #addSynapse(synapse, start, end, glowTexture) {
    const T = this.#three;
    if (!start || !end) return;
    const direction = end.clone().sub(start).normalize();
    const connectionStart = start.clone().addScaledVector(direction, 0.16);
    const connectionEnd = end.clone().addScaledVector(direction, -0.16);
    const midpoint = connectionStart.clone().add(connectionEnd).multiplyScalar(0.5);
    midpoint.z += 0.09; midpoint.y += 0.035;
    const curve = new T.QuadraticBezierCurve3(connectionStart, midpoint, connectionEnd);
    const mesh = new T.Mesh(
      new T.TubeGeometry(curve, 20, MORPHOLOGY.synapseRadius, 4, false),
      this.#synapseMaterial.clone()
    );
    mesh.userData.selection = { type: "synapse", id: synapse.id };
    mesh.userData.strength = synapse.strength ?? 0.2;
    mesh.material.opacity = 0.22 + mesh.userData.strength * 0.2;
    this.#seedGroup.add(mesh);
    this.#interactiveObjects.push(mesh);
    this.#synapseVisuals.set(synapse.id, mesh);

    const contact = new T.Sprite(new T.SpriteMaterial({ map: glowTexture, color: 0xbde2db, transparent: true, opacity: 0.18, depthWrite: false, blending: T.AdditiveBlending }));
    contact.position.copy(connectionEnd);
    contact.scale.setScalar(0.075);
    this.#seedGroup.add(contact);

    const pulse = new T.Sprite(
      new T.SpriteMaterial({
        map: glowTexture,
        color: 0xe1fff9,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: T.AdditiveBlending
      })
    );
    pulse.scale.setScalar(0.14);
    pulse.userData.curve = curve;
    pulse.userData.route = { source: synapse.from, synapse: synapse.id, destination: synapse.to };
    this.#seedGroup.add(pulse);
    this.#activationPulses.push(pulse);
  }

  signal(route, ambient = false) {
    const pulseIndex = this.#activationPulses.findIndex(pulse => pulse.userData.route.synapse === route.synapse);
    if (pulseIndex < 0) return;
    const duration = ambient ? 1.8 : route.outcome === "MEMORY_FORMATION" ? 3.2 : route.outcome === "REINFORCEMENT" ? 2.8 : 2.5;
    this.#signal = { route, pulseIndex, startedAt: performance.now() / 1000, duration, ambient };
  }

  highlightRoute(route) { this.#routeHighlight = route || { neuronIds: [], synapseIds: [] }; }

  selectAt(event) { return this.#pick(event, true); }
  hoverAt(event) { return this.#pick(event, false); }

  #pick(event, select) {
    if (!event) { this.#hovered = null; return; }
    const bounds = this.#host.getBoundingClientRect();
    const pointer = new this.#three.Vector2(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1
    );
    this.#raycaster.setFromCamera(pointer, this.#camera);
    const hit = this.#raycaster.intersectObjects(this.#interactiveObjects, false)[0]?.object.userData.selection || null;
    if (select) { this.#selected = hit; this.#onSelection?.(hit); }
    else this.#hovered = hit;
    return hit;
  }

  #addDepthParticles() {
    const T = this.#three;
    const values = [];
    for (let index = 0; index < 90; index += 1) {
      const radius = 1.7 + seededValue(index * 3) * 2.5;
      const angle = seededValue(index * 3 + 1) * Math.PI * 2;
      values.push(
        Math.cos(angle) * radius,
        (seededValue(index * 3 + 2) - 0.5) * 3.8,
        Math.sin(angle) * radius - 1.5
      );
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute("position", new T.Float32BufferAttribute(values, 3));
    this.#particles = new T.Points(
      geometry,
      new T.PointsMaterial({
        color: 0x80918e,
        size: 0.014,
        transparent: true,
        opacity: 0.27,
        depthWrite: false
      })
    );
    this.#scene.add(this.#particles);
  }

  #createGlowTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const context = canvas.getContext("2d");
    const glow = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    glow.addColorStop(0, "rgba(255,255,255,.95)");
    glow.addColorStop(0.15, "rgba(190,240,230,.35)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, 64, 64);
    return new this.#three.CanvasTexture(canvas);
  }

  #structure(model) { return JSON.stringify([model.nodes.map(node => [node.id,node.position,node.size]),model.synapses.map(edge => [edge.id,edge.from,edge.to])]); }
  setSelection(selection) { this.#selected = selection; }
  #disposeObjects(root) {
    const geometries=new Set(),materials=new Set([this.#somaMaterial,this.#dendriteMaterial,this.#synapseMaterial].filter(Boolean)),textures=new Set();
    root?.traverse(object=>{if(object.geometry)geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])if(material){materials.add(material);if(material.map)textures.add(material.map);}});
    textures.forEach(texture=>texture.dispose());materials.forEach(material=>material.dispose());geometries.forEach(geometry=>geometry.dispose());
  }
  update(model) {
    const structure=this.#structure(model);
    if(structure!==this.structure){
      this.#disposeObjects(this.#seedGroup);this.#seedGroup.clear();
      this.#nodeMeshes=[];this.#interactiveObjects=[];this.#activationPulses=[];this.#nodeVisuals.clear();this.#synapseVisuals.clear();this.#signal=null;
      this.#buildSeed(model);this.structure=structure;
    }
    for (const synapse of model.synapses) {
      const mesh = this.#synapseVisuals.get(synapse.id);
      if (mesh) { mesh.userData.strength = synapse.strength ?? 0.2; mesh.material.opacity = 0.22 + mesh.userData.strength * 0.2; }
    }
  }

  resize(width, height) {
    if (!width || !height) return;
    this.#renderer.setSize(width, height, false);
    this.#camera.aspect = width / height;
    this.width = width; this.height = height;
    this.#camera.updateProjectionMatrix();
  }

  render(elapsed, delta) {
    if (this.#ownsInteraction) this.#interaction.update(delta);
    const ambientTurn = this.#reducedMotion ? 0 : Math.sin(elapsed * 0.16) * 0.08;
    this.#seedGroup.rotation.set(
      this.#interaction.rotation.x,
      this.#interaction.rotation.y + ambientTurn,
      0
    );
    if (this.framing) {
      const fit = previewFraming(this.width, this.height, this.framing.referenceHeight(), this.framing.radius?.() || 1.5, this.#interaction.zoom);
      // Orthographic preview camera shares Canvas pixel projection, avoiding an
      // additional portrait perspective shrink. The production camera is unchanged.
      if (!this.#camera.isOrthographicCamera) this.#camera = new this.#three.OrthographicCamera(-1, 1, 1, -1, .1, 30);
      this.#camera.position.z = SEED_CAMERA.distance;
      this.#camera.left = -this.width / (2 * fit.unit); this.#camera.right = -this.#camera.left;
      this.#camera.top = this.height / (2 * fit.unit); this.#camera.bottom = -this.#camera.top;
      this.#camera.updateProjectionMatrix(); this.#seedGroup.scale.setScalar(fit.zoom);
    } else this.#seedGroup.scale.setScalar(SEED_CAMERA.scale * this.#interaction.zoom);

    for (const object of this.#nodeMeshes) {
      const breath = this.#reducedMotion
        ? 0
        : Math.sin(elapsed * 1.15 + object.userData.phase) * 0.035;
      if (object.isSprite) object.material.opacity = 0.06 + breath;
      else {
        const focused = (this.#selected?.type === "neuron" && this.#selected.id === object.userData.selection?.id) || this.#routeHighlight.neuronIds.includes(object.userData.selection?.id);
        const hovered = this.#hovered?.type === "neuron" && this.#hovered.id === object.userData.selection?.id;
        object.scale.setScalar(object.userData.baseSize * (1 + breath) * (focused ? 1.1 : hovered ? 1.05 : 1));
      }
    }
    for (const [id, mesh] of this.#synapseVisuals) mesh.material.opacity = (0.22 + (mesh.userData.strength ?? .2) * .2) * (this.#routeHighlight.synapseIds.includes(id) || this.#selected?.type === "synapse" && this.#selected.id === id ? 1.8 : this.#hovered?.type === "synapse" && this.#hovered.id === id ? 1.3 : 1);
    this.#updateSignal(elapsed);
    if (!this.#reducedMotion) this.#particles.rotation.y = elapsed * 0.012;
    this.#renderer.render(this.#scene, this.#camera);
  }

  #updateSignal(elapsed) {
    for (const visual of this.#nodeVisuals.values()) visual.core.material.opacity = 0.06;
    if (!this.#signal && !this.#reducedMotion && this.#activationPulses.length && elapsed >= this.#nextAmbient) {
      const pulse = this.#activationPulses[this.#ambientIndex % this.#activationPulses.length];
      this.#ambientIndex += 1;
      this.signal(pulse.userData.route, true);
      this.#signal.startedAt = elapsed;
      this.#nextAmbient = elapsed + 7 + (this.#ambientIndex % 3) * 1.7;
    }
    const signal = this.#signal;
    this.#entryPulse.visible = Boolean(signal) && !signal.ambient;
    for (const [index, pulse] of this.#activationPulses.entries()) {
      const active = signal && index === signal.pulseIndex;
      pulse.visible = active;
      if (!active) { pulse.material.opacity = 0; continue; }
      const normalized = Math.min((elapsed - signal.startedAt) / signal.duration, 1);
      if (!signal.ambient) {
        const sourcePosition = this.#nodeVisuals.get(signal.route.source).mesh.position;
        const arrival = this.#reducedMotion ? 1 : Math.min(normalized / .2, 1);
        this.#entryPulse.position.set(0, -1.7, .2).lerp(sourcePosition, arrival);
        this.#entryPulse.material.opacity = Math.sin(arrival * Math.PI) * .55;
      }
      const travel = this.#reducedMotion ? 1 : Math.max(0, Math.min(1, (normalized - .2) / .55));
      pulse.position.copy(pulse.userData.curve.getPoint(travel));
      const consolidation = signal.route.outcome === "MEMORY_FORMATION" ? Math.max(0, Math.sin(normalized * Math.PI * 2) * .18) : 0;
      pulse.material.opacity = this.#reducedMotion ? (1 - normalized) * .35 : Math.sin(travel * Math.PI) * (signal.ambient ? .3 : .65) + consolidation;
      const sourceGlow = Math.max(0, 1 - normalized * 4);
      const destinationGlow = Math.max(0, 1 - Math.abs(normalized - .82) * 7);
      const source = this.#nodeVisuals.get(signal.route.source);
      const destination = this.#nodeVisuals.get(signal.route.destination);
      if (source) source.halo.material.opacity = .06 + sourceGlow * .32;
      if (source) source.core.material.opacity = .06 + sourceGlow * .48;
      if (destination) { destination.halo.material.opacity = .06 + destinationGlow * .4; destination.core.material.opacity = .06 + destinationGlow * .58; }
      if (normalized >= 1) { this.#signal = null; pulse.visible = false; this.#entryPulse.visible = false; }
    }
  }

  setReducedMotion(value) { this.#reducedMotion = value; }

  destroy() {
    if (this.#ownsInteraction) this.#interaction.disconnect();
    this.#disposeObjects(this.#scene);
    this.#renderer?.dispose();
    this.#renderer?.forceContextLoss();
    this.#renderer?.domElement.remove();
  }
}
