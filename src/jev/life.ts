// Pattern of life: who is where, hour by hour, on a weekday or a Friday.
// Time is continuous (hours as a float), so a live clock can drive it as easily as a slider.
import { rng } from './rng';
import type { Building, Kind, SpaceKind, World } from './city';
import { judgedMean, type Intel } from './levels';

export type Day = 'weekday' | 'friday';

type Curve = number[]; // 24 values, share of capacity present at each hour

//                        0     1     2     3     4     5     6     7     8     9     10    11    12    13    14    15    16    17    18    19    20    21    22    23
const HOME: Curve = [0.95, 0.96, 0.96, 0.96, 0.95, 0.9, 0.8, 0.62, 0.45, 0.36, 0.33, 0.34, 0.45, 0.48, 0.4, 0.38, 0.45, 0.58, 0.7, 0.82, 0.88, 0.9, 0.93, 0.94];
const HOME_FRI: Curve = [0.95, 0.96, 0.96, 0.96, 0.96, 0.93, 0.88, 0.82, 0.76, 0.7, 0.62, 0.45, 0.3, 0.42, 0.62, 0.6, 0.5, 0.55, 0.66, 0.8, 0.88, 0.9, 0.93, 0.94];
const SHOP: Curve = [0.02, 0.02, 0.02, 0.02, 0.02, 0.03, 0.1, 0.25, 0.5, 0.65, 0.7, 0.72, 0.6, 0.55, 0.62, 0.7, 0.75, 0.78, 0.7, 0.55, 0.35, 0.15, 0.05, 0.03];
const SHOP_FRI: Curve = [0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.03, 0.05, 0.08, 0.1, 0.12, 0.08, 0.02, 0.1, 0.4, 0.6, 0.7, 0.75, 0.7, 0.6, 0.4, 0.2, 0.06, 0.03];
const SCHOOL: Curve = [0, 0, 0, 0, 0, 0, 0.01, 0.2, 0.92, 0.95, 0.9, 0.95, 0.7, 0.9, 0.6, 0.15, 0.05, 0.02, 0.01, 0, 0, 0, 0, 0];
const OFFICE: Curve = [0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.05, 0.3, 0.75, 0.9, 0.9, 0.88, 0.6, 0.8, 0.85, 0.7, 0.4, 0.15, 0.06, 0.03, 0.02, 0.02, 0.02, 0.02];
const WORK: Curve = [0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.1, 0.35, 0.6, 0.7, 0.7, 0.7, 0.5, 0.65, 0.7, 0.7, 0.6, 0.35, 0.1, 0.05, 0.05, 0.05, 0.05, 0.05];
const HOSPITAL: Curve = [0.7, 0.7, 0.68, 0.68, 0.68, 0.7, 0.75, 0.82, 0.9, 0.95, 0.95, 0.95, 0.92, 0.92, 0.95, 0.95, 0.92, 0.88, 0.85, 0.82, 0.78, 0.75, 0.72, 0.7];
const CLINIC: Curve = [0.1, 0.1, 0.1, 0.1, 0.1, 0.12, 0.2, 0.45, 0.8, 0.9, 0.9, 0.9, 0.75, 0.8, 0.85, 0.8, 0.7, 0.55, 0.35, 0.2, 0.15, 0.12, 0.1, 0.1];
const MOSQUE: Curve = [0, 0, 0, 0, 0.02, 0.18, 0.05, 0.01, 0.01, 0.01, 0.01, 0.02, 0.12, 0.2, 0.05, 0.02, 0.1, 0.08, 0.14, 0.12, 0.08, 0.02, 0, 0];
const MOSQUE_FRI: Curve = [0, 0, 0, 0, 0.02, 0.2, 0.05, 0.01, 0.02, 0.03, 0.08, 0.35, 0.98, 0.9, 0.2, 0.05, 0.12, 0.08, 0.16, 0.14, 0.08, 0.02, 0, 0];
const HALL: Curve = [0, 0, 0, 0, 0, 0.02, 0.15, 0.4, 0.7, 0.8, 0.85, 0.85, 0.7, 0.6, 0.7, 0.8, 0.85, 0.75, 0.45, 0.15, 0.03, 0, 0, 0];
const NONE: Curve = new Array(24).fill(0);
const STAND: Curve = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.02, 0.05, 0.05, 0.02, 0, 0, 0, 0];
const STAND_FRI: Curve = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.02, 0.2, 0.75, 0.9, 0.85, 0.3, 0.02, 0, 0, 0];
const SHELTER: Curve = [0.01, 0, 0, 0, 0.02, 0.1, 0.35, 0.7, 0.6, 0.35, 0.25, 0.25, 0.35, 0.35, 0.3, 0.4, 0.6, 0.75, 0.55, 0.3, 0.15, 0.08, 0.03, 0.01];

