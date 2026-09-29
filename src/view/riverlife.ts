// Life on and by the water, and the animals of the streets: paper boats (moored, fishing, rowing, under power),
// fishermen on the banks and off the bridges by day, lanterns and strollers by night, ducks and a pair of swans,
// street dogs and cats. Drawn only: none of it is in the estimate. Anything near a strike has fled.
import { inRect, riverX, rng, type Rect, type World } from '../jev';
import type { Walker, Wear } from './crowd';

export interface LifeCtx {
  world: World;
  time: number;
  hour: number;
  night: number; // 0 day .. 1 night
  px: number; // metres per screen pixel
  away: { x: number; y: number; r: number } | null; // a strike: nothing lives near it for now
  brokenBridge: Rect | null; // the boulevard bridge, once it has been dropped
  figure: (w: Walker) => void;
}

const HULLS: [string, string, string][] = [
  ['#fbfaf6', '#e6e0d3', '#cfc7b6'], // white paper
  ['#eef1f2', '#d5dcdf', '#b9c3c8'], // pale blue
  ['#efe3cb', '#dac9a8', '#bfa982'], // kraft
  ['#f4e3dc', '#e2c7bc', '#c9a79a'], // pink
  ['#e9ecdf', '#d3d9c3', '#b7bfa2'], // sage
];

const isDay = (h: number) => h >= 6 && h < 19.5;
const far = (c: LifeCtx, x: number, y: number) => !c.away || Math.hypot(x - c.away.x, y - c.away.y) > c.away.r;

/** Where a boat is on the river at time t, running at `speed` m/s down (or up) a lane `lane` metres from the centre. */
function onRiver(c: LifeCtx, speed: number, phase: number, lane: number, down: boolean) {
  const span = c.world.h + 200;
  const u = ((c.time * speed + phase) % span) - 100;
  const y = down ? u : c.world.h - u;
  const s = down ? 1 : -1;
  const x = riverX(y) + lane;
  const dx = riverX(y + s) - riverX(y);
  return { x, y, a: Math.atan2(dx, -s) };
}

function underBridge(c: LifeCtx, y: number) {
  return c.world.roads.some((r) => r.kind === 'bridge' && Math.abs(r.rect.y + r.rect.h / 2 - y) < r.rect.h / 2 + 4);
}

/** A folded paper boat seen from above, bow toward -y: two faces either side of the keel crease, and the folded tent in the middle. */
function paperBoat(g: CanvasRenderingContext2D, len: number, col: [string, string, string], sunDx: number) {
  const w = len * 0.3;
  const L = len / 2;
  g.fillStyle = 'rgba(20,30,35,0.22)';
  g.beginPath();
  g.ellipse(sunDx, 0.5, w * 1.05, L * 0.95, 0, 0, Math.PI * 2);
  g.fill();
  // Port face, lit; starboard face, in shade.
  g.fillStyle = col[0];
  g.beginPath();
  g.moveTo(0, -L);
  g.lineTo(-w, -L * 0.25);
  g.lineTo(-w * 0.9, L * 0.4);
  g.lineTo(0, L);
  g.closePath();
  g.fill();
  g.fillStyle = col[1];
  g.beginPath();
  g.moveTo(0, -L);
  g.lineTo(w, -L * 0.25);
  g.lineTo(w * 0.9, L * 0.4);
  g.lineTo(0, L);
  g.closePath();
  g.fill();
  // The folded tent in the middle, with its own little shadow.
  const t = L * 0.42;
  g.fillStyle = 'rgba(40,30,20,0.18)';
  g.beginPath();
  g.moveTo(0.35, -t + 0.3);
  g.lineTo(w * 0.62 + 0.35, 0.3);
  g.lineTo(0.35, t + 0.3);
  g.closePath();
  g.fill();
  g.fillStyle = col[0];
  g.beginPath();
  g.moveTo(0, -t);
  g.lineTo(-w * 0.55, 0);
  g.lineTo(0, t);
  g.closePath();
  g.fill();
  g.fillStyle = col[2];
  g.beginPath();
  g.moveTo(0, -t);
  g.lineTo(w * 0.55, 0);
  g.lineTo(0, t);
  g.closePath();
  g.fill();
  // Creases.
  g.strokeStyle = 'rgba(60,50,40,0.35)';
  g.lineWidth = 0.08;
  g.beginPath();
  g.moveTo(0, -L);
  g.lineTo(0, L);
  g.moveTo(-w, -L * 0.25);
  g.lineTo(-w * 0.55, 0);
  g.lineTo(-w * 0.9, L * 0.4);
  g.moveTo(w, -L * 0.25);
  g.lineTo(w * 0.55, 0);
  g.lineTo(w * 0.9, L * 0.4);
  g.stroke();
}

