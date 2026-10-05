export class SceneInteraction {
  rotation = { x: -0.08, y: -0.2 };
  zoom = 1;
  #targetZoom = 1;
  #host;
  #dragOrigin = null;
  #pointerId = null;
  #dragDistance = 0;
  #onTap;
  #onHover;
  #pointers = new Map();
  #pinchDistance = null;
  #gestureWasPinch = false;

  connect(host, { onTap, onHover } = {}) {
    this.disconnect();
    this.#host = host;
    this.#onTap = onTap;
    this.#onHover = onHover;
    host.addEventListener("pointerdown", this.#onPointerDown);
    host.addEventListener("pointermove", this.#onPointerMove);
    host.addEventListener("pointerup", this.#onPointerUp);
    host.addEventListener("pointercancel", this.#onPointerUp);
    host.addEventListener("wheel", this.#onWheel, { passive: false });
    host.addEventListener("pointerleave", this.#onPointerLeave);
  }

  #onPointerDown = (event) => {
    if (event.pointerType === "mouse" && (!event.isPrimary || event.button !== 0)) return;
    event.preventDefault();
    this.#pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, type: event.pointerType });
    if (this.#pointers.size === 2) {
      this.#pinchDistance = this.#distanceBetweenPointers(); this.#gestureWasPinch = true; this.#dragDistance = 100;
    }
    this.#dragOrigin = { x: event.clientX, y: event.clientY };
    this.#pointerId = event.pointerId;
    this.#dragDistance = 0;
    this.#host.setPointerCapture(event.pointerId);
    this.#host.classList.add("dragging");
  };

  #onPointerMove = (event) => {
    if (!this.#dragOrigin) { this.#onHover?.(event); return; }
    if (!this.#pointers.has(event.pointerId)) return;
    this.#pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, type: event.pointerType });
    if (this.#pointers.size > 1) {
      const distance = this.#distanceBetweenPointers();
      if (this.#pinchDistance) this.#targetZoom = Math.max(0.72, Math.min(1.48, this.#targetZoom * distance / this.#pinchDistance));
      this.#pinchDistance = distance; return;
    }
    if (event.pointerId !== this.#pointerId) return;
    this.#dragDistance += Math.hypot(event.clientX - this.#dragOrigin.x, event.clientY - this.#dragOrigin.y);
    this.rotation.y += (event.clientX - this.#dragOrigin.x) * 0.004;
    this.rotation.x = Math.max(
      -0.45,
      Math.min(0.35, this.rotation.x + (event.clientY - this.#dragOrigin.y) * 0.003)
    );
    this.#dragOrigin = { x: event.clientX, y: event.clientY };
  };

  #onPointerUp = (event) => {
    if (!this.#pointers.has(event.pointerId)) return;
    if (this.#host.hasPointerCapture?.(event.pointerId)) this.#host.releasePointerCapture(event.pointerId);
    const pointer = this.#pointers.get(event.pointerId);
    this.#pointers.delete(event.pointerId);
    const tapThreshold = pointer.type === "touch" ? 10 : 6;
    if (!this.#gestureWasPinch && this.#dragDistance < tapThreshold) this.#onTap?.(event);
    if (this.#pointers.size) {
      const [id, remaining] = this.#pointers.entries().next().value;
      this.#pointerId = id; this.#dragOrigin = { x: remaining.x, y: remaining.y }; this.#pinchDistance = null; return;
    }
    this.#dragOrigin = null;
    this.#pointerId = null;
    this.#pinchDistance = null;
    this.#gestureWasPinch = false;
    this.#host.classList.remove("dragging");
  };

  #distanceBetweenPointers() {
    const [first, second] = [...this.#pointers.values()];
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  #onPointerLeave = () => { if (!this.#dragOrigin) this.#onHover?.(null); };

  #onWheel = (event) => {
    event.preventDefault();
    const normalizedDelta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    this.#targetZoom = Math.max(0.72, Math.min(1.48, this.#targetZoom - normalizedDelta * 0.0007));
  };

  update(delta) {
    const blend = 1 - Math.exp(-Math.min(delta, 0.1) * 14);
    this.zoom += (this.#targetZoom - this.zoom) * blend;
  }

  disconnect() {
    this.#host?.removeEventListener("pointerdown", this.#onPointerDown);
    this.#host?.removeEventListener("pointermove", this.#onPointerMove);
    this.#host?.removeEventListener("pointerup", this.#onPointerUp);
    this.#host?.removeEventListener("pointercancel", this.#onPointerUp);
    this.#host?.removeEventListener("wheel", this.#onWheel);
    this.#host?.removeEventListener("pointerleave", this.#onPointerLeave);
    this.#host?.classList.remove("dragging");
    this.#dragOrigin = null;
    this.#pointerId = null;
    this.#pointers.clear();
    this.#pinchDistance = null;
    this.#gestureWasPinch = false;
    this.#onTap = null;
    this.#onHover = null;
    this.#host = null;
  }
}
