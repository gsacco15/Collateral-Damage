// Jev as the city's behaviour director (Living only). Jev never places people and never touches the physics: it
// answers narrow multiple-choice questions about groups (how each district is behaving this hour; how the area round
// a strike responds), and each answer becomes a capped multiplier on the rules the Living model already follows.
// Keys are small and bucketed, so every answer is asked once and cached for everyone; offline, the rules run alone.
//
// Shared by the page and the server function (api/behave.ts), so both build exactly the same request.
import type { DistrictId, World } from './city';
import type { Day, Mark } from './life';

const clock = (h: number) => {
  const m = Math.round((((h % 24) + 24) % 24) * 60);
  const part = h < 5 ? 'night' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night';
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')} (${part})`;
};

export const TONES = ['very_low', 'low', 'normal', 'high', 'very_high'] as const;
export type Tone = (typeof TONES)[number];
/** How far an answer can move the rules: never more than about a third down or half up. */
export const TONE_K: Record<Tone, number> = { very_low: 0.4, low: 0.7, normal: 1, high: 1.25, very_high: 1.45 };
const TONE_TEXT: Record<Tone, string> = { very_low: 'Far below normal', low: 'Below normal', normal: 'About normal', high: 'Above normal', very_high: 'Far above normal' };

/** What Jev says about one district this hour. Multipliers, 1 = the rules unchanged. */
export interface DistrictMood {
  street: number; // people out on the pavements
  work: number; // at work: offices, workshops, the mill
  school: number; // children at school
  market: number; // shoppers and traders
  prayer: number; // at the mosque
}
/** What Jev says about the area round a strike. */
export interface AfterMood {
  help: number; // people coming back to help at the ruin
  close: number; // the souk and shops nearby shutting (above 1: more shut, for longer)
  pickup: number; // parents going for their children
  hospital: number; // families at the hospital
  quiet: number; // streets round it emptying
}
export interface Behaviour {
  districts: Partial<Record<DistrictId, DistrictMood>>;
  after: Record<string, AfterMood>; // by markKey
}

// ---------------------------------------------------------------- keys

/** A strike, bucketed: its district, the hour, how bad (low / mid / high). */
export const sevBucket = (s: number) => (s < 0.45 ? 'low' : s < 0.75 ? 'mid' : 'high');
export const markKey = (w: World, m: Mark) => `${districtAt(w, m.x, m.y)}|${Math.floor(m.hour)}|${m.day}|${sevBucket(m.sev)}`;

export function districtAt(w: World, x: number, y: number): DistrictId {
  let best: DistrictId = w.districts[0].id;
  let bd = Infinity;
  for (const b of w.blocks) {
    const dx = Math.max(b.x - x, 0, x - b.x - b.w);
    const dy = Math.max(b.y - y, 0, y - b.y - b.h);
    const d = Math.hypot(dx, dy);
    if (d < bd) (bd = d), (best = b.district);
  }
  return bd < 60 ? best : 'desert';
}

/** What the city is still reacting to at this hour: strikes in the last eight hours, bucketed; at most three. */
export function recentEvents(w: World, hour: number, day: Day, marks: Mark[]) {
  const h = ((hour % 24) + 24) % 24;
  return marks
    .filter((m) => m.day === day && (h - m.hour + 24) % 24 < 8)
    .slice(-3)
    .map((m) => {
      const since = (h - m.hour + 24) % 24;
      return `${districtAt(w, m.x, m.y)}:${sevBucket(m.sev)}:${since < 1 ? 'now' : since < 3 ? 'hours' : 'earlier'}`;
    });
}

export interface CityKey {
  hour: number; // whole hour
  day: Day;
  events: string[]; // from recentEvents
}
export const cityId = (k: CityKey) => `${k.hour}|${k.day}|${k.events.join(',')}`;

const DISTRICT_IDS = ['terraces', 'civic', 'oldtown', 'workshops', 'quarter', 'market', 'garden', 'tinhill', 'canal', 'kilns', 'groves', 'camp', 'desert'];
const EVENT_RE = /^[a-z]+:(low|mid|high):(now|hours|earlier)$/;
export function parseCity(q: URLSearchParams): CityKey | null {
  const hour = Number(q.get('hour'));
  const day = q.get('day') as Day;
  const events = (q.get('events') ?? '').split(',').filter(Boolean);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || (day !== 'weekday' && day !== 'friday') || events.length > 3) return null;
  if (!events.every((e) => EVENT_RE.test(e) && DISTRICT_IDS.includes(e.split(':')[0]))) return null;
  return { hour, day, events };
}
export function parseAfter(q: URLSearchParams): { district: DistrictId; hour: number; day: Day; sev: 'low' | 'mid' | 'high' } | null {
  const district = q.get('district') as DistrictId;
  const hour = Number(q.get('hour'));
  const day = q.get('day') as Day;
  const sev = q.get('sev') as 'low' | 'mid' | 'high';
  if (!DISTRICT_IDS.includes(district) || !Number.isInteger(hour) || hour < 0 || hour > 23 || (day !== 'weekday' && day !== 'friday') || !['low', 'mid', 'high'].includes(sev)) return null;
  return { district, hour, day, sev };
}

// ---------------------------------------------------------------- the questions

const SEV_TEXT = { low: 'a small strike, few hurt', mid: 'a strike with several killed or badly hurt', high: 'a large strike with many killed or badly hurt' };
const SINCE_TEXT = { now: 'within the last hour', hours: 'one to three hours ago', earlier: 'earlier today' };
const tone = (instructions: unknown) => ({ type: 'choice', instructions, criteria: Object.fromEntries(TONES.map((t) => [t, TONE_TEXT[t]])) });