function ripple(g: CanvasRenderingContext2D, x: number, y: number, k: number, size: number, night: number) {
  if (k < 0 || k > 1) return;
  g.strokeStyle = `rgba(255,255,255,${(0.5 - night * 0.3) * (1 - k)})`;
  g.lineWidth = 0.12;
  g.beginPath();
  g.arc(x, y, 0.2 + k * size, 0, Math.PI * 2);
  g.stroke();
}

function lanternGlow(g: CanvasRenderingContext2D, x: number, y: number, r: number, a: number) {
  const grd = g.createRadialGradient(x, y, 0, x, y, r);
  grd.addColorStop(0, `rgba(255,205,120,${a})`);
  grd.addColorStop(1, 'rgba(255,205,120,0)');
  g.fillStyle = grd;
  g.fillRect(x - r, y - r, r * 2, r * 2);
  g.fillStyle = '#ffe2a8';
  g.beginPath();
  g.arc(x, y, 0.22, 0, Math.PI * 2);
  g.fill();
}

const WEARS: Wear[] = ['cap', 'keffiyeh', 'bare', 'turban', 'ghutra', 'bare', 'cap'];
const CLOTHS = ['#5b6b7c', '#8a7a5c', '#6e4a3a', '#d8d2c4', '#3f4a3a', '#7d6b8a', '#2f3440'];
const SKINS = ['#c8a07a', '#a8805e', '#8a6446', '#d6b08a'];
function person(id: number, x: number, y: number, facing: number, wear?: Wear): Walker {
  return { id: -1000 - id, x, y, path: [], speed: 0, skin: SKINS[id % SKINS.length], cloth: CLOTHS[id % CLOTHS.length], wear: wear ?? WEARS[id % WEARS.length], tint: ['#e9e4d8', '#6b3a2e', '#2f4f6f', '#c9b58a'][id % 4], phase: facing, kind: 'transit', zone: null, flee: 0, hurt: false, gone: false };
}

/** A rod and line from (x, y) out over the water at angle a, with a float that bobs and, now and then, dips. */
function rod(g: CanvasRenderingContext2D, c: LifeCtx, x: number, y: number, a: number, len: number, seed: number) {
  const tx = x + Math.cos(a) * len * 0.45;
  const ty = y + Math.sin(a) * len * 0.45;
  const fx = x + Math.cos(a) * len;
  const fy = y + Math.sin(a) * len;
  g.strokeStyle = 'rgba(60,45,30,0.85)';
  g.lineWidth = 0.1;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(tx, ty);
  g.stroke();
  g.strokeStyle = 'rgba(40,40,40,0.35)';
  g.lineWidth = 0.04;
  g.beginPath();
  g.moveTo(tx, ty);
  g.quadraticCurveTo((tx + fx) / 2 + Math.sin(a) * 0.6, (ty + fy) / 2 - Math.cos(a) * 0.6, fx, fy);
  g.stroke();
  const bite = Math.sin(c.time * 0.7 + seed) > 0.96;
  g.fillStyle = bite ? '#8a2a1e' : '#d4452e';
  g.beginPath();
  g.arc(fx, fy + Math.sin(c.time * 2 + seed) * 0.05, bite ? 0.14 : 0.2, 0, Math.PI * 2);
  g.fill();
  ripple(g, fx, fy, ((c.time * 0.5 + seed) % 2) / 2, 1.4, c.night);
}

