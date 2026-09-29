import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../../api/jev';
import { buildCity, targetCentre, targetOf } from './city';
import { estimate } from './estimate';
import { intelKey, jevRequest, LEVELS, readAnswers, sampleJudged, sitesFor, type JevReading } from './intel';
import { population } from './life';
import { rng } from './rng';
import type { Plan } from './effects';

const world = buildCity();
const key = intelKey('warehouse', 22, 'weekday', 7);
const planFor = (target: Plan['target'], hour: number): Plan => {
  const t = targetOf(world, target);
  const c = targetCentre(t);
  return { target, weapon: 'large', fuze: 'instant', heading: 90, aimX: c.x, aimY: c.y, hour, day: 'weekday', watched: 6, hardness: t.hardness, stored: false };
};

/** A reply in the documented shape: one Score per site, one Choice. */
function fakeReply(p: number[]) {
  const answers: Record<string, unknown> = {};
  sitesFor(world, 'warehouse').forEach((_, i) => {
    answers[`inside_${i}`] = { type: 'score', score: 2, confidence: 0.8, legend: {}, probabilities: Object.fromEntries(p.map((v, k) => [String(k), v])) };
  });
  answers.agree = { type: 'choice', choice: 'mixed', confidence: 0.7, probabilities: { agree: 0.2, mixed: 0.7, conflict: 0.1 } };
  return { model: 'jev-1.13.0', answers, usage: { input_tokens: 1800, output_tokens: 40 } };
}

describe('Jev reads the intelligence', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('builds one small request: the reports, a score per site, a choice on agreement', () => {
    const { body, sites, reports } = jevRequest(world, key);
    expect(body.model).toBe('jev-latest');
    expect(sites[0]).toMatchObject({ role: 'target', name: targetOf(world, 'warehouse').name });
    expect(sites.some((s) => s.name === 'Cotton Street School')).toBe(true);
    expect(Object.keys(body.questions)).toEqual([...sites.map((_, i) => `inside_${i}`), 'agree']);
    expect((body.questions.inside_0 as { criteria: string[] }).criteria).toHaveLength(LEVELS.length);
    expect(reports.length).toBeGreaterThanOrEqual(sites.length * 3);
    // Small enough to cost a fraction of a cent: roughly a few thousand characters.
    expect(JSON.stringify(body).length).toBeLessThan(6000);
    // The same key always gives the same request, so caching is sound.
    expect(JSON.stringify(jevRequest(world, key).body)).toBe(JSON.stringify(body));
  });

  it('turns a reply into probabilities the simulator can sample', () => {
    const { sites, reports } = jevRequest(world, key);
    const r = readAnswers(key, sites, reports, fakeReply([0, 0, 0.2, 0.8, 0]), 120);
    expect(r.sites[0].p).toEqual([0, 0, 0.2, 0.8, 0]);
    expect(r.agree.choice).toBe('mixed');
    const rr = rng(1);
    for (let i = 0; i < 200; i++) {
      const n = sampleJudged(rr, r.sites[0].p, 500);
      expect(n).toBeGreaterThanOrEqual(6);
      expect(n).toBeLessThanOrEqual(60);
    }
  });

  it("changes the estimate: a crowded reading means more people hurt than an empty one", () => {
    const t = targetOf(world, 'warehouse');
    const plan = planFor('warehouse', 22);
    const empty = population(world, 22.5, 'weekday', 7, {}, { [t.buildingId!]: [1, 0, 0, 0, 0] });
    const full = population(world, 22.5, 'weekday', 7, {}, { [t.buildingId!]: [0, 0, 0, 0, 1] });
    expect(estimate(world, plan, full, 300, 3).mean).toBeGreaterThan(estimate(world, plan, empty, 300, 3).mean + 5);
  });

  it('server: keeps the key server-side, sends the documented request, caches the answer', async () => {
    vi.stubGlobal('process', { env: { TYPESAFE_API_KEY: 'test-key' } });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(fakeReply([0.1, 0.6, 0.3, 0, 0])), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await handler(new Request('https://x.test/api/jev?target=warehouse&hour=22&day=weekday&watched=6'));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('s-maxage');
    const body = (await res.json()) as JevReading;
    expect(body.ok).toBe(true);
    expect(body.sites[0].p[1]).toBeCloseTo(0.6);
    expect(JSON.stringify(body)).not.toContain('test-key');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.typesafe.ai/v1/systemone');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
    const sent = JSON.parse(init.body as string);
    expect(sent.model).toBe('jev-latest');
    expect(sent.questions.agree.type).toBe('choice');
    // Asked again: answered from this instance's cache, no second call.
    await handler(new Request('https://x.test/api/jev?target=warehouse&hour=22&day=weekday&watched=6'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('server: refuses anything but a known target and hour, and says when there is no key', async () => {
    vi.stubGlobal('process', { env: {} });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await handler(new Request('https://x.test/api/jev?target=anything&hour=3&day=weekday&watched=0'))).status).toBe(400);
    expect((await handler(new Request('https://x.test/api/jev?target=warehouse&hour=99&day=weekday&watched=0'))).status).toBe(400);
    const r = await handler(new Request('https://x.test/api/jev?target=tower&hour=3&day=weekday&watched=0'));
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ ok: false, reason: 'no-key' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
