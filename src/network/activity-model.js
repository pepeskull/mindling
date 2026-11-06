// Event intensity, not audio FFT, intelligence, CPU use or memory volume.
export const CHANNELS = Object.freeze(['TALK', 'TEACH', 'DEEP_TRAINING']);
export const COLORS = Object.freeze(['#89acf0', '#83cd90', '#e9b465']);
const clamp = value => Math.min(1, Math.max(0, value));

export class ActivityModel {
  constructor() {
    this.events = [];
    this.seen = new Set();
    this.requests = new Map();
    this.times = new Float64Array(601);
    this.samples = new Float32Array(601 * 3);
    this.head = 0;
    this.size = 0;
    this.last = null;
  }

  ingest(event, now = Date.now()) {
    if (!event || event.autonomous === true || !['start', 'accepted', 'cancel'].includes(event.phase) || typeof event.id !== 'string') return false;
    // The originating operation owns its channel, even if a later shared
    // completion callback reports another currently selected UI mode.
    const channel = CHANNELS.indexOf(this.requests.get(event.id) ?? event.activity);
    if (channel < 0 || !Number.isFinite(now)) return false;
    const key = `${event.id}:${event.phase}`;
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    this.requests.set(event.id, CHANNELS[channel]);
    while (this.seen.size > 1024) this.seen.delete(this.seen.values().next().value);
    while (this.requests.size > 512) this.requests.delete(this.requests.keys().next().value);
    this.events.push({ time: now, channel, weight: event.phase === 'start' ? .62 : event.phase === 'accepted' ? 1 : .22 });
    this.events = this.events.filter(item => item.time >= now - 40000).slice(-512);
    return true;
  }

  values(time) {
    const values = [0, 0, 0];
    for (const event of this.events) {
      const age = (time - event.time) / 1000;
      if (age >= 0 && age < 12) values[event.channel] += event.weight * Math.min(1, age / .16) * Math.exp(-Math.max(0, age - .16) / 1.65);
    }
    return values.map(clamp);
  }

  sample(now) {
    const tick = Math.floor(now / 50) * 50;
    if (this.last !== null && tick < this.last) {
      this.head = 0;
      this.size = 0;
      this.last = null;
    }
    // Fill only the bounded visible horizon after a long hidden interval.
    const start = this.last === null ? tick - 30000 : Math.max(this.last + 50, tick - 30000);
    for (let time = start; time <= tick; time += 50) {
      this.times[this.head] = time;
      this.samples.set(this.values(time), this.head * 3);
      this.head = (this.head + 1) % 601;
      this.size = Math.min(601, this.size + 1);
    }
    this.last = tick;
    return this.values(now);
  }

  history(now, seconds) {
    const rows = [];
    for (let n = 0; n < this.size; n++) {
      const index = (this.head - this.size + n + 601) % 601;
      const time = this.times[index];
      if (time >= now - seconds * 1000 && time <= now) rows.push({ time, values: Array.from(this.samples.subarray(index * 3, index * 3 + 3)) });
    }
    return rows;
  }

  peaks(now) {
    const peaks = [0, 0, 0];
    for (let age = 0; age <= 3000; age += 50) {
      const values = this.values(now - age);
      const release = age <= 1600 ? 1 : Math.exp(-(age - 1600) / 700);
      for (let channel = 0; channel < 3; channel++) peaks[channel] = Math.max(peaks[channel], values[channel] * release);
    }
    return peaks;
  }

  flashes(now) {
    return CHANNELS.map((_, channel) => Math.max(0, ...this.events.filter(event => event.channel === channel && event.time <= now).map(event => 1 - (now - event.time) / 450)));
  }
}

// Three overlapping channel kernels. Geometry density does not add activity.
export function spectrum(values, u) {
  return clamp(values.reduce((sum, value, channel) => {
    const distance = u - (.16 + channel * .34);
    return sum + value * Math.exp(-((distance / .13) ** 2)) * (.82 + .18 * Math.cos(distance * 31));
  }, 0));
}
