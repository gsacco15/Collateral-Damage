// The estimate: run the strike hundreds of times, each with a different landing point and a different
// count of people, and see how many are killed or badly hurt.
import { buildingDist, rectDist, targetOf, type Building, type World } from './city';
import { collapse, destroys, effect, harm, occlusion, structureAt, weapon, type Effect, type Plan } from './effects';
import type { Population } from './life';
import { binomial, gamma, normal, poisson, rng } from './rng';

export interface Estimate {
  runs: number;
  counts: Uint16Array; // people killed or badly hurt, per run
  pk: number; // share of runs that destroy the target
  mean: number;
  p50: number;
  p90: number; // the cautious planning figure: nine in ten runs at or below
  max: number;
  impacts: Float32Array; // x,y of up to 400 landing points
  byBuilding: Float32Array; // expected harm per building
  bySpace: Float32Array; // expected harm per open space
  street: number; // expected harm to people on foot
  traffic: number; // expected harm to people in cars
  secondary: number; // share of runs where something else went off (stored munitions, fuel)
  collapsed: Float32Array; // per building: share of runs it came down
}

const quantile = (sorted: Uint16Array, q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

const SECONDARY_STORE: Effect = { blast: 16, frag: 45, fragP: 0.3, shieldPow: 1, z: 2 };
const SECONDARY_FUEL: Effect = { blast: 16, frag: 50, fragP: 0.35, shieldPow: 1, z: 5 };
const CAR_SHIELD = 0.8;

interface Near {
  b: Building;
  occl: Float32Array; // per representative point
}

export function estimate(world: World, plan: Plan, pop: Population, runs = 400, seed = 1): Estimate {
  const r = rng(seed * 7919 + 13);
  const w = weapon(plan.weapon);
  const t = targetOf(world, plan.target);
  const sigma = w.cep / 1.1774;
  const reach = Math.max(w.frag * 1.3, w.blast * 1.8, 60) + sigma * 4;
  const ax = plan.aimX;
  const ay = plan.aimY;
  const src = structureAt(world, ax, ay)?.building?.id ?? -99;

  // Everything within reach, with how exposed each point is to fragments from the aim point.
  const near: Near[] = [];
  const tanks: Building[] = [];
  for (const b of world.buildings) {
    const d = buildingDist(b, ax, ay);
    if (d > reach) continue;
    if (b.hazard) tanks.push(b);
    if (!b.capacity) continue;
    const k = b.pts.length / 3;
    const occl = new Float32Array(k);
    for (let i = 0; i < k; i++) occl[i] = occlusion(world, ax, ay, b.pts[i * 3], b.pts[i * 3 + 1], b.id, src);
    near.push({ b, occl });
  }
  const spaces: { id: number; x: Float32Array; y: Float32Array; occl: Float32Array; each: number }[] = [];
  for (const s of world.spaces) {
    if (rectDist(s.rect, ax, ay) > reach || pop.spaceQ[s.id] <= 0) continue;
    const n = Math.min(60, s.slots.length / 2);
    const xs = new Float32Array(n);
    const ys = new Float32Array(n);
    const oc = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const j = Math.floor((i * s.slots.length) / 2 / n);
      xs[i] = s.slots[j * 2];
      ys[i] = s.slots[j * 2 + 1];
      oc[i] = occlusion(world, ax, ay, xs[i], ys[i], -99, src);
    }
    spaces.push({ id: s.id, x: xs, y: ys, occl: oc, each: s.capacity / n });
  }
  const streets: number[] = [];
  const streetOcc: number[] = [];
  for (let i = 0; i < world.streetPts.length; i += 2) {
    const x = world.streetPts[i];
    const y = world.streetPts[i + 1];
    if (Math.abs(x - ax) > reach || Math.abs(y - ay) > reach) continue;
    streets.push(x, y);
    streetOcc.push(occlusion(world, ax, ay, x, y, -99, src));
  }
  const cars: number[] = [];
  const carOcc: number[] = [];
  for (let i = 0; i < world.trafficPts.length; i += 3) {
    const x = world.trafficPts[i];
    const y = world.trafficPts[i + 1];
    if (Math.abs(x - ax) > reach || Math.abs(y - ay) > reach) continue;
    cars.push(x, y, world.trafficPts[i + 2]);
    carOcc.push(occlusion(world, ax, ay, x, y, -99, src));
  }

  const counts = new Uint16Array(runs);
  const keep = Math.min(runs, 400);
  const impacts = new Float32Array(keep * 2);
  const byBuilding = new Float32Array(world.buildings.length);
  const bySpace = new Float32Array(world.spaces.length);
  const collapsed = new Float32Array(world.buildings.length);
  const k = 1 / (pop.cv * pop.cv);
  let destroyed = 0;
  let street = 0;
  let traffic = 0;
  let secondaryRuns = 0;
  const tc = { x: t.rect.x + t.rect.w / 2, y: t.rect.y + t.rect.h / 2 };

  for (let run = 0; run < runs; run++) {
    const ix = ax + normal(r) * sigma;
    const iy = ay + normal(r) * sigma;
    if (run < keep) {
      impacts[run * 2] = ix;
      impacts[run * 2 + 1] = iy;
    }
    const hit = structureAt(world, ix, iy);
    const hitB = hit?.building ?? null;
    const e = effect(plan, hit);
    const kill = destroys(world, plan, ix, iy);
    if (kill) destroyed++;
    // Secondary explosions: what's stored in the target, fuel in the tanks.
    const sec: { x: number; y: number; e: Effect }[] = [];
    if (kill && plan.stored) sec.push({ x: tc.x, y: tc.y, e: SECONDARY_STORE });
    for (const tank of tanks) {
      const d = buildingDist(tank, ix, iy);
      if (d < tank.hazard!.ignite + e.blast * 0.8 && r() < 0.8) sec.push({ x: tank.cx, y: tank.cy, e: SECONDARY_FUEL });
    }
    if (sec.length) secondaryRuns++;
    const withSec = (p: number, x: number, y: number, z: number, shield: number, own: boolean) => {
      for (const s of sec) p = 1 - (1 - p) * (1 - harm(0, 'instant', s.e, s.x, s.y, x, y, z, shield, own, 1));
      return p;
    };

    let c = 0;
    for (const { b, occl } of near) {
      const o = pop.observed[b.id];
      const mean = pop.expected[b.id];
      let n: number;
      if (o >= 0) n = o + poisson(r, mean * 0.08);
      else n = mean <= 0 ? 0 : poisson(r, (mean * gamma(r, k)) / k);
      if (!n) continue;
      const same = hitB === b;
      const col = collapse(b, e, buildingDist(b, ix, iy), same);
      if (col) collapsed[b.id]++;
      const kp = b.pts.length / 3;
      const base = Math.floor(n / kp);
      const extra = n - base * kp;
      for (let i = 0; i < kp; i++) {
        const m = base + (i < extra ? 1 : 0);
        if (!m) continue;
        const x = b.pts[i * 3];
        const y = b.pts[i * 3 + 1];
        const z = b.pts[i * 3 + 2];
        let p = harm(plan.heading, plan.fuze, e, ix, iy, x, y, z, b.shield, same, occl[i]);
        if (col > p) p = col;
        if (sec.length) p = withSec(p, x, y, z, b.shield, false);
        if (p <= 0) continue;
        byBuilding[b.id] += m * p;
        c += binomial(r, m, p);
      }
    }
    for (const s of spaces) {
      const q = pop.spaceQ[s.id];
      for (let i = 0; i < s.x.length; i++) {
        const n = poisson(r, q * s.each);
        if (!n) continue;
        let p = harm(plan.heading, plan.fuze, e, ix, iy, s.x[i], s.y[i], 1, 1, false, s.occl[i]);
        if (sec.length) p = withSec(p, s.x[i], s.y[i], 1, 1, false);
        if (p <= 0) continue;
        bySpace[s.id] += n * p;
        c += binomial(r, n, p);
      }
    }
    const sq = pop.streetQ;
    for (let i = 0, j = 0; i < streets.length; i += 2, j++) {
      if (r() >= sq) continue;
      let p = harm(plan.heading, plan.fuze, e, ix, iy, streets[i], streets[i + 1], 1, 1, false, streetOcc[j]);
      if (sec.length) p = withSec(p, streets[i], streets[i + 1], 1, 1, false);
      street += p;
      if (r() < p) c++;
    }
    for (let i = 0, j = 0; i < cars.length; i += 3, j++) {
      if (r() >= pop.trafficQ[cars[i + 2] ? 1 : 0]) continue;
      const people = r() < 0.5 ? 1 : 2;
      let p = harm(plan.heading, plan.fuze, e, ix, iy, cars[i], cars[i + 1], 1, CAR_SHIELD, false, carOcc[j]);
      if (sec.length) p = withSec(p, cars[i], cars[i + 1], 1, CAR_SHIELD, false);
      traffic += p * people;
      c += binomial(r, people, p);
    }
    counts[run] = c;
  }
  for (let i = 0; i < byBuilding.length; i++) {
    byBuilding[i] /= runs;
    collapsed[i] /= runs;
  }
  for (let i = 0; i < bySpace.length; i++) bySpace[i] /= runs;
  const sorted = counts.slice().sort();
  let sum = 0;
  for (const v of counts) sum += v;
  return {
    runs,
    counts,
    pk: destroyed / runs,
    mean: sum / runs,
    p50: quantile(sorted, 0.5),
    p90: quantile(sorted, 0.9),
    max: sorted[sorted.length - 1] ?? 0,
    impacts,
    byBuilding,
    bySpace,
    street: street / runs,
    traffic: traffic / runs,
    secondary: secondaryRuns / runs,
    collapsed,
  };
}

