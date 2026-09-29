// Where the street lights stand: along both sides of the boulevard, the canal quays, the other streets (every 34 m,
// alternating sides) and at the corners of the warehouses and factories. One list, so the flat map and the 3D model
// put the same lamp in the same place, and its pool of light falls right under it.
import { buildingAt, buildingDist, riverX, type World } from '../jev';

export interface StreetLight {
  x: number; // the lamp head, over the edge of the road
  y: number;
  px: number; // the post, on the kerb just behind it
  py: number;
  r: number; // radius of its pool of light
  flood: boolean; // a cold floodlight at the works
}

let cache: StreetLight[] | null = null;
let cacheFor: World | null = null;

export function streetLights(w: World): StreetLight[] {
  if (cacheFor === w && cache) return cache;
  const out: StreetLight[] = [];
  // The arm leans out over the road from a post on the kerb: (ax, ay) points from the post to the lamp.
  const add = (x: number, y: number, ax: number, ay: number, r: number, flood = false) => {
    const px = x - ax * 1.6;
    const py = y - ay * 1.6;
    if (buildingAt(w, px, py)) return;
    out.push({ x, y, px, py, r, flood });
  };
  for (let x = 12; x < w.w; x += 36) {
    add(x, 350 - 10.5, 0, 1, 7);
    add(x, 350 + 10.5, 0, -1, 7);
  }
  for (let y = 10; y < w.h; y += 40) {
    add(riverX(y) - 24, y, 1, 0, 6);
    add(riverX(y) + 24, y, -1, 0, 6);
  }
  for (const rd of w.roads) {
    if (rd.kind !== 'street' || rd.rect.x > 1006 || Math.max(rd.rect.w, rd.rect.h) < 60) continue;
    const q = rd.rect;
    const h = q.w > q.h;
    const len = h ? q.w : q.h;
    for (let d = 20, k = 0; d < len; d += 60, k++) {
      const side = k % 2 ? 1 : -1;
      if (h) add(q.x + d, q.y + q.h / 2 + side * (q.h / 2 - 1), 0, -side, 6);
      else add(q.x + q.w / 2 + side * (q.w / 2 - 1), q.y + d, -side, 0, 6);
    }
  }
  // Six lamps round the fountain on the Circus, arms leaning in over it.
  const rb = w.roundabout;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const pr = rb.r - 7.5;
    out.push({ x: rb.x + Math.cos(a) * (pr - 1.6), y: rb.y + Math.sin(a) * (pr - 1.6), px: rb.x + Math.cos(a) * pr, py: rb.y + Math.sin(a) * pr, r: 6, flood: false });
  }
  for (const b of w.buildings) {
    if (b.kind !== 'warehouse' && b.kind !== 'factory') continue;
    const q = b.rects[0];
    out.push({ x: q.x - 0.6, y: q.y - 0.6, px: q.x - 0.6, py: q.y - 0.6, r: 9, flood: true });
    out.push({ x: q.x + q.w + 0.6, y: q.y + q.h + 0.6, px: q.x + q.w + 0.6, py: q.y + q.h + 0.6, r: 9, flood: true });
  }
  cache = out;
  cacheFor = w;
  return out;
}

/**
 * What a strike did to the street lights. Close in, the blast knocks the post flat, away from the bomb (fall: the
 * direction it lies, in radians); a little further out it still stands but the lamp is dead (fall: null), cables cut.
 * Lights beside a building brought down (by this strike or an earlier one) go with it, so the ruins stay dark.
 */
export function brokenLights(w: World, damaged: Set<number>, blast: { x: number; y: number; r: number } | null) {
  const out = new Map<number, number | null>();
  const fallen = [...damaged].map((id) => w.buildings[id]).filter(Boolean);
  streetLights(w).forEach((l, i) => {
    if (blast) {
      const d = Math.hypot(l.px - blast.x, l.py - blast.y);
      if (d < blast.r * 1.6) return void out.set(i, Math.atan2(l.py - blast.y, l.px - blast.x));
      if (d < blast.r * 3) return void out.set(i, null);
    }
    for (const b of fallen) if (buildingDist(b, l.px, l.py) < 4) return void out.set(i, Math.atan2(l.py - b.cy, l.px - b.cx));
  });
  return out;
}

/** The power station is down: the grid is dead. Only the hospital (its own generators) and the odd home with a
 * generator or a candle still show light. */
export function powerCut(w: World, damaged: Set<number>) {
  const ps = w.buildings.find((b) => b.name === 'Power Station');
  return !!ps && damaged.has(ps.id);
}
