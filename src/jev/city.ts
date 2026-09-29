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
  | 'shelter';

export type Material = 'concrete' | 'brick' | 'mud' | 'tin' | 'steel';
export type Paper = 'white' | 'grey' | 'kraft' | 'tin' | 'terracotta';
export type DistrictId = 'terraces' | 'civic' | 'oldtown' | 'workshops' | 'quarter' | 'market' | 'garden' | 'tinhill' | 'canal';
export type SpaceKind = 'plaza' | 'market' | 'park' | 'pitch' | 'yard' | 'playground' | 'cemetery' | 'courtyard' | 'busstation';

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
export type TargetId = 'warehouse' | 'tower' | 'yard' | 'bridge' | `b:${number}`;
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

export interface World {
  w: number;
  h: number;
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
export const CITY_H = 700;
export const CELL = 2;
const V = [0, 120, 240, 360, 470, 580, 690, 800, 900, 1000];
const H = [0, 115, 230, 350, 465, 580, 700];
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
];
const RIVER_W = 36;

const V_NAMES: Record<number, string> = { 0: 'West Road', 120: 'Loom Street', 240: 'School Road', 360: 'Fountain Street', 470: 'Old Wall Road', 580: 'Tanners Lane', 690: 'West Quay', 800: 'East Quay', 900: 'Garden Street', 1000: 'East Road' };
const H_NAMES: Record<number, string> = { 0: 'North Road', 115: 'Mill Street', 230: 'Well Lane', 350: 'Long Boulevard', 465: 'Cotton Street', 580: 'Pump Road', 700: 'South Road' };

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
};
const STACKED: Partial<Record<Kind, true>> = { home: true, apartment: true, villa: true, office: true, hospital: true };
export const SHIELD: Record<Material, number> = { concrete: 0.42, brick: 0.55, mud: 0.66, tin: 0.9, steel: 0.5 };

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
  const per: Record<SpaceKind, number> = { plaza: 3, market: 1.6, park: 12, pitch: 1.2, yard: 25, playground: 2, cemetery: 40, courtyard: 1.1, busstation: 3 };
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
    if (!bridges.has(y)) cut(696, 794);
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
    for (const [a, b] of spans) roads.push({ rect: { x: x - 6, y: a, w: 12, h: b - a }, name: V_NAMES[x], kind: 'street', horizontal: false });
  }

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
      if (d === 'oldtown' || (d === 'tinhill' && j >= 4)) continue;
      blocks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, district: d });
    }
  blocks.push({ x: 476, y: 6, w: 208, h: 332, district: 'oldtown' });
  blocks.push({ x: 806, y: 471, w: 188, h: 223, district: 'tinhill' });

  const buildings: Building[] = [];
  const spaces: Space[] = [];
  const walls: Rect[] = [];
  const trees: Tree[] = [];
  const reserved: Rect[] = [];
  const add = (s: Spec) => {
    const b = make(r, buildings.length, s);
    buildings.push(b);
    return b;
  };
  const space = (kind: SpaceKind, rect: Rect, district: DistrictId, name?: string, extra: Partial<Space> = {}) => {
    const s = makeSpace(r, spaces.length, kind, rect, district, name, extra);
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
  special({ kind: 'school', material: 'brick', paper: 'kraft', rects: [{ x: 250, y: 477, w: 60, h: 14 }, { x: 250, y: 491, w: 14, h: 30 }], floors: 2, district: 'quarter', name: 'Cotton Street School', landmark: true, protected: true });
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
  for (const bl of blocks) {
    if (bl.district === 'canal') continue;
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
    const want = bl.district === 'tinhill' ? 4 : bl.district === 'oldtown' ? 18 : bl.district === 'garden' ? 10 : 6;
    for (let i = 0, got = 0; i < 200 && got < want; i++) {
      const x = bl.x + 4 + r() * (bl.w - 8);
      const y = bl.y + 4 + r() * (bl.h - 8);
      const rad = 1.6 + r() * 1.6;
      if (mine.some((q) => inRect(q, x, y, rad + 0.5)) || reserved.some((q) => inRect(q, x, y, rad)) || lanes.some((q) => inRect(q, x, y, rad))) continue;
      trees.push({ x, y, r: rad, kind: bl.district === 'oldtown' && r() < 0.3 ? 'palm' : 'round' });
      got++;
    }
  }

  // ---- Trees: the boulevard's median, the quays, the park, the cemetery's cypresses.
  for (let x = 8; x < CITY_W; x += 13) {
    if (x > 690 && x < 800) continue;
    if (Math.abs(x - 360) < 26) continue;
    trees.push({ x, y: BLVD, r: 2.2, kind: 'palm' });
  }
  for (let y = 4; y < CITY_H; y += 11) {
    const rx = riverX(y);
    for (const side of [-1, 1]) {
      const x = rx + side * (RIVER_W / 2 + 7 + r() * 3);
      if (roads.some((q) => inRect(q.rect, x, y, 2))) continue;
      trees.push({ x, y: y + r() * 4, r: 2 + r() * 1.2, kind: 'round' });
    }
  }
  for (let i = 0; i < 70; i++) trees.push({ x: 376 + r() * 78, y: 246 + r() * 82, r: 2 + r() * 1.8, kind: 'round' });
  for (let i = 0; i < 24; i++) trees.push({ x: 816 + r() * 68, y: 372 + r() * 78, r: 1.1, kind: 'cypress' });

  // ---- Pavements: where people walk.
  const inAny = (x: number, y: number) => buildings.some((b) => Math.abs(b.cx - x) < 40 && Math.abs(b.cy - y) < 40 && inBuilding(b, x, y, 0.3));
  const street: number[] = [];
  for (const bl of blocks) {
    const e = 1.4;
    const step = bl.district === 'tinhill' || bl.district === 'oldtown' ? 5 : 6;
    for (let x = bl.x + e; x < bl.x + bl.w - e; x += step) street.push(x, bl.y + e, x, bl.y + bl.h - e);
    for (let y = bl.y + e + step; y < bl.y + bl.h - e - step; y += step) street.push(bl.x + e, y, bl.x + bl.w - e, y);
    // Lanes and alleys inside dense blocks: sample open points.
    if (bl.district === 'oldtown' || bl.district === 'tinhill') {
      for (let i = 0; i < 700; i++) {
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
    const q = rd.rect;
    const busy = rd.kind === 'boulevard' || (rd.kind === 'bridge' && Math.abs(q.y + q.h / 2 - BLVD) < 1) ? 1 : 0;
    if (rd.horizontal) {
      for (let x = Math.max(0, q.x); x < Math.min(CITY_W, q.x + q.w); x += 9) {
        traffic.push(x, q.y + q.h * 0.3, busy, x + 4, q.y + q.h * 0.7, busy);
      }
    } else {
      for (let y = Math.max(0, q.y); y < Math.min(CITY_H, q.y + q.h); y += 12) traffic.push(q.x + q.w * 0.3, y, busy, q.x + q.w * 0.7, y + 5, busy);
    }
  }

  // ---- The occupancy grid, for fragments blocked by buildings and walls.
  const gridW = Math.ceil(CITY_W / CELL);
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
    const x = rd.horizontal ? Math.min(Math.max(q.x + q.w / 2, 40), CITY_W - 40) : q.x + q.w / 2;
    const y = rd.horizontal ? q.y + q.h / 2 : Math.min(Math.max(q.y + q.h / 2, 40), CITY_H - 40);
    places.push({ id: `r:${rd.name}`, name: rd.name, x, y, kind: 'street' });
  }

  const world: World = {
    w: CITY_W,
    h: CITY_H,
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

export const targetOf = (w: World, id: TargetId): Target => (id.startsWith('b:') ? buildingTarget(w, Number(id.slice(2))) : w.targets.find((t) => t.id === id)!);

const HARDNESS: Record<Material, number> = { concrete: 9, steel: 10, brick: 7, mud: 5, tin: 3 };
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
    default:
      return b.kind;
  }
}

export const MATERIAL_NAME: Record<Material, string> = { concrete: 'Concrete', brick: 'Brick', mud: 'Mud brick', tin: 'Tin sheet', steel: 'Steel frame' };
