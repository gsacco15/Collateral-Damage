// The flat map's drawing of the life in the city (see lifeScene): paper boats, fishermen, people by the water,
// hookah circles and smokers, ducks, swans, dogs and cats, parked cars, buses, scooters, smoke and red lights.
import type { Walker } from './crowd';
import { HULLS, type Ent } from './lifeScene';

export interface Draw2D {
  time: number;
  night: number;
  animals: boolean; // close enough to see them
  traffic: boolean;
  figure: (w: Walker) => void;
  car: (x: number, y: number, horizontal: boolean, dir: 1 | -1, color: string) => void;
}

const CLOTHS = ['#5b6b7c', '#8a7a5c', '#6e4a3a', '#d8d2c4', '#3f4a3a', '#7d6b8a', '#2f3440'];
const SKINS = ['#c8a07a', '#a8805e', '#8a6446', '#d6b08a'];
const WEARS = ['cap', 'keffiyeh', 'bare', 'turban', 'ghutra', 'bare', 'cap'] as const;
export function asWalker(e: Extract<Ent, { t: 'person' }>): Walker {
  const id = e.id;
  return { id: -1000 - id, x: e.x, y: e.y, path: [], speed: 0, skin: SKINS[id % SKINS.length], cloth: CLOTHS[id % CLOTHS.length], wear: e.wear ?? WEARS[id % WEARS.length], tint: ['#e9e4d8', '#6b3a2e', '#2f4f6f', '#c9b58a'][id % 4], phase: e.face, kind: 'transit', zone: null, flee: 0, hurt: false, gone: false };
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

function glow(g: CanvasRenderingContext2D, x: number, y: number, r: number, a: number, col: string) {
  const grd = g.createRadialGradient(x, y, 0, x, y, r);
  grd.addColorStop(0, `rgba(${col},${a})`);
  grd.addColorStop(1, `rgba(${col},0)`);
  g.fillStyle = grd;
  g.fillRect(x - r, y - r, r * 2, r * 2);
  g.fillStyle = '#ffe2a8';
  g.beginPath();
  g.arc(x, y, 0.22, 0, Math.PI * 2);
  g.fill();
}

/** A rod and line from (x, y) out over the water at angle a, with a float that bobs and, now and then, dips. */
function rod(g: CanvasRenderingContext2D, c: { time: number; night: number }, x: number, y: number, a: number, len: number, seed: number) {
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

function bus(g: CanvasRenderingContext2D, x: number, y: number, dir: 1 | -1, night: number, col: string, v = false) {
  g.save();
  g.translate(x, y);
  if (v) g.rotate(dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  else if (dir < 0) g.rotate(Math.PI);
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


/** A curl of smoke from a cigarette or a hookah: two or three faint puffs, rising and drifting. */
function wisp(g: CanvasRenderingContext2D, x: number, y: number, t: number, seed: number) {
  for (let k = 0; k < 3; k++) {
    const u = (t * 0.35 + k / 3 + seed) % 1;
    g.fillStyle = `rgba(235,232,226,${0.5 * (1 - u)})`;
    g.beginPath();
    g.arc(x + u * 2.2 + Math.sin(u * 8 + seed) * 0.3, y - u * 1.4, 0.18 + u * 0.55, 0, Math.PI * 2);
    g.fill();
  }
}

/** A hookah on a low table: a round brass base, the glass, a glowing coal on top, the hose curling out. */
function hookah(g: CanvasRenderingContext2D, x: number, y: number, t: number, seed: number, night: number) {
  g.fillStyle = 'rgba(40,30,20,0.2)';
  g.beginPath();
  g.arc(x + 0.25, y + 0.25, 0.55, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#6fa0a8';
  g.beginPath();
  g.arc(x, y, 0.5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#c9a44c';
  g.beginPath();
  g.arc(x, y, 0.26, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = night > 0.3 ? '#ff7a3a' : '#c2522c';
  g.beginPath();
  g.arc(x, y, 0.12, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#3a2e28';
  g.lineWidth = 0.07;
  g.beginPath();
  g.moveTo(x, y);
  g.quadraticCurveTo(x + 0.8, y + 0.9, x + 1.1, y + 0.4);
  g.stroke();
  wisp(g, x, y - 0.2, t, seed);
}

const shadeHex = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * 0.82);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

/** Yard clutter, seen from above: oil drums, gas bottles, jerrycans, pallets, tyres, crates, sacks, skips. */
function clutter2d(g: CanvasRenderingContext2D, e: Extract<Ent, { t: 'clutter' }>) {
  g.save();
  g.translate(e.x, e.y);
  g.rotate(e.a);
  g.fillStyle = 'rgba(40,30,20,0.22)';
  const shadow = (w: number, h: number) => g.fillRect(-w / 2 + 0.25, -h / 2 + 0.25, w, h);
  switch (e.kind) {
    case 'drum':
      shadow(0.7, 0.7);
      g.fillStyle = e.col;
      g.beginPath();
      g.arc(0, 0, 0.34, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 0.05;
      g.beginPath();
      g.arc(0, 0, 0.26, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath();
      g.arc(0.12, -0.1, 0.05, 0, Math.PI * 2);
      g.fill();
      break;
    case 'gas':
      g.fillStyle = e.col;
      g.beginPath();
      g.arc(0, 0, 0.2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#6a6560';
      g.beginPath();
      g.arc(0, 0, 0.08, 0, Math.PI * 2);
      g.fill();
      break;
    case 'jerry':
      shadow(0.34, 0.46);
      g.fillStyle = e.col;
      g.fillRect(-0.17, -0.23, 0.34, 0.46);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(-0.05, -0.23, 0.1, 0.1);
      break;
    case 'pallet':
      shadow(1.2, 1);
      g.fillStyle = '#b89968';
      for (let k = 0; k < 5; k++) g.fillRect(-0.6, -0.5 + k * 0.22, 1.2, 0.15);
      break;
    case 'tyres':
      shadow(0.9, 0.9);
      g.strokeStyle = '#2a2826';
      g.lineWidth = 0.22;
      g.beginPath();
      g.arc(0, 0, 0.34, 0, Math.PI * 2);
      g.stroke();
      break;
    case 'crate':
      shadow(0.6, 0.6);
      g.fillStyle = e.col;
      g.fillRect(-0.3, -0.3, 0.6, 0.6);
      g.strokeStyle = 'rgba(0,0,0,0.25)';
      g.lineWidth = 0.05;
      g.strokeRect(-0.3, -0.3, 0.6, 0.6);
      break;
    case 'sacks':
      g.fillStyle = e.col;
      g.beginPath();
      g.ellipse(0, 0, 0.35, 0.24, 0.3, 0, Math.PI * 2);
      g.fill();
      break;
    case 'skip':
      shadow(1.9, 1.2);
      g.fillStyle = e.col;
      g.fillRect(-0.95, -0.6, 1.9, 1.2);
      g.fillStyle = 'rgba(255,255,255,0.15)';
      g.fillRect(-0.95, -0.6, 1.9, 0.5);
      g.strokeStyle = 'rgba(0,0,0,0.3)';
      g.lineWidth = 0.06;
      g.beginPath();
      g.moveTo(-0.95, 0);
      g.lineTo(0.95, 0);
      g.stroke();
      break;
  }
  g.restore();
}

const turn = (h: boolean, dir: 1 | -1) => (h ? (dir > 0 ? 0 : Math.PI) : dir > 0 ? Math.PI / 2 : -Math.PI / 2);

/** Small flames over a fire pit or an oil drum, with their glow. */
function fire(g: CanvasRenderingContext2D, x: number, y: number, size: number, flicker: number, night: number) {
  const r = 7 * size * (1 + flicker * 0.08);
  const grd = g.createRadialGradient(x, y, 0, x, y, r);
  grd.addColorStop(0, `rgba(255,150,60,${0.55 * Math.max(0.35, night)})`);
  grd.addColorStop(1, 'rgba(255,150,60,0)');
  g.fillStyle = grd;
  g.fillRect(x - r, y - r, r * 2, r * 2);
  g.fillStyle = '#5a4030';
  g.fillRect(x - 0.7 * size, y - 0.12, 1.4 * size, 0.24);
  g.fillRect(x - 0.12, y - 0.7 * size, 0.24, 1.4 * size);
  for (let j = 0; j < 4; j++) {
    const fx = x + (j - 1.5) * 0.3 * size;
    const hgt = (1.2 + ((j * 7) % 3) * 0.4) * size * (0.8 + 0.2 * Math.sin(flicker * 3 + j));
    g.fillStyle = j % 2 ? '#ffb347' : '#ff7a2e';
    g.beginPath();
    g.moveTo(fx - 0.35 * size, y + 0.2);
    g.quadraticCurveTo(fx - 0.25 * size, y - hgt * 0.6, fx, y - hgt);
    g.quadraticCurveTo(fx + 0.25 * size, y - hgt * 0.6, fx + 0.35 * size, y + 0.2);
    g.fill();
  }
}

export function drawLife2D(g: CanvasRenderingContext2D, ents: Ent[], d: Draw2D) {
  const t = d.time;
  const n = d.night;
  // Ground things first (tables, stools, buckets, parked cars), then the water, then people and animals, then smoke and lights.
  for (const e of ents) {
    if (e.t === 'table') {
      g.fillStyle = 'rgba(40,30,20,0.2)';
      g.beginPath();
      g.arc(e.x + 0.3, e.y + 0.3, 1, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#b08a5e';
      g.beginPath();
      g.arc(e.x, e.y, 0.95, 0, Math.PI * 2);
      g.fill();
    } else if (e.t === 'stool') {
      g.fillStyle = 'rgba(120,90,60,0.8)';
      g.fillRect(e.x - 0.35, e.y - 0.35, 0.7, 0.7);
    } else if (e.t === 'bucket') {
      g.fillStyle = '#6f8a96';
      g.beginPath();
      g.arc(e.x, e.y, 0.3, 0, Math.PI * 2);
      g.fill();
    } else if (e.t === 'car' && d.traffic) d.car(e.x, e.y, e.h, e.dir, e.col);
    else if (e.t === 'clutter' && d.traffic) clutter2d(g, e);
    else if (e.t === 'chair') {
      g.fillStyle = '#8a6a48';
      g.fillRect(e.x - 0.3, e.y - 0.3, 0.6, 0.6);
    } else if (e.t === 'police' && d.traffic) {
      d.car(e.x, e.y, e.h, e.dir, '#f4f2ec');
      g.save();
      g.translate(e.x, e.y);
      g.rotate(turn(e.h, e.dir));
      g.fillStyle = '#2f5f9a';
      g.fillRect(-2.1, -0.12, 4.2, 0.24);
      g.fillStyle = e.flash === 1 ? '#ff3a2a' : '#8a2a22';
      g.fillRect(-0.35, -0.7, 0.4, 0.7);
      g.fillStyle = e.flash === 2 ? '#4a8cff' : '#223a6a';
      g.fillRect(-0.35, 0, 0.4, 0.7);
      g.restore();
      if (e.flash) {
        const col = e.flash === 1 ? '255,60,40' : '70,130,255';
        const grd = g.createRadialGradient(e.x, e.y, 0, e.x, e.y, 6);
        grd.addColorStop(0, `rgba(${col},${0.45 * d.night})`);
        grd.addColorStop(1, `rgba(${col},0)`);
        g.fillStyle = grd;
        g.fillRect(e.x - 6, e.y - 6, 12, 12);
      }
    } else if (e.t === 'engine' && d.traffic) {
      g.save();
      g.translate(e.x, e.y);
      g.rotate(turn(e.h, e.dir));
      g.fillStyle = 'rgba(40,30,20,0.25)';
      g.fillRect(-3.7, -1, 8, 2.6);
      g.fillStyle = '#c0392b';
      g.fillRect(-4, -1.25, 8, 2.5);
      g.fillStyle = '#962a20';
      g.fillRect(2.6, -1.25, 1.4, 2.5); // the cab
      g.fillStyle = 'rgba(40,50,62,0.7)';
      g.fillRect(3.7, -1.05, 0.3, 2.1);
      // The ladder along the roof.
      g.strokeStyle = '#d9d4c8';
      g.lineWidth = 0.14;
      g.beginPath();
      g.moveTo(-3.6, -0.45);
      g.lineTo(2.3, -0.45);
      g.moveTo(-3.6, 0.45);
      g.lineTo(2.3, 0.45);
      for (let k = -3.4; k < 2.3; k += 0.7) g.moveTo(k, -0.45), g.lineTo(k, 0.45);
      g.stroke();
      g.restore();
    }
  }
  for (const e of ents) {
    if (e.t !== 'boat') continue;
    g.save();
    g.translate(e.x, e.y);
    g.rotate(e.a);
    if (e.kind === 'row') {
      g.strokeStyle = 'rgba(110,80,50,0.9)';
      g.lineWidth = 0.14;
      g.beginPath();
      for (const s of [-1, 1]) {
        g.moveTo(s * 0.9, 0);
        g.lineTo(s * 3, e.stroke * 1.3);
      }
      g.stroke();
      if (e.stroke > 0.6) for (const s of [-1, 1]) ripple(g, s * 3.1, 1.3, (e.stroke - 0.6) * 2.5, 1, n);
    }
    if (e.kind === 'motor') {
      g.strokeStyle = `rgba(255,255,255,${0.45 - n * 0.25})`;
      g.lineWidth = 0.18;
      g.beginPath();
      for (const s of [-1, 1]) {
        g.moveTo(s * 1.2, 2.2);
        g.quadraticCurveTo(s * 2.6, 7, s * 5.5, 13);
      }
      g.stroke();
      g.fillStyle = `rgba(255,255,255,${0.55 - n * 0.3})`;
      for (let k = 0; k < 6; k++) {
        g.beginPath();
        g.arc(Math.sin(t * 17 + k * 2.1) * 0.6, 3 + ((t * 6 + k * 0.7) % 3), 0.18 + 0.1 * Math.sin(k), 0, Math.PI * 2);
        g.fill();
      }
    }
    paperBoat(g, e.len, HULLS[e.hull], 0.5);
    if (e.kind === 'motor') {
      g.fillStyle = '#3a3a3e';
      g.fillRect(-0.3, e.len / 2 - 0.2, 0.6, 0.7);
    }
    g.restore();
    if (e.kind === 'moor') {
      g.strokeStyle = 'rgba(90,70,50,0.6)';
      g.lineWidth = 0.07;
      g.beginPath();
      g.moveTo(e.x, e.y - 2);
      g.lineTo(e.x + e.side * 3, e.y - 3);
      g.stroke();
    }
    if (e.kind === 'fish') {
      g.strokeStyle = 'rgba(90,70,50,0.5)';
      g.lineWidth = 0.06;
      g.beginPath();
      g.moveTo(e.x, e.y - 3);
      g.lineTo(e.x + 0.6, e.y - 5);
      g.stroke();
    }
  }
  for (const e of ents) {
    switch (e.t) {
      case 'hookah':
        hookah(g, e.x, e.y, t, e.seed, n);
        break;
      case 'person':
        d.figure(asWalker(e));
        if (e.smoke) wisp(g, e.x + 0.3, e.y - 0.3, t, e.id * 0.37);
        break;
      case 'rod':
        rod(g, { time: t, night: n }, e.x, e.y, e.a, e.len, e.seed);
        break;
      case 'bus':
        if (d.traffic) bus(g, e.x, e.y, e.dir, n, e.col, e.v);
        break;
      case 'moon': {
        // A pale disc broken into ripples, the way the moon sits in moving water.
        const grd = g.createRadialGradient(e.x, e.y, 0, e.x, e.y, 9);
        grd.addColorStop(0, `rgba(250,244,225,${0.35 * e.a})`);
        grd.addColorStop(1, 'rgba(250,244,225,0)');
        g.fillStyle = grd;
        g.fillRect(e.x - 9, e.y - 9, 18, 18);
        g.fillStyle = `rgba(252,248,235,${0.85 * e.a})`;
        for (let k = -3; k <= 3; k++) {
          const w = Math.sqrt(1 - (k / 3.6) ** 2) * 4.2;
          const dx = Math.sin(t * 1.4 + k * 1.7) * 0.5;
          g.fillRect(e.x - w + dx, e.y + k * 0.9 - 0.25, w * 2 * (0.75 + 0.25 * Math.sin(t * 2 + k)), 0.5);
        }
        break;
      }
      case 'truck':
        if (!d.traffic) break;
        g.save();
        g.translate(e.x, e.y);
        g.rotate(e.a);
        g.fillStyle = 'rgba(40,30,20,0.25)';
        g.fillRect(-2.6 + 0.6, -1 + 0.6, e.lorry ? 6.2 : 5, 2.1);
        g.fillStyle = e.col;
        g.fillRect(e.lorry ? 1.4 : 1, -1.05, 1.6, 2.1); // the cab
        g.fillStyle = 'rgba(40,50,62,0.6)';
        g.fillRect(e.lorry ? 2.6 : 2.2, -0.9, 0.35, 1.8);
        g.fillStyle = e.lorry ? '#d9d4c8' : shadeHex(e.col);
        g.fillRect(e.lorry ? -3.4 : -2.6, -1.05, e.lorry ? 4.7 : 3.5, 2.1); // the bed or the box
        if (!e.lorry) {
          g.fillStyle = e.load;
          for (let k = 0; k < 4; k++) g.fillRect(-2.4 + (k % 2) * 1.5, -0.85 + Math.floor(k / 2) * 0.95, 1.3, 0.8);
        }
        g.restore();
        break;
      case 'fountain': {
        // Water thrown up from the middle and falling back in a ring of drops.
        if (!e.r) break;
        g.fillStyle = 'rgba(235,245,250,0.8)';
        for (let k = 0; k < 14; k++) {
          const a = (k / 14) * Math.PI * 2 + t * 0.3;
          const u = (t * 0.8 + k * 0.37) % 1;
          const rr = 0.4 + u * 3.2;
          g.beginPath();
          g.arc(e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr, 0.22 * (1 - u * 0.5), 0, Math.PI * 2);
          g.fill();
        }
        g.beginPath();
        g.arc(e.x, e.y, 0.6, 0, Math.PI * 2);
        g.fill();
        break;
      }
      case 'fire':
        fire(g, e.x, e.y, e.size, e.flicker, n);
        break;
      case 'flag':
        g.strokeStyle = 'rgba(40,30,20,0.35)';
        g.lineWidth = 0.12;
        g.beginPath();
        g.moveTo(e.x, e.y);
        g.lineTo(e.x + 4, e.y + 3); // the pole's shadow
        g.stroke();
        g.fillStyle = '#f4f2ec';
        g.beginPath();
        g.moveTo(e.x, e.y);
        g.quadraticCurveTo(e.x + 1.2, e.y - 0.3 + e.wave * 0.3, e.x + 2.4, e.y);
        g.lineTo(e.x + 2.4, e.y + 1.4);
        g.quadraticCurveTo(e.x + 1.2, e.y + 1.1 + e.wave * 0.3, e.x, e.y + 1.4);
        g.fill();
        g.fillStyle = '#2e6f73';
        g.fillRect(e.x, e.y + 0.45, 2.4, 0.5);
        break;
      case 'post':
        g.fillStyle = 'rgba(60,55,50,0.9)';
        g.beginPath();
        g.arc(e.x, e.y, 0.3, 0, Math.PI * 2);
        g.fill();
        if (e.lit) {
          const grd = g.createRadialGradient(e.x, e.y, 0, e.x, e.y, 10);
          grd.addColorStop(0, `rgba(255,222,160,${0.5 * n})`);
          grd.addColorStop(1, 'rgba(255,222,160,0)');
          g.fillStyle = grd;
          g.fillRect(e.x - 10, e.y - 10, 20, 20);
        }
        break;
      case 'antenna':
        if (!d.traffic) break;
        g.strokeStyle = 'rgba(70,65,60,0.8)';
        g.lineWidth = 0.1;
        g.beginPath();
        for (let k = 0; k < 3; k++) {
          const ang = (k / 3) * Math.PI * 2 + 0.4;
          g.moveTo(e.x, e.y);
          g.lineTo(e.x + Math.cos(ang) * 1.6, e.y + Math.sin(ang) * 1.6);
        }
        g.stroke();
        g.strokeStyle = 'rgba(40,30,20,0.3)';
        g.beginPath();
        g.moveTo(e.x, e.y);
        g.lineTo(e.x + e.h * 0.35, e.y + e.h * 0.25); // its long shadow on the roof
        g.stroke();
        g.fillStyle = '#6a6560';
        g.beginPath();
        g.arc(e.x, e.y, 0.35, 0, Math.PI * 2);
        g.fill();
        break;
      case 'scooter':
        if (d.traffic) scooter(g, e.x, e.y, e.a, e.col, n, e.sway);
        break;
      case 'duck':
        if (d.animals) {
          duck(g, e.x, e.y, e.a, e.s, e.drake, e.asleep);
          if (e.s === 1 && !e.asleep) ripple(g, e.x, e.y, (t % 1.5) / 1.5, 0.8, n);
        }
        break;
      case 'swan':
        if (d.animals) swan(g, e.x, e.y, e.a, t);
        break;
      case 'dog':
        if (d.animals) dog(g, e.x, e.y, e.a, e.col, t + e.x, e.moving, e.lying);
        break;
      case 'cat':
        if (d.animals) cat(g, e.x, e.y, e.a, e.col, t + e.x, e.curled);
        break;
    }
  }
  for (const e of ents) {
    if (e.t === 'smoke' && d.traffic && !e.d3) plume(g, t, e.x, e.y, e.seed, e.strength, e.dark, e.size);
    else if (e.t === 'glow') glow(g, e.x, e.y, e.r, e.a, e.col);
    else if (e.t === 'beacon' && d.traffic) {
      if (n > 0.3) {
        const rad = e.big ? 5 : 3;
        const grd = g.createRadialGradient(e.x, e.y, 0, e.x, e.y, rad);
        grd.addColorStop(0, `rgba(255,60,40,${0.5 * n})`);
        grd.addColorStop(1, 'rgba(255,60,40,0)');
        g.fillStyle = grd;
        g.fillRect(e.x - rad, e.y - rad, rad * 2, rad * 2);
      }
      g.fillStyle = `rgba(230,40,30,${0.45 + n * 0.55})`;
      g.beginPath();
      g.arc(e.x, e.y, e.big ? 0.55 : 0.4, 0, Math.PI * 2);
      g.fill();
    }
  }
}
