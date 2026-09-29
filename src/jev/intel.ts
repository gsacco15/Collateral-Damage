// Jev reads the intelligence. The reports on who is inside a site disagree: overhead images only see people
// outside, not everyone carries a phone, the census is years old. Jev (TypeSafe's model) reads them and answers,
// for each site, a probability over how many people are inside. The simulator then samples from that answer.
//
// Shared by the page and the server function, so both build exactly the same request.
import { buildingDist, targetCentre, targetOf, type Building, type TargetId, type World } from './city';
import { fmtHour, partOfDay, population, sources, type Day } from './life';
import { LEVELS, type Intel } from './levels';
import { rng } from './rng';

export { LEVELS, judgedMean, sampleJudged } from './levels';

export const JEV_MODEL = 'jev-latest';
export const JEV_URL = 'https://api.typesafe.ai/v1/systemone';
/** Reported list price, input tokens only; output is free. Used to show what each reading cost. */
export const JEV_USD_PER_MILLION_INPUT = 0.042;

export const AGREE = {
  agree: 'The sources give roughly the same picture',
  mixed: 'Some sources disagree, but a picture emerges',
  conflict: 'The sources contradict each other',
} as const;
export type Agreement = keyof typeof AGREE;

/** Watching is bucketed so that nearby slider values share one reading (and one cached answer). */
const WATCH_BUCKETS = [0, 6, 12, 24, 48, 72];
export const watchBucket = (h: number) => WATCH_BUCKETS.filter((b) => b <= h).pop() ?? 0;

export interface IntelKey {
  target: TargetId;
  hour: number; // whole hour, 0–23
  day: Day;
  watched: number; // a bucket
}
export const intelKey = (target: TargetId, hour: number, day: Day, watched: number): IntelKey => ({ target, hour: ((Math.floor(hour) % 24) + 24) % 24, day, watched: watchBucket(watched) });
export const intelId = (k: IntelKey) => `${k.target}|${k.hour}|${k.day}|${k.watched}`;

const TARGETS: TargetId[] = ['warehouse', 'tower', 'yard', 'bridge'];
export function parseKey(q: URLSearchParams): IntelKey | null {
  const target = q.get('target') as TargetId;
  const hour = Number(q.get('hour'));
  const day = q.get('day') as Day;
  const watched = Number(q.get('watched'));
  if (!(TARGETS.includes(target) || /^b:\d{1,4}$/.test(target)) || !Number.isInteger(hour) || hour < 0 || hour > 23 || (day !== 'weekday' && day !== 'friday') || !WATCH_BUCKETS.includes(watched)) return null;
  return { target, hour, day, watched };
}

export interface Site {
  id: number; // building id
  name: string;
  role: 'target' | 'protected' | 'nearby';
}

const KIND_NAME: Partial<Record<Building['kind'], string>> = { home: 'house', apartment: 'block of flats', villa: 'villa', shack: 'shack', school: 'school', mosque: 'mosque', hospital: 'hospital', clinic: 'clinic', warehouse: 'warehouse', office: 'office block', shop: 'shop', workshop: 'workshop' };
const describe = (b: Building) => KIND_NAME[b.kind] ?? b.kind;

/** The target building (if the target is one) and the nearest protected sites, then the nearest homes. At most three. */
export function sitesFor(world: World, target: TargetId): Site[] {
  const t = targetOf(world, target);
  const c = targetCentre(t);
  const out: Site[] = [];
  if (t.buildingId != null) out.push({ id: t.buildingId, name: t.name, role: 'target' });
  const near = world.buildings.filter((b) => b.id !== t.buildingId && b.capacity > 0).sort((a, b) => buildingDist(a, c.x, c.y) - buildingDist(b, c.x, c.y));
  for (const b of near) {
    if (out.length >= 3) break;
    if (b.protected && buildingDist(b, c.x, c.y) < 220 && !out.some((s) => s.name === b.name)) out.push({ id: b.id, name: b.name ?? `the ${describe(b)}`, role: 'protected' });
  }
  for (const b of near) {
    if (out.length >= 2) break;
    if (b.kind === 'apartment' || b.kind === 'home') out.push({ id: b.id, name: `the ${describe(b)} nearest the target`, role: 'nearby' });
  }
  return out;
}