const BUILDING: Record<Kind, [Curve, Curve]> = {
  home: [HOME, HOME_FRI],
  apartment: [HOME, HOME_FRI],
  villa: [HOME, HOME_FRI],
  shack: [HOME, HOME_FRI],
  shop: [SHOP, SHOP_FRI],
  office: [OFFICE, NONE.map((_, i) => OFFICE[i] * 0.1)],
  hall: [HALL, SHOP_FRI],
  school: [SCHOOL, NONE],
  hospital: [HOSPITAL, HOSPITAL],
  clinic: [CLINIC, CLINIC.map((v) => v * 0.5)],
  mosque: [MOSQUE, MOSQUE_FRI],
  minaret: [NONE, NONE],
  warehouse: [WORK, WORK.map((v) => v * 0.2)],
  workshop: [WORK, WORK.map((v) => v * 0.3)],
  fueltank: [NONE, NONE],
  stand: [STAND, STAND_FRI],
  shelter: [SHELTER, SHELTER.map((v) => v * 0.6)],
};

//                         0     1     2     3     4     5     6     7     8     9     10    11    12    13    14    15    16    17    18    19    20    21    22    23
const PLAZA: Curve = [0.02, 0.01, 0.01, 0.01, 0.01, 0.02, 0.05, 0.12, 0.2, 0.2, 0.22, 0.26, 0.3, 0.25, 0.2, 0.22, 0.3, 0.4, 0.45, 0.42, 0.3, 0.15, 0.06, 0.03];
const MARKET: Curve = [0, 0, 0, 0, 0, 0.02, 0.15, 0.45, 0.8, 0.9, 0.95, 0.9, 0.7, 0.6, 0.7, 0.8, 0.85, 0.75, 0.45, 0.15, 0.03, 0, 0, 0];
const PARK: Curve = [0, 0, 0, 0, 0, 0.02, 0.1, 0.15, 0.1, 0.1, 0.12, 0.15, 0.2, 0.2, 0.2, 0.25, 0.35, 0.5, 0.55, 0.4, 0.2, 0.05, 0.01, 0];
const PLAY: Curve = [0, 0, 0, 0, 0, 0, 0, 0.02, 0.05, 0.1, 0.55, 0.05, 0.6, 0.1, 0.05, 0.3, 0, 0, 0, 0, 0, 0, 0, 0];
const YARD: Curve = [0.02, 0.02, 0.02, 0.02, 0.02, 0.05, 0.15, 0.35, 0.5, 0.5, 0.5, 0.5, 0.35, 0.45, 0.5, 0.5, 0.45, 0.3, 0.1, 0.05, 0.03, 0.02, 0.02, 0.02];
const BUS: Curve = [0.01, 0, 0, 0, 0.02, 0.15, 0.45, 0.85, 0.7, 0.4, 0.3, 0.3, 0.4, 0.4, 0.35, 0.45, 0.7, 0.9, 0.6, 0.35, 0.2, 0.1, 0.04, 0.01];
const CEMETERY: Curve = [0, 0, 0, 0, 0, 0, 0.02, 0.04, 0.06, 0.08, 0.1, 0.08, 0.06, 0.06, 0.08, 0.1, 0.12, 0.08, 0.04, 0.01, 0, 0, 0, 0];
const COURT: Curve = [0, 0, 0, 0, 0, 0.06, 0.02, 0, 0, 0, 0, 0.01, 0.06, 0.08, 0.02, 0.01, 0.04, 0.03, 0.06, 0.05, 0.03, 0.01, 0, 0];
const COURT_FRI: Curve = [0, 0, 0, 0, 0, 0.06, 0.02, 0, 0, 0.02, 0.1, 0.5, 1, 0.85, 0.1, 0.02, 0.05, 0.03, 0.06, 0.05, 0.03, 0.01, 0, 0];
const PITCH: Curve = [0, 0, 0, 0, 0, 0, 0.01, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.03, 0.06, 0.1, 0.12, 0.1, 0.05, 0.02, 0, 0, 0];
const PITCH_FRI: Curve = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.02, 0.08, 0.15, 0.15, 0.15, 0.06, 0.01, 0, 0, 0];

const SPACE: Record<SpaceKind, [Curve, Curve]> = {
  plaza: [PLAZA, PLAZA.map((v, i) => (i >= 11 && i <= 13 ? v * 0.3 : v * 1.15))],
  market: [MARKET, SHOP_FRI],
  park: [PARK, PARK.map((v) => v * 1.4)],
  pitch: [PITCH, PITCH_FRI],
  yard: [YARD, YARD.map((v) => v * 0.2)],
  playground: [PLAY, NONE],
  cemetery: [CEMETERY, CEMETERY.map((v, i) => (i >= 13 && i <= 16 ? v * 3 : v))],
  courtyard: [COURT, COURT_FRI],
  busstation: [BUS, BUS.map((v) => v * 0.6)],
};