// ---------------------------------------------------------------- the crude circle

export function concernRadius(plan: Plan) {
  const w = weapon(plan.weapon);
  const e = effect(plan, { h: 0 });
  return Math.round(Math.max(e.frag, w.blast * 1.25) + w.cep);
}

export interface CircleContents {
  radius: number;
  buildings: number;
  protectedSites: string[]; // hospitals, schools, places of worship inside
  hazards: string[]; // fuel and the like
  openSpaces: string[]; // squares, markets, yards: people without cover
  people: number;
}

export function inCircle(world: World, plan: Plan, pop: Population): CircleContents {
  const radius = concernRadius(plan);
  const t = targetOf(world, plan.target);
  const out: CircleContents = { radius, buildings: 0, protectedSites: [], hazards: [], openSpaces: [], people: 0 };
  for (const b of world.buildings) {
    if (b.id === t.buildingId || buildingDist(b, plan.aimX, plan.aimY) > radius) continue;
    out.buildings++;
    out.people += pop.observed[b.id] >= 0 ? pop.observed[b.id] : pop.expected[b.id];
    if (b.protected && b.name && !out.protectedSites.includes(b.name)) out.protectedSites.push(b.name);
    if (b.hazard && b.name && !out.hazards.includes(b.name)) out.hazards.push(b.name);
  }
  for (const s of world.spaces) {
    if (rectDist(s.rect, plan.aimX, plan.aimY) > radius) continue;
    out.people += pop.spaceQ[s.id] * s.capacity;
    if (s.protected && s.name && !out.protectedSites.includes(s.name)) out.protectedSites.push(s.name);
    else if (s.name) out.openSpaces.push(s.name);
  }
  return out;
}

