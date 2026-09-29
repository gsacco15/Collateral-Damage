// Jev's search space: every weapon, fuze, direction, aim point and hour, scored on the same dice.
import { targetOf, type Target, type World } from './city';
import { FUZES, type FuzeId, type Plan, type WeaponId } from './effects';
import { estimate } from './estimate';
import type { IntelByHour } from './intel';
import { population, type Observations } from './life';
import { rng } from './rng';

export type AimId = 'centre' | 'north' | 'south' | 'east' | 'west' | 'custom';

export interface Candidate {
  weapon: WeaponId;
  fuze: FuzeId;
  heading: number;
  aim: AimId;
  hour: number;
}

export interface Scored {
  c: Candidate;
  pk: number;
  mean: number;
  p90: number;
}

export interface SearchSpace {
  weapons: WeaponId[];
  hours: number[];
}

export const HEADINGS = [0, 45, 90, 135, 180, 225, 270, 315];
export const AIMS: Exclude<AimId, 'custom'>[] = ['centre', 'north', 'south', 'east', 'west'];

/** Aim points on a target: its centre and four points a quarter of the way to each side. */
export function aimPoint(t: Target, aim: Exclude<AimId, 'custom'>) {
  const cx = t.rect.x + t.rect.w / 2;
  const cy = t.rect.y + t.rect.h / 2;
  const dx = t.rect.w * 0.28;
  const dy = t.rect.h * 0.28;
  return aim === 'north' ? { x: cx, y: cy - dy } : aim === 'south' ? { x: cx, y: cy + dy } : aim === 'east' ? { x: cx + dx, y: cy } : aim === 'west' ? { x: cx - dx, y: cy } : { x: cx, y: cy };
}

export function candidatePlan(world: World, base: Plan, c: Candidate): Plan {
  const a = c.aim === 'custom' ? { x: base.aimX, y: base.aimY } : aimPoint(targetOf(world, base.target), c.aim);
  return { ...base, weapon: c.weapon, fuze: c.fuze, heading: c.heading, hour: c.hour, aimX: a.x, aimY: a.y };
}

/** Every plan Jev will try, the coarse ones first so the picture fills in quickly. */
export function candidates(space: SearchSpace, seed = 3): Candidate[] {
  const out: Candidate[] = [];
  for (const weapon of space.weapons)
    for (const f of FUZES) for (const heading of HEADINGS) for (const aim of AIMS) for (const hour of space.hours) out.push({ weapon, fuze: f.id, heading, aim, hour });
  const r = rng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  const first = (c: Candidate) => c.aim === 'centre' && c.heading % 90 === 0;
  return [...out.filter(first), ...out.filter((c) => !first(c))];
}

/** Best plan: meets the required chance of destroying the target, then least harm (planning figure, then mean). */
export function best(results: Scored[], minPk: number): Scored | undefined {
  let b: Scored | undefined;
  for (const s of results) {
    if (s.pk < minPk) continue;
    if (!b || s.p90 < b.p90 || (s.p90 === b.p90 && s.mean < b.mean - 1e-9) || (s.p90 === b.p90 && Math.abs(s.mean - b.mean) < 1e-9 && s.pk > b.pk)) b = s;
  }
  return b;
}

export const key = (c: Candidate) => `${c.weapon}|${c.fuze}|${c.heading}|${c.aim}|${c.hour}`;

export interface Job {
  job: number;
  seed: number;
  base: Plan;
  obs: Observations;
  intel?: IntelByHour; // Jev's readings, by whole hour
  ruins?: number[]; // buildings already destroyed
  runs: number;
  cands: Candidate[];
}

/** Score a batch and keep each plan's individual runs too, for watching Jev work. */
export function scoreDetailed(world: World, msg: Job): { out: Scored[]; runs: Uint16Array[] } {
  const pops = new Map<number, ReturnType<typeof population>>();
  const out: Scored[] = [];
  const runs: Uint16Array[] = [];
  for (const c of msg.cands) {
    let pop = pops.get(c.hour);
    if (!pop) pops.set(c.hour, (pop = population(world, c.hour, msg.base.day, msg.base.watched, msg.obs, msg.intel?.[Math.floor(c.hour) % 24], msg.ruins)));
    const e = estimate(world, candidatePlan(world, msg.base, c), pop, msg.runs, 17);
    out.push({ c, pk: e.pk, mean: e.mean, p90: e.p90 });
    runs.push(e.counts);
  }
  return { out, runs };
}

/** Score a batch of candidates. Runs in a worker or on the main thread; the numbers are identical. */
export function score(world: World, msg: Job): Scored[] {
  const pops = new Map<number, ReturnType<typeof population>>();
  return msg.cands.map((c) => {
    let pop = pops.get(c.hour);
    if (!pop) pops.set(c.hour, (pop = population(world, c.hour, msg.base.day, msg.base.watched, msg.obs, msg.intel?.[Math.floor(c.hour) % 24], msg.ruins)));
    const e = estimate(world, candidatePlan(world, msg.base, c), pop, msg.runs, 17);
    return { c, pk: e.pk, mean: e.mean, p90: e.p90 };
  });
}
