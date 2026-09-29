// Weapons, fuzes and what a detonation does to a person at a point.
// All radii and probabilities are illustrative stand-ins, invented for teaching, not planning data.
import { buildingAt, buildingDist, inRect, targetOf, type Building, type Material, type TargetId, type World } from './city';
import type { Day } from './life';

export type WeaponId = 'large' | 'medium' | 'small' | 'focused' | 'bunker' | 'spear' | 'blades' | 'moab';
export type FuzeId = 'instant' | 'delay' | 'airburst';

export interface Weapon {
  id: WeaponId;
  name: string;
  short: string;
  blast: number; // metres of heavy blast damage
  frag: number; // metres of dangerous fragments
  cep: number; // metres: half the bombs land within this of the aim
  note: string;
  special?: boolean; // only by hand: Jev never considers it
  mega?: boolean; // the city-flattening one: its own slow, enormous blast, shake and pull-back
  kinetic?: boolean; // no explosive: no fireball, its own settings in place of fuzes
  deep?: boolean; // goes off deep: a huge crater, and rubble thrown high
}

// In order of harm: the least first, the biggest last.
export const WEAPONS: Weapon[] = [
  // Two with no explosive at all. Illustrative numbers, like the rest; their three settings stand in for the fuzes.
  { id: 'blades', name: 'Blade munition (R9X class)', short: 'Blades', blast: 1.5, frag: 3, cep: 1.2, kinetic: true, special: true, note: 'No explosive: just before it lands, six sword-like blades swing out. Meant to kill the one person it hits and spare the people standing near. It will not bring a building down.' },
  { id: 'spear', name: 'Kinetic spear (tungsten rod)', short: 'Spear', blast: 5, frag: 30, cep: 2.5, kinetic: true, special: true, note: 'No explosive: a dense tungsten rod dropped from very high, faster than sound. It punches straight down; what it hits is shattered, and splinters fly out low.' },
  { id: 'focused', name: 'Low-collateral, dense case', short: 'Low-collateral', blast: 7, frag: 14, cep: 4, note: 'A casing that crumbles into dust, not fragments.' },
  { id: 'small', name: '250-lb small-diameter', short: '250 lb', blast: 8, frag: 45, cep: 5, note: 'Narrow body, less explosive, smaller footprint.' },
  { id: 'medium', name: '500-lb class', short: '500 lb', blast: 13, frag: 75, cep: 6, note: 'The workhorse. Enough for most buildings.' },
  { id: 'large', name: '2,000-lb class', short: '2,000 lb', blast: 22, frag: 120, cep: 6, note: 'Destroys almost anything. Throws fragments a very long way.' },
  // A 5,000-lb penetrator: through the roof and the floors, and goes off deep. A huge crater, and rubble thrown high.
  { id: 'bunker', name: 'Bunker buster (5,000-lb class)', short: 'Bunker buster', blast: 26, frag: 100, cep: 5, deep: true, note: 'A thick steel penetrator that punches through metres of concrete before it goes off. Built for bunkers; in a street it digs a huge crater and throws rubble high into the air.' },
  // An 11-tonne air blast bomb. Illustrative radii: roughly where the pressure wave flattens buildings, and how far debris flies.
  { id: 'moab', name: 'Massive air blast (MOAB class)', short: 'MOAB', blast: 280, frag: 500, cep: 9, special: true, mega: true, note: 'An 11-tonne bomb pushed out of a cargo plane. Used once, on a remote tunnel complex. Never in a city: this is why.' },
];
/** The weapons Jev may choose from. The special ones (blades, spear, MOAB) are only ever picked by hand. */
export const SEARCH_WEAPONS = WEAPONS.filter((w) => !w.special);
export const weapon = (id: WeaponId) => WEAPONS.find((w) => w.id === id)!;