// People on foot and in cars.
const STREET: Curve = [0.01, 0.005, 0.003, 0.003, 0.004, 0.02, 0.06, 0.14, 0.2, 0.12, 0.1, 0.11, 0.16, 0.15, 0.11, 0.13, 0.17, 0.2, 0.17, 0.12, 0.08, 0.05, 0.03, 0.015];
const STREET_FRI: Curve = STREET.map((v, i) => (i >= 11 && i <= 12 ? v * 1.6 : i < 11 ? v * 0.6 : v));
const TRAFFIC: Curve = [0.03, 0.02, 0.01, 0.01, 0.02, 0.06, 0.2, 0.45, 0.55, 0.35, 0.3, 0.3, 0.35, 0.35, 0.3, 0.35, 0.5, 0.6, 0.45, 0.3, 0.2, 0.12, 0.07, 0.04];

export function curve(c: Curve, hour: number) {
  const h = ((hour % 24) + 24) % 24;
  const i = Math.floor(h);
  const t = h - i;
  return c[i] * (1 - t) + c[(i + 1) % 24] * t;
}

export interface Population {
  hour: number;
  day: Day;
  expected: Float32Array; // people per building
  observed: Int16Array; // per building, -1 = nothing logged
  cv: number; // how uncertain the building counts are
  judged: Intel; // Jev's reading of the reports, where it has one: the chance of each head-count level
  spaceQ: Float32Array; // share of each open space's capacity present
  streetQ: number; // chance a pavement point has someone on it
  trafficQ: [number, number]; // chance a lane point has a car: quiet streets, the boulevard
}

export type Observations = Record<number, number>;


/** Who is expected where at this moment. Hours watched narrow the guess; Jev's reading of the reports replaces it; logged sightings are taken as known. */
export function population(world: World, hour: number, day: Day, watchedHours: number, obs: Observations = {}, intel: Intel = {}, ruins: number[] = []): Population {
  const fri = day === 'friday' ? 1 : 0;
  const expected = new Float32Array(world.buildings.length);
  const observed = new Int16Array(world.buildings.length).fill(-1);
  for (const b of world.buildings) {
    expected[b.id] = b.capacity * curve(BUILDING[b.kind][fri], hour);
    if (intel[b.id]) expected[b.id] = judgedMean(intel[b.id], b.capacity);
    if (obs[b.id] != null) observed[b.id] = obs[b.id];
  }
  // Ruins from earlier strikes: nobody is inside any more.
  for (const id of ruins) {
    if (id < 0) continue; // the bridge: nobody lives on it
    expected[id] = 0;
    observed[id] = 0;
  }
  const spaceQ = new Float32Array(world.spaces.length);
  for (const s of world.spaces) spaceQ[s.id] = curve(SPACE[s.kind][fri], hour);
  const t = curve(TRAFFIC, hour) * (fri ? 0.6 : 1);
  return {
    hour,
    day,
    expected,
    observed,
    cv: 0.75 / Math.sqrt(1 + watchedHours / 8),
    judged: intel,
    spaceQ,
    streetQ: curve(fri ? STREET_FRI : STREET, hour),
    trafficQ: [t * 0.35, t],
  };
}

/** How many people to draw in a building: the central guess, or what was logged. */
export function shownCount(p: Population, b: Building) {
  const o = p.observed[b.id];
  return Math.min(b.slots.length / 2, o >= 0 ? o : Math.round(p.expected[b.id]));
}

// ---------------------------------------------------------------- where counts come from

export interface Sources {
  overhead: number; // seen from above: only people outside or at windows
  phones: number; // phone signals: not everyone carries one
  census: number; // who lived here years ago, whatever the hour
  model: number; // the pattern-of-life guess the estimate uses
}

/** Three rough, disagreeing counts for one building, as an analyst might have them. */
export function sources(world: World, pop: Population, b: Building): Sources {
  const r = rng(world.seed * 1009 + b.id * 131 + Math.round(pop.hour * 2) + (pop.day === 'friday' ? 7 : 0));
  const e = pop.expected[b.id];
  const jitter = (v: number, k: number) => Math.max(0, Math.round(v * (1 + (r() - 0.5) * k)));
  const outside = pop.hour >= 7 && pop.hour <= 19 ? 0.5 : 0.25;
  const residential = b.kind === 'home' || b.kind === 'apartment' || b.kind === 'villa' || b.kind === 'shack';
  return {
    overhead: jitter(e * outside, 0.6),
    phones: jitter(e * 0.8, 0.5),
    census: residential ? jitter(b.capacity * 0.95, 0.3) : jitter(b.capacity * 0.6, 0.3),
    model: Math.round(e),
  };
}

export const fmtHour = (h: number) => {
  const x = ((h % 24) + 24) % 24;
  const hh = Math.floor(x);
  const mm = Math.floor((x - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

export function partOfDay(h: number) {
  const x = ((h % 24) + 24) % 24;
  if (x < 5 || x >= 21) return 'At night';
  if (x < 7.5) return 'At dawn';
  if (x < 11.5) return 'In the morning';
  if (x < 14.5) return 'At midday';
  if (x < 18) return 'In the afternoon';
  return 'At dusk';
}