/** One call for the whole city this hour: five narrow questions per district. */
export function cityRequest(w: World, k: CityKey) {
  const questions: Record<string, unknown> = {};
  const ds = w.districts.filter((d) => d.id !== 'desert');
  for (const d of ds) {
    const base = { district: `${d.name}: ${d.blurb}` };
    questions[`${d.id}__street`] = tone({ ...base, question: 'Compared with a normal day at this hour, how many people are out on the streets of `district`?' });
    questions[`${d.id}__work`] = tone({ ...base, question: 'Compared with normal, how many of the people who work in `district` are at work right now?' });
    questions[`${d.id}__school`] = tone({ ...base, question: 'Compared with normal at this hour, how many children are at school in `district`?' });
    questions[`${d.id}__market`] = tone({ ...base, question: 'Compared with normal at this hour, how busy are the shops and stalls of `district`?' });
    questions[`${d.id}__prayer`] = tone({ ...base, question: 'Compared with normal at this hour, how many people are at the mosques of `district`?' });
  }
  const state = {
    city: 'A city of about 40,000 people in a long conflict. Air strikes happen; people know the sound of aircraft.',
    time: `${k.day === 'friday' ? 'Friday (the day of congregational prayer, most offices and schools closed)' : 'A weekday'}, ${clock(k.hour)}`,
    recent: k.events.length
      ? k.events.map((e) => {
          const [dist, sev, since] = e.split(':') as [DistrictId, keyof typeof SEV_TEXT, keyof typeof SINCE_TEXT];
          return `${SEV_TEXT[sev]} in ${w.districts.find((d) => d.id === dist)?.name ?? dist}, ${SINCE_TEXT[since]}.`;
        })
      : ['Nothing unusual today.'],
    guidance: 'Answer about ordinary civilians. With nothing unusual, most answers are about normal. After a strike, people nearby stay in, shops shut, parents fetch children; further away life goes on, a little quieter.',
  };
  return { state, model: 'jev-latest', questions };
}

/** One call for the area round a strike: how the people there respond in the hours after. */
export function afterRequest(w: World, k: { district: DistrictId; hour: number; day: Day; sev: 'low' | 'mid' | 'high' }) {
  const d = w.districts.find((x) => x.id === k.district);
  const questions = {
    help: tone({ question: 'How many people come back to the ruin to help dig out the wounded, compared with what is typical after a strike?' }),
    close: tone({ question: 'How strongly do shops and the market nearby shut, compared with what is typical after a strike?' }),
    pickup: tone({ question: 'How strongly do parents rush to fetch their children from school, compared with what is typical after a strike?' }),
    hospital: tone({ question: 'How many families gather at the hospital looking for relatives, compared with what is typical after a strike?' }),
    quiet: tone({ question: 'How strongly do the streets round it empty as people stay indoors, compared with what is typical after a strike?' }),
  };
  const state = {
    place: `${d ? `${d.name}: ${d.blurb}` : k.district}`,
    time: `${k.day === 'friday' ? 'Friday' : 'A weekday'}, ${clock(k.hour)}`,
    event: `${SEV_TEXT[k.sev]}, just now.`,
    guidance: 'Answer about ordinary civilians in this place and at this hour. At night fewer people are about; in a market or near a school the responses are stronger.',
  };
  return { state, model: 'jev-latest', questions };
}

// ---------------------------------------------------------------- the answers

const toneOf = (a: unknown): number => {
  const c = (a as { choice?: string } | undefined)?.choice;
  return c && c in TONE_K ? TONE_K[c as Tone] : 1;
};
export function readCity(w: World, res: { answers: Record<string, unknown> }): Behaviour['districts'] {
  const out: Behaviour['districts'] = {};
  for (const d of w.districts) {
    if (d.id === 'desert') continue;
    const q = (n: string) => toneOf(res.answers[`${d.id}__${n}`]);
    out[d.id] = { street: q('street'), work: q('work'), school: q('school'), market: q('market'), prayer: q('prayer') };
  }
  return out;
}
export function readAfter(res: { answers: Record<string, unknown> }): AfterMood {
  const q = (n: string) => toneOf(res.answers[n]);
  return { help: q('help'), close: q('close'), pickup: q('pickup'), hospital: q('hospital'), quiet: q('quiet') };
}

/** In plain words, what Jev changed: the strongest departures from a normal hour, grouped by district. */
export function moodNote(w: World, b: Behaviour['districts']) {
  const words: [number, string, string][] = [];
  const name = (id: string) => w.districts.find((d) => d.id === id)?.name ?? id;
  const WHAT: Record<keyof DistrictMood, [string, string]> = { street: ['fewer people out on the streets', 'more people out on the streets'], work: ['fewer at work', 'more at work'], school: ['fewer children at school', 'more children at school'], market: ['quieter shops and stalls', 'busier shops and stalls'], prayer: ['fewer at the mosque', 'more at the mosque'] };
  for (const [id, m] of Object.entries(b)) for (const [k, v] of Object.entries(m!) as [keyof DistrictMood, number][]) if (v !== 1) words.push([Math.abs(Math.log(v)), name(id), WHAT[k][v < 1 ? 0 : 1]]);
  words.sort((a, c) => c[0] - a[0]);
  const top = words.slice(0, 2);
  const byPlace = new Map<string, string[]>();
  for (const [, place, what] of top) byPlace.set(place, [...(byPlace.get(place) ?? []), what]);
  return [...byPlace].map(([place, what]) => `in ${place}, ${what.join(' and ')} than usual`);
}
