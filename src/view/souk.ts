// The souk in the day: every stall's goods spilling out onto a counter at the front, piles of oranges and
// tomatoes, cones of spice, bolts of cloth, rugs laid out, copper pots, bread, sacks of dates; a seller behind each
// one; and the aisles full of people browsing, bargaining and pushing through with their bags. Vendors on mats along
// the front of the Covered Market, a juice stand, a grill, handcarts. At night the stalls are covered and it's quiet.
// Part of lifeScene, so the flat map and the 3D model show the same market.
import { buildingAt, inRect, rng, type Rect, type World } from '../jev';
import type { Wear } from './crowd';
import type { Ent, SceneCtx } from './lifeScene';

export type GoodsKind = 'counter' | 'pile' | 'cone' | 'bolt' | 'rug' | 'pot' | 'loaves' | 'sack' | 'umbrella' | 'grill' | 'handcart' | 'cover' | 'mat';

interface Stall {
  x: number;
  y: number;
  goods: Ent[]; // laid out for the day
  seller: { x: number; y: number; id: number; wear: Wear };
}
interface Souk {
  stalls: Stall[];
  aisles: { y: number; x0: number; x1: number }[];
  pave: { x: number; y: number; goods: Ent[]; id: number; wear: Wear }[]; // vendors on mats, along the Covered Market
  extras: Ent[]; // juice stand, grill, handcarts
  rect: Rect;
}

const PRODUCE = ['#e8892b', '#c9372b', '#6f9a3a', '#5b3a6e', '#e6c44a', '#9bc04a', '#d9562e'];
const SPICE = ['#c0392b', '#e0a526', '#8a5a2b', '#d4652a', '#6b7a3a', '#b8483a', '#e8d27a'];
const CLOTH = ['#2f5f8a', '#b8483a', '#e0c46a', '#5f8a4a', '#7d4a8a', '#e8e1d0', '#1f3f5f', '#c9a24a'];
const RUGS: [string, string][] = [
  ['#8c2f22', '#e0c46a'],
  ['#2f4f6f', '#d8c8a8'],
  ['#6e4a3a', '#c9a24a'],
  ['#7a2a3a', '#2f4f6f'],
  ['#3f5a3a', '#e0c46a'],
];
const WEARS: Wear[] = ['hijab', 'keffiyeh', 'bare', 'abaya', 'cap', 'ghutra', 'hijab', 'turban', 'shawl', 'bare', 'hijab', 'abaya'];

let cache: Souk | null = null;
let cacheFor: World | null = null;

