// Everything alive in the city that isn't in the estimate: boats and fishermen on the canal, people by the water at
// night, smokers at shop doors and hookah circles at the cafés, ducks, swans, dogs and cats, parked cars, buses and
// scooters, smoke from ovens, fires and generators, the red lights on the masts. One description of the scene at a
// moment, drawn by the flat map and built by the 3D model alike, so both always show the same thing.
import { buildingAt, inRect, riverX, rng, type Building, type Rect, type World } from '../jev';
import type { Wear } from './crowd';
import { soukScene, type GoodsKind } from './souk';

export interface SceneCtx {
  world: World;
  time: number;
  hour: number;
  night: number; // 0 day .. 1 night
  damaged: Set<number>;
  away: { x: number; y: number; r: number } | null; // near a strike, everything has gone
  brokenBridge: Rect | null;
}

export type Ent =
  | { t: 'boat'; x: number; y: number; a: number; len: number; hull: number; kind: 'moor' | 'fish' | 'row' | 'motor'; side: number; stroke: number }
  | { t: 'person'; x: number; y: number; face: number; id: number; wear?: Wear; sit?: boolean; smoke?: boolean; carry?: boolean }
  | { t: 'shed'; x: number; y: number; w: number; h: number; door: number } // door: the side it opens on, 0 N 1 E 2 S 3 W
  | { t: 'container'; x: number; y: number; w: number; h: number; col: string }
  | { t: 'forklift'; x: number; y: number; a: number; load: boolean }
  | { t: 'rod'; x: number; y: number; a: number; len: number; seed: number; z: number }
  | { t: 'stool' | 'bucket' | 'table'; x: number; y: number }
  | { t: 'hookah'; x: number; y: number; seed: number }
  | { t: 'glow'; x: number; y: number; r: number; a: number; col: string; z: number }
  | { t: 'duck'; x: number; y: number; a: number; s: number; drake: boolean; asleep: boolean }
  | { t: 'swan'; x: number; y: number; a: number }
  | { t: 'dog'; x: number; y: number; a: number; col: string; moving: boolean; lying: boolean }
  | { t: 'cat'; x: number; y: number; a: number; col: string; curled: boolean; z: number }
  | { t: 'car'; x: number; y: number; h: boolean; dir: 1 | -1; col: string }
  | { t: 'bus'; x: number; y: number; dir: 1 | -1; col: string; v?: boolean } // v: parked nose-in, north-south
  | { t: 'scooter'; x: number; y: number; a: number; col: string; sway: number }
  | { t: 'smoke'; x: number; y: number; z: number; seed: number; strength: number; dark: number; size: number; d3?: boolean } // d3: only the 3D model draws it (the map has its own)
  | { t: 'truck'; x: number; y: number; a: number; col: string; lorry: boolean; load: string; door: string; lean: number; smoke: number } // smoke < 0: parked, engine off // janky: odd door, a lean, a puff of exhaust
  | { t: 'fountain'; x: number; y: number; r: number }
  | { t: 'tarp'; x: number; y: number; a: number; col: string; size: number; mat: boolean }
  | { t: 'beast'; kind: 'goat' | 'chicken' | 'pigeon' | 'donkey'; x: number; y: number; a: number; col: string; moving: boolean; lying: boolean; cart?: boolean }
  | { t: 'junk'; x: number; y: number; size: number; seed: number }
  | { t: 'litter'; x: number; y: number; a: number; kind: 0 | 1 | 2; col: string } // 0 a can, 1 a plastic bottle, 2 a bag
  | { t: 'dump'; x: number; y: number; w: number; h: number }
  | { t: 'clutter'; kind: Clutter; x: number; y: number; a: number; col: string }
  | { t: 'beacon'; x: number; y: number; z: number; big: boolean }
  | { t: 'police'; x: number; y: number; h: boolean; dir: 1 | -1; flash: number } // flash: 0 off, 1 red, 2 blue
  | { t: 'engine'; x: number; y: number; h: boolean; dir: 1 | -1 }
  | { t: 'flag'; x: number; y: number; z: number; wave: number }
  | { t: 'fire'; x: number; y: number; size: number; flicker: number }
  | { t: 'post'; x: number; y: number; lit: boolean }
  | { t: 'antenna'; x: number; y: number; z: number; h: number }
  | { t: 'chair'; x: number; y: number; a: number }
  | { t: 'moon'; x: number; y: number; a: number }
  | { t: 'awning'; x: number; y: number; a: number; w: number; col: string }
  | { t: 'mark'; x: number; y: number; z: number; col: string; spin: number } // a folded paper tag over someone the mission wants you to find
  | { t: 'moto'; x: number; y: number; a: number; col: string; rider: boolean }
  | { t: 'letter'; x: number; y: number; z: number; a: number; tilt: number }
  | { t: 'bunting'; x0: number; y0: number; x1: number; y1: number; z: number; seed: number } // paper flags on a string, over the souk
  | { t: 'goods'; kind: GoodsKind; x: number; y: number; a: number; col: string; w: number; h: number; col2?: string; hang?: boolean; z?: number }; // the souk's wares (see souk.ts)

export type Clutter = 'drum' | 'gas' | 'jerry' | 'pallet' | 'tyres' | 'crate' | 'sacks' | 'skip' | 'wreck' | 'tyrepile' | 'cactus' | 'shrub' | 'pot' | 'bougain';

export const HULLS: [string, string, string][] = [
  ['#fbfaf6', '#e6e0d3', '#cfc7b6'], // white paper
  ['#eef1f2', '#d5dcdf', '#b9c3c8'], // pale blue
  ['#efe3cb', '#dac9a8', '#bfa982'], // kraft
  ['#f4e3dc', '#e2c7bc', '#c9a79a'], // pink
  ['#e9ecdf', '#d3d9c3', '#b7bfa2'], // sage
];
const CAR_COLS = ['#e7e2d8', '#6c8aa8', '#b8483a', '#2f2d2b', '#d9c9a3', '#8a9a7a', '#c9b24c', '#f4f2ec', '#9a9fa6'];

export const isDay = (h: number) => h >= 6 && h < 19.5;
const bell = (h: number, a: number, b: number) => (h >= a && h < b ? Math.sin(((h - a) / (b - a)) * Math.PI) : 0);

// ---------------------------------------------------------------- fixed parts, worked out once per city

interface Fixed {
  dogs: { x0: number; y0: number; x1: number; y1: number; col: string; speed: number; phase: number }[];
  cats: { x: number; y: number; a: number; col: string; z: number }[];
  bakeries: Building[];
  tents: Building[];
  gens: Building[];
  mill: Building | undefined;
  beacons: { x: number; y: number; z: number; b: Building; big: boolean }[];
  parked: { x: number; y: number; h: boolean; d: 1 | -1; col: string }[];
  scooters: { r: Rect; h: boolean; lane: number; speed: number; phase: number; col: string; dir: 1 | -1 }[];
  litter: { x: number; y: number; a: number; kind: 0 | 1 | 2; col: string }[];
  tarps: { x: number; y: number; a: number; col: string; size: number; mat: boolean; fire: boolean }[];
  goats: { cx: number; cy: number; n: number; seed: number }[];
  chickens: { x: number; y: number; n: number; seed: number }[];
  pigeons: { x: number; y: number; w: number; h: number; seed: number }[];
  donkeys: { r: Rect; h: boolean; speed: number; phase: number; dir: 1 | -1 }[];
  junk: { x: number; y: number; size: number; seed: number; smoulder: boolean }[];
  clutter: { kind: Clutter; x: number; y: number; a: number; col: string }[];
  trucks: { r: Rect; h: boolean; lane: number; speed: number; phase: number; col: string; dir: 1 | -1; lorry: boolean; load: string; door: string; lean: number }[];
  stacks: Building[];
  cafes: { x: number; y: number; evening: boolean; awn: number }[];
  smokers: { x: number; y: number; face: number; b: Building }[];
  services: { kind: 'police' | 'engine'; x: number; y: number; h: boolean; dir: 1 | -1; b: Building }[];
  flag: { x: number; y: number; z: number; b: Building } | null;
  fires: { x: number; y: number; size: number; camp: boolean }[];
  posts: { x: number; y: number }[];
  antennas: { x: number; y: number; z: number; h: number; b: Building }[];
}
let fixed: Fixed | null = null;
let fixedFor: World | null = null;