/** The field reports for one site at one hour: they disagree, as real ones do. */
function reportsFor(world: World, key: IntelKey, b: Building, name: string) {
  const pop = population(world, key.hour + 0.5, key.day, key.watched);
  const s = sources(world, pop, b);
  const r = rng(world.seed * 7919 + b.id * 31 + key.hour * 3 + key.watched + (key.day === 'friday' ? 101 : 0));
  const at = fmtHour(key.hour + 0.2 + r() * 0.5);
  const residential = b.kind === 'home' || b.kind === 'apartment' || b.kind === 'villa' || b.kind === 'shack';
  const out = [
    `Overhead image of ${name} at ${at}: ${s.overhead === 0 ? 'nobody visible' : `${s.overhead} ${s.overhead === 1 ? 'person' : 'people'} visible outside, on the roof or at windows`}.`,
    `Phone signals: about ${s.phones} handsets in or right beside ${name}.`,
    residential ? `Census from before the conflict: ${s.census} people registered as living at ${name}.` : `Records from before the conflict: ${name} was used by about ${s.census} people.`,
  ];
  if (key.watched > 0) {
    const spread = 0.9 / Math.sqrt(1 + key.watched / 8);
    const seen = Math.max(0, Math.round(pop.expected[b.id] * (1 + (r() - 0.5) * spread)));
    out.push(`Observer, after ${key.watched} hours watching ${name}: counted about ${seen} going in and not coming out.`);
  }
  if (b.kind === 'school') out.push(key.day === 'friday' ? `${name}: no classes on Fridays.` : key.hour >= 7 && key.hour < 15 ? `${name}: classes normally run at this hour.` : `${name}: classes are normally over by this hour.`);
  if (b.kind === 'mosque' && key.day === 'friday' && key.hour >= 11 && key.hour < 14) out.push(`${name}: Friday prayers are normally held around now.`);
  return out;
}

export interface JevRequest {
  state: unknown;
  model: string;
  questions: Record<string, unknown>;
}

/** One call: the reports as the state, one "how many inside" question per site, and one on whether the sources agree. */
export function jevRequest(world: World, key: IntelKey): { body: JevRequest; sites: Site[]; reports: string[] } {
  const t = targetOf(world, key.target);
  const sites = sitesFor(world, key.target);
  const reports = sites.flatMap((s) => reportsFor(world, key, world.buildings[s.id], s.name));
  const questions: Record<string, unknown> = {};
  sites.forEach((s, i) => {
    questions[`inside_${i}`] = {
      type: 'score',
      instructions: {
        site: s.name,
        question: 'Going by the reports, how many people are inside `site` right now? Overhead images only show people outside or at windows; not everyone carries a phone; the census is years old; an observer who watched longer is more reliable.',
      },
      criteria: LEVELS.map((l) => l.text),
    };
  });
  questions.agree = { type: 'choice', instructions: 'Do the reports about these sites agree with each other?', criteria: { ...AGREE } };
  const state = {
    time: `${key.day === 'friday' ? 'Friday' : 'A weekday'}, ${fmtHour(key.hour)} (${partOfDay(key.hour + 0.5).toLowerCase()})`,
    target: `${t.name}: ${t.note}`,
    sites: sites.map((s) => `${s.name}: a ${describe(world.buildings[s.id])} with ${world.buildings[s.id].floors} floor${world.buildings[s.id].floors === 1 ? '' : 's'}`),
    reports,
  };
  return { body: { state, model: JEV_MODEL, questions }, sites, reports };
}

export interface SiteReading extends Site {
  p: number[]; // probability of each level
  score: number;
  confidence: number;
}
export interface JevReading {
  ok: true;
  key: IntelKey;
  model: string;
  sites: SiteReading[];
  agree: { choice: Agreement; confidence: number };
  reports: string[];
  usage: { input_tokens: number; output_tokens: number };
  ms: number;
}
export type JevReply = JevReading | { ok: false; reason: 'no-key' | 'bad-request' | 'upstream' | 'offline'; status?: number };

interface ScoreAnswer {
  score: number;
  confidence: number;
  probabilities: Record<string, number>;
}
interface ChoiceAnswer {
  choice: string;
  confidence: number;
}

/** Turn Jev's answers into readings the simulator can sample from. Throws if the reply isn't the documented shape. */
export function readAnswers(key: IntelKey, sites: Site[], reports: string[], res: { model: string; answers: Record<string, unknown>; usage?: { input_tokens: number; output_tokens: number } }, ms: number): JevReading {
  const read = sites.map((s, i) => {
    const a = res.answers[`inside_${i}`] as ScoreAnswer | undefined;
    if (!a || typeof a.score !== 'number' || !a.probabilities) throw new Error(`no answer for inside_${i}`);
    const p = LEVELS.map((_, k) => Math.max(0, Number(a.probabilities[String(k)]) || 0));
    const sum = p.reduce((x, y) => x + y, 0) || 1;
    return { ...s, p: p.map((x) => x / sum), score: a.score, confidence: a.confidence ?? 0 };
  });
  const ag = res.answers.agree as ChoiceAnswer | undefined;
  const choice = ag && ag.choice in AGREE ? (ag.choice as Agreement) : 'mixed';
  return { ok: true, key, model: res.model, sites: read, agree: { choice, confidence: ag?.confidence ?? 0 }, reports, usage: res.usage ?? { input_tokens: 0, output_tokens: 0 }, ms };
}

export type { Intel } from './levels';
/** Intel for each whole hour that Jev has read. */
export type IntelByHour = Record<number, Intel>;
export const intelOf = (r: JevReading): Intel => Object.fromEntries(r.sites.map((s) => [s.id, s.p]));

export const readingCost = (r: JevReading) => (r.usage.input_tokens * JEV_USD_PER_MILLION_INPUT) / 1e6;