function build(w: World): Souk | null {
  const sp = w.spaces.find((s) => s.kind === 'market');
  if (!sp) return null;
  const q = sp.rect;
  const r = rng(4411);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const g = (kind: GoodsKind, x: number, y: number, col: string, wd = 1, h = 1, extra: Partial<Extract<Ent, { t: 'goods' }>> = {}): Ent => ({ t: 'goods', kind, x, y, a: 0, col, w: wd, h, ...extra });
  const stalls: Stall[] = [];
  const kinds = ['produce', 'produce', 'spice', 'cloth', 'rugs', 'pots', 'bread', 'dates', 'produce', 'spice', 'cloth'];
  // The same grid the stalls' striped cloths are drawn on: 6 m wide, a row every 10 m.
  for (let y = q.y + 3; y < q.y + q.h - 6; y += 10)
    for (let x = q.x + 3; x < q.x + q.w - 6; x += 8.5) {
      const goods: Ent[] = [];
      const fy = y + 5.4; // the counter, just out in front of the cloth, facing the aisle
      const kind = pick(kinds);
      // Abu Karim's tea stall (see the mission) keeps its own table.
      const tea = inRect({ x, y, w: 6, h: 5 }, 511, 398);
      if (!tea) goods.push(g('counter', x + 3, fy, '#a8845a', 5.2, 0.9));
      if (tea) {
        // nothing on the counter: he sits at his table
      } else if (kind === 'produce') {
        for (let i = 0; i < 6; i++) goods.push(g('pile', x + 0.75 + i * 0.9, fy, pick(PRODUCE), 0.42, 0.28));
        goods.push(g('sack', x + 5.9, fy + 0.9, '#c9b48a', 0.5, 0.5));
      } else if (kind === 'spice') {
        for (let i = 0; i < 9; i++) goods.push(g('cone', x + 0.55 + (i % 9) * 0.57, fy + (i % 2 ? 0.18 : -0.18), pick(SPICE), 0.22, 0.34));
        goods.push(g('sack', x - 0.4, fy + 0.9, pick(SPICE), 0.45, 0.45));
        goods.push(g('sack', x + 6.3, fy + 0.8, pick(SPICE), 0.45, 0.45));
      } else if (kind === 'cloth') {
        for (let i = 0; i < 8; i++) goods.push(g('bolt', x + 0.7 + i * 0.62, fy, pick(CLOTH), 0.26, 0.8));
        goods.push(g('rug', x + 1.2, y + 5.2, pick(CLOTH), 1.1, 1.9, { hang: true, col2: '#e8e1d0' }));
      } else if (kind === 'rugs') {
        const [a, b] = pick(RUGS);
        goods.push(g('rug', x + 1.5, fy + 1.4, a, 2.2, 1.4, { col2: b }));
        const [c2, d2] = pick(RUGS);
        goods.push(g('rug', x + 4.3, fy + 1.3, c2, 2, 1.3, { col2: d2 }));
        for (const k of [0.5, 5.5]) {
          const [e, f] = pick(RUGS);
          goods.push(g('rug', x + k, y + 5.1, e, 1.2, 2.2, { hang: true, col2: f }));
        }
      } else if (kind === 'pots') {
        for (let i = 0; i < 7; i++) goods.push(g('pot', x + 0.6 + i * 0.75, fy, i % 3 ? '#b87333' : '#c9a24a', 0.32 + (i % 2) * 0.08, 0.3));
      } else if (kind === 'bread') {
        for (let i = 0; i < 5; i++) goods.push(g('loaves', x + 0.8 + i * 1.08, fy, '#d9a860', 0.45, 0.2));
      } else {
        for (let i = 0; i < 5; i++) goods.push(g('sack', x + 0.8 + i * 1.1, fy, i % 2 ? '#6b3a22' : '#c9a46a', 0.46, 0.42));
      }
      // What's on the counter sits on its top.
      for (const e of goods) if (e.t === 'goods' && ['pile', 'cone', 'bolt', 'pot', 'loaves'].includes(e.kind)) e.z = 0.86;
      stalls.push({ x, y, goods, seller: { x: x + 1 + r() * 4, y: y + 4.6, id: 40 + stalls.length, wear: pick(WEARS) } });
    }
  const aisles: Souk['aisles'] = [];
  for (let y = q.y + 3 + 7.8; y < q.y + q.h; y += 10) aisles.push({ y, x0: q.x + 1.5, x1: q.x + q.w - 1.5 });
  const onRoad = (x: number, y: number) => w.roads.some((rd) => inRect(rd.rect, x, y, 0.4));
  const free = (x: number, y: number) => !buildingAt(w, x, y) && !onRoad(x, y);
  // Vendors on mats along the front of the Covered Market, and in the lane between it and the souk.
  const pave: Souk['pave'] = [];
  const hall = w.buildings.find((b) => b.name === 'Covered Market');
  if (hall) {
    const h = hall.rects[0];
    for (const yy of [h.y + h.h + 2.2, h.y - 2.6])
      for (let x = h.x + 3; x < h.x + h.w - 2; x += 6.5 + r() * 3) {
        if (!free(x, yy) || !free(x + 1.2, yy)) continue;
        const [a, b] = pick(RUGS);
        const goods: Ent[] = [g('mat', x, yy, a, 2, 1.2, { col2: b })];
        const what = r();
        for (let i = 0; i < 4; i++) goods.push(what < 0.4 ? g('pile', x - 0.7 + i * 0.47, yy + 0.1, pick(PRODUCE), 0.3, 0.2) : what < 0.7 ? g('pot', x - 0.7 + i * 0.47, yy, '#b87333', 0.2, 0.2) : g('bolt', x - 0.7 + i * 0.47, yy, pick(CLOTH), 0.2, 0.7));
        pave.push({ x: x + 1.3, y: yy - 0.2, goods, id: 70 + pave.length, wear: pick(WEARS) });
      }
  }
  // A juice stand under a parasol, a grill with its smoke, and handcarts at the edges.
  const extras: Ent[] = [];
  const corner = (x: number, y: number, e: Ent[]) => {
    if (free(x, y)) extras.push(...e);
  };
  corner(q.x + q.w - 2.5, q.y + 1.6, [g('umbrella', q.x + q.w - 2.5, q.y + 1.6, '#e0a526', 1.6, 2.4), g('pile', q.x + q.w - 3.2, q.y + 1.7, '#e8892b', 0.5, 0.35), g('pile', q.x + q.w - 1.9, q.y + 1.7, '#e6c44a', 0.45, 0.3)]);
  corner(q.x + 2.5, q.y + 1.6, [g('umbrella', q.x + 2.5, q.y + 1.6, '#b8483a', 1.5, 2.3), g('grill', q.x + 2.5, q.y + 1.5, '#3a3530', 1.4, 0.5)]);
  for (const [x, y, c] of [
    [q.x + 20, q.y + q.h - 1.2, '#6f9a3a'],
    [q.x + 50, q.y + q.h - 1.2, '#e8892b'],
    [q.x + q.w + 1.5, q.y + 26, '#c9372b'],
  ] as const)
    if (free(x, y)) extras.push(g('handcart', x, y, c, 1.6, 0.9, { a: y > q.y + q.h - 2 ? 0 : Math.PI / 2 }));
  return { stalls, aisles, pave, extras, rect: q };
}

