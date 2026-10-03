import { SceneInteraction } from "./scene-interaction.js";

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
    const geometry = new T.IcosahedronGeometry(0.23, 4);
    const glowTexture = this.#createGlowTexture();

    model.nodes.forEach((node, index) => {
      const mesh = new T.Mesh(
        geometry,
        new T.MeshPhysicalMaterial({
          color: index ? 0xa8c4c0 : 0xe5f4f1,
          emissive: 0x6daca2,
          emissiveIntensity: index ? 0.35 : 0.7,
          roughness: 0.25,
          transparent: true,
          opacity: 0.94
        })
      );
      mesh.position.copy(positions.get(node.id));
      mesh.scale.setScalar(node.size);
      mesh.userData = { phase: index * 1.31, baseSize: node.size };
      this.#seedGroup.add(mesh);
      this.#nodeMeshes.push(mesh);

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

    for (const synapse of model.synapses) {
      this.#addSynapse(
        positions.get(synapse.from),
        positions.get(synapse.to),
        glowTexture
      );
    }
  }

  #addSynapse(start, end, glowTexture) {
    const T = this.#three;
    if (!start || !end) return;
    const midpoint = start.clone().add(end).multiplyScalar(0.5);
    midpoint.z += 0.11;
    const curve = new T.QuadraticBezierCurve3(start, midpoint, end);
    const mesh = new T.Mesh(
      new T.TubeGeometry(curve, 24, 0.012, 5, false),
      new T.MeshBasicMaterial({ color: 0x91bdb5, transparent: true, opacity: 0.3 })
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

  render(elapsed) {
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
    const sequence = elapsed % 8;
    const pulseIndex = Math.floor(sequence / 2);
    for (const [index, pulse] of this.#activationPulses.entries()) {
      const active = !this.#reducedMotion && index === pulseIndex;
      pulse.visible = active;
      if (!active) continue;
      const progress = sequence % 2;
      const normalized = Math.min(progress / 1.35, 1);
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
