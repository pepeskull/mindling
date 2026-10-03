export class SceneInteraction {
  rotation = { x: -0.08, y: -0.2 };
  zoom = 1;
  #host;
  #dragOrigin = null;

  connect(host) {
    this.#host = host;
    host.addEventListener("pointerdown", this.#onPointerDown);
    host.addEventListener("pointermove", this.#onPointerMove);
    host.addEventListener("pointerup", this.#onPointerUp);
    host.addEventListener("pointercancel", this.#onPointerUp);
    host.addEventListener("wheel", this.#onWheel, { passive: false });
  }

  #onPointerDown = (event) => {
    this.#dragOrigin = { x: event.clientX, y: event.clientY };
    this.#host.setPointerCapture(event.pointerId);
  };

  #onPointerMove = (event) => {
    if (!this.#dragOrigin) return;
    this.rotation.y += (event.clientX - this.#dragOrigin.x) * 0.004;
    this.rotation.x = Math.max(
      -0.45,
      Math.min(0.35, this.rotation.x + (event.clientY - this.#dragOrigin.y) * 0.003)
    );
    this.#dragOrigin = { x: event.clientX, y: event.clientY };
  };

  #onPointerUp = () => {
    this.#dragOrigin = null;
  };

  #onWheel = (event) => {
    event.preventDefault();
    this.zoom = Math.max(0.82, Math.min(1.32, this.zoom - event.deltaY * 0.0005));
  };

  disconnect() {
    this.#host?.removeEventListener("pointerdown", this.#onPointerDown);
    this.#host?.removeEventListener("pointermove", this.#onPointerMove);
    this.#host?.removeEventListener("pointerup", this.#onPointerUp);
    this.#host?.removeEventListener("pointercancel", this.#onPointerUp);
    this.#host?.removeEventListener("wheel", this.#onWheel);
  }
}
