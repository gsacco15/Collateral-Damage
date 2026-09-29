import { describe, expect, it } from 'vitest';
import { buildCity, population } from '.';

const city = buildCity(7);
const total = (e: Float32Array, kind: string) => city.buildings.filter((b) => b.kind === kind).reduce((s, b) => s + e[b.id], 0);

describe('Living people model', () => {
  it('keeps each kind of place near its classic total', () => {
    const c = population(city, 10, 'weekday', 6);
    const l = population(city, 10, 'weekday', 6, {}, {}, [], true);
    for (const kind of ['home', 'shop', 'workshop', 'apartment']) {
      const a = total(c.expected, kind);
      const b = total(l.expected, kind);
      expect(Math.abs(b - a) / a).toBeLessThan(0.2);
    }
  });
  it('varies place to place, where the classic model is uniform', () => {
    const l = population(city, 10, 'weekday', 6, {}, {}, [], true);
    const shops = city.buildings.filter((b) => b.kind === 'shop' && !b.name && b.capacity > 5);
    const shares = shops.map((b) => l.expected[b.id] / b.capacity);
    expect(Math.max(...shares) / Math.min(...shares)).toBeGreaterThan(1.5);
  });
  it('is the same every time', () => {
    const a = population(city, 14.5, 'friday', 6, {}, {}, [], true);
    const b = population(city, 14.5, 'friday', 6, {}, {}, [], true);
    expect(Array.from(a.expected)).toEqual(Array.from(b.expected));
  });
  it('leaves the briefed landmarks as they were', () => {
    const school = city.buildings.find((b) => b.name === 'Cotton Street School')!;
    const c = population(city, 10, 'weekday', 6);
    const l = population(city, 10, 'weekday', 6, {}, {}, [], true);
    expect(l.expected[school.id]).toBeCloseTo(c.expected[school.id], 5);
  });
});

import { estimate, targetCentre, targetOf, type Mark, type Plan } from '.';

describe('After a strike (Living)', () => {
  const t = targetOf(city, 'warehouse');
  const c = targetCentre(t);
  const mark: Mark = { x: c.x, y: c.y, hour: 10, day: 'weekday', sev: 0.8 };
  const plan: Plan = { target: 'warehouse', weapon: 'large', fuze: 'instant', heading: 90, aimX: c.x, aimY: c.y, hour: 10.5, day: 'weekday', watched: 6, hardness: t.hardness, stored: false };
  it('changes nothing in Classic', () => {
    const a = population(city, 10.5, 'weekday', 6);
    const b = population(city, 10.5, 'weekday', 6, {}, {}, [], false, [mark]);
    expect(Array.from(b.expected)).toEqual(Array.from(a.expected));
    expect(b.crowds).toBeUndefined();
  });
  it('gathers people to help, empties the school to its gate, and fades by evening', () => {
    const p = population(city, 10.5, 'weekday', 6, {}, {}, [], true, [mark]);
    const kinds = (p.crowds ?? []).map((x) => x.kind);
    expect(kinds).toContain('help');
    expect(kinds).toContain('gate');
    expect(kinds).toContain('hospital');
    const school = city.buildings.find((b) => b.name === 'Cotton Street School')!;
    const before = population(city, 10.5, 'weekday', 6, {}, {}, [], true).expected[school.id];
    expect(p.expected[school.id]).toBeLessThan(before * 0.3);
    const late = population(city, 19, 'weekday', 6, {}, {}, [], true, [mark]);
    expect(late.crowds?.length ?? 0).toBe(0);
  });
  it('counts the crowd at the ruin in a second strike', () => {
    const p = population(city, 10.5, 'weekday', 6, {}, {}, [], true, [mark]);
    const without = { ...p, crowds: p.crowds!.filter((x) => x.kind !== 'help') };
    const a = estimate(city, plan, without, 300, 5).mean;
    const b = estimate(city, plan, p, 300, 5).mean;
    expect(b).toBeGreaterThan(a + 3);
  });
});
