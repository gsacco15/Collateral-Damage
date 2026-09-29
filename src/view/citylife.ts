// The small signs of a living city: bread ovens smoking in the early morning, cooking fires in the camp at dawn and
// dusk, generators coughing on Tin Hill when the power goes at night, flour dust over the mill, red lights winking
// on the masts and towers; cars parked along the kerbs and in the mill yard, buses working the boulevard, scooters
// weaving through the streets. Drawn only: none of it is in the estimate. Anything near a strike has gone.
import { inRect, rng, type Building, type Rect, type World } from '../jev';

export interface CityCtx {
  world: World;
  time: number;
  hour: number;
  night: number;
  damaged: Set<number>;
  away: { x: number; y: number; r: number } | null;
  brokenBridge: Rect | null;
  car: (x: number, y: number, horizontal: boolean, dir: 1 | -1, color: string, lit: boolean) => void;
}

const far = (c: CityCtx, x: number, y: number) => !c.away || Math.hypot(x - c.away.x, y - c.away.y) > c.away.r;
const CAR_COLS = ['#e7e2d8', '#6c8aa8', '#b8483a', '#2f2d2b', '#d9c9a3', '#8a9a7a', '#c9b24c', '#f4f2ec', '#9a9fa6'];

interface Plan {
  bakeries: Building[];
  tents: Building[];
  gens: Building[];
  mill: Building | undefined;
  lights: { x: number; y: number; b: Building | null; big: boolean }[];
  parked: { x: number; y: number; h: boolean; d: 1 | -1; col: string }[];
  scooters: { r: Rect; h: boolean; lane: number; speed: number; phase: number; col: string; dir: 1 | -1 }[];
}
let plan: Plan | null = null;
let planFor: World | null = null;

function makePlan(w: World): Plan {
  const r = rng(77031);
  const pickN = <T,>(xs: T[], n: number) => {
    const out: T[] = [];
    for (let i = 0; i < n && xs.length; i++) out.push(xs[Math.floor(r() * xs.length)]);
    return out;
  };
  const shops = w.buildings.filter((b) => b.kind === 'shop' && (b.district === 'market' || b.district === 'oldtown' || b.district === 'quarter'));
  const tents = w.buildings.filter((b) => b.kind === 'tent');
  const tinHill = w.buildings.filter((b) => (b.kind === 'home' || b.kind === 'shack') && b.district === 'tinhill');
  const lights: Plan['lights'] = [];
  for (const b of w.buildings) {
    if (b.kind === 'mast') lights.push({ x: b.cx, y: b.cy, b, big: true });
    if (b.name === 'Tower 7') for (const q of b.rects) lights.push({ x: q.x + 1, y: q.y + 1, b, big: false }, { x: q.x + q.w - 1, y: q.y + q.h - 1, b, big: false });
    if (b.kind === 'silo' && b.landmark) lights.push({ x: b.cx, y: b.cy, b, big: false });
    if (b.name === 'Power station stack') lights.push({ x: b.cx, y: b.cy, b, big: false });
  }
  const office = w.targets.find((t) => t.id === 'office');
  if (office?.buildingId != null) {
    const b = w.buildings[office.buildingId];
    lights.push({ x: b.cx, y: b.cy, b, big: true });
  }
  // Parked along the kerbs of the busier streets, bumper to bumper with gaps; and in rows in the mill yard.
  const streets = w.roads.filter((rd) => rd.kind === 'street' && Math.max(rd.rect.w, rd.rect.h) > 80);
  const cross = (x: number, y: number, self: Rect) => w.roads.some((rd) => rd.rect !== self && inRect(rd.rect, x, y, 3));
  const parked: Plan['parked'] = [];
  for (const rd of pickN(streets, 14)) {
    const q = rd.rect;
    const h = q.w > q.h;
    const len = h ? q.w : q.h;
    const start = r() * Math.max(1, len - 60);
    const side = r() < 0.5 ? -1 : 1;
    for (let s = start; s < Math.min(len, start + 60); s += 5.2) {
      if (r() < 0.3) continue;
      const x = h ? q.x + s : q.x + q.w / 2 + side * (q.w / 2 - 1.3);
      const y = h ? q.y + q.h / 2 + side * (q.h / 2 - 1.3) : q.y + s;
      if (cross(x, y, q)) continue;
      parked.push({ x, y, h, d: r() < 0.5 ? 1 : -1, col: CAR_COLS[Math.floor(r() * CAR_COLS.length)] });
    }
  }
  const lot = w.spaces.find((s) => s.name === 'Mill yard');
  if (lot) {
    const q = lot.rect;
    for (let row = 0; row < 3; row++)
      for (let x = q.x + 4; x < q.x + q.w - 4; x += 3)
        if (r() < 0.72) parked.push({ x, y: q.y + 8 + row * 11, h: false, d: row % 2 ? 1 : -1, col: CAR_COLS[Math.floor(r() * CAR_COLS.length)] });
  }
  const scooters: Plan['scooters'] = pickN(streets, 9).map((rd, i) => ({
    r: rd.rect,
    h: rd.rect.w > rd.rect.h,
    lane: (r() < 0.5 ? -1 : 1) * (1 + r() * 1.5),
    speed: 6 + r() * 4,
    phase: r() * 1000,
    col: ['#c23b2e', '#2f5f8a', '#e0d6c2', '#1f1f22', '#5f8a4a'][i % 5],
    dir: r() < 0.5 ? 1 : -1,
  }));
  return { bakeries: pickN(shops, 4), tents: pickN(tents, 5), gens: pickN(tinHill, 4), mill: w.buildings.find((b) => b.name === 'Flour Mill'), lights, parked, scooters };
}

