import { SceneInteraction } from "./scene-interaction.js";
import { NEURAL_SEED_MORPHOLOGY as MORPHOLOGY, seededValue } from "./neural-morphology.js";

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
  #interaction = new SceneInteraction();
  #reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor(three) {
    this.#three = three;
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
    this.#camera = new T.PerspectiveCamera(36, 1, 0.1, 30);
    this.#camera.position.z = 5.8;
    this.#seedGroup = new T.Group();
    this.#scene.add(this.#seedGroup);
    this.#addLighting();
    this.#buildSeed(model);
    this.#addDepthParticles();
    this.#interaction.connect(host);
  }

  #addLighting() {
    const T = this.#three;
    this.#scene.add(new T.AmbientLight(0xdce7e5, 0.25));
    const keyLight = new T.PointLight(0xc7eee7, 6, 8);
    keyLight.position.set(-1.5, 2, 3);
    this.#scene.add(keyLight);
  }

  #buildSeed(model) {
    const T = this.#three;
    const positions = new Map(
      model.nodes.map((node) => [node.id, new T.Vector3(...node.position)])
    );
    const glowTexture = this.#createGlowTexture();
    this.#somaMaterial = new T.MeshPhysicalMaterial({
      color: 0xa8c4c0, emissive: 0x6daca2, emissiveIntensity: 0.42,
      roughness: 0.38, transparent: true, opacity: 0.92
    });
    this.#dendriteMaterial = new T.LineBasicMaterial({ color: 0x80aaa3, transparent: true, opacity: 0.28 });
    this.#synapseMaterial = new T.MeshBasicMaterial({ color: 0xa6d2ca, transparent: true, opacity: 0.25 });
    const dendriteVertices = [];

    model.nodes.forEach((node, index) => {
      const mesh = new T.Mesh(
        this.#createSomaGeometry(index),
        this.#somaMaterial
      );
      mesh.position.copy(positions.get(node.id));
      mesh.scale.setScalar(node.size);
      mesh.userData = { phase: index * 1.31, baseSize: node.size };
      this.#seedGroup.add(mesh);
      this.#nodeMeshes.push(mesh);
      this.#addDendriteVertices(dendriteVertices, mesh.position, node.size, index);

      const halo = new T.Sprite(
        new T.SpriteMaterial({
          map: glowTexture,
          color: index ? 0x7ea8a1 : 0xd8fff8,
          transparent: true,
          opacity: index ? 0.13 : 0.22,
          depthWrite: false,
          blending: T.AdditiveBlending
        })
      );
      halo.position.copy(mesh.position);
      halo.scale.setScalar(0.9 * node.size);
      halo.userData.phase = mesh.userData.phase;
      this.#seedGroup.add(halo);
      this.#nodeMeshes.push(halo);
    });

    const dendriteGeometry = new T.BufferGeometry();
    dendriteGeometry.setAttribute("position", new T.Float32BufferAttribute(dendriteVertices, 3));
    this.#seedGroup.add(new T.LineSegments(dendriteGeometry, this.#dendriteMaterial));

    for (const synapse of model.synapses) {
      this.#addSynapse(
        positions.get(synapse.from),
        positions.get(synapse.to),
        glowTexture
      );
    }
  }

  #createSomaGeometry(index) {
    const geometry = new this.#three.IcosahedronGeometry(0.23, MORPHOLOGY.somaDetail);
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
      const theta = (branch / MORPHOLOGY.primaryDendrites) * Math.PI * 2 + seededValue(seed) * 0.7;
      const elevation = (seededValue(seed + 11) - 0.5) * 1.25;
      const direction = new T.Vector3(Math.cos(theta), elevation, Math.sin(theta)).normalize();
      const side = new T.Vector3(-direction.z, seededValue(seed + 19) - 0.5, direction.x).normalize();
      const length = MORPHOLOGY.dendriteLength * scale * (0.72 + seededValue(seed + 7) * 0.42);
      const start = origin.clone().addScaledVector(direction, 0.17 * scale);
      const bend = origin.clone().addScaledVector(direction, length * 0.58).addScaledVector(side, length * 0.16);
      const tip = origin.clone().addScaledVector(direction, length).addScaledVector(side, length * 0.06);
      this.#pushSegment(vertices, start, bend); this.#pushSegment(vertices, bend, tip);
      if (branch % 2 === 0) {
        const twig = tip.clone().addScaledVector(side, length * 0.32).addScaledVector(direction, -length * 0.08);
        this.#pushSegment(vertices, bend, twig);
      }
    }
  }

  #pushSegment(vertices, start, end) { vertices.push(start.x, start.y, start.z, end.x, end.y, end.z); }

  #addSynapse(start, end, glowTexture) {
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
      this.#synapseMaterial
    );
    this.#seedGroup.add(mesh);

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
    this.#seedGroup.add(pulse);
    this.#activationPulses.push(pulse);
  }

  #addDepthParticles() {
    const T = this.#three;
    const values = [];
    for (let index = 0; index < 90; index += 1) {
      const radius = 1.7 + Math.random() * 2.5;
      const angle = Math.random() * Math.PI * 2;
      values.push(
        Math.cos(angle) * radius,
        (Math.random() - 0.5) * 3.8,
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

  update() {}

  resize(width, height) {
    if (!width || !height) return;
    this.#renderer.setSize(width, height, false);
    this.#camera.aspect = width / height;
    this.#camera.updateProjectionMatrix();
  }

  render(elapsed, delta) {
    this.#interaction.update(delta);
    const ambientTurn = this.#reducedMotion ? 0 : Math.sin(elapsed * 0.16) * 0.08;
    this.#seedGroup.rotation.set(
      this.#interaction.rotation.x,
      this.#interaction.rotation.y + ambientTurn,
      0
    );
    this.#seedGroup.scale.setScalar(1.28 * this.#interaction.zoom);

    for (const object of this.#nodeMeshes) {
      const breath = this.#reducedMotion
        ? 0
        : Math.sin(elapsed * 1.15 + object.userData.phase) * 0.035;
      if (object.isSprite) object.material.opacity = 0.13 + breath;
      else object.scale.setScalar(object.userData.baseSize * (1 + breath));
    }
    if (!this.#reducedMotion) this.#particles.rotation.y = elapsed * 0.012;
    this.#updateActivationPulse(elapsed);
    this.#renderer.render(this.#scene, this.#camera);
  }

  #updateActivationPulse(elapsed) {
    const cycle = MORPHOLOGY.pulseInterval * this.#activationPulses.length;
    const sequence = elapsed % cycle;
    const pulseIndex = Math.floor(sequence / MORPHOLOGY.pulseInterval);
    for (const [index, pulse] of this.#activationPulses.entries()) {
      const active = !this.#reducedMotion && index === pulseIndex;
      pulse.visible = active;
      if (!active) continue;
      const progress = sequence % MORPHOLOGY.pulseInterval;
      const normalized = Math.min(progress / (MORPHOLOGY.pulseInterval * 0.7), 1);
      pulse.position.copy(pulse.userData.curve.getPoint(normalized));
      pulse.material.opacity = Math.sin(normalized * Math.PI) * 0.55;
    }
  }

  destroy() {
    this.#interaction.disconnect();
    this.#scene?.traverse((object) => {
      object.geometry?.dispose();
      if (Array.isArray(object.material)) {
        object.material.forEach((item) => {
          item.map?.dispose();
          item.dispose();
        });
      } else {
        object.material?.map?.dispose();
        object.material?.dispose();
      }
    });
    this.#renderer?.dispose();
  }
}
