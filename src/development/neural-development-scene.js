import { SceneInteraction } from '../renderer/scene-interaction.js';
import { seededValue } from '../renderer/neural-morphology.js';

// A read-only projection of canonical positions; no generated neurons or links.
// Uses the existing camera interaction without creating another WebGL engine.
export class NeuralDevelopmentScene {
  constructor(host, onSelect) {
    this.host = host; this.onSelect = onSelect; this.abort = new AbortController();
    this.canvas = document.createElement('canvas'); this.canvas.setAttribute('aria-hidden', 'true'); host.append(this.canvas);
    this.ctx = this.canvas.getContext('2d'); this.camera = new SceneInteraction();
    this.frame = null; this.visible = false; this.points = new Map(); this.nodes = []; this.edges = [];
    this.selected = null; this.hovered = null; this.focusLevels = new Map(); this.elapsed = 0; this.last = null;
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.camera.connect(host, { onTap: event => this.select(this.hit(event)), onHover: event => {
      this.hovered = event ? this.hit(event) : null; host.style.cursor = this.hovered ? 'pointer' : 'grab'; this.request();
    } });
    this.listen(host, 'pointermove', () => this.request());
    this.listen(host, 'wheel', () => this.request());
    this.listen(host, 'keydown', event => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault(); this.camera.rotation.y += event.key === 'ArrowLeft' ? -.12 : event.key === 'ArrowRight' ? .12 : 0;
        this.camera.rotation.x = Math.max(-.45, Math.min(.35, this.camera.rotation.x + (event.key === 'ArrowUp' ? -.08 : event.key === 'ArrowDown' ? .08 : 0))); this.request();
      }
      if (['+', '=', '-', '0'].includes(event.key)) { event.preventDefault(); this.control(event.key === '0' ? 'reset' : event.key === '-' ? 'out' : 'in'); }
    });
    this.listen(this.motion, 'change', () => { this.pause(); this.request(); });
    this.listen(document, 'visibilitychange', () => { this.pause(); if (!document.hidden) this.request(); });
    this.observer = new ResizeObserver(() => this.request()); this.observer.observe(host);
  }
  listen(target, type, handler) { target.addEventListener(type, handler, { signal: this.abort.signal }); }
  update(data) {
    const nextIds = new Set(data.nodes.map(node => node.id));
    for (const id of this.focusLevels.keys()) if (!nextIds.has(id)) this.focusLevels.delete(id);
    this.nodes = data.nodes; this.edges = data.edges; this.deceased = data.deceased;
    const positions = this.nodes.map(node => node.position);
    const bounds = [0, 1, 2].map(axis => positions.length ? [Math.min(...positions.map(p => p[axis])), Math.max(...positions.map(p => p[axis]))] : [0, 0]);
    this.center = bounds.map(([min, max]) => (min + max) / 2);
    this.extent = Math.max(.8, ...positions.map(p => Math.hypot(...p.map((value, axis) => value - this.center[axis]))));
    if (!this.nodes.some(node => node.id === this.selected)) this.selected = null;
    this.request();
  }
  setVisible(value) { this.visible = value; this.pause(); if (value) this.request(); }
  pause() { cancelAnimationFrame(this.frame); this.frame = null; this.last = null; }
  request() { if (!this.visible || document.hidden || this.abort.signal.aborted || this.frame !== null) return; this.frame = requestAnimationFrame(time => this.render(time)); }
  control(action) {
    if (action === 'reset') this.camera.restorePose({ rotation: { x: -.08, y: -.2 }, zoom: 1, targetZoom: 1 });
    else { const zoom = Math.max(.72, Math.min(1.48, this.camera.zoom * (action === 'in' ? 1.12 : 1 / 1.12))); this.camera.restorePose({ rotation: { ...this.camera.rotation }, zoom, targetZoom: zoom }); }
    this.request();
  }
  hit(event) {
    const box = this.host.getBoundingClientRect(), x = event.clientX - box.left, y = event.clientY - box.top;
    return [...this.points.values()].reverse().find(point => Math.hypot(x - point.x, y - point.y) < point.r + 7)?.id || null;
  }
  select(id) { this.selected = id; this.onSelect?.(id); this.request(); }
  render(time) {
    this.frame = null;
    if (!this.visible || document.hidden || this.abort.signal.aborted) return;
    const delta = this.last === null ? 0 : Math.min(.05, (time - this.last) / 1000); this.last = time;
    const ambient = !this.motion.matches && !this.deceased;
    if (ambient) this.elapsed += delta;
    this.camera.update(this.motion.matches ? .1 : delta);
    if (this.motion.matches) { const pose = this.camera.capturePose(); this.camera.restorePose({ ...pose, zoom: pose.targetZoom }); }
    const width = this.host.clientWidth, height = this.host.clientHeight;
    if (!width || !height) return;
    const density = Math.min(devicePixelRatio || 1, 1.5);
    if (this.canvas.width !== Math.round(width * density) || this.canvas.height !== Math.round(height * density)) { this.canvas.width = Math.round(width * density); this.canvas.height = Math.round(height * density); }
    const ctx = this.ctx; ctx.setTransform(density, 0, 0, density, 0, 0); ctx.clearRect(0, 0, width, height);
    const scale = Math.min(width, height) * .31 / this.extent * this.camera.zoom;
    const { x: pitch, y: yaw } = this.camera.rotation;
    const breath = ambient ? 1 + Math.sin(this.elapsed * .7) * .018 : 1;
    const points = this.nodes.map((node, index) => {
      const p = node.position.map((value, axis) => (value - this.center[axis]) * breath + (ambient ? Math.sin(this.elapsed * .55 + index * 1.7 + axis) * .012 : 0));
      const x = p[0] * Math.cos(yaw) + p[2] * Math.sin(yaw), z = -p[0] * Math.sin(yaw) + p[2] * Math.cos(yaw);
      return { id: node.id, x: width / 2 + x * scale, y: height / 2 - (p[1] * Math.cos(pitch) - z * Math.sin(pitch)) * scale, z, r: Math.max(3, Math.min(16, scale * .065 * Math.max(.4, Math.min(1.5, node.size)))) };
    }).sort((a, b) => a.z - b.z);
    this.points = new Map(points.map(point => [point.id, point]));
    for (const [index, edge] of this.edges.entries()) {
      const a = this.points.get(edge.from), b = this.points.get(edge.to); if (!a || !b) continue;
      const active = edge.from === this.selected || edge.to === this.selected;
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2 - 12;
      ctx.strokeStyle = active ? 'rgba(183,216,209,.65)' : 'rgba(183,216,209,.16)'; ctx.lineWidth = active ? 1.2 : .7;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(cx, cy, b.x, b.y); ctx.stroke();
      if (ambient && index < 64) {
        const t = (this.elapsed / 4.8 + seededValue(index + 1)) % 1, u = 1 - t;
        ctx.fillStyle = `rgba(183,216,209,${Math.sin(t * Math.PI) * .8})`;
        ctx.beginPath(); ctx.arc(u*u*a.x+2*u*t*cx+t*t*b.x, u*u*a.y+2*u*t*cy+t*t*b.y, 1.7, 0, Math.PI*2); ctx.fill();
      }
    }
    for (const [index, point] of points.entries()) {
      const selected = point.id === this.selected, hover = point.id === this.hovered;
      const pulse = ambient ? Math.max(0, Math.sin(this.elapsed * 1.2 + index * .9)) : 0;
      const target = selected ? 1 : hover ? .5 : 0;
      const previous = this.focusLevels.get(point.id) || 0;
      const focus = this.motion.matches ? target : previous + (target - previous) * (1 - Math.exp(-delta * 12));
      this.focusLevels.set(point.id, focus);
      const radius = point.r * (1 + pulse * .06 + focus * .12);
      const glow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius * 3);
      glow.addColorStop(0, 'rgba(183,216,209,.18)'); glow.addColorStop(1, 'rgba(183,216,209,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(point.x, point.y, radius * 3, 0, Math.PI*2); ctx.fill();
      ctx.beginPath();
      for (let vertex = 0; vertex < 10; vertex++) { const angle = vertex / 10 * Math.PI * 2, r = radius * (.85 + seededValue(index * 31 + vertex) * .15), x = point.x + Math.cos(angle) * r, y = point.y + Math.sin(angle) * r; if (vertex) ctx.lineTo(x,y); else ctx.moveTo(x,y); }
      ctx.closePath(); ctx.fillStyle = selected ? '#b7d8d1' : 'rgba(183,216,209,.55)'; ctx.strokeStyle = hover || selected ? '#f2f2f2' : 'rgba(183,216,209,.7)'; ctx.fill(); ctx.stroke();
      if (selected) { ctx.beginPath(); ctx.arc(point.x, point.y, radius + 6, 0, Math.PI*2); ctx.strokeStyle = 'rgba(183,216,209,.5)'; ctx.stroke(); }
    }
    if (ambient && this.nodes.length) this.request();
  }
  destroy() { if (this.abort.signal.aborted) return; this.visible = false; this.pause(); this.abort.abort(); this.observer.disconnect(); this.camera.disconnect(); this.canvas.remove(); this.points.clear(); this.focusLevels.clear(); this.nodes = []; this.edges = []; }
}
