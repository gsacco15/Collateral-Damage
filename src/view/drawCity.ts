// Draws the static city in world coordinates onto a context that's already scaled (1 unit = 1 metre).
// Used twice: once into a large world-sized cache for smooth panning, and again sharp for the current view.
import { riverX, rng, shownCount, type Building, type Population, type Rect, type Space, type World } from '../jev';
import { C, grade, nightness, shade, sun, type Sun } from './paper';

export interface CityOpts {
  hour: number;
  pop: Population;
  damaged: Set<number>;
  crater: { x: number; y: number; r: number } | null;
  view: Rect; // world rect to draw (culling)
  scale: number; // device pixels per metre, for detail decisions
}

const visible = (v: Rect, q: Rect, pad = 30) => q.x < v.x + v.w + pad && q.x + q.w > v.x - pad && q.y < v.y + v.h + pad && q.y + q.h > v.y - pad;

export function drawCity(g: CanvasRenderingContext2D, w: World, o: CityOpts, shadowCtx: CanvasRenderingContext2D | null) {
  const sh = sun(o.hour);
  const v = o.view;

  // Paper table beyond the city.
  g.fillStyle = C.street;
  g.fillRect(v.x - 50, v.y - 50, v.w + 100, v.h + 100);
  // Blocks beyond the edge, so the city doesn't stop at the frame.
  g.fillStyle = C.pavement;
  for (let bx = -3; bx < 13; bx++)
    for (let by = -3; by < 10; by++) {
      const x = bx * 110 - 50;
      const y = by * 110 - 50;
      if (x > -120 && x < w.w + 10 && y > -120 && y < w.h + 10) continue;
      g.fillRect(x + 6, y + 6, 98, 98);
    }
  // Blocks.
  for (const bl of w.blocks) {
    if (!visible(v, bl)) continue;
    g.fillStyle = C.pavement;
    g.fillRect(bl.x, bl.y, bl.w, bl.h);
    g.fillStyle = bl.district === 'tinhill' ? '#d9ccb6' : bl.district === 'oldtown' ? '#e3d6c0' : C.ground;
    g.fillRect(bl.x + 2.6, bl.y + 2.6, bl.w - 5.2, bl.h - 5.2);
  }
  // The canal's quays.
  g.fillStyle = C.quay;
  g.fillRect(696, -60, 98, w.h + 120);
  drawRiver(g, w, v);

  // Roads.
  for (const rd of w.roads) {
    if (!visible(v, rd.rect)) continue;
    const q = rd.rect;
    if (rd.kind === 'bridge') {
      g.fillStyle = 'rgba(40,40,40,0.18)';
      g.fillRect(q.x, q.y + q.h, q.w, 3);
      g.fillStyle = '#b9b1a6';
      g.fillRect(q.x, q.y - 1.2, q.w, q.h + 2.4);
      g.fillStyle = C.road;
      g.fillRect(q.x, q.y + 1, q.w, q.h - 2);
      g.fillStyle = '#e9e2d5';
      g.fillRect(q.x, q.y - 1.2, q.w, 1);
      g.fillRect(q.x, q.y + q.h + 0.2, q.w, 1);
    } else if (rd.kind === 'boulevard') {
      g.fillStyle = C.road;
      g.fillRect(q.x, q.y + 1.5, q.w, q.h - 3);
      g.fillStyle = '#c9c0ad';
      g.fillRect(q.x, q.y + q.h / 2 - 2, q.w, 4); // the median
    }
    if (rd.kind !== 'street') {
      g.strokeStyle = C.lane;
      g.lineWidth = 0.4;
      g.setLineDash([3.2, 3.2]);
      g.beginPath();
      const mid = rd.kind === 'boulevard' ? [q.y + q.h * 0.28, q.y + q.h * 0.72] : [q.y + q.h / 2];
      for (const y of mid) {
        g.moveTo(q.x, y);
        g.lineTo(q.x + q.w, y);
      }
      g.stroke();
      g.setLineDash([]);
    }
  }
  // The roundabout and its fountain.
  const rb = w.roundabout;
  g.fillStyle = C.road;
  g.beginPath();
  g.arc(rb.x, rb.y, rb.r + 4, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = C.grass;
  g.beginPath();
  g.arc(rb.x, rb.y, rb.r - 6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#e8e1d2';
  g.beginPath();
  g.arc(rb.x, rb.y, 6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = C.water;
  g.beginPath();
  g.arc(rb.x, rb.y, 4.2, 0, Math.PI * 2);
  g.fill();

  // Open spaces.
  for (const s of w.spaces) if (visible(v, s.rect)) drawSpace(g, s, o.scale);

  if (o.crater) {
    const grd = g.createRadialGradient(o.crater.x, o.crater.y, 0, o.crater.x, o.crater.y, o.crater.r * 2.4);
    grd.addColorStop(0, 'rgba(40,32,26,0.85)');
    grd.addColorStop(0.35, 'rgba(60,48,38,0.55)');
    grd.addColorStop(1, 'rgba(60,48,38,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(o.crater.x, o.crater.y, o.crater.r * 2.4, 0, Math.PI * 2);
    g.fill();
  }

  // Shadows go into their own layer so they can be softened and never double up.
  if (shadowCtx) {
    shadowCtx.fillStyle = '#000';
    for (const b of w.buildings) {
      if (!visible(v, b.rects[0], 60)) continue;
      const h = o.damaged.has(b.id) ? b.h * 0.3 : b.h;
      if (b.round) {
        const q = b.rects[0];
        const cx = q.x + q.w / 2;
        const cy = q.y + q.h / 2;
        for (let k = 0; k <= 8; k++) {
          shadowCtx.beginPath();
          shadowCtx.arc(cx + (sh.dx * h * k) / 8, cy + (sh.dy * h * k) / 8, q.w / 2, 0, Math.PI * 2);
          shadowCtx.fill();
        }
      } else for (const q of b.rects) castRect(shadowCtx, q.x, q.y, q.w, q.h, sh.dx * h, sh.dy * h);
    }
    for (const wl of w.walls) if (visible(v, wl)) castRect(shadowCtx, wl.x, wl.y, Math.max(wl.w, 0.5), Math.max(wl.h, 0.5), sh.dx * 2.4, sh.dy * 2.4);
    for (const t of w.trees) {
      if (t.x < v.x - 30 || t.x > v.x + v.w + 30 || t.y < v.y - 30 || t.y > v.y + v.h + 30) continue;
      const len = t.kind === 'cypress' ? 7 : t.kind === 'palm' ? 7 : 4.5;
      for (let k = 0; k <= 5; k++) {
        shadowCtx.beginPath();
        shadowCtx.arc(t.x + sh.dx * (k / 5) * len, t.y + sh.dy * (k / 5) * len, t.r * (t.kind === 'cypress' ? 0.8 : 0.95), 0, Math.PI * 2);
        shadowCtx.fill();
      }
    }
  }
}

/** The rest of the static city, drawn after the shadows have been composited. */
export function drawCityTop(g: CanvasRenderingContext2D, w: World, o: CityOpts) {
  const sh = sun(o.hour);
  const v = o.view;
  // Walls.
  g.fillStyle = '#e9e3d7';
  for (const wl of w.walls) if (visible(v, wl)) g.fillRect(wl.x, wl.y, Math.max(wl.w, 0.55), Math.max(wl.h, 0.55));
  for (const t of w.trees) if (t.x > v.x - 10 && t.x < v.x + v.w + 10 && t.y > v.y - 10 && t.y < v.y + v.h + 10) drawTree(g, t.x, t.y, t.r, t.kind, sh);
  for (const b of w.buildings) if (visible(v, b.rects[0], 10)) drawBuilding(g, b, sh, o.damaged.has(b.id), o.scale);
}

/** Paper grain, the colour of the hour, and lights at night. Screen-space, after the city. */
export function finishCity(g: CanvasRenderingContext2D, w: World, o: CityOpts, pattern: CanvasPattern | null, width: number, height: number, toWorld: [number, number, number, number, number, number]) {
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (pattern) {
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = 0.85;
    g.fillStyle = pattern;
    g.fillRect(0, 0, width, height);
  }
  const gr = grade(o.hour);
  g.globalAlpha = gr.s;
  g.fillStyle = `rgb(${gr.rgb.join(',')})`;
  g.fillRect(0, 0, width, height);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  const night = nightness(o.hour);
  if (night > 0.05) {
    g.globalCompositeOperation = 'screen';
    g.setTransform(...toWorld);
    const v = o.view;
    for (const b of w.buildings) {
      if (o.damaged.has(b.id) || !visible(v, b.rects[0], 10)) continue;
      const n = shownCount(o.pop, b);
      if (!n) continue;
      const q = b.rects[0];
      const lr = rng(b.id * 31 + 7);
      const lights = b.kind === 'shack' ? (lr() < 0.6 ? 1 : 0) : Math.min(b.kind === 'apartment' ? 7 : 4, Math.ceil(n / 3));
      for (let i = 0; i < lights; i++) {
        const side = Math.floor(lr() * 4);
        const u = 0.12 + lr() * 0.76;
        const x = side === 0 ? q.x + q.w * u : side === 1 ? q.x + q.w + 0.4 : side === 2 ? q.x + q.w * u : q.x - 0.4;
        const y = side === 0 ? q.y - 0.4 : side === 1 ? q.y + q.h * u : side === 2 ? q.y + q.h + 0.4 : q.y + q.h * u;
        const rad = b.kind === 'shack' ? 2 + lr() : 3 + lr() * 2 + (b.kind === 'apartment' ? 1.5 : 0);
        const grd = g.createRadialGradient(x, y, 0, x, y, rad);
        grd.addColorStop(0, `rgba(255,190,110,${0.5 * night})`);
        grd.addColorStop(1, 'rgba(255,190,110,0)');
        g.fillStyle = grd;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
    }
    // Street lamps on the boulevard, the quays and the bridges.
    const lamp = (x: number, y: number, r: number, a: number) => {
      if (x < v.x - 10 || x > v.x + v.w + 10 || y < v.y - 10 || y > v.y + v.h + 10) return;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, `rgba(255,214,150,${a * night})`);
      grd.addColorStop(1, 'rgba(255,214,150,0)');
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    for (let x = 12; x < w.w; x += 24) {
      lamp(x, 350 - 10.5, 7, 0.42);
      lamp(x, 350 + 10.5, 7, 0.42);
    }
    for (let y = 10; y < w.h; y += 26) {
      lamp(riverX(y) - 24, y, 6, 0.35);
      lamp(riverX(y) + 24, y, 6, 0.35);
    }
    g.globalCompositeOperation = 'source-over';
  }
  g.restore();
}

function drawRiver(g: CanvasRenderingContext2D, w: World, v: Rect) {
  const half = w.river.width / 2;
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let y = Math.max(-60, v.y - 40); y <= Math.min(w.h + 60, v.y + v.h + 40); y += 4) {
    const x = riverX(y);
    left.push([x - half, y]);
    right.push([x + half, y]);
  }
  if (!left.length) return;
  // Stone edge, then water, then a few paper ripples.
  const poly = (pad: number) => {
    g.beginPath();
    left.forEach(([x, y], i) => (i ? g.lineTo(x - pad, y) : g.moveTo(x - pad, y)));
    for (let i = right.length - 1; i >= 0; i--) g.lineTo(right[i][0] + pad, right[i][1]);
    g.closePath();
  };
  g.fillStyle = '#b8ad9b';
  poly(1.6);
  g.fill();
  const grd = g.createLinearGradient(left[0][0], 0, right[0][0], 0);
  grd.addColorStop(0, C.water);
  grd.addColorStop(0.5, C.waterDeep);
  grd.addColorStop(1, C.water);
  g.fillStyle = grd;
  poly(0);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.28)';
  g.lineWidth = 0.35;
  const r = rng(12);
  for (let y = left[0][1]; y < left[left.length - 1][1]; y += 9) {
    const x = riverX(y) + (r() - 0.5) * w.river.width * 0.6;
    g.beginPath();
    g.moveTo(x - 3, y);
    g.quadraticCurveTo(x, y - 1, x + 3, y);
    g.stroke();
  }
}

function drawSpace(g: CanvasRenderingContext2D, s: Space, scale: number) {
  const q = s.rect;
  const r = rng(s.id * 97 + 5);
  switch (s.kind) {
    case 'park': {
      g.fillStyle = C.grass;
      g.fillRect(q.x, q.y, q.w, q.h);
      g.strokeStyle = '#e4dccb';
      g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(q.x, q.y + q.h * 0.6);
      g.quadraticCurveTo(q.x + q.w * 0.5, q.y + q.h * 0.3, q.x + q.w, q.y + q.h * 0.45);
      g.moveTo(q.x + q.w * 0.35, q.y);
      g.quadraticCurveTo(q.x + q.w * 0.45, q.y + q.h * 0.5, q.x + q.w * 0.3, q.y + q.h);
      g.stroke();
      break;
    }
    case 'pitch': {
      g.fillStyle = '#9fb46f';
      g.fillRect(q.x, q.y, q.w, q.h);
      for (let i = 0; i < 7; i++) {
        g.fillStyle = i % 2 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)';
        g.fillRect(q.x, q.y + (i * q.h) / 7, q.w, q.h / 7);
      }
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.lineWidth = 0.4;
      g.strokeRect(q.x + 3, q.y + 3, q.w - 6, q.h - 6);
      g.beginPath();
      g.moveTo(q.x + 3, q.y + q.h / 2);
      g.lineTo(q.x + q.w - 3, q.y + q.h / 2);
      g.stroke();
      g.beginPath();
      g.arc(q.x + q.w / 2, q.y + q.h / 2, 6, 0, Math.PI * 2);
      g.stroke();
      break;
    }
    case 'cemetery': {
      g.fillStyle = '#d6cfbe';
      g.fillRect(q.x, q.y, q.w, q.h);
      g.fillStyle = '#b9b2a4';
      for (let y = q.y + 4; y < q.y + q.h - 2; y += 4) for (let x = q.x + 3; x < q.x + q.w - 2; x += 3.2) if (r() < 0.7) g.fillRect(x, y, 1.1, 2);
      break;
    }
    case 'market': {
      g.fillStyle = '#e8dcc4';
      g.fillRect(q.x, q.y, q.w, q.h);
      // Stalls under striped cloth.
      const cols = ['#b85a3c', '#4f7a8a', '#c9a44c', '#7a8a4f'];
      for (let y = q.y + 3; y < q.y + q.h - 6; y += 10)
        for (let x = q.x + 3; x < q.x + q.w - 6; x += 8.5) {
          const c = cols[Math.floor(r() * cols.length)];
          for (let i = 0; i < 4; i++) {
            g.fillStyle = i % 2 ? '#efe7d6' : c;
            g.fillRect(x + i * 1.5, y, 1.5, 5);
          }
          g.fillStyle = 'rgba(0,0,0,0.1)';
          g.fillRect(x, y + 3, 6, 2);
        }
      break;
    }
    case 'busstation':
    case 'yard': {
      g.fillStyle = s.kind === 'yard' ? '#a39b91' : '#9d958b';
      g.fillRect(q.x, q.y, q.w, q.h);
      g.strokeStyle = 'rgba(255,255,255,0.45)';
      g.lineWidth = 0.3;
      for (let x = q.x + 4; x < q.x + q.w - 2; x += 5) {
        g.beginPath();
        g.moveTo(x, q.y + 2);
        g.lineTo(x, q.y + 10);
        g.stroke();
      }
      // Parked buses or trucks.
      const long = s.kind === 'busstation' ? 11 : 8;
      for (let x = q.x + 4; x < q.x + q.w - 6; x += 7) {
        if (r() < 0.35) continue;
        const y = q.y + 14 + r() * (q.h - long - 18);
        g.fillStyle = 'rgba(40,30,20,0.25)';
        g.fillRect(x + 0.8, y + 0.8, 3.2, long);
        g.fillStyle = s.kind === 'busstation' ? (r() < 0.5 ? '#d9c38a' : '#e6e1d6') : r() < 0.5 ? '#6f7a6a' : '#8b7a5e';
        g.fillRect(x, y, 3.2, long);
        g.fillStyle = 'rgba(40,50,60,0.5)';
        g.fillRect(x + 0.4, y + 0.4, 2.4, 1.6);
      }
      break;
    }
    case 'playground': {
      g.fillStyle = '#e2d3b6';
      g.fillRect(q.x, q.y, q.w, q.h);
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.lineWidth = 0.35;
      g.strokeRect(q.x + 4, q.y + 4, Math.min(20, q.w - 8), Math.min(14, q.h - 8));
      break;
    }
    case 'courtyard':
    case 'plaza': {
      g.fillStyle = s.kind === 'courtyard' ? '#efe7d7' : '#e6dcc8';
      g.fillRect(q.x, q.y, q.w, q.h);
      if (scale > 1.5) {
        g.strokeStyle = 'rgba(150,130,100,0.18)';
        g.lineWidth = 0.15;
        for (let x = q.x; x < q.x + q.w; x += 2.5) {
          g.beginPath();
          g.moveTo(x, q.y);
          g.lineTo(x, q.y + q.h);
          g.stroke();
        }
        for (let y = q.y; y < q.y + q.h; y += 2.5) {
          g.beginPath();
          g.moveTo(q.x, y);
          g.lineTo(q.x + q.w, y);
          g.stroke();
        }
      }
      if (s.kind === 'courtyard') {
        g.fillStyle = C.water;
        g.fillRect(q.x + q.w / 2 - 2, q.y + q.h / 2 - 2, 4, 4);
      }
      break;
    }
  }
}

export function castRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, dx: number, dy: number) {
  const pts = [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
    [x + dx, y + dy],
    [x + w + dx, y + dy],
    [x + w + dx, y + h + dy],
    [x + dx, y + h + dy],
  ];
  const hull = convexHull(pts);
  g.beginPath();
  hull.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
  g.closePath();
  g.fill();
}

function convexHull(points: number[][]) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: number[][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: number[][] = [];
  for (const q of p.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function drawTree(g: CanvasRenderingContext2D, x: number, y: number, rad: number, kind: 'round' | 'cypress' | 'palm', sh: Sun) {
  const r = rng(Math.round(x * 13 + y * 7));
  if (kind === 'palm') {
    g.strokeStyle = C.tree;
    g.lineWidth = 0.55;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + r();
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a) * rad * 0.6, y + Math.sin(a) * rad * 0.6 - 0.4, x + Math.cos(a) * rad * 1.1, y + Math.sin(a) * rad * 1.1);
      g.stroke();
    }
    g.fillStyle = '#6f5a3e';
    g.beginPath();
    g.arc(x, y, 0.35, 0, Math.PI * 2);
    g.fill();
    return;
  }
  if (kind === 'cypress') {
    g.fillStyle = '#5d6d36';
    g.beginPath();
    g.ellipse(x, y, rad * 0.8, rad * 0.8, 0, 0, Math.PI * 2);
    g.fill();
    return;
  }
  const grd = g.createRadialGradient(x - sh.dx * 0.6, y - sh.dy * 0.6, rad * 0.1, x, y, rad);
  grd.addColorStop(0, C.treeLight);
  grd.addColorStop(1, C.tree);
  g.fillStyle = grd;
  g.beginPath();
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = rad * (0.85 + r() * 0.2);
    if (i === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(60,70,30,0.35)';
  g.lineWidth = 0.12;
  for (let i = 0; i < 3; i++) {
    const a = r() * Math.PI * 2;
    g.beginPath();
    g.moveTo(x + Math.cos(a) * rad * 0.1, y + Math.sin(a) * rad * 0.1);
    g.lineTo(x + Math.cos(a + 0.4) * rad * 0.8, y + Math.sin(a + 0.4) * rad * 0.8);
    g.stroke();
  }
}

const FACE: Record<Building['paper'], [string, string]> = {
  white: [C.white, C.whiteEdge],
  grey: [C.grey, C.greyEdge],
  kraft: [C.kraft, C.kraftEdge],
  tin: [C.tin, C.tinEdge],
  terracotta: [C.terracotta, C.terracottaEdge],
};

export function drawBuilding(g: CanvasRenderingContext2D, b: Building, sh: Sun, damaged: boolean, scale: number) {
  const r = rng(b.id * 977 + 3);
  const [face, edge] = FACE[b.paper];
  const lx = -sh.dx;
  const ly = -sh.dy;
  if (damaged) {
    for (const q of b.rects) {
      const pr = rng(b.id * 17 + Math.round(q.x));
      g.fillStyle = b.paper === 'kraft' ? '#8c7454' : b.paper === 'tin' ? '#7d8285' : '#b7b1a6';
      g.beginPath();
      const pts = 22;
      for (let i = 0; i < pts; i++) {
        const t = i / pts;
        const side = Math.floor(t * 4);
        const u = (t * 4) % 1;
        const j = () => (pr() - 0.5) * Math.min(q.w, q.h) * 0.22;
        const x = side === 0 ? q.x + q.w * u : side === 1 ? q.x + q.w : side === 2 ? q.x + q.w * (1 - u) : q.x;
        const y = side === 0 ? q.y : side === 1 ? q.y + q.h * u : side === 2 ? q.y + q.h : q.y + q.h * (1 - u);
        if (i === 0) g.moveTo(x + j(), y + j());
        else g.lineTo(x + j(), y + j());
      }
      g.closePath();
      g.fill();
      for (let i = 0; i < Math.min(40, (q.w * q.h) / 20); i++) {
        const x = q.x + pr() * q.w;
        const y = q.y + pr() * q.h;
        const s = 0.8 + pr() * 3;
        g.fillStyle = pr() < 0.5 ? face : pr() < 0.5 ? '#6f675d' : '#d9d3c8';
        g.save();
        g.translate(x, y);
        g.rotate(pr() * 6);
        g.fillRect(-s / 2, -s / 3, s, s * 0.66);
        g.restore();
      }
    }
    return;
  }
  if (b.round) {
    // Fuel tanks: white drums with a lit rim.
    const q = b.rects[0];
    const cx = q.x + q.w / 2;
    const cy = q.y + q.h / 2;
    const rad = q.w / 2;
    const grd = g.createRadialGradient(cx - lx * rad * 0.3, cy - ly * rad * 0.3, rad * 0.1, cx, cy, rad);
    grd.addColorStop(0, '#fbfaf6');
    grd.addColorStop(1, '#d7d2c8');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(cx, cy, rad, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#b8b1a5';
    g.lineWidth = 0.3;
    g.stroke();
    g.beginPath();
    g.arc(cx, cy, rad * 0.55, 0, Math.PI * 2);
    g.stroke();
    return;
  }
  for (const q of b.rects) {
    const grd = g.createLinearGradient(q.x + q.w / 2 - lx * q.w * 0.3, q.y + q.h / 2 - ly * q.h * 0.3, q.x + q.w / 2 + lx * q.w * 0.3, q.y + q.h / 2 + ly * q.h * 0.3);
    grd.addColorStop(0, shade(face, -0.06));
    grd.addColorStop(1, shade(face, 0.03));
    g.fillStyle = grd;
    g.fillRect(q.x, q.y, q.w, q.h);

    if (b.kind === 'warehouse' && b.paper === 'white') {
      // An accordion-folded roof.
      const strip = 2.4;
      const alongX = q.w >= q.h;
      const n = Math.ceil((alongX ? q.w : q.h) / strip);
      for (let i = 0; i < n; i++) {
        const lit = (i % 2 === 0) === (alongX ? lx > 0 : ly > 0);
        g.fillStyle = lit ? '#fbfaf7' : '#d8d4cb';
        if (alongX) g.fillRect(q.x + i * strip, q.y, Math.min(strip, q.x + q.w - (q.x + i * strip)), q.h);
        else g.fillRect(q.x, q.y + i * strip, q.w, Math.min(strip, q.y + q.h - (q.y + i * strip)));
      }
    } else if (b.paper === 'tin' || (b.kind === 'warehouse' && b.paper !== 'white') || b.kind === 'shelter') {
      // Corrugated sheet: fine ridges, a few rusty or patched panels.
      g.strokeStyle = 'rgba(60,64,66,0.22)';
      g.lineWidth = 0.14;
      const alongX = q.w < q.h;
      const step = scale > 2 ? 0.6 : 1.2;
      g.beginPath();
      if (alongX) for (let x = q.x + step; x < q.x + q.w; x += step) (g.moveTo(x, q.y), g.lineTo(x, q.y + q.h));
      else for (let y = q.y + step; y < q.y + q.h; y += step) (g.moveTo(q.x, y), g.lineTo(q.x + q.w, y));
      g.stroke();
      if (b.kind === 'shack') {
        const patches = 1 + Math.floor(r() * 2);
        for (let i = 0; i < patches; i++) {
          g.fillStyle = r() < 0.5 ? 'rgba(160,90,50,0.35)' : r() < 0.5 ? 'rgba(80,110,140,0.3)' : 'rgba(230,225,215,0.45)';
          g.fillRect(q.x + r() * q.w * 0.6, q.y + r() * q.h * 0.6, q.w * (0.25 + r() * 0.3), q.h * (0.25 + r() * 0.3));
        }
        // Stones holding the sheet down.
        g.fillStyle = '#6f675d';
        for (let i = 0; i < 3; i++) g.fillRect(q.x + 0.5 + r() * (q.w - 1), q.y + 0.5 + r() * (q.h - 1), 0.5, 0.5);
      }
    } else if (b.paper === 'terracotta') {
      // A hipped tile roof.
      const cx = q.x + q.w / 2;
      const cy = q.y + q.h / 2;
      const ridge = Math.max(0, (q.w - q.h) / 2);
      const tri = (pts: number[], col: string) => {
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
        g.closePath();
        g.fill();
      };
      tri([q.x, q.y, q.x + q.w, q.y, cx + ridge, cy, cx - ridge, cy], ly > 0 ? shade(face, -0.08) : shade(face, 0.06));
      tri([q.x, q.y + q.h, q.x + q.w, q.y + q.h, cx + ridge, cy, cx - ridge, cy], ly > 0 ? shade(face, 0.06) : shade(face, -0.08));
      tri([q.x, q.y, q.x, q.y + q.h, cx - ridge, cy], lx > 0 ? shade(face, -0.1) : shade(face, 0.02));
      tri([q.x + q.w, q.y, q.x + q.w, q.y + q.h, cx + ridge, cy], lx > 0 ? shade(face, 0.02) : shade(face, -0.1));
    } else if (b.kind === 'mosque') {
      // A dome over the prayer hall.
      const cx = q.x + q.w * 0.42;
      const cy = q.y + q.h / 2;
      const rad = Math.min(q.w, q.h) * 0.36;
      const dg = g.createRadialGradient(cx - lx * rad * 0.4, cy - ly * rad * 0.4, rad * 0.1, cx, cy, rad);
      dg.addColorStop(0, '#f0d9a6');
      dg.addColorStop(1, '#c79f5a');
      g.fillStyle = dg;
      g.beginPath();
      g.arc(cx, cy, rad, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(120,80,30,0.35)';
      g.lineWidth = 0.15;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
        g.stroke();
      }
    } else if (b.kind === 'minaret') {
      g.fillStyle = '#e8d5ae';
      g.beginPath();
      g.arc(q.x + q.w / 2, q.y + q.h / 2, q.w * 0.42, 0, Math.PI * 2);
      g.fill();
    } else if (b.kind === 'stand') {
      for (let i = 0; i < q.w; i += 1.2) {
        g.fillStyle = i % 2.4 < 1.2 ? '#cfcac1' : '#bcb6ac';
        g.fillRect(q.x + i, q.y, 1.2, q.h);
      }
    } else {
      // Flat roofs: parapets, creases, crumples.
      const kraft = b.paper === 'kraft';
      if (!kraft && r() < 0.65 && q.w > 10 && q.h > 10) {
        g.strokeStyle = shade(face, 0.04);
        g.lineWidth = 0.9;
        g.strokeRect(q.x + 0.45, q.y + 0.45, q.w - 0.9, q.h - 0.9);
        g.strokeStyle = 'rgba(90,80,70,0.22)';
        g.lineWidth = 0.18;
        g.strokeRect(q.x + 0.95, q.y + 0.95, q.w - 1.9, q.h - 1.9);
      }
      if (kraft && r() < 0.35 && q.w > 8) {
        // Crenellated parapet.
        g.fillStyle = shade(face, 0.06);
        for (let x = q.x; x < q.x + q.w - 0.5; x += 1.4) {
          g.fillRect(x, q.y, 0.7, 0.6);
          g.fillRect(x, q.y + q.h - 0.6, 0.7, 0.6);
        }
      }
      if (scale > 1.2) {
        g.strokeStyle = kraft ? 'rgba(90,60,30,0.22)' : 'rgba(120,110,100,0.16)';
        g.lineWidth = 0.14;
        for (let i = 0; i < (kraft ? 3 : 2); i++) {
          g.beginPath();
          if (r() < 0.5) {
            const x = q.x + q.w * (0.2 + r() * 0.6);
            g.moveTo(x, q.y);
            g.lineTo(x + (r() - 0.5) * 3, q.y + q.h);
          } else {
            const y = q.y + q.h * (0.2 + r() * 0.6);
            g.moveTo(q.x, y);
            g.lineTo(q.x + q.w, y + (r() - 0.5) * 3);
          }
          g.stroke();
        }
      }
      if (b.kind === 'hospital' || b.kind === 'clinic') {
        // The protective emblem on the roof.
        const cx = q.x + q.w / 2;
        const cy = q.y + q.h / 2;
        const s = Math.min(q.w, q.h) * 0.32;
        if (b.rects.indexOf(q) === 0 || b.kind === 'clinic') {
          g.fillStyle = '#f8f6f1';
          g.fillRect(cx - s * 1.1, cy - s * 1.1, s * 2.2, s * 2.2);
          g.fillStyle = '#c0392b';
          g.fillRect(cx - s * 0.28, cy - s * 0.9, s * 0.56, s * 1.8);
          g.fillRect(cx - s * 0.9, cy - s * 0.28, s * 1.8, s * 0.56);
        }
      }
      if (b.kind === 'apartment') {
        // Stairwells and a light well on big blocks.
        g.fillStyle = 'rgba(80,70,60,0.12)';
        for (let x = q.x + 8; x < q.x + q.w - 4; x += 14) g.fillRect(x, q.y + q.h / 2 - 1.2, 2.4, 2.4);
      }
    }
    // Lit and shaded edges give the box its height.
    const lw = 0.35;
    g.fillStyle = 'rgba(255,255,255,0.55)';
    if (ly < 0) g.fillRect(q.x, q.y, q.w, lw);
    else g.fillRect(q.x, q.y + q.h - lw, q.w, lw);
    if (lx < 0) g.fillRect(q.x, q.y, lw, q.h);
    else g.fillRect(q.x + q.w - lw, q.y, lw, q.h);
    g.strokeStyle = edge;
    g.lineWidth = 0.18;
    g.strokeRect(q.x, q.y, q.w, q.h);
  }
  for (const k of b.roof) {
    g.fillStyle = 'rgba(40,30,20,0.25)';
    if (k.kind === 'tank') {
      g.beginPath();
      g.arc(k.x + sh.dx * 1.5, k.y + sh.dy * 1.5, 1.1, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#9a968f';
      g.beginPath();
      g.arc(k.x, k.y, 1.1, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#6f6b64';
      g.lineWidth = 0.15;
      g.stroke();
    } else if (k.kind === 'dish') {
      g.fillStyle = '#ece9e2';
      g.beginPath();
      g.ellipse(k.x, k.y, 0.7, 0.5, 0.6, 0, Math.PI * 2);
      g.fill();
    } else {
      g.fillRect(k.x + sh.dx * 1.2, k.y + sh.dy * 1.2, 2.2, 1.6);
      g.fillStyle = '#7d7568';
      g.fillRect(k.x, k.y, 2.2, 1.6);
    }
  }
}
