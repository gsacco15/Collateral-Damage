// Pattern of life: who is where, hour by hour, on a weekday or a Friday.
// Time is continuous (hours as a float), so a live clock can drive it as easily as a slider.
import { rng } from './rng';
import { riverX, type Building, type Kind, type SpaceKind, type World } from './city';
import { judgedMean, type Intel } from './levels';
import { living as livingOf } from './people';
import { markKey, type AfterMood, type Behaviour, type DistrictMood } from './behave';

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
// The mill never stops: three shifts, a dip at each change. The kilns are worked before the heat. The camp has nowhere else to be.
const MILL: Curve = [0.5, 0.5, 0.5, 0.5, 0.5, 0.45, 0.35, 0.6, 0.65, 0.65, 0.65, 0.65, 0.6, 0.6, 0.4, 0.6, 0.6, 0.6, 0.6, 0.55, 0.55, 0.5, 0.35, 0.5];
const KILN: Curve = [0.1, 0.1, 0.1, 0.15, 0.3, 0.6, 0.8, 0.85, 0.85, 0.8, 0.7, 0.5, 0.3, 0.3, 0.35, 0.5, 0.6, 0.55, 0.3, 0.15, 0.1, 0.1, 0.1, 0.1];
const TENT: Curve = [0.97, 0.97, 0.97, 0.97, 0.97, 0.93, 0.85, 0.72, 0.62, 0.58, 0.55, 0.58, 0.65, 0.66, 0.6, 0.58, 0.6, 0.68, 0.78, 0.86, 0.9, 0.93, 0.95, 0.96];
const FARM: Curve = [0, 0, 0, 0, 0.05, 0.4, 0.8, 0.8, 0.7, 0.5, 0.3, 0.1, 0.05, 0.05, 0.05, 0.1, 0.4, 0.6, 0.4, 0.1, 0, 0, 0, 0];
const OLDCAMP: Curve = [0.9, 0.9, 0.9, 0.9, 0.85, 0.6, 0.3, 0.15, 0.1, 0.1, 0.15, 0.3, 0.45, 0.45, 0.3, 0.15, 0.1, 0.15, 0.4, 0.7, 0.85, 0.9, 0.9, 0.9];
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
  factory: [MILL, MILL.map((v) => v * 0.7)],
  kiln: [KILN, KILN.map((v) => v * 0.3)],
  chimney: [NONE, NONE],
  silo: [NONE, NONE],
  tent: [TENT, TENT.map((v, i) => (i >= 11 && i <= 13 ? v * 0.8 : v))],
  greenhouse: [FARM, FARM.map((v) => v * 0.5)],
  watertank: [NONE, NONE],
  // The old barracks: the herding family sleeps inside, and is out with the goats by day.
  barracks: [OLDCAMP, OLDCAMP],
  mast: [NONE, NONE],
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

const DIST: Curve = [0, 0, 0, 0, 0, 0, 0.05, 0.35, 0.9, 1, 0.8, 0.4, 0.1, 0.05, 0.02, 0, 0, 0, 0, 0, 0, 0, 0, 0];
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
  field: [FARM, FARM.map((v) => v * 0.5)],
  brickyard: [KILN.map((v) => v * 0.7), KILN.map((v) => v * 0.2)],
  scrapyard: [YARD.map((v) => v * 0.6), YARD.map((v) => v * 0.1)],
  distribution: [DIST, NONE],
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
  living?: boolean; // made by the Living model
  // Living, after a strike: crowds out in the open (helping at the ruin, parents at a school gate, families at the
  // hospital), streets gone quiet round it, and the circle where the scene's small life has fled.
  crowds?: Crowd[];
  quiet?: { x: number; y: number; r: number; k: number }[]; // pavements near x,y down to k at the centre
  hush?: { x: number; y: number; r: number }[];
  streetD?: Float32Array; // Living: how busy each district's pavements are, as a multiple of streetQ (by world.districts index)
}

export type Observations = Record<number, number>;

/** A strike the city remembers: where, when, and how bad (0..1). */
export interface Mark {
  x: number;
  y: number;
  hour: number;
  day: Day;
  sev: number;
}
export interface Crowd {
  x: number;
  y: number;
  r: number;
  n: number;
  kind: 'help' | 'gate' | 'hospital' | 'unhoused' | 'vendor' | 'security' | 'medic';
}