// ---------------------------------------------------------------- who signs off

export interface Rules {
  id: string;
  name: string;
  senior: number; // a planning figure at or above this needs the most senior sign-off
  source: string;
}
export const RULES: Rules[] = [
  { id: 'afg2009', name: 'Afghanistan, 2009', senior: 1, source: 'reportedly: any expected civilian death went up the chain' },
  { id: 'iraq2003', name: 'Iraq, 2003', senior: 30, source: 'reportedly: 30 or more went to the defense secretary' },
];

export interface Approval {
  level: 0 | 1 | 2 | 3;
  who: string;
  note: string;
}

/** Who must approve. A protected site inside the circle pushes it up a level. */
export function approver(figure: number, rules: Rules, protectedInCircle = false): Approval {
  let level: 0 | 1 | 2 | 3 = figure === 0 ? 0 : figure >= rules.senior ? 3 : figure < Math.max(2, rules.senior / 4) ? 1 : 2;
  let note = level === 0 ? 'No civilian harm expected.' : level === 3 ? `At or above ${rules.senior}: the most senior sign-off (${rules.name}).` : 'Below the senior threshold.';
  if (protectedInCircle && level > 0 && level < 3) {
    level = (level + 1) as 1 | 2 | 3;
    note += ' A protected site is inside the circle: one level up.';
  }
  const who = ['Strike cell', 'Senior', 'More senior', 'Most senior'][level];
  return { level, who, note };
}

// ---------------------------------------------------------------- the danger field

