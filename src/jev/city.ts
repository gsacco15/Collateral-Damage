// The city: districts, streets, a river, buildings, open spaces, walls, trees and the targets.
// Pure and seeded. Everything that changes the estimate lives here as data:
// what a building is made of, how many floors it has, who uses it, what's protected, what can burn.
import { rng, type Rng } from './rng';

// ---------------------------------------------------------------- types

export type Kind =
  | 'home'
  | 'apartment'
  | 'villa'
  | 'shack'
  | 'shop'
  | 'office'
  | 'hall'
  | 'school'
  | 'hospital'
  | 'clinic'
  | 'mosque'
  | 'minaret'
  | 'warehouse'
  | 'workshop'
  | 'fueltank'
  | 'stand'
  | 'shelter'
  | 'factory'
  | 'kiln'
  | 'chimney'
  | 'silo'
  | 'tent'
  | 'greenhouse'
  | 'watertank'
  | 'barracks'
  | 'mast';

export type Material = 'concrete' | 'brick' | 'mud' | 'tin' | 'steel' | 'canvas';
export type Paper = 'white' | 'grey' | 'kraft' | 'tin' | 'terracotta';
export type DistrictId = 'terraces' | 'civic' | 'oldtown' | 'workshops' | 'quarter' | 'market' | 'garden' | 'tinhill' | 'canal' | 'kilns' | 'groves' | 'camp' | 'desert';
export type SpaceKind = 'plaza' | 'market' | 'park' | 'pitch' | 'yard' | 'playground' | 'cemetery' | 'courtyard' | 'busstation' | 'field' | 'brickyard' | 'scrapyard' | 'distribution';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Something that can go off when hit: fuel, gas, stored munitions. */
export interface Hazard {
  blast: number;
  frag: number;
  ignite: number; // metres: a blast this close sets it off
}

export interface Building {
  id: number;
  kind: Kind;
  material: Material;
  paper: Paper;
  rects: Rect[];
  floors: number;
  h: number; // metres
  district: DistrictId;
  name?: string;
  landmark?: boolean;
  protected?: boolean; // on the no-strike list: hospitals, schools, places of worship
  hazard?: Hazard;
  round?: boolean; // tanks: drawn as circles
  cx: number;
  cy: number;
  area: number;
  capacity: number;
  shield: number; // multiplier on fragment harm for people inside
  slots: Float32Array; // x,y pairs: where people are, in a fixed, well-spread order
  pts: Float32Array; // x,y,z triples: a few representative people across the floors, for fast estimates
  roof: { x: number; y: number; kind: 'tank' | 'box' | 'dish' }[];
}

export interface Space {
  id: number;
  kind: SpaceKind;
  rect: Rect;
  name?: string;
  landmark?: boolean;
  protected?: boolean;
  district: DistrictId;
  capacity: number;
  slots: Float32Array;
}

export type RoadKind = 'boulevard' | 'street' | 'bridge';
export interface Road {
  rect: Rect;
  name: string;
  kind: RoadKind;
  horizontal: boolean;
}

export interface District {
  id: DistrictId;
  name: string;
  x: number; // label position
  y: number;
  blurb: string;
}

/** The four briefed targets, or any building by id (`b:123`). */
export type TargetId = 'warehouse' | 'tower' | 'yard' | 'bridge' | 'house' | 'depot' | 'office' | 'station' | 'mill' | 'pump' | 'camp' | 'mosque' | 'outpost' | `b:${number}` | `g:${number}_${number}`;
/** In the list of ruins, the boulevard bridge (which isn't a building) once it has been dropped. */
export const BRIDGE_RUIN = -1;
export interface Target {
  id: TargetId;
  name: string;
  short: string;
  note: string;
  rect: Rect;
  buildingId: number | null;
  hardness: number; // metres of blast needed at the centre
  stored: boolean; // suspected munitions inside
  aimHeight: number; // metres: where on the target the bomb is meant to go off
}

/** Something worth a label once you've explored near it. */
export interface Place {
  id: string;
  name: string;
  x: number;
  y: number;
  kind: 'district' | 'landmark' | 'street' | 'target';
  note?: string;
}

export interface Tree {
  x: number;
  y: number;
  r: number;
  kind: 'round' | 'cypress' | 'palm';
}

/** Things on the outskirts that are only drawn: they hold no one and stop no fragments. */
export interface Extras {
  rail: { x0: number; x1: number; y: number }; // the freight line along the Kilnworks
  wagons: Rect[];
  fences: Rect[]; // the camp's wire fence
  stacks: Rect[]; // green bricks drying in rows
  scrap: { x: number; y: number; r: number }[];
  channels: Rect[]; // irrigation in the groves
  washing: [number, number, number, number][]; // lines strung between tents
  hives: { x: number; y: number }[];
  // Around Warehouse 14 and the school, where the story starts.
  doors: Rect[]; // loading doors
  trucks: Rect[];
  crates: Rect[];
  kiosks: Rect[];
  stripes: Rect[]; // zebra crossings
  hopscotch: Rect[];
  rings: { x: number; y: number; r: number }[]; // a game circle painted on the yard
  mural: Rect[];
  bikes: { x: number; y: number }[];
  lamps: { x: number; y: number }[]; // street lamps along Cotton Street
  words: { x: number; y: number; text: string }[]; // painted on the road
  tankers: Rect[]; // at the fuel depot
  pipes: [number, number, number, number][];
  canopies: Rect[]; // the depot's pump island
  transformers: Rect[]; // the power station's yard
  pylons: { x: number; y: number }[]; // the line out of town
  hoops: { x: number; y: number }[]; // a basketball hoop, facing east
  swings: Rect[];
  slides: Rect[];
  // Out in the desert: the old camp.
  berms: Rect[]; // sand banks of the old firing range
  tyres: { x: number; y: number }[]; // the old obstacle course
  wrecks: Rect[]; // a burnt-out truck
  pens: { x: number; y: number; r: number }[]; // the goat pen
  goats: { x: number; y: number }[];
  wells: { x: number; y: number }[];
  tracks: [number, number][][]; // tyre tracks in the sand
  panels: Rect[]; // a small solar panel
}

export interface World {
  w: number;
  h: number;
  city: Rect; // the city itself; the rest of the world east of it is desert
  seed: number;
  districts: District[];
  roads: Road[];
  river: { pts: [number, number][]; width: number };
  roundabout: { x: number; y: number; r: number };
  blocks: (Rect & { district: DistrictId })[];
  buildings: Building[];
  spaces: Space[];
  walls: Rect[];
  trees: Tree[];
  extras: Extras;
  targets: Target[];
  places: Place[];
  streetPts: Float32Array; // x,y: pavements and lanes, where people walk
  trafficPts: Float32Array; // x,y,busy: lanes where cars pass (busy 1 on the boulevard)
  grid: Int16Array; // occupancy, 2 m cells: 0 open, >0 building id + 1, -1 wall
  gridW: number;
  gridH: number;
  cell: number;
}

// ---------------------------------------------------------------- geometry

export const CITY_W = 1000;
export const CITY_H = 900;
/** The world goes on east of the city, into the desert, as far as the old camp. */
export const WORLD_W = 1420;
/** The old camp in the desert, and the track out to it. */
const POST: Rect = { x: 1180, y: 186, w: 160, h: 132 };
export const CELL = 2;
const V = [0, 120, 240, 360, 470, 580, 690, 800, 900, 1000];
const H = [0, 115, 230, 350, 465, 580, 700, 900];
/** South of South Road: the outskirts, laid out by hand rather than on the grid. */
const OUT = 700;
const RAIL_Y = 812;
const BLVD = 350;
const RIVER_PTS: [number, number][] = [
  [748, -60],
  [738, 60],
  [752, 170],
  [739, 280],
  [745, 390],
  [760, 500],
  [748, 610],
  [752, 760],
  [744, 880],
  [750, 1040],
];
const RIVER_W = 36;

const V_NAMES: Record<number, string> = { 0: 'West Road', 120: 'Loom Street', 240: 'School Road', 360: 'Fountain Street', 470: 'Old Wall Road', 580: 'Tanners Lane', 690: 'West Quay', 800: 'East Quay', 900: 'Garden Street', 1000: 'East Road' };
const H_NAMES: Record<number, string> = { 0: 'North Road', 115: 'Mill Street', 230: 'Well Lane', 350: 'Long Boulevard', 465: 'Cotton Street', 580: 'Pump Road', 700: 'South Road', 900: 'Ring Road' };

export const overlaps = (a: Rect, b: Rect, pad = 0) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
export const inRect = (r: Rect, x: number, y: number, pad = 0) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
export function rectDist(r: Rect, x: number, y: number) {
  const dx = Math.max(r.x - x, 0, x - (r.x + r.w));
  const dy = Math.max(r.y - y, 0, y - (r.y + r.h));
  return Math.hypot(dx, dy);
}
export function buildingDist(b: Building, x: number, y: number) {
  let d = Infinity;
  for (const r of b.rects) d = Math.min(d, rectDist(r, x, y));
  return d;
}
export const inBuilding = (b: Building, x: number, y: number, pad = 0) => b.rects.some((r) => inRect(r, x, y, pad));

