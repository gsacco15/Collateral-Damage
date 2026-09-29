// Jev at work: the queue draining, one lane per worker churning through plans, every plan's simulated
// strikes flashing as a grid, and each result flying into the trade-off chart.
import type { Candidate, Scored } from '../jev';

interface Lane {
  busy: boolean;
  label: string;
  since: number;
  grid: Uint16Array | null;
  gridAt: number;
  gridMax: number;
  lastMs: number;
  bootAt: number;
}

interface Particle {
  x0: number;
  y0: number;
  s: Scored;
  born: number;
}

const HARM = ['#efc9b8', '#e3a288', '#d27a5a', '#b95236', '#8e3320'];
// Drawn on the drawer: off-white, or dark in dark mode (see setTheaterDark).
let INK = '#1c1a17';
let INK2 = '#56514a';
let INK3 = '#8c8579';
let LINE = '#e1dbcf';
let BLUE = '#2a6bc4';
let SUNK = '#ece8df';
let SAFE = '#d3e3d8';
let OFF = '#c9c2b4';
let OFF2 = '#a8a194';
let VEIL = 'rgba(244,241,234,0.78)';
export function setTheaterDark(dark: boolean) {
  [INK, INK2, INK3, LINE, BLUE, SUNK, SAFE, OFF, OFF2, VEIL] = dark
    ? ['#ebe6dc', '#b8b1a4', '#8a8377', '#36332e', '#5b93e0', '#201f1c', '#2c3a31', '#4a463f', '#5d584f', 'rgba(34,33,30,0.8)']
    : ['#1c1a17', '#56514a', '#8c8579', '#e1dbcf', '#2a6bc4', '#ece8df', '#d3e3d8', '#c9c2b4', '#a8a194', 'rgba(244,241,234,0.78)'];
}
const SHORT: Record<string, string> = { large: '2000', medium: '500', small: '250', focused: 'LC', spear: 'SPR', blades: 'BLD', moab: 'MOAB', instant: 'imp', delay: 'dly', airburst: 'air' };