/** Who is expected where at this moment. Hours watched narrow the guess; Jev's reading of the reports replaces it; logged sightings are taken as known. */
export function population(world: World, hour: number, day: Day, watchedHours: number, obs: Observations = {}, intel: Intel = {}, ruins: number[] = [], alive = false, marks: Mark[] = [], behave: Behaviour | null = null): Population {
  const fri = day === 'friday' ? 1 : 0;
  const expected = new Float32Array(world.buildings.length);
  const observed = new Int16Array(world.buildings.length).fill(-1);
  // "Living": people flow from where they live to places near home; each household its own size; some districts
  // earlier or later. Otherwise the classic model: every building of a kind runs at the same share of capacity.
  const L = alive ? livingOf(world) : null;
  for (const b of world.buildings) {
    expected[b.id] = L ? Math.min(b.capacity * 1.15, b.capacity * curve(BUILDING[b.kind][fri], hour - L.shift[b.id]) * L.k[b.id]) : b.capacity * curve(BUILDING[b.kind][fri], hour);
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
  for (const s of world.spaces) spaceQ[s.id] = L ? Math.min(1, curve(SPACE[s.kind][fri], hour - L.sshift[s.id]) * L.sk[s.id]) : curve(SPACE[s.kind][fri], hour);
  const t = curve(TRAFFIC, hour) * (fri ? 0.6 : 1);
  // Living, with Jev's reading of how each district is behaving this hour: fewer (or more) at work, school, the
  // shops, the mosque; those who don't go out stay home, so nobody appears or vanishes.
  if (L && behave) applyMoods(world, behave.districts, expected, spaceQ);
  // Living: pavements are busiest where people are out and about right now: in districts full of shops, work and
  // open spaces by day, around home in the evening.
  let streetD: Float32Array | undefined;
  if (L) {
    const idx = districtIdx(world);
    const act = new Float64Array(world.districts.length);
    for (const b of world.buildings) {
      const i = idx.get(b.district);
      if (i == null) continue;
      const home = b.kind === 'home' || b.kind === 'apartment' || b.kind === 'villa' || b.kind === 'shack' || b.kind === 'tent';
      act[i] += expected[b.id] * (home ? 0.25 : 1);
    }
    for (const sp of world.spaces) {
      const i = idx.get(sp.district);
      if (i != null) act[i] += spaceQ[sp.id] * sp.capacity;
    }
    const pts = streetCounts(world);
    let num = 0;
    let den = 0;
    for (let i = 0; i < act.length; i++) (num += act[i]), (den += pts[i]);
    const mean = num / Math.max(1, den);
    streetD = new Float32Array(act.length);
    for (let i = 0; i < act.length; i++) streetD[i] = pts[i] ? Math.min(2.2, Math.max(0.35, Math.sqrt(act[i] / pts[i] / Math.max(1e-6, mean)))) : 1;
    if (behave) world.districts.forEach((d, i) => (streetD![i] *= behave.districts[d.id]?.street ?? 1));
  }
  const after = L && marks.length ? aftermath(world, hour, day, marks, expected, spaceQ, ruins, behave) : null;
  // Living: the people outside the usual pattern (sleeping rough, selling on the street, on duty), in small groups.
  const extra = L ? groupsNow(world, hour, day, after?.quiet ?? []) : [];
  const crowds = [...(after?.crowds ?? []), ...extra];
  return {
    living: !!L,
    streetD,
    crowds: L ? crowds : undefined,
    quiet: after?.quiet,
    hush: after?.hush,
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

// ---------------------------------------------------------------- after a strike (Living)

const HOMES = new Set(['home', 'apartment', 'villa', 'shack', 'tent', 'barracks']);
function nearestStreet(w: World, x: number, y: number) {
  const s = w.streetPts;
  let bx = x;
  let by = y;
  let bd = Infinity;
  for (let i = 0; i < s.length; i += 2) {
    const d = (s[i] - x) ** 2 + (s[i + 1] - y) ** 2;
    if (d < bd) (bd = d), (bx = s[i]), (by = s[i + 1]);
  }
  return { x: bx, y: by };
}

/**
 * What a strike does to the city in the hours after it. Rules, not guesses, and the same every time:
 * - people come back to help: a crowd at the ruin for about three hours, fading by eight; fewer at night;
 * - round it, shops and offices empty and people stay in: streets and squares go quiet, homes fill a little;
 * - the souk nearby shuts for the rest of the day;
 * - a school nearby in school hours empties, with parents crowding its gate;
 * - families gather at the nearest hospital, which fills.
 * Edits the counts in place; returns the crowds, the quiet streets and where the small life has fled.
 */
function aftermath(w: World, hour: number, day: Day, marks: Mark[], expected: Float32Array, spaceQ: Float32Array, ruins: number[], behave: Behaviour | null) {
  const crowds: Crowd[] = [];
  const quiet: { x: number; y: number; r: number; k: number }[] = [];
  const hush: { x: number; y: number; r: number }[] = [];
  const h = ((hour % 24) + 24) % 24;
  const dayk = h >= 6 && h < 21 ? 1 : 0.45;
  const gone = new Set(ruins);
  for (const m of marks) {
    if (m.day !== day) continue;
    const e = (h - m.hour + 24) % 24; // hours since
    const help = e < 3 ? 1 : e < 8 ? (8 - e) / 5 : 0;
    if (help <= 0) continue;
    // Jev's reading of how this place responds, where it has one; otherwise the rules as they are.
    const J: AfterMood = behave?.after[markKey(w, m)] ?? { help: 1, close: 1, pickup: 1, hospital: 1, quiet: 1 };
    crowds.push({ x: m.x, y: m.y, r: 12 + 8 * m.sev, n: Math.round((10 + 45 * m.sev) * help * dayk * J.help), kind: 'help' });
    // Those whose job it is: medics at the ruin for the first hours, police holding a cordon round it a while longer.
    if (e >= 0.2 && e < 3) crowds.push({ x: m.x, y: m.y, r: 6, n: Math.round(4 + 6 * m.sev), kind: 'medic' });
    if (e >= 0.2 && e < 5) for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const rr = 30 + 12 * m.sev;
      crowds.push({ x: m.x + Math.cos(a) * rr, y: m.y + Math.sin(a) * rr, r: 2.5, n: 2, kind: 'security' });
    }
    quiet.push({ x: m.x, y: m.y, r: 250, k: Math.max(0.1, 1 - 0.75 * help * J.quiet) });
    hush.push({ x: m.x, y: m.y, r: 120 + 260 * help });
    const openLate = e < Math.max(1, 21 - m.hour);
    for (const b of w.buildings) {
      if (gone.has(b.id) || !expected[b.id]) continue;
      const d = Math.hypot(b.cx - m.x, b.cy - m.y);
      if (b.kind === 'school' && d < 600 && m.hour >= 7 && m.hour < 15 && e < 2.5) {
        // Parents come for their children: the school empties towards its gate.
        const was = expected[b.id];
        expected[b.id] = was * Math.max(0.05, 1 - 0.8 * J.pickup);
        const g = nearestStreet(w, b.cx, b.cy);
        crowds.push({ x: g.x, y: g.y, r: 8, n: Math.round(Math.min(60, was * 0.25 * J.pickup)), kind: 'gate' });
        continue;
      }
      if (d < 450 && b.kind === 'shop' && b.district === 'market' && openLate && J.close > 0.5) {
        expected[b.id] *= Math.max(0.05, 1 - 0.7 * J.close);
        continue;
      }
      if (d > 250) continue;
      const k = help * (1 - d / 250);
      if (HOMES.has(b.kind)) expected[b.id] = Math.min(b.capacity, expected[b.id] * (1 + 0.12 * k));
      else if (b.kind !== 'hospital' && b.kind !== 'clinic') expected[b.id] *= 1 - 0.55 * k;
    }
    for (const sp of w.spaces) {
      const d = Math.hypot(sp.rect.x + sp.rect.w / 2 - m.x, sp.rect.y + sp.rect.h / 2 - m.y);
      if (sp.kind === 'market' && d < 450 && openLate && J.close > 0.5) spaceQ[sp.id] *= Math.max(0.05, 1 - 0.9 * J.close);
      else if (d < 300) spaceQ[sp.id] *= 1 - 0.8 * help * (1 - d / 300);
    }
    // The nearest hospital (or clinic): families come looking for the wounded.
    let best: { b: (typeof w.buildings)[number]; d: number } | null = null;
    for (const b of w.buildings) {
      if ((b.kind !== 'hospital' && b.kind !== 'clinic') || gone.has(b.id)) continue;
      const d = Math.hypot(b.cx - m.x, b.cy - m.y) * (b.kind === 'clinic' ? 1.6 : 1);
      if (!best || d < best.d) best = { b, d };
    }
    const hosp = e < 5 ? 1 : e < 10 ? (10 - e) / 5 : 0;
    if (best && hosp > 0) {
      expected[best.b.id] = Math.min(best.b.capacity * 1.15, expected[best.b.id] * (1 + 0.3 * hosp));
      const g = nearestStreet(w, best.b.cx, best.b.cy);
      crowds.push({ x: g.x, y: g.y, r: 9, n: Math.round((8 + 30 * m.sev) * hosp * dayk * J.hospital), kind: 'hospital' });
    }
  }
  return { crowds: crowds.filter((c) => c.n > 0), quiet, hush };
}

const ACT: Partial<Record<string, keyof DistrictMood>> = {
  office: 'work',
  hall: 'work',
  workshop: 'work',
  warehouse: 'work',
  factory: 'work',
  kiln: 'work',
  greenhouse: 'work',
  school: 'school',
  shop: 'market',
  stand: 'market',
  mosque: 'prayer',
};
const SPACE_ACT: Partial<Record<string, keyof DistrictMood>> = { market: 'market', courtyard: 'prayer', plaza: 'street', park: 'street', pitch: 'street', playground: 'school', busstation: 'street', yard: 'work' };

/** Jev's district moods, as capped multipliers; whoever stays away from work, school, the shops or the mosque is at home. */
function applyMoods(w: World, moods: Behaviour['districts'], expected: Float32Array, spaceQ: Float32Array) {
  const moved = new Map<string, number>();
  for (const b of w.buildings) {
    const m = moods[b.district];
    const a = ACT[b.kind];
    if (!m || !a || !expected[b.id]) continue;
    const was = expected[b.id];
    expected[b.id] = Math.min(b.capacity * 1.15, was * m[a]);
    moved.set(b.district, (moved.get(b.district) ?? 0) + was - expected[b.id]);
  }
  // Home to their own district where it has homes; the rest (the civic centre, the works) home across the city.
  let rest = 0;
  const spread = (homes: Building[], n: number) => {
    const room = homes.reduce((s, b) => s + (n > 0 ? b.capacity - expected[b.id] : expected[b.id]), 0);
    if (room <= 0) return n;
    const k = Math.min(1, Math.abs(n) / room);
    for (const b of homes) expected[b.id] += n > 0 ? (b.capacity - expected[b.id]) * k : -expected[b.id] * k * 0.9;
    return n - Math.sign(n) * Math.min(Math.abs(n), room);
  };
  for (const [d, n] of moved) rest += spread(w.buildings.filter((b) => b.district === d && HOMES.has(b.kind)), n);
  if (Math.abs(rest) > 0.5) spread(w.buildings.filter((b) => HOMES.has(b.kind)), rest);
  for (const sp of w.spaces) {
    const m = moods[sp.district];
    const a = SPACE_ACT[sp.kind];
    if (m && a) spaceQ[sp.id] = Math.min(1, spaceQ[sp.id] * m[a]);
  }
}

// ---------------------------------------------------------------- groups outside the usual pattern (Living)

interface Group {
  x: number;
  y: number;
  r: number;
  kind: Crowd['kind'];
  n: (h: number, fri: boolean) => number; // how many there at this hour
}
const groupCache = new WeakMap<World, Group[]>();
const hours = (h: number, a: number, b: number) => (a <= b ? h >= a && h < b : h >= a || h < b);
/** Where the city's fringe and its uniforms are: fixed spots with their own hours. */
function groupsOf(w: World): Group[] {
  const hit = groupCache.get(w);
  if (hit) return hit;
  const g: Group[] = [];
  const half = w.river.width / 2;
  // Sleeping rough: on the canal banks under the bridges at night.
  for (const rd of w.roads) {
    if (rd.kind !== 'bridge' || rd.name === 'Camp footbridge') continue;
    const y = rd.rect.y + rd.rect.h / 2;
    for (const side of [-1, 1]) g.push({ x: riverX(y) + side * (half + 3), y: y + side * 7, r: 2.5, kind: 'unhoused', n: (h) => (hours(h, 20, 7) ? 3 : 0) });
  }
  // By day at the edge of the souk and the bus station; at night some sleep in the park and on the square.
  for (const sp of w.spaces) {
    const q = sp.rect;
    if (sp.kind === 'market') {
      g.push({ x: q.x + 2, y: q.y + q.h + 2, r: 2, kind: 'unhoused', n: (h) => (hours(h, 8, 18) ? 2 : 0) });
      g.push({ x: q.x + q.w - 2, y: q.y - 2, r: 2, kind: 'unhoused', n: (h) => (hours(h, 22, 6) ? 2 : 0) });
      // Street vendors round the souk: barrows and blankets, busiest mid-morning and late afternoon.
      for (let i = 0; i < 3; i++) g.push({ x: q.x + q.w * (0.25 + i * 0.25), y: q.y + q.h + 3, r: 1.5, kind: 'vendor', n: (h, fri) => (hours(h, 7, 19) && !(fri && hours(h, 11, 14)) ? 2 : 0) });
    }
    if (sp.kind === 'busstation') {
      g.push({ x: q.x + q.w / 2, y: q.y - 2.5, r: 2, kind: 'vendor', n: (h) => (hours(h, 6, 20) ? 2 : 0) });
      g.push({ x: q.x + 3, y: q.y + q.h + 2, r: 2, kind: 'unhoused', n: (h) => (hours(h, 7, 21) ? 2 : 1) });
    }
    if (sp.kind === 'park' || sp.kind === 'plaza') g.push({ x: q.x + q.w - 3, y: q.y + q.h - 3, r: 2.5, kind: 'unhoused', n: (h) => (hours(h, 21, 7) ? 2 : 0) });
    // A sweets seller at the school gate, at the start and end of the day.
    if (sp.kind === 'playground') g.push({ x: q.x + 4, y: q.y - 20, r: 1.2, kind: 'vendor', n: (h, fri) => (!fri && (hours(h, 7, 8.5) || hours(h, 13, 14.5)) ? 1 : 0) });
  }
  // Along the boulevard: a vendor every so often, by day.
  for (const rd of w.roads) {
    if (rd.kind !== 'boulevard') continue;
    for (let x = rd.rect.x + 60; x < rd.rect.x + rd.rect.w - 60; x += 140) g.push({ x, y: rd.rect.y - 1.5, r: 1.2, kind: 'vendor', n: (h) => (hours(h, 7, 21) ? 1 : 0) });
  }
  // Police: a checkpoint at each end of the main bridges, and officers in front of the station.
  for (const rd of w.roads) {
    if (rd.kind !== 'bridge' || rd.name === 'Camp footbridge') continue;
    g.push({ x: rd.rect.x - 3, y: rd.rect.y + rd.rect.h / 2, r: 2, kind: 'security', n: (h) => (hours(h, 6, 23) ? 2 : 1) });
  }
  const ps = w.buildings.find((b) => b.name === 'Police Station');
  if (ps) g.push({ x: ps.cx, y: ps.rects[0].y + ps.rects[0].h + 2.5, r: 2.5, kind: 'security', n: () => 3 });
  groupCache.set(w, g);
  return g;
}
/** The groups present now. After a strike, the fringe nearby (sleeping rough, selling) moves off; the police stay. */
function groupsNow(w: World, hour: number, day: Day, quiet: { x: number; y: number; r: number; k: number }[]): Crowd[] {
  const h = ((hour % 24) + 24) % 24;
  const out: Crowd[] = [];
  for (const q of groupsOf(w)) {
    const n = q.n(h, day === 'friday');
    if (!n) continue;
    if (q.kind !== 'security' && quiet.some((z) => Math.hypot(q.x - z.x, q.y - z.y) < z.r && z.k < 0.6)) continue;
    out.push({ x: q.x, y: q.y, r: q.r, n, kind: q.kind });
  }
  return out;
}

/** How busy a pavement point is next to normal, given the quiet after strikes (1 = normal). */
export function quietAt(pop: Population, x: number, y: number) {
  let k = 1;
  for (const q of pop.quiet ?? []) {
    const d = Math.hypot(x - q.x, y - q.y);
    if (d < q.r) k *= 1 - (1 - q.k) * (1 - d / q.r);
  }
  return k;
}

/** Stable points spread over a crowd's circle, for counting and harming the people in it. */
export function crowdPts(c: Crowd, n = 12) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < n; i++) {
    const rr = c.r * Math.sqrt((i + 0.5) / n);
    const a = i * 2.39996;
    xs.push(c.x + Math.cos(a) * rr);
    ys.push(c.y + Math.sin(a) * rr);
  }
  return { xs, ys };
}

