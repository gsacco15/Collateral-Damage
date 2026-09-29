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