export function drawRiverLife(g: CanvasRenderingContext2D, c: LifeCtx) {
  const half = c.world.river.width / 2;
  const day = isDay(c.hour);
  const sunDx = 0.5;

  // Moored along the quays, rocking a little.
  [60, 180, 262, 452, 520, 668, 750, 850].forEach((y, i) => {
    if (underBridge(c, y)) return;
    const side = i % 2 ? 1 : -1;
    const x = riverX(y) + side * (half - 2.4);
    g.save();
    g.translate(x, y);
    g.rotate(Math.sin(c.time * 0.8 + i) * 0.04 + (i % 3) * 0.05 - 0.05);
    paperBoat(g, 5.5 + (i % 3), HULLS[i % HULLS.length], sunDx);
    g.restore();
    // A rope to the quay.
    g.strokeStyle = 'rgba(90,70,50,0.6)';
    g.lineWidth = 0.07;
    g.beginPath();
    g.moveTo(x, y - 2);
    g.lineTo(x + side * 3, y - 3);
    g.stroke();
    if (c.night > 0.5 && i % 3 === 0) lanternGlow(g, x, y - 1, 3, 0.35 * c.night);
  });

  // Fishing boats, anchored, a fisherman and a line over the side. One stays out at night with a lamp.
  [
    [300, -6, 1],
    [640, 5, 2],
    [120, 4, 3],
  ].forEach(([y, lane, s], i) => {
    if ((!day && i > 0) || underBridge(c, y)) return;
    const x = riverX(y) + lane;
    if (!far(c, x, y)) return;
    const sway = Math.sin(c.time * 0.6 + s) * 0.08;
    g.save();
    g.translate(x, y);
    g.rotate(0.15 + sway);
    paperBoat(g, 6, HULLS[(i + 2) % HULLS.length], sunDx);
    g.restore();
    // The anchor rope, slanting down into the water.
    g.strokeStyle = 'rgba(90,70,50,0.5)';
    g.lineWidth = 0.06;
    g.beginPath();
    g.moveTo(x, y - 3);
    g.lineTo(x + 0.6, y - 5);
    g.stroke();
    const facing = lane < 0 ? Math.PI : 0;
    c.figure(person(20 + i, x, y + 0.6, facing));
    rod(g, c, x + Math.cos(facing) * 0.6, y + 0.6, facing + 0.3, 6.5, s * 3);
    if (!day) lanternGlow(g, x, y - 1.3, 4, 0.55 * c.night);
  });

  // Rowing boats, by day: oars dipping, a ring spreading where each one bites.
  if (day)
    for (let i = 0; i < 2; i++) {
      const { x, y, a } = onRiver(c, 0.9 + i * 0.2, 250 + i * 520, i ? 7 : -8, i === 0);
      if (underBridge(c, y) || !far(c, x, y)) continue;
      const stroke = Math.sin(c.time * 2.2 + i);
      g.save();
      g.translate(x, y);
      g.rotate(a);
      // Oars: sweep from forward to back, blades in the water on the back half.
      g.strokeStyle = 'rgba(110,80,50,0.9)';
      g.lineWidth = 0.14;
      g.beginPath();
      for (const s of [-1, 1]) {
        g.moveTo(s * 0.9, 0);
        g.lineTo(s * 3, stroke * 1.3);
      }
      g.stroke();
      if (stroke > 0.6) for (const s of [-1, 1]) ripple(g, s * 3.1, 1.3, (stroke - 0.6) * 2.5, 1, c.night);
      paperBoat(g, 5, HULLS[(i + 3) % HULLS.length], sunDx);
      g.restore();
      c.figure(person(30 + i, x, y, a + Math.PI / 2));
    }

  // Under power: faster, a churn at the stern and a V wake opening out behind. One runs at night with its lamp lit.
  for (let i = 0; i < (day ? 2 : 1); i++) {
    const { x, y, a } = onRiver(c, 2.4 + i * 0.4, 40 + i * 700, i ? -3 : 3, i === 1);
    if (underBridge(c, y) || !far(c, x, y)) continue;
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.strokeStyle = `rgba(255,255,255,${0.45 - c.night * 0.25})`;
    g.lineWidth = 0.18;
    g.beginPath();
    for (const s of [-1, 1]) {
      g.moveTo(s * 1.2, 2.2);
      g.quadraticCurveTo(s * 2.6, 7, s * 5.5, 13);
    }
    g.stroke();
    g.fillStyle = `rgba(255,255,255,${0.55 - c.night * 0.3})`;
    for (let k = 0; k < 6; k++) {
      const jx = Math.sin(c.time * 17 + k * 2.1) * 0.6;
      const jy = 3 + ((c.time * 6 + k * 0.7) % 3);
      g.beginPath();
      g.arc(jx, jy, 0.18 + 0.1 * Math.sin(k), 0, Math.PI * 2);
      g.fill();
    }
    paperBoat(g, 7, HULLS[(i + 1) % HULLS.length], sunDx);
    // A little outboard at the stern.
    g.fillStyle = '#3a3a3e';
    g.fillRect(-0.3, 3.3, 0.6, 0.7);
    g.restore();
    if (!day) lanternGlow(g, x, y, 3.5, 0.5 * c.night);
  }

  // People at the water's edge.
  const r = rng(424242);
  if (day) {
    // Fishermen on the banks: standing or on a stool, a bucket beside them.
    [90, 150, 230, 400, 480, 560, 700, 820].forEach((y, i) => {
      if (underBridge(c, y)) return;
      const side = i % 2 ? 1 : -1;
      const x = riverX(y) + side * (half + 1.2);
      if (!far(c, x, y)) return;
      const facing = side > 0 ? Math.PI : 0;
      if (i % 3 === 0) {
        g.fillStyle = 'rgba(120,90,60,0.8)';
        g.fillRect(x - 0.35, y - 0.35 + 0.8, 0.7, 0.7);
      }
      g.fillStyle = '#6f8a96';
      g.beginPath();
      g.arc(x + side * 0.2, y + 1.3, 0.3, 0, Math.PI * 2);
      g.fill();
      c.figure(person(i, x, y, facing));
      rod(g, c, x - side * 0.5, y, facing + (r() - 0.5) * 0.5, 6 + r() * 2, i * 5);
    });
    // Off the bridges: a few leaning on the rail, lines dropping to the water.
    for (const rd of c.world.roads) {
        if (rd.kind !== 'bridge' || rd.name === 'Camp footbridge') continue;
        const q = rd.rect;
        if (c.brokenBridge && inRect(c.brokenBridge, q.x + q.w / 2, q.y + q.h / 2)) continue;
        const rx = riverX(q.y + q.h / 2);
        for (let k = 0; k < 3; k++) {
          const x = rx - 10 + k * 9 + (r() - 0.5) * 3;
          const south = (k + Math.round(q.y)) % 2 === 0;
          const y = south ? q.y + q.h - 0.6 : q.y + 0.6;
          if (!far(c, x, y)) continue;
          const facing = south ? Math.PI / 2 : -Math.PI / 2;
          c.figure(person(40 + k + Math.round(q.y), x, y, facing));
          rod(g, c, x, y, facing, 7 + r() * 3, k * 3 + q.y);
        }
      }
  } else {
    // By night: a few sitting round a lantern on the quay, a night fisherman on a bridge, two walking the embankment.
    [210, 540, 760].forEach((y, i) => {
      if (underBridge(c, y)) return;
      const side = i % 2 ? -1 : 1;
      const x = riverX(y) + side * (half + 2.5);
      if (!far(c, x, y)) return;
      lanternGlow(g, x, y, 5, 0.6 * c.night);
      for (let k = 0; k < 3; k++) {
        const ang = (k / 3) * Math.PI * 2 + i;
        c.figure(person(60 + i * 3 + k, x + Math.cos(ang) * 1.3, y + Math.sin(ang) * 1.3, ang + Math.PI));
      }
    });
    const nb = c.world.roads.find((rd) => rd.kind === 'bridge' && rd.name !== 'Camp footbridge' && !(c.brokenBridge && inRect(c.brokenBridge, rd.rect.x + rd.rect.w / 2, rd.rect.y + rd.rect.h / 2)));
    if (nb) {
      const x = riverX(nb.rect.y) + 4;
      const y = nb.rect.y + nb.rect.h - 0.6;
      if (far(c, x, y)) {
        c.figure(person(70, x, y, Math.PI / 2));
        rod(g, c, x, y, Math.PI / 2, 8, 70);
        lanternGlow(g, x + 0.8, y - 0.4, 3, 0.55 * c.night);
      }
    }
    const walk = (c.time * 0.9) % 400;
    for (const d of [0, 1.1]) {
      const y = 100 + walk + d;
      if (!underBridge(c, y)) c.figure(person(80 + Math.round(d), riverX(y) - half - 3 - d * 0.8, y, Math.PI / 2));
    }
  }
}

