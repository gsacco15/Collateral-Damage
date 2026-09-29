import { describe, expect, it } from 'vitest';
import {
  aimPoint,
  approver,
  best,
  buildCity,
  buildingDist,
  candidates,
  cellAt,
  collapse,
  concernRadius,
  effect,
  estimate,
  harm,
  inCircle,
  inRiver,
  lobe,
  occlusion,
  population,
  RULES,
  score,
  sources,
  targetCentre,
  targetOf,
  type Day,
  type Plan,
  type Scored,
  type TargetId,
} from './index';

const city = buildCity(7);
const plan = (p: Partial<Plan> = {}): Plan => {
  const target = p.target ?? 'warehouse';
  const t = targetOf(city, target);
  const c = targetCentre(t);
  return { target, weapon: 'large', fuze: 'instant', heading: 90, aimX: c.x, aimY: c.y, hour: 10, day: 'weekday', watched: 6, hardness: t.hardness, stored: false, ...p };
};
const run = (p: Partial<Plan>, runs = 300) => {
  const pl = plan(p);
  return estimate(city, pl, population(city, pl.hour, pl.day, pl.watched), runs, 3);
};
const named = (name: string) => city.buildings.find((b) => b.name === name)!;

describe('the city', () => {
  it('is deterministic for a seed', () => {
    expect(buildCity(7)).toBe(city);
    const again = buildCity(8);
    expect(again.buildings.length).toBeGreaterThan(500);
  });
  it('has its districts, landmarks, targets and hazards', () => {
    expect(city.districts.map((d) => d.id)).toEqual(expect.arrayContaining(['terraces', 'civic', 'oldtown', 'workshops', 'quarter', 'market', 'garden', 'tinhill']));
    for (const n of ['Cotton Street School', 'City Hospital', 'Great Mosque', 'Warehouse 14', 'Tower 7']) expect(named(n)).toBeTruthy();
    expect(city.targets.map((t) => t.id)).toEqual(['warehouse', 'tower', 'yard', 'bridge']);
    expect(city.buildings.filter((b) => b.hazard).length).toBe(4);
    expect(city.buildings.filter((b) => b.protected).length).toBeGreaterThanOrEqual(5);
  });
  it('keeps buildings out of the river and on the occupancy grid', () => {
    for (const b of city.buildings) expect(inRiver(b.cx, b.cy)).toBe(false);
    const school = named('Cotton Street School');
    expect(cellAt(city, school.rects[0].x + 5, school.rects[0].y + 5)).toBe(school.id + 1);
  });
  it('builds tin shacks densely and apartments tall', () => {
    const shacks = city.buildings.filter((b) => b.kind === 'shack');
    const flats = city.buildings.filter((b) => b.kind === 'apartment');
    expect(shacks.length).toBeGreaterThan(150);
    expect(Math.max(...flats.map((b) => b.floors))).toBeGreaterThanOrEqual(8);
    expect(shacks[0].shield).toBeGreaterThan(flats[0].shield); // tin stops less than concrete
  });
});

describe('pattern of life', () => {
  const school = named('Cotton Street School');
  const mosque = named('Great Mosque');
  const at = (h: number, d: Day) => population(city, h, d, 6);
  it('fills the school on weekdays and empties it on Fridays', () => {
    expect(at(10, 'weekday').expected[school.id]).toBeGreaterThan(30);
    expect(at(10, 'friday').expected[school.id]).toBe(0);
    expect(at(2, 'weekday').expected[school.id]).toBe(0);
  });
  it('packs the mosque at Friday noon', () => {
    expect(at(12.5, 'friday').expected[mosque.id]).toBeGreaterThan(at(12.5, 'weekday').expected[mosque.id] * 4);
  });
  it('fills the stadium for a Friday match', () => {
    const pitch = city.spaces.find((s) => s.kind === 'pitch')!;
    expect(at(17, 'friday').spaceQ[pitch.id]).toBeGreaterThan(at(17, 'weekday').spaceQ[pitch.id]);
  });
  it('narrows the guess with hours watched', () => {
    expect(population(city, 10, 'weekday', 48).cv).toBeLessThan(population(city, 10, 'weekday', 0).cv);
  });
  it('gives three disagreeing, reproducible sources', () => {
    const b = city.buildings.filter((x) => x.kind === 'apartment').sort((a, c) => c.capacity - a.capacity)[0];
    const s = sources(city, at(2, 'weekday'), b);
    expect(s).toEqual(sources(city, at(2, 'weekday'), b));
    expect(s.census).toBeGreaterThan(s.overhead);
  });
});