// ---------------------------------------------------------------- districts and pavements (Living)

const idxCache = new WeakMap<World, Map<string, number>>();
export function districtIdx(w: World) {
  let m = idxCache.get(w);
  if (!m) idxCache.set(w, (m = new Map(w.districts.map((d, i) => [d.id, i]))));
  return m;
}
const ptCache = new WeakMap<World, Int16Array>();
/** The district each pavement point is in (by world.districts index; -1 outside any block's reach). */
export function streetDistricts(w: World) {
  let out = ptCache.get(w);
  if (out) return out;
  const idx = districtIdx(w);
  const s = w.streetPts;
  out = new Int16Array(s.length / 2).fill(-1);
  for (let k = 0; k < out.length; k++) {
    const x = s[k * 2];
    const y = s[k * 2 + 1];
    let best = -1;
    let bd = 14;
    for (const bl of w.blocks) {
      const dx = Math.max(bl.x - x, 0, x - bl.x - bl.w);
      const dy = Math.max(bl.y - y, 0, y - bl.y - bl.h);
      const d = Math.hypot(dx, dy);
      if (d < bd) {
        bd = d;
        best = idx.get(bl.district) ?? -1;
      }
    }
    out[k] = best;
  }
  ptCache.set(w, out);
  return out;
}
const cntCache = new WeakMap<World, Int32Array>();
function streetCounts(w: World) {
  let c = cntCache.get(w);
  if (c) return c;
  c = new Int32Array(w.districts.length);
  for (const d of streetDistricts(w)) if (d >= 0) c[d]++;
  cntCache.set(w, c);
  return c;
}