export interface Fuze {
  id: FuzeId;
  name: string;
  note: string;
}
export const FUZES: Fuze[] = [
  { id: 'instant', name: 'Impact', note: 'Goes off on the roof or the ground. Fragments fly freely.' },
  { id: 'delay', name: 'Delay', note: 'Punches in first, goes off a floor down. Walls catch most fragments.' },
  { id: 'airburst', name: 'Airburst', note: 'Goes off above. Widest spray; weakest on the building.' },
];
export const fuze = (id: FuzeId) => FUZES.find((f) => f.id === id)!;
/** The two weapons with no explosive have their own three settings, in the fuze's place. */
const MODES: Partial<Record<WeaponId, Record<FuzeId, { name: string; note: string }>>> = {
  spear: {
    instant: { name: 'Straight down', note: 'Comes down near vertical and shatters on the roof: splinters fly out low across the street.' },
    delay: { name: 'Through the floors', note: 'Punches down through every floor before it breaks up. The building takes it; the street far less.' },
    airburst: { name: 'Flechettes', note: 'Breaks open high up into thousands of steel darts, raining down over a wide patch. Walls and roofs stop them; the open does not.' },
  },
  blades: {
    instant: { name: 'Blades out', note: 'Six blades swing out just before it lands. Whoever is under it; almost no one else.' },
    delay: { name: 'Blades folded', note: 'Lands inert, blades kept in: a heavy weight and nothing more. Only what it strikes.' },
    airburst: { name: 'Wide sweep', note: 'The blades open a little higher and wider: surer of the one it is meant for, a little more danger to anyone beside them.' },
  },
};
/** What a setting is called for this weapon: a fuze for a bomb, a mode for the spear and the blades. */
export const modeOf = (w: WeaponId, f: FuzeId) => MODES[w]?.[f] ?? fuze(f);

/** Everything Jev needs to know about one plan. */
export interface Plan {
  target: TargetId;
  weapon: WeaponId;
  fuze: FuzeId;
  heading: number; // degrees the bomb travels (0 north, 90 east)
  aimX: number;
  aimY: number;
  hour: number;
  day: Day;
  watched: number; // hours of observation
  hardness: number; // metres of blast the target needs
  stored: boolean; // suspected munitions inside the target
}

export interface Effect {
  blast: number;
  frag: number;
  fragP: number; // peak chance of harm from fragments, in the open
  shieldPow: number; // < 1: walls and roofs protect less (airburst)
  z: number; // detonation height, metres
}

/** Where it goes off and how hard, given what it hits. */
export function effect(plan: Plan, hit: { h: number } | null): Effect {
  const w = weapon(plan.weapon);
  const base = hit ? hit.h : 0;
  if (w.id === 'spear') {
    if (plan.fuze === 'delay') return hit ? { blast: 7, frag: 12, fragP: 0.25, shieldPow: 1, z: Math.max(0.5, base - 6) } : { blast: 4, frag: 18, fragP: 0.35, shieldPow: 1, z: 0 };
    if (plan.fuze === 'airburst') return { blast: 1.5, frag: 55, fragP: 0.5, shieldPow: 0.6, z: base + 25 };
    return { blast: w.blast, frag: w.frag, fragP: 0.45, shieldPow: 1, z: base };
  }
  if (w.id === 'blades') {
    if (plan.fuze === 'delay') return { blast: 1, frag: 1.2, fragP: 0.2, shieldPow: 1, z: base };
    if (plan.fuze === 'airburst') return { blast: 2.2, frag: 4.5, fragP: 0.85, shieldPow: 1, z: base + 1 };
    return { blast: w.blast, frag: w.frag, fragP: 0.95, shieldPow: 1, z: base };
  }
  if (plan.fuze === 'delay')
    return hit ? { blast: w.blast * 1.4, frag: w.frag * 0.6, fragP: 0.55 * 0.35, shieldPow: 1, z: Math.max(0.5, base - 3.5) } : { blast: w.blast * 0.8, frag: w.frag * 0.55, fragP: 0.55 * 0.5, shieldPow: 1, z: 0 };
  if (plan.fuze === 'airburst') return { blast: w.blast * 0.75, frag: w.frag * 1.3, fragP: 0.55 * 1.2, shieldPow: 0.7, z: base + 7 };
  return { blast: w.blast, frag: w.frag, fragP: 0.55, shieldPow: 1, z: base };
}