// ---------------------------------------------------------------- animals

/** A line of ducks, mother in front; a pair of swans. Top-down, a few metres long at most. */
function duck(g: CanvasRenderingContext2D, x: number, y: number, a: number, s: number, drake: boolean, asleep: boolean) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.scale(1.8, 1.8); // a little larger than life, like the people, so they read on the map
  g.fillStyle = drake ? '#8b7358' : '#9a8062';
  g.beginPath();
  g.ellipse(0, 0.1 * s, 0.22 * s, 0.38 * s, 0, 0, Math.PI * 2);
  g.fill();
  if (!asleep) {
    g.fillStyle = drake ? '#2f6b4a' : '#7d6448';
    g.beginPath();
    g.arc(0, -0.3 * s, 0.13 * s, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e0a23a';
    g.fillRect(-0.04 * s, -0.5 * s, 0.08 * s, 0.1 * s);
  }
  g.restore();
}

function swan(g: CanvasRenderingContext2D, x: number, y: number, a: number, t: number) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.scale(1.4, 1.4); // a little larger than life, like the people, so they read on the map
  g.fillStyle = 'rgba(20,30,35,0.18)';
  g.beginPath();
  g.ellipse(0.3, 0.3, 0.55, 0.95, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fbfaf6';
  g.beginPath();
  g.ellipse(0, 0, 0.5, 0.9, 0, 0, Math.PI * 2);
  g.fill();
  // The long neck curving forward, the head bent down.
  g.strokeStyle = '#fbfaf6';
  g.lineWidth = 0.18;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(0, -0.6);
  g.quadraticCurveTo(0.35 + Math.sin(t) * 0.05, -1.1, 0.05, -1.45);
  g.stroke();
  g.lineCap = 'butt';
  g.fillStyle = '#e2742e';
  g.fillRect(-0.04, -1.68, 0.1, 0.2);
  g.restore();
}

