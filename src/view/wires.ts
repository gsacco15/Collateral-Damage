// Power and telephone lines: a main feeder of tall poles out of the power station's transformer yard, up Loom Street
// and along the boulevard; tidier distribution lines down some streets; and in the Old Town, Tin Hill, the Market
// and the Weavers' Quarter the usual tangle, poles wherever there was room, cables strung between them and down to
// every roof. One layout for both views; a strike knocks poles over and brings their wires down.
import { buildingAt, buildingDist, inRect, rng, type Building, type World } from '../jev';

export interface Pole {
  x: number;
  y: number;
  h: number;
  main: boolean;
  can: boolean; // a transformer can on the pole
}
export interface Span {
  a: number; // pole index
  b: number; // pole index, or -1 for a drop to a building
  n: number; // wires strung side by side
  to?: { x: number; y: number; z: number; bid: number }; // the roof the drop ends on
}

let cache: { poles: Pole[]; spans: Span[] } | null = null;
let cacheFor: World | null = null;

export function wiring(w: World) {
  if (cache && cacheFor === w) return cache;
  const r = rng(6161);
  const poles: Pole[] = [];
  const spans: Span[] = [];
  const onRoad = (x: number, y: number) => w.roads.some((rd) => inRect(rd.rect, x, y, 0.3));
  const clear = (x: number, y: number) => !buildingAt(w, x, y) && !onRoad(x, y) && !w.spaces.some((s) => inRect(s.rect, x, y));
  const line = (pts: [number, number][], h: number, main: boolean, n: number) => {
    let last = -1;
    for (const [x, y] of pts) {
      if (!clear(x, y)) continue;
      poles.push({ x, y, h, main, can: !main && r() < 0.22 });
      const i = poles.length - 1;
      if (last >= 0 && Math.hypot(poles[last].x - x, poles[last].y - y) < 70) spans.push({ a: last, b: i, n });
      last = i;
    }
  };
  // The feeder: out of the transformer yard, up Loom Street, then east along the boulevard.
  const loom = w.roads.filter((rd) => rd.name === 'Loom Street').map((rd) => rd.rect);
  const feed: [number, number][] = [[100, 748]];
  const lx = loom.length ? loom[0].x - 0.9 : 113;
  for (let y = 730; y > 356; y -= 30) feed.push([lx, y]);
  const blvd = w.roads.filter((rd) => rd.kind === 'boulevard').map((rd) => rd.rect);
  const by = blvd.length ? blvd[0].y - 0.9 : 339;
  for (let x = lx; x < 1000; x += 32) feed.push([x, by]);
  line(feed, 10, true, 3);
  // Distribution down a number of streets: one kerb, a pole every 28 m.
  const streets = w.roads.filter((rd) => rd.kind === 'street' && rd.rect.x < 1006 && Math.max(rd.rect.w, rd.rect.h) > 60);
  for (let i = 0; i < 18; i++) {
    const q = streets[Math.floor(r() * streets.length)].rect;
    const h = q.w > q.h;
    const side = r() < 0.5 ? -1 : 1;
    const pts: [number, number][] = [];
    const len = h ? q.w : q.h;
    for (let d = 6; d < len; d += 28) pts.push(h ? [q.x + d, side > 0 ? q.y + q.h + 0.9 : q.y - 0.9] : [side > 0 ? q.x + q.w + 0.9 : q.x - 0.9, q.y + d]);
    line(pts, 7.5, false, 2);
  }
  // The tangle: poles wherever there's room among the houses, strung to their neighbours.
  const messy = w.buildings.filter((b) => b.district === 'oldtown' || b.district === 'tinhill' || b.district === 'market' || b.district === 'quarter');
  const start = poles.length;
  for (let i = 0; i < 400 && poles.length - start < 90; i++) {
    const b = messy[Math.floor(r() * messy.length)];
    const a = r() * Math.PI * 2;
    const q = b.rects[0];
    const d = Math.max(q.w, q.h) / 2 + 1.5 + r() * 3;
    const x = b.cx + Math.cos(a) * d;
    const y = b.cy + Math.sin(a) * d;
    if (!clear(x, y) || poles.some((p) => Math.hypot(p.x - x, p.y - y) < 12)) continue;
    poles.push({ x, y, h: 6 + r() * 1.5, main: false, can: r() < 0.12 });
  }
  const all = poles.map((p, i) => ({ p, i }));
  for (let i = start; i < poles.length; i++) {
    const p = poles[i];
    const near = all.filter((o) => o.i !== i && Math.hypot(o.p.x - p.x, o.p.y - p.y) < 34).sort((u, v) => Math.hypot(u.p.x - p.x, u.p.y - p.y) - Math.hypot(v.p.x - p.x, v.p.y - p.y));
    for (const o of near.slice(0, 1 + Math.floor(r() * 2))) if (!spans.some((s) => (s.a === o.i && s.b === i) || (s.a === i && s.b === o.i))) spans.push({ a: i, b: o.i, n: 1 + Math.floor(r() * 3) });
  }
  // Drops: from the street poles and the tangle down to the roofs nearby, one cable to each house.
  const houses = w.buildings.filter((b) => b.kind === 'home' || b.kind === 'apartment' || b.kind === 'shop' || b.kind === 'shack');
  poles.forEach((p, i) => {
    if (p.main) return;
    const n = i >= start ? 2 + Math.floor(r() * 3) : r() < 0.6 ? 1 : 0;
    const near = houses.filter((b) => buildingDist(b, p.x, p.y) < 14).sort((u, v) => buildingDist(u, p.x, p.y) - buildingDist(v, p.x, p.y));
    for (const b of near.slice(0, n)) {
      const q = b.rects[0];
      const x = Math.max(q.x + 0.4, Math.min(q.x + q.w - 0.4, p.x));
      const y = Math.max(q.y + 0.4, Math.min(q.y + q.h - 0.4, p.y));
      spans.push({ a: i, b: -1, n: 1, to: { x, y, z: b.h - 0.3, bid: b.id } });
    }
  });
  cache = { poles, spans };
  cacheFor = w;
  return cache;
}