/** 0..1: how strongly the fragment pattern leans toward a direction (1 = straight ahead). */
export function lobe(heading: number, dx: number, dy: number) {
  const h = (heading * Math.PI) / 180;
  const len = Math.hypot(dx, dy) || 1;
  const c = (Math.sin(h) * dx - Math.cos(h) * dy) / len;
  return ((1 + c) / 2) ** 2;
}

/**
 * Chance a person is killed or badly hurt.
 * (ix, iy, e.z) is the detonation, (x, y, z) the person. shield: 1 in the open. occl: how much of the
 * fragment spray reaches them past buildings and walls (1 = clear line).
 */
export function harm(heading: number, fuzeId: FuzeId, e: Effect, ix: number, iy: number, x: number, y: number, z: number, shield: number, sameBuilding: boolean, occl: number) {
  const dx = x - ix;
  const dy = y - iy;
  const rb = sameBuilding && fuzeId === 'delay' ? e.blast * 1.1 : e.blast;
  const far = Math.max(rb * 1.25, e.frag);
  if (dx > far || dx < -far || dy > far || dy < -far) return 0;
  // Inside the same building, floor slabs damp the blast between storeys.
  const dz = (z - e.z) * (sameBuilding ? 2.5 : 1);
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d >= far) return 0;
  let pb = 0;
  if (d < rb * 0.8) pb = 0.95;
  else if (d < rb * 1.25) pb = (0.95 * (rb * 1.25 - d)) / (rb * 0.45);
  let pf = 0;
  const g = lobe(heading, dx, dy);
  const reach = e.frag * (0.55 + 0.45 * g);
  if (d < reach && occl > 0) {
    const s = shield >= 1 || sameBuilding ? 1 : Math.pow(shield, e.shieldPow);
    pf = e.fragP * (0.5 + 0.5 * g) * (1 - d / reach) ** 1.5 * s * occl;
  }
  return 1 - (1 - pb) * (1 - pf);
}

// ---------------------------------------------------------------- what stands in the way

const BUILDING_BLOCK = 0.25; // share of fragments that get past a building in the way
const WALL_BLOCK = 0.5; // ... past a garden or compound wall

/** Share of fragments from (ax, ay) that reach (bx, by), past buildings and walls on the way. */
export function occlusion(w: World, ax: number, ay: number, bx: number, by: number, own: number, src: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 2) return 1;
  const steps = Math.ceil(len / 1.5);
  let f = 1;
  let last = 0;
  for (let i = 1; i < steps; i++) {
    const x = ax + (dx * i) / steps;
    const y = ay + (dy * i) / steps;
    const cx = Math.floor(x / w.cell);
    const cy = Math.floor(y / w.cell);
    if (cx < 0 || cy < 0 || cx >= w.gridW || cy >= w.gridH) {
      last = 0;
      continue;
    }
    const v = w.grid[cy * w.gridW + cx];
    if (v !== 0 && v !== last && v !== own + 1 && v !== src + 1) {
      f *= v === -1 ? WALL_BLOCK : BUILDING_BLOCK;
      if (f < 0.02) return 0.02;
    }
    last = v;
  }
  return f;
}

// ---------------------------------------------------------------- what else goes off

export const SECONDARY_STORE: Effect = { blast: 16, frag: 45, fragP: 0.3, shieldPow: 1, z: 2 };
export const SECONDARY_FUEL: Effect = { blast: 16, frag: 50, fragP: 0.35, shieldPow: 1, z: 5 };

/** A marked hazard near the strike, with how clear the line to it is from where the bomb lands. */
export interface Tank {
  b: Building;
  occl: number;
}

/**
 * What else goes off: munitions stored in the target, and marked hazards (fuel) close enough for the blast
 * to set them off, or hit by fragments. Once one tank goes, it sets off its neighbours: a depot goes up together.
 */