function dog(g: CanvasRenderingContext2D, x: number, y: number, a: number, col: string, t: number, moving: boolean, lying: boolean) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.scale(1.9, 1.9); // a little larger than life, like the people, so they read on the map
  g.fillStyle = 'rgba(40,30,20,0.2)';
  g.beginPath();
  g.ellipse(0.2, 0.2, 0.3, 0.55, 0, 0, Math.PI * 2);
  g.fill();
  if (moving) {
    // Legs, trotting.
    g.strokeStyle = col;
    g.lineWidth = 0.08;
    const k = Math.sin(t * 12) * 0.12;
    g.beginPath();
    for (const [lx, ly, s] of [
      [-0.2, -0.3, 1],
      [0.2, -0.3, -1],
      [-0.2, 0.3, -1],
      [0.2, 0.3, 1],
    ])
      g.moveTo(lx, ly), g.lineTo(lx * 1.5, ly + s * k);
    g.stroke();
  }
  g.fillStyle = col;
  g.beginPath();
  g.ellipse(0, 0, lying ? 0.3 : 0.24, 0.5, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(0, -0.55, 0.17, 0, Math.PI * 2);
  g.fill();
  // Ears and tail.
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(-0.16, -0.66, 0.08, 0.1);
  g.fillRect(0.08, -0.66, 0.08, 0.1);
  g.strokeStyle = col;
  g.lineWidth = 0.08;
  g.beginPath();
  g.moveTo(0, 0.48);
  g.lineTo(Math.sin(t * (moving ? 9 : 3)) * 0.18, 0.78);
  g.stroke();
  g.restore();
}

