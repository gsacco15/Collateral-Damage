// The "Living" people model: the same day's rhythm as the classic one, but the city's people live somewhere and go
// somewhere. Each district's residents head for workplaces, schools, the souk, mosques and open spaces, mostly the
// ones near home, so places ringed by dense housing fill up and far-off ones stay quieter. Every household is its own
// size, and some districts start their day earlier or later. Across each kind of place the city's totals stay the
// same as the classic model; what changes is where people are. Worked out once per city, then cheap every hour.
import { rng } from './rng';
import type { Building, DistrictId, Kind, SpaceKind, World } from './city';

type Activity = 'home' | 'work' | 'school' | 'market' | 'prayer' | 'leisure' | 'none';

const B_ACT: Record<Kind, Activity> = {
  home: 'home',
  apartment: 'home',
  villa: 'home',
  shack: 'home',
  tent: 'home',
  barracks: 'home',
  shop: 'market',
  stand: 'leisure',
  office: 'work',
  hall: 'work',
  workshop: 'work',
  warehouse: 'work',
  factory: 'work',
  kiln: 'work',
  greenhouse: 'work',
  hospital: 'work',
  clinic: 'work',
  school: 'school',
  mosque: 'prayer',
  shelter: 'none',
  minaret: 'none',
  fueltank: 'none',
  chimney: 'none',
  silo: 'none',
  watertank: 'none',
  mast: 'none',
};
const S_ACT: Record<SpaceKind, Activity> = {
  plaza: 'leisure',
  market: 'market',
  park: 'leisure',
  pitch: 'leisure',
  yard: 'work',
  playground: 'school',
  cemetery: 'leisure',
  courtyard: 'prayer',
  busstation: 'leisure',
  field: 'work',
  brickyard: 'work',
  scrapyard: 'work',
  distribution: 'none',
};
// How far people will usually go for each, in metres: a child walks to the nearest school, a worker crosses town.
const REACH: Record<Activity, number> = { home: 1, work: 360, school: 190, market: 300, prayer: 170, leisure: 240, none: 1 };

// Some districts live a little earlier or later (hours): Tin Hill, the camp and the kilns start before dawn; the
// market opens early; the garden villas and the terraces sleep in; the old town stays up late.
const SHIFT: Partial<Record<DistrictId, number>> = { tinhill: -0.75, camp: -0.75, kilns: -1, workshops: -0.5, market: -0.4, garden: 0.8, terraces: 0.3, oldtown: 0.4 };

export interface Living {
  k: Float32Array; // per building: how full it runs compared with the classic guess for its kind
  shift: Float32Array; // per building: hours later (+) or earlier (-) than the classic day
  sk: Float32Array; // per space
  sshift: Float32Array;
}

const cache = new WeakMap<World, Living>();

export function living(w: World): Living {
  const hit = cache.get(w);
  if (hit) return hit;
  // Residents, pooled on a 40 m grid so the pull of every home on every place stays cheap.
  const CELL = 40;
  const grid = new Map<number, { x: number; y: number; n: number }>();
  for (const b of w.buildings) {
    if (B_ACT[b.kind] !== 'home') continue;
    const key = Math.floor(b.cx / CELL) * 1000 + Math.floor(b.cy / CELL);
    const c = grid.get(key) ?? { x: 0, y: 0, n: 0 };
    c.x += b.cx * b.capacity;
    c.y += b.cy * b.capacity;
    c.n += b.capacity;
    grid.set(key, c);
  }
  const cells = [...grid.values()].filter((c) => c.n > 0).map((c) => ({ x: c.x / c.n, y: c.y / c.n, n: c.n }));
  const pull = (x: number, y: number, a: Activity) => {
    const L = REACH[a];
    let s = 0;
    for (const c of cells) s += c.n * Math.exp(-Math.hypot(c.x - x, c.y - y) / L);
    return s;
  };
  const r = rng(w.seed * 7919 + 13);

  const k = new Float32Array(w.buildings.length).fill(1);
  const shift = new Float32Array(w.buildings.length);
  const byKind = new Map<string, number[]>();
  for (const b of w.buildings) {
    const a = B_ACT[b.kind];
    shift[b.id] = b.name ? 0 : (SHIFT[b.district] ?? 0) * (a === 'home' || a === 'work' || a === 'market' || a === 'leisure' ? 1 : 0.3);
    // Each household is its own size, each shop its own trade; the named landmarks keep their briefed numbers.
    const own = b.name ? 1 : a === 'home' ? 0.55 + r() * 0.9 : 0.7 + r() * 0.6;
    const near = a === 'home' || a === 'none' || b.name ? 1 : pull(b.cx, b.cy, a);
    k[b.id] = own * near;
    const list = byKind.get(b.kind) ?? [];
    list.push(b.id);
    byKind.set(b.kind, list);
  }
  // Within each kind: compare with the average pull (softened, so no place is ever wildly off), then rescale so the
  // kind's total is what the classic model has.
  for (const [kind, ids] of byKind) {
    const a = B_ACT[kind as Kind];
    if (a !== 'home' && a !== 'none') {
      const pulls = ids.filter((id) => !w.buildings[id].name);
      const mean = pulls.reduce((s, id) => s + k[id], 0) / Math.max(1, pulls.length);
      for (const id of pulls) k[id] = Math.min(1.7, Math.max(0.45, (k[id] / mean) ** 0.55));
    }
    const cap = (b: Building) => b.capacity;
    const tot = ids.reduce((s, id) => s + cap(w.buildings[id]), 0);
    const got = ids.reduce((s, id) => s + cap(w.buildings[id]) * k[id], 0);
    if (got > 0) for (const id of ids) k[id] *= tot / got;
  }

  const sk = new Float32Array(w.spaces.length).fill(1);
  const sshift = new Float32Array(w.spaces.length);
  const sByKind = new Map<string, number[]>();
  for (const s of w.spaces) {
    const a = S_ACT[s.kind];
    sshift[s.id] = (SHIFT[s.district] ?? 0) * 0.6;
    if (a === 'none' || a === 'home') continue;
    sk[s.id] = pull(s.rect.x + s.rect.w / 2, s.rect.y + s.rect.h / 2, a);
    const list = sByKind.get(s.kind) ?? [];
    list.push(s.id);
    sByKind.set(s.kind, list);
  }
  for (const ids of sByKind.values()) {
    const mean = ids.reduce((t, id) => t + sk[id], 0) / Math.max(1, ids.length);
    for (const id of ids) sk[id] = Math.min(1.5, Math.max(0.5, (sk[id] / mean) ** 0.5));
  }
  const out = { k, shift, sk, sshift };
  cache.set(w, out);
  return out;
}
