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
    expect(kinds).toContain('medic');
    expect(kinds).toContain('security');
    const school = city.buildings.find((b) => b.name === 'Cotton Street School')!;
    const before = population(city, 10.5, 'weekday', 6, {}, {}, [], true).expected[school.id];
    expect(p.expected[school.id]).toBeLessThan(before * 0.3);
    const late = population(city, 19, 'weekday', 6, {}, {}, [], true, [mark]);
    expect((late.crowds ?? []).filter((x) => x.kind === 'help' || x.kind === 'gate').length).toBe(0);
  });
  it('counts the crowd at the ruin in a second strike', () => {
    const p = population(city, 10.5, 'weekday', 6, {}, {}, [], true, [mark]);
    const without = { ...p, crowds: p.crowds!.filter((x) => x.kind !== 'help') };
    const a = estimate(city, plan, without, 300, 5).mean;
    const b = estimate(city, plan, p, 300, 5).mean;
    expect(b).toBeGreaterThan(a + 3);
  });
});

import handler from '../../api/behave';
import { cityRequest, parseCity, readCity, recentEvents, type Behaviour } from '.';

describe('Jev behaviour director', () => {
  it('asks five narrow questions per district, and reads the answers into capped multipliers', () => {
    const body = cityRequest(city, { hour: 8, day: 'weekday', events: [] });
    expect(Object.keys(body.questions).length).toBe(5 * city.districts.filter((d) => d.id !== 'desert').length);
    const answers: Record<string, unknown> = { oldtown__school: { choice: 'very_low' }, market__market: { choice: 'high' }, civic__work: { choice: 'nonsense' } };
    const moods = readCity(city, { answers });
    expect(moods.oldtown!.school).toBe(0.4);
    expect(moods.market!.market).toBe(1.25);
    expect(moods.civic!.work).toBe(1); // anything unexpected leaves the rules as they are
  });
  it('moves people home rather than losing them', () => {
    const behave: Behaviour = { districts: Object.fromEntries(city.districts.map((d) => [d.id, { street: 1, work: 0.4, school: 0.4, market: 0.4, prayer: 1 }])), after: {} };
    const a = population(city, 10, 'weekday', 6, {}, {}, [], true);
    const b = population(city, 10, 'weekday', 6, {}, {}, [], true, [], behave);
    const sum = (e: Float32Array) => e.reduce((s, x) => s + x, 0);
    expect(Math.abs(sum(b.expected) - sum(a.expected)) / sum(a.expected)).toBeLessThan(0.08);
    const shop = city.buildings.find((x) => x.kind === 'shop' && a.expected[x.id] > 2)!;
    expect(b.expected[shop.id]).toBeLessThan(a.expected[shop.id] * 0.5);
  });
  it('keys only what matters, and the endpoint refuses anything else', async () => {
    expect(recentEvents(city, 10, 'weekday', [])).toEqual([]);
    expect(parseCity(new URLSearchParams('hour=10&day=weekday&events=oldtown:high:now'))).not.toBeNull();
    expect(parseCity(new URLSearchParams('hour=10&day=weekday&events=drop table'))).toBeNull();
    expect((await handler(new Request('https://x.test/api/behave?kind=city&hour=99&day=weekday'))).status).toBe(400);
    expect((await handler(new Request('https://x.test/api/behave?kind=nope'))).status).toBe(400);
  });
});

describe('Groups outside the usual pattern (Living)', () => {
  it('sleep rough by the canal at night and sell on the street by day', () => {
    const night = population(city, 2, 'weekday', 6, {}, {}, [], true).crowds ?? [];
    const day = population(city, 10, 'weekday', 6, {}, {}, [], true).crowds ?? [];
    expect(night.filter((c) => c.kind === 'unhoused').length).toBeGreaterThan(4);
    expect(day.filter((c) => c.kind === 'vendor').length).toBeGreaterThan(3);
    expect(night.some((c) => c.kind === 'vendor')).toBe(false);
    expect(day.some((c) => c.kind === 'security')).toBe(true);
    const morning = population(city, 8, 'weekday', 6, {}, {}, [], true).crowds ?? [];
    for (const k of ['elderly', 'displaced', 'visitor', 'aid']) expect(morning.some((c) => c.kind === k)).toBe(true);
  });
});

import { armedReports, armedTruth, intelId, intelKey, jevRequest, ruleArmed } from '.';

describe('Armed presence (hidden truth, read through reports)', () => {
  const wh = targetOf(city, 'warehouse');
  it('knows the truth: men at Warehouse 14 in the evening, none at midday', () => {
    expect(armedTruth(city, wh.buildingId, 20, 'weekday')).toBeGreaterThan(0);
    expect(armedTruth(city, wh.buildingId, 12, 'weekday')).toBe(0);
    const school = city.buildings.find((b) => b.name === 'Cotton Street School')!;
    expect(armedTruth(city, school.id, 10, 'weekday')).toBe(0);
  });
  it('only asks Jev about it with Living on, and keeps the two readings apart in the cache', () => {
    const plain = jevRequest(city, intelKey('warehouse', 20, 'weekday', 12));
    const armed = jevRequest(city, intelKey('warehouse', 20, 'weekday', 12, true));
    expect('armed' in plain.body.questions).toBe(false);
    expect('armed' in armed.body.questions).toBe(true);
    expect(armed.reports.some((r) => /armed|weapons|long bags/i.test(r))).toBe(true);
    expect(intelId(intelKey('warehouse', 20, 'weekday', 12))).not.toBe(intelId(intelKey('warehouse', 20, 'weekday', 12, true)));
  });
  it('offline, reads the same reports by rule', () => {
    expect(ruleArmed(['No informant reporting on armed men at X.'])).toBe('none');
    expect(ruleArmed(['Informant (reliability unknown): armed men use X, mostly at night.'])).toBe('possible');
    const r = armedReports(city, wh.buildingId!, 'Warehouse 14', 20.5, 'weekday', 24);
    expect(['none', 'possible', 'likely']).toContain(ruleArmed(r));
  });
});