/** x of the river's centre line at a given y. */
export function riverX(y: number) {
  const p = RIVER_PTS;
  for (let i = 0; i < p.length - 1; i++) {
    if (y >= p[i][1] && y <= p[i + 1][1]) {
      const t = (y - p[i][1]) / (p[i + 1][1] - p[i][1]);
      const s = t * t * (3 - 2 * t);
      return p[i][0] + (p[i + 1][0] - p[i][0]) * s;
    }
  }
  return p[p.length - 1][0];
}
export const inRiver = (x: number, y: number) => Math.abs(x - riverX(y)) < RIVER_W / 2;

/** What's at a point: a building id, -1 for a wall, 0 for open ground. */
export function cellAt(w: World, x: number, y: number) {
  const cx = Math.floor(x / w.cell);
  const cy = Math.floor(y / w.cell);
  if (cx < 0 || cy < 0 || cx >= w.gridW || cy >= w.gridH) return 0;
  return w.grid[cy * w.gridW + cx];
}

export function buildingAt(w: World, x: number, y: number): Building | null {
  const v = cellAt(w, x, y);
  if (v > 0) {
    const b = w.buildings[v - 1];
    if (inBuilding(b, x, y, 0.5)) return b;
  }
  // Cells are coarse; check neighbours for thin or round buildings.
  for (const b of w.buildings) if (Math.abs(b.cx - x) < 60 && Math.abs(b.cy - y) < 60 && inBuilding(b, x, y, 0.3)) return b;
  return null;
}

// ---------------------------------------------------------------- building a building

const M2_PER_PERSON: Record<Kind, number> = {
  home: 18,
  apartment: 20,
  villa: 38,
  shack: 6.5,
  shop: 14,
  office: 16,
  hall: 5,
  school: 6,
  hospital: 13,
  clinic: 11,
  mosque: 2.2,
  minaret: 0,
  warehouse: 70,
  workshop: 35,
  fueltank: 0,
  stand: 1.6,
  shelter: 4,
  factory: 30,
  kiln: 60,
  chimney: 0,
  silo: 0,
  tent: 5,
  greenhouse: 40,
  watertank: 0,
  barracks: 45,
  mast: 0,
};
const STACKED: Partial<Record<Kind, true>> = { home: true, apartment: true, villa: true, office: true, hospital: true };
export const SHIELD: Record<Material, number> = { concrete: 0.42, brick: 0.55, mud: 0.66, tin: 0.9, steel: 0.5, canvas: 0.97 };

interface Spec {
  kind: Kind;
  material: Material;
  paper: Paper;
  rects: Rect[];
  floors: number;
  h?: number;
  district: DistrictId;
  name?: string;
  landmark?: boolean;
  protected?: boolean;
  hazard?: Hazard;
  round?: boolean;
}

function make(r: Rng, id: number, s: Spec): Building {
  const area = s.rects.reduce((a, q) => a + q.w * q.h, 0);
  const cx = s.rects.reduce((a, q) => a + (q.x + q.w / 2) * q.w * q.h, 0) / area;
  const cy = s.rects.reduce((a, q) => a + (q.y + q.h / 2) * q.w * q.h, 0) / area;
  const per = M2_PER_PERSON[s.kind];
  const capacity = per ? Math.max(1, Math.round((area * (STACKED[s.kind] ? s.floors : 1)) / per)) : 0;
  // Slots: well-spread points, so the first N always look evenly scattered.
  const n = capacity ? Math.min(700, Math.ceil(capacity * 1.4) + 3) : 0;
  const pts: number[] = [];
  let guard = 0;
  const minGap = Math.max(0.6, Math.min(2.2, Math.sqrt(area / Math.max(1, n)) * 0.7));
  while (pts.length < n * 2 && guard++ < n * 30) {
    const q = s.rects[Math.floor(r() * s.rects.length)];
    const x = q.x + 0.9 + r() * Math.max(0.2, q.w - 1.8);
    const y = q.y + 0.9 + r() * Math.max(0.2, q.h - 1.8);
    let ok = true;
    const gap = minGap * (1 - guard / (n * 30));
    for (let i = 0; i < pts.length && ok; i += 2) if (Math.abs(pts[i] - x) < gap && Math.abs(pts[i + 1] - y) < gap) ok = false;
    if (ok) pts.push(x, y);
  }
  const slots = new Float32Array(pts);
  // Up to 24 representative people, spread through the slots and up the floors.
  const k = Math.min(24, slots.length / 2);
  const rep = new Float32Array(k * 3);
  const floors = STACKED[s.kind] ? s.floors : 1;
  for (let i = 0; i < k; i++) {
    const j = Math.floor((i * slots.length) / 2 / k);
    rep[i * 3] = slots[j * 2];
    rep[i * 3 + 1] = slots[j * 2 + 1];
    rep[i * 3 + 2] = (i % floors) * 3.1 + 1.5;
  }
  const roof: Building['roof'] = [];
  if ((s.kind === 'home' || s.kind === 'apartment' || s.kind === 'shop' || s.kind === 'office') && !s.round) {
    const q = s.rects[0];
    const count = s.kind === 'apartment' ? 2 + Math.floor(r() * 3) : r() < 0.6 ? 1 : r() < 0.5 ? 2 : 0;
    for (let i = 0; i < count && q.w > 6 && q.h > 6; i++) roof.push({ x: q.x + 2 + r() * (q.w - 4), y: q.y + 2 + r() * (q.h - 4), kind: r() < 0.55 ? 'tank' : r() < 0.8 ? 'box' : 'dish' });
  }
  return {
    id,
    kind: s.kind,
    material: s.material,
    paper: s.paper,
    rects: s.rects,
    floors: s.floors,
    h: s.h ?? s.floors * 3.1 + 0.6 + r() * 0.8,
    district: s.district,
    name: s.name,
    landmark: s.landmark,
    protected: s.protected,
    hazard: s.hazard,
    round: s.round,
    cx,
    cy,
    area,
    capacity,
    shield: SHIELD[s.material],
    slots,
    pts: rep,
    roof,
  };
}

function makeSpace(r: Rng, id: number, kind: SpaceKind, rect: Rect, district: DistrictId, name?: string, extra: Partial<Space> = {}): Space {
  const per: Record<SpaceKind, number> = { plaza: 3, market: 1.6, park: 12, pitch: 1.2, yard: 25, playground: 2, cemetery: 40, courtyard: 1.1, busstation: 3, field: 60, brickyard: 30, scrapyard: 45, distribution: 1.4 };
  const capacity = Math.max(2, Math.round((rect.w * rect.h) / per[kind]));
  const n = Math.min(600, capacity);
  const pts: number[] = [];
  for (let i = 0; i < n; i++) pts.push(rect.x + 1 + r() * (rect.w - 2), rect.y + 1 + r() * (rect.h - 2));
  return { id, kind, rect, district, name, capacity, slots: new Float32Array(pts), ...extra };
}

// ---------------------------------------------------------------- district styles

interface Style {
  kind: (r: Rng, frontage: 'main' | 'street' | 'inner') => Kind;
  w: [number, number];
  d: [number, number];
  floors: (r: Rng, k: Kind) => number;
  material: (r: Rng, k: Kind) => Material;
  paper: (r: Rng, m: Material) => Paper;
  gap: [number, number];
  rows: boolean; // build along the street edges first
  fill: number; // random packing attempts inside
  lanes: number; // alleys carved through the block
}

