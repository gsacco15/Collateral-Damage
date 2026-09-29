// The flat map's drawing of the life in the city (see lifeScene): paper boats, fishermen, people by the water,
// hookah circles and smokers, ducks, swans, dogs and cats, parked cars, buses, scooters, smoke and red lights.
import type { Walker } from './crowd';
import { HULLS, SIGNS, type Ent } from './lifeScene';

export interface Draw2D {
  time: number;
  night: number;
  animals: boolean; // close enough to see them
  traffic: boolean;
  figure: (w: Walker) => void;
  car: (x: number, y: number, horizontal: boolean, dir: 1 | -1, color: string) => void;
  px?: number; // metres per screen pixel, for things that should keep a size on screen
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
  g.scale(2.6, 2.6); // a little larger than life, like the people, so they read on the map
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

function scooter(g: CanvasRenderingContext2D, x: number, y: number, a: number, col: string, night: number, sway: number, rider = true) {
  g.save();
  g.translate(x, y);
  g.rotate(a + sway);
  g.fillStyle = 'rgba(40,30,20,0.22)';
  g.fillRect(-0.9 + 0.3, -0.25 + 0.3, 1.8, 0.5);
  g.fillStyle = '#2b2b2e';
  g.fillRect(-0.95, -0.12, 1.9, 0.24); // wheels, front to back
  g.fillStyle = col;
  g.fillRect(-0.5, -0.3, 1.1, 0.6);
  if (!rider) {
    // Parked: the seat and the handlebars.
    g.fillStyle = '#2b2b2e';
    g.fillRect(-0.35, -0.12, 0.55, 0.24);
    g.fillRect(0.45, -0.38, 0.1, 0.76);
    return void g.restore();
  }
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
    case 'cart':
      // A handcart: a wooden bed piled with its load, two wheels, the handles out front.
      shadow(1.7, 1);
      g.fillStyle = '#8a6a4a';
      g.fillRect(-0.8, -0.45, 1.6, 0.9);
      g.fillRect(-1.5, -0.35, 0.7, 0.07);
      g.fillRect(-1.5, 0.28, 0.7, 0.07);
      g.fillStyle = e.col;
      g.beginPath();
      g.ellipse(0, 0, 0.66, 0.34, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#2a2826';
      g.fillRect(0.05, -0.55, 0.4, 0.1);
      g.fillRect(0.05, 0.45, 0.4, 0.1);
      break;
    case 'bike':
      g.strokeStyle = e.col;
      g.lineWidth = 0.08;
      g.beginPath();
      g.moveTo(-0.5, 0);
      g.lineTo(0.5, 0);
      g.moveTo(0.35, -0.22);
      g.lineTo(0.35, 0.22);
      g.stroke();
      g.fillStyle = '#2a2826';
      g.fillRect(-0.72, -0.04, 0.34, 0.08);
      g.fillRect(0.38, -0.04, 0.34, 0.08);
      break;
    case 'bench':
      shadow(1.8, 0.45);
      g.fillStyle = e.col;
      g.fillRect(-0.9, -0.2, 1.8, 0.4);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(-0.9, 0.12, 1.8, 0.08);
      break;
    case 'goal':
      // A small goal: two white posts and the bar, the net a faint mesh behind.
      g.fillStyle = 'rgba(40,30,20,0.18)';
      g.fillRect(-1.5, 0.1, 3, 0.9);
      g.strokeStyle = 'rgba(255,255,255,0.45)';
      g.lineWidth = 0.04;
      g.strokeRect(-1.5, -0.8, 3, 0.8);
      g.fillStyle = e.col;
      g.fillRect(-1.55, -0.06, 3.1, 0.12);
      break;
    case 'bag':
      g.fillStyle = e.col;
      g.fillRect(-0.18, -0.13, 0.36, 0.26);
      g.fillStyle = 'rgba(0,0,0,0.2)';
      g.fillRect(-0.18, 0.05, 0.36, 0.08);
      break;
    case 'sign':
    case 'shopsign': {
      // A painted board (the school's on two posts, a shop's over its door) and what it says, in Dari, laid flat
      // like a paper label so it can be read from above.
      const wide = e.kind === 'sign' ? 2.2 : 1.8;
      g.rotate(Math.PI / 2);
      g.fillStyle = 'rgba(40,30,20,0.2)';
      g.fillRect(-wide / 2 + 0.15, 0.1, wide, 0.26);
      g.fillStyle = e.col;
      g.fillRect(-wide / 2, -0.13, wide, 0.26);
      g.rotate(-Math.PI / 2 - e.a);
      if (e.label != null) {
        // Bigger than life, like a label on a paper model, so the words can be read on the map.
        const lw = wide * 1.5;
        const ox = Math.cos(e.a) * 0.9;
        const oy = Math.sin(e.a) * 0.9;
        g.fillStyle = 'rgba(40,30,20,0.18)';
        g.fillRect(ox - lw / 2 + 0.12, oy - 0.45 + 0.12, lw, 0.9);
        g.fillStyle = 'rgba(250,246,236,0.95)';
        g.fillRect(ox - lw / 2, oy - 0.45, lw, 0.9);
        g.strokeStyle = e.col;
        g.lineWidth = 0.1;
        g.strokeRect(ox - lw / 2, oy - 0.45, lw, 0.9);
        g.fillStyle = e.col;
        g.font = `700 0.62px "Noto Naskh Arabic", "Noto Sans Arabic", "Geeza Pro", Tahoma, "DejaVu Sans", serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.direction = 'rtl';
        g.fillText(SIGNS[e.label][0], ox, oy + 0.03, lw - 0.25);
      }
      break;
    }
    case 'stovepipe':
      // A stove's chimney through the roof: a short pipe and its cap, a smudge of soot round it.
      g.fillStyle = 'rgba(40,30,20,0.18)';
      g.beginPath();
      g.arc(0.2, 0.2, 0.45, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = e.col;
      g.beginPath();
      g.arc(0, 0, 0.16, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#3a3634';
      g.beginPath();
      g.arc(0, 0, 0.08, 0, Math.PI * 2);
      g.fill();
      break;
    case 'bedding':
      shadow(1.6, 0.5);
      g.fillStyle = e.col;
      g.fillRect(-0.8, -0.25, 1.6, 0.5);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      for (let k = -0.6; k < 0.8; k += 0.4) g.fillRect(k, -0.25, 0.08, 0.5);
      break;
    case 'washline':
      g.strokeStyle = 'rgba(70,65,60,0.6)';
      g.lineWidth = 0.05;
      g.beginPath();
      g.moveTo(-2, 0);
      g.lineTo(2, 0);
      g.stroke();
      for (let k = 0; k < 4; k++) {
        g.fillStyle = k % 2 ? e.col : '#efe9dc';
        g.fillRect(-1.6 + k * 0.9, -0.05, 0.6, 0.35);
      }
      break;
    case 'ladder':
      shadow(0.5, 2);
      g.strokeStyle = e.col;
      g.lineWidth = 0.07;
      g.beginPath();
      g.moveTo(-0.2, -1);
      g.lineTo(-0.2, 1);
      g.moveTo(0.2, -1);
      g.lineTo(0.2, 1);
      for (let k = -0.8; k <= 0.8; k += 0.4) (g.moveTo(-0.2, k), g.lineTo(0.2, k));
      g.stroke();
      break;
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
    case 'wreck':
      // A dead car: rust coming through the paint, a door gone, the glass out.
      shadow(4.4, 2);
      g.fillStyle = e.col;
      g.fillRect(-2.2, -1, 4.4, 2);
      g.fillStyle = 'rgba(140,70,30,0.45)';
      g.fillRect(-1.6, -0.9, 1.1, 0.8);
      g.fillRect(0.6, 0.2, 1.3, 0.7);
      g.fillStyle = 'rgba(30,28,26,0.75)';
      g.fillRect(-1.2, -0.8, 1.9, 1.6); // no roof glass, the cabin open
      g.fillStyle = '#3a3634';
      g.fillRect(-0.4, 0.95, 1.1, 0.12); // the missing door's gap
      break;
    case 'tyrepile':
      g.strokeStyle = '#2a2826';
      g.lineWidth = 0.22;
      for (let k = 0; k < 5; k++) {
        g.beginPath();
        g.arc(((k * 37) % 7) * 0.2 - 0.6, ((k * 53) % 5) * 0.25 - 0.5, 0.34, 0, Math.PI * 2);
        g.stroke();
      }
      break;
    case 'cactus':
      g.fillStyle = e.col;
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        g.ellipse(Math.cos(k * 1.7) * 0.4, Math.sin(k * 1.7) * 0.4, 0.34, 0.22, k, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#e0a23a';
      g.fillRect(0.3, -0.35, 0.1, 0.1);
      break;
    case 'shrub':
      g.fillStyle = 'rgba(40,30,20,0.2)';
      g.beginPath();
      g.arc(0.35, 0.35, 0.9, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#5f7a45';
      g.beginPath();
      g.arc(0, 0, 0.9, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = e.col;
      for (let k = 0; k < 7; k++) g.fillRect(Math.cos(k * 2.3) * 0.55 - 0.08, Math.sin(k * 2.3) * 0.55 - 0.08, 0.16, 0.16);
      break;
    case 'pot':
      g.fillStyle = e.col;
      g.beginPath();
      g.arc(0, 0, 0.26, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#6f8f4a';
      g.beginPath();
      g.arc(0, 0, 0.2, 0, Math.PI * 2);
      g.fill();
      break;
    case 'bougain':
      // Spilling over the wall: a long magenta mass with dark leaves showing through.
      g.fillStyle = '#4f6a3a';
      g.beginPath();
      g.ellipse(0, 0, 1.6, 0.55, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = e.col;
      for (let k = 0; k < 9; k++) {
        g.beginPath();
        g.arc(-1.3 + k * 0.32, Math.sin(k * 1.9) * 0.25, 0.22, 0, Math.PI * 2);
        g.fill();
      }
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

/** A heap of junk from above: a dark mound with bits of everything showing, sheet metal, plastic, cloth, tyres. */
function junk2d(g: CanvasRenderingContext2D, x: number, y: number, s: number, seed: number) {
  let n = seed;
  const r = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
  g.fillStyle = 'rgba(40,30,20,0.25)';
  g.beginPath();
  g.ellipse(x + s * 0.3, y + s * 0.3, s, s * 0.8, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#7a6e60';
  g.beginPath();
  for (let k = 0; k <= 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const rr = s * (0.75 + r() * 0.3);
    if (k === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.85);
    else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.85);
  }
  g.fill();
  const cols = ['#c9c2b4', '#3a7a9a', '#b8483a', '#e0cfa8', '#2a2826', '#8a4a2a', '#f4f2ec', '#5f8a4a'];
  for (let k = 0; k < 6 + s * 5; k++) {
    g.fillStyle = cols[Math.floor(r() * cols.length)];
    const a = r() * Math.PI * 2;
    const d = r() * s * 0.8;
    g.save();
    g.translate(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.85);
    g.rotate(r() * 3);
    g.fillRect(-0.3, -0.15, 0.3 + r() * 0.6, 0.2 + r() * 0.3);
    g.restore();
  }
}

/** Goats, hens, pigeons and a donkey with its cart, from above, a little larger than life like everything alive. */
function beast2d(g: CanvasRenderingContext2D, e: Extract<Ent, { t: 'beast' }>, t: number) {
  g.save();
  g.translate(e.x, e.y);
  g.rotate(e.a);
  const k = e.kind === 'donkey' ? 1.7 : e.kind === 'goat' ? 1.6 : 1.8;
  g.scale(k, k);
  g.fillStyle = 'rgba(40,30,20,0.2)';
  if (e.kind === 'goat') {
    g.beginPath();
    g.ellipse(0.2, 0.2, e.lying ? 0.3 : 0.24, 0.45, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = e.col;
    g.beginPath();
    g.ellipse(0, 0, e.lying ? 0.3 : 0.22, 0.42, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(0, -0.5, 0.12, 0.18, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#5a5048';
    g.lineWidth = 0.05;
    g.beginPath();
    g.moveTo(-0.07, -0.6);
    g.lineTo(-0.14, -0.72);
    g.moveTo(0.07, -0.6);
    g.lineTo(0.14, -0.72);
    g.stroke();
  } else if (e.kind === 'chicken') {
    g.fillStyle = e.col;
    g.beginPath();
    g.ellipse(0, 0.04 + Math.sin(t * 8 + e.x) * 0.02, 0.12, 0.17, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#c23b2e';
    g.fillRect(-0.03, -0.18, 0.06, 0.06);
  } else if (e.kind === 'pigeon') {
    g.fillStyle = e.col;
    g.beginPath();
    g.ellipse(0, 0, 0.08, 0.13, 0, 0, Math.PI * 2);
    g.fill();
  } else {
    // A donkey and the cart behind it, loaded with gas bottles or greens, and whoever is walking beside it.
    g.fillStyle = '#8a6a48';
    g.fillRect(-0.55, 0.55, 1.1, 1.2);
    g.fillStyle = '#6f8f4a';
    g.fillRect(-0.45, 0.65, 0.9, 1);
    g.strokeStyle = '#3a2e28';
    g.lineWidth = 0.05;
    g.beginPath();
    g.moveTo(-0.2, 0.55);
    g.lineTo(-0.15, 0.1);
    g.moveTo(0.2, 0.55);
    g.lineTo(0.15, 0.1);
    g.stroke();
    g.fillStyle = e.col;
    g.beginPath();
    g.ellipse(0, -0.05, 0.18, 0.38, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(0, -0.5, 0.1, 0.16, 0, 0, Math.PI * 2);
    g.fill();
    g.fillRect(-0.08, -0.68, 0.04, 0.12);
    g.fillRect(0.04, -0.68, 0.04, 0.12);
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
    } else if (e.t === 'dump') {
      // Trodden ground, darker than the sand, with the tracks of the trucks that come to tip.
      g.fillStyle = 'rgba(120,105,85,0.35)';
      g.beginPath();
      g.ellipse(e.x + e.w / 2, e.y + e.h / 2, e.w * 0.55, e.h * 0.55, 0.1, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(90,75,60,0.35)';
      g.lineWidth = 0.6;
      g.beginPath();
      g.moveTo(1004, 610);
      g.quadraticCurveTo(1030, 604, e.x + 10, e.y + e.h / 2);
      g.moveTo(1004, 614);
      g.quadraticCurveTo(1030, 608, e.x + 10, e.y + e.h / 2 + 4);
      g.stroke();
    } else if (e.t === 'tarp') {
      // A blue tarp over a ridge pole, seen from above: two faces, one catching the light, a sag along the middle.
      g.save();
      g.translate(e.x, e.y);
      g.rotate(e.a);
      g.scale(e.size, e.size);
      if (e.mat) {
        g.fillStyle = '#b89a6a';
        g.fillRect(-1.6, -1.2, 3.4, 2.6);
      }
      g.fillStyle = 'rgba(40,30,20,0.25)';
      g.fillRect(-1.3 + 0.5, -1 + 0.5, 2.6, 2.2);
      g.fillStyle = e.col;
      g.fillRect(-1.3, -1, 2.6, 1.05);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(-1.3, 0.05, 2.6, 1.05);
      g.fillStyle = e.col;
      g.globalAlpha = 0.82;
      g.fillRect(-1.3, 0.05, 2.6, 1.05);
      g.globalAlpha = 1;
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 0.08;
      g.beginPath();
      g.moveTo(-1.3, 0.02);
      g.quadraticCurveTo(0, 0.18, 1.3, 0.02);
      g.stroke();
      g.restore();
    } else if (e.t === 'litter' && d.animals) {
      g.save();
      g.translate(e.x, e.y);
      g.rotate(e.a);
      g.fillStyle = e.col;
      if (e.kind === 0) {
        g.fillRect(-0.12, -0.07, 0.24, 0.14);
        g.fillStyle = 'rgba(255,255,255,0.5)';
        g.fillRect(0.1, -0.07, 0.03, 0.14);
      } else if (e.kind === 1) {
        g.globalAlpha = 0.8;
        g.fillRect(-0.22, -0.06, 0.36, 0.12);
        g.fillRect(0.14, -0.035, 0.08, 0.07);
      } else {
        g.globalAlpha = 0.85;
        g.beginPath();
        g.ellipse(0, 0, 0.3, 0.2, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    } else if (e.t === 'shed') {
      // A lock-up garage: a corrugated tin roof over block walls, its roller door up on one side.
      g.fillStyle = 'rgba(40,30,20,0.3)';
      g.fillRect(e.x + 1.2, e.y + 1.2, e.w, e.h);
      g.fillStyle = '#a4a9ab';
      g.fillRect(e.x, e.y, e.w, e.h);
      g.fillStyle = 'rgba(255,255,255,0.14)';
      for (let k = 0; k < e.w; k += 0.9) g.fillRect(e.x + k, e.y, 0.4, e.h);
      g.fillStyle = 'rgba(150,78,38,0.35)';
      g.fillRect(e.x + e.w * 0.55, e.y + 1, e.w * 0.3, e.h * 0.45);
      g.fillStyle = '#2a2826';
      if (e.door === 1) g.fillRect(e.x + e.w - 0.3, e.y + e.h * 0.2, 0.6, e.h * 0.6);
    } else if (e.t === 'container') {
      g.fillStyle = 'rgba(40,30,20,0.3)';
      g.fillRect(e.x + 0.8, e.y + 0.8, e.w, e.h);
      g.fillStyle = e.col;
      g.fillRect(e.x, e.y, e.w, e.h);
      g.fillStyle = 'rgba(0,0,0,0.14)';
      for (let k = 0.5; k < e.w; k += 0.8) g.fillRect(e.x + k, e.y, 0.25, e.h);
      g.fillStyle = 'rgba(150,78,38,0.3)';
      g.fillRect(e.x + e.w * 0.2, e.y + e.h * 0.6, e.w * 0.3, e.h * 0.3);
    } else if (e.t === 'forklift') {
      g.save();
      g.translate(e.x, e.y);
      g.rotate(e.a);
      g.fillStyle = 'rgba(40,30,20,0.25)';
      g.fillRect(-0.7, -1, 1.8, 2.2);
      g.fillStyle = '#e0b43a';
      g.fillRect(-0.8, -0.6, 1.6, 1.7);
      g.fillStyle = '#2a2826';
      g.fillRect(-0.55, -1.7, 0.18, 1.1);
      g.fillRect(0.37, -1.7, 0.18, 1.1);
      if (e.load) {
        g.fillStyle = '#b89968';
        g.fillRect(-0.7, -2.1, 1.4, 1.3);
        g.fillStyle = '#b08a5e';
        g.fillRect(-0.55, -2, 1.1, 1.1);
      }
      g.restore();
    } else if (e.t === 'junk') junk2d(g, e.x, e.y, e.size, e.seed);
    else if (e.t === 'car' && d.traffic) d.car(e.x, e.y, e.h, e.dir, e.col);
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
        if (e.carry) {
          g.fillStyle = '#b08a5e';
          g.fillRect(e.x + Math.cos(e.face) * 0.5 - 0.35, e.y + Math.sin(e.face) * 0.5 - 0.35, 0.7, 0.7);
        }
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
        g.fillStyle = e.door; // a door off another truck
        g.fillRect(e.lorry ? 1.6 : 1.2, 0.85, 0.9, 0.2);
        g.fillStyle = 'rgba(140,70,30,0.45)';
        g.fillRect(e.lorry ? 1.5 : 1.1, -1.05, 0.5, 0.35);
        g.fillStyle = e.lorry ? '#d9d4c8' : shadeHex(e.col);
        g.fillRect(e.lorry ? -3.4 : -2.6, -1.05, e.lorry ? 4.7 : 3.5, 2.1); // the bed or the box
        if (!e.lorry) {
          // Loaded high and past the sides, roped down.
          g.fillStyle = e.load;
          for (let k = 0; k < 6; k++) g.fillRect(-2.7 + (k % 3) * 1.1, -1.2 + Math.floor(k / 3) * 1.15, 1.05, 1.05);
          g.strokeStyle = 'rgba(60,45,30,0.7)';
          g.lineWidth = 0.06;
          g.beginPath();
          g.moveTo(-2.7, -1.2);
          g.lineTo(0.6, 1.1);
          g.moveTo(-2.7, 1.1);
          g.lineTo(0.6, -1.2);
          g.stroke();
        } else {
          g.fillStyle = 'rgba(140,70,30,0.3)';
          g.fillRect(-3.2, -1.05, 1.4, 2.1);
        }
        // A puff of blue-grey exhaust behind (not when parked).
        if (e.smoke >= 0) g.fillStyle = `rgba(150,150,155,${0.45 * (1 - e.smoke)})`;
        if (e.smoke >= 0) {
          g.beginPath();
          g.arc(-3.2 - e.smoke * 2.5, 0.6, 0.3 + e.smoke * 0.8, 0, Math.PI * 2);
          g.fill();
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
        if (e.h >= 16) {
          // A proper roof mast (the District Office's): a lattice triangle, guy wires out to the roof, and its
          // long ladder of a shadow laid across the roof.
          const sx = e.h * 0.35;
          const sy = e.h * 0.25;
          g.save();
          g.translate(e.x, e.y);
          g.scale(2, 2);
          g.translate(-e.x, -e.y);
          g.strokeStyle = 'rgba(40,30,20,0.28)';
          g.lineWidth = 0.35;
          g.beginPath();
          g.moveTo(e.x - 0.6, e.y + 0.4);
          g.lineTo(e.x + sx - 0.2, e.y + sy + 0.1);
          g.moveTo(e.x + 0.6, e.y - 0.4);
          g.lineTo(e.x + sx + 0.2, e.y + sy - 0.1);
          for (let k = 1; k < 9; k++) {
            const f = k / 9;
            const w = 0.6 * (1 - f * 0.7);
            g.moveTo(e.x + sx * f - w, e.y + sy * f + w * 0.7);
            g.lineTo(e.x + sx * f + w, e.y + sy * f - w * 0.7);
          }
          g.stroke();
          g.strokeStyle = 'rgba(70,65,60,0.55)';
          g.lineWidth = 0.08;
          g.beginPath();
          for (const [gx, gy] of [[-6, -5], [6, -5], [0, 7]]) {
            g.moveTo(e.x, e.y);
            g.lineTo(e.x + gx, e.y + gy);
          }
          g.stroke();
          g.strokeStyle = '#5a5550';
          g.lineWidth = 0.22;
          g.beginPath();
          g.moveTo(e.x, e.y - 1.2);
          g.lineTo(e.x + 1.05, e.y + 0.6);
          g.lineTo(e.x - 1.05, e.y + 0.6);
          g.closePath();
          g.moveTo(e.x, e.y - 1.2);
          g.lineTo(e.x, e.y + 0.6);
          g.moveTo(e.x + 1.05, e.y + 0.6);
          g.lineTo(e.x - 0.5, e.y - 0.3);
          g.stroke();
          g.fillStyle = '#4a4540';
          g.beginPath();
          g.arc(e.x, e.y, 0.4, 0, Math.PI * 2);
          g.fill();
          g.restore();
          break;
        }
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
      case 'moto':
        // The courier's red motorbike: always drawn, and a touch bigger than the others so it can be picked out.
        g.save();
        g.translate(e.x, e.y);
        g.scale(1.3, 1.3);
        scooter(g, 0, 0, e.a, e.col, n, 0, e.rider);
        g.restore();
        break;
      case 'mark':
        mark2d(g, e, t, d.px ?? 0.2);
        break;
      case 'goods':
        goods2d(g, e, d.animals, t);
        break;
      case 'bunting':
        bunting2d(g, e, t);
        break;
      case 'letter':
        break; // drawn over the smoke: see drawLetters2D
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
      case 'beast':
        if (d.animals) beast2d(g, e, t);
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

/**
 * A folded paper tag hanging over someone the mission wants you to find: a diamond, lit on one fold and shaded on
 * the other, turning slowly, with a soft ring on the ground under them. Keeps a readable size when zoomed out.
 */
function mark2d(g: CanvasRenderingContext2D, e: Extract<Ent, { t: 'mark' }>, t: number, px: number) {
  const k = Math.max(1.3, 13 * px);
  const pulse = (t * 0.8) % 1;
  g.save();
  g.strokeStyle = e.col;
  g.globalAlpha = 0.8 * (1 - pulse);
  g.lineWidth = Math.max(0.15, 2 * px);
  g.beginPath();
  g.ellipse(e.x, e.y, (1.6 + pulse * 2.2) * k * 0.6, (1.6 + pulse * 2.2) * k * 0.45, 0, 0, Math.PI * 2);
  g.stroke();
  g.globalAlpha = 1;
  const cx = e.x;
  const cy = e.y - e.z * k * 0.55 - 1.2;
  const w = 0.75 * k * Math.abs(Math.cos(e.spin)) + 0.22 * k;
  const h = 1.1 * k;
  // A thread down to them.
  g.strokeStyle = 'rgba(40,30,20,0.35)';
  g.lineWidth = Math.max(0.06, 0.6 * px);
  g.beginPath();
  g.moveTo(cx, cy + h);
  g.lineTo(e.x, e.y - 0.8);
  g.stroke();
  const left = Math.cos(e.spin) > 0;
  g.fillStyle = shade(e.col, left ? 1.12 : 0.78);
  g.beginPath();
  g.moveTo(cx, cy - h);
  g.lineTo(cx - w, cy);
  g.lineTo(cx, cy + h);
  g.closePath();
  g.fill();
  g.fillStyle = shade(e.col, left ? 0.78 : 1.12);
  g.beginPath();
  g.moveTo(cx, cy - h);
  g.lineTo(cx + w, cy);
  g.lineTo(cx, cy + h);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(40,30,20,0.4)';
  g.lineWidth = Math.max(0.05, 0.5 * px);
  g.stroke();
  g.restore();
}
function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

/** The courier's letters, drawn last, over the smoke of the strike. */
export function drawLetters2D(g: CanvasRenderingContext2D, ents: Ent[]) {
  for (const e of ents) if (e.t === 'letter') letter2d(g, e);
}

/** One of the courier's letters, in the air: an envelope, its flap folded, and its shadow on the ground below. */
function letter2d(g: CanvasRenderingContext2D, e: Extract<Ent, { t: 'letter' }>) {
  const y = e.y - e.z * 0.55;
  g.fillStyle = 'rgba(40,30,20,0.16)';
  g.fillRect(e.x - 0.8, e.y - 0.5, 1.6, 1);
  g.save();
  g.translate(e.x, y);
  g.rotate(e.a);
  g.scale(2.6, 2.6);
  g.scale(1, Math.max(0.25, Math.abs(Math.cos(e.tilt))));
  g.fillStyle = '#fbfaf6';
  g.strokeStyle = 'rgba(60,50,40,0.5)';
  g.lineWidth = 0.06;
  g.fillRect(-0.5, -0.32, 1, 0.64);
  g.strokeRect(-0.5, -0.32, 1, 0.64);
  g.beginPath();
  g.moveTo(-0.5, -0.32);
  g.lineTo(0, 0.05);
  g.lineTo(0.5, -0.32);
  g.stroke();
  g.restore();
}

/** The souk's wares, from above: counters, piles, cones, bolts, rugs, pots, bread, sacks, a parasol, a grill, a cart. */
function goods2d(g: CanvasRenderingContext2D, e: Extract<Ent, { t: 'goods' }>, close: boolean, t: number) {
  const { x, y, w, h, col } = e;
  switch (e.kind) {
    case 'counter':
    case 'cover':
      g.fillStyle = 'rgba(40,30,20,0.18)';
      g.fillRect(x - w / 2 + 0.25, y - h / 2 + 0.3, w, h);
      g.fillStyle = col;
      g.fillRect(x - w / 2, y - h / 2, w, h);
      g.fillStyle = e.kind === 'cover' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.18)';
      g.fillRect(x - w / 2, y - h / 2, w, h * 0.3);
      if (e.kind === 'cover') {
        // Roped down.
        g.strokeStyle = 'rgba(40,30,20,0.35)';
        g.lineWidth = 0.08;
        for (let k = 1; k < 4; k++) {
          g.beginPath();
          g.moveTo(x - w / 2 + (w * k) / 4, y - h / 2);
          g.lineTo(x - w / 2 + (w * k) / 4, y + h / 2);
          g.stroke();
        }
      }
      return;
    case 'rug':
    case 'mat': {
      // Laid on the ground, or hanging from the stall's front (seen from above as a narrow strip).
      const hh = e.hang ? 0.35 : h;
      g.fillStyle = col;
      g.fillRect(x - w / 2, y - hh / 2, w, hh);
      if (!close) return;
      g.strokeStyle = e.col2 ?? '#e0c46a';
      g.lineWidth = 0.1;
      g.strokeRect(x - w / 2 + 0.15, y - hh / 2 + 0.1, w - 0.3, Math.max(0.05, hh - 0.2));
      if (!e.hang && e.kind === 'rug') {
        g.fillStyle = e.col2 ?? '#e0c46a';
        g.beginPath();
        g.moveTo(x, y - h * 0.3);
        g.lineTo(x + w * 0.2, y);
        g.lineTo(x, y + h * 0.3);
        g.lineTo(x - w * 0.2, y);
        g.closePath();
        g.fill();
      }
      return;
    }
    case 'umbrella': {
      g.fillStyle = 'rgba(40,30,20,0.18)';
      g.beginPath();
      g.arc(x + 0.6, y + 0.8, w, 0, Math.PI * 2);
      g.fill();
      for (let k = 0; k < 8; k++) {
        g.fillStyle = k % 2 ? col : '#f4efe4';
        g.beginPath();
        g.moveTo(x, y);
        g.arc(x, y, w, (k / 8) * Math.PI * 2, ((k + 1) / 8) * Math.PI * 2);
        g.closePath();
        g.fill();
      }
      return;
    }
    case 'handcart': {
      g.save();
      g.translate(x, y);
      g.rotate(e.a);
      g.fillStyle = '#8a6a48';
      g.fillRect(-w / 2, -h / 2, w, h);
      g.fillStyle = col;
      for (let k = 0; k < 6; k++) {
        g.beginPath();
        g.arc(-w / 2 + 0.25 + (k % 3) * 0.5, -0.2 + Math.floor(k / 3) * 0.4, 0.2, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#2b2b2e';
      g.fillRect(-0.2, -h / 2 - 0.12, 0.4, 0.12);
      g.fillRect(-0.2, h / 2, 0.4, 0.12);
      g.restore();
      return;
    }
    case 'grill':
      g.fillStyle = col;
      g.fillRect(x - w / 2, y - h / 2, w, h);
      g.fillStyle = `rgba(255,${120 + Math.round(40 * Math.sin(t * 6))},50,0.8)`;
      g.fillRect(x - w / 2 + 0.1, y - h / 2 + 0.1, w - 0.2, h - 0.2);
      return;
  }
  if (!close) {
    // From further off, only a dab of colour.
    g.fillStyle = col;
    g.fillRect(x - w / 2, y - w / 2, w, w);
    return;
  }
  switch (e.kind) {
    case 'pile':
      // A heap of fruit: a round pile with a few highlights.
      g.fillStyle = col;
      g.beginPath();
      g.arc(x, y, w, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.arc(x - w * 0.35 + k * w * 0.35, y - w * 0.2 + (k % 2) * w * 0.3, w * 0.13, 0, Math.PI * 2);
        g.fill();
      }
      return;
    case 'cone':
      g.fillStyle = col;
      g.beginPath();
      g.arc(x, y, w, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.3)';
      g.beginPath();
      g.arc(x - w * 0.2, y - w * 0.2, w * 0.3, 0, Math.PI * 2);
      g.fill();
      return;
    case 'bolt':
      g.fillStyle = col;
      g.fillRect(x - w / 2, y - h / 2, w, h);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(x - w / 2, y - h / 2, w * 0.35, h);
      return;
    case 'pot':
      g.fillStyle = col;
      g.beginPath();
      g.arc(x, y, w, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(60,30,10,0.5)';
      g.lineWidth = 0.05;
      g.beginPath();
      g.arc(x, y, w * 0.6, 0, Math.PI * 2);
      g.stroke();
      return;
    case 'loaves':
      g.fillStyle = '#8a6a48';
      g.beginPath();
      g.arc(x, y, w, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = col;
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.arc(x - w * 0.35 + k * w * 0.35, y, w * 0.32, 0, Math.PI * 2);
        g.fill();
      }
      return;
    case 'sack':
      g.fillStyle = '#d8c8a8';
      g.beginPath();
      g.arc(x, y, w, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = col;
      g.beginPath();
      g.arc(x, y, w * 0.7, 0, Math.PI * 2);
      g.fill();
      return;
  }
}

export const BUNTING = ['#c9372b', '#e0a526', '#2f5f8a', '#5f8a4a', '#f4efe4', '#b8483a', '#7d4a8a'];
/** Paper flags on a string, seen from above: a thin line and a small triangle every metre and a bit, stirring. */
function bunting2d(g: CanvasRenderingContext2D, e: Extract<Ent, { t: 'bunting' }>, t: number) {
  const len = Math.hypot(e.x1 - e.x0, e.y1 - e.y0);
  const ux = (e.x1 - e.x0) / len;
  const uy = (e.y1 - e.y0) / len;
  g.strokeStyle = 'rgba(60,50,40,0.45)';
  g.lineWidth = 0.06;
  g.beginPath();
  g.moveTo(e.x0, e.y0 - e.z * 0.2);
  g.lineTo(e.x1, e.y1 - e.z * 0.2);
  g.stroke();
  for (let d = 0.5, k = 0; d < len; d += 1.3, k++) {
    const x = e.x0 + ux * d;
    const y = e.y0 + uy * d - e.z * 0.2;
    const sw = Math.sin(t * 2.2 + k * 0.9 + e.seed) * 0.12;
    g.fillStyle = BUNTING[(k + e.seed * 3) % BUNTING.length];
    g.beginPath();
    g.moveTo(x - 0.35 * ux, y - 0.35 * uy);
    g.lineTo(x + 0.35 * ux, y + 0.35 * uy);
    g.lineTo(x + sw, y + 0.6);
    g.closePath();
    g.fill();
  }
}