export class JevTheater {
  private g: CanvasRenderingContext2D;
  private lanes: Lane[] = [];
  private dots: Scored[] = [];
  private particles: Particle[] = [];
  private total = 0;
  private queued = 0;
  private sweepAt = -1e9;
  private raf = 0;
  private w = 1;
  private h = 1;
  private dpr = 1;
  minPk = 0.85;
  best: Scored | undefined;
  paused = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.g = canvas.getContext('2d')!;
    this.resize();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.draw();
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  }

  start(total: number, kept: Scored[], workers: number) {
    const now = performance.now();
    if (kept.length < this.dots.length) this.sweepAt = now;
    this.total = total;
    this.queued = total - kept.length;
    this.dots = kept.slice();
    this.particles = [];
    this.lanes = Array.from({ length: workers }, (_, i) => ({ busy: false, label: '', since: now, grid: null, gridAt: 0, gridMax: 1, lastMs: 0, bootAt: now + i * 140 }));
  }

  dispatch(worker: number, cands: Candidate[]) {
    const l = this.lanes[worker];
    if (!l) return;
    const c = cands[cands.length - 1];
    l.busy = true;
    l.since = performance.now();
    l.label = `${cands.length > 1 ? `${cands.length}× ` : ''}${SHORT[c.weapon]} ${SHORT[c.fuze]} ${String(c.heading).padStart(3, '0')}° ${String(Math.floor(c.hour)).padStart(2, '0')}h`;
    this.queued = Math.max(0, this.queued - cands.length);
  }

  job(worker: number, out: Scored[], runs: Uint16Array[], ms: number) {
    const l = this.lanes[worker];
    const now = performance.now();
    if (l) {
      l.busy = false;
      l.grid = runs[runs.length - 1] ?? null;
      l.gridAt = now;
      l.gridMax = Math.max(1, ...(l.grid ?? [1]));
      l.lastMs = ms;
    }
    const y = this.laneY(worker) + this.laneH() / 2;
    out.forEach((s, i) => this.particles.push({ x0: this.laneRight(), y0: y, s, born: now + i * 40 }));
  }

  // ---------------------------------------------------------------- layout

  private laneLeft() {
    return 100;
  }
  private laneRight() {
    return this.w - 190;
  }
  private laneH() {
    return Math.min(30, (this.h - 34) / Math.max(1, this.lanes.length) - 4);
  }
  private laneY(i: number) {
    return 24 + i * (this.laneH() + 4);
  }
  private scatter() {
    return { x: this.w - 172, y: 22, w: 160, h: this.h - 44 };
  }
  private dotXY(s: Scored, maxX: number) {
    const b = this.scatter();
    return { x: b.x + (s.p90 / maxX) * b.w, y: b.y + b.h - s.pk * b.h };
  }

  // ---------------------------------------------------------------- drawing

  private draw() {
    const g = this.g;
    const now = performance.now();
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    g.font = '500 10px "IBM Plex Mono", monospace';
    g.textBaseline = 'middle';

    // The queue: a column of ticks, draining.
    const qh = this.h - 40;
    const ticks = 40;
    const left = this.total ? this.queued / this.total : 0;
    g.fillStyle = INK3;
    g.fillText('QUEUE', 10, 12);
    for (let i = 0; i < ticks; i++) {
      const on = i / ticks < left;
      g.fillStyle = on ? BLUE : LINE;
      g.fillRect(10, 24 + qh - (i + 1) * (qh / ticks) + 1, 52, qh / ticks - 1.5);
    }
    g.fillStyle = INK;
    g.fillText(this.queued.toLocaleString(), 10, this.h - 8);

    // The lanes.
    const L = this.laneLeft();
    const R = this.laneRight();
    const lh = this.laneH();
    this.lanes.forEach((l, i) => {
      const y = this.laneY(i);
      const booting = now < l.bootAt + 260;
      if (now < l.bootAt) return;
      g.fillStyle = booting ? `rgba(42,107,196,${0.12 + 0.25 * Math.random()})` : SUNK;
      g.fillRect(L, y, R - L, lh);
      g.fillStyle = INK3;
      g.fillText(`W${i + 1}`, L - 26, y + lh / 2);
      if (booting) {
        g.fillStyle = INK2;
        g.fillText('spinning up…', L + 8, y + lh / 2);
        return;
      }
      if (l.busy && !this.paused) {
        // A shimmer running along the lane while it works.
        const t = ((now - l.since) / 700) % 1;
        const grd = g.createLinearGradient(L, 0, R, 0);
        const p = Math.min(0.98, Math.max(0.02, t));
        grd.addColorStop(Math.max(0, p - 0.18), 'rgba(42,107,196,0)');
        grd.addColorStop(p, 'rgba(42,107,196,0.3)');
        grd.addColorStop(Math.min(1, p + 0.02), 'rgba(42,107,196,0)');
        g.fillStyle = grd;
        g.fillRect(L, y, R - L, lh);
        g.fillStyle = INK;
        g.fillText(l.label, L + 8, y + lh / 2);
      }
      // The last plan's runs: one cell per simulated strike, dark for none hurt, red for more.
      if (l.grid && now - l.gridAt < 1600) {
        const a = 1 - (now - l.gridAt) / 1600;
        const n = l.grid.length;
        const rows = Math.max(2, Math.min(5, Math.floor(lh / 5)));
        const cols = Math.ceil(n / rows);
        const gx = L + (l.busy ? 150 : 8);
        const cw = Math.max(1.5, Math.min(4, (R - gx - 60) / cols));
        const chh = (lh - 4) / rows;
        g.globalAlpha = a;
        for (let k = 0; k < n; k++) {
          const v = l.grid[k];
          g.fillStyle = v === 0 ? SAFE : HARM[Math.min(HARM.length - 1, Math.floor((v / l.gridMax) * (HARM.length - 1) + 0.5))];
          g.fillRect(gx + Math.floor(k / rows) * cw, y + 2 + (k % rows) * chh, cw - 0.6, chh - 0.6);
        }
        g.globalAlpha = 1;
        g.fillStyle = `rgba(86,81,74,${a})`;
        g.textAlign = 'right';
        g.fillText(`${Math.round(l.lastMs)} ms`, R - 6, y + lh / 2);
        g.textAlign = 'left';
      }
    });

    // The trade-off chart: every result lands here.
    const b = this.scatter();
    const maxX = Math.max(10, ...this.dots.map((d) => d.p90), ...this.particles.map((p) => p.s.p90));
    g.strokeStyle = LINE;
    g.lineWidth = 1;
    g.strokeRect(b.x + 0.5, b.y + 0.5, b.w, b.h);
    g.fillStyle = 'rgba(29,138,58,0.07)';
    g.fillRect(b.x, b.y, b.w, b.h * (1 - this.minPk));
    g.strokeStyle = INK3;
    g.setLineDash([3, 3]);
    g.beginPath();
    g.moveTo(b.x, b.y + b.h * (1 - this.minPk));
    g.lineTo(b.x + b.w, b.y + b.h * (1 - this.minPk));
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = INK3;
    g.fillText('TARGET DESTROYED ↑', b.x, 12);
    g.textAlign = 'right';
    g.fillText('HARM →', b.x + b.w, this.h - 8);
    g.textAlign = 'left';
    for (const d of this.dots) {
      const p = this.dotXY(d, maxX);
      g.fillStyle = d.pk >= this.minPk ? BLUE : OFF;
      g.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }
    if (this.best) {
      const p = this.dotXY(this.best, maxX);
      const pulse = 5 + Math.sin(now / 180) * 1.5;
      g.strokeStyle = INK;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(p.x, p.y, pulse, 0, Math.PI * 2);
      g.stroke();
    }
    // Results in flight, from their lane to their place on the chart.
    const still: Particle[] = [];
    for (const pt of this.particles) {
      const t = (now - pt.born) / 520;
      if (t < 0) {
        still.push(pt);
        continue;
      }
      const to = this.dotXY(pt.s, maxX);
      if (t >= 1) {
        this.dots.push(pt.s);
        continue;
      }
      const e = t * t * (3 - 2 * t);
      const x = pt.x0 + (to.x - pt.x0) * e;
      const y = pt.y0 + (to.y - pt.y0) * e - Math.sin(Math.PI * e) * 18;
      g.fillStyle = pt.s.pk >= this.minPk ? BLUE : OFF2;
      g.beginPath();
      g.arc(x, y, 2.5, 0, Math.PI * 2);
      g.fill();
      still.push(pt);
    }
    this.particles = still;
    // A sweep when the assumptions change and everything is re-scored.
    const st = (now - this.sweepAt) / 600;
    if (st >= 0 && st < 1) {
      g.fillStyle = `rgba(227,135,108,${0.35 * (1 - st)})`;
      g.fillRect(0, 0, this.w * st, this.h);
    }
    if (this.paused && this.lanes.length) {
      g.fillStyle = VEIL;
      g.fillRect(L, 20, R - L, this.h - 30);
      g.fillStyle = INK;
      g.textAlign = 'center';
      g.fillText('PAUSED', (L + R) / 2, this.h / 2);
      g.textAlign = 'left';
    }
  }
}