function makeFixed(w: World): Fixed {
  const r = rng(9091);
  const pickN = <T,>(xs: T[], n: number) => {
    const out: T[] = [];
    for (let i = 0; i < n && xs.length; i++) out.push(xs[Math.floor(r() * xs.length)]);
    return out;
  };
  const streets = w.roads.filter((rd) => rd.kind === 'street' && rd.rect.x < 1006);
  const long = streets.filter((rd) => Math.max(rd.rect.w, rd.rect.h) > 80);
  // Dogs trot a stretch of street and back.
  const dogs = pickN(streets, 8).map((rd, i) => {
    const s = rd.rect;
    const along = s.w > s.h;
    const len = 30 + r() * 40;
    const x0 = along ? s.x + r() * Math.max(1, s.w - len) : s.x + s.w * (0.25 + r() * 0.5);
    const y0 = along ? s.y + s.h * (0.25 + r() * 0.5) : s.y + r() * Math.max(1, s.h - len);
    return { x0, y0, x1: along ? x0 + len : x0, y1: along ? y0 : y0 + len, col: ['#b89a6a', '#6b5a48', '#d8c8a8', '#2f2a26'][i % 4], speed: 0.8 + r() * 0.8, phase: r() * 100 };
  });
  const homes = w.buildings.filter((b) => (b.kind === 'home' || b.kind === 'shop') && (b.district === 'oldtown' || b.district === 'quarter' || b.district === 'market'));
  const cats = pickN(homes, 16).map((b, i) => {
    const q = b.rects[0];
    const corner = Math.floor(r() * 4);
    return { x: q.x + (corner % 2 ? q.w - 0.4 : 0.4), y: q.y + (corner > 1 ? q.h - 0.4 : 0.4), a: r() * 6, col: ['#e3d6c0', '#2c2a2a', '#c07a3a', '#8d8d8a'][i % 4], z: b.h };
  });
  const shops = w.buildings.filter((b) => b.kind === 'shop' && (b.district === 'market' || b.district === 'oldtown' || b.district === 'quarter'));
  const beacons: Fixed['beacons'] = [];
  for (const b of w.buildings) {
    if (b.kind === 'mast') beacons.push({ x: b.cx, y: b.cy, z: b.h + 0.5, b, big: true });
    if (b.name === 'Tower 7') for (const q of b.rects) beacons.push({ x: q.x + 1, y: q.y + 1, z: b.h + 0.4, b, big: false }, { x: q.x + q.w - 1, y: q.y + q.h - 1, z: b.h + 0.4, b, big: false });
    if (b.kind === 'silo' && b.landmark) beacons.push({ x: b.cx, y: b.cy, z: b.h + 3.2, b, big: false });
    if (b.name === 'Power station stack') beacons.push({ x: b.cx, y: b.cy, z: b.h + 0.3, b, big: false });
  }
  const office = w.targets.find((t) => t.id === 'office');
  if (office?.buildingId != null) {
    const b = w.buildings[office.buildingId];
    beacons.push({ x: b.cx, y: b.cy, z: b.h + 8, b, big: true });
  }
  // Parked cars: along the kerbs of many streets (both sides, gaps between), along the boulevard, and in rows in the
  // mill yard and at the bus station's edge. Never in a junction, never inside anything.
  const clear = (x: number, y: number, self: Rect) => !w.roads.some((rd) => rd.rect !== self && inRect(rd.rect, x, y, 3)) && !buildingAt(w, x, y);
  const parked: Fixed['parked'] = [];
  const kerb = (q: Rect, side: number, from: number, to: number, keep: number) => {
    const h = q.w > q.h;
    for (let s = from; s < to; s += 5.2) {
      if (r() > keep) continue;
      const x = h ? q.x + s : q.x + q.w / 2 + side * (q.w / 2 - 1.3);
      const y = h ? q.y + q.h / 2 + side * (q.h / 2 - 1.3) : q.y + s;
      if (clear(x, y, q)) parked.push({ x, y, h, d: r() < 0.5 ? 1 : -1, col: CAR_COLS[Math.floor(r() * CAR_COLS.length)] });
    }
  };
  for (const rd of pickN(long, 34)) {
    const len = Math.max(rd.rect.w, rd.rect.h);
    const start = r() * Math.max(1, len - 90);
    kerb(rd.rect, r() < 0.5 ? -1 : 1, start, Math.min(len, start + 90), 0.72);
    if (r() < 0.4) kerb(rd.rect, r() < 0.5 ? -1 : 1, start, Math.min(len, start + 60), 0.6);
  }
  for (const rd of w.roads.filter((x) => x.kind === 'boulevard')) {
    const len = rd.rect.w;
    for (let s0 = 30; s0 < len - 30; s0 += 140) {
      kerb(rd.rect, -1, s0, s0 + 50, 0.7);
      kerb(rd.rect, 1, s0 + 60, s0 + 110, 0.7);
    }
  }
  for (const name of ['Mill yard']) {
    const lot = w.spaces.find((s) => s.name === name);
    if (!lot) continue;
    const q = lot.rect;
    for (let row = 0; row < 3; row++) for (let x = q.x + 4; x < q.x + q.w - 4; x += 3) if (r() < 0.72) parked.push({ x, y: q.y + 8 + row * 11, h: false, d: row % 2 ? 1 : -1, col: CAR_COLS[Math.floor(r() * CAR_COLS.length)] });
  }
  const scooters = pickN(long, 9).map((rd, i) => ({ r: rd.rect, h: rd.rect.w > rd.rect.h, lane: (r() < 0.5 ? -1 : 1) * (1 + r() * 1.5), speed: 6 + r() * 4, phase: r() * 1000, col: ['#c23b2e', '#2f5f8a', '#e0d6c2', '#1f1f22', '#5f8a4a'][i % 5], dir: (r() < 0.5 ? 1 : -1) as 1 | -1 }));
  // Hookah cafés: on the pavement by the souk, on the boulevard, and on the quay; one is busy in the afternoon too.
  const half = w.river.width / 2;
  const cafes = [
    { x: 588, y: 366, evening: false, awn: Math.PI / 2 },
    { x: 452, y: 362, evening: true, awn: Math.PI / 2 },
    { x: riverX(500) - half - 7, y: 500, evening: true, awn: Math.PI },
    { x: riverX(640) + half + 7, y: 640, evening: true, awn: 0 },
  ];
  // Smokers at shop doors: someone stepping out for a cigarette.
  const smokers = pickN(shops, 10).map((b) => {
    const q = b.rects[0];
    const side = Math.floor(r() * 4);
    const u = 0.3 + r() * 0.4;
    const x = side === 0 || side === 2 ? q.x + q.w * u : side === 1 ? q.x + q.w + 1 : q.x - 1;
    const y = side === 1 || side === 3 ? q.y + q.h * u : side === 0 ? q.y - 1 : q.y + q.h + 1;
    const face = side === 0 ? -Math.PI / 2 : side === 1 ? 0 : side === 2 ? Math.PI / 2 : Math.PI;
    return { x, y, face, b };
  });
  // The police station's patrol cars and the fire station's engines, parked on the street side of each; the flag on City Hall.
  const byName = (n: string) => w.buildings.find((b) => b.name === n);
  const services: Fixed['services'] = [];
  const front = (b: Building) => {
    // The side facing the nearest street, and a point just outside it.
    let best: { d: number; x: number; y: number; h: boolean } | null = null;
    for (const rd of w.roads) {
      if (rd.kind === 'bridge') continue;
      const q = rd.rect;
      const x = Math.max(q.x, Math.min(q.x + q.w, b.cx));
      const y = Math.max(q.y, Math.min(q.y + q.h, b.cy));
      const d = Math.hypot(x - b.cx, y - b.cy);
      if (!best || d < best.d) best = { d, x, y, h: q.w > q.h };
    }
    return best!;
  };
  const ps = byName('Police Station');
  if (ps) {
    const f = front(ps);
    for (let i = 0; i < 2; i++) services.push({ kind: 'police', x: f.h ? ps.cx - 3 + i * 6 : f.x + (f.x > ps.cx ? -2.5 : 2.5), y: f.h ? f.y + (f.y > ps.cy ? -2.5 : 2.5) : ps.cy - 3 + i * 6, h: f.h, dir: i ? 1 : -1, b: ps });
  }
  const fs = byName('Fire Station');
  if (fs) {
    const f = front(fs);
    for (let i = 0; i < 2; i++) services.push({ kind: 'engine', x: f.h ? fs.cx - 5 + i * 10 : f.x + (f.x > fs.cx ? -3 : 3), y: f.h ? f.y + (f.y > fs.cy ? -3 : 3) : fs.cy - 5 + i * 10, h: f.h, dir: 1, b: fs });
  }
  const hall = byName('City Hall');
  const flag = hall ? { x: hall.rects[0].x + 2, y: hall.rects[0].y + hall.rects[0].h - 2, z: hall.h, b: hall } : null;
  // Fire pits: among the camp's tents, at the desert outpost, oil drums burning on Tin Hill.
  const fires: Fixed['fires'] = [];
  const tentsAll = w.buildings.filter((b) => b.kind === 'tent');
  for (let i = 0; i < Math.min(5, tentsAll.length); i++) {
    const tb = tentsAll[Math.floor(r() * tentsAll.length)];
    const q = tb.rects[0];
    fires.push({ x: q.x + q.w + 2.5, y: q.y + q.h / 2, size: 1, camp: true });
  }
  const barracks = w.buildings.find((b) => b.kind === 'barracks');
  if (barracks) fires.push({ x: barracks.cx, y: barracks.rects[0].y + barracks.rects[0].h + 8, size: 1.2, camp: false });
  const tin = w.buildings.filter((b) => b.district === 'tinhill');
  for (let i = 0; i < 3 && tin.length; i++) {
    const tb = tin[Math.floor(r() * tin.length)];
    fires.push({ x: tb.rects[0].x - 2.2, y: tb.cy, size: 0.6, camp: false });
  }
  // Lamp posts light the car parks and forecourts: the bus station, the school yards, the hospital, City Hall, the police, the mill yard.
  const posts: Fixed['posts'] = [];
  const ring = (q: Rect, n: number) => {
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      posts.push({ x: q.x + q.w * u, y: i % 2 ? q.y + 1 : q.y + q.h - 1 });
    }
  };
  for (const name of ['Bus Station', 'School yard', 'North School yard', 'Office forecourt', 'Mill yard']) {
    const sp = w.spaces.find((x) => x.name === name);
    if (sp) ring(sp.rect, name === 'Bus Station' ? 6 : 3);
  }
  for (const b of [byName('City Hospital'), hall, ps].filter(Boolean) as Building[]) {
    const f = front(b);
    posts.push({ x: f.x + (f.h ? -8 : 0), y: f.y + (f.h ? 0 : -8) }, { x: f.x + (f.h ? 8 : 0), y: f.y + (f.h ? 0 : 8) });
  }
  // Antennas with a red light on top: Tower 7's radio mast, the hospital's, and a few on the tallest blocks.
  const antennas: Fixed['antennas'] = [];
  const t7 = byName('Tower 7');
  if (t7) antennas.push({ x: t7.cx, y: t7.cy, z: t7.h, h: 14, b: t7 });
  const hosp = byName('City Hospital');
  if (hosp) antennas.push({ x: hosp.rects[2]?.x ?? hosp.cx, y: hosp.cy, z: hosp.h, h: 7, b: hosp });
  const tall = w.buildings.filter((b) => b.kind === 'apartment' && b.floors >= 5 && b.name !== 'Tower 7').sort((a, b) => b.h - a.h);
  for (const b of tall.slice(0, 40).filter((_, i) => i % 9 === 0)) antennas.push({ x: b.rects[0].x + 2, y: b.rects[0].y + 2, z: b.h, h: 5 + r() * 3, b });
  // Pickups and small lorries: bread, gas bottles, crates of vegetables, building sand. Busy by day, a couple at night.
  const trucks = pickN(long, 10).map((rd, i) => ({
    r: rd.rect,
    h: rd.rect.w > rd.rect.h,
    lane: (r() < 0.5 ? -1 : 1) * 2.2,
    speed: 4 + r() * 3,
    phase: r() * 1000,
    col: ['#e9e4d8', '#c9b24c', '#6c8aa8', '#b8483a', '#8a9a7a'][i % 5],
    dir: (r() < 0.5 ? 1 : -1) as 1 | -1,
    lorry: i % 3 === 0,
    load: ['#7fa3b8', '#c99a5e', '#8fa86a', '#e0cfa8', '#d0d4d6'][i % 5],
    door: ['#8a4a2a', '#d9d4c8', '#3f6a4a', '#6c8aa8', '#c9b24c'][(i + 2) % 5], // a door off another truck
    lean: (r() - 0.5) * 0.09,
  }));
  // Yard clutter along the walls: what each kind of place leaves outside its door.
  const clutter: Fixed['clutter'] = [];
  const onRoad = (x: number, y: number) => w.roads.some((rd) => inRect(rd.rect, x, y, 0.8));
  const drumCol = () => ['#2f5f8a', '#8a4a2a', '#c9a44c', '#3f6a4a', '#7a2a22'][Math.floor(r() * 5)];
  const beside = (b: Building, n: number, make: (x: number, y: number, a: number, k: number) => void) => {
    const q = b.rects[0];
    const side = Math.floor(r() * 4);
    const u = 0.15 + r() * 0.6;
    const out0 = 1.1;
    const bx = side === 0 || side === 2 ? q.x + q.w * u : side === 1 ? q.x + q.w + out0 : q.x - out0;
    const by = side === 1 || side === 3 ? q.y + q.h * u : side === 0 ? q.y - out0 : q.y + q.h + out0;
    const along = side === 0 || side === 2;
    for (let k = 0; k < n; k++) {
      const x = bx + (along ? k * 0.9 : 0);
      const y = by + (along ? 0 : k * 0.9);
      if (buildingAt(w, x, y) || onRoad(x, y)) continue;
      make(x, y, along ? 0 : Math.PI / 2, k);
    }
  };
  const add = (kind: Clutter, x: number, y: number, a: number, col = '#999') => clutter.push({ kind, x, y, a, col });
  for (const b of w.buildings) {
    if (b.rects[0].w < 4 || b.rects[0].h < 4) continue;
    const works = b.kind === 'workshop' || b.kind === 'warehouse' || b.kind === 'factory';
    const shop = b.kind === 'shop';
    const poor = b.district === 'tinhill' || b.district === 'camp';
    const roll = r();
    if (works && roll < 0.7) {
      const pick = r();
      if (pick < 0.45) beside(b, 2 + Math.floor(r() * 3), (x, y, a) => add('drum', x, y, a, drumCol()));
      else if (pick < 0.65) beside(b, 1 + Math.floor(r() * 2), (x, y, a) => add('pallet', x, y, a));
      else if (pick < 0.85) beside(b, 1, (x, y, a) => add('tyres', x, y, a));
      else beside(b, 2, (x, y, a) => add('crate', x, y, a, '#b08a5e'));
    } else if (shop && roll < 0.5) {
      const pick = r();
      if (pick < 0.4) beside(b, 2 + Math.floor(r() * 2), (x, y, a) => add('crate', x, y, a, ['#b08a5e', '#3a7a9a', '#c24a3a'][Math.floor(r() * 3)]));
      else if (pick < 0.7) beside(b, 2 + Math.floor(r() * 2), (x, y, a) => add('gas', x, y, a, ['#d0d4d6', '#2f5f8a', '#c9a44c'][Math.floor(r() * 3)]));
      else beside(b, 2, (x, y, a) => add('sacks', x, y, a, '#e0d2b0'));
    } else if (poor && roll < 0.35) {
      if (r() < 0.55) beside(b, 2 + Math.floor(r() * 3), (x, y, a) => add('jerry', x, y, a, ['#e0c64a', '#e9e4d8', '#3a7a9a'][Math.floor(r() * 3)]));
      else beside(b, 1 + Math.floor(r() * 2), (x, y, a) => add('drum', x, y, a, drumCol()));
    } else if ((b.kind === 'home' || b.kind === 'apartment') && roll < 0.06) {
      beside(b, 1, (x, y, a) => add(r() < 0.5 ? 'gas' : 'tyres', x, y, a, '#d0d4d6'));
    }
  }
  // Broken-down cars left where they died: on the kerbs of back streets and in the yards, rusting, no wheels.
  for (const rd of pickN(streets, 22)) {
    const q = rd.rect;
    const h = q.w > q.h;
    const d = 8 + r() * Math.max(1, (h ? q.w : q.h) - 16);
    const side = r() < 0.5 ? -1 : 1;
    const x = h ? q.x + d : q.x + q.w / 2 + side * (q.w / 2 - 1.3);
    const y = h ? q.y + q.h / 2 + side * (q.h / 2 - 1.3) : q.y + d;
    if (!buildingAt(w, x, y) && !w.roads.some((o) => o !== rd && inRect(o.rect, x, y, 3))) add('wreck', x, y, h ? 0 : Math.PI / 2, ['#8a5a3e', '#6f6a60', '#9a7a5a', '#5a5f66'][Math.floor(r() * 4)]);
  }
  for (const b of w.buildings) {
    if (!(b.kind === 'workshop' || (b.district === 'tinhill' && b.kind !== 'shop')) || r() > 0.08) continue;
    beside(b, 1, (x, y, a) => add(r() < 0.5 ? 'wreck' : 'tyrepile', x + (a ? 1.5 : 0), y + (a ? 0 : 1.5), a + (r() - 0.5) * 0.4, ['#8a5a3e', '#6f6a60', '#9a7a5a'][Math.floor(r() * 3)]));
  }
  // Plants of the region: bougainvillea over the walls of homes and villas, potted plants by the doors,
  // prickly pear on Tin Hill, at the camp's edge and by the groves, oleander along the boulevard.
  for (const b of w.buildings) {
    const home = b.kind === 'home' || b.kind === 'villa';
    if (home && (b.district === 'garden' || b.district === 'oldtown' || b.district === 'quarter') && r() < 0.13) beside(b, 1, (x, y, a) => add('bougain', x, y, a, r() < 0.7 ? '#c2327a' : '#e0703a'));
    else if (home && r() < 0.09) beside(b, 1 + Math.floor(r() * 2), (x, y, a) => add('pot', x, y, a, r() < 0.5 ? '#c47a5a' : '#6f8a96'));
    else if ((b.district === 'tinhill' || b.district === 'camp' || b.district === 'groves') && r() < 0.07) beside(b, 1, (x, y, a) => add('cactus', x, y, a, '#6f8f4a'));
  }
  for (let x = 30; x < 990; x += 46) {
    if (Math.abs(x - 745) < 60 || Math.abs(x - 360) < 30) continue;
    add('shrub', x + (r() - 0.5) * 6, 350, 0, r() < 0.6 ? '#e07a9a' : '#f4f2ec');
  }
  // A skip at some street corners, a stack of drums by the depot and the power station.
  for (const rd of pickN(streets, 26)) {
    const q = rd.rect;
    const x = q.w > q.h ? q.x + 6 : q.x - 1.4;
    const y = q.w > q.h ? q.y - 1.4 : q.y + 6;
    if (!buildingAt(w, x, y) && !onRoad(x, y)) add('skip', x, y, q.w > q.h ? 0 : Math.PI / 2, ['#3f6a4a', '#2f5f8a', '#6a6560'][Math.floor(r() * 3)]);
  }
  for (const name of ['Fuel Depot', 'Power Station']) {
    const b = w.buildings.find((x) => x.name === name);
    if (!b) continue;
    const q = b.rects[0];
    for (let i = 0; i < 8; i++) {
      const x = q.x + q.w + 3 + (i % 4) * 0.9;
      const y = q.y + 2 + Math.floor(i / 4) * 0.9;
      if (!buildingAt(w, x, y) && !onRoad(x, y)) add('drum', x, y, 0, i % 3 ? '#8a4a2a' : '#2f5f8a');
    }
  }
  // Junk: the landfill out in the desert past Tin Hill, mounds of everything the city throws away, a few always
  // smouldering; and smaller heaps where they collect in town, on waste ground by Tin Hill, the camp and the works.
  const junk: Fixed['junk'] = [];
  const DUMP = { x: 1050, y: 560, w: 120, h: 100 };
  for (let i = 0; i < 26; i++) {
    const x = DUMP.x + 8 + r() * (DUMP.w - 16);
    const y = DUMP.y + 8 + r() * (DUMP.h - 16);
    junk.push({ x, y, size: 3 + r() * 5, seed: r() * 1000, smoulder: i % 6 === 0 });
  }
  const rough = w.buildings.filter((b) => b.district === 'tinhill' || b.district === 'camp' || b.district === 'workshops' || b.district === 'kilns');
  for (let i = 0; i < 70 && junk.length < 60; i++) {
    const b = rough[Math.floor(r() * rough.length)];
    const q = b.rects[0];
    const a = r() * Math.PI * 2;
    const x = b.cx + Math.cos(a) * (Math.max(q.w, q.h) / 2 + 3 + r() * 3);
    const y = b.cy + Math.sin(a) * (Math.max(q.w, q.h) / 2 + 3 + r() * 3);
    if (buildingAt(w, x, y) || onRoad(x, y) || w.spaces.some((sp) => inRect(sp.rect, x, y))) continue;
    junk.push({ x, y, size: 0.9 + r() * 1.1, seed: r() * 1000, smoulder: r() < 0.08 });
  }
  // A few bigger heaps just outside town: on the desert edge, by the railway, south of the Kilnworks.
  for (const [x, y] of [[1020, 300], [1030, 480], [1015, 820], [60, 880], [480, 885], [300, 868]]) {
    if (!buildingAt(w, x, y) && !onRoad(x, y)) junk.push({ x, y, size: 2.2 + r() * 1.6, seed: r() * 1000, smoulder: r() < 0.4 });
  }
  // Makeshift shelters of blue tarp over a pole, a mat or flattened cardboard under them: on the canal banks under
  // the bridges, along the edge of the landfill, on waste ground at the edges of Tin Hill and the camp.
  const tarps: Fixed['tarps'] = [];
  const free = (x: number, y: number) => !buildingAt(w, x, y) && !onRoad(x, y) && !w.spaces.some((sp) => inRect(sp.rect, x, y));
  const tarpCol = () => (r() < 0.7 ? ['#2f6fb0', '#3a82c4', '#255a93'][Math.floor(r() * 3)] : ['#6f7a5a', '#8a7a5c', '#9aa0a3'][Math.floor(r() * 3)]);
  const halfW = w.river.width / 2;
  for (const by of [115, 350, 580]) {
    for (const side of [-1, 1]) {
      const x = riverX(by) + side * (halfW + 2.5);
      for (const dy of [-9, 9]) tarps.push({ x, y: by + dy, a: Math.PI / 2, col: tarpCol(), size: 0.9 + r() * 0.3, mat: true, fire: r() < 0.5 });
    }
  }
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2;
    const x = 1110 + Math.cos(a) * 68;
    const y = 610 + Math.sin(a) * 58;
    if (free(x, y)) tarps.push({ x, y, a: a + Math.PI / 2, col: tarpCol(), size: 1 + r() * 0.4, mat: r() < 0.6, fire: r() < 0.4 });
  }
  const edge = w.buildings.filter((b) => b.district === 'tinhill' || b.district === 'camp');
  for (let i = 0; i < 60 && tarps.length < 40; i++) {
    const b = edge[Math.floor(r() * edge.length)];
    const a = r() * Math.PI * 2;
    const x = b.cx + Math.cos(a) * 9;
    const y = b.cy + Math.sin(a) * 9;
    if (free(x, y) && free(x + 2, y) && free(x - 2, y)) tarps.push({ x, y, a: r() * Math.PI, col: tarpCol(), size: 0.8 + r() * 0.4, mat: r() < 0.5, fire: r() < 0.2 });
  }
  // Strays and the animals people keep: goats wandering the waste ground, hens scratching by the Tin Hill and camp
  // homes, pigeons on the squares, a few donkeys pulling carts through the older streets; and more dogs, in packs.
  const goats: Fixed['goats'] = [
    { cx: 960, cy: 600, n: 6, seed: 1 },
    { cx: 1090, cy: 680, n: 5, seed: 2 },
    { cx: 930, cy: 830, n: 7, seed: 3 },
    { cx: 1030, cy: 470, n: 4, seed: 4 },
  ];
  const chickens: Fixed['chickens'] = [];
  for (let i = 0; i < 40 && chickens.length < 14; i++) {
    const b = edge[Math.floor(r() * edge.length)];
    const x = b.rects[0].x + b.rects[0].w + 2;
    const y = b.cy;
    if (free(x, y)) chickens.push({ x, y, n: 3 + Math.floor(r() * 4), seed: r() * 100 });
  }
  const pigeons: Fixed['pigeons'] = w.spaces.filter((sp) => sp.kind === 'plaza' || sp.kind === 'market' || sp.kind === 'courtyard').map((sp) => ({ ...sp.rect, seed: sp.id }));
  const old = w.roads.filter((rd) => rd.kind === 'street' && rd.rect.x > 470 && rd.rect.x < 1006 && Math.max(rd.rect.w, rd.rect.h) > 60);
  const donkeys: Fixed['donkeys'] = pickN(old, 4).map((rd) => ({ r: rd.rect, h: rd.rect.w > rd.rect.h, speed: 1 + r() * 0.5, phase: r() * 1000, dir: (r() < 0.5 ? 1 : -1) as 1 | -1 }));
  // More dogs: packs of two or three sharing a route, a little apart.
  for (const rd of pickN(streets, 7)) {
    const s2 = rd.rect;
    const along = s2.w > s2.h;
    const len = 40 + r() * 50;
    const x0 = along ? s2.x + r() * Math.max(1, s2.w - len) : s2.x + s2.w * 0.5;
    const y0 = along ? s2.y + s2.h * 0.5 : s2.y + r() * Math.max(1, s2.h - len);
    const speed = 0.9 + r() * 0.6;
    const phase = r() * 100;
    for (let k = 0; k < 2 + Math.floor(r() * 2); k++) dogs.push({ x0: x0 + (along ? -k * 1.6 : k * 0.8), y0: y0 + (along ? k * 0.8 : -k * 1.6), x1: (along ? x0 + len : x0) + (along ? -k * 1.6 : k * 0.8), y1: (along ? y0 : y0 + len) + (along ? k * 0.8 : -k * 1.6), col: ['#b89a6a', '#6b5a48', '#d8c8a8', '#2f2a26', '#a07a4a'][Math.floor(r() * 5)], speed, phase });
  }
  // And cats down at street level: round the skips and the junk, by the souk.
  for (let i = 0; i < 18; i++) {
    const b = w.buildings[Math.floor(r() * w.buildings.length)];
    if (!(b.district === 'market' || b.district === 'oldtown' || b.district === 'quarter' || b.district === 'tinhill')) continue;
    const x = b.rects[0].x - 0.8;
    const y = b.cy + (r() - 0.5) * 4;
    if (free(x, y)) cats.push({ x, y, a: r() * 6, col: ['#e3d6c0', '#2c2a2a', '#c07a3a', '#8d8d8a', '#f4f2ec'][i % 5], z: 0 });
  }
  // Litter: cans, plastic bottles and bags blown round every heap, along the waste ground and the landfill track.
  const litter: Fixed['litter'] = [];
  const lcol = (k: number) => (k === 0 ? ['#c9c9cc', '#c23b2e', '#2f5f8a', '#e0c64a', '#3f6a4a'] : k === 1 ? ['#9ec4d8', '#d6e6ee', '#3a82c4', '#6fa86a'] : ['#f4f2ec', '#2a2826', '#3a82c4', '#e0cfa8'])[Math.floor(r() * 4)];
  const drop = (x: number, y: number) => {
    if (!free(x, y)) return;
    const kind = Math.floor(r() * 3) as 0 | 1 | 2;
    litter.push({ x, y, a: r() * Math.PI * 2, kind, col: lcol(kind) });
  };
  for (const j of junk) for (let k = 0; k < 4 + j.size * 2; k++) {
    const a = r() * Math.PI * 2;
    const d = j.size * (0.9 + r() * 0.9);
    drop(j.x + Math.cos(a) * d, j.y + Math.sin(a) * d * 0.85);
  }
  for (let i = 0; i < 260; i++) {
    const b = rough[Math.floor(r() * rough.length)];
    const a = r() * Math.PI * 2;
    const d = Math.max(b.rects[0].w, b.rects[0].h) / 2 + 1 + r() * 5;
    drop(b.cx + Math.cos(a) * d, b.cy + Math.sin(a) * d);
  }
  for (let x = 1006; x < 1050; x += 2.5) if (r() < 0.5) drop(x, 612 + (r() - 0.5) * 10);
  return {
    litter,
    tarps,
    goats,
    chickens,
    pigeons,
    donkeys,
    junk,
    clutter,
    trucks,
    stacks: w.buildings.filter((b) => b.kind === 'chimney'),
    services,
    flag,
    fires,
    posts,
    antennas,
    dogs,
    cats,
    bakeries: pickN(shops, 4),
    tents: pickN(
      w.buildings.filter((b) => b.kind === 'tent'),
      5,
    ),
    gens: pickN(
      w.buildings.filter((b) => (b.kind === 'home' || b.kind === 'shack') && b.district === 'tinhill'),
      4,
    ),
    mill: w.buildings.find((b) => b.name === 'Flour Mill'),
    beacons,
    parked,
    scooters,
    cafes,
    smokers,
  };
}

