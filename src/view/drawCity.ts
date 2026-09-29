// Draws the static city in world coordinates onto a context that's already scaled (1 unit = 1 metre).
// Used twice: once into a large world-sized cache for smooth panning, and again sharp for the current view.
import { BRIDGE_RUIN, riverX, rng, shownCount, type Building, type Population, type Rect, type Space, type World } from '../jev';
import { C, grade, nightness, shade, sun, type Sun } from './paper';
import { brokenLights, powerCut, streetLights } from './streetLights';
import { brokenPoles, wireEnds, wiring } from './wires';
import { laid } from './textures';
import { terrain } from './terrain';

export interface CityOpts {
  hour: number;
  pop: Population;
  damaged: Set<number>;
  crater: { x: number; y: number; r: number; deep?: boolean } | null;
  blast?: { x: number; y: number; r: number } | null; // the last strike's heavy-blast radius: street lights near it are down
  view: Rect; // world rect to draw (culling)
  scale: number; // device pixels per metre, for detail decisions
}

const visible = (v: Rect, q: Rect, pad = 30) => q.x < v.x + v.w + pad && q.x + q.w > v.x - pad && q.y < v.y + v.h + pad && q.y + q.h > v.y - pad;
/** The old camp in the desert, kept clear of dunes. */
const POST_CLEAR: Rect = { x: 1160, y: 166, w: 200, h: 172 };