/**
 * Living: the trips people are making around this hour, from the places emptying to the places filling nearby
 * (home to school at half seven, to the workshops, the souk, the mosque on a Friday, home in the evening).
 * A short list of representative trips, strongest first: [from building, to building, weight].
 */
const tripCache = new Map<string, [number, number, number][]>();
export function trips(world: World, hour: number, day: Day): [number, number, number][] {
  const key = `${world.seed}|${Math.round(hour * 4) / 4}|${day}`;
  const hit = tripCache.get(key);
  if (hit) return hit;
  const a = population(world, hour - 0.5, day, 6, {}, {}, [], true).expected;
  const b = population(world, hour + 0.5, day, 6, {}, {}, [], true).expected;
  const gains: number[] = [];
  const losses: number[] = [];
  for (const x of world.buildings) {
    const d = b[x.id] - a[x.id];
    if (d > 0.6) gains.push(x.id);
    else if (d < -0.6) losses.push(x.id);
  }
  gains.sort((i, j) => b[j] - a[j] - (b[i] - a[i]));
  const out: [number, number, number][] = [];
  const B = world.buildings;
  for (const g of gains.slice(0, 70)) {
    const gb = B[g];
    // The nearest few places people are leaving, weighted by how many leave.
    const near = losses
      .map((l) => ({ l, d: Math.hypot(B[l].cx - gb.cx, B[l].cy - gb.cy) }))
      .filter((q) => q.d > 8 && q.d < 420)
      .sort((p, q) => p.d / (a[p.l] - b[p.l]) - q.d / (a[q.l] - b[q.l]))
      .slice(0, 4);
    for (const q of near) out.push([q.l, g, Math.min(b[g] - a[g], a[q.l] - b[q.l])]);
  }
  out.sort((p, q) => q[2] - p[2]);
  if (tripCache.size > 200) tripCache.clear();
  tripCache.set(key, out);
  return out;
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