// ---------------------------------------------------------------- the scene at a moment

function onRiver(c: SceneCtx, speed: number, phase: number, lane: number, down: boolean) {
  const span = c.world.h + 200;
  const u = ((c.time * speed + phase) % span) - 100;
  const y = down ? u : c.world.h - u;
  const s = down ? 1 : -1;
  const x = riverX(y) + lane;
  const dx = riverX(y + s) - riverX(y);
  return { x, y, a: Math.atan2(dx, -s) };
}

// Anything else that wants to be in the scene (the secret mission's people) adds itself here.
const extras: ((c: SceneCtx) => Ent[])[] = [];
export function addSceneExtra(f: (c: SceneCtx) => Ent[]) {
  if (!extras.includes(f)) extras.push(f);
}

export function lifeScene(c: SceneCtx): Ent[] {
  if (fixedFor !== c.world) {
    fixedFor = c.world;
    fixed = makeFixed(c.world);
  }
  const F = fixed!;
  const out: Ent[] = [];
  const t = c.time;
  const h = ((c.hour % 24) + 24) % 24;
  const day = isDay(h);
  const half = c.world.river.width / 2;
  const far = (x: number, y: number) => !c.away || Math.hypot(x - c.away.x, y - c.away.y) > c.away.r;
  const underBridge = (y: number) => c.world.roads.some((r) => r.kind === 'bridge' && Math.abs(r.rect.y + r.rect.h / 2 - y) < r.rect.h / 2 + 4);
  const onBroken = (x: number, y: number) => !!c.brokenBridge && inRect(c.brokenBridge, x, y, 2);
  const alive = (b: Building | null | undefined) => !!b && !c.damaged.has(b.id) && far(b.cx, b.cy);
  const cut = c.world.buildings.some((b) => b.name === 'Power Station' && c.damaged.has(b.id));
  const glow = (x: number, y: number, r: number, a: number, z = 1.2, col = '255,205,120') => out.push({ t: 'glow', x, y, r, a, col, z });

  // ---- on the water
  [60, 180, 262, 452, 520, 668, 750, 850].forEach((y, i) => {
    if (underBridge(y)) return;
    const side = i % 2 ? 1 : -1;
    const x = riverX(y) + side * (half - 2.4);
    out.push({ t: 'boat', x, y, a: Math.sin(t * 0.8 + i) * 0.04 + (i % 3) * 0.05 - 0.05, len: 5.5 + (i % 3), hull: i % HULLS.length, kind: 'moor', side, stroke: 0 });
    if (c.night > 0.5 && i % 3 === 0) glow(x, y - 1, 3, 0.35 * c.night, 1.2);
  });
  (
    [
      [300, -6, 1],
      [640, 5, 2],
      [120, 4, 3],
    ] as const
  ).forEach(([y, lane, s], i) => {
    if ((!day && i > 0) || underBridge(y)) return;
    const x = riverX(y) + lane;
    if (!far(x, y)) return;
    out.push({ t: 'boat', x, y, a: 0.15 + Math.sin(t * 0.6 + s) * 0.08, len: 6, hull: (i + 2) % HULLS.length, kind: 'fish', side: 0, stroke: 0 });
    const face = lane < 0 ? Math.PI : 0;
    out.push({ t: 'person', x, y: y + 0.6, face, id: 20 + i, sit: true });
    out.push({ t: 'rod', x: x + Math.cos(face) * 0.6, y: y + 0.6, a: face + 0.3, len: 6.5, seed: s * 3, z: 1.2 });
    if (!day) glow(x, y - 1.3, 4, 0.55 * c.night, 1.4);
  });
  if (day)
    for (let i = 0; i < 2; i++) {
      const { x, y, a } = onRiver(c, 0.9 + i * 0.2, 250 + i * 520, i ? 7 : -8, i === 0);
      if (underBridge(y) || !far(x, y)) continue;
      out.push({ t: 'boat', x, y, a, len: 5, hull: (i + 3) % HULLS.length, kind: 'row', side: 0, stroke: Math.sin(t * 2.2 + i) });
      out.push({ t: 'person', x, y, face: a + Math.PI / 2, id: 30 + i, sit: true });
    }
  for (let i = 0; i < (day ? 2 : 1); i++) {
    const { x, y, a } = onRiver(c, 2.4 + i * 0.4, 40 + i * 700, i ? -3 : 3, i === 1);
    if (underBridge(y) || !far(x, y)) continue;
    out.push({ t: 'boat', x, y, a, len: 7, hull: (i + 1) % HULLS.length, kind: 'motor', side: 0, stroke: 0 });
    if (!day) glow(x, y, 3.5, 0.5 * c.night, 1.3);
  }

  // The moon on the water: its reflection, trembling in the canal, after dusk.
  if (c.night > 0.4 && !underBridge(430)) out.push({ t: 'moon', x: riverX(430) + 3, y: 430, a: Math.min(1, (c.night - 0.4) * 2.5) });

  // ---- by the water
  const r = rng(424242);
  if (day) {
    [90, 150, 230, 400, 480, 560, 700, 820].forEach((y, i) => {
      if (underBridge(y)) return;
      const side = i % 2 ? 1 : -1;
      const x = riverX(y) + side * (half + 1.2);
      if (!far(x, y)) return;
      const face = side > 0 ? Math.PI : 0;
      if (i % 3 === 0) out.push({ t: 'stool', x, y: y + 0.8 });
      out.push({ t: 'bucket', x: x + side * 0.2, y: y + 1.3 });
      out.push({ t: 'person', x, y, face, id: i, sit: i % 3 === 0 });
      out.push({ t: 'rod', x: x - side * 0.5, y, a: face + (r() - 0.5) * 0.5, len: 6 + r() * 2, seed: i * 5, z: 1.1 });
    });
    for (const rd of c.world.roads) {
      if (rd.kind !== 'bridge' || rd.name === 'Camp footbridge') continue;
      const q = rd.rect;
      if (c.brokenBridge && inRect(c.brokenBridge, q.x + q.w / 2, q.y + q.h / 2)) continue;
      const rx = riverX(q.y + q.h / 2);
      for (let k = 0; k < 3; k++) {
        const x = rx - 10 + k * 9 + (r() - 0.5) * 3;
        const south = (k + Math.round(q.y)) % 2 === 0;
        const y = south ? q.y + q.h - 0.6 : q.y + 0.6;
        if (!far(x, y)) continue;
        const face = south ? Math.PI / 2 : -Math.PI / 2;
        out.push({ t: 'person', x, y, face, id: 40 + k + Math.round(q.y) });
        out.push({ t: 'rod', x, y, a: face, len: 7 + r() * 3, seed: k * 3 + q.y, z: 1.5 });
      }
    }
  } else {
    [210, 540, 760].forEach((y, i) => {
      if (underBridge(y)) return;
      const side = i % 2 ? -1 : 1;
      const x = riverX(y) + side * (half + 2.5);
      if (!far(x, y)) return;
      glow(x, y, 5, 0.6 * c.night, 0.5);
      for (let k = 0; k < 3; k++) {
        const ang = (k / 3) * Math.PI * 2 + i;
        out.push({ t: 'person', x: x + Math.cos(ang) * 1.3, y: y + Math.sin(ang) * 1.3, face: ang + Math.PI, id: 60 + i * 3 + k, sit: true, smoke: k === 1 });
      }
    });
    const nb = c.world.roads.find((rd) => rd.kind === 'bridge' && rd.name !== 'Camp footbridge' && !(c.brokenBridge && inRect(c.brokenBridge, rd.rect.x + rd.rect.w / 2, rd.rect.y + rd.rect.h / 2)));
    if (nb) {
      const x = riverX(nb.rect.y) + 4;
      const y = nb.rect.y + nb.rect.h - 0.6;
      if (far(x, y)) {
        out.push({ t: 'person', x, y, face: Math.PI / 2, id: 70 });
        out.push({ t: 'rod', x, y, a: Math.PI / 2, len: 8, seed: 70, z: 1.5 });
        glow(x + 0.8, y - 0.4, 3, 0.55 * c.night, 1.4);
      }
    }
    const walk = (t * 0.9) % 400;
    for (const d of [0, 1.1]) {
      const y = 100 + walk + d;
      if (!underBridge(y)) out.push({ t: 'person', x: riverX(y) - half - 3 - d * 0.8, y, face: Math.PI / 2, id: 80 + Math.round(d) });
    }
  }

  // ---- the town's services
  const blink = Math.floor(t * 2.5) % 2;
  for (const v of F.services) {
    if (!alive(v.b) || !far(v.x, v.y)) continue;
    if (v.kind === 'police') out.push({ t: 'police', x: v.x, y: v.y, h: v.h, dir: v.dir, flash: c.night > 0.4 && v.dir > 0 ? 1 + ((blink + (v.x > 0 ? 0 : 1)) % 2) : 0 });
    else out.push({ t: 'engine', x: v.x, y: v.y, h: v.h, dir: v.dir });
  }
  if (F.flag && alive(F.flag.b) && day) out.push({ t: 'flag', x: F.flag.x, y: F.flag.y, z: F.flag.z, wave: Math.sin(t * 2.3) });
  // Fire pits after dark (and the camp's at dawn, for breakfast), oil drums on Tin Hill in the small hours.
  for (const f of F.fires) {
    const on = f.camp ? h >= 18 || h < 7 : h >= 19 || h < 6;
    if (!on || !far(f.x, f.y)) continue;
    out.push({ t: 'fire', x: f.x, y: f.y, size: f.size, flicker: Math.sin(t * 9 + f.x) * 0.5 + Math.sin(t * 13 + f.y) * 0.5 });
    if (f.camp) for (let k = 0; k < 3; k++) {
      const ang = (k / 3) * Math.PI * 2 + f.x;
      out.push({ t: 'person', x: f.x + Math.cos(ang) * 2, y: f.y + Math.sin(ang) * 2, face: ang + Math.PI, id: 200 + Math.round(f.x) + k, sit: true });
    }
  }
  for (const p of F.posts) if (far(p.x, p.y)) out.push({ t: 'post', x: p.x, y: p.y, lit: !cut && c.night > 0.25 });
  for (const a of F.antennas) {
    if (!alive(a.b)) continue;
    out.push({ t: 'antenna', x: a.x, y: a.y, z: a.z, h: a.h });
    if (!cut && Math.sin(t * 2.4 + a.x * 0.3) > 0.1) out.push({ t: 'beacon', x: a.x, y: a.y, z: a.z + a.h, big: a.h > 10 });
  }

  // ---- cafés and smokers: a hookah circle at the café tables, someone out for a cigarette at a shop door
  F.cafes.forEach((cf, i) => {
    const open = cf.evening ? h >= 16 || h < 1 : h >= 12 || h < 1;
    if (!open || !far(cf.x, cf.y) || onBroken(cf.x, cf.y)) return;
    out.push({ t: 'table', x: cf.x, y: cf.y });
    out.push({ t: 'hookah', x: cf.x, y: cf.y, seed: i * 3.3 });
    out.push({ t: 'awning', x: cf.x + Math.cos(cf.awn) * 3.2, y: cf.y + Math.sin(cf.awn) * 3.2, a: cf.awn, w: 6, col: ['#b8574a', '#2e6f73', '#c9a44c', '#3a5f9a'][i % 4] });
    const n = 3 + (i % 2);
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * Math.PI * 2 + i;
      out.push({ t: 'chair', x: cf.x + Math.cos(ang) * 1.6, y: cf.y + Math.sin(ang) * 1.6, a: ang });
      out.push({ t: 'person', x: cf.x + Math.cos(ang) * 1.5, y: cf.y + Math.sin(ang) * 1.5, face: ang + Math.PI, id: 100 + i * 5 + k, sit: true, smoke: k === Math.floor((t / 6 + i) % n) });
    }
    if (c.night > 0.3) glow(cf.x, cf.y, 4.5, 0.5 * c.night, 1.6);
  });
  if (h >= 7 && h < 24)
    F.smokers.forEach((s, i) => {
      // Each steps out now and then: a few minutes by the door, then back inside.
      if (Math.sin(t / 40 + i * 1.7) < 0.1 || !alive(s.b)) return;
      out.push({ t: 'person', x: s.x, y: s.y, face: s.face, id: 140 + i, smoke: true });
    });

  // ---- animals
  (
    [
      [240, 1, 5, 0.5],
      [590, -1, 4, 0.4],
      [760, 1, 6, 0.55],
    ] as const
  ).forEach(([y0, side, n, speed], f) => {
    let hx: number, hy: number, a: number;
    if (day) {
      const span = 180;
      const u = (t * speed + f * 60) % (span * 2);
      const back = u > span;
      const y = y0 + (back ? span * 2 - u : u) - span / 2;
      hx = riverX(y) + side * (half - 4 - Math.sin(t * 0.3 + f) * 1.5);
      hy = y;
      a = back ? 0 : Math.PI;
    } else {
      hx = riverX(y0) + side * (half - 1.5);
      hy = y0;
      a = 0;
    }
    if (underBridge(hy) || !far(hx, hy)) return;
    for (let k = 0; k < n; k++) {
      const s = k === 0 ? 1 : 0.62;
      const dy = day ? k * 0.9 * (a === 0 ? 1 : -1) : (k % 3) * 0.35;
      const dx = day ? Math.sin(t * 1.3 + k) * 0.25 : Math.floor(k / 3) * 0.35;
      out.push({ t: 'duck', x: hx + dx, y: hy + dy, a: a + (day ? Math.sin(t + k) * 0.15 : k), s, drake: k === 0 && f !== 1, asleep: !day });
    }
  });
  {
    const y = day ? 360 + Math.sin(t * 0.05) * 60 : 330;
    const x = riverX(y) + (day ? 2 + Math.sin(t * 0.11) * 4 : half - 2);
    if (!underBridge(y) && far(x, y)) {
      const a = day ? (Math.cos(t * 0.05) > 0 ? Math.PI : 0) : 0.3;
      out.push({ t: 'swan', x, y, a }, { t: 'swan', x: x + 1.4, y: y + (a === 0 ? 1.6 : -1.6), a: a + 0.1 });
    }
  }
  F.dogs.forEach((d, i) => {
    const lying = !day && i % 3 !== 0;
    const len = Math.hypot(d.x1 - d.x0, d.y1 - d.y0);
    const leg = len / d.speed;
    const cycle = leg * 2 + 8;
    const u = (t + d.phase) % cycle;
    let k: number;
    let moving = true;
    let back = false;
    if (lying) (k = 0.3), (moving = false);
    else if (u < leg) k = u / leg;
    else if (u < leg + 4) (k = 1), (moving = false);
    else if (u < leg * 2 + 4) (k = 1 - (u - leg - 4) / leg), (back = true);
    else (k = 0), (moving = false);
    const x = d.x0 + (d.x1 - d.x0) * k;
    const y = d.y0 + (d.y1 - d.y0) * k;
    if (!far(x, y)) return;
    out.push({ t: 'dog', x, y, a: Math.atan2(d.x1 - d.x0, -(d.y1 - d.y0)) + (back ? Math.PI : 0), col: d.col, moving, lying });
  });
  F.cats.forEach((s, i) => {
    if (!far(s.x, s.y)) return;
    out.push({ t: 'cat', x: s.x, y: s.y, a: s.a + (day ? 0 : Math.sin(t * 0.4 + i) * 0.6), col: s.col, curled: day && i % 4 !== 0, z: s.z });
  });

  // ---- traffic that isn't in the model: parked cars, buses, scooters
  for (const v of F.parked) if (far(v.x, v.y) && !onBroken(v.x, v.y)) out.push({ t: 'car', x: v.x, y: v.y, h: v.h, dir: v.d, col: v.col });
  const station = c.world.spaces.find((s) => s.kind === 'busstation');
  const west = 40;
  const east = c.brokenBridge ? 688 : 980;
  const stops = [160, 330, station ? station.rect.x + station.rect.w / 2 : 635, 860].filter((s) => s < east);
  if (h >= 5 && h < 23.5)
    for (let i = 0; i < 2; i++) {
      const pts = [west, ...stops, east];
      const legs: [number, number][] = [];
      for (let k = 0; k < pts.length - 1; k++) legs.push([pts[k], pts[k + 1]]);
      const route = [...legs, ...legs.map(([a, b]) => [b, a] as [number, number]).reverse()];
      const speed = 4.2; // a city bus in traffic, unhurried
      const lap = route.reduce((s, [a, b]) => s + Math.abs(b - a) / speed + 12, 0);
      let u = (t + i * lap * 0.5) % lap;
      let x = west;
      let dir: 1 | -1 = 1;
      for (const [a, b] of route) {
        const tt = Math.abs(b - a) / speed;
        dir = b > a ? 1 : -1;
        if (u < tt) {
          x = a + (b - a) * (u / tt);
          break;
        }
        u -= tt;
        if (u < 12) {
          x = b;
          break;
        }
        u -= 12;
      }
      const y = 350 + (dir > 0 ? 4 : -4);
      if (far(x, y)) out.push({ t: 'bus', x, y, dir, col: i ? '#d9c38a' : '#6f9a8a' });
    }
  // Buses and minibuses parked nose-in at the bus station's bays: more in the day, a few overnight.
  if (station) {
    const q = station.rect;
    const pr = rng(station.id * 31 + 5);
    let k = 0;
    for (let x = q.x + 5.6; x < q.x + q.w - 5; x += 7, k++) {
      const busy = pr();
      const y = q.y + 14 + pr() * (q.h - 11 - 18) + 5.5;
      const col = pr() < 0.5 ? '#d9c38a' : pr() < 0.5 ? '#e6e1d6' : '#6f9a8a';
      if (busy > (h >= 6 && h < 21 ? 0.72 : 0.4)) continue;
      if (far(x, y)) out.push({ t: 'bus', x, y, dir: k % 2 ? 1 : -1, col, v: true });
    }
  }
  F.trucks.forEach((s, i) => {
    if (!(h >= 5.5 && h < 21) && i % 5) return;
    const len = s.h ? s.r.w : s.r.h;
    const u = (((t * s.speed + s.phase) % len) + len) % len;
    const along = s.dir > 0 ? u : len - u;
    const x = s.h ? s.r.x + along : s.r.x + s.r.w / 2 + s.lane * s.dir;
    const y = s.h ? s.r.y + s.r.h / 2 - s.lane * s.dir : s.r.y + along;
    if (!far(x, y) || onBroken(x, y)) return;
    out.push({ t: 'truck', x, y, a: s.h ? (s.dir > 0 ? 0 : Math.PI) : s.dir > 0 ? Math.PI / 2 : -Math.PI / 2, col: s.col, lorry: s.lorry, load: s.load, door: s.door, lean: s.lean + Math.sin(t * 5 + i) * 0.012, smoke: (t * 1.3 + i * 0.37) % 1 });
  });
  for (const l of F.litter) if (far(l.x, l.y)) out.push({ t: 'litter', x: l.x, y: l.y, a: l.a, kind: l.kind, col: l.col });
  // Warehouse 14's yard: the lock-up garage and a container out the back, trucks parked up, drums along the wall,
  // pallets and tyres; by day men loading and unloading, a forklift shuttling on the loading side; at night a guard
  // by a burning drum.
  const wh = c.world.buildings.find((b) => b.name === 'Warehouse 14');
  if (wh && alive(wh)) {
    const q = wh.rects[0];
    const X = q.x;
    const Y = q.y;
    const put = (e: Ent) => {
      const p = e as { x: number; y: number };
      if (far(p.x, p.y)) out.push(e);
    };
    put({ t: 'shed', x: X - 24, y: Y - 16, w: 12, h: 11, door: 1 });
    put({ t: 'container', x: X - 25, y: Y + 9, w: 12, h: 5, col: '#b8573a' });
    put({ t: 'container', x: X - 25, y: Y + 15, w: 12, h: 5, col: '#2f5f8a' });
    put({ t: 'truck', x: X - 6, y: Y - 9, a: Math.PI, col: '#e9e4d8', lorry: false, load: '#c99a5e', door: '#8a4a2a', lean: 0.03, smoke: -1 });
    put({ t: 'truck', x: X - 7, y: Y + 26, a: -Math.PI / 2, col: '#6c8aa8', lorry: true, load: '#d0d4d6', door: '#c9b24c', lean: -0.02, smoke: -1 });
    for (let k = 0; k < 12; k++) put({ t: 'clutter', kind: 'drum', x: X - 1.3 - (k % 2) * 0.8, y: Y + 3 + Math.floor(k / 2) * 0.8, a: 0, col: ['#2f5f8a', '#8a4a2a', '#2f5f8a', '#3f6a4a'][k % 4] });
    for (let k = 0; k < 5; k++) put({ t: 'clutter', kind: 'drum', x: X - 12 + k * 0.8, y: Y - 4.6, a: 0, col: k % 2 ? '#c9a44c' : '#7a2a22' });
    for (let k = 0; k < 3; k++) put({ t: 'clutter', kind: 'pallet', x: X - 20 + k * 1.4, y: Y + 3, a: 0, col: '#b89968' });
    for (let k = 0; k < 6; k++) put({ t: 'clutter', kind: 'crate', x: X - 15 + (k % 3) * 0.7, y: Y + 1 + Math.floor(k / 3) * 0.7, a: 0, col: '#b08a5e' });
    put({ t: 'clutter', kind: 'tyres', x: X - 10, y: Y - 11, a: 0, col: '#2a2826' });
    put({ t: 'clutter', kind: 'tyrepile', x: X - 26, y: Y - 2, a: 0.4, col: '#2a2826' });
    put({ t: 'clutter', kind: 'jerry', x: X - 11.5, y: Y - 9, a: 0, col: '#e0c64a' });
    if (day) {
      // Two men carrying crates from the container to the warehouse wall and back.
      for (let k = 0; k < 2; k++) {
        const u = (t * 0.06 + k * 0.5) % 2;
        const back = u > 1;
        const f = back ? 2 - u : u;
        const x = X - 13 + f * 11;
        const y = Y + 11 + f * -3 + k * 1.4;
        put({ t: 'person', x, y, face: back ? Math.PI : 0, id: 500 + k, carry: !back });
      }
      // One at the garage door working on something, one sitting on a drum with a cigarette, one on the phone by the truck.
      put({ t: 'person', x: X - 11, y: Y - 10.5, face: Math.PI, id: 503 });
      put({ t: 'person', x: X - 2.4, y: Y + 1.8, face: Math.PI, id: 504, sit: true, smoke: true });
      put({ t: 'person', x: X - 4, y: Y - 12, face: t * 0.2, id: 505 });
      // The forklift on the loading side: from the stacks to the doors and back.
      const u = (t * 0.05) % 2;
      const back = u > 1;
      const f = back ? 2 - u : u;
      put({ t: 'forklift', x: X + 4 + f * 26, y: Y + q.h + 10, a: back ? -Math.PI / 2 : Math.PI / 2, load: !back });
      put({ t: 'person', x: X + 9 + Math.sin(t * 0.1) * 5, y: Y + q.h + 3, face: Math.PI / 2, id: 506, carry: Math.sin(t * 0.1) > 0 });
    } else {
      put({ t: 'fire', x: X - 8, y: Y + 6, size: 0.55, flicker: Math.sin(t * 9) * 0.5 + Math.sin(t * 13) * 0.5 });
      put({ t: 'person', x: X - 9.6, y: Y + 6.4, face: 0, id: 507, sit: true, smoke: true });
      put({ t: 'glow', x: X - 18, y: Y - 10, r: 5, a: 0.5 * c.night, col: '255,205,120', z: 3.2 });
    }
  }
  // Shelters, and the people living in them: sitting out by day, a small fire by some at night.
  F.tarps.forEach((tp, i) => {
    if (!far(tp.x, tp.y)) return;
    out.push({ t: 'tarp', x: tp.x, y: tp.y, a: tp.a, col: tp.col, size: tp.size, mat: tp.mat });
    const ox = Math.cos(tp.a) * 2.2;
    const oy = Math.sin(tp.a) * 2.2;
    if (i % 2 === 0) out.push({ t: 'person', x: tp.x + ox, y: tp.y + oy, face: tp.a + Math.PI, id: 400 + i, sit: true, smoke: !day && i % 4 === 0 });
    if (tp.fire && !day) out.push({ t: 'fire', x: tp.x + ox * 1.6, y: tp.y + oy * 1.6, size: 0.5, flicker: Math.sin(t * 9 + i) * 0.5 + Math.sin(t * 13 + i * 3) * 0.5 });
  });
  // The animals.
  for (const gh of F.goats)
    for (let k = 0; k < gh.n; k++) {
      const a = t * 0.012 * (k % 2 ? 1 : -1) + k * 1.3 + gh.seed;
      const rr = 3 + ((k * 7 + gh.seed) % 6);
      const x = gh.cx + Math.cos(a) * rr + Math.sin(t * 0.05 + k) * 1.5;
      const y = gh.cy + Math.sin(a) * rr * 0.7;
      if (far(x, y)) out.push({ t: 'beast', kind: 'goat', x, y, a: a + Math.PI / 2, col: ['#f4f2ec', '#3a3430', '#8a6a4a', '#d8c8a8'][(k + gh.seed) % 4], moving: day && k % 3 !== 0, lying: !day });
    }
  if (h >= 5.5 && h < 19.5)
    for (const ch of F.chickens)
      for (let k = 0; k < ch.n; k++) {
        const x = ch.x + Math.sin(t * 0.7 + k * 2.1 + ch.seed) * 1.6 + k * 0.4;
        const y = ch.y + Math.cos(t * 0.5 + k * 1.7 + ch.seed) * 1.4;
        if (far(x, y)) out.push({ t: 'beast', kind: 'chicken', x, y, a: t * 2 + k, col: k === 0 ? '#c0703a' : ['#f4f2ec', '#a0643a', '#e8dcc0'][k % 3], moving: true, lying: false });
      }
  if (day)
    for (const pg of F.pigeons) {
      const n = Math.min(16, Math.round((pg.w * pg.h) / 180));
      for (let k = 0; k < n; k++) {
        const x = pg.x + (((k * 37 + pg.seed * 13) % 100) / 100) * pg.w + Math.sin(t * 0.9 + k) * 0.5;
        const y = pg.y + (((k * 61 + pg.seed * 7) % 100) / 100) * pg.h + Math.cos(t * 0.8 + k) * 0.5;
        if (far(x, y)) out.push({ t: 'beast', kind: 'pigeon', x, y, a: t + k, col: k % 5 ? '#8a8a92' : '#d8d4cc', moving: true, lying: false });
      }
    }
  if (h >= 6 && h < 19)
    F.donkeys.forEach((dk) => {
      const len = dk.h ? dk.r.w : dk.r.h;
      const u = (((t * dk.speed + dk.phase) % len) + len) % len;
      const along = dk.dir > 0 ? u : len - u;
      const x = dk.h ? dk.r.x + along : dk.r.x + dk.r.w / 2 + 2 * dk.dir;
      const y = dk.h ? dk.r.y + dk.r.h / 2 - 2 * dk.dir : dk.r.y + along;
      if (!far(x, y) || onBroken(x, y)) return;
      const a = dk.h ? (dk.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : dk.dir > 0 ? Math.PI : 0;
      out.push({ t: 'beast', kind: 'donkey', x, y, a, col: '#8a8078', moving: true, lying: false, cart: true });
    });
  // The landfill: its trodden ground, the heaps, smoke from the ones burning, people picking it over by day, dogs.
  out.push({ t: 'dump', x: 1050, y: 560, w: 120, h: 100 });
  F.junk.forEach((j, i) => {
    if (!far(j.x, j.y)) return;
    out.push({ t: 'junk', x: j.x, y: j.y, size: j.size, seed: j.seed });
    if (j.smoulder) out.push({ t: 'smoke', x: j.x, y: j.y, z: j.size * 0.4, seed: 50 + i, strength: 0.55, dark: 0.65, size: 0.5 + j.size * 0.15 });
  });
  if (day)
    for (let k = 0; k < 5; k++) {
      const x = 1070 + ((k * 23) % 90) + Math.sin(t * 0.05 + k) * 4;
      const y = 580 + ((k * 37) % 70) + Math.cos(t * 0.04 + k) * 3;
      out.push({ t: 'person', x, y, face: t * 0.1 + k, id: 300 + k });
    }
  for (let k = 0; k < 3; k++) out.push({ t: 'dog', x: 1090 + k * 22 + Math.sin(t * 0.3 + k) * 6, y: 600 + k * 14, a: t * 0.3 + k, col: ['#b89a6a', '#6b5a48', '#d8c8a8'][k], moving: day, lying: !day });
  for (const k of F.clutter) if (far(k.x, k.y) && !c.damaged.has(-1)) out.push({ t: 'clutter', kind: k.kind, x: k.x, y: k.y, a: k.a, col: k.col });
  // The fountain on the Circus, running from morning until late.
  const rb = c.world.roundabout;
  if (far(rb.x, rb.y)) out.push({ t: 'fountain', x: rb.x, y: rb.y, r: !cut && h >= 6 && h < 23.5 ? 1 : 0 });
  F.scooters.forEach((s, i) => {
    if (!(h >= 6 && h < 23) && i % 3) return;
    const len = s.h ? s.r.w : s.r.h;
    const u = (((t * s.speed + s.phase) % len) + len) % len;
    const along = s.dir > 0 ? u : len - u;
    const x = s.h ? s.r.x + along : s.r.x + s.r.w / 2 + s.lane;
    const y = s.h ? s.r.y + s.r.h / 2 + s.lane : s.r.y + along;
    if (!far(x, y) || onBroken(x, y)) return;
    out.push({ t: 'scooter', x, y, a: s.h ? (s.dir > 0 ? 0 : Math.PI) : s.dir > 0 ? Math.PI / 2 : -Math.PI / 2, col: s.col, sway: Math.sin(t * 1.3 + i) * 0.12 });
  });

  // ---- smoke, and the red lights up high
  F.bakeries.forEach((b, i) => alive(b) && out.push({ t: 'smoke', x: b.cx, y: b.cy, z: b.h + 1, seed: i + 1, strength: bell(h, 3.5, 11) + 0.4 * bell(h, 16, 19.5), dark: 0.25, size: 1 }));
  F.tents.forEach((b, i) => alive(b) && out.push({ t: 'smoke', x: b.cx, y: b.cy, z: 1, seed: i + 7, strength: bell(h, 5.5, 8.5) + bell(h, 17, 20.5), dark: 0.55, size: 0.8 }));
  F.gens.forEach((b, i) => alive(b) && out.push({ t: 'smoke', x: b.cx + 1.5, y: b.cy, z: b.h + 0.5, seed: i + 13, strength: (cut || h >= 20 || h < 5 ? 1 : 0) * (Math.sin(t * 0.03 + i) > -0.3 ? 0.9 : 0), dark: 0.85, size: 0.6 }));
  // The power station's stacks and the kiln chimneys, drawn in 3D (the flat map has its own chimney smoke).
  F.stacks.forEach((b, i) => alive(b) && out.push({ t: 'smoke', x: b.cx, y: b.cy, z: b.h + 0.5, seed: 31 + i, strength: b.name === 'Power station stack' ? 0.8 : h >= 3.5 && h < 20 ? 0.9 : 0.45, dark: b.name === 'Power station stack' ? 0.2 : 0.55, size: 1.4, d3: true }));
  if (alive(F.mill)) out.push({ t: 'smoke', x: F.mill!.cx - 10, y: F.mill!.cy, z: F.mill!.h + 1, seed: 21, strength: bell(h, 6, 18) * 0.8, dark: 0, size: 1.3 });
  for (const L of F.beacons) if (!cut && !c.damaged.has(L.b.id) && Math.sin(t * 3 + L.x * 0.1) > 0.2) out.push({ t: 'beacon', x: L.x, y: L.y, z: L.z, big: L.big });
  soukScene(c, out);
  for (const f of extras) out.push(...f(c));
  return out;
}