export interface DangerField {
  x0: number;
  y0: number;
  cell: number;
  cols: number;
  rows: number;
  p: Float32Array; // chance someone standing in the open here is killed or badly hurt; NaN under roofs
  max: number;
}

/** For each patch of open ground near the aim: the chance a person standing there is killed or badly hurt. */
export function dangerField(world: World, plan: Plan, samples = 40, cell = 3, seed = 5): DangerField {
  const r = rng(seed);
  const w = weapon(plan.weapon);
  const sigma = w.cep / 1.1774;
  const hit0 = structureAt(world, plan.aimX, plan.aimY);
  const e0 = effect(plan, hit0);
  const R = Math.max(e0.frag * 1.05, e0.blast * 1.3, w.frag * 0.6) + sigma * 2;
  const x0 = plan.aimX - R;
  const y0 = plan.aimY - R;
  const cols = Math.ceil((2 * R) / cell);
  const rows = cols;
  const n = cols * rows;
  const p = new Float32Array(n);
  const occl = new Float32Array(n);
  const src = hit0?.building?.id ?? -99;
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const x = x0 + (i + 0.5) * cell;
      const y = y0 + (j + 0.5) * cell;
      const k = j * cols + i;
      const v = x < 0 || y < 0 || x >= world.w || y >= world.h ? 0 : world.grid[Math.floor(y / world.cell) * world.gridW + Math.floor(x / world.cell)];
      if (v > 0) {
        p[k] = NaN;
        continue;
      }
      occl[k] = occlusion(world, plan.aimX, plan.aimY, x, y, -99, src);
    }
  for (let s = 0; s < samples; s++) {
    const ix = plan.aimX + normal(r) * sigma;
    const iy = plan.aimY + normal(r) * sigma;
    const e = effect(plan, structureAt(world, ix, iy));
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i;
        if (Number.isNaN(p[k])) continue;
        p[k] += harm(plan.heading, plan.fuze, e, ix, iy, x0 + (i + 0.5) * cell, y0 + (j + 0.5) * cell, 1, 1, false, occl[k]);
      }
  }
  let max = 0;
  for (let k = 0; k < n; k++)
    if (!Number.isNaN(p[k])) {
      p[k] /= samples;
      if (p[k] > max) max = p[k];
    }
  return { x0, y0, cell, cols, rows, p, max };
}

/** Contour segments at a level (marching squares), as x1,y1,x2,y2 quadruples in metres. */
export function contour(f: DangerField, level: number): Float32Array {
  const out: number[] = [];
  const at = (i: number, j: number) => {
    const v = f.p[j * f.cols + i];
    return Number.isNaN(v) ? 0 : v;
  };
  const X = (i: number) => f.x0 + (i + 0.5) * f.cell;
  const Y = (j: number) => f.y0 + (j + 0.5) * f.cell;
  const lerp = (a: number, b: number) => (a === b ? 0.5 : (level - a) / (b - a));
  for (let j = 0; j < f.rows - 1; j++)
    for (let i = 0; i < f.cols - 1; i++) {
      const a = at(i, j);
      const b = at(i + 1, j);
      const c = at(i + 1, j + 1);
      const d = at(i, j + 1);
      const idx = (a >= level ? 8 : 0) | (b >= level ? 4 : 0) | (c >= level ? 2 : 0) | (d >= level ? 1 : 0);
      if (idx === 0 || idx === 15) continue;
      const top = [X(i) + lerp(a, b) * f.cell, Y(j)];
      const right = [X(i + 1), Y(j) + lerp(b, c) * f.cell];
      const bottom = [X(i) + lerp(d, c) * f.cell, Y(j + 1)];
      const left = [X(i), Y(j) + lerp(a, d) * f.cell];
      const seg = (p: number[], q: number[]) => out.push(p[0], p[1], q[0], q[1]);
      switch (idx) {
        case 1:
        case 14:
          seg(left, bottom);
          break;
        case 2:
        case 13:
          seg(bottom, right);
          break;
        case 3:
        case 12:
          seg(left, right);
          break;
        case 4:
        case 11:
          seg(top, right);
          break;
        case 6:
        case 9:
          seg(top, bottom);
          break;
        case 7:
        case 8:
          seg(left, top);
          break;
        case 5:
          seg(left, top);
          seg(bottom, right);
          break;
        case 10:
          seg(top, right);
          seg(left, bottom);
          break;
      }
    }
  return new Float32Array(out);
}
