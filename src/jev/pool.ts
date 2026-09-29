// A pool of Jev workers, fed at a throttled rate you can change while it runs.
import { buildCity } from './city';
import type { Plan } from './effects';
import type { Observations } from './life';
import { candidates, key, score, type Candidate, type Job, type Scored, type SearchSpace } from './search';
import type { JobOut } from './worker';

export interface PoolStatus {
  running: boolean;
  done: number;
  total: number;
  busy: number;
  workers: number;
  rate: number; // plans per second actually achieved
}

export interface PoolEvents {
  onTesting?: (c: Candidate) => void;
  onResults?: (s: Scored[]) => void;
  onStatus?: (s: PoolStatus) => void;
}

interface Slot {
  w: Worker | null;
  pending: number;
}

export class JevPool {
  private slots: Slot[] = [];
  private queue: Candidate[] = [];
  private jobGen = new Map<number, number>();
  private job = 0;
  private generation = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private budget = 0;
  private last = 0;
  private doneTimes: number[] = [];
  private base: Plan | null = null;
  private obs: Observations = {};
  private seed = 7;
  results: Scored[] = [];
  total = 0;
  running = false;
  throttle = 4; // plans per second; Infinity = as fast as the workers go
  runs = 120;

  constructor(
    private ev: PoolEvents,
    size = Math.max(1, Math.min(6, (globalThis.navigator?.hardwareConcurrency || 4) - 1)),
  ) {
    this.setWorkers(size);
  }

  get workers() {
    return this.slots.length;
  }

  setWorkers(n: number) {
    for (const s of this.slots) s.w?.terminate();
    this.slots = [];
    for (let i = 0; i < n; i++) {
      let w: Worker | null = null;
      try {
        w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      } catch {
        w = null; // no workers: run on the main thread instead
      }
      const slot: Slot = { w, pending: 0 };
      if (w) w.onmessage = (e: MessageEvent<JobOut>) => this.receive(slot, e.data);
      this.slots.push(slot);
    }
    this.emit();
  }

  /** Start or restart a search. With keep, results scored on the same assumptions are kept. */
  start(base: Plan, obs: Observations, space: SearchSpace, seed: number, keep = false) {
    this.generation++;
    this.base = base;
    this.obs = obs;
    this.seed = seed;
    const all = candidates(space);
    if (!keep) this.results = [];
    this.results = this.results.filter((s) => space.weapons.includes(s.c.weapon) && space.hours.includes(s.c.hour));
    const seen = new Set(this.results.map((s) => key(s.c)));
    this.queue = all.filter((c) => !seen.has(key(c)));
    this.total = all.length;
    this.running = true;
    this.budget = 1;
    this.last = performance.now();
    if (this.timer == null) this.timer = setInterval(() => this.tick(), 40);
    this.ev.onResults?.(this.results);
    this.emit();
  }

  pause() {
    this.running = false;
    this.emit();
  }
  resume() {
    if (!this.base) return;
    this.running = true;
    this.last = performance.now();
    this.emit();
  }
  step() {
    if (this.queue.length) this.dispatch(1);
  }
  stop() {
    this.running = false;
    this.queue = [];
    this.generation++;
    this.emit();
  }
  dispose() {
    if (this.timer != null) clearInterval(this.timer);
    this.timer = null;
    for (const s of this.slots) s.w?.terminate();
  }

  private tick() {
    const now = performance.now();
    const dt = (now - this.last) / 1000;
    this.last = now;
    if (!this.running || !this.base) return;
    if (!this.queue.length && this.slots.every((s) => !s.pending)) {
      this.running = false;
      this.emit();
      return;
    }
    if (this.throttle === Infinity) {
      this.dispatch(Infinity);
      return;
    }
    this.budget = Math.min(this.budget + dt * this.throttle, Math.max(1, this.throttle));
    const n = Math.floor(this.budget);
    if (n > 0) this.budget -= this.dispatch(n);
  }

  private dispatch(n: number) {
    let sent = 0;
    for (const slot of this.slots) {
      if (sent >= n || !this.queue.length) break;
      if (slot.pending) continue;
      const size = n === Infinity ? 6 : Math.min(n - sent, Math.max(1, Math.ceil((n - sent) / this.slots.length)));
      const cands = this.queue.splice(0, size);
      const msg: Job = { job: ++this.job, seed: this.seed, base: this.base!, obs: this.obs, runs: this.runs, cands };
      slot.pending++;
      sent += cands.length;
      this.jobGen.set(msg.job, this.generation);
      this.ev.onTesting?.(cands[cands.length - 1]);
      if (slot.w) slot.w.postMessage(msg);
      else setTimeout(() => this.receive(slot, { job: msg.job, out: score(buildCity(msg.seed), msg) }), 0);
    }
    this.emit();
    return sent;
  }

  private receive(slot: Slot, out: JobOut) {
    slot.pending = Math.max(0, slot.pending - 1);
    const gen = this.jobGen.get(out.job);
    this.jobGen.delete(out.job);
    if (gen !== this.generation) return;
    const now = performance.now();
    for (let i = 0; i < out.out.length; i++) this.doneTimes.push(now);
    this.results = this.results.concat(out.out);
    this.ev.onResults?.(this.results);
    this.emit();
  }

  status(): PoolStatus {
    const now = performance.now();
    this.doneTimes = this.doneTimes.filter((t) => now - t < 2000);
    return { running: this.running, done: this.results.length, total: this.total, busy: this.slots.filter((s) => s.pending).length, workers: this.slots.length, rate: this.doneTimes.length / 2 };
  }

  private emit() {
    this.ev.onStatus?.(this.status());
  }
}