/** Poles a strike knocked over (with the direction each lies), and those beside a building brought down. */
export function brokenPoles(w: World, damaged: Set<number>, blast: { x: number; y: number; r: number } | null) {
  const out = new Map<number, number>();
  const fallen = [...damaged].map((id) => w.buildings[id]).filter(Boolean) as Building[];
  wiring(w).poles.forEach((p, i) => {
    if (blast) {
      const d = Math.hypot(p.x - blast.x, p.y - blast.y);
      if (d < blast.r * 1.7) return void out.set(i, Math.atan2(p.y - blast.y, p.x - blast.x));
    }
    for (const b of fallen) if (buildingDist(b, p.x, p.y) < 3) return void out.set(i, Math.atan2(p.y - b.cy, p.x - b.cx));
  });
  return out;
}

/**
 * Each wire as a pair of 3D end points (x, height, y), after the damage: a wire off a fallen pole ends on the
 * ground where the pole's top landed, a drop to a ruined house is gone, a span between two fallen poles lies
 * in the dirt.
 */
export function wireEnds(w: World, broken: Map<number, number>, damaged: Set<number>) {
  const { poles, spans } = wiring(w);
  const top = (i: number): [number, number, number] => {
    const p = poles[i];
    const f = broken.get(i);
    if (f == null) return [p.x, p.h - 0.3, p.y];
    return [p.x + Math.cos(f) * p.h * 0.95, 0.25, p.y + Math.sin(f) * p.h * 0.95];
  };
  const out: { a: [number, number, number]; b: [number, number, number]; main: boolean }[] = [];
  for (const s of spans) {
    const A = top(s.a);
    let B: [number, number, number];
    if (s.b >= 0) B = top(s.b);
    else {
      if (damaged.has(s.to!.bid)) continue;
      B = [s.to!.x, s.to!.z, s.to!.y];
    }
    const dx = B[0] - A[0];
    const dz = B[2] - A[2];
    const len = Math.hypot(dx, dz) || 1;
    for (let k = 0; k < s.n; k++) {
      const off = (k - (s.n - 1) / 2) * 0.45;
      const ox = (-dz / len) * off;
      const oz = (dx / len) * off;
      out.push({ a: [A[0] + ox, A[1], A[2] + oz], b: [B[0] + ox, B[1], B[2] + oz], main: poles[s.a].main });
    }
  }
  return out;
}