const STYLES: Record<Exclude<DistrictId, 'canal'>, Style> = {
  terraces: {
    kind: () => 'apartment',
    w: [28, 52],
    d: [12, 16],
    floors: (r) => 4 + Math.floor(r() * 5),
    material: () => 'concrete',
    paper: (r) => (r() < 0.6 ? 'white' : 'grey'),
    gap: [6, 12],
    rows: true,
    fill: 25,
    lanes: 0,
  },
  civic: {
    kind: (r, f) => (f === 'main' && r() < 0.5 ? 'shop' : r() < 0.7 ? 'office' : 'apartment'),
    w: [18, 36],
    d: [14, 22],
    floors: (r, k) => (k === 'shop' ? 1 : 3 + Math.floor(r() * 3)),
    material: () => 'concrete',
    paper: (r) => (r() < 0.75 ? 'white' : 'grey'),
    gap: [3, 8],
    rows: true,
    fill: 20,
    lanes: 0,
  },
  oldtown: {
    kind: (r) => (r() < 0.12 ? 'shop' : 'home'),
    w: [7, 14],
    d: [7, 14],
    floors: (r) => 1 + Math.floor(r() * 3),
    material: (r) => (r() < 0.8 ? 'mud' : 'brick'),
    paper: (r, m) => (m === 'mud' ? 'kraft' : r() < 0.5 ? 'white' : 'kraft'),
    gap: [1.3, 2.6],
    rows: false,
    fill: 2600,
    lanes: 5,
  },
  workshops: {
    kind: (r) => (r() < 0.55 ? 'warehouse' : 'workshop'),
    w: [22, 50],
    d: [16, 32],
    floors: () => 1,
    material: (r) => (r() < 0.6 ? 'steel' : 'brick'),
    paper: (r, m) => (m === 'steel' ? (r() < 0.5 ? 'tin' : 'grey') : 'white'),
    gap: [5, 12],
    rows: true,
    fill: 30,
    lanes: 0,
  },
  quarter: {
    kind: (r, f) => (f === 'main' && r() < 0.7 ? 'shop' : f === 'street' && r() < 0.15 ? 'shop' : 'home'),
    w: [10, 18],
    d: [12, 18],
    floors: (r, k) => (k === 'shop' ? 1 + Math.floor(r() * 2) : 1 + Math.floor(r() * 3)),
    material: (r) => (r() < 0.75 ? 'brick' : 'concrete'),
    paper: (r) => (r() < 0.55 ? 'white' : 'kraft'),
    gap: [0, 4],
    rows: true,
    fill: 80,
    lanes: 0,
  },
  market: {
    kind: (r, f) => (f !== 'inner' && r() < 0.75 ? 'shop' : 'home'),
    w: [8, 16],
    d: [10, 16],
    floors: (r) => 1 + Math.floor(r() * 3),
    material: (r) => (r() < 0.7 ? 'brick' : 'mud'),
    paper: (r, m) => (m === 'mud' ? 'kraft' : r() < 0.6 ? 'white' : 'kraft'),
    gap: [0, 3],
    rows: true,
    fill: 120,
    lanes: 1,
  },
  garden: {
    kind: () => 'villa',
    w: [13, 19],
    d: [12, 17],
    floors: (r) => 1 + Math.floor(r() * 2),
    material: () => 'concrete',
    paper: () => 'terracotta',
    gap: [14, 20],
    rows: false,
    fill: 300,
    lanes: 0,
  },
  kilns: {
    kind: (r) => (r() < 0.5 ? 'factory' : 'workshop'),
    w: [20, 40],
    d: [14, 24],
    floors: () => 1,
    material: (r) => (r() < 0.6 ? 'steel' : 'brick'),
    paper: (r, m) => (m === 'steel' ? (r() < 0.6 ? 'tin' : 'grey') : 'kraft'),
    gap: [5, 10],
    rows: false,
    fill: 160,
    lanes: 0,
  },
  groves: {
    kind: () => 'home',
    w: [9, 13],
    d: [8, 11],
    floors: () => 1,
    material: () => 'mud',
    paper: () => 'kraft',
    gap: [8, 14],
    rows: false,
    fill: 0,
    lanes: 0,
  },
  camp: {
    kind: () => 'tent',
    w: [5, 6],
    d: [4, 4.5],
    floors: () => 1,
    material: () => 'canvas',
    paper: () => 'white',
    gap: [2, 3],
    rows: false,
    fill: 0,
    lanes: 0,
  },
  desert: {
    kind: () => 'barracks',
    w: [20, 30],
    d: [8, 10],
    floors: () => 1,
    material: () => 'concrete',
    paper: () => 'grey',
    gap: [10, 20],
    rows: false,
    fill: 0,
    lanes: 0,
  },
  tinhill: {
    kind: () => 'shack',
    w: [4.5, 8],
    d: [4, 7],
    floors: () => 1,
    material: () => 'tin',
    paper: () => 'tin',
    gap: [0.9, 1.8],
    rows: false,
    fill: 6000,
    lanes: 6,
  },
};

// ---------------------------------------------------------------- the city

const cache = new Map<number, World>();