/** A thin trail of smoke rising from (x, y) and drifting downwind. */
function plume(g: CanvasRenderingContext2D, time: number, x0: number, y0: number, seed: number, strength: number, dark: number, size = 1) {
  if (strength <= 0.01) return;
  for (let k = 0; k < 7; k++) {
    const u = (time * 0.07 + k / 7 + seed * 0.37) % 1;
    const x = x0 + u * 16 * size + Math.sin(u * 7 + k + seed) * 0.8;
    const y = y0 - u * 7 * size + Math.cos(u * 5 + k) * 0.6;
    const rad = (0.6 + u * 3.2) * size;
    const a = Math.pow(1 - u, 1.3) * 0.34 * strength;
    const c = Math.round(150 - dark * 90 + u * 60);
    g.fillStyle = `rgba(${c},${c - 3},${c - 6},${a})`;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }
}

const bell = (h: number, a: number, b: number) => (h >= a && h < b ? Math.sin(((h - a) / (b - a)) * Math.PI) : 0);

function bus(g: CanvasRenderingContext2D, x: number, y: number, dir: 1 | -1, night: number, col: string) {
  g.save();
  g.translate(x, y);
  if (dir < 0) g.rotate(Math.PI);
  g.fillStyle = 'rgba(40,30,20,0.25)';
  g.fillRect(-5.2, -1.1, 11, 2.8);
  g.fillStyle = col;
  g.fillRect(-5.5, -1.3, 11, 2.6);
  g.fillStyle = 'rgba(255,255,255,0.22)';
  g.fillRect(-5.5, -1.3, 11, 1.2);
  // Windows along both sides, lit at night; the roof hatch and the aircon box.
  g.fillStyle = night > 0.4 ? `rgba(255,220,150,${0.5 + night * 0.4})` : 'rgba(40,50,62,0.55)';
  for (let i = 0; i < 6; i++) {
    g.fillRect(-4.6 + i * 1.5, -1.3, 1.1, 0.35);
    g.fillRect(-4.6 + i * 1.5, 0.95, 1.1, 0.35);
  }
  g.fillStyle = 'rgba(40,50,62,0.7)';
  g.fillRect(4.8, -1.1, 0.6, 2.2); // windscreen
  g.fillStyle = '#d9d4c8';
  g.fillRect(-1.5, -0.6, 2.4, 1.2);
  g.fillStyle = night > 0.2 ? '#fff4d6' : 'rgba(255,250,235,0.8)';
  g.fillRect(5.45, -1.1, 0.2, 0.4);
  g.fillRect(5.45, 0.7, 0.2, 0.4);
  g.restore();
}