/** How busy the souk is at this hour, 0..1: from first light, busiest mid-morning and before sunset. */
const busy = (h: number) => (h < 6.5 || h >= 21.5 ? 0 : h < 9 ? (h - 6.5) / 2.5 * 0.8 : h < 13 ? 0.8 + 0.2 * Math.sin(((h - 9) / 4) * Math.PI) : h < 15 ? 0.6 : h < 19.5 ? 0.9 : 0.9 - ((h - 19.5) / 2) * 0.75);

export function soukScene(c: SceneCtx, out: Ent[]) {
  if (cacheFor !== c.world) {
    cacheFor = c.world;
    cache = build(c.world);
  }
  const S = cache;
  if (!S) return;
  const q = S.rect;
  if (c.away && Math.hypot(q.x + q.w / 2 - c.away.x, q.y + q.h / 2 - c.away.y) < c.away.r + 30) return; // a strike here: everyone has fled
  const h = ((c.hour % 24) + 24) % 24;
  const b = busy(h);
  const open = b > 0.05;
  const t = c.time;
  for (const s of S.stalls) {
    if (!open) {
      // Shut for the night: a cloth pulled over each counter.
      out.push({ t: 'goods', kind: 'cover', x: s.x + 3, y: s.y + 5.4, a: 0, col: '#8a8272', w: 5.4, h: 1.1 });
      continue;
    }
    out.push(...s.goods);
    out.push({ t: 'person', x: s.seller.x, y: s.seller.y, face: Math.PI / 2, id: s.seller.id, wear: s.seller.wear, sit: s.seller.id % 3 === 0 });
  }
  if (open)
    for (const v of S.pave) {
      out.push(...v.goods);
      out.push({ t: 'person', x: v.x, y: v.y, face: -Math.PI / 2, id: v.id, wear: v.wear, sit: true });
      // Someone looking at what's on the mat.
      if ((v.id + Math.floor(t / 20)) % 3 !== 0) out.push({ t: 'person', x: v.x - 1.4, y: v.y + 1.6, face: -Math.PI / 2, id: v.id + 200, wear: WEARS[(v.id * 7) % WEARS.length], carry: v.id % 2 === 0 });
    }
  // Strings of paper flags down every aisle, day and night.
  S.aisles.forEach((a, i) => out.push({ t: 'bunting', x0: a.x0 + 1, y0: a.y - 0.4, x1: a.x1 - 1, y1: a.y + 0.4, z: 3.6, seed: i }));
  out.push(...S.extras.filter((e) => open || (e.t === 'goods' && e.kind === 'handcart')));
  if (open) {
    const grill = S.extras.find((e): e is Extract<Ent, { t: 'goods' }> => e.t === 'goods' && e.kind === 'grill');
    if (grill) out.push({ t: 'smoke', x: grill.x, y: grill.y, z: 1, seed: 77, strength: 0.6, dark: 0.1, size: 0.7 });
  }
  if (!open) return;
  // The aisles: people browsing along the stalls, stopping, turning back, carrying bags; more of them at the busy hours.
  const n = Math.round(26 * b);
  S.aisles.forEach((a, ai) => {
    const len = a.x1 - a.x0;
    for (let i = 0; i < n; i++) {
      const k = ai * 97 + i * 13;
      const r1 = ((k * 9301 + 49297) % 233280) / 233280;
      const r2 = ((k * 7331 + 12345) % 233280) / 233280;
      const speed = 0.35 + r1 * 0.6;
      // Some stand at a stall a while; the rest walk the aisle one way, then the other.
      const stop = r2 < 0.35;
      const lane = (r2 - 0.5) * 3.2;
      let x: number;
      let face: number;
      if (stop) {
        x = a.x0 + r1 * len;
        face = r2 < 0.18 ? -Math.PI / 2 : Math.PI / 2; // looking at the stalls on one side or the other
      } else {
        const u = (t * speed + r1 * len * 2) % (len * 2);
        const back = u > len;
        x = back ? a.x1 - (u - len) : a.x0 + u;
        face = back ? Math.PI : 0;
      }
      out.push({ t: 'person', x, y: a.y + lane, face, id: 120 + k, wear: WEARS[k % WEARS.length], carry: r1 > 0.62 });
    }
  });
  // And across the souk between the rows, cutting through.
  for (let i = 0; i < Math.round(10 * b); i++) {
    const r1 = ((i * 5113 + 71) % 1000) / 1000;
    const col = Math.floor(r1 * 8);
    const x = q.x + 3 + col * 8.5 + 7.2;
    const u = (t * (0.5 + r1 * 0.4) + i * 17) % (q.h * 2);
    const y = u < q.h ? q.y + u : q.y + q.h * 2 - u;
    out.push({ t: 'person', x, y, face: u < q.h ? Math.PI / 2 : -Math.PI / 2, id: 300 + i, wear: WEARS[(i * 5) % WEARS.length], carry: i % 3 === 0 });
  }
}