/** Out in the desert: the dirt track, the old camp's sand banks and tyres, a burnt-out truck, the goat pen, the well, tyre tracks. */
function drawDesert(g: CanvasRenderingContext2D, w: World, v: Rect, sh: Sun) {
  if (v.x + v.w < w.city.w) return;
  const e = w.extras;
  // The track: packed, paler sand with two ruts.
  for (const rd of w.roads) {
    if (rd.name !== 'Desert track' || !visible(v, rd.rect)) continue;
    const q = rd.rect;
    g.fillStyle = 'rgba(214,196,160,0.9)';
    g.fillRect(q.x, q.y, q.w, q.h);
    g.fillStyle = 'rgba(150,120,80,0.28)';
    g.fillRect(q.x, q.y + 1.3, q.w, 0.6);
    g.fillRect(q.x, q.y + q.h - 1.9, q.w, 0.6);
  }
  // Tyre tracks wandering across the sand.
  g.strokeStyle = 'rgba(140,110,75,0.25)';
  g.lineWidth = 0.35;
  for (const t of e.tracks) {
    for (const off of [-0.9, 0.9]) {
      g.beginPath();
      t.forEach(([x, y], i) => (i ? g.lineTo(x, y + off) : g.moveTo(x, y + off)));
      g.stroke();
    }
  }
  // The old firing range: banks of sand, lit on one side.
  for (const q of e.berms) {
    if (!visible(v, q)) continue;
    g.fillStyle = 'rgba(150,112,70,0.28)';
    g.fillRect(q.x + sh.dx * 1.5, q.y + sh.dy * 1.5, q.w, q.h);
    g.fillStyle = '#d9c197';
    g.fillRect(q.x, q.y, q.w, q.h);
    g.fillStyle = 'rgba(255,246,226,0.4)';
    g.fillRect(q.x, q.y, q.w, q.h * 0.4);
  }
  // Half-buried tyres, the old obstacle course.
  for (const t of e.tyres) {
    g.strokeStyle = '#2f2b27';
    g.lineWidth = 0.55;
    g.beginPath();
    g.arc(t.x, t.y, 1, 0, Math.PI * 2);
    g.stroke();
  }
  // A burnt-out truck.
  for (const q of e.wrecks) {
    g.fillStyle = 'rgba(40,30,20,0.3)';
    g.fillRect(q.x + sh.dx * 1.4, q.y + sh.dy * 1.4, q.w, q.h);
    g.fillStyle = '#4a3a30';
    g.fillRect(q.x, q.y, q.w, q.h);
    g.fillStyle = '#7a4a32';
    g.fillRect(q.x + 0.4, q.y + 0.6, q.w - 0.8, q.h * 0.35);
  }
  // The goat pen: a ring of thorn branches, the goats inside.
  for (const p of e.pens) {
    g.strokeStyle = 'rgba(110,85,55,0.8)';
    g.lineWidth = 0.7;
    g.setLineDash([0.8, 0.5]);
    g.beginPath();
    g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
  }
  for (const [i, gt] of e.goats.entries()) {
    g.fillStyle = i % 5 === 0 ? '#f0ebe0' : i % 3 === 0 ? '#6b5642' : '#2f2925';
    g.beginPath();
    g.ellipse(gt.x, gt.y, 0.6, 0.35, i, 0, Math.PI * 2);
    g.fill();
  }
  // The well: a ring of stones.
  for (const wl of e.wells) {
    g.fillStyle = '#a3978a';
    g.beginPath();
    g.arc(wl.x, wl.y, 1.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2d2a28';
    g.beginPath();
    g.arc(wl.x, wl.y, 0.8, 0, Math.PI * 2);
    g.fill();
  }
  // A small solar panel, for the phone and one light.
  for (const q of e.panels) {
    g.fillStyle = '#2f4a6a';
    g.fillRect(q.x, q.y, q.w, q.h);
    g.strokeStyle = 'rgba(255,255,255,0.3)';
    g.lineWidth = 0.05;
    g.strokeRect(q.x, q.y, q.w, q.h);
  }
}

export function drawCity(g: CanvasRenderingContext2D, w: World, o: CityOpts, shadowCtx: CanvasRenderingContext2D | null) {
  const sh = sun(o.hour);
  const v = o.view;

  // Paper table beyond the city.
  g.fillStyle = laid(g, 'road', 1, false);
  g.fillRect(v.x - 50, v.y - 50, v.w + 100, v.h + 100);
  // Beyond the city: one ring of outlying blocks, then open sand and dunes.
  g.fillStyle = laid(g, 'sand', 5);
  g.fillRect(v.x - 50, v.y - 50, v.w + 100, v.h + 100);
  const c = w.city;
  g.fillStyle = C.street;
  g.fillRect(-60, -60, c.w + 120, c.h + 120);
  g.fillStyle = laid(g, 'ground', 2);
  for (let bx = -1; bx < Math.ceil(c.w / 110) + 1; bx++)
    for (let by = -1; by < Math.ceil(c.h / 110) + 1; by++) {
      const x = bx * 110 - 50;
      const y = by * 110 - 50;
      if (x > -120 && x < c.w + 10 && y > -120 && y < c.h + 10) continue;
      if (x + 110 < -60 || y + 110 < -60 || x > c.w + 60 || y > c.h + 60) continue;
      g.fillRect(Math.max(x + 6, -54), Math.max(y + 6, -54), Math.min(98, c.w + 54 - Math.max(x + 6, -54)), Math.min(98, c.h + 54 - Math.max(y + 6, -54)));
    }
  drawDunes(g, w, v);
  drawTerrain(g, w, v, sh);
  drawDesert(g, w, v, sh);
  // Blocks.
  for (const bl of w.blocks) {
    if (!visible(v, bl)) continue;
    // A kerb of grey card, then the block: a sheet of paper, sandier in the old town and on Tin Hill.
    g.fillStyle = laid(g, 'grey', bl.x * 3 + bl.y);
    g.fillRect(bl.x, bl.y, bl.w, bl.h);
    g.fillStyle = 'rgba(40,30,20,0.12)';
    g.fillRect(bl.x + 2.6, bl.y + 3.2, bl.w - 5.2, bl.h - 5.2);
    g.fillStyle = laid(g, bl.district === 'tinhill' || bl.district === 'oldtown' || bl.district === 'camp' || bl.district === 'kilns' ? 'sand' : 'ground', bl.x + bl.y * 7);
    g.fill(tornPath({ x: bl.x + 2.6, y: bl.y + 2.6, w: bl.w - 5.2, h: bl.h - 5.2 }, rng(bl.x * 5 + bl.y), 0.5));
    groundPatches(g, bl);
  }
  // Dust gathers along the foot of every wall: a soft, slightly darker band on the ground round each building.
  g.fillStyle = 'rgba(120,92,60,0.1)';
  for (const b of w.buildings) {
    if (b.round || !visible(v, b.rects[0])) continue;
    for (const q of b.rects) g.fillRect(q.x - 0.9, q.y - 0.9, q.w + 1.8, q.h + 1.8);
  }
  // Dusty tyre tracks across Warehouse 14's apron, from the loading doors out to the road.
  if (visible(v, { x: 180, y: 515, w: 60, h: 30 })) {
    g.strokeStyle = 'rgba(120,95,65,0.22)';
    g.lineWidth = 0.45;
    for (const [x0, x1] of [[196, 201], [219, 213]])
      for (const off of [0, 1.9]) {
        g.beginPath();
        g.moveTo(x0 + off, 520.5);
        g.bezierCurveTo(x0 + off, 526, x1 + off, 527, x1 + off, 533);
        g.stroke();
      }
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
      g.fillStyle = laid(g, 'road', 3, false);
      g.fillRect(q.x, q.y + 1, q.w, q.h - 2);
      g.fillStyle = '#e9e2d5';
      g.fillRect(q.x, q.y - 1.2, q.w, 1);
      g.fillRect(q.x, q.y + q.h + 0.2, q.w, 1);
    } else if (rd.kind === 'boulevard') {
      g.fillStyle = laid(g, 'road', 4, false);
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
  if (o.damaged.has(BRIDGE_RUIN)) drawBrokenBridge(g, w.targets.find((t) => t.id === 'bridge')!.rect);
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
  drawOutskirts(g, w, v, sh);

  if (o.crater) {
    const grd = g.createRadialGradient(o.crater.x, o.crater.y, 0, o.crater.x, o.crater.y, o.crater.r * 2.4);
    grd.addColorStop(0, 'rgba(40,32,26,0.85)');
    grd.addColorStop(0.35, 'rgba(60,48,38,0.55)');
    grd.addColorStop(1, 'rgba(60,48,38,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(o.crater.x, o.crater.y, o.crater.r * 2.4, 0, Math.PI * 2);
    g.fill();
    if (o.crater.deep) {
      // A deep pit: a near-black core, a lit and a shaded wall, a raised rim of thrown earth, and chunks round it.
      const { x, y, r } = o.crater;
      g.fillStyle = '#1e1813';
      g.beginPath();
      g.arc(x, y, r * 0.75, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(150,128,104,0.8)';
      g.lineWidth = r * 0.28;
      g.beginPath();
      g.arc(x, y, r * 1.12, Math.PI * 0.9, Math.PI * 1.9);
      g.stroke();
      g.strokeStyle = 'rgba(90,74,58,0.85)';
      g.beginPath();
      g.arc(x, y, r * 1.12, Math.PI * 1.9, Math.PI * 2.9);
      g.stroke();
      let s = Math.round(x * 7 + y * 13);
      const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
      for (let i = 0; i < 70; i++) {
        const a = rnd() * Math.PI * 2;
        const d = r * (1.3 + rnd() * 1.6);
        const k = 0.4 + rnd() * 1.4;
        g.fillStyle = rnd() < 0.5 ? '#9a8f82' : '#6e5a47';
        g.fillRect(x + Math.cos(a) * d - k / 2, y + Math.sin(a) * d - k / 2, k, k * 0.8);
      }
    }
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
      } else
        for (const q of b.rects) {
          castRect(shadowCtx, q.x, q.y, q.w, q.h, sh.dx * h, sh.dy * h);
          // A soft contact shadow all round, as where a paper box sits on the table.
          shadowCtx.fillRect(q.x - 0.6, q.y - 0.6, q.w + 1.2, q.h + 1.2);
        }
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
  // Street lights: a thin post on the kerb, its arm out over the road, and a long shadow.
  g.lineCap = 'round';
  const broken = brokenLights(w, o.damaged, o.blast ?? null);
  streetLights(w).forEach((l, i) => {
    if (l.px < v.x - 5 || l.px > v.x + v.w + 5 || l.py < v.y - 5 || l.py > v.y + v.h + 5) return;
    const fall = broken.get(i);
    if (fall != null) {
      // Knocked flat, lying away from the blast, the lamp head smashed at its end.
      const ex = l.px + Math.cos(fall) * 6;
      const ey = l.py + Math.sin(fall) * 6;
      g.strokeStyle = 'rgba(40,30,20,0.25)';
      g.lineWidth = 0.3;
      g.beginPath();
      g.moveTo(l.px + 0.2, l.py + 0.2);
      g.lineTo(ex + 0.2, ey + 0.2);
      g.stroke();
      g.strokeStyle = '#4d4944';
      g.lineWidth = 0.2;
      g.beginPath();
      g.moveTo(l.px, l.py);
      g.lineTo(ex, ey);
      g.stroke();
      g.fillStyle = '#9a9488';
      for (let k = 0; k < 4; k++) g.fillRect(ex + Math.cos(k * 1.9) * 0.5 - 0.1, ey + Math.sin(k * 1.9) * 0.5 - 0.1, 0.2, 0.2);
      return;
    }
    g.strokeStyle = 'rgba(40,30,20,0.18)';
    g.lineWidth = 0.22;
    g.beginPath();
    g.moveTo(l.px, l.py);
    g.lineTo(l.px + sh.dx * 6, l.py + sh.dy * 6);
    g.stroke();
    g.strokeStyle = '#5c5751';
    g.lineWidth = 0.18;
    g.beginPath();
    g.moveTo(l.px, l.py);
    g.lineTo(l.x, l.y);
    g.stroke();
    g.fillStyle = '#4d4a46';
    g.beginPath();
    g.arc(l.px, l.py, 0.3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e9e2cf';
    g.fillRect(l.x - 0.3, l.y - 0.3, 0.6, 0.6);
  });
  // Power and phone lines: thin cables with their shadows on the ground, poles with a crossarm, the odd transformer.
  if (o.scale > 1.9) {
    const bp = brokenPoles(w, o.damaged, o.blast ?? null);
    const inV = (x: number, y: number) => x > v.x - 40 && x < v.x + v.w + 40 && y > v.y - 40 && y < v.y + v.h + 40;
    for (const e of wireEnds(w, bp, o.damaged)) {
      if (!inV(e.a[0], e.a[2]) && !inV(e.b[0], e.b[2])) continue;
      g.strokeStyle = 'rgba(40,30,20,0.12)';
      g.lineWidth = 0.08;
      g.beginPath();
      g.moveTo(e.a[0] + sh.dx * e.a[1], e.a[2] + sh.dy * e.a[1]);
      g.lineTo(e.b[0] + sh.dx * e.b[1], e.b[2] + sh.dy * e.b[1]);
      g.stroke();
      g.strokeStyle = e.main ? 'rgba(35,32,30,0.7)' : 'rgba(35,32,30,0.5)';
      g.lineWidth = e.main ? 0.12 : 0.07;
      g.beginPath();
      g.moveTo(e.a[0], e.a[2]);
      // A little sag, seen as a bow toward the sun's side.
      g.quadraticCurveTo((e.a[0] + e.b[0]) / 2 + sh.dx * 0.6, (e.a[2] + e.b[2]) / 2 + sh.dy * 0.6, e.b[0], e.b[2]);
      g.stroke();
    }
    wiring(w).poles.forEach((p, i) => {
      if (!inV(p.x, p.y)) return;
      const f = bp.get(i);
      if (f != null) {
        g.strokeStyle = '#5a4a3a';
        g.lineWidth = p.main ? 0.4 : 0.3;
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.lineTo(p.x + Math.cos(f) * p.h * 0.95, p.y + Math.sin(f) * p.h * 0.95);
        g.stroke();
        return;
      }
      g.strokeStyle = 'rgba(40,30,20,0.2)';
      g.lineWidth = 0.3;
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.lineTo(p.x + sh.dx * p.h, p.y + sh.dy * p.h);
      g.stroke();
      g.fillStyle = p.main ? '#6a5a48' : '#7a6650';
      g.beginPath();
      g.arc(p.x, p.y, p.main ? 0.32 : 0.24, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#4a3e34';
      g.fillRect(p.x - (p.main ? 1.1 : 0.7), p.y - 0.07, p.main ? 2.2 : 1.4, 0.14);
      if (p.can) {
        g.fillStyle = '#8a8e90';
        g.beginPath();
        g.arc(p.x + 0.4, p.y + 0.3, 0.28, 0, Math.PI * 2);
        g.fill();
      }
    });
  }
  g.lineCap = 'butt';
}

/** Paper grain, the colour of the hour, and lights at night. Screen-space, after the city. */
export function finishCity(g: CanvasRenderingContext2D, w: World, o: CityOpts, pattern: CanvasPattern | null, width: number, height: number, toWorld: [number, number, number, number, number, number]) {
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (pattern) {
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = 0.58;
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
    // Rooms lit behind the windows: many in the evening, going out one by one after midnight, a few before dawn.
    // Each window sits on the wall line, a small warm square with its light spilling out onto the street.
    const hr = ((o.hour % 24) + 24) % 24;
    const cut = powerCut(w, o.damaged);
    const share = cut ? 0.05 : hr >= 18 && hr < 23 ? 0.82 : hr >= 23 || hr < 1 ? 0.55 : hr < 5 ? 0.2 : hr < 7 ? 0.38 : 0.55;
    const bucket = Math.floor(hr * 2); // which rooms are lit changes through the night
    const warm = (x: number, y: number, rad: number, a: number, col: string) => {
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, `rgba(${col},${a * night})`);
      grd.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = grd;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    };
    for (const b of w.buildings) {
      if (o.damaged.has(b.id) || !visible(v, b.rects[0], 10)) continue;
      const n = shownCount(o.pop, b);
      const always = b.kind === 'hospital' || b.kind === 'clinic';
      if (!n && !always && b.kind !== 'mosque') continue;
      const lr = rng(b.id * 31 + 7);
      const small = b.kind === 'shack' || b.kind === 'tent';
      const rooms = b.kind === 'apartment' ? b.floors * 4 : always ? 16 : b.kind === 'office' ? 6 : small ? 1 : b.kind === 'villa' ? 5 : 4 + Math.min(4, Math.floor(b.area / 120));
      const lit = always ? 0.85 : cut ? (b.kind === 'mosque' ? 0.2 : share) : b.kind === 'office' ? (hr >= 18 && hr < 21 ? 0.3 : 0.06) : b.kind === 'shop' ? (hr >= 18 && hr < 23 ? 0.8 : 0.05) : share;
      const sw = rng(b.id * 131 + bucket * 17);
      for (const q of b.rects) {
        for (let i = 0; i < rooms; i++) {
          const side = Math.floor(lr() * 4);
          const u = 0.1 + lr() * 0.8;
          const on = sw() < lit;
          if (!on) continue;
          const x = side === 0 ? q.x + q.w * u : side === 1 ? q.x + q.w : side === 2 ? q.x + q.w * u : q.x;
          const y = side === 0 ? q.y : side === 1 ? q.y + q.h * u : side === 2 ? q.y + q.h : q.y + q.h * u;
          // Mostly warm lamps; a hospital's cool strip lights; now and then the blue of a television.
          const col = always ? '215,235,255' : cut ? '255,170,90' : sw() < 0.12 ? '160,185,255' : sw() < 0.5 ? '255,200,125' : '255,222,165';
          warm(x, y, small ? 2.4 : 3.6 + (b.kind === 'apartment' ? 1 : 0), 0.55, col);
          g.fillStyle = `rgba(${col},${0.85 * night})`;
          const along = side === 0 || side === 2;
          g.fillRect(x - (along ? 0.65 : 0.3), y - (along ? 0.3 : 0.65), along ? 1.3 : 0.6, along ? 0.6 : 1.3);
        }
      }
      if (b.kind === 'mosque' && !cut) warm(b.cx, b.cy, 18, 0.35, '200,245,210');
    }
    // Floodlights on the depot, the warehouses, the factories and the power station: cold white, all night.
    for (const b of w.buildings) {
      if (cut || o.damaged.has(b.id) || !visible(v, b.rects[0], 12)) continue;
      if (!(b.kind === 'warehouse' || b.kind === 'factory' || b.kind === 'fueltank' || b.kind === 'silo')) continue;
      const q = b.rects[0];
      if (b.kind === 'fueltank' || b.kind === 'silo') {
        warm(q.x + q.w / 2, q.y + q.h + 2, 6, 0.3, '230,240,255');
        continue;
      }
      for (const [x, y] of [
        [q.x, q.y],
        [q.x + q.w, q.y + q.h],
      ])
        warm(x, y, 9, 0.38, '230,240,255');
    }
    // Lanterns strung over the souk until late.
    for (const s of w.spaces) {
      if (cut || s.kind !== 'market' || !visible(v, s.rect, 10) || !(hr >= 17 || hr < 0.5)) continue;
      const lr = rng(s.id * 17 + 3);
      for (let i = 0; i < 14; i++) warm(s.rect.x + lr() * s.rect.w, s.rect.y + lr() * s.rect.h, 4, 0.45, '255,190,110');
    }
    // The kilns are fired through the night: a low orange glow from the vents.
    for (const b of w.buildings) {
      if (b.kind !== 'kiln' || o.damaged.has(b.id) || !visible(v, b.rects[0], 10)) continue;
      const q = b.rects[0];
      const grd = g.createRadialGradient(q.x + q.w / 2, q.y + q.h / 2, 0, q.x + q.w / 2, q.y + q.h / 2, q.w * 0.7);
      grd.addColorStop(0, `rgba(255,140,60,${0.45 * night})`);
      grd.addColorStop(1, 'rgba(255,140,60,0)');
      g.fillStyle = grd;
      g.fillRect(q.x - q.w * 0.2, q.y - q.w * 0.4, q.w * 1.4, q.h + q.w * 0.8);
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
    // Dead where the strike reached: knocked down, or standing with the cables cut.
    const dead = brokenLights(w, o.damaged, o.blast ?? null);
    streetLights(w).forEach((l, i) => {
      if (cut || l.flood || dead.has(i)) return; // the works' floodlights are drawn above, cold white
      lamp(l.x, l.y, l.r, 0.32);
    });
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
      g.fillStyle = laid(g, 'grass', s.id);
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
      if (s.district === 'camp') {
        // Bare earth, goals made of tent poles.
        g.fillStyle = laid(g, 'sand', s.id);
        g.fillRect(q.x, q.y, q.w, q.h);
        g.strokeStyle = 'rgba(255,255,255,0.35)';
        g.lineWidth = 0.3;
        g.strokeRect(q.x + 3, q.y + 3, q.w - 6, q.h - 6);
        g.fillStyle = '#6b655c';
        g.fillRect(q.x + q.w / 2 - 3, q.y + 2.4, 6, 0.4);
        g.fillRect(q.x + q.w / 2 - 3, q.y + q.h - 2.8, 6, 0.4);
        break;
      }
      g.fillStyle = laid(g, 'grass', s.id);
      g.fillRect(q.x, q.y, q.w, q.h);
      g.fillStyle = 'rgba(90,120,40,0.18)';
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
      g.fillStyle = laid(g, 'sand', s.id);
      g.fillRect(q.x, q.y, q.w, q.h);
      g.fillStyle = '#b9b2a4';
      for (let y = q.y + 4; y < q.y + q.h - 2; y += 4) for (let x = q.x + 3; x < q.x + q.w - 2; x += 3.2) if (r() < 0.7) g.fillRect(x, y, 1.1, 2);
      break;
    }
    case 'market': {
      g.fillStyle = laid(g, 'ground', s.id);
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
      g.fillStyle = laid(g, 'road', s.id);
      g.fillRect(q.x, q.y, q.w, q.h);
      g.fillStyle = 'rgba(255,250,240,0.12)';
      g.fillRect(q.x, q.y, q.w, q.h);
      g.strokeStyle = 'rgba(255,255,255,0.45)';
      g.lineWidth = 0.3;
      for (let x = q.x + 4; x < q.x + q.w - 2; x += 5) {
        g.beginPath();
        g.moveTo(x, q.y + 2);
        g.lineTo(x, q.y + 10);
        g.stroke();
      }
      // Parked trucks in the yard (the bus station's buses are part of the living scene, in both views).
      const long = 8;
      if (s.kind === 'busstation') break;
      for (let x = q.x + 4; x < q.x + q.w - 6; x += 7) {
        if (r() < 0.35) continue;
        const y = q.y + 14 + r() * (q.h - long - 18);
        g.fillStyle = 'rgba(40,30,20,0.25)';
        g.fillRect(x + 0.8, y + 0.8, 3.2, long);
        g.fillStyle = r() < 0.5 ? '#6f7a6a' : '#8b7a5e';
        g.fillRect(x, y, 3.2, long);
        g.fillStyle = 'rgba(40,50,60,0.5)';
        g.fillRect(x + 0.4, y + 0.4, 2.4, 1.6);
      }
      break;
    }
    case 'field': {
      // Irrigated ground under the palms, darker where the water has soaked in.
      g.fillStyle = laid(g, 'grass', s.id);
      g.fillRect(q.x, q.y, q.w, q.h);
      g.fillStyle = 'rgba(110,90,50,0.22)';
      g.fillRect(q.x, q.y, q.w, q.h);
      break;
    }
    case 'brickyard':
    case 'scrapyard': {
      g.fillStyle = laid(g, s.kind === 'brickyard' ? 'sand' : 'ground', s.id);
      g.fillRect(q.x, q.y, q.w, q.h);
      g.fillStyle = s.kind === 'brickyard' ? 'rgba(170,100,60,0.1)' : 'rgba(60,50,40,0.1)';
      g.fillRect(q.x, q.y, q.w, q.h);
      break;
    }
    case 'distribution': {
      g.fillStyle = laid(g, 'ground', s.id);
      g.fillRect(q.x, q.y, q.w, q.h);
      // Rope lines for the queue, and a stack of sacks at the front.
      g.strokeStyle = 'rgba(90,75,55,0.5)';
      g.lineWidth = 0.15;
      g.beginPath();
      for (let y = q.y + 4; y < q.y + q.h - 2; y += 3.5) (g.moveTo(q.x + 3, y), g.lineTo(q.x + q.w - 10, y));
      g.stroke();
      g.fillStyle = '#e8dcc0';
      for (let i = 0; i < 6; i++) g.fillRect(q.x + q.w - 8 + (i % 3) * 2.2, q.y + 4 + Math.floor(i / 3) * 3, 2, 2.6);
      break;
    }
    case 'playground': {
      g.fillStyle = laid(g, 'sand', s.id);
      g.fillRect(q.x, q.y, q.w, q.h);
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.lineWidth = 0.35;
      g.strokeRect(q.x + 4, q.y + 4, Math.min(20, q.w - 8), Math.min(14, q.h - 8));
      break;
    }
    case 'courtyard':
    case 'plaza': {
      g.fillStyle = laid(g, s.kind === 'courtyard' ? 'white' : 'ground', s.id);
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

/** Around Warehouse 14 and the school, where the story starts: a few small things that make it a real street. */
function drawOpening(g: CanvasRenderingContext2D, w: World, v: Rect, sh: Sun) {
  const e = w.extras;
  if (v.x > 330 || v.x + v.w < 120 || v.y > 660 || v.y + v.h < 450) return;
  // Zebra crossings, and SCHOOL painted on the road before the gate.
  g.fillStyle = 'rgba(250,248,242,0.85)';
  for (const q of e.stripes) g.fillRect(q.x, q.y, q.w, q.h);
  g.save();
  g.fillStyle = 'rgba(250,248,242,0.7)';
  g.font = '700 2.6px "IBM Plex Sans", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const t of e.words) g.fillText(t.text, t.x, t.y);
  g.restore();
  // Street lamps: a post and its shadow.
  for (const l of e.lamps) {
    g.strokeStyle = 'rgba(40,30,20,0.25)';
    g.lineWidth = 0.25;
    g.beginPath();
    g.moveTo(l.x, l.y);
    g.lineTo(l.x + sh.dx * 5, l.y + sh.dy * 5);
    g.stroke();
    g.fillStyle = '#4d4a46';
    g.beginPath();
    g.arc(l.x, l.y, 0.45, 0, Math.PI * 2);
    g.fill();
  }
  // Bikes at the school gate.
  g.strokeStyle = 'rgba(50,60,70,0.8)';
  g.lineWidth = 0.14;
  for (const b of e.bikes) {
    g.beginPath();
    g.arc(b.x, b.y - 0.6, 0.45, 0, Math.PI * 2);
    g.moveTo(b.x + 0.45, b.y + 0.6);
    g.arc(b.x, b.y + 0.6, 0.45, 0, Math.PI * 2);
    g.moveTo(b.x, b.y - 0.6);
    g.lineTo(b.x, b.y + 0.6);
    g.stroke();
  }
  // The school yard: a basketball hoop with its key painted on the ground, swings, a slide.
  for (const h of e.hoops) {
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 0.14;
    g.strokeRect(h.x, h.y - 2.4, 5.8, 4.8);
    g.beginPath();
    g.arc(h.x + 5.8, h.y, 2.4, -Math.PI / 2, Math.PI / 2);
    g.stroke();
    g.fillStyle = 'rgba(40,30,20,0.3)';
    g.fillRect(h.x + sh.dx * 3, h.y - 0.9 + sh.dy * 3, 0.4, 1.8);
    g.fillStyle = '#f4f1ea';
    g.fillRect(h.x, h.y - 0.9, 0.35, 1.8);
    g.strokeStyle = '#d9622b';
    g.lineWidth = 0.16;
    g.beginPath();
    g.arc(h.x + 0.85, h.y, 0.45, 0, Math.PI * 2);
    g.stroke();
  }
  for (const q of e.swings) {
    g.fillStyle = 'rgba(40,30,20,0.22)';
    g.fillRect(q.x + sh.dx * 2.2, q.y + sh.dy * 2.2, q.w, 0.3);
    g.fillStyle = '#5a6a78';
    g.fillRect(q.x, q.y, q.w, 0.3);
    g.fillRect(q.x, q.y - 0.8, 0.3, q.h);
    g.fillRect(q.x + q.w - 0.3, q.y - 0.8, 0.3, q.h);
    g.fillStyle = '#c9a44c';
    g.fillRect(q.x + q.w * 0.3 - 0.4, q.y + 0.9, 0.8, 0.5);
    g.fillStyle = '#b8574a';
    g.fillRect(q.x + q.w * 0.68 - 0.4, q.y + 0.9, 0.8, 0.5);
  }
  for (const q of e.slides) {
    g.fillStyle = 'rgba(40,30,20,0.25)';
    g.fillRect(q.x + sh.dx * 1.5, q.y + sh.dy * 1.5, q.w, q.h);
    g.fillStyle = '#4f7291';
    g.fillRect(q.x, q.y, q.w, q.h * 0.35);
    g.fillStyle = '#d9c26a';
    g.fillRect(q.x + 0.2, q.y + q.h * 0.35, q.w - 0.4, q.h * 0.65);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(q.x + q.w * 0.45, q.y + q.h * 0.35, 0.25, q.h * 0.65);
  }
  // The fuel depot: pipes between the tanks, the pump island, Karim's tanker.
  g.strokeStyle = '#8f8a82';
  g.lineWidth = 0.55;
  for (const [x0, y0, x1, y1] of e.pipes) {
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  }
  for (const q of e.canopies) {
    g.fillStyle = 'rgba(40,30,20,0.28)';
    g.fillRect(q.x + sh.dx * 2, q.y + sh.dy * 2, q.w, q.h);
    g.fillStyle = '#efe9dd';
    g.fillRect(q.x, q.y, q.w, q.h);
    g.fillStyle = '#b8574a';
    g.fillRect(q.x, q.y, q.w, 0.6);
    g.fillRect(q.x, q.y + q.h - 0.6, q.w, 0.6);
  }
  for (const q of e.tankers) {
    g.fillStyle = 'rgba(40,30,20,0.28)';
    g.fillRect(q.x + sh.dx * 1.8, q.y + sh.dy * 1.8, q.w, q.h);
    g.fillStyle = '#5f6f6a';
    g.fillRect(q.x + q.w - 2.6, q.y + 0.2, 2.6, q.h - 0.4);
    const grd = g.createLinearGradient(0, q.y, 0, q.y + q.h);
    grd.addColorStop(0, '#fbfaf6');
    grd.addColorStop(1, '#c9c3b8');
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(q.x + (q.w - 2.8) / 2, q.y + q.h / 2, (q.w - 2.8) / 2, q.h / 2, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#b8574a';
    g.fillRect(q.x + 1, q.y + q.h / 2 - 0.2, q.w - 5, 0.4);
  }
  // Warehouse 14's loading doors, a truck backed up to one, crates by the wall.
  g.fillStyle = '#4a4640';
  for (const q of e.doors) g.fillRect(q.x, q.y, q.w, q.h);
  for (const q of e.trucks) {
    g.fillStyle = 'rgba(40,30,20,0.28)';
    g.fillRect(q.x + sh.dx * 1.6, q.y + sh.dy * 1.6, q.w, q.h);
    g.fillStyle = '#d9d2c2';
    g.fillRect(q.x, q.y, q.w, q.h * 0.72);
    g.fillStyle = '#5f6f6a';
    g.fillRect(q.x + 0.2, q.y + q.h * 0.74, q.w - 0.4, q.h * 0.26);
    g.fillStyle = 'rgba(40,50,60,0.55)';
    g.fillRect(q.x + 0.5, q.y + q.h - 0.9, q.w - 1, 0.6);
  }
  for (const q of e.crates) {
    g.fillStyle = 'rgba(40,30,20,0.25)';
    g.fillRect(q.x + sh.dx * 0.7, q.y + sh.dy * 0.7, q.w, q.h);
    g.fillStyle = '#b58a55';
    g.fillRect(q.x, q.y, q.w, q.h);
    g.strokeStyle = 'rgba(90,60,30,0.6)';
    g.lineWidth = 0.1;
    g.beginPath();
    g.moveTo(q.x, q.y);
    g.lineTo(q.x + q.w, q.y + q.h);
    g.moveTo(q.x + q.w, q.y);
    g.lineTo(q.x, q.y + q.h);
    g.stroke();
  }
  // A kiosk on the corner: cigarettes, sweets, phone cards, under a striped awning.
  for (const q of e.kiosks) {
    g.fillStyle = 'rgba(40,30,20,0.25)';
    g.fillRect(q.x + sh.dx * 1, q.y + sh.dy * 1, q.w, q.h);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? '#efe7d6' : '#2e6f73';
      g.fillRect(q.x + (i * q.w) / 4, q.y, q.w / 4, q.h);
    }
  }
  // The school yard: hopscotch in chalk, a game circle, a painted mural along the wall.
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 0.14;
  for (const q of e.hopscotch) g.strokeRect(q.x, q.y, q.w, q.h);
  for (const c of e.rings) {
    g.beginPath();
    g.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    g.stroke();
  }
  const paint = ['#c9a44c', '#4f7291', '#b8574a', '#6f8f6a', '#8a5a8a', '#d98b4a'];
  e.mural.forEach((q, i) => {
    g.fillStyle = paint[i % paint.length];
    g.fillRect(q.x, q.y, q.w, q.h);
  });
}

/** The railway, wagons, the camp fence, bricks drying, scrap, irrigation, washing lines, beehives. */
function drawOutskirts(g: CanvasRenderingContext2D, w: World, v: Rect, sh: Sun) {
  const e = w.extras;
  drawOpening(g, w, v, sh);
  if (v.y + v.h < 700) return;
  // The railway: a ballast bed, sleepers, two rails.
  const rl = e.rail;
  const x0 = Math.max(rl.x0, v.x - 10);
  const x1 = Math.min(rl.x1, v.x + v.w + 10);
  if (x1 > x0) {
    g.fillStyle = '#a79d8f';
    g.fillRect(x0, rl.y - 3.2, x1 - x0, 6.4);
    g.fillStyle = '#6e5a48';
    for (let x = Math.floor(x0 / 1.6) * 1.6; x < x1; x += 1.6) g.fillRect(x, rl.y - 2.2, 0.55, 4.4);
    g.fillStyle = '#4d4a46';
    g.fillRect(x0, rl.y - 1.35, x1 - x0, 0.28);
    g.fillRect(x0, rl.y + 1.07, x1 - x0, 0.28);
    // A buffer stop at the end of the line.
    if (rl.x1 < v.x + v.w + 10) {
      g.fillStyle = '#9a3b2e';
      g.fillRect(rl.x1 - 1, rl.y - 2, 1, 4);
    }
  }
  // Wagons: box vans in rust and grey, each with a roof seam.
  const r = rng(911);
  for (const q of e.wagons) {
    const c = r() < 0.5 ? '#8a5a3e' : r() < 0.5 ? '#7c7a73' : '#5f6f6a';
    if (!visible(v, q)) continue;
    g.fillStyle = 'rgba(40,30,20,0.28)';
    g.fillRect(q.x + sh.dx * 2.2, q.y + sh.dy * 2.2, q.w, q.h);
    g.fillStyle = c;
    g.fillRect(q.x, q.y, q.w, q.h);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(q.x, q.y, q.w, q.h * 0.4);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(q.x + q.w / 2 - 0.1, q.y, 0.2, q.h);
  }
  // Bricks drying in rows, the newest still dark with water.
  for (const q of e.stacks) {
    if (!visible(v, q)) continue;
    g.fillStyle = 'rgba(40,30,20,0.2)';
    g.fillRect(q.x + sh.dx * 0.8, q.y + sh.dy * 0.8, q.w, q.h);
    g.fillStyle = (q.x * 7 + q.y) % 5 < 1.5 ? '#8f5a3c' : '#b8764c';
    g.fillRect(q.x, q.y, q.w, q.h);
    g.fillStyle = 'rgba(255,230,200,0.25)';
    for (let x = q.x + 0.8; x < q.x + q.w; x += 1.1) g.fillRect(x, q.y, 0.18, q.h);
  }
  // Scrap: heaps of rusted, painted and grey bits.
  const sr = rng(733);
  for (const p of e.scrap) {
    const cols = ['#7a4a32', '#6d6a64', '#9b8f7c', '#4f5d68', '#a7412f'];
    g.fillStyle = 'rgba(40,30,20,0.18)';
    g.beginPath();
    g.arc(p.x + sh.dx * 1.2, p.y + sh.dy * 1.2, p.r * 0.9, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 22; i++) {
      const a = sr() * Math.PI * 2;
      const d = Math.sqrt(sr()) * p.r;
      g.fillStyle = cols[Math.floor(sr() * cols.length)];
      g.save();
      g.translate(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
      g.rotate(sr() * Math.PI);
      g.fillRect(-0.9, -0.5, 1.8 + sr() * 1.6, 1 + sr() * 0.6);
      g.restore();
    }
  }
  // The power station's transformer yard, and the pylons carrying the line out of town.
  for (const q of e.transformers) {
    g.fillStyle = 'rgba(40,30,20,0.25)';
    g.fillRect(q.x + sh.dx * 1.4, q.y + sh.dy * 1.4, q.w, q.h);
    g.fillStyle = '#7c7a73';
    g.fillRect(q.x, q.y, q.w, q.h);
    g.fillStyle = '#9fa3a3';
    for (let i = 0; i < 3; i++) g.fillRect(q.x + 0.6 + i * 1.5, q.y + 0.6, 0.8, q.h - 1.2);
  }
  if (e.pylons.length) {
    g.strokeStyle = 'rgba(60,60,60,0.45)';
    g.lineWidth = 0.12;
    for (const off of [-1, 0, 1]) {
      g.beginPath();
      g.moveTo(40, 772 + off);
      for (const p of e.pylons) g.lineTo(p.x, p.y + off);
      g.stroke();
    }
    for (const p of e.pylons) {
      g.strokeStyle = 'rgba(40,30,20,0.25)';
      g.lineWidth = 0.4;
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.lineTo(p.x + sh.dx * 14, p.y + sh.dy * 14);
      g.stroke();
      g.strokeStyle = '#5a5a58';
      g.lineWidth = 0.3;
      g.strokeRect(p.x - 1.2, p.y - 1.2, 2.4, 2.4);
      g.beginPath();
      g.moveTo(p.x - 1.2, p.y - 1.2);
      g.lineTo(p.x + 1.2, p.y + 1.2);
      g.moveTo(p.x + 1.2, p.y - 1.2);
      g.lineTo(p.x - 1.2, p.y + 1.2);
      g.stroke();
    }
  }
  // Irrigation channels.
  g.fillStyle = 'rgba(110,150,165,0.8)';
  for (const q of e.channels) if (visible(v, q)) g.fillRect(q.x, q.y, q.w, q.h);
  // Beehives: small white boxes.
  for (const h of e.hives) {
    g.fillStyle = 'rgba(40,30,20,0.25)';
    g.fillRect(h.x + sh.dx * 0.5, h.y + sh.dy * 0.5, 1.6, 1.3);
    g.fillStyle = '#f2ede2';
    g.fillRect(h.x, h.y, 1.6, 1.3);
  }
  // The camp's wire fence: thin posts and wire, easy to see through.
  g.strokeStyle = 'rgba(80,80,80,0.55)';
  g.lineWidth = 0.12;
  for (const q of e.fences) {
    g.beginPath();
    g.moveTo(q.x, q.y);
    g.lineTo(q.x + q.w, q.y + q.h);
    g.stroke();
    g.fillStyle = 'rgba(70,70,70,0.7)';
    const n = Math.max(q.w, q.h) / 3;
    for (let i = 0; i <= n; i++) g.fillRect(q.x + (q.w * i) / n - 0.2, q.y + (q.h * i) / n - 0.2, 0.4, 0.4);
  }
  // Washing lines between tents.
  const wr = rng(419);
  const cloth = ['#b8574a', '#e9e4d8', '#4f7291', '#c9a44c', '#6f8f6a', '#8a5a8a'];
  for (const [ax, ay, bx, by] of e.washing) {
    g.strokeStyle = 'rgba(70,60,50,0.5)';
    g.lineWidth = 0.06;
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
    g.stroke();
    const k = 2 + Math.floor(wr() * 3);
    for (let i = 0; i < k; i++) {
      const t = (i + 0.5) / k;
      g.fillStyle = cloth[Math.floor(wr() * cloth.length)];
      g.fillRect(ax + (bx - ax) * t - 0.3, ay + (by - ay) * t, 0.6, 0.7);
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
  // A crumpled paper ball: facets from an off-centre peak, lit on the sun's side.
  const px = x - sh.dx * rad * 0.12;
  const py = y - sh.dy * rad * 0.12;
  const f = 7;
  for (let i = 0; i < f; i++) {
    const a0 = (i / f) * Math.PI * 2 + r() * 0.3;
    const a1 = ((i + 1) / f) * Math.PI * 2 + r() * 0.3;
    const facing = Math.cos((a0 + a1) / 2 - Math.atan2(-sh.dy, -sh.dx));
    g.fillStyle = facing > 0 ? `rgba(235,245,190,${0.1 + facing * 0.14})` : `rgba(30,40,10,${0.06 - facing * 0.12})`;
    g.beginPath();
    g.moveTo(px, py);
    g.lineTo(x + Math.cos(a0) * rad * 0.88, y + Math.sin(a0) * rad * 0.88);
    g.lineTo(x + Math.cos(a1) * rad * 0.88, y + Math.sin(a1) * rad * 0.88);
    g.closePath();
    g.fill();
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
    b.rects.forEach((q, qi) => drawRubble(g, q, b.paper, rng(b.id * 17 + qi), sh));
    return;
  }
  if (b.round) {
    // Fuel tanks: white drums with a lit rim. Silos in grey card; water tanks a faded blue.
    const q = b.rects[0];
    const cx = q.x + q.w / 2;
    const cy = q.y + q.h / 2;
    const rad = q.w / 2;
    const grd = g.createRadialGradient(cx - lx * rad * 0.3, cy - ly * rad * 0.3, rad * 0.1, cx, cy, rad);
    grd.addColorStop(0, b.kind === 'silo' ? '#e4e0d8' : b.kind === 'watertank' ? '#c9d6db' : '#fbfaf6');
    grd.addColorStop(1, b.kind === 'silo' ? '#b3ada3' : b.kind === 'watertank' ? '#8fa5ad' : '#d7d2c8');
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
  b.rects.forEach((q, qi) => {
    // A sheet of paper with slightly torn edges, lit from the sun's side.
    const jag = Math.min(0.32, Math.min(q.w, q.h) * 0.035);
    const path = tornPath(q, rng(b.id * 53 + qi), jag);
    g.fillStyle = laid(g, b.paper, b.id * 7 + qi);
    g.fill(path);
    const grd = g.createLinearGradient(q.x + q.w / 2 - lx * q.w * 0.3, q.y + q.h / 2 - ly * q.h * 0.3, q.x + q.w / 2 + lx * q.w * 0.3, q.y + q.h / 2 + ly * q.h * 0.3);
    grd.addColorStop(0, 'rgba(70,50,30,0.09)');
    grd.addColorStop(1, 'rgba(255,255,255,0.07)');
    g.fillStyle = grd;
    g.fill(path);
    g.save();
    g.clip(path);

    if (b.kind === 'warehouse' && b.paper === 'white') {
      // An accordion-folded roof.
      const strip = 2.4;
      const alongX = q.w >= q.h;
      const n = Math.ceil((alongX ? q.w : q.h) / strip);
      for (let i = 0; i < n; i++) {
        const lit = (i % 2 === 0) === (alongX ? lx > 0 : ly > 0);
        g.fillStyle = lit ? 'rgba(255,255,255,0.38)' : 'rgba(80,70,55,0.13)';
        if (alongX) g.fillRect(q.x + i * strip, q.y, Math.min(strip, q.x + q.w - (q.x + i * strip)), q.h);
        else g.fillRect(q.x, q.y + i * strip, q.w, Math.min(strip, q.y + q.h - (q.y + i * strip)));
      }
      if (b.name === 'Warehouse 14') {
        // A couple of patched panels, and rust weeping from the fasteners along the seams.
        g.fillStyle = 'rgba(150,160,165,0.35)';
        g.fillRect(q.x + q.w * 0.12, q.y + q.h * 0.18, strip * 2, q.h * 0.3);
        g.fillStyle = 'rgba(170,110,70,0.22)';
        g.fillRect(q.x + q.w * 0.7, q.y + q.h * 0.55, strip * 3, q.h * 0.25);
        g.fillStyle = 'rgba(150,85,45,0.35)';
        for (let i = 1; i < n; i += 3) for (let k = 0.15; k < 1; k += 0.28) g.fillRect(q.x + i * strip - 0.12, q.y + q.h * k, 0.24, 0.5);
        // Its number, painted big on the roof years ago and fading.
        g.save();
        g.fillStyle = 'rgba(60,50,40,0.42)';
        g.font = `700 ${Math.min(q.w, q.h) * 0.62}px "IBM Plex Sans", sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('14', q.x + q.w / 2, q.y + q.h / 2 + 1);
        g.restore();
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
      const lit = 'rgba(255,235,215,0.16)';
      const dim = 'rgba(80,30,15,0.16)';
      const dimmer = 'rgba(80,30,15,0.22)';
      tri([q.x, q.y, q.x + q.w, q.y, cx + ridge, cy, cx - ridge, cy], ly > 0 ? dim : lit);
      tri([q.x, q.y + q.h, q.x + q.w, q.y + q.h, cx + ridge, cy, cx - ridge, cy], ly > 0 ? lit : dim);
      tri([q.x, q.y, q.x, q.y + q.h, cx - ridge, cy], lx > 0 ? dimmer : lit);
      tri([q.x + q.w, q.y, q.x + q.w, q.y + q.h, cx + ridge, cy], lx > 0 ? lit : dimmer);
      // Rows of tiles.
      if (scale > 1.5) {
        g.strokeStyle = 'rgba(90,40,20,0.2)';
        g.lineWidth = 0.1;
        g.beginPath();
        for (let y = q.y + 0.6; y < q.y + q.h; y += 0.6) (g.moveTo(q.x, y), g.lineTo(q.x + q.w, y));
        g.stroke();
      }
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
    } else if (b.kind === 'tent' || (b.material === 'canvas' && b.kind !== 'greenhouse')) {
      // Canvas over a ridge pole: one side in the sun, one in shade, a tarp patch here and there.
      const alongX = q.w >= q.h;
      const litFirst = alongX ? ly > 0 : lx > 0;
      g.fillStyle = 'rgba(90,80,60,0.16)';
      if (alongX) g.fillRect(q.x, litFirst ? q.y + q.h / 2 : q.y, q.w, q.h / 2);
      else g.fillRect(litFirst ? q.x + q.w / 2 : q.x, q.y, q.w / 2, q.h);
      g.strokeStyle = 'rgba(110,100,80,0.45)';
      g.lineWidth = 0.14;
      g.beginPath();
      if (alongX) (g.moveTo(q.x, q.y + q.h / 2), g.lineTo(q.x + q.w, q.y + q.h / 2));
      else (g.moveTo(q.x + q.w / 2, q.y), g.lineTo(q.x + q.w / 2, q.y + q.h));
      g.stroke();
      if (r() < 0.22) {
        g.fillStyle = r() < 0.6 ? 'rgba(70,110,150,0.55)' : 'rgba(170,120,70,0.45)';
        g.fillRect(q.x + r() * q.w * 0.5, q.y + r() * q.h * 0.4, q.w * 0.45, q.h * 0.5);
      }
      if (b.kind === 'clinic') {
        const cx = q.x + q.w / 2;
        const cy = q.y + q.h / 2;
        const k = Math.min(q.w, q.h) * 0.3;
        g.fillStyle = '#c0392b';
        g.fillRect(cx - k * 0.28, cy - k * 0.9, k * 0.56, k * 1.8);
        g.fillRect(cx - k * 0.9, cy - k * 0.28, k * 1.8, k * 0.56);
      }
    } else if (b.kind === 'greenhouse') {
      // Plastic sheet over hoops: pale, see-through, green showing under it.
      g.fillStyle = 'rgba(120,150,90,0.28)';
      g.fillRect(q.x, q.y, q.w, q.h);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(q.x + q.w * 0.2, q.y, q.w * 0.25, q.h);
      g.strokeStyle = 'rgba(120,120,110,0.35)';
      g.lineWidth = 0.1;
      g.beginPath();
      for (let y = q.y + 2; y < q.y + q.h; y += 2.2) (g.moveTo(q.x, y), g.lineTo(q.x + q.w, y));
      g.stroke();
    } else if (b.kind === 'kiln') {
      // Rows of fire holes along the top of the kiln, sooted round the edges.
      g.fillStyle = 'rgba(60,40,25,0.18)';
      g.fillRect(q.x + 2, q.y + 2, q.w - 4, q.h - 4);
      g.fillStyle = 'rgba(40,28,20,0.7)';
      for (let y = q.y + 4; y < q.y + q.h - 3; y += 3.2) for (let x = q.x + 4; x < q.x + q.w - 3; x += 3.2) {
        g.beginPath();
        g.arc(x, y, 0.45, 0, Math.PI * 2);
        g.fill();
      }
    } else if (b.kind === 'chimney') {
      g.fillStyle = '#b07a52';
      g.fillRect(q.x + 0.5, q.y + 0.5, q.w - 1, q.h - 1);
      g.fillStyle = '#2d2520';
      g.fillRect(q.x + 1.6, q.y + 1.6, q.w - 3.2, q.h - 3.2);
    } else if (b.kind === 'minaret') {
      g.fillStyle = '#e8d5ae';
      g.beginPath();
      g.arc(q.x + q.w / 2, q.y + q.h / 2, q.w * 0.42, 0, Math.PI * 2);
      g.fill();
    } else if (b.kind === 'stand') {
      for (let i = 0; i < q.w; i += 1.2) {
        g.fillStyle = i % 2.4 < 1.2 ? 'rgba(255,255,255,0.18)' : 'rgba(60,55,50,0.12)';
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
      if (q.w * q.h > 120 && r() < 0.7) {
        // A fold across the sheet: one side catches the light, the other doesn't.
        const alongX = r() < 0.5;
        const u = 0.3 + r() * 0.4;
        const k = (r() - 0.5) * 0.3;
        g.fillStyle = (alongX ? lx : ly) > 0 ? 'rgba(90,70,50,0.07)' : 'rgba(255,255,255,0.14)';
        g.beginPath();
        if (alongX) {
          const x0 = q.x + q.w * (u + k);
          const x1 = q.x + q.w * (u - k);
          g.moveTo(q.x, q.y), g.lineTo(x0, q.y), g.lineTo(x1, q.y + q.h), g.lineTo(q.x, q.y + q.h);
        } else {
          const y0 = q.y + q.h * (u + k);
          const y1 = q.y + q.h * (u - k);
          g.moveTo(q.x, q.y), g.lineTo(q.x + q.w, q.y), g.lineTo(q.x + q.w, y1), g.lineTo(q.x, y0);
        }
        g.closePath();
        g.fill();
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
      if (b.name === 'Cotton Street School') {
        // Painted a warm ochre, so the school stands out from the brick around it.
        g.fillStyle = 'rgba(232,176,72,0.42)';
        g.fillRect(q.x, q.y, q.w, q.h);
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
    // A bright paper edge on the sun's side and a darker one away from it give the box its height.
    const d = 0.32;
    g.translate(-lx * d * 0.7, -ly * d * 0.7);
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.lineWidth = d;
    g.stroke(path);
    g.translate(lx * d * 1.4, ly * d * 1.4);
    g.strokeStyle = 'rgba(60,45,30,0.14)';
    g.stroke(path);
    g.restore();
    g.strokeStyle = edge;
    g.lineWidth = 0.18;
    g.stroke(path);
    if (b.paper === 'kraft' && scale > 2.5) {
      // Corrugated cardboard shows at the torn edge.
      g.strokeStyle = 'rgba(120,80,40,0.35)';
      g.lineWidth = 0.08;
      g.setLineDash([0.12, 0.18]);
      g.strokeRect(q.x + 0.12, q.y + 0.12, q.w - 0.24, q.h - 0.24);
      g.setLineDash([]);
    }
  });
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

/** A rectangle whose edges are torn a little, inward only so neighbours never overlap. */
export function tornPath(q: Rect, r: () => number, jag: number) {
  const p = new Path2D();
  const edge = (x0: number, y0: number, x1: number, y1: number, nx: number, ny: number) => {
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 1.4));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const j = i === 0 ? r() * jag * 0.4 : r() * jag;
      p.lineTo(x0 + (x1 - x0) * t + nx * j, y0 + (y1 - y0) * t + ny * j);
    }
  };
  p.moveTo(q.x, q.y);
  edge(q.x, q.y, q.x + q.w, q.y, 0, 1);
  edge(q.x + q.w, q.y, q.x + q.w, q.y + q.h, -1, 0);
  edge(q.x + q.w, q.y + q.h, q.x, q.y + q.h, 0, -1);
  edge(q.x, q.y + q.h, q.x, q.y, 1, 0);
  p.closePath();
  return p;
}

/** A torn scrap of paper: an irregular polygon around (x, y). */
function scrap(r: () => number, x: number, y: number, w: number, h: number, rot: number) {
  const p = new Path2D();
  const n = 7 + Math.floor(r() * 5);
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 0.7 + r() * 0.45;
    const px = Math.cos(a) * w * 0.5 * k;
    const py = Math.sin(a) * h * 0.5 * k;
    const X = x + px * c - py * s;
    const Y = y + px * s + py * c;
    if (i) p.lineTo(X, Y);
    else p.moveTo(X, Y);
  }
  p.closePath();
  return p;
}

/** A collapsed building: a heap of torn sheets and broken card, grey dust around it. */
function drawRubble(g: CanvasRenderingContext2D, q: Rect, paper: Building['paper'], r: () => number, sh: Sun) {
  const cx = q.x + q.w / 2;
  const cy = q.y + q.h / 2;
  // Dust and the floor slab.
  const spread = Math.min(q.w, q.h) * 0.25 + 2;
  const dust = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(q.w, q.h) / 2 + spread);
  dust.addColorStop(0, 'rgba(120,112,100,0.55)');
  dust.addColorStop(0.7, 'rgba(150,142,130,0.35)');
  dust.addColorStop(1, 'rgba(150,142,130,0)');
  g.fillStyle = dust;
  g.fillRect(q.x - spread, q.y - spread, q.w + spread * 2, q.h + spread * 2);
  g.fillStyle = laid(g, 'grey', Math.round(q.x * 3 + q.y));
  g.fill(tornPath({ x: q.x + q.w * 0.06, y: q.y + q.h * 0.06, w: q.w * 0.88, h: q.h * 0.88 }, r, Math.min(q.w, q.h) * 0.12));
  // Sheets, largest first, piling up towards the middle.
  const n = Math.min(70, Math.max(8, Math.round((q.w * q.h) / 6)));
  const kinds: Building['paper'][] = [paper, paper, paper, 'grey', paper === 'kraft' ? 'kraft' : 'white'];
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const reach = 0.5 * (1 - t * 0.6);
    const x = cx + (r() - 0.5) * 2 * q.w * reach;
    const y = cy + (r() - 0.5) * 2 * q.h * reach;
    const size = Math.min(q.w, q.h) * (0.12 + r() * 0.3) * (1 - t * 0.5) + 0.6;
    const p = scrap(r, x, y, size * (1 + r()), size, r() * Math.PI);
    const lift = 0.25 + t * 0.9;
    g.fillStyle = 'rgba(40,30,20,0.28)';
    g.save();
    g.translate(sh.dx * lift, sh.dy * lift);
    g.fill(p);
    g.restore();
    g.fillStyle = laid(g, kinds[Math.floor(r() * kinds.length)], i * 13 + Math.round(x));
    g.fill(p);
    g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.14)' : 'rgba(60,45,30,0.1)';
    g.fill(p);
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = 0.1;
    g.stroke(p);
  }
  // Broken beams and bent card standing up out of the heap.
  for (let i = 0; i < Math.min(8, 2 + (q.w * q.h) / 60); i++) {
    const x = cx + (r() - 0.5) * q.w * 0.7;
    const y = cy + (r() - 0.5) * q.h * 0.7;
    const len = 1.5 + r() * Math.min(q.w, q.h) * 0.35;
    const a = r() * Math.PI;
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.fillStyle = 'rgba(40,30,20,0.3)';
    g.fillRect(-len / 2 + sh.dx * 1.4, -0.2 + sh.dy * 1.4, len, 0.4);
    g.fillStyle = paper === 'kraft' ? '#a7804f' : r() < 0.5 ? '#8d8479' : '#efe9dd';
    g.fillRect(-len / 2, -0.2, len, 0.4);
    g.restore();
  }
}

/** The boulevard bridge, dropped: a torn gap over the water, its two ends hanging, the middle span in the canal. */
function drawBrokenBridge(g: CanvasRenderingContext2D, q: Rect) {
  const r = rng(4242);
  const mid = q.x + q.w / 2;
  const top = q.y - 2;
  const bot = q.y + q.h + 2;
  const steps = 7;
  const edge = (side: -1 | 1) => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= steps; i++) pts.push([mid + side * (13 + r() * 5), top + ((bot - top) * i) / steps]);
    return pts;
  };
  const left = edge(-1);
  const right = edge(1);
  // Fallen slabs in the water first, so the gap's edges lie over them.
  const slab = (cx: number, cy: number, w: number, h: number, rot: number) => {
    g.save();
    g.translate(cx, cy);
    g.rotate(rot);
    g.fillStyle = 'rgba(30,40,45,0.25)';
    g.fillRect(-w / 2 + 1.2, -h / 2 + 1.6, w, h);
    g.fillStyle = '#8f887d';
    g.fillRect(-w / 2, -h / 2, w, h);
    g.fillStyle = '#b3aa9c';
    g.fillRect(-w / 2, -h / 2, w, 0.8);
    g.restore();
  };
  // The gap: deep water where the road was.
  g.fillStyle = C.waterDeep;
  g.beginPath();
  left.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  for (let i = right.length - 1; i >= 0; i--) g.lineTo(right[i][0], right[i][1]);
  g.closePath();
  g.fill();
  g.save();
  g.clip();
  slab(mid - 4, q.y + q.h * 0.35, 16, q.h * 0.55, -0.35);
  slab(mid + 5, q.y + q.h * 0.75, 12, q.h * 0.42, 0.5);
  // Ripples round the wreck.
  g.strokeStyle = 'rgba(255,255,255,0.45)';
  g.lineWidth = 0.35;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.arc(mid + (r() - 0.5) * 14, top + r() * (bot - top), 2 + r() * 3, 0, Math.PI);
    g.stroke();
  }
  g.restore();
  // Torn edges: a lit paper edge and a shadow under each hanging end.
  for (const [pts, side] of [[left, -1], [right, 1]] as const) {
    g.strokeStyle = 'rgba(20,20,20,0.5)';
    g.lineWidth = 2.4;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x - side * 0.9, y) : g.moveTo(x - side * 0.9, y)));
    g.stroke();
    g.strokeStyle = '#fbf7ee';
    g.lineWidth = 0.9;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
    // Bent rebar sticking out.
    g.strokeStyle = '#5a4a3c';
    g.lineWidth = 0.3;
    for (let i = 1; i < pts.length - 1; i += 2) {
      g.beginPath();
      g.moveTo(pts[i][0], pts[i][1]);
      g.lineTo(pts[i][0] - side * (1.5 + r() * 2), pts[i][1] + (r() - 0.5) * 2);
      g.stroke();
    }
  }
  // Scorch and grit on the ends that are left.
  for (let i = 0; i < 40; i++) {
    const side = r() < 0.5 ? -1 : 1;
    const x = mid + side * (12 + r() * 14);
    const y = top + r() * (bot - top);
    g.fillStyle = r() < 0.4 ? 'rgba(40,32,26,0.35)' : 'rgba(120,110,98,0.6)';
    g.fillRect(x, y, 0.4 + r() * 1.1, 0.4 + r() * 0.9);
  }
  const sc = g.createRadialGradient(mid, q.y + q.h / 2, 4, mid, q.y + q.h / 2, 26);
  sc.addColorStop(0, 'rgba(35,28,22,0.3)');
  sc.addColorStop(1, 'rgba(35,28,22,0)');
  g.fillStyle = sc;
  g.fillRect(mid - 28, top - 6, 56, bot - top + 12);
}

/** Sand dunes beyond the city: crescent ridges, a lit face towards the sun and a soft shadow behind. */
/**
 * A block's open ground isn't one even sheet: a broad patch or two of darker earth or pale gravel, and on big
 * blocks a path worn across by people cutting through. Painted soft and low, under everything else.
 */
function groundPatches(g: CanvasRenderingContext2D, bl: Rect) {
  const r = rng(Math.round(bl.x * 17 + bl.y * 3));
  const n = 1 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const x = bl.x + 6 + r() * (bl.w - 12);
    const y = bl.y + 6 + r() * (bl.h - 12);
    const rad = Math.min(bl.w, bl.h) * (0.18 + r() * 0.25);
    const kind = r();
    const col = kind < 0.45 ? '140,108,72' : kind < 0.8 ? '232,222,200' : '170,160,145'; // earth, pale gravel, grey stone
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, `rgba(${col},${kind < 0.45 ? 0.2 : 0.28})`);
    grd.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = grd;
    g.save();
    g.translate(x, y);
    g.scale(1, 0.55 + r() * 0.4);
    g.translate(-x, -y);
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    g.restore();
    if (kind >= 0.8) {
      // Loose stones scattered on the gravel.
      g.fillStyle = 'rgba(120,110,95,0.35)';
      for (let k = 0; k < 14; k++) g.fillRect(x + (r() - 0.5) * rad * 1.2, y + (r() - 0.5) * rad * 0.7, 0.35, 0.3);
    }
  }
  if (bl.w * bl.h > 5000 && r() < 0.5) {
    // A path worn across the block, corner to corner.
    g.strokeStyle = 'rgba(200,184,150,0.3)';
    g.lineWidth = 1.4;
    g.lineCap = 'round';
    g.beginPath();
    const fromLeft = r() < 0.5;
    g.moveTo(bl.x + 4, fromLeft ? bl.y + 4 : bl.y + bl.h - 4);
    g.quadraticCurveTo(bl.x + bl.w * (0.3 + r() * 0.4), bl.y + bl.h * (0.3 + r() * 0.4), bl.x + bl.w - 4, fromLeft ? bl.y + bl.h - 4 : bl.y + 4);
    g.stroke();
    g.lineCap = 'butt';
  }
}

/** Beyond the town: low swells of land and rocky outcrops, folded-paper stones with a lit face and a shaded one. */
function drawTerrain(g: CanvasRenderingContext2D, w: World, v: Rect, sh: Sun) {
  const { rocks, mounds } = terrain(w);
  for (const m of mounds) {
    if (!visible(v, { x: m.x - m.rx, y: m.y - m.rx, w: m.rx * 2, h: m.rx * 2 }, 0)) continue;
    g.save();
    g.translate(m.x, m.y);
    g.rotate(m.rot);
    const k = Math.min(1, m.h / 10);
    g.fillStyle = `rgba(150,118,80,${0.12 + 0.08 * k})`;
    g.beginPath();
    g.ellipse(sh.dx * m.h * 0.8, sh.dy * m.h * 0.8, m.rx, m.ry, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = `rgba(250,240,218,${0.2 + 0.12 * k})`;
    g.beginPath();
    g.ellipse(-sh.dx * m.h * 0.5, -sh.dy * m.h * 0.5, m.rx * 0.85, m.ry * 0.8, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  for (const o of rocks) {
    if (!visible(v, { x: o.x - o.r - 20, y: o.y - o.r - 20, w: o.r * 2 + 40, h: o.r * 2 + 40 }, 0)) continue;
    for (const st of o.stones) {
      const outline = (ox: number, oy: number, k: number) => {
        g.beginPath();
        st.pts.forEach((p, i) => {
          const a = st.rot + (i / st.pts.length) * Math.PI * 2;
          const x = st.x + ox + Math.cos(a) * st.s * p * k;
          const y = st.y + oy + Math.sin(a) * st.s * p * k;
          if (i) g.lineTo(x, y);
          else g.moveTo(x, y);
        });
        g.closePath();
      };
      const tall = st.s * st.tall;
      g.fillStyle = 'rgba(70,52,34,0.22)';
      outline(sh.dx * tall, sh.dy * tall, 1);
      g.fill();
      g.fillStyle = '#c4b393';
      outline(0, 0, 1);
      g.fill();
      // The face turned to the sun, and a fold down the middle.
      g.fillStyle = 'rgba(255,248,230,0.45)';
      outline(-sh.dx * st.s * 0.18, -sh.dy * st.s * 0.18, 0.62);
      g.fill();
      g.strokeStyle = 'rgba(95,78,58,0.45)';
      g.lineWidth = Math.max(0.15, st.s * 0.04);
      outline(0, 0, 1);
      g.stroke();
    }
  }
}

function drawDunes(g: CanvasRenderingContext2D, w: World, v: Rect) {
  const r = rng(314);
  for (let i = 0; i < 260; i++) {
    const x = -700 + r() * (w.w + 1400);
    const y = -600 + r() * (w.h + 1200);
    const len = 40 + r() * 90;
    const depth = len * (0.22 + r() * 0.18);
    const rot = -0.5 + r() * 0.35; // the wind shapes them all the same way
    if (x > -90 - len / 2 && x < w.city.w + 90 + len / 2 && y > -90 - depth && y < w.city.h + 90 + depth) continue;
    // Keep the old camp and the track out to it clear.
    if (x > POST_CLEAR.x - len / 2 && x < POST_CLEAR.x + POST_CLEAR.w + len / 2 && y > POST_CLEAR.y - depth && y < POST_CLEAR.y + POST_CLEAR.h + depth) continue;
    if (y > 200 - depth && y < 260 + depth && x < POST_CLEAR.x) continue;
    if (!visible(v, { x: x - len, y: y - len, w: len * 2, h: len * 2 }, 0)) continue;
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    // Shadow side (lee): a darker crescent.
    g.fillStyle = 'rgba(150,112,70,0.22)';
    g.beginPath();
    g.moveTo(-len / 2, 0);
    g.quadraticCurveTo(0, depth * 1.3, len / 2, 0);
    g.quadraticCurveTo(0, depth * 0.35, -len / 2, 0);
    g.fill();
    // Lit side (windward): a pale sweep.
    g.fillStyle = 'rgba(255,246,226,0.38)';
    g.beginPath();
    g.moveTo(-len / 2, 0);
    g.quadraticCurveTo(0, -depth * 1.1, len / 2, 0);
    g.quadraticCurveTo(0, -depth * 0.2, -len / 2, 0);
    g.fill();
    // The crest, a thin fold in the paper.
    g.strokeStyle = 'rgba(120,88,52,0.35)';
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(-len / 2, 0);
    g.quadraticCurveTo(0, depth * 0.35, len / 2, 0);
    g.stroke();
    g.restore();
  }
}