function scooter(g: CanvasRenderingContext2D, x: number, y: number, a: number, col: string, night: number, sway: number) {
  g.save();
  g.translate(x, y);
  g.rotate(a + sway);
  g.fillStyle = 'rgba(40,30,20,0.22)';
  g.fillRect(-0.9 + 0.3, -0.25 + 0.3, 1.8, 0.5);
  g.fillStyle = '#2b2b2e';
  g.fillRect(-0.95, -0.12, 1.9, 0.24); // wheels, front to back
  g.fillStyle = col;
  g.fillRect(-0.5, -0.3, 1.1, 0.6);
  // The rider: shoulders and a helmet (or not).
  g.fillStyle = '#4a4a50';
  g.beginPath();
  g.ellipse(-0.1, 0, 0.28, 0.42, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = col === '#1f1f22' ? '#c9c2b4' : '#1f1f22';
  g.beginPath();
  g.arc(0.05, 0, 0.2, 0, Math.PI * 2);
  g.fill();
  if (night > 0.3) {
    const grd = g.createRadialGradient(1.2, 0, 0, 1.2, 0, 3.2);
    grd.addColorStop(0, `rgba(255,240,200,${0.45 * night})`);
    grd.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = grd;
    g.fillRect(0.9, -1.6, 3.4, 3.2);
  }
  g.restore();
}

export function drawCityLife(g: CanvasRenderingContext2D, c: CityCtx) {
  if (planFor !== c.world) {
    planFor = c.world;
    plan = makePlan(c.world);
  }
  const p = plan!;
  const h = c.hour % 24;
  const t = c.time;
  const alive = (b: Building | null | undefined) => b && !c.damaged.has(b.id) && far(c, b.cx, b.cy);

  // Parked cars: there day and night, lights off.
  for (const v of p.parked) if (far(c, v.x, v.y)) c.car(v.x, v.y, v.h, v.d, v.col, false);

  // Smoke: bread ovens before dawn into the morning, cooking fires in the camp, generators on Tin Hill at night, mill dust by day.
  p.bakeries.forEach((b, i) => alive(b) && plume(g, t, b.cx, b.cy, i + 1, bell(h, 3.5, 11) + 0.4 * bell(h, 16, 19.5), 0.25));
  p.tents.forEach((b, i) => alive(b) && plume(g, t, b.cx, b.cy, i + 7, bell(h, 5.5, 8.5) + bell(h, 17, 20.5), 0.55, 0.8));
  p.gens.forEach((b, i) => alive(b) && plume(g, t, b.cx + 1.5, b.cy, i + 13, (h >= 20 || h < 5 ? 1 : 0) * (Math.sin(t * 0.03 + i) > -0.3 ? 0.9 : 0), 0.85, 0.6));
  if (alive(p.mill)) plume(g, t, p.mill!.cx - 10, p.mill!.cy, 21, bell(h, 6, 18) * 0.8, 0, 1.3);

  // Buses working the boulevard, in and out of the bus station: stop, pull away, turn round at the ends.
  const station = c.world.spaces.find((s) => s.kind === 'busstation');
  const west = 40;
  const east = c.brokenBridge ? 688 : 980;
  const stops = [160, 330, station ? station.rect.x + station.rect.w / 2 : 635, 860].filter((s) => s < east);
  const running = h >= 5 && h < 23.5;
  if (running)
    for (let i = 0; i < 2; i++) {
      const len = east - west;
      const speed = 7;
      const lap = (len / speed) * 2 + stops.length * 2 * 5;
      let u = (t + i * lap * 0.5) % lap;
      // Walk the route: out east with stops, back west with stops.
      let x = west;
      let dir: 1 | -1 = 1;
      const legs: [number, number][] = [];
      const east1 = [west, ...stops, east];
      for (let k = 0; k < east1.length - 1; k++) legs.push([east1[k], east1[k + 1]]);
      const route = [...legs, ...legs.map(([a, b]) => [b, a] as [number, number]).reverse()];
      for (const [a, b] of route) {
        const tt = Math.abs(b - a) / speed;
        if (u < tt) {
          x = a + (b - a) * (u / tt);
          dir = b > a ? 1 : -1;
          u = -1;
          break;
        }
        u -= tt;
        if (u < 5) {
          x = b;
          dir = b > a ? 1 : -1;
          u = -1;
          break;
        }
        u -= 5;
      }
      const y = 350 + (dir > 0 ? 4 : -4);
      if (far(c, x, y)) bus(g, x, y, dir, c.night, i ? '#d9c38a' : '#6f9a8a');
    }

  // Scooters, quick and weaving, fewer late at night.
  p.scooters.forEach((s, i) => {
    if (!(h >= 6 && h < 23) && i % 3) return;
    const len = s.h ? s.r.w : s.r.h;
    const u = (((t * s.speed + s.phase) % len) + len) % len;
    const along = s.dir > 0 ? u : len - u;
    const x = s.h ? s.r.x + along : s.r.x + s.r.w / 2 + s.lane;
    const y = s.h ? s.r.y + s.r.h / 2 + s.lane : s.r.y + along;
    if (!far(c, x, y) || (c.brokenBridge && inRect(c.brokenBridge, x, y, 2))) return;
    const a = s.h ? (s.dir > 0 ? 0 : Math.PI) : s.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    scooter(g, x, y, a, s.col, c.night, Math.sin(t * 1.3 + i) * 0.12);
  });

  // Red lights on the masts, the tower and the stacks: winking, brighter after dark.
  for (const L of p.lights) {
    if (L.b && c.damaged.has(L.b.id)) continue;
    const on = Math.sin(t * 3 + L.x * 0.1) > 0.2;
    if (!on) continue;
    const a = 0.45 + c.night * 0.55;
    if (c.night > 0.3) {
      const rad = L.big ? 5 : 3;
      const grd = g.createRadialGradient(L.x, L.y, 0, L.x, L.y, rad);
      grd.addColorStop(0, `rgba(255,60,40,${0.5 * c.night})`);
      grd.addColorStop(1, 'rgba(255,60,40,0)');
      g.fillStyle = grd;
      g.fillRect(L.x - rad, L.y - rad, rad * 2, rad * 2);
    }
    g.fillStyle = `rgba(230,40,30,${a})`;
    g.beginPath();
    g.arc(L.x, L.y, L.big ? 0.55 : 0.4, 0, Math.PI * 2);
    g.fill();
  }
}