function cat(g: CanvasRenderingContext2D, x: number, y: number, a: number, col: string, t: number, curled: boolean) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.scale(2.2, 2.2); // a little larger than life, like the people, so they read on the map
  g.fillStyle = col;
  if (curled) {
    g.beginPath();
    g.arc(0, 0, 0.2, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = col;
    g.lineWidth = 0.06;
    g.beginPath();
    g.arc(0, 0, 0.26, 0.4, 2.4);
    g.stroke();
  } else {
    g.beginPath();
    g.ellipse(0, 0.05, 0.13, 0.24, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(0, -0.24, 0.1, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(-0.09, -0.3);
    g.lineTo(-0.05, -0.4);
    g.lineTo(-0.01, -0.3);
    g.moveTo(0.01, -0.3);
    g.lineTo(0.05, -0.4);
    g.lineTo(0.09, -0.3);
    g.fill();
    g.strokeStyle = col;
    g.lineWidth = 0.05;
    g.beginPath();
    g.moveTo(0, 0.28);
    g.quadraticCurveTo(0.2 + Math.sin(t * 2) * 0.08, 0.4, 0.12, 0.55);
    g.stroke();
  }
  g.restore();
}

let dogRoutes: { x0: number; y0: number; x1: number; y1: number; col: string; speed: number; phase: number }[] | null = null;
let catSpots: { x: number; y: number; a: number; col: string }[] | null = null;
let routesFor: World | null = null;

export function drawAnimals(g: CanvasRenderingContext2D, c: LifeCtx) {
  const day = isDay(c.hour);
  const half = c.world.river.width / 2;
  // Ducks: three families on the water. By night they sleep in a huddle by the bank.
  [
    [240, 1, 5, 0.5],
    [590, -1, 4, 0.4],
    [760, 1, 6, 0.55],
  ].forEach(([y0, side, n, speed], f) => {
    let hx: number, hy: number, a: number;
    if (day) {
      const span = 180;
      const u = (c.time * speed + f * 60) % (span * 2);
      const back = u > span;
      const y = y0 + (back ? span * 2 - u : u) - span / 2;
      hx = riverX(y) + side * (half - 4 - Math.sin(c.time * 0.3 + f) * 1.5);
      hy = y;
      a = back ? 0 : Math.PI;
    } else {
      hx = riverX(y0) + side * (half - 1.5);
      hy = y0;
      a = 0;
    }
    if (underBridge(c, hy) || !far(c, hx, hy)) return;
    for (let k = 0; k < n; k++) {
      const s = k === 0 ? 1 : 0.62;
      const dy = day ? k * 0.9 * (a === 0 ? 1 : -1) : (k % 3) * 0.35;
      const dx = day ? Math.sin(c.time * 1.3 + k) * 0.25 : Math.floor(k / 3) * 0.35;
      duck(g, hx + dx, hy + dy, a + (day ? Math.sin(c.time + k) * 0.15 : k), s, k === 0 && f !== 1, !day);
      if (day && k === 0) ripple(g, hx, hy, (c.time % 1.5) / 1.5, 0.8, c.night);
    }
  });
  // A pair of swans, gliding by day; by night, tucked in by the bank.
  {
    const y = day ? 360 + Math.sin(c.time * 0.05) * 60 : 330;
    const x = riverX(y) + (day ? 2 + Math.sin(c.time * 0.11) * 4 : half - 2);
    if (!underBridge(c, y) && far(c, x, y)) {
      const a = day ? (Math.cos(c.time * 0.05) > 0 ? Math.PI : 0) : 0.3;
      swan(g, x, y, a, c.time);
      swan(g, x + 1.4, y + (a === 0 ? 1.6 : -1.6), a + 0.1, c.time + 1);
    }
  }

  // Street dogs trotting a stretch of street and back, and cats on the walls. Routes picked once.
  if (routesFor !== c.world) {
    routesFor = c.world;
    const r = rng(9091);
    const streets = c.world.roads.filter((rd) => rd.kind === 'street');
    dogRoutes = [];
    for (let i = 0; i < 7 && streets.length; i++) {
      const s = streets[Math.floor(r() * streets.length)].rect;
      const along = s.w > s.h;
      const len = 30 + r() * 40;
      const x0 = along ? s.x + r() * Math.max(1, s.w - len) : s.x + s.w * (0.25 + r() * 0.5);
      const y0 = along ? s.y + s.h * (0.25 + r() * 0.5) : s.y + r() * Math.max(1, s.h - len);
      dogRoutes.push({ x0, y0, x1: along ? x0 + len : x0, y1: along ? y0 : y0 + len, col: ['#b89a6a', '#6b5a48', '#d8c8a8', '#2f2a26'][i % 4], speed: 0.8 + r() * 0.8, phase: r() * 100 });
    }
    catSpots = [];
    const homes = c.world.buildings.filter((b) => (b.kind === 'home' || b.kind === 'shop') && (b.district === 'oldtown' || b.district === 'quarter' || b.district === 'market'));
    for (let i = 0; i < 14 && homes.length; i++) {
      const b = homes[Math.floor(r() * homes.length)];
      const q = b.rects[0];
      const corner = Math.floor(r() * 4);
      catSpots.push({ x: q.x + (corner % 2 ? q.w - 0.4 : 0.4), y: q.y + (corner > 1 ? q.h - 0.4 : 0.4), a: r() * 6, col: ['#e3d6c0', '#2c2a2a', '#c07a3a', '#8d8d8a'][i % 4] });
    }
  }
  dogRoutes!.forEach((d, i) => {
    // Trot, stop, trot back; by night most lie curled in a doorway.
    const lying = !day && i % 3 !== 0;
    const len = Math.hypot(d.x1 - d.x0, d.y1 - d.y0);
    const cycle = (len / d.speed) * 2 + 8;
    const u = (c.time + d.phase) % cycle;
    const leg = len / d.speed;
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
    if (!far(c, x, y)) return;
    const a = Math.atan2(d.x1 - d.x0, -(d.y1 - d.y0)) + (back ? Math.PI : 0);
    dog(g, x, y, a, d.col, c.time + i, moving, lying);
  });
  catSpots!.forEach((s, i) => {
    if (!far(c, s.x, s.y)) return;
    // By day curled up asleep; by night awake, sitting up and watching.
    cat(g, s.x, s.y, s.a + (day ? 0 : Math.sin(c.time * 0.4 + i) * 0.6), s.col, c.time + i, day && i % 4 !== 0);
  });
}
