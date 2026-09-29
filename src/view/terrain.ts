// The ground beyond the town: rocky outcrops and low swells of land, like the stony hills round Kabul. One list of
// where they are, so the flat map and the 3D model show the same rocks. Folded-paper stones: flat facets, one lit
// face and one in shade, never a photographic texture.
import { rng, type World } from '../jev';

export interface Stone {
  x: number;
  y: number;
  s: number; // size, metres
  rot: number;
  pts: number[]; // the outline's radii, as a share of s (5 to 7 corners)
  tall: number; // how high it stands, as a share of s (3D)
}
export interface Outcrop {
  x: number;
  y: number;
  r: number;
  big: boolean;
  stones: Stone[];
}
export interface Mound {
  x: number;
  y: number;
  rx: number;
  ry: number;
  h: number;
  rot: number;
}

let cached: { w: World; rocks: Outcrop[]; mounds: Mound[] } | null = null;

/** Keep clear of the town, the desert track and the old camp out east. */
const clearOf = (w: World, x: number, y: number, pad: number) => {
  if (x > -80 - pad && x < w.w + 60 + pad && y > -80 - pad && y < w.h + 80 + pad) return false;
  return true;
};

export function terrain(w: World) {
  if (cached?.w === w) return cached;
  const r = rng(2718);
  const rocks: Outcrop[] = [];
  for (let i = 0; i < 400 && rocks.length < 110; i++) {
    const x = -620 + r() * (w.w + 1120);
    const y = -520 + r() * (w.h + 1040);
    const big = r() < 0.3;
    const rad = big ? 16 + r() * 26 : 4 + r() * 9;
    if (!clearOf(w, x, y, rad)) continue;
    const n = big ? 6 + Math.floor(r() * 7) : 2 + Math.floor(r() * 4);
    const stones: Stone[] = [];
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * rad * 0.8;
      const s = (big ? 4 + r() * 9 : 1.2 + r() * 2.6) * (k === 0 ? 1.4 : 1);
      const corners = 5 + Math.floor(r() * 3);
      stones.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, s, rot: r() * Math.PI * 2, pts: Array.from({ length: corners }, () => 0.7 + r() * 0.35), tall: big ? 0.6 + r() * 0.9 : 0.45 + r() * 0.4 });
    }
    rocks.push({ x, y, r: rad, big, stones });
  }
  // Low swells in the land, so the ground out there isn't a flat sheet.
  const mounds: Mound[] = [];
  for (let i = 0; i < 300 && mounds.length < 46; i++) {
    const x = -700 + r() * (w.w + 1300);
    const y = -600 + r() * (w.h + 1200);
    const rx = 40 + r() * 90;
    if (!clearOf(w, x, y, rx * 0.9)) continue;
    mounds.push({ x, y, rx, ry: rx * (0.45 + r() * 0.4), h: 3 + r() * 9, rot: r() * Math.PI });
  }
  cached = { w, rocks, mounds };
  return cached;
}
