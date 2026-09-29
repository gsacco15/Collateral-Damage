// The map: the paper city seen from above, the people in it, the plan's overlays, labels found by exploring,
// and the strike. A big world-scale cache keeps panning smooth; a sharp view-scale render follows when it settles.
import {
  BRIDGE_RUIN,
  buildingAt,
  buildingDist,
  collapse,
  contour,
  destroys,
  effect,
  harm,
  inBuilding,
  lobe,
  occlusion,
  placeName,
  riverX,
  rng,
  shownCount,
  structureAt,
  targetOf,
  weapon,
  type Building,
  type DangerField,
  type Effect,
  type Estimate,
  type Place,
  type Plan,
  type Population,
  type Rect,
  type World,
} from '../jev';
import { Crowd, type Car, type Walker } from './crowd';
import { drawCity, drawCityTop, finishCity, type CityOpts } from './drawCity';
import { C, hexA, mix, nightness, sun, type Sun } from './paper';

export interface ViewState {
  cx: number;
  cy: number;
  zoom: number;
}

export interface Outcome {
  ix: number;
  iy: number;
  destroyed: boolean;
  damaged: number[];
  hurtSlots: Record<number, number[]>;
  hurtWalkers: number[];
  hurtCars: number[];
  count: number;
  secondary: string[]; // what else went off
}

export interface Layers {
  people: boolean;
  pattern: boolean;
  circle: boolean;
  impacts: boolean;
  labels: boolean;
  protect: boolean;
  danger: boolean;
}

export interface MapFrame {
  world: World;
  pop: Population;
  plan: Plan;
  est: Estimate | null;
  field: DangerField | null;
  layers: Layers;
  circleR: number;
  pulseCircle?: boolean; // the guide is pointing at it
  ghost: Plan | null;
  trail: Plan[]; // the plans Jev tried most recently, newest last
  spotMode: boolean;
  targetMode?: boolean; // clicking picks a new target
  spotlight?: { ids: number[]; name: string; tone?: 'protect' | 'hazard' | 'target' } | null; // the guide pointing at a place
  retarget?: { x: number; y: number; bid: number | null } | null; // dragging the target onto another building
  hover: number | null;
  selected: number | null;
  outcome: Outcome | null;
  ruins: number[]; // destroyed by earlier strikes
  aimDrag: boolean;
  headingDrag: boolean;
}

const STACKED = new Set(['home', 'apartment', 'villa', 'office', 'hospital']);
export const slotZ = (b: Building, i: number) => ((STACKED.has(b.kind) ? i % b.floors : 0) * 3.1 + 1.5);
const WORLD_SCALE = 2; // pixels per metre in the pan cache
const HANDLE_PX = 70; // how far out the approach handle sits, in screen pixels

interface StrikeFx {
  plan: Plan;
  outcome: Outcome;
  t: number;
  impactAt: number;
  impacted: boolean;
  scraps: { x: number; y: number; z: number; vx: number; vy: number; vz: number; rot: number; vr: number; size: number; color: string }[];
  puffs: { x: number; y: number; r: number; grow: number; life: number; seed: number; dark: number }[];
}

export class MapView {
  view: ViewState = { cx: 225, cy: 470, zoom: 3 };
  crowd: Crowd;
  discovered = new Set<string>();
  onDiscover: ((p: Place) => void) | null = null;
  onImpact: ((o: Outcome) => void) | null = null;
  onSettled: (() => void) | null = null;
  time = 0;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private cw = 1;
  private ch = 1;
  private worldCache = document.createElement('canvas');
  private worldKey = '';
  private worldBuiltAt = 0;
  private viewCache = document.createElement('canvas');
  private viewKey = '';
  private lastMove = 0;
  private lastCam = '';
  private tex: HTMLCanvasElement;
  private fx: StrikeFx | null = null;
  /** After a strike: the column of smoke that drifts off downwind for about a minute, even after "Next target". */
  private smoke: { x: number; y: number; born: number; dark: number } | null = null;
  private shake = 0;
  private lastPop: Population | null = null;
  private rays: { key: string; full: Float32Array; clear: Float32Array } | null = null;
  private ghostRays: { key: string; full: Float32Array; clear: Float32Array } | null = null;
  private fieldImg: { f: DangerField; img: HTMLCanvasElement; lines: [number, Float32Array][] } | null = null;

  constructor(
    public canvas: HTMLCanvasElement,
    public world: World,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.crowd = new Crowd(world);
    this.tex = paperTexture();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cw = Math.max(1, rect.width);
    this.ch = Math.max(1, rect.height);
    LABEL_K = this.cw < 600 || this.ch < 420 ? 0.8 : 1; // labels a little smaller on a phone, either way up
    this.canvas.width = Math.round(this.cw * this.dpr);
    this.canvas.height = Math.round(this.ch * this.dpr);
    this.viewKey = '';
    this.clampView();
  }

  /** CSS pixels per metre and offset. zoom 1 fits the whole city. */
  cam() {
    const base = Math.min(this.cw / this.world.city.w, this.ch / this.world.city.h); // zoom 1 fits the city; the desert is off to the east
    const s = base * this.view.zoom;
    return { s, ox: this.cw / 2 - this.view.cx * s, oy: this.ch / 2 - this.view.cy * s };
  }
  toWorld(px: number, py: number) {
    const { s, ox, oy } = this.cam();
    return { x: (px - ox) / s, y: (py - oy) / s };
  }
  toScreen(x: number, y: number) {
    const { s, ox, oy } = this.cam();
    return { x: x * s + ox, y: y * s + oy };
  }
  clampView() {
    const v = this.view;
    v.zoom = Math.max(0.7, Math.min(14, v.zoom));
    const { s } = this.cam();
    const hw = this.cw / 2 / s;
    const hh = this.ch / 2 / s;
    const m = 40;
    v.cx = hw * 2 >= this.world.w + m * 2 ? this.world.w / 2 : Math.max(hw - m, Math.min(this.world.w + m - hw, v.cx));
    v.cy = hh * 2 >= this.world.h + m * 2 ? this.world.h / 2 : Math.max(hh - m, Math.min(this.world.h + m - hh, v.cy));
  }
  /** The part of the world on screen. */
  viewRect(): Rect {
    const a = this.toWorld(0, 0);
    const b = this.toWorld(this.cw, this.ch);
    return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
  }

  /** Where the approach handle is: behind the aim point, on the way in. */
  handleWorld(plan: Plan) {
    const { s } = this.cam();
    const h = (plan.heading * Math.PI) / 180;
    return { x: plan.aimX - (Math.sin(h) * HANDLE_PX) / s, y: plan.aimY + (Math.cos(h) * HANDLE_PX) / s };
  }

  buildingAt(x: number, y: number) {
    return buildingAt(this.world, x, y);
  }

  strike(plan: Plan, pop: Population, seed: number) {
    const outcome = resolveStrike(this.world, plan, pop, this.crowd.visible(), this.crowd.cars, seed);
    this.fx = { plan, outcome, t: 0, impactAt: 2.6, impacted: false, scraps: [], puffs: [] };
    return outcome;
  }
  clearStrike() {
    this.fx = null;
    for (const w of this.crowd.walkers) {
      w.hurt = false;
      w.flee = 0;
    }
    for (const c of this.crowd.cars) c.hurt = false;
  }
  strikeTime() {
    return this.fx ? this.fx.t : null;
  }

  // ---------------------------------------------------------------- the static city

  private cityOpts(f: MapFrame, damaged: Set<number>, view: Rect, scale: number): CityOpts {
    const o = f.outcome;
    const crater = o ? { x: o.ix, y: o.iy, r: weapon(this.fx?.plan.weapon ?? f.plan.weapon).blast * 0.35 } : null;
    return { hour: f.plan.hour, pop: f.pop, damaged, crater, view, scale };
  }