export function secondaries(plan: Plan, e: Effect, ix: number, iy: number, kill: boolean, tc: { x: number; y: number }, tanks: Tank[], r: () => number) {
  const out: { x: number; y: number; e: Effect; b: Building | null; by: number }[] = [];
  if (kill && plan.stored) out.push({ x: tc.x, y: tc.y, e: SECONDARY_STORE, b: null, by: -1 });
  const lit = new Uint8Array(tanks.length);
  tanks.forEach((t, i) => {
    const d = buildingDist(t.b, ix, iy);
    let p = 0;
    if (d < t.b.hazard!.ignite + e.blast * 0.8) p = 0.8;
    else {
      const reach = e.frag * (0.55 + 0.45 * lobe(plan.heading, t.b.cx - ix, t.b.cy - iy));
      if (d < reach && t.occl > 0) p = Math.min(0.45, e.fragP * 1.1 * (1 - d / reach) ** 1.2 * t.occl);
    }
    if (p > 0 && r() < p) {
      lit[i] = 1;
      out.push({ x: t.b.cx, y: t.b.cy, e: SECONDARY_FUEL, b: t.b, by: -1 });
    }
  });
  // The chain: every blast so far can set off the tanks around it.
  for (let k = 0; k < out.length; k++) {
    const s = out[k];
    tanks.forEach((t, i) => {
      if (lit[i] || buildingDist(t.b, s.x, s.y) > t.b.hazard!.ignite + s.e.blast * 0.8) return;
      lit[i] = 1;
      out.push({ x: t.b.cx, y: t.b.cy, e: SECONDARY_FUEL, b: t.b, by: k });
    });
  }
  return out;
}

// ---------------------------------------------------------------- buildings coming down

const COLLAPSE: Record<Material, number> = { concrete: 0.5, brick: 0.6, mud: 0.75, tin: 0.4, steel: 0.45, canvas: 0.25 };

/** Blast needed to bring a building down: tall concrete takes a lot more than mud brick or tin. */
export function collapseNeeds(b: Building) {
  if (b.material === 'concrete' && b.floors >= 4) return 17;
  if (b.material === 'concrete' || b.material === 'steel') return 10;
  if (b.material === 'brick') return 8;
  if (b.material === 'canvas') return 3;
  return 6;
}

/** Does this blast bring the building down, and how likely is it to kill or badly hurt the people inside? */
export function collapse(b: Building, e: Effect, distance: number, sameBuilding: boolean) {
  const reach = sameBuilding ? e.blast * 1.1 : e.blast * 0.7;
  if (distance > reach) return 0;
  if (e.blast < collapseNeeds(b)) return 0;
  return COLLAPSE[b.material] * (b.floors >= 4 ? 1.1 : 1);
}

// ---------------------------------------------------------------- the target

export function structureAt(w: World, x: number, y: number): { h: number; building: Building | null } | null {
  const b = buildingAt(w, x, y);
  if (b) return { h: b.h, building: b };
  const bridge = w.roads.find((r) => r.kind === 'bridge' && inRect(r.rect, x, y));
  if (bridge) return { h: 0.5, building: null };
  return null;
}

/** Would a detonation here destroy the target? */
export function destroys(w: World, plan: Plan, ix: number, iy: number) {
  const t = targetOf(w, plan.target);
  const hit = structureAt(w, ix, iy);
  const inside = inRect(t.rect, ix, iy);
  const e = effect(plan, inside ? hit : null);
  const cx = t.rect.x + t.rect.w / 2;
  const cy = t.rect.y + t.rect.h / 2;
  const half = Math.hypot(t.rect.w, t.rect.h) / 2;
  const dc = Math.hypot(ix - cx, iy - cy);
  const out = Math.hypot(Math.max(t.rect.x - ix, 0, ix - (t.rect.x + t.rect.w)), Math.max(t.rect.y - iy, 0, iy - (t.rect.y + t.rect.h)));
  // Long targets (the bridge) only need the section under the bomb dropped: measure across, not along.
  const across = t.rect.w > t.rect.h * 2.5 ? Math.abs(iy - cy) / (t.rect.h / 2) : t.rect.h > t.rect.w * 2.5 ? Math.abs(ix - cx) / (t.rect.w / 2) : dc / half;
  const needs = plan.hardness * (0.6 + 0.8 * Math.min(1.5, across));
  return e.blast >= needs + 2 * out;
}

export const compassName = (deg: number) => ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round((((deg % 360) + 360) % 360) / 45) % 8];
