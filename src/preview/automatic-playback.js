// Coordinates the existing timeline/network, never creates a competing simulation.
export class AutomaticNetworkCountdown {
  remaining = 5;
  started = false;
  update(delta, { stage, transitionComplete, network }) {
    if (this.started || stage !== 7 || !transitionComplete || !Number.isFinite(delta) || delta < 0) return;
    this.remaining = Math.max(0, this.remaining - delta);
    if (this.remaining === 0) { network.start(); this.started = true; }
  }
}
