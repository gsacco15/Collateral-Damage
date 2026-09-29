// Paper textures, generated once: crumpled white paper, kraft card, grey card, tin sheet, tile, ground and road.
// Each tile covers TILE_M metres and is laid on roofs with a per-building offset and turn, so no two match.
import { rng, type Rng } from '../jev';

export const TILE_M = 30;
const PX = 640;

export type PaperKind = 'white' | 'grey' | 'kraft' | 'tin' | 'terracotta' | 'ground' | 'road' | 'grass' | 'sand';

interface Spec {
  base: [number, number, number];
  creases: number; // how crumpled
  facets: number; // soft light/dark facets between creases
  fibres: number;
  fibreColor: string;
  flecks: number;
  grain: number;
  mottle: number;
}

const SPECS: Record<PaperKind, Spec> = {
  white: { base: [243, 240, 234], creases: 30, facets: 260, fibres: 260, fibreColor: '120,110,95', flecks: 20, grain: 9, mottle: 0.05 },
  grey: { base: [205, 200, 191], creases: 22, facets: 200, fibres: 220, fibreColor: '90,85,78', flecks: 40, grain: 10, mottle: 0.06 },
  kraft: { base: [202, 160, 106], creases: 34, facets: 240, fibres: 700, fibreColor: '110,72,34', flecks: 160, grain: 12, mottle: 0.08 },
  tin: { base: [168, 173, 175], creases: 6, facets: 20, fibres: 0, fibreColor: '0,0,0', flecks: 60, grain: 8, mottle: 0.05 },
  terracotta: { base: [196, 122, 90], creases: 12, facets: 50, fibres: 200, fibreColor: '110,50,30', flecks: 50, grain: 10, mottle: 0.06 },
  ground: { base: [231, 221, 204], creases: 8, facets: 40, fibres: 500, fibreColor: '140,115,85', flecks: 90, grain: 10, mottle: 0.07 },
  sand: { base: [226, 212, 190], creases: 6, facets: 40, fibres: 600, fibreColor: '140,110,75', flecks: 140, grain: 11, mottle: 0.08 },
  road: { base: [150, 142, 135], creases: 4, facets: 30, fibres: 300, fibreColor: '70,65,60', flecks: 200, grain: 12, mottle: 0.05 },
  grass: { base: [178, 188, 132], creases: 6, facets: 40, fibres: 500, fibreColor: '80,95,45', flecks: 100, grain: 12, mottle: 0.08 },
};

function wander(r: Rng, x0: number, y0: number, len: number, a: number) {
  const pts: [number, number][] = [[x0, y0]];
  let x = x0;
  let y = y0;
  for (let t = 0; t < len; t += 18) {
    a += (r() - 0.5) * 0.35;
    x += Math.cos(a) * 18;
    y += Math.sin(a) * 18;
    pts.push([x, y]);
  }
  return pts;
}

