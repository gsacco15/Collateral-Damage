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