export function buildCity(seed = 7): World {
  const hit = cache.get(seed);
  if (hit) return hit;
  const r = rng(seed);
  const roads: Road[] = [];
  const hw = (y: number) => (y === BLVD ? 12 : 6);

  // Streets. Horizontal ones cross the river only at the bridges; the old town and Tin Hill have lanes, not streets.
  const bridges = new Set([115, 350, 580]);
  for (const y of H) {
    let spans: [number, number][] = [[-120, CITY_W + 120]];
    const cut = (a: number, b: number) => {
      spans = spans.flatMap(([s, e]) => (b <= s || a >= e ? [[s, e]] : [[s, a], [b, e]].filter(([p, q]) => q - p > 1))) as [number, number][];
    };
    if (y === 115 || y === 230) cut(476, 684);
    if (y === 580) cut(806, CITY_W + 120);
    if (y === 900) cut(696, 794);
    if (!bridges.has(y)) cut(696, 794);
    cut(1006, CITY_W + 120); // east of East Road there is only desert
    for (const [a, b] of spans) {
      const land = (s: number, e: number) => roads.push({ rect: { x: s, y: y - hw(y), w: e - s, h: hw(y) * 2 }, name: H_NAMES[y], kind: y === BLVD ? 'boulevard' : 'street', horizontal: true });
      if (a < 696 && b > 794) {
        land(a, 696);
        roads.push({ rect: { x: 696, y: y - hw(y), w: 98, h: hw(y) * 2 }, name: `${H_NAMES[y]} bridge`, kind: 'bridge', horizontal: true });
        land(794, b);
      } else land(a, b);
    }
  }
  for (const x of V) {
    let spans: [number, number][] = [[-120, CITY_H + 120]];
    if (x === 580) spans = [[BLVD - 12, CITY_H + 120]];
    if (x === 900) spans = [[-120, 471]];
    // The grid stops at South Road; beyond it only the edge roads, the quays and Tanners Lane go on.
    if (x === 120 || x === 240 || x === 360 || x === 470) spans = [[-120, OUT + 6]];
    for (const [a, b] of spans) roads.push({ rect: { x: x - 6, y: a, w: 12, h: b - a }, name: V_NAMES[x], kind: 'street', horizontal: false });
  }

  // A dirt track out into the desert, to the old camp.
  roads.push({ rect: { x: 1006, y: 227, w: POST.x - 1006, h: 6 }, name: 'Desert track', kind: 'street', horizontal: true });
  // A footbridge over the canal, the camp's way into town.
  roads.push({ rect: { x: 696, y: 798, w: 98, h: 4 }, name: 'Camp footbridge', kind: 'bridge', horizontal: true });

  // Blocks, with the old town and Tin Hill merged into single blocks threaded by lanes.
  const districtOf = (x: number, y: number): DistrictId => {
    if (x > 690 && x < 800) return 'canal';
    if (y < BLVD) return x < 240 ? 'terraces' : x < 470 ? 'civic' : x < 690 ? 'oldtown' : 'garden';
    if (x > 800) return y < 465 ? 'garden' : 'tinhill';
    return x < 240 ? 'workshops' : x < 470 ? 'quarter' : 'market';
  };
  const blocks: (Rect & { district: DistrictId })[] = [];
  for (let i = 0; i < V.length - 1; i++)
    for (let j = 0; j < H.length - 1; j++) {
      const x0 = V[i] + 6;
      const x1 = V[i + 1] - 6;
      const y0 = H[j] + hw(H[j]);
      const y1 = H[j + 1] - hw(H[j + 1]);
      const d = districtOf((x0 + x1) / 2, (y0 + y1) / 2);
      if (d === 'canal') continue;
      if (d === 'oldtown' || (d === 'tinhill' && j >= 4) || H[j] >= OUT) continue;
      blocks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, district: d });
    }
  blocks.push({ x: 476, y: 6, w: 208, h: 332, district: 'oldtown' });
  blocks.push({ x: 806, y: 471, w: 188, h: 223, district: 'tinhill' });
  // The outskirts: the Kilnworks either side of the railway, the groves by the canal, the camp beyond Tin Hill.
  blocks.push({ x: 6, y: OUT + 6, w: 568, h: RAIL_Y - 6 - (OUT + 6), district: 'kilns' });
  blocks.push({ x: 6, y: RAIL_Y + 6, w: 568, h: 894 - (RAIL_Y + 6), district: 'kilns' });
  blocks.push({ x: 586, y: OUT + 6, w: 104, h: 188, district: 'groves' });
  blocks.push({ x: 806, y: OUT + 6, w: 188, h: 188, district: 'camp' });

  const buildings: Building[] = [];
  const spaces: Space[] = [];
  const walls: Rect[] = [];
  const trees: Tree[] = [];
  const reserved: Rect[] = [];
  const ro = rng(seed * 7919 + 101);
  let cur: Rng = r; // the stream buildings and spaces are drawn from
  const add = (s: Spec) => {
    const b = make(cur, buildings.length, s);
    buildings.push(b);
    return b;
  };
  const space = (kind: SpaceKind, rect: Rect, district: DistrictId, name?: string, extra: Partial<Space> = {}) => {
    const s = makeSpace(cur, spaces.length, kind, rect, district, name, extra);
    spaces.push(s);
    reserved.push({ x: rect.x - 1, y: rect.y - 1, w: rect.w + 2, h: rect.h + 2 });
    return s;
  };
  const special = (s: Spec) => {
    const b = add(s);
    for (const q of s.rects) reserved.push({ x: q.x - 2, y: q.y - 2, w: q.w + 4, h: q.h + 4 });
    return b;
  };

  // ---- Landmarks and targets, placed by hand so the city tells its stories.
  const warehouse = special({ kind: 'warehouse', material: 'steel', paper: 'white', rects: [{ x: 188, y: 490, w: 40, h: 30 }], floors: 1, h: 10, district: 'workshops', name: 'Warehouse 14', landmark: true });
  reserved.push({ x: 180, y: 480, w: 54, h: 48 });
  special({ kind: 'school', material: 'brick', paper: 'kraft', rects: [{ x: 250, y: 477, w: 60, h: 14 }, { x: 250, y: 491, w: 14, h: 30 }], floors: 3, district: 'quarter', name: 'Cotton Street School', landmark: true, protected: true });
  space('playground', { x: 266, y: 494, w: 44, h: 28 }, 'quarter', 'School yard');
  for (const [x, y] of [
    [150, 612],
    [174, 612],
    [150, 638],
    [174, 638],
  ])
    special({ kind: 'fueltank', material: 'steel', paper: 'white', rects: [{ x: x - 9, y: y - 9, w: 18, h: 18 }], floors: 1, h: 11, district: 'workshops', name: 'Fuel Depot', landmark: x === 150 && y === 612, hazard: { blast: 16, frag: 50, ignite: 9 }, round: true });
  walls.push({ x: 134, y: 596, w: 56, h: 0.6 }, { x: 134, y: 654, w: 56, h: 0.6 }, { x: 134, y: 596, w: 0.6, h: 58 }, { x: 190, y: 596, w: 0.6, h: 58 });
  reserved.push({ x: 132, y: 594, w: 62, h: 64 });
  const tower = special({ kind: 'apartment', material: 'concrete', paper: 'grey', rects: [{ x: 150, y: 142, w: 44, h: 20 }], floors: 9, district: 'terraces', name: 'Tower 7', landmark: true });
  special({ kind: 'hospital', material: 'concrete', paper: 'white', rects: [{ x: 254, y: 128, w: 92, h: 18 }, { x: 254, y: 198, w: 92, h: 18 }, { x: 288, y: 146, w: 24, h: 52 }], floors: 4, district: 'civic', name: 'City Hospital', landmark: true, protected: true });
  special({ kind: 'office', material: 'concrete', paper: 'white', rects: [{ x: 262, y: 246, w: 76, h: 30 }], floors: 3, district: 'civic', name: 'District Office', landmark: true });
  space('plaza', { x: 262, y: 282, w: 76, h: 46 }, 'civic', 'Office forecourt');
  space('park', { x: 372, y: 242, w: 86, h: 90 }, 'civic', 'Olive Park', { landmark: true });
  special({ kind: 'school', material: 'concrete', paper: 'white', rects: [{ x: 378, y: 128, w: 52, h: 14 }], floors: 2, district: 'civic', name: 'North School', landmark: true, protected: true });
  space('playground', { x: 378, y: 146, w: 52, h: 26 }, 'civic', 'North School yard');
  special({ kind: 'clinic', material: 'brick', paper: 'white', rects: [{ x: 380, y: 372, w: 30, h: 20 }], floors: 2, district: 'quarter', name: 'Quarter Clinic', landmark: true, protected: true });
  // The old town: the Great Mosque, its courtyard and minaret, and a square.
  special({ kind: 'mosque', material: 'brick', paper: 'white', rects: [{ x: 556, y: 132, w: 46, h: 32 }], floors: 1, h: 10, district: 'oldtown', name: 'Great Mosque', landmark: true, protected: true });
  special({ kind: 'minaret', material: 'brick', paper: 'kraft', rects: [{ x: 606, y: 128, w: 7, h: 7 }], floors: 1, h: 38, district: 'oldtown', name: 'Minaret' });
  space('courtyard', { x: 556, y: 168, w: 46, h: 30 }, 'oldtown', 'Mosque courtyard', { protected: true });
  space('plaza', { x: 500, y: 218, w: 56, h: 40 }, 'oldtown', 'Old Square', { landmark: true });
  // The market quarter: the souk, its covered hall, the bus station.
  space('market', { x: 486, y: 372, w: 78, h: 56 }, 'market', 'The Souk', { landmark: true });
  special({ kind: 'hall', material: 'brick', paper: 'kraft', rects: [{ x: 486, y: 434, w: 78, h: 20 }], floors: 1, h: 7, district: 'market', name: 'Covered Market', landmark: true });
  space('busstation', { x: 596, y: 372, w: 78, h: 40 }, 'market', 'Bus Station', { landmark: true });
  special({ kind: 'shelter', material: 'steel', paper: 'tin', rects: [{ x: 596, y: 418, w: 78, h: 9 }], floors: 1, h: 4, district: 'market' });
  // Garden Side: the stadium and the cemetery.
  space('pitch', { x: 924, y: 252, w: 54, h: 70 }, 'garden', 'Stadium', { landmark: true });
  special({ kind: 'stand', material: 'concrete', paper: 'grey', rects: [{ x: 910, y: 248, w: 12, h: 78 }], floors: 1, h: 8, district: 'garden' });
  special({ kind: 'stand', material: 'concrete', paper: 'grey', rects: [{ x: 980, y: 248, w: 12, h: 78 }], floors: 1, h: 8, district: 'garden' });
  space('cemetery', { x: 812, y: 368, w: 76, h: 86 }, 'garden', 'Cemetery', { landmark: true });
  // The vehicle yard.
  space('yard', { x: 16, y: 482, w: 76, h: 58 }, 'workshops', 'Vehicle Yard', { landmark: true });
  special({ kind: 'workshop', material: 'steel', paper: 'tin', rects: [{ x: 16, y: 546, w: 40, h: 20 }], floors: 1, h: 6, district: 'workshops' });
  // Tin Hill's water point.
  space('plaza', { x: 880, y: 560, w: 26, h: 22 }, 'tinhill', 'Water Point', { landmark: true });

  // ---- Everything else, block by block, in each district's style.
  const outside = (d: DistrictId) => d === 'kilns' || d === 'groves' || d === 'camp';
  const fillBlock = (bl: (typeof blocks)[number], r: Rng) => {
    if (bl.district === 'canal') return;
    const st = STYLES[bl.district];
    const mine: Rect[] = [];
    const lanes: Rect[] = [];
    for (let i = 0; i < st.lanes; i++) {
      if (r() < 0.5) lanes.push({ x: bl.x, y: bl.y + 12 + r() * (bl.h - 24), w: bl.w, h: 3 + r() * 1.5 });
      else lanes.push({ x: bl.x + 12 + r() * (bl.w - 24), y: bl.y, w: 3 + r() * 1.5, h: bl.h });
    }
    const free = (q: Rect, gap: number) =>
      q.x >= bl.x + 2.5 &&
      q.y >= bl.y + 2.5 &&
      q.x + q.w <= bl.x + bl.w - 2.5 &&
      q.y + q.h <= bl.y + bl.h - 2.5 &&
      !reserved.some((z) => overlaps(q, z, 0.5)) &&
      !lanes.some((z) => overlaps(q, z, 0.2)) &&
      !mine.some((z) => overlaps(q, z, gap));
    const put = (q: Rect, front: 'main' | 'street' | 'inner') => {
      const kind = st.kind(r, front);
      const material = st.material(r, kind);
      const b = add({ kind, material, paper: st.paper(r, material), rects: [q], floors: st.floors(r, kind), district: bl.district });
      mine.push(q);
      // Villas sit in walled gardens.
      if (kind === 'villa') {
        const m = 5;
        const g = { x: q.x - m, y: q.y - m, w: q.w + m * 2, h: q.h + m * 2 };
        walls.push({ x: g.x, y: g.y, w: g.w, h: 0.5 }, { x: g.x, y: g.y + g.h, w: g.w, h: 0.5 }, { x: g.x, y: g.y, w: 0.5, h: g.h }, { x: g.x + g.w, y: g.y, w: 0.5, h: g.h * 0.6 });
        for (let t = 0; t < 3; t++) trees.push({ x: g.x + 2 + r() * (g.w - 4), y: g.y + g.h - 2.5 - r() * 3, r: 1.6 + r(), kind: r() < 0.5 ? 'palm' : 'round' });
      }
      return b;
    };
    if (st.rows) {
      const onMain = (y: number) => Math.abs(y - (BLVD - 12)) < 1 || Math.abs(y - (BLVD + 12)) < 1;
      for (const edge of ['n', 's'] as const) {
        let x = bl.x + 3;
        const main = edge === 'n' ? onMain(bl.y) : onMain(bl.y + bl.h);
        while (x < bl.x + bl.w - 9) {
          let w = st.w[0] + r() * (st.w[1] - st.w[0]);
          if (bl.x + bl.w - 3 - (x + w) < st.w[0] * 0.7) w = bl.x + bl.w - 3 - x;
          const d = st.d[0] + r() * (st.d[1] - st.d[0]);
          const q = { x, y: edge === 'n' ? bl.y + 3 : bl.y + bl.h - 3 - d, w, h: d };
          if (w > 6 && free(q, st.gap[0])) put(q, main ? 'main' : 'street');
          x += w + st.gap[0] + r() * (st.gap[1] - st.gap[0]);
        }
      }
      for (const edge of ['w', 'e'] as const) {
        let y = bl.y + 3 + st.d[1] + st.gap[0];
        while (y < bl.y + bl.h - st.d[1] - 10) {
          const hh = st.w[0] + r() * (st.w[1] - st.w[0]) * 0.6;
          const d = st.d[0] + r() * (st.d[1] - st.d[0]);
          const q = { x: edge === 'w' ? bl.x + 3 : bl.x + bl.w - 3 - d, y, w: d, h: Math.min(hh, bl.y + bl.h - st.d[1] - 6 - y) };
          if (q.h > 6 && free(q, st.gap[0])) put(q, 'street');
          y += q.h + st.gap[0] + r() * (st.gap[1] - st.gap[0]);
        }
      }
    }
    for (let i = 0; i < st.fill; i++) {
      const w = st.w[0] + r() * (st.w[1] - st.w[0]);
      const d = st.d[0] + r() * (st.d[1] - st.d[0]);
      const q = { x: bl.x + 3 + r() * (bl.w - 6 - w), y: bl.y + 3 + r() * (bl.h - 6 - d), w, h: d };
      if (free(q, st.gap[0] + r() * (st.gap[1] - st.gap[0]))) put(q, 'inner');
    }
    // Courtyard trees.
    const want = bl.district === 'tinhill' ? 4 : bl.district === 'oldtown' ? 18 : bl.district === 'garden' ? 10 : bl.district === 'camp' || bl.district === 'groves' ? 0 : bl.district === 'kilns' ? 3 : 6;
    for (let i = 0, got = 0; i < 200 && got < want; i++) {
      const x = bl.x + 4 + r() * (bl.w - 8);
      const y = bl.y + 4 + r() * (bl.h - 8);
      const rad = 1.6 + r() * 1.6;
      if (mine.some((q) => inRect(q, x, y, rad + 0.5)) || reserved.some((q) => inRect(q, x, y, rad)) || lanes.some((q) => inRect(q, x, y, rad))) continue;
      trees.push({ x, y, r: rad, kind: bl.district === 'oldtown' && r() < 0.3 ? 'palm' : 'round' });
      got++;
    }
  };
  for (const bl of blocks) if (!outside(bl.district)) fillBlock(bl, r);

  // ---- Trees: the boulevard's median, the quays, the park, the cemetery's cypresses.
  for (let x = 8; x < CITY_W; x += 13) {
    if (x > 690 && x < 800) continue;
    if (Math.abs(x - 360) < 26) continue;
    trees.push({ x, y: BLVD, r: 2.2, kind: 'palm' });
  }
  for (let y = 4; y < OUT; y += 11) {
    const rx = riverX(y);
    for (const side of [-1, 1]) {
      const x = rx + side * (RIVER_W / 2 + 7 + r() * 3);
      if (roads.some((q) => inRect(q.rect, x, y, 2))) continue;
      trees.push({ x, y: y + r() * 4, r: 2 + r() * 1.2, kind: 'round' });
    }
  }
  for (let i = 0; i < 70; i++) trees.push({ x: 376 + r() * 78, y: 246 + r() * 82, r: 2 + r() * 1.8, kind: 'round' });
  for (let i = 0; i < 24; i++) trees.push({ x: 816 + r() * 68, y: 372 + r() * 78, r: 1.1, kind: 'cypress' });

  // ---- The outskirts, placed by hand, from their own random stream so the city inside South Road stays as it was.
  cur = ro;
  const ex: Extras = { rail: { x0: -120, x1: 566, y: RAIL_Y }, wagons: [], fences: [], stacks: [], scrap: [], channels: [], washing: [], hives: [], doors: [], trucks: [], crates: [], kiosks: [], stripes: [], hopscotch: [], rings: [], mural: [], bikes: [], lamps: [], words: [], tankers: [], pipes: [], canopies: [], transformers: [], pylons: [], hoops: [], swings: [], slides: [], berms: [], tyres: [], wrecks: [], pens: [], goats: [], wells: [], tracks: [], panels: [] };
  // The opening scene: Warehouse 14's loading doors, a truck at the bay and crates by the wall; a kiosk on the corner;
  // zebra crossings where the children cross; hopscotch, a game circle and a mural in the school yard. Fixed, not random.
  {
    const q = warehouse.rects[0];
    for (let i = 0; i < 3; i++) ex.doors.push({ x: q.x + 4 + i * 12, y: q.y + q.h - 0.4, w: 7, h: 0.9 });
    ex.trucks.push({ x: q.x + 17.5, y: q.y + q.h + 0.8, w: 3.2, h: 6.4 });
    for (const [dx, dy] of [
      [-5.5, 4],
      [-5.5, 6],
      [-3.6, 4.6],
      [-5.5, 11],
      [-3.6, 11.5],
    ])
      ex.crates.push({ x: q.x + dx, y: q.y + dy, w: 1.6, h: 1.6 });
    ex.kiosks.push({ x: 247, y: 472.2, w: 3, h: 2.6 });
    for (let x = 234.8; x < 245.4; x += 1.7) ex.stripes.push({ x, y: 481, w: 0.85, h: 5 }); // across School Road
    for (let y = 459.8; y < 470.4; y += 1.7) ex.stripes.push({ x: 268, y, w: 6, h: 0.85 }); // across Cotton Street, by the school gate
    const yd = spaces.find((sp) => sp.name === 'School yard')!.rect;
    for (const [i, two] of [
      [0, false],
      [1, false],
      [2, true],
      [3, false],
      [4, true],
      [5, false],
    ] as [number, boolean][]) {
      if (two) ex.hopscotch.push({ x: yd.x + yd.w - 9, y: yd.y + 3 + i * 1.8, w: 1.8, h: 1.8 }, { x: yd.x + yd.w - 7.2, y: yd.y + 3 + i * 1.8, w: 1.8, h: 1.8 });
      else ex.hopscotch.push({ x: yd.x + yd.w - 8.1, y: yd.y + 3 + i * 1.8, w: 1.8, h: 1.8 });
    }
    ex.rings.push({ x: yd.x + yd.w * 0.45, y: yd.y + yd.h * 0.62, r: 4 });
    for (let x = yd.x + 1, i = 0; x < yd.x + yd.w - 1; x += 3, i++) ex.mural.push({ x, y: yd.y + yd.h - 0.9, w: 3, h: 0.7 });
    for (let i = 0; i < 6; i++) ex.bikes.push({ x: 278 + i * 1.3, y: 473.6 });
    // A basketball hoop at the west end of the yard, swings and a slide at the east end.
    ex.hoops.push({ x: yd.x + 1.2, y: yd.y + 9 });
    ex.swings.push({ x: yd.x + yd.w - 17, y: yd.y + yd.h - 7, w: 7, h: 2.4 });
    ex.slides.push({ x: yd.x + yd.w - 16, y: yd.y + 2.6, w: 1.8, h: 6 });
    ex.words.push({ x: 290, y: 466.2, text: 'SCHOOL' });
    // The fuel depot: Karim's tanker filling at the pump island, pipes between the tanks.
    ex.tankers.push({ x: 146, y: 648.4, w: 13, h: 3.4 });
    ex.canopies.push({ x: 183.4, y: 640, w: 5.8, h: 9 });
    ex.pipes.push([159, 612, 165, 612], [159, 638, 165, 638], [150, 621, 150, 629], [174, 621, 174, 629], [162, 612, 162, 638], [174, 638, 186, 644]);
  }
  reserved.push({ x: -120, y: RAIL_Y - 6, w: 700, h: 12 });
  // The power station, just outside the Workshops: a diesel generator hall, three stacks, the transformer yard, pylons out of town.
  special({ kind: 'factory', material: 'steel', paper: 'grey', rects: [{ x: 16, y: 716, w: 54, h: 22 }], floors: 1, h: 11, district: 'kilns', name: 'Power Station', landmark: true });
  for (let i = 0; i < 3; i++) special({ kind: 'chimney', material: 'steel', paper: 'grey', rects: [{ x: 76 + i * 8, y: 720, w: 4.5, h: 4.5 }], floors: 1, h: 24, district: 'kilns', name: 'Power station stack' });
  reserved.push({ x: 14, y: 742, w: 84, h: 62 });
  for (let r0 = 0; r0 < 3; r0++) for (let c0 = 0; c0 < 5; c0++) ex.transformers.push({ x: 22 + c0 * 14, y: 750 + r0 * 16, w: 5, h: 4 });
  ex.fences.push({ x: 14, y: 742, w: 84, h: 0.4 }, { x: 14, y: 804, w: 84, h: 0.4 }, { x: 14, y: 742, w: 0.4, h: 62 }, { x: 98, y: 742, w: 0.4, h: 62 });
  for (let x = 6; x > -130; x -= 28) ex.pylons.push({ x, y: 772 });
  // The Kilnworks, north of the line: the flour mill and its silos, the workers' hostel.
  special({ kind: 'factory', material: 'steel', paper: 'grey', rects: [{ x: 404, y: 716, w: 74, h: 34 }], floors: 2, h: 14, district: 'kilns', name: 'Flour Mill', landmark: true });
  for (let i = 0; i < 4; i++) special({ kind: 'silo', material: 'concrete', paper: 'grey', rects: [{ x: 488 + i * 19, y: 718, w: 16, h: 16 }], floors: 1, h: 26, district: 'kilns', name: 'Grain Silos', landmark: i === 0, round: true });
  special({ kind: 'apartment', material: 'brick', paper: 'kraft', rects: [{ x: 290, y: 716, w: 64, h: 14 }], floors: 3, district: 'kilns', name: "Workers' Hostel", landmark: true });
  space('yard', { x: 404, y: 758, w: 74, h: 40 }, 'kilns', 'Mill yard');
  // Freight wagons waiting in the sidings by the mill.
  for (let x = 372, i = 0; x < 556; x += 15, i++) if (i % 5 !== 3) ex.wagons.push({ x, y: RAIL_Y - 2, w: 13, h: 4 });
  // South of the line: three brick kilns with their chimneys, the drying yard, the scrapyard, the kiln families' huts.
  for (let i = 0; i < 3; i++) {
    const x = 24 + i * 92;
    special({ kind: 'kiln', material: 'brick', paper: 'kraft', rects: [{ x, y: 830, w: 52, h: 24 }], floors: 1, h: 5, district: 'kilns', name: 'Brick Kilns', landmark: i === 0 });
    special({ kind: 'chimney', material: 'brick', paper: 'kraft', rects: [{ x: x + 58, y: 838, w: 6, h: 6 }], floors: 1, h: 30, district: 'kilns', name: 'Kiln chimney' });
  }
  for (let i = 0; i < 12; i++) special({ kind: 'home', material: 'mud', paper: 'kraft', rects: [{ x: 22 + i * 22, y: 868 + (i % 2) * 3, w: 9, h: 8 }], floors: 1, h: 3, district: 'kilns' });
  const bricks = space('brickyard', { x: 300, y: 826, w: 118, h: 60 }, 'kilns', 'Brick yard', { landmark: true });
  for (let y = bricks.rect.y + 4; y < bricks.rect.y + bricks.rect.h - 4; y += 6) for (let x = bricks.rect.x + 4; x < bricks.rect.x + bricks.rect.w - 8; x += 9) if (ro() < 0.8) ex.stacks.push({ x, y, w: 6.5, h: 2.2 });
  const scrap = space('scrapyard', { x: 432, y: 826, w: 124, h: 60 }, 'kilns', 'Scrapyard', { landmark: true });
  for (let i = 0; i < 14; i++) ex.scrap.push({ x: scrap.rect.x + 8 + ro() * (scrap.rect.w - 16), y: scrap.rect.y + 8 + ro() * (scrap.rect.h - 16), r: 3 + ro() * 4 });
  // The groves, by the canal: plastic tunnels, a pump house, a farmhouse, beehives, and the date palms.
  for (let i = 0; i < 6; i++) special({ kind: 'greenhouse', material: 'canvas', paper: 'white', rects: [{ x: 592 + i * 9, y: 714, w: 6.5, h: 34 }], floors: 1, h: 3, district: 'groves', name: 'Greenhouses', landmark: i === 0 });
  special({ kind: 'home', material: 'mud', paper: 'kraft', rects: [{ x: 654, y: 714, w: 18, h: 12 }], floors: 1, district: 'groves', name: 'Farmhouse' });
  special({ kind: 'workshop', material: 'brick', paper: 'white', rects: [{ x: 672, y: 772, w: 10, h: 9 }], floors: 1, h: 4, district: 'groves', name: 'Pump House', landmark: true });
  for (let i = 0; i < 6; i++) ex.hives.push({ x: 656 + (i % 3) * 5, y: 736 + Math.floor(i / 3) * 5 });
  const grove = space('field', { x: 592, y: 790, w: 92, h: 100 }, 'groves', 'Date grove', { landmark: true });
  ex.channels.push({ x: 586, y: 784, w: 110, h: 1.4 });
  for (let x = grove.rect.x + 4; x < grove.rect.x + grove.rect.w; x += 11) {
    ex.channels.push({ x: x + 5, y: grove.rect.y, w: 0.9, h: grove.rect.h });
    for (let y = grove.rect.y + 5; y < grove.rect.y + grove.rect.h - 2; y += 10) trees.push({ x: x + (ro() - 0.5), y: y + (ro() - 0.5), r: 2.4 + ro() * 0.6, kind: 'palm' });
  }
  // The camp: a fence with two gates, the tent school, the clinic, the distribution point, the taps, a dirt pitch, and tents in rows.
  const cx0 = 806;
  const cy0 = OUT + 6;
  const fence = (x: number, y: number, w: number, h: number) => ex.fences.push({ x, y, w, h });
  fence(cx0 + 2, cy0 + 2, 88, 0.4), fence(cx0 + 102, cy0 + 2, 84, 0.4); // north side, gate on South Road
  fence(cx0 + 2, cy0 + 186, 184, 0.4);
  fence(cx0 + 2, cy0 + 2, 0.4, 84), fence(cx0 + 2, cy0 + 100, 0.4, 86); // west side, gate at the footbridge
  fence(cx0 + 186, cy0 + 2, 0.4, 184);
  special({ kind: 'school', material: 'canvas', paper: 'white', rects: [{ x: 816, y: 716, w: 36, h: 14 }], floors: 1, h: 3.6, district: 'camp', name: 'Tent School', landmark: true, protected: true });
  special({ kind: 'clinic', material: 'canvas', paper: 'white', rects: [{ x: 956, y: 716, w: 26, h: 12 }], floors: 1, h: 3.4, district: 'camp', name: 'Camp Clinic', landmark: true, protected: true });
  space('distribution', { x: 896, y: 712, w: 40, h: 22 }, 'camp', 'Distribution Point', { landmark: true });
  for (const [x, y] of [
    [888, 792],
    [900, 792],
  ])
    special({ kind: 'watertank', material: 'steel', paper: 'white', rects: [{ x, y, w: 9, h: 9 }], floors: 1, h: 4, district: 'camp', round: true, name: 'Water tanks' });
  space('plaza', { x: 882, y: 804, w: 32, h: 12 }, 'camp', 'Camp Taps', { landmark: true });
  space('pitch', { x: 940, y: 832, w: 44, h: 56 }, 'camp', 'Dirt Pitch', { landmark: true });
  const tents: Rect[] = [];
  for (let row = 0, y = 740; y < 888; y += 7.5, row++) {
    if (row % 6 === 5) continue; // a wider lane every few rows
    for (let col = 0, x = 812; x < 986; x += 7.6, col++) {
      if (col % 7 === 6) continue;
      const q = { x: x + (ro() - 0.5) * 0.6, y: y + (ro() - 0.5) * 0.4, w: 5.6, h: 4.2 };
      if (reserved.some((z) => overlaps(q, z, 1.5))) continue;
      if (ro() < 0.06) continue; // a gap where a family moved on
      add({ kind: 'tent', material: 'canvas', paper: 'white', rects: [q], floors: 1, h: 2.4, district: 'camp' });
      tents.push(q);
    }
  }
  for (let i = 0; i < 40; i++) {
    const a = tents[Math.floor(ro() * tents.length)];
    const b = tents.find((t) => Math.abs(t.y - a.y) < 1 && t.x > a.x && t.x - a.x < 9);
    if (b) ex.washing.push([a.x + a.w, a.y + a.h + 0.6, b.x, b.y + b.h + 0.6]);
  }

  // ---- Out in the desert, an hour's drive east on a dirt track: a camp built for training, years ago.
  // Its sand banks and obstacle course are half buried now. A herding family winters in the old barracks.
  const P = POST;
  special({ kind: 'barracks', material: 'concrete', paper: 'grey', rects: [{ x: P.x + 18, y: P.y + 16, w: 36, h: 10 }], floors: 1, h: 3.4, district: 'desert', name: 'Old barracks', landmark: true });
  special({ kind: 'barracks', material: 'concrete', paper: 'grey', rects: [{ x: P.x + 18, y: P.y + 34, w: 36, h: 10 }], floors: 1, h: 3.4, district: 'desert' });
  special({ kind: 'barracks', material: 'mud', paper: 'kraft', rects: [{ x: P.x + 62, y: P.y + 16, w: 14, h: 12 }], floors: 1, h: 3, district: 'desert', name: 'Guardhouse' });
  special({ kind: 'mast', material: 'steel', paper: 'grey', rects: [{ x: P.x + 84, y: P.y + 20, w: 3, h: 3 }], floors: 1, h: 26, district: 'desert', name: 'Old radio mast', landmark: true });
  special({ kind: 'watertank', material: 'steel', paper: 'white', rects: [{ x: P.x + 64, y: P.y + 38, w: 8, h: 8 }], floors: 1, h: 9, district: 'desert', round: true, name: 'Water tower' });
  // The herders: three goat-hair tents, the pen, the well, a solar panel for the phone.
  for (let i = 0; i < 3; i++) special({ kind: 'tent', material: 'canvas', paper: 'kraft', rects: [{ x: P.x + 30 + i * 13, y: P.y + 58, w: 9, h: 5.5 }], floors: 1, h: 2.2, district: 'desert', name: i === 0 ? 'Herders’ tents' : undefined, landmark: i === 0 });
  ex.pens.push({ x: P.x + 88, y: P.y + 66, r: 11 });
  for (let i = 0; i < 26; i++) {
    const a = ro() * Math.PI * 2;
    const d = Math.sqrt(ro()) * 9;
    ex.goats.push({ x: P.x + 88 + Math.cos(a) * d, y: P.y + 66 + Math.sin(a) * d });
  }
  ex.wells.push({ x: P.x + 12, y: P.y + 64 });
  ex.panels.push({ x: P.x + 32, y: P.y + 66, w: 2.4, h: 1.4 });
  // The old training ground, south of the huts: sand banks, a line of half-buried tyres, a burnt-out truck.
  for (let i = 0; i < 4; i++) ex.berms.push({ x: P.x + 16 + i * 34, y: P.y + 92, w: 26, h: 4 });
  ex.berms.push({ x: P.x + 4, y: P.y + 120, w: 150, h: 5 });
  for (let i = 0; i < 12; i++) ex.tyres.push({ x: P.x + 22 + i * 4.2, y: P.y + 106 + (i % 2) * 2.4 });
  ex.wrecks.push({ x: P.x + 118, y: P.y + 34, w: 3.4, h: 8 });
  // Tyre tracks: the old ones round the course, a fresh one to the tents.
  ex.tracks.push([
    [1006, 236],
    [P.x - 40, 238],
    [P.x + 8, P.y + 50],
    [P.x + 40, P.y + 70],
  ]);
  ex.tracks.push([
    [P.x + 10, P.y + 100],
    [P.x + 70, P.y + 112],
    [P.x + 140, P.y + 100],
    [P.x + 150, P.y + 60],
    [P.x + 100, P.y + 44],
  ]);
  // A low wall of piled sand around it all, open to the track.
  walls.push({ x: P.x, y: P.y, w: P.w, h: 0.8 }, { x: P.x, y: P.y + P.h, w: P.w, h: 0.8 }, { x: P.x + P.w, y: P.y, w: 0.8, h: P.h }, { x: P.x, y: P.y, w: 0.8, h: 34 }, { x: P.x, y: P.y + 54, w: 0.8, h: P.h - 54 });

  for (const bl of blocks) if (outside(bl.district)) fillBlock(bl, ro);
  // The quays go on south, past the groves and the camp.
  for (let y = OUT + 4; y < CITY_H; y += 11) {
    const rx = riverX(y);
    for (const side of [-1, 1]) {
      const x = rx + side * (RIVER_W / 2 + 7 + ro() * 3);
      if (roads.some((q) => inRect(q.rect, x, y, 2))) continue;
      trees.push({ x, y: y + ro() * 4, r: 2 + ro() * 1.2, kind: 'round' });
    }
  }

  // ---- Pavements: where people walk.
  const inAny = (x: number, y: number) => buildings.some((b) => Math.abs(b.cx - x) < 40 && Math.abs(b.cy - y) < 40 && inBuilding(b, x, y, 0.3));
  const street: number[] = [];
  for (const bl of blocks) {
    const e = 1.4;
    const step = bl.district === 'tinhill' || bl.district === 'oldtown' || bl.district === 'camp' ? 5 : 6;
    for (let x = bl.x + e; x < bl.x + bl.w - e; x += step) street.push(x, bl.y + e, x, bl.y + bl.h - e);
    for (let y = bl.y + e + step; y < bl.y + bl.h - e - step; y += step) street.push(bl.x + e, y, bl.x + bl.w - e, y);
    // Lanes and alleys inside dense blocks: sample open points.
    if (bl.district === 'oldtown' || bl.district === 'tinhill' || bl.district === 'camp' || bl.district === 'kilns') {
      for (let i = 0; i < (bl.district === 'kilns' ? 160 : 700); i++) {
        const x = bl.x + 3 + r() * (bl.w - 6);
        const y = bl.y + 3 + r() * (bl.h - 6);
        if (!inAny(x, y) && !spaces.some((s) => inRect(s.rect, x, y))) street.push(x, y);
      }
    }
  }
  for (let y = 0; y < CITY_H; y += 6) {
    const rx = riverX(y);
    street.push(rx - RIVER_W / 2 - 4, y, rx + RIVER_W / 2 + 4, y);
  }
  // Traffic lanes.
  const traffic: number[] = [];
  for (const rd of roads) {
    if (rd.name === 'Camp footbridge') continue;
    const q = rd.rect;
    const busy = rd.kind === 'boulevard' || (rd.kind === 'bridge' && Math.abs(q.y + q.h / 2 - BLVD) < 1) ? 1 : 0;
    if (rd.horizontal) {
      for (let x = Math.max(0, q.x); x < Math.min(WORLD_W, q.x + q.w); x += rd.name === 'Desert track' ? 40 : 9) {
        traffic.push(x, q.y + q.h * 0.3, busy, x + 4, q.y + q.h * 0.7, busy);
      }
    } else {
      for (let y = Math.max(0, q.y); y < Math.min(CITY_H, q.y + q.h); y += 12) traffic.push(q.x + q.w * 0.3, y, busy, q.x + q.w * 0.7, y + 5, busy);
    }
  }

  // ---- The occupancy grid, for fragments blocked by buildings and walls.
  const gridW = Math.ceil(WORLD_W / CELL);
  const gridH = Math.ceil(CITY_H / CELL);
  const grid = new Int16Array(gridW * gridH);
  const stamp = (q: Rect, v: number) => {
    for (let gy = Math.max(0, Math.floor(q.y / CELL)); gy <= Math.min(gridH - 1, Math.floor((q.y + q.h) / CELL)); gy++)
      for (let gx = Math.max(0, Math.floor(q.x / CELL)); gx <= Math.min(gridW - 1, Math.floor((q.x + q.w) / CELL)); gx++) grid[gy * gridW + gx] = v;
  };
  for (const wl of walls) stamp(wl, -1);
  for (const b of buildings) if (b.h > 2.5) for (const q of b.rects) stamp(q, b.id + 1);

  // ---- The targets.
  const bridge = roads.find((q) => q.kind === 'bridge' && Math.abs(q.rect.y + q.rect.h / 2 - BLVD) < 1)!;
  // Four more, each a different kind of dilemma: a man at home, fuel everyone needs, a mast above a public office, a bus among forty.
  const house = buildings.filter((b) => (b.kind === 'shack' || b.kind === 'home') && b.district === 'tinhill' && b.capacity > 0).sort((a, b) => Math.hypot(a.cx - 880, a.cy - 560) - Math.hypot(b.cx - 880, b.cy - 560))[0];
  const depot = buildings.find((b) => b.name === 'Fuel Depot' && b.landmark) ?? buildings.find((b) => b.name === 'Fuel Depot')!;
  const office = buildings.find((b) => b.name === 'District Office')!;
  const station = spaces.find((s) => s.kind === 'busstation')!;
  // And one on each part of the outskirts: a mill that never stops, a pump the groves live on, one tent among hundreds.
  const mill = buildings.find((b) => b.name === 'Flour Mill')!;
  const pump = buildings.find((b) => b.name === 'Pump House')!;
  const barracks = buildings.find((b) => b.name === 'Old barracks')!;
  const mosque = buildings.find((b) => b.name === 'Great Mosque')!;
  const tent = buildings.filter((b) => b.kind === 'tent').sort((a, b) => Math.hypot(a.cx - 872, a.cy - 846) - Math.hypot(b.cx - 872, b.cy - 846))[0];
  const targets: Target[] = [
    {
      id: 'warehouse',
      name: 'Warehouse 14',
      short: 'Warehouse',
      note: 'Said to hold weapons. A school sits across Cotton Street; a fuel depot is round the corner.',
      rect: warehouse.rects[0],
      buildingId: warehouse.id,
      hardness: 12,
      stored: false,
      aimHeight: warehouse.h,
    },
    {
      id: 'tower',
      name: 'Tower 7, top floor',
      short: 'Tower 7',
      note: 'A reported command post on the ninth floor of a block of flats. Families live on the floors below.',
      rect: tower.rects[0],
      buildingId: tower.id,
      hardness: 7,
      stored: false,
      aimHeight: tower.h,
    },
    {
      id: 'yard',
      name: 'Vehicle yard',
      short: 'Vehicle yard',
      note: 'Trucks said to move weapons, parked in an open yard beside the workshops.',
      rect: { x: 26, y: 492, w: 56, h: 38 },
      buildingId: null,
      hardness: 6,
      stored: false,
      aimHeight: 0,
    },
    {
      id: 'bridge',
      name: 'Boulevard bridge',
      short: 'Bridge',
      note: 'A supply route, and also the road from Tin Hill to the hospital. Dual use.',
      rect: bridge.rect,
      buildingId: null,
      hardness: 19,
      stored: false,
      aimHeight: 0,
    },
    {
      id: 'house',
      name: 'A house on Tin Hill',
      short: 'House',
      note: 'A commander is said to sleep here most nights, with his family. The houses around it are tin.',
      rect: house.rects[0],
      buildingId: house.id,
      hardness: 4,
      stored: false,
      aimHeight: house.h,
    },
    {
      id: 'depot',
      name: 'Fuel depot',
      short: 'Fuel depot',
      note: 'Said to fuel the trucks that move weapons. It also fuels the ambulances, the bakeries and the generators.',
      rect: depot.rects[0],
      buildingId: depot.id,
      hardness: 8,
      stored: false,
      aimHeight: depot.h,
    },
    {
      id: 'office',
      name: 'District Office mast',
      short: 'Office mast',
      note: 'A radio mast on the roof is said to relay orders. Downstairs is the office everyone queues at.',
      rect: office.rects[0],
      buildingId: office.id,
      hardness: 9,
      stored: false,
      aimHeight: office.h,
    },
    {
      id: 'station',
      name: 'Bus station',
      short: 'Bus station',
      note: 'A minibus is reported to carry weapons, among the forty that leave here every day.',
      rect: station.rect,
      buildingId: null,
      hardness: 5,
      stored: false,
      aimHeight: 0,
    },
    {
      id: 'mill',
      name: 'Flour Mill',
      short: 'Flour mill',
      note: 'A storeroom at the back is said to hide a weapons workshop. The mill runs day and night: there is no empty hour.',
      rect: mill.rects[0],
      buildingId: mill.id,
      hardness: 10,
      stored: false,
      aimHeight: mill.h,
    },
    {
      id: 'pump',
      name: 'Pump House in the groves',
      short: 'Pump house',
      note: 'A rocket team is said to hide its launcher by the pump house. The pump waters every palm in the groves.',
      rect: pump.rects[0],
      buildingId: pump.id,
      hardness: 6,
      stored: false,
      aimHeight: pump.h,
    },
    {
      id: 'camp',
      name: 'A tent in Amal Camp',
      short: 'Camp tent',
      note: 'A recruiter for the fighters is said to live in this tent. Around it, hundreds of tents, and canvas stops nothing.',
      rect: tent.rects[0],
      buildingId: tent.id,
      hardness: 2,
      stored: false,
      aimHeight: tent.h,
    },
    {
      id: 'mosque',
      name: 'Great Mosque, Friday noon',
      short: 'Great Mosque',
      note: 'The most senior commander in the region is said to come to Friday prayers here. A protected site, and at noon on a Friday the fullest place in the city.',
      rect: mosque.rects[0],
      buildingId: mosque.id,
      hardness: 8,
      stored: false,
      aimHeight: mosque.h,
    },
    {
      id: 'outpost',
      name: 'The old camp in the desert',
      short: 'Desert camp',
      note: 'Satellite images show a training camp. The images are two years old. A herding family winters here now.',
      rect: barracks.rects[0],
      buildingId: barracks.id,
      hardness: 8,
      stored: false,
      aimHeight: barracks.h,
    },
  ];

  // ---- Places to discover.
  const districts: District[] = [
    { id: 'terraces', name: 'The Terraces', x: 110, y: 60, blurb: 'Concrete blocks of flats, four to nine floors.' },
    { id: 'civic', name: 'Civic Centre', x: 350, y: 60, blurb: 'Offices, the hospital, a school, the park.' },
    { id: 'oldtown', name: 'Old Town', x: 580, y: 60, blurb: 'Mud-brick houses packed along narrow lanes.' },
    { id: 'garden', name: 'Garden Side', x: 890, y: 60, blurb: 'Walled villas, the stadium, the cemetery.' },
    { id: 'workshops', name: 'The Workshops', x: 110, y: 660, blurb: 'Warehouses, a fuel depot, the vehicle yard.' },
    { id: 'quarter', name: "Weavers' Quarter", x: 350, y: 660, blurb: 'Brick terraces, shops on the boulevard.' },
    { id: 'market', name: 'Market Quarter', x: 580, y: 660, blurb: 'The souk, the covered market, the bus station.' },
    { id: 'tinhill', name: 'Tin Hill', x: 900, y: 660, blurb: 'Tin-roofed homes built close together. Walls that stop little.' },
    { id: 'canal', name: 'The Canal', x: 745, y: 250, blurb: 'Open water and tree-lined quays.' },
    { id: 'kilns', name: 'The Kilnworks', x: 200, y: 790, blurb: 'Brick kilns, a flour mill, the railway sidings.' },
    { id: 'groves', name: 'The Groves', x: 638, y: 760, blurb: 'Date palms, greenhouses and irrigation by the canal.' },
    { id: 'camp', name: 'Amal Camp', x: 900, y: 760, blurb: 'Tents for families who fled the villages. Canvas stops nothing.' },
    { id: 'desert', name: 'The Desert', x: POST.x + POST.w / 2, y: POST.y - 26, blurb: 'Sand, an old camp, a herding family and their goats.' },
  ];
  const places: Place[] = [];
  for (const d of districts) places.push({ id: `d:${d.id}`, name: d.name, x: d.x, y: d.y, kind: 'district', note: d.blurb });
  for (const b of buildings) if (b.landmark && b.name) places.push({ id: `b:${b.id}`, name: b.name, x: b.cx, y: b.cy, kind: 'landmark', note: b.protected ? 'Protected site' : b.hazard ? 'Hazard: can go off' : undefined });
  for (const s of spaces) if (s.landmark && s.name) places.push({ id: `s:${s.id}`, name: s.name, x: s.rect.x + s.rect.w / 2, y: s.rect.y + s.rect.h / 2, kind: 'landmark', note: 'Open ground: no cover' });
  places.push({ id: 'l:fountain', name: 'Fountain Circus', x: 360, y: BLVD, kind: 'landmark' });
  const seen = new Set<string>();
  for (const rd of roads) {
    if (seen.has(rd.name)) continue;
    seen.add(rd.name);
    const q = rd.rect;
    const x = rd.horizontal ? Math.min(Math.max(q.x + q.w / 2, 40), WORLD_W - 40) : q.x + q.w / 2;
    const y = rd.horizontal ? q.y + q.h / 2 : Math.min(Math.max(q.y + q.h / 2, 40), CITY_H - 40);
    places.push({ id: `r:${rd.name}`, name: rd.name, x, y, kind: 'street' });
  }

  const world: World = {
    w: WORLD_W,
    h: CITY_H,
    city: { x: 0, y: 0, w: CITY_W, h: CITY_H },
    seed,
    districts,
    roads,
    river: { pts: RIVER_PTS, width: RIVER_W },
    roundabout: { x: 360, y: BLVD, r: 22 },
    blocks,
    buildings,
    spaces,
    walls,
    trees,
    extras: ex,
    targets,
    places,
    streetPts: new Float32Array(street),
    trafficPts: new Float32Array(traffic),
    grid,
    gridW,
    gridH,
    cell: CELL,
  };
  cache.set(seed, world);
  return world;
}

