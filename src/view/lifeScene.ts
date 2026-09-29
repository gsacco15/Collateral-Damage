// Everything alive in the city that isn't in the estimate: boats and fishermen on the canal, people by the water at
// night, smokers at shop doors and hookah circles at the cafés, ducks, swans, dogs and cats, parked cars, buses and
// scooters, smoke from ovens, fires and generators, the red lights on the masts. One description of the scene at a
// moment, drawn by the flat map and built by the 3D model alike, so both always show the same thing.
import { buildingAt, inRect, riverX, rng, type Building, type Rect, type World } from '../jev';
import type { Wear } from './crowd';

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
  | { t: 'person'; x: number; y: number; face: number; id: number; wear?: Wear; sit?: boolean; smoke?: boolean }
  | { t: 'rod'; x: number; y: number; a: number; len: number; seed: number; z: number }
  | { t: 'stool' | 'bucket' | 'table'; x: number; y: number }
  | { t: 'hookah'; x: number; y: number; seed: number }
  | { t: 'glow'; x: number; y: number; r: number; a: number; col: string; z: number }
  | { t: 'duck'; x: number; y: number; a: number; s: number; drake: boolean; asleep: boolean }
  | { t: 'swan'; x: number; y: number; a: number }
  | { t: 'dog'; x: number; y: number; a: number; col: string; moving: boolean; lying: boolean }
  | { t: 'cat'; x: number; y: number; a: number; col: string; curled: boolean; z: number }
  | { t: 'car'; x: number; y: number; h: boolean; dir: 1 | -1; col: string }
  | { t: 'bus'; x: number; y: number; dir: 1 | -1; col: string }
  | { t: 'scooter'; x: number; y: number; a: number; col: string; sway: number }
  | { t: 'smoke'; x: number; y: number; z: number; seed: number; strength: number; dark: number; size: number }
  | { t: 'beacon'; x: number; y: number; z: number; big: boolean };

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
  cafes: { x: number; y: number; evening: boolean }[];
  smokers: { x: number; y: number; face: number; b: Building }[];
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
    { x: 588, y: 366, evening: false },
    { x: 452, y: 362, evening: true },
    { x: riverX(500) - half - 7, y: 500, evening: true },
    { x: riverX(640) + half + 7, y: 640, evening: true },
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
  return {
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

  // ---- cafés and smokers: a hookah circle at the café tables, someone out for a cigarette at a shop door
  F.cafes.forEach((cf, i) => {
    const open = cf.evening ? h >= 16 || h < 1 : h >= 12 || h < 1;
    if (!open || !far(cf.x, cf.y) || onBroken(cf.x, cf.y)) return;
    out.push({ t: 'table', x: cf.x, y: cf.y });
    out.push({ t: 'hookah', x: cf.x, y: cf.y, seed: i * 3.3 });
    const n = 3 + (i % 2);
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * Math.PI * 2 + i;
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
      const speed = 7;
      const lap = route.reduce((s, [a, b]) => s + Math.abs(b - a) / speed + 5, 0);
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
        if (u < 5) {
          x = b;
          break;
        }
        u -= 5;
      }
      const y = 350 + (dir > 0 ? 4 : -4);
      if (far(x, y)) out.push({ t: 'bus', x, y, dir, col: i ? '#d9c38a' : '#6f9a8a' });
    }
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
  F.gens.forEach((b, i) => alive(b) && out.push({ t: 'smoke', x: b.cx + 1.5, y: b.cy, z: b.h + 0.5, seed: i + 13, strength: (h >= 20 || h < 5 ? 1 : 0) * (Math.sin(t * 0.03 + i) > -0.3 ? 0.9 : 0), dark: 0.85, size: 0.6 }));
  if (alive(F.mill)) out.push({ t: 'smoke', x: F.mill!.cx - 10, y: F.mill!.cy, z: F.mill!.h + 1, seed: 21, strength: bell(h, 6, 18) * 0.8, dark: 0, size: 1.3 });
  for (const L of F.beacons) if (!c.damaged.has(L.b.id) && Math.sin(t * 3 + L.x * 0.1) > 0.2) out.push({ t: 'beacon', x: L.x, y: L.y, z: L.z, big: L.big });
  return out;
}
