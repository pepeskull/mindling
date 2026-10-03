export class SceneInteraction {
  rotation = { x: -0.08, y: -0.2 };
  zoom = 1;
  #targetZoom = 1;
  #host;
  #dragOrigin = null;
  #pointerId = null;

  connect(host) {
    this.disconnect();
    this.#host = host;
    host.addEventListener("pointerdown", this.#onPointerDown);
    host.addEventListener("pointermove", this.#onPointerMove);
    host.addEventListener("pointerup", this.#onPointerUp);
    host.addEventListener("pointercancel", this.#onPointerUp);
    host.addEventListener("wheel", this.#onWheel, { passive: false });
  }

  #onPointerDown = (event) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    this.#dragOrigin = { x: event.clientX, y: event.clientY };
    this.#pointerId = event.pointerId;
    this.#host.setPointerCapture(event.pointerId);
    this.#host.classList.add("dragging");
  };

  #onPointerMove = (event) => {
    if (!this.#dragOrigin || event.pointerId !== this.#pointerId) return;
    this.rotation.y += (event.clientX - this.#dragOrigin.x) * 0.004;
    this.rotation.x = Math.max(
      -0.45,
      Math.min(0.35, this.rotation.x + (event.clientY - this.#dragOrigin.y) * 0.003)
    );
    this.#dragOrigin = { x: event.clientX, y: event.clientY };
  };

  #onPointerUp = (event) => {
    if (event.pointerId !== this.#pointerId) return;
    if (this.#host.hasPointerCapture?.(event.pointerId)) this.#host.releasePointerCapture(event.pointerId);
    this.#dragOrigin = null;
    this.#pointerId = null;
    this.#host.classList.remove("dragging");
  };

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
    this.#host?.classList.remove("dragging");
    this.#dragOrigin = null;
    this.#pointerId = null;
    this.#host = null;
  }
}