  private render(g: CanvasRenderingContext2D, width: number, height: number, t: [number, number, number, number, number, number], opts: CityOpts, sharp: boolean) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, width, height);
    g.setTransform(...t);
    const shadow = document.createElement('canvas');
    shadow.width = width;
    shadow.height = height;
    const sg = shadow.getContext('2d')!;
    sg.setTransform(...t);
    drawCity(g, this.world, opts, sg);
    // Soft, tinted shadows.
    const sh = sun(opts.hour);
    const tint = document.createElement('canvas');
    tint.width = width;
    tint.height = height;
    const tg = tint.getContext('2d')!;
    tg.drawImage(shadow, 0, 0);
    tg.globalCompositeOperation = 'source-in';
    tg.fillStyle = sh.day ? '#5a4332' : '#1f2748';
    tg.fillRect(0, 0, width, height);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = Math.min(0.85, sh.alpha * 1.75);
    g.globalCompositeOperation = 'multiply';
    if ('filter' in g) g.filter = `blur(${Math.max(1, t[0] * 0.7)}px)`;
    g.drawImage(tint, 0, 0);
    g.restore();
    g.setTransform(...t);
    drawCityTop(g, this.world, opts);
    const pattern = g.createPattern(this.tex, 'repeat');
    finishCity(g, this.world, opts, pattern, width, height, t);
    if (sharp && 'filter' in g) {
      // Tilt-shift: soften the top and bottom of the frame, like a macro lens on a model.
      const tmp = document.createElement('canvas');
      tmp.width = width;
      tmp.height = height;
      const t2 = tmp.getContext('2d')!;
      t2.filter = `blur(${2 * this.dpr}px)`;
      t2.drawImage(g.canvas, 0, 0);
      t2.filter = 'none';
      t2.globalCompositeOperation = 'destination-in';
      const grd = t2.createLinearGradient(0, 0, 0, height);
      grd.addColorStop(0, 'rgba(0,0,0,1)');
      grd.addColorStop(0.16, 'rgba(0,0,0,0)');
      grd.addColorStop(0.84, 'rgba(0,0,0,0)');
      grd.addColorStop(1, 'rgba(0,0,0,1)');
      t2.fillStyle = grd;
      t2.fillRect(0, 0, width, height);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(tmp, 0, 0);
    }
  }

  private ensureCaches(f: MapFrame, damaged: Set<number>) {
    const now = performance.now();
    const dmg = [...damaged].join('.');
    const hourKey = (Math.round(f.plan.hour * 4) / 4).toFixed(2);
    const crater = f.outcome ? `${f.outcome.ix.toFixed(1)}` : '';
    // World cache: rebuilt when the hour or the damage changes, at most every 180 ms while scrubbing.
    const wk = `${hourKey}|${dmg}|${crater}`;
    if (wk !== this.worldKey && (now - this.worldBuiltAt > 180 || !this.worldKey || dmg !== this.worldKey.split('|')[1])) {
      this.worldKey = wk;
      this.worldBuiltAt = now;
      const m = 40;
      const c = this.worldCache;
      c.width = (this.world.w + m * 2) * WORLD_SCALE;
      c.height = (this.world.h + m * 2) * WORLD_SCALE;
      const g = c.getContext('2d')!;
      this.render(g, c.width, c.height, [WORLD_SCALE, 0, 0, WORLD_SCALE, m * WORLD_SCALE, m * WORLD_SCALE], this.cityOpts(f, damaged, { x: -m, y: -m, w: this.world.w + m * 2, h: this.world.h + m * 2 }, WORLD_SCALE), false);
    }
    // Sharp view cache: once the camera has been still for a moment.
    const { s, ox, oy } = this.cam();
    const camKey = `${this.cw}|${this.ch}|${this.dpr}|${s.toFixed(4)}|${ox.toFixed(1)}|${oy.toFixed(1)}`;
    if (camKey !== this.lastCam) {
      this.lastCam = camKey;
      this.lastMove = now;
    }
    const vk = `${camKey}|${wk}`;
    if (vk !== this.viewKey && now - this.lastMove > 220 && wk === this.worldKey) {
      this.viewKey = vk;
      const c = this.viewCache;
      c.width = this.canvas.width;
      c.height = this.canvas.height;
      const g = c.getContext('2d')!;
      const d = this.dpr;
      this.render(g, c.width, c.height, [s * d, 0, 0, s * d, ox * d, oy * d], this.cityOpts(f, damaged, this.viewRect(), s * d), true);
    }
    return vk === this.viewKey;
  }

  // ---------------------------------------------------------------- per frame

  frame(f: MapFrame, dt: number) {
    this.time += dt;
    if (f.pop !== this.lastPop) {
      this.crowd.sync(f.pop, this.lastPop);
      this.lastPop = f.pop;
    }
    const fx = this.fx;
    if (fx) this.stepFx(fx, dt);
    this.crowd.broken = f.ruins.includes(BRIDGE_RUIN) || !!f.outcome?.damaged.includes(BRIDGE_RUIN) ? this.world.targets.find((t) => t.id === 'bridge')!.rect : null;
    this.crowd.step(dt, fx && fx.impacted ? { x: fx.outcome.ix, y: fx.outcome.iy, t: fx.t - fx.impactAt } : null, f.pop);
    this.explore(f);

    const shown = f.outcome;
    const damaged = new Set([...f.ruins, ...(shown ? shown.damaged : [])]);
    const sharp = this.ensureCaches(f, damaged);

    const g = this.ctx;
    const d = this.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = C.street;
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const shake = this.shake > 0 ? this.shake : 0;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const sx = shake ? (Math.random() - 0.5) * 14 * shake : 0;
    const sy = shake ? (Math.random() - 0.5) * 14 * shake : 0;
    const { s, ox, oy } = this.cam();
    if (sharp) g.drawImage(this.viewCache, sx * d, sy * d);
    else {
      const m = 40;
      g.imageSmoothingQuality = 'high';
      g.setTransform((s * d) / WORLD_SCALE, 0, 0, (s * d) / WORLD_SCALE, (ox + sx - m * s) * d, (oy + sy - m * s) * d);
      g.drawImage(this.worldCache, 0, 0);
    }
    g.setTransform(s * d, 0, 0, s * d, (ox + sx) * d, (oy + sy) * d);
    const px = 1 / s; // one CSS pixel in metres
    const view = this.viewRect();
    const night = nightness(f.plan.hour);
    const sh = sun(f.plan.hour);
    const plan = f.plan;
    const striking = !!fx && !fx.impacted;

    for (const car of this.crowd.cars) if (inView(view, car.x, car.y)) drawCar(g, car, night, sh, damaged.size > 0 && car.hurt);

    if (f.layers.protect && !shown) this.drawProtected(g, px, view);
    if (f.layers.danger && f.field && !shown) this.drawField(g, f.field, px);
    if (f.layers.pattern && !shown) {
      this.rays = rayCache(this.rays, this.world, plan);
      drawPattern(g, plan, this.rays, C.red, 1, px, this.time);
    }
    if (f.ghost) {
      this.ghostRays = rayCache(this.ghostRays, this.world, f.ghost);
      drawPattern(g, f.ghost, this.ghostRays, C.jev, 0.9, px, this.time);
    }
    if (f.layers.circle && !shown) {
      g.save();
      if (f.pulseCircle) {
        // Breathe, so the eye finds it: a soft wash and a ring that swells and fades.
        const k = (this.time * 0.8) % 1;
        g.fillStyle = 'rgba(29,27,24,0.06)';
        g.beginPath();
        g.arc(plan.aimX, plan.aimY, f.circleR, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = `rgba(228,73,47,${0.55 * (1 - k)})`;
        g.lineWidth = (2 + 6 * k) * px;
        g.beginPath();
        g.arc(plan.aimX, plan.aimY, f.circleR * (1 + 0.04 * k), 0, Math.PI * 2);
        g.stroke();
      }
      g.strokeStyle = 'rgba(29,27,24,0.7)';
      g.lineWidth = 1.2 * px;
      g.setLineDash([5 * px, 4 * px]);
      g.lineDashOffset = -this.time * 6 * px;
      g.beginPath();
      g.arc(plan.aimX, plan.aimY, f.circleR, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      const a = -Math.PI * 0.78;
      label(g, plan.aimX + Math.cos(a) * f.circleR, plan.aimY + Math.sin(a) * f.circleR, `within reach · ${f.circleR} m`, px, { small: true, plain: true });
      g.restore();
    }
    if (f.layers.impacts && f.est && !shown) {
      g.fillStyle = 'rgba(196,72,44,0.55)';
      const n = f.est.impacts.length / 2;
      const show = Math.min(n, Math.floor((this.time * 900) % (n + 200)) + 60);
      for (let i = 0; i < Math.min(n, show); i++) {
        g.beginPath();
        g.arc(f.est.impacts[i * 2], f.est.impacts[i * 2 + 1], Math.max(0.35, 1.6 * px), 0, Math.PI * 2);
        g.fill();
      }
    }

    // People inside, seen as if the roofs were glass. Tinted by Jev's expected harm for their building.
    if (f.layers.people && s > 1.1) {
      const rr = Math.max(0.35, Math.min(0.7, 1.8 * px));
      for (const b of this.world.buildings) {
        if (!inView(view, b.cx, b.cy, 40)) continue;
        const n = shownCount(f.pop, b);
        if (!n) continue;
        const hurt = shown ? new Set(shown.hurtSlots[b.id] ?? []) : null;
        const known = f.pop.observed[b.id] >= 0;
        const base = known ? '#1b3a5c' : '#2a2622';
        let col = base;
        if (!shown && f.est && f.layers.pattern) {
          const exp = f.pop.observed[b.id] >= 0 ? f.pop.observed[b.id] : f.pop.expected[b.id];
          const p = exp > 0 ? f.est.byBuilding[b.id] / exp : 0;
          if (p > 0.01) col = mix(base, '#d0452a', Math.min(1, p * 2));
        }
        g.fillStyle = col;
        g.beginPath();
        for (let i = 0; i < n; i++) {
          if (hurt?.has(i)) continue;
          const x = b.slots[i * 2];
          const y = b.slots[i * 2 + 1];
          g.moveTo(x + rr, y);
          g.arc(x, y, rr, 0, Math.PI * 2);
        }
        g.fill();
        if (hurt?.size) {
          g.strokeStyle = C.red;
          g.lineWidth = Math.max(0.3, 1.3 * px);
          g.beginPath();
          for (const i of hurt) {
            const x = b.slots[i * 2];
            const y = b.slots[i * 2 + 1];
            g.moveTo(x + rr * 1.4, y);
            g.arc(x, y, rr * 1.4, 0, Math.PI * 2);
          }
          g.stroke();
        }
      }
    }

    // People on foot.
    const hurtW = new Set(shown?.hurtWalkers ?? []);
    const hurtC = new Set(shown?.hurtCars ?? []);
    for (const c of this.crowd.cars) if (hurtC.has(c.id)) c.hurt = true;
    if (s > 0.9)
      for (const w of this.crowd.visible()) {
        if (hurtW.has(w.id)) w.hurt = true;
        if (inView(view, w.x, w.y)) drawFigure(g, w, this.time, sh, night, px);
      }

    if (f.layers.labels) this.drawLabels(g, f, px, view);

    if (f.selected != null) {
      const b = this.world.buildings[f.selected];
      const top = Math.min(...b.rects.map((q) => q.y));
      g.strokeStyle = C.ink;
      g.lineWidth = 1.2 * px;
      for (const q of b.rects) g.strokeRect(q.x - 0.8, q.y - 0.8, q.w + 1.6, q.h + 1.6);
      leader(g, b.cx, b.cy, b.cx, top - 10 * px * 3, px);
      label(g, b.cx, top - 10 * px * 3, placeName(b), px, {});
    }
    const pick = f.retarget ? f.retarget.bid : f.targetMode ? f.hover : null;
    if (f.hover != null && f.hover !== f.selected && pick == null) {
      const b = this.world.buildings[f.hover];
      g.strokeStyle = f.spotMode ? C.jev : 'rgba(29,27,24,0.3)';
      g.lineWidth = 1.1 * px;
      for (const q of b.rects) g.strokeRect(q.x - 0.6, q.y - 0.6, q.w + 1.2, q.h + 1.2);
    }
    // The guide pointing at a place: a warm glow that breathes, and its name.
    if (f.spotlight?.ids.length) {
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 2.6);
      const col = f.spotlight.tone === 'protect' ? '45,111,146' : f.spotlight.tone === 'hazard' ? '184,120,26' : '200,55,43';
      let top = Infinity;
      let cx = 0;
      let n = 0;
      for (const id of f.spotlight.ids) {
        const b = this.world.buildings[id];
        if (!b) continue;
        for (const q of b.rects) {
          g.fillStyle = `rgba(${col},${0.1 + 0.08 * pulse})`;
          g.fillRect(q.x - 1, q.y - 1, q.w + 2, q.h + 2);
          g.strokeStyle = `rgba(${col},${0.12 + 0.1 * pulse})`;
          g.lineWidth = 9 * px;
          g.strokeRect(q.x - 3, q.y - 3, q.w + 6, q.h + 6);
          g.strokeStyle = `rgba(${col},${0.65 + 0.3 * pulse})`;
          g.lineWidth = 2 * px;
          g.strokeRect(q.x - 1.5, q.y - 1.5, q.w + 3, q.h + 3);
          top = Math.min(top, q.y);
        }
        cx += b.cx;
        n++;
      }
      if (n) label(g, cx / n, top - 14 * px, f.spotlight.name, px, { tone: f.spotlight.tone });
    }
    // Target mode: the building under the pointer lights up red, ready to be picked.
    if (pick != null && pick !== targetOf(this.world, plan.target).buildingId && this.world.buildings[pick] && !f.ruins.includes(pick)) {
      const b = this.world.buildings[pick];
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 5);
      g.fillStyle = `rgba(200,40,30,${0.1 + 0.08 * pulse})`;
      for (const q of b.rects) g.fillRect(q.x, q.y, q.w, q.h);
      g.strokeStyle = '#c8281e';
      g.lineWidth = 2 * px;
      g.setLineDash([5 * px, 3 * px]);
      for (const q of b.rects) g.strokeRect(q.x - 1, q.y - 1, q.w + 2, q.h + 2);
      g.setLineDash([]);
    }
    // Dragging the target: a dashed line from where it is to where it's going.
    if (f.retarget) {
      const c = targetOf(this.world, plan.target).rect;
      const x0 = c.x + c.w / 2;
      const y0 = c.y + c.h / 2;
      g.strokeStyle = 'rgba(200,40,30,0.8)';
      g.lineWidth = 1.6 * px;
      g.setLineDash([6 * px, 4 * px]);
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(f.retarget.x, f.retarget.y);
      g.stroke();
      g.setLineDash([]);
      drawAim(g, f.retarget.x, f.retarget.y, px, 1.1, '#c8281e');
    }

    // Jev's trail: the last plans it tried, fading.
    f.trail.forEach((tp, i) => {
      const a = ((i + 1) / f.trail.length) * 0.6;
      const h = (tp.heading * Math.PI) / 180;
      g.strokeStyle = hexA(C.jev, a);
      g.lineWidth = 1.4 * px;
      g.beginPath();
      g.arc(tp.aimX, tp.aimY, 5 * px, 0, Math.PI * 2);
      g.moveTo(tp.aimX - Math.sin(h) * 30 * px, tp.aimY + Math.cos(h) * 30 * px);
      g.lineTo(tp.aimX - Math.sin(h) * 7 * px, tp.aimY + Math.cos(h) * 7 * px);
      g.stroke();
    });
    if (!shown && !striking) {
      drawAim(g, plan.aimX, plan.aimY, px, f.aimDrag ? 1.25 : 1, C.ink);
      // The approach handle: drag it around the aim to choose the direction of attack.
      const hp = this.handleWorld(plan);
      const h = (plan.heading * Math.PI) / 180;
      g.strokeStyle = 'rgba(29,27,24,0.5)';
      g.lineWidth = 1.2 * px;
      g.beginPath();
      g.arc(plan.aimX, plan.aimY, HANDLE_PX * px, 0, Math.PI * 2);
      g.setLineDash([2 * px, 4 * px]);
      g.stroke();
      g.setLineDash([]);
      // A folded paper plane, floating a little above its shadow. Grab it to turn the approach.
      g.fillStyle = 'rgba(251,250,246,0.55)';
      g.strokeStyle = f.headingDrag ? C.red : 'rgba(29,27,24,0.35)';
      g.lineWidth = (f.headingDrag ? 2 : 1) * px;
      g.beginPath();
      g.arc(hp.x, hp.y, 15 * px, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      const lift = (f.headingDrag ? 7 : 5) + Math.sin(this.time * 2) * 0.8;
      paperPlane(g, hp.x + lift * 0.7 * px, hp.y + lift * px, h, 13 * px, true);
      paperPlane(g, hp.x, hp.y, h, 13 * px, false);
    }
    if (f.ghost) drawAim(g, f.ghost.aimX, f.ghost.aimY, px, 0.85, C.jev);
    if (!shown && f.layers.pattern) drawTrack(g, plan, px, this.world, this.time, false);
    this.drawBoats(g, night);
    if (fx) this.drawFx(g, fx, px);
    this.drawSmoke(g, night);
    this.drawChimneys(g, f.plan.hour, damaged, night);
    if (night < 0.5) this.drawBirds(g, px, 1 - night * 2);

    // Vignette.
    g.setTransform(1, 0, 0, 1, 0, 0);
    const W = this.canvas.width;
    const H = this.canvas.height;
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(30,20,10,0)');
    vg.addColorStop(1, 'rgba(30,20,10,0.22)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
  }

  // ---------------------------------------------------------------- exploring

  private explore(f: MapFrame) {
    const z = this.view.zoom;
    if (z < 2) return;
    const reach = 520 / z;
    for (const p of this.world.places) {
      if (this.discovered.has(p.id)) continue;
      const near = Math.hypot(p.x - this.view.cx, p.y - this.view.cy) < (p.kind === 'district' ? reach * 2 : reach);
      const hovered = f.hover != null && p.id === `b:${f.hover}`;
      if (near || hovered) {
        this.discovered.add(p.id);
        this.onDiscover?.(p);
      }
    }
  }

  private drawLabels(g: CanvasRenderingContext2D, f: MapFrame, px: number, view: Rect) {
    const z = this.view.zoom;
    // Districts: big, quiet, serif; always there from far away, fading as you get close.
    const dA = z < 2.2 ? 1 : Math.max(0, 1 - (z - 2.2) / 1.5);
    if (dA > 0.02)
      for (const d of this.world.districts) {
        const known = this.discovered.has(`d:${d.id}`);
        g.save();
        g.globalAlpha = dA * (known ? 0.92 : 0.6);
        g.font = `italic 500 ${22 * px * LABEL_K}px "Playfair Display", Georgia, serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = 'rgba(251,248,241,0.9)';
        const text = d.name;
        const tw = g.measureText(text).width;
        g.fillRect(d.x - tw / 2 - 8 * px, d.y - 15 * px, tw + 16 * px, 30 * px);
        g.fillStyle = C.ink;
        g.fillText(text, d.x, d.y + 1 * px);
        g.restore();
      }
    // Streets: small capitals along the road, once you're close enough to read them.
    if (z >= 2.4) {
      g.save();
      g.font = `600 ${9.5 * px * LABEL_K}px "IBM Plex Sans", system-ui, sans-serif`;
      g.fillStyle = 'rgba(251,248,241,0.92)';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      // Fixed spots along each street, every 180 m, like a printed map: they don't slide as you pan.
      for (const rd of this.world.roads) {
        if (!this.discovered.has(`r:${rd.name}`)) continue;
        const q = rd.rect;
        const len = rd.horizontal ? q.w : q.h;
        const text = rd.name.toUpperCase().split('').join(' ');
        const half = (g.measureText(text).width / 2) * 1.05;
        if (len < half * 2 + 10) continue;
        const n = Math.max(1, Math.round(len / 180));
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n;
          const x = rd.horizontal ? q.x + q.w * t : q.x + q.w / 2;
          const y = rd.horizontal ? q.y + q.h / 2 : q.y + q.h * t;
          if (!inView(view, x, y, 0)) continue;
          g.save();
          g.translate(x, y);
          if (!rd.horizontal) g.rotate(-Math.PI / 2);
          g.fillText(text, 0, 0.3 * px);
          g.restore();
        }
      }
      g.restore();
    }
    // Landmarks: named once discovered, a question mark before.
    if (z >= 1.6)
      for (const p of this.world.places) {
        if (p.kind !== 'landmark' || !inView(view, p.x, p.y, 20)) continue;
        const b = p.id.startsWith('b:') ? this.world.buildings[+p.id.slice(2)] : null;
        if (b && f.spotlight?.ids.includes(b.id)) continue; // the guide's own label is showing
        const top = b ? Math.min(...b.rects.map((q) => q.y)) : p.y;
        if (!this.discovered.has(p.id)) {
          g.save();
          g.fillStyle = 'rgba(251,248,241,0.85)';
          g.strokeStyle = 'rgba(29,27,24,0.5)';
          g.lineWidth = px;
          g.setLineDash([2 * px, 2 * px]);
          g.beginPath();
          g.arc(p.x, p.y, 7 * px, 0, Math.PI * 2);
          g.fill();
          g.stroke();
          g.setLineDash([]);
          g.font = `700 ${9 * px}px "IBM Plex Sans", sans-serif`;
          g.fillStyle = C.ink;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText('?', p.x, p.y + 0.5 * px);
          g.restore();
          continue;
        }
        const ly = top - 14 * px;
        leader(g, p.x, p.y, p.x, ly, px);
        const tone = b?.protected || p.note === 'Protected site' ? 'protect' : b?.hazard ? 'hazard' : undefined;
        label(g, p.x, ly, p.name, px, { tone });
      }
    // Targets: always named, outlined in red.
    for (const t of this.world.targets) {
      const q = t.rect;
      if (!inView(view, q.x + q.w / 2, q.y + q.h / 2, 60)) continue;
      const on = t.id === f.plan.target;
      g.save();
      g.strokeStyle = hexA(C.red, on ? 0.9 : 0.45);
      g.lineWidth = (on ? 1.6 : 1) * px;
      g.setLineDash([4 * px, 3 * px]);
      g.strokeRect(q.x - 1.5, q.y - 1.5, q.w + 3, q.h + 3);
      g.restore();
      if (on || z >= 1.6) {
        const lx = q.x + q.w / 2;
        const ly = q.y + q.h + 12 * px;
        label(g, lx, ly, on ? `Target: ${t.short}` : t.short, px, { tone: 'target', small: !on });
      }
    }
  }

  /** The danger field: one red hue, stronger where standing in the open is more likely to be fatal. */
  private drawField(g: CanvasRenderingContext2D, field: DangerField, px: number) {
    if (this.fieldImg?.f !== field) {
      const img = document.createElement('canvas');
      img.width = field.cols;
      img.height = field.rows;
      const ig = img.getContext('2d')!;
      const data = ig.createImageData(field.cols, field.rows);
      for (let k = 0; k < field.p.length; k++) {
        const v = field.p[k];
        if (Number.isNaN(v) || v < 0.01) continue;
        const t = Math.min(1, v);
        data.data[k * 4] = Math.round(236 - 60 * t);
        data.data[k * 4 + 1] = Math.round(120 - 80 * t);
        data.data[k * 4 + 2] = Math.round(80 - 40 * t);
        data.data[k * 4 + 3] = Math.round(255 * Math.min(0.8, 0.18 + Math.sqrt(t) * 0.62));
      }
      ig.putImageData(data, 0, 0);
      this.fieldImg = { f: field, img, lines: [0.1, 0.5].map((l) => [l, contour(field, l)] as [number, Float32Array]) };
    }
    const { img, lines } = this.fieldImg;
    g.save();
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, field.x0, field.y0, field.cols * field.cell, field.rows * field.cell);
    for (const [level, segs] of lines) {
      g.strokeStyle = level >= 0.5 ? 'rgba(120,20,10,0.9)' : 'rgba(150,50,25,0.75)';
      g.lineWidth = (level >= 0.5 ? 1.8 : 1.2) * px;
      g.beginPath();
      for (let i = 0; i < segs.length; i += 4) {
        g.moveTo(segs[i], segs[i + 1]);
        g.lineTo(segs[i + 2], segs[i + 3]);
      }
      g.stroke();
      // Label each ring once, at its northernmost point.
      let best = -1;
      for (let i = 0; i < segs.length; i += 4) if (best < 0 || segs[i + 1] < segs[best + 1]) best = i;
      if (best >= 0) label(g, segs[best], segs[best + 1], level >= 0.5 ? '1 in 2' : '1 in 10', px, { small: true, plain: true });
    }
    g.restore();
  }

  private drawProtected(g: CanvasRenderingContext2D, px: number, view: Rect) {
    g.save();
    g.setLineDash([3 * px, 2.5 * px]);
    for (const b of this.world.buildings) {
      if (!(b.protected || b.hazard) || !inView(view, b.cx, b.cy, 60)) continue;
      g.strokeStyle = b.protected ? C.protect : C.hazard;
      g.fillStyle = hexA(b.protected ? C.protect : C.hazard, 0.1);
      g.lineWidth = 1.4 * px;
      for (const q of b.rects) {
        if (b.round) {
          g.beginPath();
          g.arc(q.x + q.w / 2, q.y + q.h / 2, q.w / 2 + 2, 0, Math.PI * 2);
          g.fill();
          g.stroke();
        } else {
          g.fillRect(q.x - 2, q.y - 2, q.w + 4, q.h + 4);
          g.strokeRect(q.x - 2, q.y - 2, q.w + 4, q.h + 4);
        }
      }
    }
    for (const s of this.world.spaces) {
      if (!s.protected) continue;
      g.strokeStyle = C.protect;
      g.lineWidth = 1.2 * px;
      g.strokeRect(s.rect.x - 1, s.rect.y - 1, s.rect.w + 2, s.rect.h + 2);
    }
    g.restore();
  }

  // ---------------------------------------------------------------- the strike

  private stepFx(fx: StrikeFx, dt: number) {
    fx.t += dt;
    const o = fx.outcome;
    if (!fx.impacted && fx.t >= fx.impactAt) {
      fx.impacted = true;
      this.smoke = { x: o.ix, y: o.iy, born: this.time, dark: o.secondary.length ? 1 : 0.55 };
      const r = rng(Math.round(o.ix * 100 + o.iy));
      const w = weapon(fx.plan.weapon);
      this.shake = Math.min(1.4, 0.25 + w.blast / 18); // a small bomb nudges the table; a big one rattles it
      const e = effect(fx.plan, structureAt(this.world, o.ix, o.iy));
      const n = 70 + Math.round(w.blast * 6);
      const cols = ['#f3f1ec', '#c99f69', '#8f8781', '#e7ddcc', '#d6d1c7', '#6b5a45'];
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2;
        const g2 = lobe(fx.plan.heading, Math.sin(a), -Math.cos(a));
        const v = (6 + r() * 26) * (0.5 + g2) * (fx.plan.fuze === 'delay' ? 0.55 : 1) * Math.sqrt(e.blast / 10);
        fx.scraps.push({ x: o.ix, y: o.iy, z: 0, vx: Math.sin(a) * v, vy: -Math.cos(a) * v, vz: 10 + r() * 22, rot: r() * 6, vr: (r() - 0.5) * 18, size: 0.6 + r() * 1.8, color: cols[Math.floor(r() * cols.length)] });
      }
      const puffs = 14 + Math.round(w.blast * 1.2);
      for (let i = 0; i < puffs; i++) {
        const a = r() * Math.PI * 2;
        const d = r() * w.blast * 0.9;
        fx.puffs.push({ x: o.ix + Math.cos(a) * d, y: o.iy + Math.sin(a) * d, r: 2 + r() * 3, grow: (3 + r() * 5) * Math.sqrt(w.blast / 10), life: 0, seed: r() * 1000, dark: r() });
      }
      // Secondary fires: dark smoke over whatever else went off.
      for (const id of o.damaged) {
        const b = this.world.buildings[id];
        if (!b) continue;
        if (!b.hazard && !(b.id === targetOf(this.world, fx.plan.target).buildingId && o.secondary.length)) continue;
        for (let i = 0; i < 6; i++) fx.puffs.push({ x: b.cx + (r() - 0.5) * 10, y: b.cy + (r() - 0.5) * 10, r: 3, grow: 7, life: -0.5 - r() * 1.2, seed: r() * 1000, dark: 0.9 });
      }
      this.onImpact?.(o);
    }
    for (const p of fx.scraps) {
      p.vz -= 38 * dt;
      p.z = Math.max(0, p.z + p.vz * dt);
      const drag = p.z > 0 ? 1 : 0.2;
      p.x += p.vx * dt * drag;
      p.y += p.vy * dt * drag;
      p.rot += p.vr * dt * drag;
      if (p.z === 0) {
        p.vx *= 0.8;
        p.vy *= 0.8;
      }
    }
    for (const p of fx.puffs) p.life += dt;
    if (fx.impacted && fx.t > fx.impactAt + 7) {
      fx.puffs = fx.puffs.filter((p) => p.life < 9);
      if (!fx.puffs.length) this.onSettled?.();
    }
  }

  /** A slow column of smoke, drifting off downwind and thinning out over about a minute. */
  private drawSmoke(g: CanvasRenderingContext2D, night: number) {
    const sm = this.smoke;
    if (!sm) return;
    const age = this.time - sm.born;
    if (age > 62) {
      this.smoke = null;
      return;
    }
    const fade = Math.min(1, age / 4) * Math.min(1, (62 - age) / 12);
    for (let k = 0; k < 16; k++) {
      const u = (age * 0.045 + k / 16) % 1; // how far along the column this puff is
      const x = sm.x + u * 70 + Math.sin(u * 5 + k) * 3;
      const y = sm.y - u * 26 + Math.cos(u * 4 + k) * 2;
      const rad = 3 + u * 16;
      const a = Math.pow(1 - u, 1.3) * 0.32 * fade * (1 - night * 0.3);
      const c = Math.round(150 - sm.dark * 60 + u * 60);
      g.fillStyle = `rgba(${c},${c - 3},${c - 6},${a})`;
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.fill();
    }
  }

  /** Boats on the canal: a few tied up along the quays, two or three drifting slowly past, slipping under the bridges. */
  private drawBoats(g: CanvasRenderingContext2D, night: number) {
    const half = this.world.river.width / 2;
    const bridgesY = this.world.roads.filter((r) => r.kind === 'bridge').map((r) => r.rect.y + r.rect.h / 2);
    const hull = ['#f2efe7', '#e9e2d0', '#f2efe7', '#dfe6e8'];
    const trim = ['#2e6f73', '#b8574a', '#3a5f9a', '#c9a44c'];
    const boat = (x: number, y: number, dir: number, len: number, i: number, moving: boolean) => {
      if (bridgesY.some((by) => Math.abs(by - y) < 8)) return; // under a bridge
      g.save();
      g.translate(x, y);
      g.rotate(dir);
      if (moving) {
        // A faint wake, opening out behind.
        g.strokeStyle = `rgba(255,255,255,${0.35 - night * 0.2})`;
        g.lineWidth = 0.25;
        g.beginPath();
        g.moveTo(-0.9, len * 0.45);
        g.lineTo(-2.6, len * 1.6);
        g.moveTo(0.9, len * 0.45);
        g.lineTo(2.6, len * 1.6);
        g.stroke();
      }
      g.fillStyle = 'rgba(20,30,35,0.25)';
      g.beginPath();
      g.ellipse(0.5, 0.6, 1.3, len / 2, 0, 0, Math.PI * 2);
      g.fill();
      // The hull: pointed at the bow, square at the stern.
      g.fillStyle = hull[i % hull.length];
      g.beginPath();
      g.moveTo(0, -len / 2);
      g.quadraticCurveTo(1.35, -len / 4, 1.2, len / 2);
      g.lineTo(-1.2, len / 2);
      g.quadraticCurveTo(-1.35, -len / 4, 0, -len / 2);
      g.fill();
      g.strokeStyle = trim[i % trim.length];
      g.lineWidth = 0.3;
      g.stroke();
      // A seat or a little awning.
      g.fillStyle = i % 3 === 0 ? trim[(i + 1) % trim.length] : 'rgba(120,90,60,0.7)';
      g.fillRect(-0.9, i % 3 === 0 ? -0.6 : 0.4, 1.8, i % 3 === 0 ? 1.8 : 0.5);
      if (night > 0.4) {
        const grd = g.createRadialGradient(0, -len / 3, 0, 0, -len / 3, 3);
        grd.addColorStop(0, `rgba(255,200,120,${0.5 * night})`);
        grd.addColorStop(1, 'rgba(255,200,120,0)');
        g.fillStyle = grd;
        g.fillRect(-3, -len / 3 - 3, 6, 6);
      }
      g.restore();
    };
    // Tied up along the quays.
    [60, 180, 262, 452, 520, 668, 750, 850].forEach((y, i) => {
      const side = i % 2 ? 1 : -1;
      boat(riverX(y) + side * (half - 2.2), y, (i % 3) * 0.06 - 0.03, 5.5 + (i % 3), i, false);
    });
    // Drifting past: one each way, slowly.
    for (let i = 0; i < 3; i++) {
      const span = this.world.h + 160;
      const down = i % 2 === 0;
      const u = ((this.time * (1.6 + i * 0.5) + i * 370) % span) - 80;
      const y = down ? u : this.world.h - u;
      const x = riverX(y) + (down ? -5 : 5);
      boat(x, y, down ? Math.PI : 0, 6.5, i + 5, true);
    }
  }

  /** Thin smoke from the kiln chimneys while the kilns are being fired, drifting off with the wind. */
  private chimneys: Building[] | null = null;
  private drawChimneys(g: CanvasRenderingContext2D, hour: number, damaged: Set<number>, night: number) {
    this.chimneys ??= this.world.buildings.filter((b) => b.kind === 'chimney');
    const firing = hour >= 3.5 && hour < 20 ? 1 : 0.45; // banked low overnight, never out
    for (const b of this.chimneys) {
      if (damaged.has(b.id)) continue;
      const x0 = b.cx;
      const y0 = b.cy - 2;
      for (let k = 0; k < 10; k++) {
        const u = (this.time * 0.05 + k / 10 + b.id * 0.13) % 1;
        const x = x0 + u * 34 + Math.sin(u * 6 + k + b.id) * 1.6;
        const y = y0 - u * 14 + Math.cos(u * 5 + k) * 1.2;
        const rad = 1.4 + u * 7;
        const a = Math.pow(1 - u, 1.2) * 0.42 * firing * (1 - night * 0.4);
        const c = Math.round(95 + u * 80);
        g.fillStyle = `rgba(${c},${c - 4},${c - 8},${a})`;
        g.beginPath();
        g.arc(x, y, rad, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  /** A few birds circling over the park and the mosque now and then, by day. */
  private drawBirds(g: CanvasRenderingContext2D, px: number, light: number) {
    const park = this.world.spaces.find((s) => s.name === 'Olive Park');
    const mosque = this.world.buildings.find((b) => b.kind === 'mosque');
    const school = this.world.buildings.find((b) => b.name === 'Cotton Street School');
    const spots = [park && { x: park.rect.x + park.rect.w / 2, y: park.rect.y + park.rect.h / 2, seed: 1 }, mosque && { x: mosque.cx, y: mosque.cy, seed: 2 }, school && { x: school.cx + 8, y: school.cy, seed: 3.4 }];
    for (const sp of spots) {
      if (!sp) continue;
      const show = Math.sin(this.time / 23 + sp.seed * 2.1); // up for a while, gone for a while
      if (show < 0.2) continue;
      const alpha = Math.min(1, (show - 0.2) / 0.3) * light * 0.75;
      g.strokeStyle = `rgba(40,34,30,${alpha})`;
      g.lineWidth = Math.max(0.25, 1.1 * px);
      for (let i = 0; i < 5; i++) {
        const a = this.time * 0.35 + i * 0.5 + sp.seed;
        const r = 16 + i * 2.2;
        const x = sp.x + Math.cos(a) * r;
        const y = sp.y + Math.sin(a) * r * 0.8;
        const dir = a + Math.PI / 2;
        const flap = 0.5 + 0.35 * Math.sin(this.time * 9 + i);
        const s = Math.max(1.2, 3.2 * px);
        g.beginPath();
        g.moveTo(x + Math.cos(dir + Math.PI - flap) * s, y + Math.sin(dir + Math.PI - flap) * s);
        g.lineTo(x, y);
        g.lineTo(x + Math.cos(dir + Math.PI + flap) * s, y + Math.sin(dir + Math.PI + flap) * s);
        g.stroke();
      }
    }
  }

  private drawFx(g: CanvasRenderingContext2D, fx: StrikeFx, px: number) {
    const o = fx.outcome;
    const plan = fx.plan;
    const t = fx.t;
    const h = (plan.heading * Math.PI) / 180;
    const ux = Math.sin(h);
    const uy = -Math.cos(h);
    const fly = 180;
    const planeT = t / fx.impactAt;
    if (planeT < 2.4) {
      const along = (planeT - 0.72) * fly;
      drawTrack(g, plan, px, this.world, this.time, true);
      // The shadow sweeps across the rooftops ahead of the plane, which flies high above it.
      paperPlane(g, o.ix + ux * along + 30, o.iy + uy * along + 38, h, 12, true);
      paperPlane(g, o.ix + ux * along, o.iy + uy * along, h, 12, false);
    }
    if (!fx.impacted && planeT > 0.2) {
      const k = (planeT - 0.2) / 0.8;
      const along = -(1 - k) * fly * 0.4;
      const alt = (1 - k * k) * 26;
      const x = o.ix + ux * along;
      const y = o.iy + uy * along;
      g.fillStyle = 'rgba(40,30,20,0.35)';
      g.beginPath();
      g.ellipse(x + alt, y + alt, 1.2, 0.6, h, 0, Math.PI * 2);
      g.fill();
      g.save();
      g.translate(x, y);
      g.rotate(h);
      g.fillStyle = '#6f6a63';
      g.beginPath();
      g.ellipse(0, 0, 0.7, 2.2, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    if (!fx.impacted) return;
    const dt = t - fx.impactAt;
    const e = effect(plan, structureAt(this.world, o.ix, o.iy));
    if (dt < 0.5) {
      const a = 1 - dt / 0.5;
      const rad = e.blast * (1.5 + dt * 5);
      const grd = g.createRadialGradient(o.ix, o.iy, 0, o.ix, o.iy, rad);
      grd.addColorStop(0, `rgba(255,248,225,${a})`);
      grd.addColorStop(0.4, `rgba(255,200,120,${a * 0.7})`);
      grd.addColorStop(1, 'rgba(255,160,80,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(o.ix, o.iy, rad, 0, Math.PI * 2);
      g.fill();
    }
    if (dt < 1.6) {
      const k = dt / 1.6;
      g.strokeStyle = `rgba(255,250,240,${(1 - k) * 0.9})`;
      g.lineWidth = (1 - k) * 3 * px + px;
      g.beginPath();
      g.arc(o.ix, o.iy, e.blast * 1.25 * Math.min(1, k * 3), 0, Math.PI * 2);
      g.stroke();
    }
    for (const p of fx.scraps) {
      const lift = p.z * 0.35;
      if (p.z > 0.1) {
        g.fillStyle = 'rgba(40,30,20,0.2)';
        g.fillRect(p.x - p.size / 2 + lift, p.y - p.size / 2 + lift, p.size, p.size * 0.6);
      }
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.fillStyle = p.color;
      g.beginPath();
      g.moveTo(-p.size / 2, -p.size * 0.3);
      g.lineTo(p.size / 2, -p.size * 0.4);
      g.lineTo(p.size * 0.4, p.size * 0.35);
      g.lineTo(-p.size * 0.5, p.size * 0.25);
      g.closePath();
      g.fill();
      g.restore();
    }
    // The flash and the shockwave, sized by the weapon: a pop for the smallest, a wide white burst for the biggest.
    const since = t - fx.impactAt;
    if (fx.impacted && since < 1.2) {
      const blast = weapon(plan.weapon).blast;
      if (since < 0.45) {
        const k = since / 0.45;
        const rr = blast * (0.5 + k * 0.9);
        const grd = g.createRadialGradient(o.ix, o.iy, 0, o.ix, o.iy, rr);
        grd.addColorStop(0, `rgba(255,250,228,${0.95 * (1 - k)})`);
        grd.addColorStop(0.4, `rgba(255,214,140,${0.6 * (1 - k)})`);
        grd.addColorStop(1, 'rgba(255,190,110,0)');
        g.fillStyle = grd;
        g.beginPath();
        g.arc(o.ix, o.iy, rr, 0, Math.PI * 2);
        g.fill();
      }
      const k = since / 1.2;
      g.strokeStyle = `rgba(255,255,255,${0.7 * (1 - k)})`;
      g.lineWidth = Math.max(0.4, blast * 0.06 * (1 - k));
      g.beginPath();
      g.arc(o.ix, o.iy, blast * (0.3 + k * 2.4), 0, Math.PI * 2);
      g.stroke();
    }
    for (const p of fx.puffs) {
      if (p.life < 0) continue;
      const k = Math.min(1, p.life / 7);
      const rad = p.r + p.grow * Math.sqrt(p.life);
      const a = Math.max(0, (p.life < 0.3 ? p.life / 0.3 : 1) * (1 - k) * 0.85);
      const x = p.x + p.life * 1.4;
      const y = p.y - p.life * 0.6;
      const pr = rng(Math.round(p.seed));
      const base = Math.round(200 + (1 - p.dark) * 45 - p.dark * 90);
      g.fillStyle = `rgba(${base},${base - 4},${base - 10},${a})`;
      g.beginPath();
      for (let i = 0; i <= 14; i++) {
        const th = (i / 14) * Math.PI * 2;
        const rr = rad * (0.82 + pr() * 0.3);
        if (i === 0) g.moveTo(x + Math.cos(th) * rr, y + Math.sin(th) * rr);
        else g.lineTo(x + Math.cos(th) * rr, y + Math.sin(th) * rr);
      }
      g.closePath();
      g.fill();
    }
  }
}

// ---------------------------------------------------------------- one roll of the dice

/** One draw from the same model: where it lands, what falls, what else goes off, who is hurt. */
export function resolveStrike(world: World, plan: Plan, pop: Population, walkers: Walker[], cars: Car[], seed: number): Outcome {
  const r = rng(seed);
  const w = weapon(plan.weapon);
  const sigma = w.cep / 1.1774;
  const n1 = Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());
  const n2 = Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());
  const ix = plan.aimX + n1 * sigma;
  const iy = plan.aimY + n2 * sigma;
  const hit = structureAt(world, ix, iy);
  const hitB = hit?.building ?? null;
  const e = effect(plan, hit);
  const destroyed = destroys(world, plan, ix, iy);
  const t = targetOf(world, plan.target);
  const tc = { x: t.rect.x + t.rect.w / 2, y: t.rect.y + t.rect.h / 2 };
  const sec: { x: number; y: number; e: Effect; name: string }[] = [];
  const reach = Math.max(w.frag * 1.3, w.blast * 1.8, 60) + sigma * 4;
  if (destroyed && plan.stored) sec.push({ x: tc.x, y: tc.y, e: { blast: 16, frag: 45, fragP: 0.3, shieldPow: 1, z: 2 }, name: 'What was stored inside' });
  const damaged = new Set<number>();
  for (const b of world.buildings) {
    if (!b.hazard || buildingDist(b, ix, iy) > reach) continue;
    if (buildingDist(b, ix, iy) < b.hazard.ignite + e.blast * 0.8 && r() < 0.8) {
      sec.push({ x: b.cx, y: b.cy, e: { blast: 16, frag: 50, fragP: 0.35, shieldPow: 1, z: 5 }, name: b.name ?? 'Fuel' });
      damaged.add(b.id);
    }
  }
  if (destroyed && t.buildingId != null) damaged.add(t.buildingId);
  if (destroyed && plan.target === 'bridge') damaged.add(BRIDGE_RUIN);
  for (const b of world.buildings) {
    const d = buildingDist(b, ix, iy);
    if (d > reach) continue;
    if (collapse(b, e, d, hitB === b) > 0) damaged.add(b.id);
    for (const s of sec) if (buildingDist(b, s.x, s.y) < 6 && b.material !== 'concrete') damaged.add(b.id);
  }
  const src = hitB?.id ?? -99;
  const pAt = (x: number, y: number, z: number, shield: number, own: Building | null) => {
    const same = own != null && own === hitB;
    let p = harm(plan.heading, plan.fuze, e, ix, iy, x, y, z, shield, same, occlusion(world, ix, iy, x, y, own?.id ?? -99, src));
    if (own) {
      const col = collapse(own, e, buildingDist(own, ix, iy), same);
      if (col > p) p = col;
    }
    for (const s of sec) p = 1 - (1 - p) * (1 - harm(0, 'instant', s.e, s.x, s.y, x, y, z, shield, false, 1));
    return p;
  };
  const hurtSlots: Record<number, number[]> = {};
  let count = 0;
  for (const b of world.buildings) {
    if (buildingDist(b, ix, iy) > reach) continue;
    const n = shownCount(pop, b);
    for (let i = 0; i < n; i++) {
      if (r() < pAt(b.slots[i * 2], b.slots[i * 2 + 1], slotZ(b, i), b.shield, b)) {
        (hurtSlots[b.id] ??= []).push(i);
        count++;
      }
    }
  }
  const hurtWalkers: number[] = [];
  for (const wk of walkers) {
    if (Math.abs(wk.x - ix) > reach || Math.abs(wk.y - iy) > reach) continue;
    if (r() < pAt(wk.x, wk.y, 1, 1, null)) {
      hurtWalkers.push(wk.id);
      count++;
    }
  }
  const hurtCars: number[] = [];
  for (const c of cars) {
    if (Math.abs(c.x - ix) > reach || Math.abs(c.y - iy) > reach) continue;
    if (r() < pAt(c.x, c.y, 1, 0.8, null)) {
      hurtCars.push(c.id);
      count += 1 + (r() < 0.5 ? 1 : 0);
    }
  }
  return { ix, iy, destroyed, damaged: [...damaged], hurtSlots, hurtWalkers, hurtCars, count, secondary: sec.map((s) => s.name) };
}

// ---------------------------------------------------------------- helpers

const inView = (v: Rect, x: number, y: number, pad = 10) => x > v.x - pad && x < v.x + v.w + pad && y > v.y - pad && y < v.y + v.h + pad;

/** The fragment pattern, ray by ray: how far fragments fly before a building or wall catches them. */
function rayCache(prev: { key: string; full: Float32Array; clear: Float32Array } | null, world: World, plan: Plan) {
  const key = `${plan.weapon}|${plan.fuze}|${plan.heading}|${plan.aimX.toFixed(1)}|${plan.aimY.toFixed(1)}`;
  if (prev?.key === key) return prev;
  const N = 180;
  const full = new Float32Array(N * 2);
  const clear = new Float32Array(N * 2);
  const hit = structureAt(world, plan.aimX, plan.aimY);
  const e = effect(plan, hit);
  const src = hit?.building?.id ?? -99;
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2;
    const dx = Math.sin(th);
    const dy = -Math.cos(th);
    const reach = e.frag * (0.55 + 0.45 * lobe(plan.heading, dx, dy));
    let d = 0;
    let stop = reach;
    for (d = 1; d < reach; d += 1) {
      const x = plan.aimX + dx * d;
      const y = plan.aimY + dy * d;
      const cx = Math.floor(x / world.cell);
      const cy = Math.floor(y / world.cell);
      if (cx < 0 || cy < 0 || cx >= world.gridW || cy >= world.gridH) continue;
      const v = world.grid[cy * world.gridW + cx];
      if (v !== 0 && v !== src + 1) {
        stop = d;
        break;
      }
    }
    full[i * 2] = plan.aimX + dx * reach;
    full[i * 2 + 1] = plan.aimY + dy * reach;
    clear[i * 2] = plan.aimX + dx * stop;
    clear[i * 2 + 1] = plan.aimY + dy * stop;
  }
  return { key, full, clear };
}

function drawPattern(g: CanvasRenderingContext2D, plan: Plan, rays: { full: Float32Array; clear: Float32Array }, color: string, alpha: number, px: number, time: number) {
  const poly = (a: Float32Array) => {
    g.beginPath();
    for (let i = 0; i < a.length; i += 2) (i ? g.lineTo(a[i], a[i + 1]) : g.moveTo(a[i], a[i + 1]));
    g.closePath();
  };
  g.save();
  g.globalAlpha = alpha;
  // Full reach, faint: where fragments would go with nothing in the way.
  poly(rays.full);
  g.fillStyle = hexA(color, 0.05);
  g.fill();
  g.strokeStyle = hexA(color, 0.5);
  g.lineWidth = px;
  g.setLineDash([2.5 * px, 3 * px]);
  g.lineDashOffset = time * 5 * px;
  g.stroke();
  g.setLineDash([]);
  // Clear line of flight, stronger: buildings and walls cast shadows in the spray.
  poly(rays.clear);
  const grd = g.createRadialGradient(plan.aimX, plan.aimY, 0, plan.aimX, plan.aimY, 80);
  grd.addColorStop(0, hexA(color, 0.28));
  grd.addColorStop(1, hexA(color, 0.08));
  g.fillStyle = grd;
  g.fill();
  const e = weapon(plan.weapon);
  g.fillStyle = hexA(color, 0.18);
  g.beginPath();
  g.arc(plan.aimX, plan.aimY, e.blast * (plan.fuze === 'delay' ? 1.1 : plan.fuze === 'airburst' ? 0.75 : 1), 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function drawTrack(g: CanvasRenderingContext2D, plan: Plan, px: number, world: World, time: number, live: boolean) {
  const h = (plan.heading * Math.PI) / 180;
  const ux = Math.sin(h);
  const uy = -Math.cos(h);
  const L = Math.max(world.w, world.h) * 1.2;
  g.save();
  g.strokeStyle = live ? 'rgba(29,27,24,0.35)' : 'rgba(29,27,24,0.28)';
  g.lineWidth = px;
  g.setLineDash([6 * px, 5 * px]);
  g.lineDashOffset = -time * 20 * px;
  g.beginPath();
  g.moveTo(plan.aimX - ux * L, plan.aimY - uy * L);
  g.lineTo(plan.aimX - ux * 12, plan.aimY - uy * 12);
  g.stroke();
  g.setLineDash([]);
  if (!live) {
    const x = plan.aimX - ux * 40;
    const y = plan.aimY - uy * 40;
    const k = 1.6;
    g.fillStyle = 'rgba(29,27,24,0.55)';
    g.beginPath();
    g.moveTo(x + ux * 5 * px * k, y + uy * 5 * px * k);
    g.lineTo(x - uy * 3.5 * px * k - ux * 3 * px, y + ux * 3.5 * px * k - uy * 3 * px);
    g.lineTo(x + uy * 3.5 * px * k - ux * 3 * px, y - ux * 3.5 * px * k - uy * 3 * px);
    g.closePath();
    g.fill();
  }
  g.restore();
}

function drawAim(g: CanvasRenderingContext2D, x: number, y: number, px: number, k: number, color: string) {
  const r = 7 * px * k;
  g.strokeStyle = color;
  g.lineWidth = 1.4 * px;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.moveTo(x - r * 1.6, y);
  g.lineTo(x - r * 0.4, y);
  g.moveTo(x + r * 0.4, y);
  g.lineTo(x + r * 1.6, y);
  g.moveTo(x, y - r * 1.6);
  g.lineTo(x, y - r * 0.4);
  g.moveTo(x, y + r * 0.4);
  g.lineTo(x, y + r * 1.6);
  g.stroke();
}

/** A paper plane seen from above, nose along heading h: two folded wings and a crease down the middle. */
function paperPlane(g: CanvasRenderingContext2D, x: number, y: number, h: number, size: number, shadow: boolean) {
  g.save();
  g.translate(x, y);
  g.rotate(h);
  g.scale(size, size);
  const left = [0, -1, -0.62, 0.72, -0.1, 0.5, 0, 0.78];
  const right = [0, -1, 0.62, 0.72, 0.1, 0.5, 0, 0.78];
  const poly = (p: number[]) => {
    g.beginPath();
    g.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]);
    g.closePath();
  };
  if (shadow) {
    g.fillStyle = 'rgba(40,28,18,0.28)';
    poly([0, -1, -0.62, 0.72, 0, 0.78, 0.62, 0.72]);
    g.fill();
    g.restore();
    return;
  }
  g.lineJoin = 'round';
  g.lineWidth = 0.05;
  g.strokeStyle = 'rgba(60,50,40,0.45)';
  g.fillStyle = '#fbfaf6';
  poly(left);
  g.fill();
  g.stroke();
  g.fillStyle = '#ddd6c9';
  poly(right);
  g.fill();
  g.stroke();
  // The keel: a narrow fold under the crease.
  g.fillStyle = '#b9b0a0';
  poly([0, -0.55, 0.07, 0.62, 0, 0.78, -0.02, 0.6]);
  g.fill();
  g.strokeStyle = 'rgba(40,30,20,0.6)';
  g.lineWidth = 0.04;
  g.beginPath();
  g.moveTo(0, -1);
  g.lineTo(0, 0.78);
  g.stroke();
  g.restore();
}

function drawCar(g: CanvasRenderingContext2D, car: Car, night: number, sh: Sun, wrecked: boolean) {
  g.save();
  g.translate(car.x, car.y);
  g.rotate(car.horizontal ? (car.dir > 0 ? 0 : Math.PI) : car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  g.fillStyle = 'rgba(40,30,20,0.25)';
  g.fillRect(-2.2 + sh.dx * 0.7, -1 + sh.dy * 0.7, 4.4, 2);
  // A folded paper car: the body creased along its length, one side catching the light.
  const body = wrecked ? '#4a4540' : car.color;
  g.fillStyle = body;
  roundRect(g, -2.2, -1, 4.4, 2, 0.55);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.fillRect(-2.0, -0.95, 4.0, 0.9);
  g.fillStyle = 'rgba(40,30,20,0.14)';
  g.fillRect(-2.0, 0.05, 4.0, 0.9);
  // The cabin: a lighter folded roof between a windscreen and a rear window.
  g.fillStyle = 'rgba(40,50,62,0.62)';
  roundRect(g, 0.55, -0.82, 0.75, 1.64, 0.25); // windscreen
  g.fill();
  roundRect(g, -1.65, -0.78, 0.45, 1.56, 0.2); // rear window
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.42)';
  roundRect(g, -1.2, -0.8, 1.75, 1.6, 0.3);
  g.fill();
  g.strokeStyle = 'rgba(40,30,20,0.25)';
  g.lineWidth = 0.08;
  g.beginPath();
  g.moveTo(-1.2, 0);
  g.lineTo(0.55, 0);
  g.stroke();
  // Lamps: pale at the front, red at the back; they glow at night.
  g.fillStyle = night > 0.2 ? '#fff4d6' : 'rgba(255,250,235,0.8)';
  g.fillRect(2.0, -0.85, 0.22, 0.4);
  g.fillRect(2.0, 0.45, 0.22, 0.4);
  g.fillStyle = night > 0.2 ? '#ff5a3c' : 'rgba(170,50,35,0.7)';
  g.fillRect(-2.22, -0.8, 0.2, 0.35);
  g.fillRect(-2.22, 0.45, 0.2, 0.35);
  if (wrecked) {
    g.strokeStyle = C.red;
    g.lineWidth = 0.35;
    g.strokeRect(-2.8, -1.6, 5.6, 3.2);
  } else if (night > 0.2) {
    const grd = g.createRadialGradient(4, 0, 0, 4, 0, 6);
    grd.addColorStop(0, `rgba(255,236,190,${0.55 * night})`);
    grd.addColorStop(1, 'rgba(255,236,190,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(2, -0.8);
    g.lineTo(9, -3);
    g.lineTo(9, 3);
    g.lineTo(2, 0.8);
    g.fill();
    const tail = g.createRadialGradient(-2.4, 0, 0, -2.4, 0, 2.2);
    tail.addColorStop(0, `rgba(255,70,50,${0.35 * night})`);
    tail.addColorStop(1, 'rgba(255,70,50,0)');
    g.fillStyle = tail;
    g.fillRect(-4.6, -2.2, 2.4, 4.4);
  }
  g.restore();
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function drawFigure(g: CanvasRenderingContext2D, w: Walker, time: number, sh: Sun, night: number, px: number) {
  const scale = Math.max(1, 1.6 * px);
  if (w.hurt) {
    g.strokeStyle = C.red;
    g.lineWidth = Math.max(0.3, 1.3 * px);
    g.beginPath();
    g.arc(w.x, w.y, 1.1 * scale, 0, Math.PI * 2);
    g.stroke();
    return;
  }
  const bob = w.path.length ? Math.sin((time + w.phase) * 11) * 0.12 : 0;
  g.fillStyle = `rgba(40,30,20,${0.22 * (1 - night * 0.5)})`;
  g.beginPath();
  g.ellipse(w.x + sh.dx * 0.9 * scale, w.y + sh.dy * 0.9 * scale, 0.55 * scale, 0.4 * scale, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = w.cloth;
  g.beginPath();
  g.ellipse(w.x, w.y + bob, 0.62 * scale, 0.45 * scale, 0, 0, Math.PI * 2);
  g.fill();
  // The head, and what's on it. Detail only when zoomed in enough to see it.
  const hx = w.x;
  const hy = w.y + bob - 0.05 * scale;
  const hr = 0.3 * scale;
  const near = px < 0.22; // close enough to see faces
  // Facing: the way they're walking, or a slow look around when standing.
  const next = w.path[0];
  const a = next && (next.x !== w.x || next.y !== w.y) ? Math.atan2(next.y - w.y, next.x - w.x) : w.phase + Math.sin(time * 0.3 + w.phase) * 0.8;
  const fx = Math.cos(a);
  const fy = Math.sin(a);
  switch (w.wear) {
    case 'abaya': // full black, a narrow slit for the eyes
      g.fillStyle = '#141215';
      g.beginPath();
      g.arc(hx, hy, hr * 1.12, 0, Math.PI * 2);
      g.fill();
      break;
    case 'hijab': // a coloured scarf over the head and shoulders, the face at the front
    case 'shawl': // the same, lighter, with a little pattern
      g.fillStyle = w.tint;
      g.beginPath();
      g.arc(hx - fx * hr * 0.12, hy - fy * hr * 0.12, hr * (w.wear === 'shawl' ? 1.25 : 1.12), 0, Math.PI * 2);
      g.fill();
      if (w.wear === 'shawl' && near) {
        g.fillStyle = 'rgba(255,250,240,0.55)';
        for (let i = 0; i < 5; i++) {
          const k = (i / 5) * Math.PI * 2 + w.phase;
          g.fillRect(hx - fx * hr * 0.3 + Math.cos(k) * hr * 0.75 - hr * 0.06, hy - fy * hr * 0.3 + Math.sin(k) * hr * 0.75 - hr * 0.06, hr * 0.12, hr * 0.12);
        }
      }
      g.fillStyle = w.skin;
      g.beginPath();
      g.arc(hx + fx * hr * 0.55, hy + fy * hr * 0.55, hr * 0.42, 0, Math.PI * 2);
      g.fill();
      break;
    case 'turban': // a wide wrapped crown
      g.fillStyle = w.tint;
      g.beginPath();
      g.arc(hx, hy, hr * 1.2, 0, Math.PI * 2);
      g.fill();
      if (near) {
        g.strokeStyle = 'rgba(0,0,0,0.25)';
        g.lineWidth = hr * 0.12;
        g.beginPath();
        g.arc(hx, hy, hr * 0.7, a, a + Math.PI * 1.4);
        g.stroke();
      }
      break;
    case 'keffiyeh': // white with red check, falling behind onto the shoulders
      g.fillStyle = '#f3efe6';
      g.beginPath();
      g.ellipse(hx - fx * hr * 0.35, hy - fy * hr * 0.35, hr * 1.25, hr * 1.05, a, 0, Math.PI * 2);
      g.fill();
      if (near) {
        g.fillStyle = '#b23a30';
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if ((i + j) & 1) g.fillRect(hx - fx * hr * 0.3 + i * hr * 0.42 - hr * 0.1, hy - fy * hr * 0.3 + j * hr * 0.42 - hr * 0.1, hr * 0.2, hr * 0.2);
        g.strokeStyle = '#1d1b1e'; // the black cord
        g.lineWidth = hr * 0.14;
        g.beginPath();
        g.arc(hx, hy, hr * 0.62, 0, Math.PI * 2);
        g.stroke();
      }
      break;
    case 'ghutra': // a plain white head cloth falling behind, held by a black cord
      g.fillStyle = '#f5f2ea';
      g.beginPath();
      g.ellipse(hx - fx * hr * 0.35, hy - fy * hr * 0.35, hr * 1.25, hr * 1.05, a, 0, Math.PI * 2);
      g.fill();
      if (near) {
        g.strokeStyle = '#1d1b1e';
        g.lineWidth = hr * 0.14;
        g.beginPath();
        g.arc(hx, hy, hr * 0.62, 0, Math.PI * 2);
        g.stroke();
      }
      break;
    case 'burqa': // one colour from head to foot, a mesh window at the front
      g.fillStyle = w.tint;
      g.beginPath();
      g.arc(hx, hy, hr * 1.15, 0, Math.PI * 2);
      g.fill();
      if (near) {
        g.fillStyle = 'rgba(255,255,255,0.28)';
        g.beginPath();
        g.ellipse(hx + fx * hr * 0.7, hy + fy * hr * 0.7, hr * 0.18, hr * 0.42, a, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case 'cap': // a small white cap on dark hair
      g.fillStyle = '#231b16';
      g.beginPath();
      g.arc(hx, hy, hr, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#f2eee6';
      g.beginPath();
      g.arc(hx - fx * hr * 0.1, hy - fy * hr * 0.1, hr * 0.72, 0, Math.PI * 2);
      g.fill();
      break;
    default: // bare: hair on top, the face at the front
      g.fillStyle = w.skin;
      g.beginPath();
      g.arc(hx, hy, hr, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#231b16';
      g.beginPath();
      g.arc(hx - fx * hr * 0.28, hy - fy * hr * 0.28, hr * 0.78, 0, Math.PI * 2);
      g.fill();
  }
  // Two dots for eyes, on the side they're facing (not under a hat brim).
  if (near && w.wear !== 'burqa') {
    const ex = hx + fx * hr * (w.wear === 'hijab' ? 0.72 : 0.78);
    const ey = hy + fy * hr * (w.wear === 'hijab' ? 0.72 : 0.78);
    const sx = -fy * hr * 0.3;
    const sy = fx * hr * 0.3;
    g.fillStyle = w.wear === 'abaya' ? '#e8dcc8' : '#141215';
    const er = Math.max(0.045, hr * 0.12);
    g.beginPath();
    g.arc(ex + sx, ey + sy, er, 0, Math.PI * 2);
    g.arc(ex - sx, ey - sy, er, 0, Math.PI * 2);
    g.fill();
  }
}

function leader(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, px: number) {
  g.strokeStyle = C.ink;
  g.lineWidth = 1.1 * px;
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
  g.fillStyle = C.ink;
  g.beginPath();
  g.arc(x0, y0, 2.2 * px, 0, Math.PI * 2);
  g.fill();
}

let LABEL_K = 1;
export function label(g: CanvasRenderingContext2D, x: number, y: number, text: string, px: number, o: { small?: boolean; plain?: boolean; tone?: 'protect' | 'hazard' | 'target' }) {
  g.save();
  px *= LABEL_K;
  const size = (o.small ? 11 : 12.5) * px;
  g.font = `600 ${size}px "IBM Plex Sans", system-ui, sans-serif`;
  const w = g.measureText(text).width;
  const padX = 6 * px;
  const padY = 4 * px;
  const bw = w + padX * 2 + (o.tone ? 8 * px : 0);
  const bh = size + padY * 2;
  if (!o.plain) {
    g.fillStyle = 'rgba(40,30,20,0.16)';
    g.fillRect(x - bw / 2 + 1.5 * px, y - bh / 2 + 2 * px, bw, bh);
  }
  g.fillStyle = o.plain ? 'rgba(250,247,240,0.85)' : '#fbf8f1';
  g.fillRect(x - bw / 2, y - bh / 2, bw, bh);
  if (o.tone) {
    g.fillStyle = o.tone === 'protect' ? C.protect : o.tone === 'hazard' ? C.hazard : C.red;
    g.fillRect(x - bw / 2, y - bh / 2, 4 * px, bh);
  }
  g.fillStyle = o.tone === 'target' ? C.red : C.ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x + (o.tone ? 2 * px : 0), y + 0.5 * px);
  g.restore();
}

function paperTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  const r = rng(99);
  const grid = (n: number) => Array.from({ length: (n + 1) * (n + 1) }, () => r());
  const g1 = grid(8);
  const g2 = grid(32);
  const sample = (gr: number[], n: number, x: number, y: number) => {
    const fx = (x / size) * n;
    const fy = (y / size) * n;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const at = (a: number, b: number) => gr[(b % n) * (n + 1) + (a % n)];
    const s = (t: number) => t * t * (3 - 2 * t);
    const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * s(tx);
    const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * s(tx);
    return a + (b - a) * s(ty);
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const v = 238 + sample(g1, 8, x, y) * 10 + sample(g2, 32, x, y) * 6 + (r() - 0.5) * 9;
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.min(255, v);
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  // A few long, faint creases, as if the sheet had been folded once and flattened.
  for (let i = 0; i < 5; i++) {
    const x0 = r() * size;
    const y0 = r() * size;
    const a = r() * Math.PI;
    const l = size * (0.4 + r() * 0.6);
    for (const [off, col] of [[0, 'rgba(90,70,50,0.07)'], [0.8, 'rgba(255,255,255,0.18)']] as const) {
      g.strokeStyle = col;
      g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(x0 + off, y0);
      g.lineTo(x0 + off + Math.cos(a) * l, y0 + Math.sin(a) * l);
      g.stroke();
    }
  }
  g.globalAlpha = 0.065;
  g.strokeStyle = '#6b5a45';
  for (let i = 0; i < 260; i++) {
    const x = r() * size;
    const y = r() * size;
    const a = r() * Math.PI;
    const l = 3 + r() * 10;
    g.lineWidth = 0.5 + r() * 0.6;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  return c;
}

export { inBuilding };