export const targetOf = (w: World, id: TargetId): Target => (id.startsWith('b:') ? buildingTarget(w, Number(id.slice(2))) : id.startsWith('g:') ? groundTarget(id) : w.targets.find((t) => t.id === id)!);

/** A spot on the ground as the target: a street, a yard, a square. Metres, to the nearest metre. */
export const groundId = (x: number, y: number): TargetId => `g:${Math.round(x)}_${Math.round(y)}`;
const grounds = new Map<string, Target>();
function groundTarget(id: TargetId): Target {
  let t = grounds.get(id);
  if (t) return t;
  const [x, y] = id.slice(2).split('_').map(Number);
  t = {
    id,
    name: 'A spot on open ground',
    short: 'Open ground',
    note: 'A spot you picked on open ground: a vehicle, a checkpoint, a gathering. There is nothing to bring down, so a small blast is enough; but in the open, nothing shields anyone nearby either.',
    rect: { x: x - 3, y: y - 3, w: 6, h: 6 },
    buildingId: null,
    hardness: 3,
    stored: false,
    aimHeight: 0,
  };
  grounds.set(id, t);
  return t;
}

const HARDNESS: Record<Material, number> = { concrete: 9, steel: 10, brick: 7, mud: 5, tin: 3, canvas: 1 };
const built = new WeakMap<World, Map<number, Target>>();