describe('effects', () => {
  it('leans fragments the way the bomb travels', () => {
    expect(lobe(0, 0, -1)).toBeCloseTo(1);
    expect(lobe(0, 0, 1)).toBeCloseTo(0);
    const e = effect(plan({ heading: 0 }), null);
    expect(harm(0, 'instant', e, 0, 0, 0, -30, 1, 1, false, 1)).toBeGreaterThan(harm(0, 'instant', e, 0, 0, 0, 30, 1, 1, false, 1));
  });
  it('lets walls, distance and height protect', () => {
    const e = effect(plan(), null);
    const open = harm(90, 'instant', e, 0, 0, 40, 0, 1, 1, false, 1);
    expect(harm(90, 'instant', e, 0, 0, 40, 0, 1, 0.5, false, 1)).toBeLessThan(open);
    expect(harm(90, 'instant', e, 0, 0, 40, 0, 1, 1, false, 0.25)).toBeLessThan(open);
    expect(harm(90, 'instant', e, 0, 0, 40, 0, 26, 1, false, 1)).toBeLessThan(open);
    expect(harm(90, 'instant', e, 0, 0, 500, 0, 1, 1, false, 1)).toBe(0);
  });
  it('blocks fragments with buildings in the way', () => {
    const school = named('Cotton Street School');
    const q = school.rects[0];
    // From west of the school to east of it, straight through.
    expect(occlusion(city, q.x - 6, q.y + q.h / 2, q.x + q.w + 6, q.y + q.h / 2, -99, -99)).toBeLessThan(0.5);
    expect(occlusion(city, q.x - 6, q.y - 4, q.x - 6, q.y - 30, -99, -99)).toBeGreaterThan(0.2);
  });
  it('brings down mud brick easily and tall concrete only with a big blast', () => {
    const mud = city.buildings.find((b) => b.material === 'mud')!;
    const tower = named('Tower 7');
    const small = effect(plan({ weapon: 'small' }), null);
    const large = effect(plan({ weapon: 'large' }), null);
    expect(collapse(mud, small, 1, false)).toBeGreaterThan(0);
    expect(collapse(tower, small, 1, false)).toBe(0);
    expect(collapse(tower, large, 1, false)).toBeGreaterThan(0);
  });
});