function paint(kind: PaperKind, seed: number) {
  const s = SPECS[kind];
  const r = rng(seed);
  const c = document.createElement('canvas');
  c.width = c.height = PX;
  const g = c.getContext('2d')!;
  g.fillStyle = `rgb(${s.base.join(',')})`;
  g.fillRect(0, 0, PX, PX);
  // Draw everything three times offset by the tile size so the tile repeats without seams.
  const wrap = (f: () => void) => {
    for (const dx of [-PX, 0, PX])
      for (const dy of [-PX, 0, PX]) {
        g.save();
        g.translate(dx, dy);
        f();
        g.restore();
      }
  };
  // Mottling: big soft patches of light and shade, like paper that isn't quite flat.
  const blobs = Array.from({ length: 14 }, () => ({ x: r() * PX, y: r() * PX, rad: 80 + r() * 200, light: r() < 0.5 }));
  wrap(() => {
    for (const b of blobs) {
      const grd = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.rad);
      grd.addColorStop(0, b.light ? `rgba(255,255,255,${s.mottle * 1.6})` : `rgba(60,40,20,${s.mottle})`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(b.x - b.rad, b.y - b.rad, b.rad * 2, b.rad * 2);
    }
  });
  // Facets: the flat planes of crumpled paper, each catching the light a little differently.
  const facets = Array.from({ length: s.facets }, () => {
    const x = r() * PX;
    const y = r() * PX;
    const n = 3 + Math.floor(r() * 2);
    const pts: [number, number][] = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + r() * 0.8;
      const d = 8 + r() * 38;
      pts.push([x + Math.cos(a) * d, y + Math.sin(a) * d]);
    }
    return { pts, light: r() < 0.5, a: (0.035 + r() * 0.07) * (s.creases > 15 ? 1 : 0.4) };
  });
  wrap(() => {
    for (const f of facets) {
      g.fillStyle = f.light ? `rgba(255,255,255,${f.a * 1.4})` : `rgba(70,50,30,${f.a})`;
      g.beginPath();
      f.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.fill();
    }
  });
  // Creases: a dark fold with a light edge beside it.
  const creases = Array.from({ length: s.creases }, () => wander(r, r() * PX, r() * PX, 60 + r() * 260, r() * Math.PI * 2));
  wrap(() => {
    for (const pts of creases) {
      for (const [dx, col, w] of [
        [0, 'rgba(70,50,30,0.26)', 1.6],
        [1.6, 'rgba(255,255,255,0.5)', 1.3],
      ] as [number, string, number][]) {
        g.strokeStyle = col;
        g.lineWidth = w;
        g.beginPath();
        pts.forEach(([x, y], i) => (i ? g.lineTo(x + dx, y + dx) : g.moveTo(x + dx, y + dx)));
        g.stroke();
      }
    }
  });
  // Fibres and flecks.
  const fibres = Array.from({ length: s.fibres }, () => ({ x: r() * PX, y: r() * PX, a: r() * Math.PI, l: 3 + r() * 12, o: 0.06 + r() * 0.1 }));
  const flecks = Array.from({ length: s.flecks }, () => ({ x: r() * PX, y: r() * PX, s: 0.6 + r() * 1.6, o: 0.1 + r() * 0.25 }));
  wrap(() => {
    for (const f of fibres) {
      g.strokeStyle = `rgba(${s.fibreColor},${f.o})`;
      g.lineWidth = 0.7;
      g.beginPath();
      g.moveTo(f.x, f.y);
      g.quadraticCurveTo(f.x + Math.cos(f.a) * f.l * 0.5 + 2, f.y + Math.sin(f.a) * f.l * 0.5 - 2, f.x + Math.cos(f.a) * f.l, f.y + Math.sin(f.a) * f.l);
      g.stroke();
    }
    for (const f of flecks) {
      g.fillStyle = `rgba(${s.fibreColor},${f.o})`;
      g.fillRect(f.x, f.y, f.s, f.s);
    }
  });
  if (kind === 'tin') {
    // A few rusty and repainted sheets.
    for (let i = 0; i < 10; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(150,80,40,0.22)' : 'rgba(80,110,140,0.18)';
      g.fillRect(r() * PX, r() * PX, 60 + r() * 120, 50 + r() * 140);
    }
  }
  if (kind === 'road') {
    for (let i = 0; i < 18; i++) {
      g.strokeStyle = 'rgba(40,35,30,0.12)';
      g.lineWidth = 1;
      const pts = wander(r, r() * PX, r() * PX, 40 + r() * 120, r() * Math.PI * 2);
      g.beginPath();
      pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
    }
  }
  // Fine grain.
  const img = g.getImageData(0, 0, PX, PX);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * s.grain;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  return c;
}

let cache: Record<PaperKind, HTMLCanvasElement> | null = null;

export function paperTiles() {
  if (!cache) {
    const kinds = Object.keys(SPECS) as PaperKind[];
    cache = Object.fromEntries(kinds.map((k, i) => [k, paint(k, 31 + i * 17)])) as Record<PaperKind, HTMLCanvasElement>;
  }
  return cache;
}

const pats = new WeakMap<CanvasRenderingContext2D, Partial<Record<PaperKind, CanvasPattern>>>();

/** The given paper, laid in world metres (the context is scaled to metres), shifted and turned per surface. */
export function laid(g: CanvasRenderingContext2D, kind: PaperKind, seed = 0, turn = true) {
  let m = pats.get(g);
  if (!m) pats.set(g, (m = {}));
  const p = m[kind] ?? (m[kind] = g.createPattern(paperTiles()[kind], 'repeat')!);
  const r = rng(seed * 131 + 7);
  const k = TILE_M / PX;
  p.setTransform(new DOMMatrix().translate(r() * TILE_M, r() * TILE_M).rotate(turn ? Math.floor(r() * 4) * 90 + (r() - 0.5) * 6 : 0).scale(k));
  return p;
}