/** Any building as a target. No briefing and no quirks: how much blast it takes comes from its material and size. */
export function buildingTarget(w: World, id: number): Target {
  let m = built.get(w);
  if (!m) built.set(w, (m = new Map()));
  let t = m.get(id);
  if (t) return t;
  const b = w.buildings[id];
  if (!b) return w.targets[0];
  const x0 = Math.min(...b.rects.map((q) => q.x));
  const y0 = Math.min(...b.rects.map((q) => q.y));
  const x1 = Math.max(...b.rects.map((q) => q.x + q.w));
  const y1 = Math.max(...b.rects.map((q) => q.y + q.h));
  const name = placeName(b);
  t = {
    id: `b:${id}`,
    name,
    short: name.length > 18 ? `${name.slice(0, 17)}…` : name,
    note: `A building you picked: ${MATERIAL_NAME[b.material].toLowerCase()}, ${b.floors} floor${b.floors === 1 ? '' : 's'}. No briefing and no special rules: how much it takes to destroy comes from what it's made of and how big it is.`,
    rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
    buildingId: id,
    hardness: Math.round(HARDNESS[b.material] + Math.min(4, b.floors * 0.4) + Math.min(3, ((x1 - x0) * (y1 - y0)) / 600)),
    stored: false,
    aimHeight: b.h,
  };
  m.set(id, t);
  return t;
}
export const targetCentre = (t: Target) => ({ x: t.rect.x + t.rect.w / 2, y: t.rect.y + t.rect.h / 2 });

export function placeName(b: Building): string {
  if (b.name) return b.name;
  switch (b.kind) {
    case 'apartment':
      return `Flats, ${b.floors} floors`;
    case 'home':
      return b.floors > 1 ? `A family house, ${b.floors} floors` : 'A family house';
    case 'villa':
      return 'A walled villa';
    case 'shack':
      return 'A tin-roofed home';
    case 'shop':
      return 'Shops';
    case 'office':
      return `Offices, ${b.floors} floors`;
    case 'warehouse':
      return 'A warehouse';
    case 'workshop':
      return 'A workshop';
    case 'stand':
      return 'Stadium stand';
    case 'shelter':
      return 'Bus shelter';
    case 'barracks':
      return 'An old barracks hut';
    case 'mast':
      return 'A radio mast';
    case 'factory':
      return 'A factory';
    case 'kiln':
      return 'A brick kiln';
    case 'tent':
      return 'A family’s tent';
    case 'greenhouse':
      return 'A greenhouse';
    default:
      return b.kind;
  }
}

export const MATERIAL_NAME: Record<Material, string> = { concrete: 'Concrete', brick: 'Brick', mud: 'Mud brick', tin: 'Tin sheet', steel: 'Steel frame', canvas: 'Canvas' };