describe('the estimate', () => {
  it('is reproducible and orders its percentiles', () => {
    const a = run({});
    expect(a.counts).toEqual(run({}).counts);
    expect(a.p50).toBeLessThanOrEqual(a.p90);
    expect(a.p90).toBeLessThanOrEqual(a.max);
  });
  it('drops with a smaller warhead, a delay fuze and a night strike', () => {
    const big = run({ weapon: 'large' });
    const small = run({ weapon: 'small' });
    const delay = run({ weapon: 'small', fuze: 'delay' });
    const night = run({ weapon: 'small', fuze: 'delay', hour: 2 });
    expect(small.mean).toBeLessThan(big.mean);
    expect(night.mean).toBeLessThan(delay.mean);
    expect(night.p90).toBeLessThanOrEqual(3);
  });
  it('is worse by day when fragments are thrown toward the school', () => {
    expect(run({ heading: 270 }).mean).toBeLessThan(run({ heading: 90 }).mean);
  });
  it('counts stored munitions going off', () => {
    const e = run({ weapon: 'small', fuze: 'delay', stored: true });
    expect(e.secondary).toBeGreaterThan(0.5);
    expect(e.mean).toBeGreaterThan(run({ weapon: 'small', fuze: 'delay' }).mean);
  });
  it('needs a big weapon for the bridge and brings the tower down with one', () => {
    expect(run({ target: 'bridge', weapon: 'small', fuze: 'delay' }).pk).toBeLessThan(0.2);
    expect(run({ target: 'bridge', weapon: 'large' }).pk).toBeGreaterThan(0.7);
    const tower = named('Tower 7');
    expect(run({ target: 'tower', weapon: 'large', hour: 2 }).collapsed[tower.id]).toBeGreaterThan(0.9);
    expect(run({ target: 'tower', weapon: 'focused', fuze: 'delay', hour: 2 }).collapsed[tower.id]).toBe(0);
  });
  it('treats logged sightings as known', () => {
    const t = targetCentre(targetOf(city, 'warehouse'));
    const house = city.buildings.filter((b) => b.kind === 'home' || b.kind === 'shop').sort((a, b) => buildingDist(a, t.x, t.y) - buildingDist(b, t.x, t.y))[0];
    const p = plan({ weapon: 'medium', hour: 2 });
    const none = estimate(city, p, population(city, 2, 'weekday', 6, { [house.id]: 0 }), 300, 3);
    const many = estimate(city, p, population(city, 2, 'weekday', 6, { [house.id]: 30 }), 300, 3);
    expect(many.byBuilding[house.id]).toBeGreaterThan(none.byBuilding[house.id]);
  });
  it('flags protected sites and hazards inside the crude circle', () => {
    const c = inCircle(city, plan(), population(city, 10, 'weekday', 6));
    expect(c.radius).toBe(concernRadius(plan()));
    expect(c.protectedSites).toContain('Cotton Street School');
    expect(c.hazards).toContain('Fuel Depot');
  });
});

describe('sign-off and search', () => {
  it('escalates with the figure, and a level for protected sites', () => {
    const iraq = RULES.find((r) => r.id === 'iraq2003')!;
    expect(approver(0, iraq).level).toBe(0);
    expect(approver(1, iraq).level).toBe(1);
    expect(approver(15, iraq).level).toBe(2);
    expect(approver(30, iraq).level).toBe(3);
    expect(approver(1, iraq, true).level).toBe(2);
    expect(approver(1, RULES[0]).level).toBe(3);
  });
  it('enumerates the whole space, coarse plans first', () => {
    const c = candidates({ weapons: ['large', 'small'], hours: [2, 10] });
    expect(c.length).toBe(2 * 3 * 8 * 5 * 2);
    expect(c[0].aim).toBe('centre');
    expect(new Set(c.map((x) => JSON.stringify(x))).size).toBe(c.length);
  });
  it('picks the least harmful plan that meets the requirement', () => {
    const mk = (p90: number, pk: number, mean = p90): Scored => ({ c: { weapon: 'small', fuze: 'delay', heading: 0, aim: 'centre', hour: p90 }, p90, pk, mean });
    const list = [mk(0, 0.2), mk(3, 0.9), mk(1, 0.86), mk(1, 0.95, 0.5)];
    expect(best(list, 0.85)!.pk).toBe(0.95);
    expect(best(list, 0.99)).toBeUndefined();
  });
  it('scores candidates exactly as the page would', () => {
    const base = plan();
    const t = targetOf(city, 'warehouse');
    const [s] = score(city, { job: 1, seed: 7, base, obs: {}, runs: 150, cands: [{ weapon: 'medium', fuze: 'delay', heading: 270, aim: 'north', hour: 2 }] });
    const a = aimPoint(t, 'north');
    const e = estimate(city, { ...base, weapon: 'medium', fuze: 'delay', heading: 270, hour: 2, aimX: a.x, aimY: a.y }, population(city, 2, 'weekday', base.watched), 150, 17);
    expect(s.p90).toBe(e.p90);
    expect(s.pk).toBe(e.pk);
  });
  it('covers every target', () => {
    for (const id of ['warehouse', 'tower', 'yard', 'bridge'] as TargetId[]) {
      const e = run({ target: id, weapon: 'medium' }, 60);
      expect(e.pk).toBeGreaterThanOrEqual(0);
      expect(e.counts.length).toBe(60);
    }
  });
});
