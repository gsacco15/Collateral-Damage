// The model view: the same city, people and strike as a tilted paper diorama in three.js.
// Loaded only when someone opens it.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BRIDGE_RUIN, buildingAt, buildingDist, effect, lobe, riverX, rng, structureAt, targetOf, weapon, type Building, type Estimate, type Plan, type Population, type Rect, type World } from '../jev';
import type { Car, Walker } from './crowd';
import { drawCity } from './drawCity';
import type { Layers, Outcome } from './map';
import { grade, nightness, sun } from './paper';
import { Life3D } from './life3d';
import { casualties, lifeScene } from './lifeScene';
import { terrain } from './terrain';

export interface Frame3D {
  ruins: number[]; // destroyed by earlier strikes
  world: World;
  plan: Plan;
  pop: Population;
  est: Estimate | null;
  layers: Layers;
  circleR: number;
  outcome: Outcome | null;
  strike: { plan: Plan; outcome: Outcome; t: number } | null; // t: seconds since release, on the map's clock
  walkers: Walker[];
  cars: Car[];
  clock?: number; // the map's clock, so the city's life is at the same moment in both views
}

const IMPACT_AT = 2.6;
const GROUND_PX = 2; // ground texture pixels per metre

// ---------------------------------------------------------------- textures

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, r: () => number) => void, seed = 1, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  draw(g, rng(seed));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function grain(g: CanvasRenderingContext2D, r: () => number, w: number, h: number, strength: number) {
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * strength;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

/** A wall: one window per bay per floor. lit = the night version (glowing windows on black). */
function wallTex(base: string, lit: boolean, seed: number, windows = true) {
  return canvasTex(
    128,
    128,
    (g, r) => {
      g.fillStyle = lit ? '#000' : base;
      g.fillRect(0, 0, 128, 128);
      if (!lit) {
        grain(g, r, 128, 128, 14);
        // Weathering: dust settled along the foot of the wall, a rain streak under the sill, a stain here and there.
        const foot = g.createLinearGradient(0, 128, 0, 104);
        foot.addColorStop(0, 'rgba(110,90,65,0.22)');
        foot.addColorStop(1, 'rgba(110,90,65,0)');
        g.fillStyle = foot;
        g.fillRect(0, 104, 128, 24);
        if (windows) {
          const st = g.createLinearGradient(0, 88, 0, 118);
          st.addColorStop(0, 'rgba(80,70,60,0.16)');
          st.addColorStop(1, 'rgba(80,70,60,0)');
          g.fillStyle = st;
          g.fillRect(48 + r() * 20, 88, 3 + r() * 4, 30);
        }
        if (r() < 0.5) {
          g.fillStyle = 'rgba(120,100,75,0.10)';
          g.beginPath();
          g.ellipse(r() * 128, r() * 128, 10 + r() * 14, 6 + r() * 10, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
      if (!windows) return;
      const on = r() < 0.55;
      if (lit) {
        if (!on) return;
        g.fillStyle = r() < 0.5 ? '#ffc877' : '#ffdca0';
      } else g.fillStyle = '#3b352e';
      g.fillRect(44, 40, 40, 44);
      if (!lit) {
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.fillRect(41, 84, 46, 4);
      }
    },
    seed,
  );
}

function roofTex(base: string, seed: number, creases: number) {
  return canvasTex(
    256,
    256,
    (g, r) => {
      g.fillStyle = base;
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < creases; i++) {
        g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(60,40,20,0.07)';
        g.beginPath();
        const x = r() * 256;
        const y = r() * 256;
        g.moveTo(x, y);
        for (let k = 0; k < 3; k++) g.lineTo(x + (r() - 0.5) * 140, y + (r() - 0.5) * 140);
        g.closePath();
        g.fill();
      }
      grain(g, r, 256, 256, 12);
    },
    seed,
  );
}

/** Corrugated metal: ridges, panels rusted or repainted, rust running down in streaks. */
function metalTex(base: string, seed: number) {
  return canvasTex(
    128,
    128,
    (g, r) => {
      g.fillStyle = base;
      g.fillRect(0, 0, 128, 128);
      for (let x = 0; x < 128; x += 4) {
        g.fillStyle = x % 8 ? 'rgba(255,255,255,0.14)' : 'rgba(30,30,35,0.10)';
        g.fillRect(x, 0, 2, 128);
      }
      for (let i = 0; i < 4; i++) {
        g.fillStyle = r() < 0.6 ? 'rgba(150,78,38,0.30)' : 'rgba(90,120,150,0.18)';
        g.fillRect(Math.floor(r() * 4) * 32, r() * 128, 32, 20 + r() * 60);
      }
      for (let i = 0; i < 14; i++) {
        const x = r() * 128;
        const y = r() * 100;
        const len = 10 + r() * 30;
        const grd = g.createLinearGradient(x, y, x, y + len);
        grd.addColorStop(0, 'rgba(130,64,28,0.45)');
        grd.addColorStop(1, 'rgba(130,64,28,0)');
        g.fillStyle = grd;
        g.fillRect(x, y, 1.5, len);
      }
      grain(g, r, 128, 128, 16);
    },
    seed,
  );
}

function stripesTex(a: string, b: string, n: number) {
  return canvasTex(64, 64, (g) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = i % 2 ? a : b;
      g.fillRect((i * 64) / n, 0, 64 / n, 64);
    }
  });
}

// ---------------------------------------------------------------- geometry helpers

/** Four walls of a box with UVs in world units (tileU metres across, tileV metres up). */
/** Four walls. With a tint, the walls carry vertex colours: the building's own wash, a little darker and dustier at the foot. */
function wallsGeo(q: Rect, h: number, base: number, tileU: number, tileV: number, tint?: [number, number, number]) {
  const pos: number[] = [];
  const uv: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const band = (x0: number, z0: number, x1: number, z1: number, nx: number, nz: number, ya: number, yb: number, ka: number, kb: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const u1 = len / tileU;
    const va = (ya - base) / tileV;
    const vb = (yb - base) / tileV;
    pos.push(x0, ya, z0, x1, ya, z1, x1, yb, z1, x0, ya, z0, x1, yb, z1, x0, yb, z0);
    uv.push(0, va, u1, va, u1, vb, 0, va, u1, vb, 0, vb);
    for (let i = 0; i < 6; i++) nor.push(nx, 0, nz);
    if (tint) for (const k of [ka, ka, kb, ka, kb, kb]) col.push(tint[0] * k, tint[1] * k * 0.99, tint[2] * k * 0.97);
  };
  const quad = (x0: number, z0: number, x1: number, z1: number, nx: number, nz: number) => {
    if (!tint) return band(x0, z0, x1, z1, nx, nz, base, base + h, 1, 1);
    const foot = Math.min(1.3, h * 0.3);
    band(x0, z0, x1, z1, nx, nz, base, base + foot, 0.8, 0.97);
    band(x0, z0, x1, z1, nx, nz, base + foot, base + h, 0.97, 1);
  };
  const { x, y: z, w, h: d } = q;
  quad(x, z + d, x + w, z + d, 0, 1);
  quad(x + w, z, x, z, 0, -1);
  quad(x + w, z + d, x + w, z, 1, 0);
  quad(x, z, x, z + d, -1, 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (tint) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

// Washes for ordinary walls: warm grey, clay, cream and faded ochre, kept soft so the paper still shows through.
const WASH: [number, number, number][] = [
  [1, 1, 1],
  [0.94, 0.92, 0.89],
  [1, 0.9, 0.8],
  [1, 0.97, 0.88],
  [1, 0.92, 0.74],
  [0.97, 0.93, 0.87],
];

function roofGeo(q: Rect, y: number, tile: number) {
  const g = new THREE.PlaneGeometry(q.w, q.h);
  g.rotateX(-Math.PI / 2);
  g.translate(q.x + q.w / 2, y, q.y + q.h / 2);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * q.w) / tile + q.x / tile, (uv.getY(i) * q.h) / tile + q.y / tile);
  return g;
}


/** A crumpled sheet of paper laid over a roof: lumpy, a little ragged at the edges, and where it runs past the roof
 * edge it droops down the wall. */
function crumpleGeo(q: Rect, h: number, r: () => number) {
  const w = q.w * (0.45 + r() * 0.4);
  const d = q.h * (0.45 + r() * 0.35);
  let cx = q.x + w / 2 + r() * (q.w - w);
  let cz = q.y + d / 2 + r() * (q.h - d);
  // Now and then it slides over an edge.
  if (r() < 0.45) {
    const side = Math.floor(r() * 4);
    const over = 0.6 + r() * 0.9;
    if (side === 0) cx = q.x + w / 2 - over;
    else if (side === 1) cx = q.x + q.w - w / 2 + over;
    else if (side === 2) cz = q.y + d / 2 - over;
    else cz = q.y + q.h - d / 2 + over;
  }
  const g = new THREE.PlaneGeometry(w, d, 6, 5).rotateX(-Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const edge = Math.abs(pos.getX(i)) > w / 2 - 0.01 || Math.abs(pos.getZ(i)) > d / 2 - 0.01;
    const x = cx + pos.getX(i) + (edge ? (r() - 0.5) * 0.5 : (r() - 0.5) * 0.15);
    const z = cz + pos.getZ(i) + (edge ? (r() - 0.5) * 0.5 : (r() - 0.5) * 0.15);
    const out = Math.max(q.x - x, x - q.x - q.w, q.y - z, z - q.y - q.h, 0);
    pos.setXYZ(i, x, h + 0.08 + r() * (edge ? 0.12 : 0.32) - out * 1.4, z);
  }
  g.computeVertexNormals();
  return g;
}

function boxGeo(x: number, y: number, z: number, w: number, h: number, d: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

/** A hipped roof: four sloping faces up to a ridge. */
function hipGeo(q: Rect, y: number, rise: number) {
  const cx = q.x + q.w / 2;
  const cz = q.y + q.h / 2;
  const ridge = Math.max(0, (q.w - q.h) / 2);
  const a = [q.x, y, q.y];
  const b = [q.x + q.w, y, q.y];
  const c = [q.x + q.w, y, q.y + q.h];
  const d = [q.x, y, q.y + q.h];
  const r1 = [cx - ridge, y + rise, cz];
  const r2 = [cx + ridge, y + rise, cz];
  const pos = [...a, ...r1, ...b, ...b, ...r1, ...r2, ...d, ...c, ...r1, ...c, ...r2, ...r1, ...a, ...d, ...r1, ...b, ...r2, ...c];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  return g.toNonIndexed();
}

/** A tent: canvas over a ridge pole along its long side, with low walls under the eaves. */
function tentGeo(q: Rect, h: number) {
  const alongX = q.w >= q.h;
  const e = h * 0.35;
  // Work in (u along the ridge, v across it), then map to x/z.
  const u0 = alongX ? q.x : q.y;
  const u1 = alongX ? q.x + q.w : q.y + q.h;
  const v0 = alongX ? q.y : q.x;
  const v1 = alongX ? q.y + q.h : q.x + q.w;
  const vm = (v0 + v1) / 2;
  const P = (u: number, y: number, v: number) => (alongX ? [u, y, v] : [v, y, u]);
  const quad = (a: number[], b: number[], c: number[], d: number[]) => [...a, ...b, ...c, ...a, ...c, ...d];
  const pos = [
    ...quad(P(u0, e, v0), P(u1, e, v0), P(u1, h, vm), P(u0, h, vm)),
    ...quad(P(u0, e, v1), P(u0, h, vm), P(u1, h, vm), P(u1, e, v1)),
    ...quad(P(u0, 0, v0), P(u1, 0, v0), P(u1, e, v0), P(u0, e, v0)),
    ...quad(P(u0, 0, v1), P(u0, e, v1), P(u1, e, v1), P(u1, 0, v1)),
    ...quad(P(u0, 0, v0), P(u0, e, v0), P(u0, e, v1), P(u0, 0, v1)),
    ...quad(P(u1, 0, v0), P(u1, 0, v1), P(u1, e, v1), P(u1, e, v0)),
    ...P(u0, e, v0), ...P(u0, h, vm), ...P(u0, e, v1),
    ...P(u1, e, v0), ...P(u1, e, v1), ...P(u1, h, vm),
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  return g;
}

/** The warehouse roof: white paper folded like an accordion. */
function foldedGeo(q: Rect, h: number) {
  const strip = 2.4;
  const pos: number[] = [];
  const { x, y: z, w, h: d } = q;
  for (let sx = x; sx < x + w - 0.01; sx += strip) {
    const x1 = Math.min(x + w, sx + strip);
    const xm = (sx + x1) / 2;
    const top = h + 1.1;
    pos.push(sx, h, z, xm, top, z + d, xm, top, z, sx, h, z, sx, h, z + d, xm, top, z + d);
    pos.push(xm, top, z, x1, h, z + d, x1, h, z, xm, top, z, xm, top, z + d, x1, h, z + d);
    pos.push(sx, h, z, xm, top, z, x1, h, z, sx, h, z + d, x1, h, z + d, xm, top, z + d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  return g;
}

/** Paint on a folded roof: the same folds, a hair above, with texture coordinates laid flat across the roof. */
function foldedDecalGeo(q: Rect, h: number) {
  const g = foldedGeo(q, h + 0.03);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - q.x) / q.w, (pos.getZ(i) - q.y) / q.h);
  return g;
}

/** "14", painted big on the roof years ago and fading. */
let fourteen: THREE.Texture | null = null;
function fourteenTex(aspect: number) {
  if (fourteen) return fourteen;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = Math.round(512 / aspect);
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(60,50,40,0.5)';
  g.font = `700 ${Math.min(c.width, c.height) * 0.62}px "IBM Plex Sans", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('14', c.width / 2, c.height / 2 + 2);
  fourteen = new THREE.CanvasTexture(c);
  fourteen.flipY = false;
  fourteen.colorSpace = THREE.SRGBColorSpace;
  return fourteen;
}

function tornSheet(w: number, d: number, r: () => number) {
  const s = new THREE.Shape();
  const n = 14;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const side = Math.floor(t * 4);
    const u = (t * 4) % 1;
    const j = () => (r() - 0.5) * 0.5;
    const x = side === 0 ? -w / 2 + w * u : side === 1 ? w / 2 : side === 2 ? w / 2 - w * u : -w / 2;
    const y = side === 0 ? -d / 2 : side === 1 ? -d / 2 + d * u : side === 2 ? d / 2 : d / 2 - d * u;
    if (i === 0) s.moveTo(x + j(), y + j());
    else s.lineTo(x + j(), y + j());
  }
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.12 + r() * 0.2, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function paperPlane() {
  const g = new THREE.Group();
  const s = 7;
  const mk = (pts: number[], color: string) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 1 }));
    m.castShadow = true;
    return m;
  };
  // A folded-paper drone: a slim body creased along its length, long straight wings (a lit fold and a shaded one),
  // a V tail and a pusher propeller disc. Nose toward -z.
  const L = 2 * s;
  const W = 2.1 * s;
  g.add(mk([0, 0.35, -L, -0.22 * s, 0, -0.6 * s, 0, -0.05, 0.9 * s, 0, 0.35, -L, 0, -0.05, 0.9 * s, 0.22 * s, 0, -0.6 * s], '#f1ede4')); // body, two faces
  g.add(mk([-0.1 * s, 0.1, -0.3 * s, -W, 0.25, 0.05 * s, -W, 0.25, 0.3 * s, -0.1 * s, 0.1, -0.3 * s, -W, 0.25, 0.3 * s, -0.1 * s, 0.1, 0.25 * s], '#fbfaf6')); // left wing
  g.add(mk([0.1 * s, 0.1, -0.3 * s, W, 0.25, 0.3 * s, W, 0.25, 0.05 * s, 0.1 * s, 0.1, -0.3 * s, 0.1 * s, 0.1, 0.25 * s, W, 0.25, 0.3 * s], '#ddd6c9')); // right wing
  g.add(mk([-0.05 * s, 0.05, 0.6 * s, -0.7 * s, 0.55 * s, 0.95 * s, -0.05 * s, 0.05, 0.85 * s], '#e9e3d8')); // V tail, left
  g.add(mk([0.05 * s, 0.05, 0.6 * s, 0.05 * s, 0.05, 0.85 * s, 0.7 * s, 0.55 * s, 0.95 * s], '#d2cabb')); // V tail, right
  const prop = new THREE.Mesh(new THREE.CircleGeometry(0.55 * s, 20), new THREE.MeshBasicMaterial({ color: '#6f6a63', transparent: true, opacity: 0.22, side: THREE.DoubleSide }));
  prop.position.set(0, 0, 0.95 * s);
  g.add(prop);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12 * s, 10, 8), new THREE.MeshStandardMaterial({ color: '#4a4640', roughness: 0.4 }));
  eye.position.set(0, -0.15 * s, -1.3 * s);
  g.add(eye);
  return g;
}

function dashed(pts: THREE.Vector3[], color: string, dash: number, gap: number, opacity: number) {
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color, dashSize: dash, gapSize: gap, transparent: true, opacity, depthTest: false }));
  line.computeLineDistances();
  line.renderOrder = 10;
  return line;
}

// ---------------------------------------------------------------- the model

type MatKey = 'white' | 'grey' | 'kraft' | 'tin' | 'terracotta';

export class Model3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 1, 4000);
  controls: OrbitControls;
  private sunLight = new THREE.DirectionalLight('#fff4e0', 2.4);
  private hemi = new THREE.HemisphereLight('#dfe7ef', '#b59a74', 1.0);
  private flash = new THREE.PointLight('#ffd9a0', 0, 180, 1.4);
  private city = new THREE.Group();
  private rubble = new THREE.Group();
  private overlay = new THREE.Group();
  private fx = new THREE.Group();
  private people: THREE.InstancedMesh;
  private heads: THREE.InstancedMesh;
  private wraps: THREE.InstancedMesh; // scarves, turbans, keffiyehs, caps: what's on their heads
  private rings: THREE.InstancedMesh;
  private carBodies: THREE.InstancedMesh;
  private carGlass: THREE.InstancedMesh;
  private carWheels: THREE.InstancedMesh;
  private carLights: THREE.InstancedMesh;
  private carTails!: THREE.InstancedMesh;
  private carBeams!: THREE.InstancedMesh;
  private tailMat = new THREE.MeshStandardMaterial({ color: '#8a2a1e', emissive: '#ff3a24', emissiveIntensity: 0, roughness: 0.4 });
  private beamMat!: THREE.MeshBasicMaterial;
  private lightMat = new THREE.MeshStandardMaterial({ color: '#f3ead2', emissive: '#ffd98a', emissiveIntensity: 0, roughness: 0.4 });
  private litMats: THREE.MeshStandardMaterial[] = [];
  private mats!: Record<string, THREE.Material>;
  private raf = 0;
  private overlayKey = '';
  private damageKey = '-';
  private hourKey = -1;
  private labels = new Map<string, HTMLDivElement>();
  private puffs: { m: THREE.Mesh; v: THREE.Vector3; born: number; grow: number }[] = [];
  private plume: THREE.Mesh[] = []; // the smoke that lingers after a strike
  private smokeAt: { x: number; z: number; born: number; dark: number; big: number } | null = null;
  // Fireballs and pressure rings: the bomb's own, and one for each thing it sets off.
  private balls: { m: THREE.Mesh; x: number; z: number; born: number; lasts: number; size: number }[] = [];
  private waves: { m: THREE.Mesh; born: number; dur: number; max: number }[] = [];
  private flashPower = 1100;
  private birds!: THREE.InstancedMesh;
  private scraps: { m: THREE.Mesh; v: THREE.Vector3; spin: THREE.Vector3 }[] = [];
  private streaks: { m: THREE.Mesh; born: number; lasts: number }[] = [];
  private fxKey: Outcome | null = null;
  private plane: THREE.Group;
  private bomb: THREE.Mesh;
  private last = performance.now();
  private life!: Life3D;
  // A paper moon and paper stars, kept at a fixed bearing in the sky (they move with the camera, like the real ones).
  private moon!: THREE.Sprite;
  private stars!: THREE.Points;
  private moonDir = new THREE.Vector3(0.3, 0.3, -0.9).normalize(); // north-north-east, about 17 degrees up: over the mountains ahead in the usual view
  // Lit windows at night, room by room: every window on a windowed wall, and which of them are lit this half hour.
  private winMesh!: THREE.InstancedMesh;
  private winMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
  private wins: { b: Building; x: number; y: number; z: number; yaw: number }[] = [];
  private winKey = '';
  private winDamaged = new Set<number>();

  constructor(
    private canvas: HTMLCanvasElement,
    private labelLayer: HTMLDivElement,
    private world: World,
    private getFrame: () => Frame3D | null,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    const s = this.scene;
    s.add(this.hemi, this.sunLight, this.sunLight.target, this.flash, this.city, this.rubble, this.overlay, this.fx);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(4096, 4096);
    const sc = this.sunLight.shadow.camera;
    sc.left = -560;
    sc.right = 560;
    sc.top = 420;
    sc.bottom = -420;
    sc.near = 10;
    sc.far = 1600;
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.normalBias = 0.5;
    this.sunLight.target.position.set(world.w / 2, 0, world.h / 2);

    this.buildStatic();
    this.life = new Life3D(s, world);
    this.buildSky(s);
    this.buildWindows(s);

    const bodyGeo = new THREE.CylinderGeometry(0.34, 0.42, 1.25, 7);
    bodyGeo.translate(0, 0.62, 0);
    const headGeo = new THREE.SphereGeometry(0.28, 8, 6);
    headGeo.translate(0, 1.48, 0);
    this.people = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), 1600);
    this.heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), 1600);
    const wrapGeo = new THREE.SphereGeometry(0.3, 8, 6);
    this.wraps = new THREE.InstancedMesh(wrapGeo, new THREE.MeshStandardMaterial({ roughness: 0.95 }), 1600);
    // Cars: a body and a roof in the car's colour, a band of dark glass, four wheels, lamps front and back.
    const carGeo = mergeGeometries([boxGeo(0, 0.62, 0, 4.2, 0.85, 1.9), boxGeo(-0.35, 1.66, 0, 2.0, 0.1, 1.62)])!;
    this.carBodies = new THREE.InstancedMesh(carGeo, new THREE.MeshStandardMaterial({ roughness: 0.6 }), 400);
    const glassGeo = mergeGeometries([boxGeo(-0.3, 1.33, 0, 2.3, 0.56, 1.72)])!;
    this.carGlass = new THREE.InstancedMesh(glassGeo, new THREE.MeshStandardMaterial({ color: '#2b3440', roughness: 0.25, metalness: 0.4 }), 400);
    const wheelGeo = mergeGeometries(
      [
        [1.3, 0.95],
        [1.3, -0.95],
        [-1.3, 0.95],
        [-1.3, -0.95],
      ].map(([x, z]) => new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10).rotateX(Math.PI / 2).translate(x, 0.36, z).toNonIndexed()),
    )!;
    this.carWheels = new THREE.InstancedMesh(wheelGeo, new THREE.MeshStandardMaterial({ color: '#232120', roughness: 0.8 }), 400);
    const lightGeo = mergeGeometries([boxGeo(2.11, 0.75, 0.6, 0.04, 0.22, 0.42), boxGeo(2.11, 0.75, -0.6, 0.04, 0.22, 0.42)])!;
    this.carLights = new THREE.InstancedMesh(lightGeo, this.lightMat, 400);
    this.carTails = new THREE.InstancedMesh(mergeGeometries([boxGeo(-2.11, 0.8, 0.62, 0.04, 0.2, 0.36), boxGeo(-2.11, 0.8, -0.62, 0.04, 0.2, 0.36)])!, this.tailMat, 400);
    // Headlight beams: a long soft wedge of light on the road ahead, faded along its length.
    {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 32;
      const g = c.getContext('2d')!;
      const grd = g.createLinearGradient(0, 0, 64, 0);
      grd.addColorStop(0, 'rgba(255,240,200,0.9)');
      grd.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(0, 12);
      g.lineTo(64, 0);
      g.lineTo(64, 32);
      g.lineTo(0, 20);
      g.closePath();
      g.fill();
      this.beamMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4 });
    }
    this.carBeams = new THREE.InstancedMesh(new THREE.PlaneGeometry(9, 4.4).rotateX(-Math.PI / 2).translate(2.2 + 4.5, 0.25, 0), this.beamMat, 400);
    for (const im of [this.carTails, this.carBeams]) {
      im.count = 0;
      im.frustumCulled = false;
      s.add(im);
    }
    for (const m of [this.people, this.heads, this.wraps, this.carBodies, this.carGlass, this.carWheels, this.carLights]) {
      m.castShadow = true;
      m.count = 0;
      m.frustumCulled = false;
      s.add(m);
    }
    const ringGeo = new THREE.RingGeometry(0.9, 1.25, 20);
    ringGeo.rotateX(-Math.PI / 2);
    // Lingering smoke: sixteen soft puffs that march up and away downwind; hidden until a strike.
    const plumeGeo = new THREE.IcosahedronGeometry(1, 1);
    for (let k = 0; k < 16; k++) {
      const pm = new THREE.Mesh(plumeGeo, new THREE.MeshStandardMaterial({ color: '#8f8a84', roughness: 1, flatShading: true, transparent: true, opacity: 0, depthWrite: false }));
      pm.visible = false;
      s.add(pm);
      this.plume.push(pm);
    }
    // Birds: small paper Vs.
    const birdGeo = mergeGeometries([boxGeo(-0.45, 0, 0.25, 0.9, 0.04, 0.12).rotateY(0.5), boxGeo(0.45, 0, 0.25, 0.9, 0.04, 0.12).rotateY(-0.5)])!;
    this.birds = new THREE.InstancedMesh(birdGeo, new THREE.MeshStandardMaterial({ color: '#3a332d', roughness: 1 }), 10);
    this.birds.count = 0;
    this.birds.frustumCulled = false;
    s.add(this.birds);
    this.rings = new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#c2412b' }), 800);
    this.rings.count = 0;
    this.rings.frustumCulled = false;
    s.add(this.rings);

    this.plane = paperPlane();
    this.plane.visible = false;
    s.add(this.plane);
    this.bomb = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.6, 4, 8), new THREE.MeshStandardMaterial({ color: '#77736c', roughness: 0.6 }));
    this.bomb.visible = false;
    s.add(this.bomb);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 30;
    this.controls.maxDistance = 1300;
    this.controls.maxPolarAngle = 1.47; // low enough, from the street, to see the sky
    this.controls.minPolarAngle = 0.1;
    // Pan across the ground like a map, never down through it.
    this.controls.screenSpacePanning = false;
    this.controls.autoRotateSpeed = 0.55;
    // A slow orbit (from the guide) stops the moment someone takes the controls.
    this.controls.addEventListener('start', () => (this.controls.autoRotate = false));
    this.preset('drone', true);

    this.resize();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    this.raf = requestAnimationFrame(loop);
  }

  private fly: { t0: THREE.Vector3; t1: THREE.Vector3; p0: THREE.Vector3; p1: THREE.Vector3; k: number; dur?: number } | null = null;

  /** Glide the camera to look at a spot on the map, keeping the current angle, from a comfortable distance. */
  flyTo(x: number, y: number, dist = 160, dur = 1.1) {
    const t1 = new THREE.Vector3(x, 4, y);
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    if (dir.y < 0.35) dir.y = 0.35;
    dir.normalize();
    this.fly = { t0: this.controls.target.clone(), t1, p0: this.camera.position.clone(), p1: t1.clone().add(dir.multiplyScalar(dist)), k: 0, dur };
  }

  /**
   * Glide down over a spot, then circle it slowly until someone takes the controls.
   * from: the compass bearing the camera starts from (0 north, 90 east); pitch: how far it looks down, in degrees.
   */
  orbit(x: number, y: number, dist = 120, from = 90, pitch = 40, speed = 1) {
    const t1 = new THREE.Vector3(x, 2, y);
    const b = (from * Math.PI) / 180;
    const p = (pitch * Math.PI) / 180;
    const p1 = t1.clone().add(new THREE.Vector3(Math.sin(b) * Math.cos(p), Math.sin(p), -Math.cos(b) * Math.cos(p)).multiplyScalar(dist));
    this.fly = { t0: this.controls.target.clone(), t1, p0: this.camera.position.clone(), p1, k: 0, dur: 2.4 };
    this.controls.autoRotateSpeed = speed;
    this.controls.autoRotate = true;
  }
  stopOrbit() {
    this.controls.autoRotate = false;
  }

  /** Cut straight to looking at a spot from a distance, keeping the current angle: used when switching over from the flat map. */
  jumpTo(x: number, y: number, dist: number) {
    this.fly = null;
    const t = new THREE.Vector3(x, 4, y);
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    if (dir.y < 0.35) dir.y = 0.35;
    dir.normalize();
    this.controls.target.copy(t);
    this.camera.position.copy(t).add(dir.multiplyScalar(Math.max(this.controls.minDistance, Math.min(this.controls.maxDistance, dist))));
    this.controls.update();
  }
  /** The spot on the ground under a point on the screen (client pixels), and roughly how many metres a pixel spans there. */
  groundAt(clientX: number, clientY: number) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -1), hit)) return null;
    const d = this.camera.position.distanceTo(hit);
    const mpp = (2 * d * Math.tan((this.camera.fov * Math.PI) / 360)) / r.height;
    return { x: hit.x, y: hit.z, mpp };
  }
  /** Where the camera is looking, and from how far: used when switching back to the flat map. */
  lookingAt() {
    const t = this.controls.target;
    return { x: t.x, y: t.z, dist: this.camera.position.distanceTo(t) };
  }

  /** Look at the current target. */
  toTarget() {
    const f = this.getFrame();
    const t = f ? targetOf(this.world, f.plan.target) : this.world.targets[0];
    this.flyTo(t.rect.x + t.rect.w / 2, t.rect.y + t.rect.h / 2, 150);
  }

  /** A camera angle over the spot you're looking at now. Only the Target button (or the first view) goes to the target. */
  preset(name: 'drone' | 'street' | 'top', atTarget = false) {
    const off = name === 'drone' ? new THREE.Vector3(-80, 110, 200) : name === 'street' ? new THREE.Vector3(-10, 14, 110) : new THREE.Vector3(0, 380, 2);
    if (atTarget) {
      this.fly = null;
      const f = this.getFrame();
      const t = f ? targetOf(this.world, f.plan.target) : this.world.targets[0];
      const target = new THREE.Vector3(t.rect.x + t.rect.w / 2, 4, t.rect.y + t.rect.h / 2 + 18);
      this.controls.target.copy(target);
      this.camera.position.copy(target).add(off);
      this.controls.update();
      return;
    }
    const here = this.controls.target.clone();
    here.y = 4;
    this.fly = { t0: this.controls.target.clone(), t1: here, p0: this.camera.position.clone(), p1: here.clone().add(off), k: 0 };
  }


  resize() {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, r.width);
    const h = Math.max(1, r.height);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.controls.dispose();
    this.renderer.dispose();
    this.scene.traverse((o) => (o as THREE.Mesh).geometry?.dispose?.());
    this.labelLayer.innerHTML = '';
  }

  // ---------------------------------------------------------------- static city

  private buildStatic() {
    const w = this.world;
    const s = this.scene;
    // The ground: the map's own street plan, painted onto one sheet.
    const m = 60;
    const gc = document.createElement('canvas');
    gc.width = (w.w + m * 2) * GROUND_PX;
    gc.height = (w.h + m * 2) * GROUND_PX;
    const gg = gc.getContext('2d')!;
    gg.setTransform(GROUND_PX, 0, 0, GROUND_PX, m * GROUND_PX, m * GROUND_PX);
    const f = this.getFrame();
    drawCity(gg, w, { hour: 12, pop: f!.pop, damaged: new Set(), crater: null, view: { x: -m, y: -m, w: w.w + m * 2, h: w.h + m * 2 }, scale: GROUND_PX }, null);
    gg.setTransform(1, 0, 0, 1, 0, 0);
    grain(gg, rng(5), gc.width, gc.height, 9);
    const tex = new THREE.CanvasTexture(gc);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(w.w + m * 2, w.h + m * 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(w.w / 2, 0, w.h / 2);
    ground.receiveShadow = true;
    s.add(ground);
    const far = new THREE.Mesh(new THREE.CircleGeometry(2400, 48), new THREE.MeshStandardMaterial({ color: '#cfc3b0', roughness: 1 }));
    far.rotation.x = -Math.PI / 2;
    far.position.set(w.w / 2, -0.05, w.h / 2);
    far.receiveShadow = true;
    s.add(far);
    // Beyond the town: low swells of land and rocky outcrops, the same ones the map shows. Faceted paper stones.
    {
      const { rocks, mounds } = terrain(w);
      const swells = mounds.map((m) => new THREE.SphereGeometry(1, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(m.rx, m.h, m.ry).rotateY(-m.rot).translate(m.x, -0.4, m.y));
      const land = new THREE.Mesh(mergeGeometries(swells.map((g) => g.toNonIndexed()))!, new THREE.MeshStandardMaterial({ color: '#d6c6a8', roughness: 1, flatShading: true }));
      land.receiveShadow = true;
      s.add(land);
      const stones: THREE.BufferGeometry[] = [];
      for (const o of rocks)
        for (const st of o.stones) {
          const g = new THREE.DodecahedronGeometry(st.s, 0);
          g.scale(st.pts[0], st.tall, st.pts[1] ?? 1);
          g.rotateY(st.rot);
          g.translate(st.x, st.s * st.tall * 0.35, st.y);
          stones.push(g.toNonIndexed());
        }
      const rockMesh = new THREE.Mesh(mergeGeometries(stones)!, new THREE.MeshStandardMaterial({ color: '#bfae8f', roughness: 1, flatShading: true }));
      rockMesh.castShadow = rockMesh.receiveShadow = true;
      s.add(rockMesh);
    }

    // Water, a little glossy, just below the quays.
    const half = w.river.width / 2;
    const pts: number[] = [];
    const idx: number[] = [];
    let n = 0;
    for (let y = -60; y <= w.h + 60; y += 6) {
      const x = riverX(y);
      pts.push(x - half, 0.08, y, x + half, 0.08, y);
      if (n) idx.push((n - 1) * 2, n * 2, (n - 1) * 2 + 1, (n - 1) * 2 + 1, n * 2, n * 2 + 1);
      n++;
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    wg.setIndex(idx);
    wg.computeVertexNormals();
    const water = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ color: '#8fa9b3', roughness: 0.25, metalness: 0.15 }));
    water.receiveShadow = true;
    s.add(water);
    // Bridges: decks with parapets.
    const bridgeMat = new THREE.MeshStandardMaterial({ color: '#d6cfc3', roughness: 0.9 });
    for (const rd of w.roads) {
      if (rd.kind !== 'bridge') continue;
      const q = rd.rect;
      const deck = new THREE.Mesh(mergeGeometries([boxGeo(q.x + q.w / 2, 0.9, q.y + q.h / 2, q.w, 0.6, q.h + 2), boxGeo(q.x + q.w / 2, 1.6, q.y - 0.6, q.w, 1, 0.5), boxGeo(q.x + q.w / 2, 1.6, q.y + q.h + 0.6, q.w, 1, 0.5)])!, bridgeMat);
      deck.castShadow = deck.receiveShadow = true;
      s.add(deck);
    }

    this.mats = {
      whiteWall: new THREE.MeshStandardMaterial({ map: wallTex('#efece5', false, 1), emissiveMap: wallTex('#000', true, 1), emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.95 }),
      greyWall: new THREE.MeshStandardMaterial({ map: wallTex('#c2bcb2', false, 3), emissiveMap: wallTex('#000', true, 3), emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.95 }),
      kraftWall: new THREE.MeshStandardMaterial({ map: wallTex('#c89e69', false, 2), emissiveMap: wallTex('#000', true, 2), emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.95 }),
      schoolWall: new THREE.MeshStandardMaterial({ map: wallTex('#e3b25a', false, 5), emissiveMap: wallTex('#000', true, 5), emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.95 }),
      tinWall: new THREE.MeshStandardMaterial({ map: metalTex('#a4a9ab', 7), roughness: 0.75, metalness: 0.2 }),
      terracottaWall: new THREE.MeshStandardMaterial({ map: wallTex('#f1ece2', false, 4), emissiveMap: wallTex('#000', true, 4), emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.95 }),
      whiteRoof: new THREE.MeshStandardMaterial({ map: roofTex('#f1eee8', 4, 14), roughness: 1 }),
      greyRoof: new THREE.MeshStandardMaterial({ map: roofTex('#cdc8bf', 6, 14), roughness: 1 }),
      kraftRoof: new THREE.MeshStandardMaterial({ map: roofTex('#c99f69', 5, 20), roughness: 1 }),
      tinRoof: new THREE.MeshStandardMaterial({ map: metalTex('#b0b5b7', 9), roughness: 0.65, metalness: 0.25 }),
      terracottaRoof: new THREE.MeshStandardMaterial({ color: '#c47a5a', roughness: 0.9, flatShading: true }),
      fold: new THREE.MeshStandardMaterial({ color: '#f5f3ee', roughness: 0.9, flatShading: true, side: THREE.DoubleSide }),
      cardEdge: new THREE.MeshStandardMaterial({ color: '#dcc195', roughness: 1 }), // the cut edge of the card, lighter than its face
      dome: new THREE.MeshStandardMaterial({ color: '#d9b77a', roughness: 0.55 }),
      tank: new THREE.MeshStandardMaterial({ color: '#8e8b85', roughness: 0.5, metalness: 0.3 }),
      fuel: new THREE.MeshStandardMaterial({ color: '#f3f1ec', roughness: 0.5, metalness: 0.1 }),
      wall: new THREE.MeshStandardMaterial({ color: '#ece6da', roughness: 1 }),
      stand: new THREE.MeshStandardMaterial({ color: '#c9c4bb', roughness: 1, flatShading: true }),
      dish: new THREE.MeshStandardMaterial({ color: '#ecebe6', roughness: 0.6, side: THREE.DoubleSide }),
      line: new THREE.MeshStandardMaterial({ color: '#6a6258', roughness: 1 }),
      clothA: new THREE.MeshStandardMaterial({ color: '#b8574a', roughness: 1, side: THREE.DoubleSide }),
      clothB: new THREE.MeshStandardMaterial({ color: '#e9e4d8', roughness: 1, side: THREE.DoubleSide }),
      clothC: new THREE.MeshStandardMaterial({ color: '#4f7291', roughness: 1, side: THREE.DoubleSide }),
      lamp: new THREE.MeshStandardMaterial({ color: '#4d4a46', roughness: 0.6, metalness: 0.3 }),
      goathair: new THREE.MeshStandardMaterial({ color: '#3b322b', roughness: 1, flatShading: true, side: THREE.DoubleSide }),
      sandbank: new THREE.MeshStandardMaterial({ color: '#d9c197', roughness: 1, flatShading: true }),
      burnt: new THREE.MeshStandardMaterial({ color: '#3f322a', roughness: 1 }),
      plastic: new THREE.MeshStandardMaterial({ color: '#eeeae2', roughness: 0.7 }),
      wood: new THREE.MeshStandardMaterial({ color: '#8a6a4a', roughness: 1 }),
      rail: new THREE.MeshStandardMaterial({ color: '#4a4640', roughness: 0.8 }),
      door0: new THREE.MeshStandardMaterial({ color: '#2e6f73', roughness: 0.9 }),
      door1: new THREE.MeshStandardMaterial({ color: '#3a5f9a', roughness: 0.9 }),
      door2: new THREE.MeshStandardMaterial({ color: '#4d7a4a', roughness: 0.9 }),
      door3: new THREE.MeshStandardMaterial({ color: '#9a3b2e', roughness: 0.9 }),
      door4: new THREE.MeshStandardMaterial({ color: '#6b4a33', roughness: 0.9 }),
      door5: new THREE.MeshStandardMaterial({ color: '#c49a3a', roughness: 0.9 }),
      canvas: new THREE.MeshStandardMaterial({ color: '#efe9dc', roughness: 1, flatShading: true, side: THREE.DoubleSide }),
      tarp: new THREE.MeshStandardMaterial({ color: '#5b86a8', roughness: 1, flatShading: true, side: THREE.DoubleSide }),
      film: new THREE.MeshStandardMaterial({ color: '#f4f6ef', roughness: 0.3, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
      silo: new THREE.MeshStandardMaterial({ color: '#cfc9bf', roughness: 1 }),
      water: new THREE.MeshStandardMaterial({ color: '#9eb4bb', roughness: 0.7, metalness: 0.1 }),
      brick: new THREE.MeshStandardMaterial({ color: '#b07a52', roughness: 1 }),
      soot: new THREE.MeshStandardMaterial({ color: '#2d2520', roughness: 1 }),
      rust: new THREE.MeshStandardMaterial({ color: '#8a5a3e', roughness: 0.9 }),
      steelGrey: new THREE.MeshStandardMaterial({ color: '#7c7a73', roughness: 0.8, metalness: 0.2 }),
      green: new THREE.MeshStandardMaterial({ color: '#5f6f6a', roughness: 0.9 }),
    };
    // The same papers, washed per building through vertex colours.
    for (const k of ['whiteWall', 'greyWall', 'kraftWall'] as const) {
      const m = (this.mats[k] as THREE.MeshStandardMaterial).clone();
      m.vertexColors = true;
      this.mats[`${k}T`] = m;
    }
    this.litMats = [this.mats.whiteWall, this.mats.greyWall, this.mats.kraftWall, this.mats.terracottaWall, this.mats.schoolWall, this.mats.whiteWallT, this.mats.greyWallT, this.mats.kraftWallT] as THREE.MeshStandardMaterial[];
    this.buildBuildings(new Set());

    // Garden and compound walls.
    const walls = mergeGeometries(w.walls.map((q) => boxGeo(q.x + Math.max(q.w, 0.5) / 2, 1.2, q.y + Math.max(q.h, 0.5) / 2, Math.max(q.w, 0.5), 2.4, Math.max(q.h, 0.5))))!;
    const wm = new THREE.Mesh(walls, this.mats.wall);
    wm.castShadow = wm.receiveShadow = true;
    s.add(wm);

    // Street lamps down the boulevard's median.
    const lamps: THREE.BufferGeometry[] = [];
    for (const rd of w.roads) {
      if (rd.kind !== 'boulevard') continue;
      const q = rd.rect;
      const z = q.y + q.h / 2;
      for (let x = q.x + 12; x < q.x + q.w - 6; x += 26) {
        lamps.push(new THREE.CylinderGeometry(0.1, 0.14, 6, 5).translate(x, 3, z));
        lamps.push(boxGeo(x, 6, z, 0.12, 0.12, 2.4));
        lamps.push(boxGeo(x, 5.9, z - 1.2, 0.35, 0.18, 0.5));
        lamps.push(boxGeo(x, 5.9, z + 1.2, 0.35, 0.18, 0.5));
      }
    }
    if (lamps.length) {
      const lm = new THREE.Mesh(mergeGeometries(lamps.map((g) => (g.index ? g.toNonIndexed() : g)))!, this.mats.lamp);
      lm.castShadow = true;
      s.add(lm);
    }

    // The outskirts: wagons in the sidings, the camp fence, bricks drying, scrap, beehives, washing between tents.
    {
      const ex = w.extras;
      const r = rng(4242);
      const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
      const put = (m: THREE.Material, g: THREE.BufferGeometry) => bins.set(m, [...(bins.get(m) ?? []), g.index ? g.toNonIndexed() : g]);
      const M = this.mats;
      const wagonMats = [M.rust, M.steelGrey, M.green];
      for (const q of ex.wagons) {
        const m = wagonMats[Math.floor(r() * 3)];
        put(m, boxGeo(q.x + q.w / 2, 2.4, q.y + q.h / 2, q.w, 2.8, q.h));
        put(M.lamp, boxGeo(q.x + q.w / 2, 0.6, q.y + q.h / 2, q.w - 1, 0.8, q.h * 0.8));
      }
      for (const q of ex.fences) {
        const len = Math.max(q.w, q.h);
        const alongX = q.w > q.h;
        for (let u = 0; u <= len; u += 3) put(M.lamp, boxGeo(q.x + (alongX ? u : 0), 1, q.y + (alongX ? 0 : u), 0.08, 2, 0.08));
        for (const y of [0.7, 1.4, 1.95]) put(M.lamp, boxGeo(q.x + q.w / 2, y, q.y + q.h / 2, alongX ? len : 0.02, 0.02, alongX ? 0.02 : len));
      }
      for (const q of ex.stacks) put(M.brick, boxGeo(q.x + q.w / 2, 0.45, q.y + q.h / 2, q.w, 0.9, q.h));
      const scrapMats = [M.rust, M.steelGrey, M.green, M.wood];
      for (const p of ex.scrap)
        for (let i = 0; i < 9; i++) {
          const a = r() * Math.PI * 2;
          const d = Math.sqrt(r()) * p.r;
          put(scrapMats[Math.floor(r() * 4)], boxGeo(0, 0, 0, 1 + r() * 2.2, 0.5 + r() * 1.2, 0.8 + r() * 1.4).rotateY(r() * 3).rotateX((r() - 0.5) * 0.6).translate(p.x + Math.cos(a) * d, 0.4 + (1 - d / p.r) * 0.8, p.y + Math.sin(a) * d));
        }
      for (const h of ex.hives) put(M.plastic, boxGeo(h.x + 0.8, 0.45, h.y + 0.65, 1.3, 0.9, 1.1));
      // By Warehouse 14: a truck backed up to the loading doors, crates by the wall, a kiosk on the corner.
      for (const q of ex.trucks) {
        put(M.plastic, boxGeo(q.x + q.w / 2, 1.9, q.y + q.h * 0.36, q.w, 2.4, q.h * 0.72));
        put(M.green, boxGeo(q.x + q.w / 2, 1.3, q.y + q.h * 0.87, q.w - 0.2, 1.8, q.h * 0.26));
        put(M.lamp, boxGeo(q.x + q.w / 2, 0.4, q.y + q.h / 2, q.w - 0.4, 0.8, q.h - 0.6));
      }
      for (const q of ex.crates) put(M.wood, boxGeo(q.x + q.w / 2, 0.8, q.y + q.h / 2, q.w, 1.6, q.h));
      // Out in the desert: sand banks, half-buried tyres, the burnt-out truck, the goats in their thorn pen, the well.
      for (const q of ex.berms) put(M.sandbank, new THREE.CylinderGeometry(q.h / 2, q.h / 2, q.w, 6, 1).rotateZ(Math.PI / 2).scale(1, 0.55, 1).translate(q.x + q.w / 2, 0.3, q.y + q.h / 2));
      for (const t of ex.tyres) put(M.burnt, new THREE.TorusGeometry(0.75, 0.28, 5, 10).rotateX(Math.PI / 2 - 0.5).translate(t.x, 0.35, t.y));
      for (const q of ex.wrecks) {
        put(M.burnt, boxGeo(q.x + q.w / 2, 1.1, q.y + q.h * 0.4, q.w, 1.6, q.h * 0.8));
        put(M.rust, boxGeo(q.x + q.w / 2, 1.4, q.y + q.h * 0.9, q.w - 0.3, 1.9, q.h * 0.22));
      }
      for (const p of ex.pens)
        for (let i = 0; i < 40; i++) {
          const a = (i / 40) * Math.PI * 2;
          put(M.wood, boxGeo(0, 0.5, 0, 0.5, 1, 1.2).rotateY(-a).translate(p.x + Math.cos(a) * p.r, 0, p.y + Math.sin(a) * p.r));
        }
      const goatMats = [M.clothB, M.goathair, M.wood];
      for (const [i, gt] of ex.goats.entries()) {
        const m = goatMats[i % 5 === 0 ? 0 : i % 3 === 0 ? 2 : 1];
        put(m, boxGeo(0, 0.55, 0, 0.9, 0.45, 0.35).rotateY(i).translate(gt.x, 0, gt.y));
        put(m, boxGeo(0.5, 0.8, 0, 0.3, 0.3, 0.22).rotateY(i).translate(gt.x, 0, gt.y));
      }
      for (const wl of ex.wells) put(M.sandbank, new THREE.CylinderGeometry(1.5, 1.6, 0.8, 12, 1, true).translate(wl.x, 0.4, wl.y));
      for (const q of ex.panels) put(M.tarp, boxGeo(0, 0, 0, q.w, 0.06, q.h).rotateX(-0.5).translate(q.x + q.w / 2, 0.7, q.y + q.h / 2));
      // The school yard: a hoop on a pole, swings, a slide. Paper-simple.
      for (const h of ex.hoops) {
        put(M.lamp, new THREE.CylinderGeometry(0.08, 0.1, 3.2, 6).translate(h.x, 1.6, h.y));
        put(M.plastic, boxGeo(h.x + 0.25, 3.3, h.y, 0.08, 1.1, 1.8));
        put(M.door3, new THREE.TorusGeometry(0.28, 0.03, 4, 12).rotateX(Math.PI / 2).translate(h.x + 0.62, 3.05, h.y));
      }
      for (const q of ex.swings) {
        for (const x of [q.x, q.x + q.w]) put(M.rail, boxGeo(x, 1.2, q.y, 0.1, 2.4, 0.1));
        put(M.rail, boxGeo(q.x + q.w / 2, 2.4, q.y, q.w, 0.1, 0.1));
        for (const [u, m] of [
          [0.3, M.door5],
          [0.68, M.door3],
        ] as const) {
          put(M.line, boxGeo(q.x + q.w * u, 1.5, q.y, 0.03, 1.8, 0.03));
          put(m, boxGeo(q.x + q.w * u, 0.6, q.y, 0.7, 0.06, 0.45));
        }
      }
      for (const q of ex.slides) {
        put(M.door1, boxGeo(q.x + q.w / 2, 0.9, q.y + q.h * 0.17, q.w, 1.8, q.h * 0.34));
        put(M.door5, boxGeo(0, 0, 0, q.w - 0.3, 0.08, q.h * 0.72).rotateX(-0.33).translate(q.x + q.w / 2, 1, q.y + q.h * 0.63));
      }
      // The power station's transformers, and pylons carrying the line away west.
      for (const q of ex.transformers) {
        put(M.steelGrey, boxGeo(q.x + q.w / 2, 1.4, q.y + q.h / 2, q.w, 2.8, q.h));
        for (let i = 0; i < 3; i++) put(M.plastic, new THREE.CylinderGeometry(0.18, 0.28, 1.2, 6).translate(q.x + 1 + i * 1.5, 3.4, q.y + q.h / 2));
      }
      for (const p of ex.pylons) {
        put(M.lamp, new THREE.CylinderGeometry(0.3, 1.4, 22, 4).translate(p.x, 11, p.y));
        put(M.lamp, boxGeo(p.x, 20, p.y, 0.3, 0.3, 6));
      }
      for (let i = 0; i < ex.pylons.length; i++) {
        const a = i === 0 ? { x: 40, y: 772 } : ex.pylons[i - 1];
        const b = ex.pylons[i];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        for (const off of [-2.6, 0, 2.6]) put(M.line, boxGeo((a.x + b.x) / 2, i === 0 ? 14 : 19.6, (a.y + b.y) / 2 + off, len, 0.04, 0.04));
      }
      // Street lamps along Cotton Street.
      for (const l of ex.lamps) {
        put(M.lamp, new THREE.CylinderGeometry(0.07, 0.1, 5, 5).translate(l.x, 2.5, l.y));
        put(this.lightMat, boxGeo(l.x, 5, l.y, 0.35, 0.16, 0.5));
      }
      // The fuel depot: pipes, the pump island, Karim's tanker.
      for (const [x0, z0, x1, z1] of ex.pipes) {
        const len = Math.hypot(x1 - x0, z1 - z0);
        put(M.tank, new THREE.CylinderGeometry(0.22, 0.22, len, 6).rotateZ(Math.PI / 2).rotateY(-Math.atan2(z1 - z0, x1 - x0)).translate((x0 + x1) / 2, 0.8, (z0 + z1) / 2));
      }
      for (const q of ex.canopies) {
        put(M.plastic, boxGeo(q.x + q.w / 2, 4.2, q.y + q.h / 2, q.w, 0.3, q.h));
        for (const [dx, dz] of [
          [0.4, 0.4],
          [q.w - 0.4, q.h - 0.4],
        ])
          put(M.lamp, boxGeo(q.x + dx, 2, q.y + dz, 0.2, 4, 0.2));
      }
      for (const q of ex.tankers) {
        put(M.fuel, new THREE.CylinderGeometry(q.h / 2, q.h / 2, q.w - 3, 14).rotateZ(Math.PI / 2).translate(q.x + (q.w - 3) / 2, 2.1, q.y + q.h / 2));
        put(M.green, boxGeo(q.x + q.w - 1.3, 1.5, q.y + q.h / 2, 2.6, 2.2, q.h - 0.2));
        put(M.lamp, boxGeo(q.x + q.w / 2, 0.45, q.y + q.h / 2, q.w - 0.6, 0.7, q.h - 0.6));
      }
      for (const q of ex.kiosks) {
        put(M.door0, boxGeo(q.x + q.w / 2, 1.1, q.y + q.h / 2, q.w, 2.2, q.h));
        put(M.clothB, boxGeo(q.x + q.w / 2, 2.35, q.y + q.h / 2 + 0.3, q.w + 0.6, 0.1, q.h + 0.9));
      }
      const cloths = [M.clothA, M.clothB, M.clothC];
      for (const [ax, az, bx, bz] of ex.washing) {
        put(M.line, boxGeo((ax + bx) / 2, 1.7, (az + bz) / 2, Math.max(0.03, Math.abs(bx - ax)), 0.03, 0.03));
        for (let x = ax + 0.5; x < bx - 0.4; x += 0.9 + r() * 0.4) put(cloths[Math.floor(r() * 3)], boxGeo(x, 1.3, az, 0.6, 0.75, 0.02));
      }
      for (const [m, geos] of bins) {
        const mesh = new THREE.Mesh(mergeGeometries(geos)!, m);
        mesh.castShadow = mesh.receiveShadow = true;
        s.add(mesh);
      }
    }

    // Trees: crumpled paper balls, palms, cypresses.
    const crowns: THREE.BufferGeometry[] = [];
    const trunks: THREE.BufferGeometry[] = [];
    const fronds: THREE.BufferGeometry[] = [];
    const cyps: THREE.BufferGeometry[] = [];
    for (const t of w.trees) {
      const tr = rng(Math.round(t.x * 13 + t.y));
      if (t.kind === 'palm') {
        trunks.push(new THREE.CylinderGeometry(0.16, 0.22, 7, 5).translate(t.x, 3.5, t.y));
        const fr = new THREE.ConeGeometry(t.r * 1.2, 1.4, 7, 1, true);
        fr.rotateX(Math.PI);
        fronds.push(fr.translate(t.x, 7.3, t.y));
        continue;
      }
      if (t.kind === 'cypress') {
        cyps.push(new THREE.ConeGeometry(t.r, 7, 7).translate(t.x, 3.8, t.y));
        continue;
      }
      const geo = new THREE.IcosahedronGeometry(t.r, 1);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) * (0.85 + tr() * 0.3), pos.getY(i) * (0.85 + tr() * 0.3), pos.getZ(i) * (0.85 + tr() * 0.3));
      geo.computeVertexNormals();
      crowns.push(geo.translate(t.x, 2.2 + t.r, t.y));
      trunks.push(new THREE.CylinderGeometry(0.18, 0.22, 2.4, 5).translate(t.x, 1.2, t.y));
    }
    const add = (geos: THREE.BufferGeometry[], mat: THREE.Material) => {
      if (!geos.length) return;
      const mesh = new THREE.Mesh(mergeGeometries(geos.map((g) => g.toNonIndexed()))!, mat);
      mesh.castShadow = true;
      s.add(mesh);
    };
    add(crowns, new THREE.MeshStandardMaterial({ color: '#7b8b45', roughness: 1, flatShading: true }));
    add(trunks, new THREE.MeshStandardMaterial({ color: '#7a6048', roughness: 1 }));
    add(fronds, new THREE.MeshStandardMaterial({ color: '#6f8540', roughness: 1, flatShading: true, side: THREE.DoubleSide }));
    add(cyps, new THREE.MeshStandardMaterial({ color: '#566833', roughness: 1, flatShading: true }));

    // Stalls in the souk.
    const awnings = [stripesTex('#b85a3c', '#efe7d6', 6), stripesTex('#4f7a8a', '#efe7d6', 6), stripesTex('#c9a44c', '#efe7d6', 6)].map((t) => new THREE.MeshStandardMaterial({ map: t, roughness: 1, side: THREE.DoubleSide }));
    for (const sp of w.spaces) {
      if (sp.kind !== 'market') continue;
      const r = rng(sp.id + 3);
      // The same grid as the flat map's stalls (and the goods laid out in front of them: see souk.ts).
      for (let y = sp.rect.y + 3; y < sp.rect.y + sp.rect.h - 6; y += 10)
        for (let x = sp.rect.x + 3; x < sp.rect.x + sp.rect.w - 6; x += 8.5) {
          const aw = new THREE.Mesh(new THREE.PlaneGeometry(6, 5), awnings[Math.floor(r() * 3)]);
          aw.rotation.x = -Math.PI / 2 + 0.25;
          aw.position.set(x + 3, 2.4, y + 2.5);
          aw.castShadow = true;
          s.add(aw);
        }
    }

    // A far skyline, fading into the haze.
    const r = rng(77);
    const farBoxes: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 700; i++) {
      const a = r() * Math.PI * 2;
      const d = 620 + r() * 900;
      const x = w.w / 2 + Math.cos(a) * d;
      const z = w.h / 2 + Math.sin(a) * d * 0.8;
      if (x > -80 && x < w.w + 80 && z > -80 && z < w.h + 80) continue;
      const h = 5 + r() * 12;
      farBoxes.push(boxGeo(x, h / 2, z, 12 + r() * 18, h, 12 + r() * 18));
    }
    const farMesh = new THREE.Mesh(mergeGeometries(farBoxes)!, new THREE.MeshStandardMaterial({ color: '#e0d6c6', roughness: 1 }));
    s.add(farMesh);
    // Beyond it: sand dunes, then folded-paper mountains, fading into the haze so the distance has depth.
    const dunes: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 90; i++) {
      const a = r() * Math.PI * 2;
      const d = 900 + r() * 700;
      const g = new THREE.SphereGeometry(1, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2);
      g.scale(60 + r() * 90, 10 + r() * 22, 30 + r() * 50);
      g.rotateY(-0.4 + r() * 0.3);
      g.translate(w.w / 2 + Math.cos(a) * d, 0, w.h / 2 + Math.sin(a) * d * 0.85);
      dunes.push(g);
    }
    const hills: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2 + r() * 0.1;
      const d = 1500 + r() * 450;
      const h = 90 + r() * 220;
      const g = new THREE.ConeGeometry(160 + r() * 220, h, 5 + Math.floor(r() * 3), 1);
      g.rotateY(r() * Math.PI);
      g.translate(w.w / 2 + Math.cos(a) * d, h / 2 - 4, w.h / 2 + Math.sin(a) * d);
      hills.push(g);
    }
    const sand = (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, flatShading: true });
    s.add(new THREE.Mesh(mergeGeometries(dunes)!, sand('#dcc39c')));
    s.add(new THREE.Mesh(mergeGeometries(hills)!, sand('#cdb088')));
    this.scene.fog = new THREE.Fog('#e6d8c0', 430, 2100); // a little warm haze in the distance, like dust in low sun
  }

  /** All buildings, merged by material. Rebuilt without the damaged ones after a strike. */
  private buildBuildings(damaged: Set<number>) {
    for (const c of this.city.children) (c as THREE.Mesh).geometry.dispose();
    this.city.clear();
    const M = this.mats;
    const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const put = (mat: THREE.Material, g: THREE.BufferGeometry) => {
      const a = bins.get(mat) ?? [];
      a.push(g.index ? g.toNonIndexed() : g);
      bins.set(mat, a);
    };
    const wallOf: Record<MatKey, THREE.Material> = { white: M.whiteWall, grey: M.greyWall, kraft: M.kraftWall, tin: M.tinWall, terracotta: M.terracottaWall };
    const roofOf: Record<MatKey, THREE.Material> = { white: M.whiteRoof, grey: M.greyRoof, kraft: M.kraftRoof, tin: M.tinRoof, terracotta: M.terracottaRoof };
    for (const b of this.world.buildings) {
      if (damaged.has(b.id)) continue;
      const r = rng(b.id * 7 + 3);
      const p = b.paper as MatKey;
      if (b.round) {
        const q = b.rects[0];
        const cx = q.x + q.w / 2;
        const cz = q.y + q.h / 2;
        put(b.kind === 'silo' ? M.silo : b.kind === 'watertank' ? M.water : M.fuel, new THREE.CylinderGeometry(q.w / 2, q.w / 2, b.h, 24).translate(cx, b.h / 2, cz));
        if (b.kind === 'silo') put(M.silo, new THREE.ConeGeometry(q.w / 2 + 0.2, 3, 24).translate(cx, b.h + 1.5, cz));
        continue;
      }
      if (b.kind === 'chimney') {
        const q = b.rects[0];
        const cx = q.x + q.w / 2;
        const cz = q.y + q.h / 2;
        put(M.brick, new THREE.CylinderGeometry(q.w * 0.32, q.w * 0.5, b.h, 10).translate(cx, b.h / 2, cz));
        put(M.soot, new THREE.CylinderGeometry(q.w * 0.36, q.w * 0.36, 1.2, 10).translate(cx, b.h - 0.4, cz));
        continue;
      }
      if (b.kind === 'mast') {
        // A lattice radio mast: three legs, cross bracing, guy wires down to the sand.
        const q = b.rects[0];
        const cx = q.x + q.w / 2;
        const cz = q.y + q.h / 2;
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2;
          put(M.lamp, new THREE.CylinderGeometry(0.06, 0.09, b.h, 4).translate(cx + Math.cos(a) * 0.6, b.h / 2, cz + Math.sin(a) * 0.6));
        }
        for (let y = 2; y < b.h; y += 2.5) put(M.lamp, new THREE.TorusGeometry(0.6, 0.04, 3, 3).rotateX(Math.PI / 2).translate(cx, y, cz));
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2 + 0.5;
          const gx = cx + Math.cos(a) * 12;
          const gz = cz + Math.sin(a) * 12;
          const len = Math.hypot(12, b.h * 0.8);
          const wire = new THREE.CylinderGeometry(0.02, 0.02, len, 3);
          wire.rotateZ(Math.atan2(12, b.h * 0.8));
          wire.rotateY(-a);
          put(M.line, wire.translate((cx + gx) / 2, b.h * 0.4, (cz + gz) / 2));
        }
        continue;
      }
      if (b.kind === 'tent' || (b.material === 'canvas' && b.kind !== 'greenhouse')) {
        // Canvas over a ridge pole, low walls, now and then a blue tarp thrown over the top. Herders' tents are black goat hair.
        for (const q of b.rects) {
          put(p === 'kraft' ? M.goathair : M.canvas, tentGeo(q, b.h));
          if (r() < 0.2 && p !== 'kraft') put(M.tarp, tentGeo({ x: q.x + q.w * 0.3, y: q.y - 0.05, w: q.w * 0.4, h: q.h + 0.1 }, b.h + 0.03));
        }
        continue;
      }
      if (b.kind === 'greenhouse') {
        const q = b.rects[0];
        const rad = Math.min(q.w, q.h) / 2;
        const len = Math.max(q.w, q.h);
        const g = new THREE.CylinderGeometry(rad, rad, len, 12, 1, true, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2);
        g.scale(1, b.h / rad, 1);
        if (q.w > q.h) g.rotateY(Math.PI / 2);
        put(M.film, g.translate(q.x + q.w / 2, 0, q.y + q.h / 2));
        continue;
      }
      if (b.kind === 'minaret') {
        const q = b.rects[0];
        const cx = q.x + q.w / 2;
        const cz = q.y + q.h / 2;
        put(M.kraftWall, new THREE.CylinderGeometry(q.w * 0.42, q.w * 0.5, b.h, 12).translate(cx, b.h / 2, cz));
        put(M.kraftWall, new THREE.CylinderGeometry(q.w * 0.75, q.w * 0.75, 1, 12).translate(cx, b.h * 0.78, cz));
        put(M.kraftWall, new THREE.CylinderGeometry(q.w * 0.62, q.w * 0.62, 0.7, 12).translate(cx, b.h * 0.5, cz));
        put(M.kraftRoof, new THREE.ConeGeometry(q.w * 0.45, 5, 12).translate(cx, b.h + 2.5, cz));
        // A gilded finial with a crescent.
        put(M.door5, new THREE.CylinderGeometry(0.06, 0.08, 1.6, 6).translate(cx, b.h + 5.6, cz));
        put(M.door5, new THREE.TorusGeometry(0.4, 0.07, 5, 12, Math.PI * 1.3).rotateZ(-Math.PI * 0.15).translate(cx, b.h + 6.7, cz));
        continue;
      }
      // Ordinary homes, shops and flats get their own wash, a dusty foot, and now and then a patch of bare brick
      // where the plaster has come away.
      const washed = !b.landmark && !b.name && (b.kind === 'home' || b.kind === 'shop' || b.kind === 'apartment' || b.kind === 'villa' || b.kind === 'workshop') && (p === 'white' || p === 'grey' || p === 'kraft');
      const wash = washed ? WASH[Math.floor(r() * WASH.length)].map((c) => (p === 'kraft' ? 1 - (1 - c) * 0.5 : c)) as [number, number, number] : undefined;
      for (const q of b.rects) {
        const wallTile = b.kind === 'warehouse' || b.kind === 'stand' || b.kind === 'shelter' ? 8 : 4;
        if (wash) put(M[`${p}WallT`], wallsGeo(q, b.h, 0, wallTile, 3.1, wash));
        else put(b.kind === 'stand' ? M.stand : b.name === 'Cotton Street School' ? M.schoolWall : wallOf[p], wallsGeo(q, b.h, 0, wallTile, 3.1));
        if (wash && p !== 'kraft' && q.w > 4 && q.h > 4 && r() < 0.14) {
          const side = Math.floor(r() * 4);
          const along = side < 2 ? q.w : q.h;
          const u = 1.2 + r() * Math.max(0.1, along - 2.4);
          const y = 0.8 + r() * Math.max(0.1, b.h - 2.2);
          const pw = 0.9 + r() * 0.8;
          const ph = 0.5 + r() * 0.5;
          const px = side === 0 ? q.x + u : side === 1 ? q.x + u : side === 2 ? q.x - 0.03 : q.x + q.w + 0.03;
          const pz = side === 0 ? q.y - 0.03 : side === 1 ? q.y + q.h + 0.03 : q.y + u;
          put(M.brick, boxGeo(px, y, pz, side < 2 ? pw : 0.05, ph, side < 2 ? 0.05 : pw));
        }
        if (b.kind === 'warehouse' && p === 'white') put(M.fold, foldedGeo(q, b.h));
        if (b.name === 'Warehouse 14' && q === b.rects[0]) {
          const decal = new THREE.Mesh(foldedDecalGeo(q, b.h), new THREE.MeshStandardMaterial({ map: fourteenTex(q.w / q.h), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
          decal.receiveShadow = true;
          this.city.add(decal);
        }
        else if (p === 'terracotta') put(M.terracottaRoof, hipGeo(q, b.h, Math.min(q.w, q.h) * 0.35));
        else put(b.kind === 'stand' ? M.stand : roofOf[p], roofGeo(q, b.h, 12));
        // Crenellated parapets on some kraft roofs; plain parapets on some white ones.
        if ((p === 'kraft' || p === 'white') && b.kind !== 'warehouse' && b.kind !== 'factory' && b.kind !== 'kiln' && b.district !== 'kilns' && q.w > 8 && q.h > 8 && r() < 0.35) {
          const crenel = p === 'kraft';
          const pm = wallOf[p];
          for (const [x0, z0, x1, z1] of [
            [q.x, q.y, q.x + q.w, q.y],
            [q.x, q.y + q.h, q.x + q.w, q.y + q.h],
            [q.x, q.y, q.x, q.y + q.h],
            [q.x + q.w, q.y, q.x + q.w, q.y + q.h],
          ]) {
            const len = Math.hypot(x1 - x0, z1 - z0);
            const horiz = z0 === z1;
            const pieces = crenel ? Math.floor(len / 1.4) : 1;
            for (let i = 0; i < pieces; i++) {
              if (crenel && i % 2) continue;
              const seg = crenel ? 1.4 : len;
              const u = crenel ? (i + 0.5) * 1.4 : len / 2;
              put(pm, boxGeo(horiz ? x0 + u : x0, b.h + 0.45, horiz ? z0 : z0 + u, horiz ? seg : 0.35, 0.9, horiz ? 0.35 : seg));
            }
          }
        }
      }
      // Paper-model touches, on some ordinary buildings only (their own random numbers, so the rest of the roof stays as it was):
      // a crumpled sheet of white paper laid over the roof, now and then hanging over an edge; the cut edge of the card
      // along the top of a kraft wall; a small sheet of corrugated tin.
      if ((b.kind === 'home' || b.kind === 'apartment' || b.kind === 'shop' || b.kind === 'workshop') && !b.name && (p === 'white' || p === 'grey' || p === 'kraft')) {
        const r2 = rng(b.id * 131 + 17);
        const q = b.rects[0];
        if (q.w > 5 && q.h > 5 && r2() < 0.3) put(M.fold, crumpleGeo(q, b.h, r2));
        if (p === 'kraft' && r2() < 0.5)
          for (const [x, z, w, d] of [
            [q.x + q.w / 2, q.y - 0.04, q.w + 0.1, 0.1],
            [q.x + q.w / 2, q.y + q.h + 0.04, q.w + 0.1, 0.1],
            [q.x - 0.04, q.y + q.h / 2, 0.1, q.h + 0.1],
            [q.x + q.w + 0.04, q.y + q.h / 2, 0.1, q.h + 0.1],
          ])
            put(M.cardEdge, boxGeo(x, b.h - 0.1, z, w, 0.2, d));
        if (q.w > 6 && q.h > 6 && r2() < 0.12) {
          const sw = 2.6 + r2() * 1.6;
          const sd = 2 + r2() * 1.2;
          const cx = q.x + 1 + sw / 2 + r2() * (q.w - sw - 2);
          const cz = q.y + 1 + sd / 2 + r2() * (q.h - sd - 2);
          const tilt = 0.05 + r2() * 0.08;
          // Ridges side by side: alternate high and low strips read as corrugation.
          const n = Math.round(sw / 0.32);
          for (let i = 0; i < n; i++) put(M.tinRoof, boxGeo(cx - sw / 2 + (i + 0.5) * (sw / n), b.h + 0.12 + (i % 2) * 0.06, cz, sw / n + 0.01, 0.06, sd).rotateX(tilt));
        }
      }
      if (b.kind === 'mosque') {
        const q = b.rects[0];
        const rad = Math.min(q.w, q.h) * 0.36;
        const dx = q.x + q.w * 0.42;
        const dz = q.y + q.h / 2;
        // The great dome on a drum with small windows, a gilded finial, and a small dome at each corner.
        put(wallOf[p], new THREE.CylinderGeometry(rad * 1.02, rad * 1.02, 2.2, 24).translate(dx, b.h + 1.1, dz));
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          put(M.soot, boxGeo(0, 0, 0, 0.12, 1.1, 0.6).rotateY(-a).translate(dx + Math.cos(a) * rad * 1.03, b.h + 1.1, dz + Math.sin(a) * rad * 1.03));
        }
        put(M.dome, new THREE.SphereGeometry(rad, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2).translate(dx, b.h + 2.2, dz));
        put(M.door5, new THREE.CylinderGeometry(0.08, 0.1, 2.4, 6).translate(dx, b.h + 2.2 + rad + 1.1, dz));
        put(M.door5, new THREE.SphereGeometry(0.35, 10, 8).translate(dx, b.h + 2.2 + rad + 0.5, dz));
        for (const [cx, cz] of [
          [q.x + 3, q.y + 3],
          [q.x + q.w - 3, q.y + 3],
          [q.x + 3, q.y + q.h - 3],
          [q.x + q.w - 3, q.y + q.h - 3],
        ])
          put(M.dome, new THREE.SphereGeometry(2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(cx, b.h, cz));
        // A green door in the middle of the courtyard side.
        put(M.door2, boxGeo(q.x + q.w / 2, 1.6, q.y + q.h + 0.06, 2.4, 3.2, 0.12));
        put(M.door2, new THREE.CylinderGeometry(1.2, 1.2, 0.12, 12, 1, false, 0, Math.PI).rotateX(Math.PI / 2).translate(q.x + q.w / 2, 3.2, q.y + q.h + 0.06));
        // The arcade round the courtyard: columns and arches.
        const court = this.world.spaces.find((s) => s.name === 'Mosque courtyard');
        if (court) {
          const c = court.rect;
          const edges: [number, number, number, number][] = [
            [c.x, c.y + c.h, c.x + c.w, c.y + c.h],
            [c.x, c.y, c.x, c.y + c.h],
            [c.x + c.w, c.y, c.x + c.w, c.y + c.h],
          ];
          for (const [x0, z0, x1, z1] of edges) {
            const len = Math.hypot(x1 - x0, z1 - z0);
            const n = Math.round(len / 3.2);
            const alongX = z0 === z1;
            for (let i = 0; i <= n; i++) {
              const x = x0 + ((x1 - x0) * i) / n;
              const z = z0 + ((z1 - z0) * i) / n;
              put(M.whiteWall, new THREE.CylinderGeometry(0.18, 0.2, 3, 8).translate(x, 1.5, z));
              if (i < n) {
                const mx = x + (x1 - x0) / n / 2;
                const mz = z + (z1 - z0) / n / 2;
                put(M.whiteWall, new THREE.TorusGeometry(len / n / 2, 0.14, 4, 10, Math.PI).rotateY(alongX ? 0 : Math.PI / 2).translate(mx, 3, mz));
              }
            }
            put(M.whiteWall, boxGeo((x0 + x1) / 2, 3 + len / n / 2 + 0.25, (z0 + z1) / 2, alongX ? len : 0.6, 0.5, alongX ? 0.6 : len));
          }
        }
      }
      // Tower 7: aerials and dishes on the roof, a row of water tanks, the pigeon loft, a lit stairwell, balconies with washing.
      if (b.name === 'Tower 7') {
        const q = b.rects[0];
        for (let i = 0; i < 4; i++) put(M.lamp, new THREE.CylinderGeometry(0.05, 0.07, 4 + i, 4).translate(q.x + 5 + i * 9, b.h + 2 + i / 2, q.y + 3));
        for (let i = 0; i < 3; i++) put(M.dish, new THREE.CylinderGeometry(0.7, 0.18, 0.3, 10, 1, true).rotateX(-0.9).rotateY(i * 0.7).translate(q.x + 8 + i * 12, b.h + 1.2, q.y + q.h - 3));
        for (let i = 0; i < 5; i++) put(M.tank, new THREE.CylinderGeometry(0.8, 0.8, 1.4, 12).translate(q.x + 6 + i * 7.5, b.h + 1.3, q.y + q.h / 2));
        put(M.wood, boxGeo(q.x + q.w - 5, b.h + 1, q.y + 5, 3.4, 2, 2.4));
        put(this.lightMat, boxGeo(q.x + q.w / 2, b.h / 2, q.y + q.h + 0.06, 1.4, b.h - 1, 0.1));
        const cloths = [M.clothA, M.clothB, M.clothC];
        for (let f = 1; f < b.floors; f++)
          for (const u of [0.18, 0.82]) {
            const x = q.x + q.w * u;
            put(M.whiteWall, boxGeo(x, f * 3.1, q.y + q.h + 0.6, 3.4, 0.18, 1.2));
            put(M.rail, boxGeo(x, f * 3.1 + 0.5, q.y + q.h + 1.18, 3.4, 0.9, 0.05));
            if ((f + (u > 0.5 ? 1 : 0)) % 3 === 0) put(cloths[f % 3], boxGeo(x, f * 3.1 + 0.55, q.y + q.h + 1.24, 2.6, 0.6, 0.02));
          }
      }
      for (const k of b.roof) {
        if (k.kind === 'tank') {
          put(M.tank, new THREE.CylinderGeometry(0.9, 0.9, 1.5, 12).translate(k.x, b.h + 1.5, k.y));
          put(M.tank, boxGeo(k.x, b.h + 0.4, k.y, 1.2, 0.8, 1.2));
        } else if (k.kind === 'box') put(wallOf[p === 'tin' ? 'grey' : p], boxGeo(k.x + 1.1, b.h + 1, k.y + 0.8, 2.2, 2, 1.6));
      }
      // Lived-in roofs: a satellite dish on some homes and flats, washing on a line on others.
      // Around Warehouse 14 and the school, where the story starts, the roofs are busier: more washing, more tables and chairs.
      const nearScene = Math.hypot(b.cx - 250, b.cy - 500) < 110;
      if ((b.kind === 'home' || b.kind === 'apartment' || (nearScene && b.kind === 'shop')) && b.rects[0].w > 7 && b.rects[0].h > 7) {
        const q = b.rects[0];
        // A front door in its own colour, on one side.
        const side = Math.floor(r() * 4);
        const dm = M[`door${Math.floor(r() * 6)}`];
        const along = 0.25 + r() * 0.5;
        const dw = r() < 0.2 ? 1.8 : 1.1; // now and then a double door
        const dh = 2.1 + (r() < 0.3 ? 0.3 : 0);
        const canopy = r() < 0.3; // a little concrete hood over it
        const arch = !canopy && p === 'kraft' && r() < 0.5; // old town: a rounded top
        const door = (x: number, z: number, alongX: boolean, out: number) => {
          put(dm, boxGeo(x, dh / 2, z, alongX ? dw : 0.1, dh, alongX ? 0.1 : dw));
          if (canopy) put(wallOf[p], boxGeo(x + (alongX ? 0 : out * 0.35), dh + 0.25, z + (alongX ? out * 0.35 : 0), alongX ? dw + 0.6 : 0.7, 0.12, alongX ? 0.7 : dw + 0.6));
          if (arch) put(dm, new THREE.CylinderGeometry(dw / 2, dw / 2, 0.1, 10, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateY(alongX ? 0 : Math.PI / 2).translate(x, dh, z));
          put(wallOf[p === 'tin' ? 'grey' : p], boxGeo(x + (alongX ? 0 : out * 0.3), 0.08, z + (alongX ? out * 0.3 : 0), alongX ? dw + 0.4 : 0.6, 0.16, alongX ? 0.6 : dw + 0.4)); // the step
        };
        if (side === 0) door(q.x + q.w * along, q.y + q.h + 0.05, true, 1);
        else if (side === 1) door(q.x + q.w * along, q.y - 0.05, true, -1);
        else if (side === 2) door(q.x - 0.05, q.y + q.h * along, false, -1);
        else door(q.x + q.w + 0.05, q.y + q.h * along, false, 1);
        // Balconies on some blocks of flats: a slab and a railing, floor by floor, on one face.
        if (b.kind === 'apartment' && b.floors >= 3 && r() < 0.35) {
          const bw = Math.min(3.2, q.w * 0.3);
          for (let f = 1; f < b.floors; f++) {
            const y = f * 3.1;
            for (const u of [0.28, 0.72]) {
              const x = q.x + q.w * u;
              put(M.whiteWall, boxGeo(x, y, q.y + q.h + 0.55, bw, 0.18, 1.1));
              put(M.rail, boxGeo(x, y + 0.5, q.y + q.h + 1.08, bw, 0.9, 0.05));
            }
          }
        }
        // A table and a couple of chairs on a few flat roofs, for evenings up there.
        if ((b.kind === 'home' || nearScene) && p !== 'terracotta' && r() < (nearScene ? 0.55 : 0.14)) {
          const tx = q.x + 2 + r() * (q.w - 4);
          const tz = q.y + 2 + r() * (q.h - 4);
          r(); // (kept so the rest of the roofs stay as they were)
          const mat = M.plastic; // cheap white plastic, the same everywhere
          put(mat, boxGeo(tx, b.h + 0.72, tz, 1.1, 0.06, 1.1));
          put(mat, boxGeo(tx, b.h + 0.36, tz, 0.12, 0.72, 0.12));
          for (const [cx, cz] of [
            [-1, 0],
            [1, 0],
            [0, r() < 0.5 ? 1 : -1],
          ]) {
            put(mat, boxGeo(tx + cx * 0.95, b.h + 0.23, tz + cz * 0.95, 0.45, 0.46, 0.45));
            put(mat, boxGeo(tx + cx * 1.15, b.h + 0.6, tz + cz * 1.15, cx ? 0.06 : 0.45, 0.5, cz ? 0.06 : 0.45));
          }
        }
        if (r() < 0.3) {
          const dx = q.x + 1.5 + r() * (q.w - 3);
          const dz = q.y + 1.5 + r() * (q.h - 3);
          put(M.dish, new THREE.CylinderGeometry(0.55, 0.15, 0.25, 10, 1, true).rotateX(-0.9).rotateY(r() * 6).translate(dx, b.h + 1.1, dz));
          put(M.line, new THREE.CylinderGeometry(0.04, 0.04, 1, 4).translate(dx, b.h + 0.5, dz));
        }
        if (r() < (nearScene ? 0.55 : 0.14)) {
          const z = q.y + q.h * (0.3 + r() * 0.4);
          const len = Math.min(q.w - 2, 4 + r() * 1.5);
          const x0 = q.x + 1 + r() * (q.w - 2 - len);
          const x1 = x0 + len;
          put(M.line, boxGeo((x0 + x1) / 2, b.h + 1.6, z, x1 - x0, 0.03, 0.03));
          put(M.line, boxGeo(x0, b.h + 0.8, z, 0.06, 1.6, 0.06));
          put(M.line, boxGeo(x1, b.h + 0.8, z, 0.06, 1.6, 0.06));
          const cloths = [M.clothA, M.clothB, M.clothC];
          for (let x = x0 + 0.8; x < x1 - 0.6; x += 1 + r() * 0.6) put(cloths[Math.floor(r() * 3)], boxGeo(x, b.h + 1.2, z, 0.7, 0.75, 0.02));
        }
      }
    }
    for (const [mat, geos] of bins) {
      const mesh = new THREE.Mesh(mergeGeometries(geos, false)!, mat);
      mesh.castShadow = mesh.receiveShadow = true;
      this.city.add(mesh);
    }
  }

  // ---------------------------------------------------------------- per frame

  /** Hidden behind the flat map: skip drawing altogether, so a model built ahead of time costs nothing. */
  paused = false;

  private frame() {
    if (this.paused) {
      this.last = performance.now();
      return;
    }
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const f = this.getFrame();
    if (!f) return;
    if (this.fly) {
      const fl = this.fly;
      fl.k = Math.min(1, fl.k + dt / (fl.dur ?? 1.1));
      const e = fl.k * fl.k * (3 - 2 * fl.k);
      this.controls.target.lerpVectors(fl.t0, fl.t1, e);
      this.camera.position.lerpVectors(fl.p0, fl.p1, e);
      if (fl.k >= 1) this.fly = null;
    }
    this.controls.update();
    // Keep the view over the city: the point you orbit stays on the ground and near the edges, the camera above the ground.
    const tg = this.controls.target;
    const m = 120;
    const cx = Math.max(-m, Math.min(this.world.w + m, tg.x));
    const cz = Math.max(-m, Math.min(this.world.h + m, tg.z));
    if (cx !== tg.x || cz !== tg.z || Math.abs(tg.y - 4) > 0.01) {
      const d = new THREE.Vector3(cx - tg.x, 4 - tg.y, cz - tg.z);
      tg.add(d);
      this.camera.position.add(d);
    }
    if (this.camera.position.y < 4) this.camera.position.y = 4;
    this.light(f.plan.hour);
    this.overlays(f);
    this.damage(f);
    this.updateWindows(f.plan.hour);
    this.crowd(f);
    {
      const night = nightness(f.plan.hour);
      const o = f.outcome;
      const damaged = new Set([...f.ruins, ...(o ? o.damaged : [])]);
      const clock = f.clock ?? now / 1000;
      this.life.update(
        lifeScene({
          world: this.world,
          time: clock,
          hour: f.plan.hour,
          night,
          damaged,
          away: o ? { x: o.ix, y: o.iy, r: Math.max(70, weapon(f.plan.weapon).blast * 4) } : null,
          brokenBridge: damaged.has(BRIDGE_RUIN) ? targetOf(this.world, 'bridge').rect : null,
          hush: f.pop.hush,
        }),
        clock,
        night,
      );
      // Street lights the blast reached: down, or dark. Only once the bomb has landed.
      const landed = !f.strike || f.strike.t >= IMPACT_AT;
      this.life.setDamage(landed ? damaged : new Set(f.ruins), landed && o ? { x: o.ix, y: o.iy, r: weapon(f.plan.weapon).blast } : null);
    }
    this.strike(f, now, dt);
    this.drift(now, nightness(f.plan.hour));
    this.sky(nightness(f.plan.hour));
    this.renderer.render(this.scene, this.camera);
    this.placeLabels(f);
  }

  /** Every window position on a windowed wall, laid out exactly as the wall texture tiles them (one per tile, per floor). */
  private buildWindows(scene: THREE.Scene) {
    const skip = (b: Building) => b.round || b.kind === 'chimney' || b.kind === 'mast' || b.kind === 'tent' || b.kind === 'greenhouse' || b.kind === 'minaret' || b.kind === 'stand' || b.material === 'canvas' || b.paper === 'tin';
    for (const b of this.world.buildings) {
      if (skip(b)) continue;
      const T = b.kind === 'warehouse' || b.kind === 'shelter' ? 8 : 4;
      const floors = Math.max(1, Math.floor((b.h - 0.9) / 3.1));
      for (const q of b.rects) {
        const faces: [number, number, number, number, number, number][] = [
          // start x, start z, direction x, direction z, length, yaw
          [q.x, q.y + q.h, 1, 0, q.w, 0],
          [q.x + q.w, q.y, -1, 0, q.w, Math.PI],
          [q.x + q.w, q.y + q.h, 0, -1, q.h, Math.PI / 2],
          [q.x, q.y, 0, 1, q.h, -Math.PI / 2],
        ];
        for (const [sx, sz, dx, dz, len, yaw] of faces) {
          const nx = Math.sin(yaw) * 0.04;
          const nz = Math.cos(yaw) * 0.04;
          for (let k = 0; (k + 0.5) * T + 0.63 <= len; k++)
            for (let f = 0; f < floors; f++) this.wins.push({ b, x: sx + dx * (k + 0.5) * T + nx, y: f * 3.1 + 1.6, z: sz + dz * (k + 0.5) * T + nz, yaw });
        }
      }
    }
    this.winMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.35, 1.12), this.winMat, Math.min(this.wins.length, 60000));
    this.winMesh.count = 0;
    this.winMesh.frustumCulled = false;
    scene.add(this.winMesh);
  }

  /** Which rooms are lit this half hour: busy in the evening, going out after midnight, a few before dawn. */
  private updateWindows(hour: number) {
    const hr = ((hour % 24) + 24) % 24;
    const bucket = Math.floor(hr * 2);
    const key = `${bucket}|${this.damageKey}`;
    if (key === this.winKey) return;
    this.winKey = key;
    const cut = this.world.buildings.some((b) => b.name === 'Power Station' && this.winDamaged.has(b.id));
    const share = cut ? 0.05 : hr >= 18 && hr < 23 ? 0.82 : hr >= 23 || hr < 1 ? 0.55 : hr < 5 ? 0.2 : hr < 7 ? 0.38 : 0.55;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    const shopFront = new THREE.Vector3(2.6, 1.9, 1);
    const c = new THREE.Color();
    let n = 0;
    let i = 0;
    for (const w of this.wins) {
      i++;
      if (n >= this.winMesh.instanceMatrix.count) break;
      const b = w.b;
      if (this.winDamaged.has(b.id)) continue;
      const k = b.kind;
      const lit = k === 'hospital' || k === 'clinic' ? 0.85 : cut ? share : k === 'office' ? (hr >= 18 && hr < 21 ? 0.3 : 0.06) : k === 'shop' ? (hr >= 18 && hr < 23 ? 0.8 : 0.05) : k === 'school' ? 0.03 : k === 'mosque' ? 0.6 : k === 'warehouse' || k === 'factory' || k === 'workshop' || k === 'hall' ? 0.12 : share;
      const u = Math.abs(Math.sin(i * 12.9898 + bucket * 78.233) * 43758.5453) % 1;
      if (u >= lit) continue;
      const tone = (u * 997) % 1;
      c.set(k === 'hospital' || k === 'clinic' ? '#dcecff' : cut ? '#ffaa5a' : k === 'mosque' ? '#d8f5dc' : tone < 0.12 ? '#a8bcff' : tone < 0.55 ? '#ffc877' : '#ffdca0');
      // A shop's ground floor is its shopfront: a wide lit window onto the street in the evening.
      const front = k === 'shop' && w.y < 2;
      this.winMesh.setMatrixAt(n, m.compose(v.set(w.x, front ? 1.3 : w.y, w.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), w.yaw), front ? shopFront : one));
      this.winMesh.setColorAt(n, c);
      n++;
    }
    this.winMesh.count = n;
    this.winMesh.instanceMatrix.needsUpdate = true;
    if (this.winMesh.instanceColor) this.winMesh.instanceColor.needsUpdate = true;
  }

  private buildSky(scene: THREE.Scene) {
    // The moon: a disc of off-white paper, torn round the edge, folded into facets, a few grey craters pressed in.
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    const r = rng(3131);
    const R = 104;
    g.translate(128, 128);
    g.beginPath();
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const rr = R * (0.985 + r() * 0.03);
      if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
    g.fillStyle = '#f4efe2';
    g.fill();
    g.save();
    g.clip();
    for (let i = 0; i < 7; i++) {
      // Folded facets: some catch the light, some sit in shade.
      const a0 = r() * Math.PI * 2;
      const a1 = a0 + 0.6 + r() * 1.2;
      g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(120,110,95,0.10)';
      g.beginPath();
      g.moveTo((r() - 0.5) * 40, (r() - 0.5) * 40);
      g.lineTo(Math.cos(a0) * 140, Math.sin(a0) * 140);
      g.lineTo(Math.cos(a1) * 140, Math.sin(a1) * 140);
      g.closePath();
      g.fill();
    }
    for (let i = 0; i < 9; i++) {
      const x = (r() - 0.5) * 150;
      const y = (r() - 0.5) * 150;
      const cr = 6 + r() * 16;
      g.fillStyle = 'rgba(150,140,125,0.22)';
      g.beginPath();
      g.arc(x, y, cr, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x - 1, y - 1, cr, Math.PI * 0.9, Math.PI * 1.7);
      g.stroke();
    }
    // A soft shadow on one side, so it reads as a round thing.
    const sh = g.createRadialGradient(-40, -40, 20, 0, 0, R * 1.1);
    sh.addColorStop(0, 'rgba(0,0,0,0)');
    sh.addColorStop(1, 'rgba(70,60,50,0.28)');
    g.fillStyle = sh;
    g.fillRect(-128, -128, 256, 256);
    g.restore();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.moon.scale.set(190, 190, 1);
    this.moon.renderOrder = -1;
    scene.add(this.moon);
    // Stars: little paper four-point stars scattered over the upper sky.
    const sc = document.createElement('canvas');
    sc.width = sc.height = 32;
    const sg = sc.getContext('2d')!;
    sg.fillStyle = '#fbf6e6';
    sg.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? 4 : 15;
      if (i === 0) sg.moveTo(16 + Math.cos(a) * rr, 16 + Math.sin(a) * rr);
      else sg.lineTo(16 + Math.cos(a) * rr, 16 + Math.sin(a) * rr);
    }
    sg.closePath();
    sg.fill();
    const pos: number[] = [];
    for (let i = 0; i < 140; i++) {
      const az = r() * Math.PI * 2;
      const el = 0.12 + r() * 1.1;
      pos.push(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(sc), size: 14, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.renderOrder = -1;
    this.stars.frustumCulled = false;
    scene.add(this.stars);
  }

  /** Keep the moon and stars far off at their bearing from wherever the camera is, fading in after dusk. */
  private sky(night: number) {
    const cam = this.camera.position;
    // Fixed in the sky, like the real one: low over the desert to the east, far off, whichever way you look.
    this.moon.position.copy(cam).addScaledVector(this.moonDir, 3300); // well past the mountains (1,500-1,950 m out)
    this.stars.position.copy(cam);
    this.stars.scale.setScalar(3400);
    (this.moon.material as THREE.SpriteMaterial).opacity = Math.max(0, night * 1.3 - 0.3);
    (this.stars.material as THREE.PointsMaterial).opacity = Math.max(0, night * 1.4 - 0.5) * 0.8;
    this.moon.visible = this.stars.visible = night > 0.25;
  }

  private light(hour: number) {
    const key = Math.round(hour * 4);
    if (key === this.hourKey) return;
    this.hourKey = key;
    const sh = sun(hour);
    const night = nightness(hour);
    const gr = grade(hour);
    const dir = new THREE.Vector3(-sh.dx, 1, -sh.dy).normalize();
    this.sunLight.position.copy(this.sunLight.target.position).addScaledVector(dir, 800);
    const tint = new THREE.Color(`rgb(${gr.rgb.join(',')})`);
    this.sunLight.color.set('#fff3e0').lerp(tint, gr.s * 0.8);
    this.sunLight.intensity = sh.day ? 1.2 + 1.6 * Math.min(1, sh.elev) : 0.35;
    if (!sh.day) this.sunLight.color.set('#9fb0e0');
    this.hemi.intensity = 0.35 + 0.75 * (1 - night);
    this.hemi.color.set(night > 0.5 ? '#6f7fb0' : '#e3e8ee');
    this.hemi.groundColor.set(night > 0.5 ? '#2a2c3a' : '#b59a74');
    // The old all-or-nothing window glow is off; each room is lit on its own (updateWindows).
    for (const m of this.litMats) m.emissiveIntensity = 0;
    this.winMat.opacity = Math.min(1, night * 1.2);
    this.winMesh.visible = night > 0.05;
    this.lightMat.emissiveIntensity = night * 2.2; // headlights at night
    this.tailMat.emissiveIntensity = night * 2;
    this.beamMat.opacity = night * 0.45;
    this.carBeams.visible = night > 0.2;
    const sky = new THREE.Color('#e9dcc6').lerp(new THREE.Color('#1f2742'), night).lerp(tint, (1 - night) * gr.s * 0.5);
    this.scene.background = sky;
    (this.scene.fog as THREE.Fog).color.copy(sky);
    this.renderer.toneMappingExposure = 1.05 - night * 0.25;
  }

  private overlays(f: Frame3D) {
    const p = f.plan;
    const key = [p.target, p.weapon, p.fuze, p.heading, p.aimX.toFixed(1), p.aimY.toFixed(1), f.circleR, f.layers.circle, f.layers.pattern, f.layers.impacts, f.layers.protect, f.est?.runs, f.est?.p90, f.est?.impacts[0], !!f.outcome].join('|');
    if (key === this.overlayKey) return;
    this.overlayKey = key;
    for (const c of this.overlay.children) (c as THREE.Mesh).geometry?.dispose();
    this.overlay.clear();
    const t = targetOf(this.world, p.target);
    const red = '#c2412b';
    // The target, outlined.
    const q = t.rect;
    const th = t.buildingId != null ? this.world.buildings[t.buildingId].h + 0.4 : 1.2;
    this.overlay.add(dashed([new THREE.Vector3(q.x - 1.5, th, q.y - 1.5), new THREE.Vector3(q.x + q.w + 1.5, th, q.y - 1.5), new THREE.Vector3(q.x + q.w + 1.5, th, q.y + q.h + 1.5), new THREE.Vector3(q.x - 1.5, th, q.y + q.h + 1.5), new THREE.Vector3(q.x - 1.5, th, q.y - 1.5)], red, 2, 1.4, 0.9));
    if (f.outcome) return;
    const hit = structureAt(this.world, p.aimX, p.aimY);
    const top = hit?.h ?? 0;
    if (f.layers.protect) {
      for (const b of this.world.buildings) {
        if (!b.protected && !b.hazard) continue;
        for (const r of b.rects) {
          const y = b.h + 0.5;
          this.overlay.add(dashed([new THREE.Vector3(r.x - 2, y, r.y - 2), new THREE.Vector3(r.x + r.w + 2, y, r.y - 2), new THREE.Vector3(r.x + r.w + 2, y, r.y + r.h + 2), new THREE.Vector3(r.x - 2, y, r.y + r.h + 2), new THREE.Vector3(r.x - 2, y, r.y - 2)], b.protected ? '#2f6f8f' : '#c98a1e', 2, 1.5, 0.8));
        }
      }
    }
    if (f.layers.circle) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 160; i++) {
        const a = (i / 160) * Math.PI * 2;
        pts.push(new THREE.Vector3(p.aimX + Math.cos(a) * f.circleR, 0.4, p.aimY + Math.sin(a) * f.circleR));
      }
      this.overlay.add(dashed(pts, '#231f1a', 3, 2.2, 0.75));
    }
    if (f.layers.pattern) {
      const e = effect(p, hit);
      const shape = new THREE.Shape();
      for (let a = 0; a <= 90; a++) {
        const tt = (a / 90) * Math.PI * 2;
        const dx = Math.sin(tt);
        const dy = -Math.cos(tt);
        const reach = e.frag * (0.55 + 0.45 * lobe(p.heading, dx, dy));
        if (a === 0) shape.moveTo(dx * reach, dy * reach);
        else shape.lineTo(dx * reach, dy * reach);
      }
      const rose = new THREE.Mesh(new THREE.ShapeGeometry(shape, 1), new THREE.MeshBasicMaterial({ color: red, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
      rose.rotation.x = Math.PI / 2;
      rose.position.set(p.aimX, 0.25, p.aimY);
      const blast = new THREE.Mesh(new THREE.CircleGeometry(e.blast, 40), new THREE.MeshBasicMaterial({ color: red, transparent: true, opacity: 0.18, depthWrite: false }));
      blast.rotation.x = -Math.PI / 2;
      blast.position.set(p.aimX, top + 0.3, p.aimY);
      this.overlay.add(rose, blast);
      const h = (p.heading * Math.PI) / 180;
      const ux = Math.sin(h);
      const uy = -Math.cos(h);
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(p.aimX - ux * 360, 170, p.aimY - uy * 360), new THREE.Vector3(p.aimX - ux * 70, 70, p.aimY - uy * 70), new THREE.Vector3(p.aimX, top, p.aimY));
      this.overlay.add(dashed(curve.getPoints(80), '#231f1a', 4, 3, 0.55));
    }
    if (f.layers.impacts && f.est) {
      const n = Math.min(260, f.est.impacts.length / 2);
      const geo = new THREE.CircleGeometry(0.45, 10);
      geo.rotateX(-Math.PI / 2);
      const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: red, transparent: true, opacity: 0.85 }), n);
      const mat = new THREE.Matrix4();
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const x = f.est.impacts[i * 2];
        const z = f.est.impacts[i * 2 + 1];
        sum += (x - p.aimX) ** 2 + (z - p.aimY) ** 2;
        const b = buildingAt(this.world, x, z);
        mat.makeTranslation(x, (b ? b.h : 0) + 0.12, z);
        im.setMatrixAt(i, mat);
      }
      this.overlay.add(im);
      const sigma = Math.max(3, Math.sqrt(sum / (2 * n)));
      const pts: THREE.Vector3[] = [];
      const rr = rng(3);
      for (let i = 0; i <= 64; i++) {
        const a = (i / 64) * Math.PI * 2.08;
        const k = 2.3 * sigma * (1 + (rr() - 0.5) * 0.08);
        pts.push(new THREE.Vector3(p.aimX + Math.cos(a) * k * 1.15, top + 0.5, p.aimY + Math.sin(a) * k * 0.9));
      }
      this.overlay.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: red, transparent: true, opacity: 0.9, depthTest: false })));
    }
  }

  /** After the strike: damaged buildings become torn paper and broken card. */
  private damage(f: Frame3D) {
    const striking = f.strike && f.strike.t < IMPACT_AT;
    const o = striking ? null : f.outcome;
    const ids = new Set([...f.ruins, ...(o?.damaged ?? [])]);
    const key = `${o ? `${o.ix.toFixed(2)},${o.iy.toFixed(2)}` : ''}|${[...ids].join('.')}`;
    if (key === this.damageKey) return;
    this.damageKey = key;
    this.winDamaged = ids;
    for (const c of this.rubble.children) (c as THREE.Mesh).geometry?.dispose();
    this.rubble.clear();
    this.buildBuildings(ids);
    if (!ids.size) return;
    const paper: Record<string, THREE.Material> = {
      white: new THREE.MeshStandardMaterial({ color: '#f1ede4', roughness: 1, side: THREE.DoubleSide }),
      kraft: new THREE.MeshStandardMaterial({ color: '#c9a06b', roughness: 1, side: THREE.DoubleSide }),
      grey: new THREE.MeshStandardMaterial({ color: '#b8b1a6', roughness: 1, side: THREE.DoubleSide }),
      tin: new THREE.MeshStandardMaterial({ color: '#8e9497', roughness: 0.7, metalness: 0.2, side: THREE.DoubleSide }),
      terracotta: new THREE.MeshStandardMaterial({ color: '#b86e50', roughness: 1, side: THREE.DoubleSide }),
    };
    for (const id of ids) {
      const b = this.world.buildings[id];
      if (!b) continue; // the bridge
      const r = rng(id * 13 + 1);
      const main = paper[b.paper];
      if (b.round) {
        // A burst tank: a torn, blackened drum.
        const q = b.rects[0];
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(q.w / 2, q.w / 2, b.h * 0.35, 18, 1, true), new THREE.MeshStandardMaterial({ color: '#3d3935', roughness: 1, side: THREE.DoubleSide }));
        drum.position.set(q.x + q.w / 2, b.h * 0.17, q.y + q.h / 2);
        this.rubble.add(drum);
        continue;
      }
      for (const q of b.rects) {
        const sheets = Math.min(60, Math.round((q.w * q.h) / 14));
        for (let i = 0; i < sheets; i++) {
          const sh = new THREE.Mesh(tornSheet(1.5 + r() * 5, 1 + r() * 4, r), r() < 0.7 ? main : paper.grey);
          sh.position.set(q.x + r() * q.w, 0.2 + r() * Math.min(4, b.h * 0.3), q.y + r() * q.h);
          sh.rotation.set((r() - 0.5) * 0.9, r() * Math.PI, (r() - 0.5) * 0.9);
          sh.castShadow = sh.receiveShadow = true;
          this.rubble.add(sh);
        }
        for (let k = 0; k < 2; k++) {
          const along = r() < 0.5;
          const len = (along ? q.w : q.h) * (0.3 + r() * 0.5);
          const hh = Math.min(b.h, 12) * (0.25 + r() * 0.45);
          const wall = new THREE.Mesh(new THREE.BoxGeometry(along ? len : 0.35, hh, along ? 0.35 : len), main);
          wall.position.set(along ? q.x + len / 2 + r() * (q.w - len) : k ? q.x + q.w : q.x, hh / 2, along ? (k ? q.y + q.h : q.y) : q.y + len / 2 + r() * (q.h - len));
          wall.castShadow = true;
          this.rubble.add(wall);
        }
      }
    }
    if (!o) return;
    // The crater, sized by what made it: a pinhole from the blades, a punched hole from the spear, a huge deep pit
    // with a raised rim of thrown earth from the bunker buster.
    const wp = weapon(f.plan.weapon);
    const cr = wp.id === 'blades' ? 0.9 : wp.id === 'spear' ? 2.2 : wp.deep ? 13 : 4.5;
    const crater = new THREE.Mesh(new THREE.CircleGeometry(cr, 32), new THREE.MeshBasicMaterial({ color: wp.deep ? '#241c16' : '#3a3029', transparent: true, opacity: 0.85 }));
    crater.rotation.x = -Math.PI / 2;
    crater.position.set(o.ix, 0.1, o.iy);
    this.rubble.add(crater);
    if (wp.deep) {
      // A bowl dug into the ground, and the lip of earth and broken concrete thrown up round it.
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(cr * 0.92, 28, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(1, 0.55, 1), new THREE.MeshStandardMaterial({ color: '#4a3b2e', roughness: 1, side: THREE.DoubleSide, flatShading: true }));
      bowl.position.set(o.ix, 0.12, o.iy);
      this.rubble.add(bowl);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(cr * 1.05, cr * 0.22, 6, 36).rotateX(Math.PI / 2).scale(1, 0.45, 1), new THREE.MeshStandardMaterial({ color: '#8a7560', roughness: 1, flatShading: true }));
      rim.position.set(o.ix, 0.4, o.iy);
      rim.castShadow = true;
      this.rubble.add(rim);
      const rr = rng(Math.round(o.ix * 13 + o.iy * 7));
      for (let i = 0; i < 40; i++) {
        const a = rr() * Math.PI * 2;
        const d = cr * (1.1 + rr() * 1.3);
        const s = 0.6 + rr() * 1.8;
        const chunk = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), new THREE.MeshStandardMaterial({ color: rr() < 0.5 ? '#9a8f82' : '#6e5a47', roughness: 1, flatShading: true }));
        chunk.position.set(o.ix + Math.cos(a) * d, s * 0.4, o.iy + Math.sin(a) * d);
        chunk.rotation.set(rr() * 3, rr() * 3, 0);
        chunk.castShadow = true;
        this.rubble.add(chunk);
      }
    }
  }

  private crowd(f: Frame3D) {
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1.3, 1.3, 1.3);
    const v = new THREE.Vector3();
    let n = 0;
    let nw = 0;
    let rings = 0;
    const now = performance.now() / 1000;
    const hm = new THREE.Matrix4();
    const hs = new THREE.Vector3();
    const hq = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (const w of f.walkers) {
      if (w.hurt) continue; // a red ring instead (below)
      if (n >= 1600) break;
      const bob = w.path.length ? Math.abs(Math.sin((now + w.phase) * 9)) * 0.12 : 0;
      m.compose(v.set(w.x, bob, w.y), q.identity(), one);
      this.people.setMatrixAt(n, m);
      this.heads.setMatrixAt(n, m);
      this.people.setColorAt(n, c.set(w.cloth));
      this.heads.setColorAt(n, c.set(w.skin));
      n++;
      // What's on their head. Facing: the way they're walking.
      const nx = w.path[0];
      const face = nx && (nx.x !== w.x || nx.y !== w.y) ? Math.atan2(nx.x - w.x, nx.y - w.y) : w.phase;
      hq.setFromAxisAngle(up, face);
      const fx = Math.sin(face);
      const fz = Math.cos(face);
      const wrap = (y: number, sx: number, sy: number, back: number, col: string) => {
        if (nw >= 1600) return;
        hm.compose(v.set(w.x - fx * back, bob + y, w.y - fz * back), hq, hs.set(sx * 1.3, sy * 1.3, sx * 1.3));
        this.wraps.setMatrixAt(nw, hm);
        this.wraps.setColorAt(nw++, c.set(col));
      };
      // What marks them out: a medic's red band; a vendor's tray of goods; a bedroll for someone sleeping rough.
      if (w.role === 'medic') wrap(1.05, 1.12, 0.18, 0, '#c0392b');
      else if (w.role === 'vendor') wrap(0.95, 1.1, 0.25, -0.45, '#b08a5e');
      else if (w.role === 'unhoused' && nightness(f.plan.hour) > 0.4) wrap(0.1, 2.2, 0.35, 0.6, '#6f665a');
      else if (w.role === 'aid') wrap(1.05, 1.1, 0.55, 0, w.tint); // the vest
      else if (w.role === 'elderly') wrap(0.5, 0.12, 1.0, -0.3, '#5a4632'); // a walking stick
      else if (w.role === 'displaced') wrap(0.6, 0.55, 0.45, -0.35, w.id % 2 ? '#e0d2b0' : '#e0c64a'); // a sack or a jerry can
      else if (w.role === 'visitor') wrap(0.3, 0.7, 0.55, -0.4, ['#6a4a3a', '#3a4a6b', '#2f2c29'][w.id % 3]); // a suitcase
      switch (w.wear) {
        case 'hijab':
        case 'shawl':
          wrap(1.44, 1.12, 1.25, 0.05, w.tint);
          break;
        case 'abaya':
          wrap(1.46, 1.14, 1.25, 0.02, '#141215');
          break;
        case 'keffiyeh':
          wrap(1.5, 1.12, 1.05, 0.08, '#efe7de');
          break;
        case 'ghutra':
          wrap(1.5, 1.12, 1.05, 0.08, '#f5f2ea');
          break;
        case 'turban':
          wrap(1.62, 1.2, 0.8, 0, w.tint);
          break;
        case 'cap':
          wrap(1.62, 0.95, 0.45, 0, w.tint);
          if (w.role === 'security') wrap(1.58, 0.7, 0.15, -0.18, w.tint); // the peak
          break;
        case 'burqa':
          wrap(1.44, 1.18, 1.3, 0.02, w.tint);
          break;
      }
    }
    this.people.count = this.heads.count = n;
    this.wraps.count = nw;
    let k = 0;
    for (const car of f.cars) {
      if (k >= 400) break;
      const ang = car.horizontal ? (car.dir > 0 ? 0 : Math.PI) : car.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      m.compose(v.set(car.x, 0, car.y), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang), new THREE.Vector3(1, 1, 1));
      this.carBodies.setMatrixAt(k, m);
      this.carGlass.setMatrixAt(k, m);
      this.carWheels.setMatrixAt(k, m);
      this.carLights.setMatrixAt(k, m);
      this.carTails.setMatrixAt(k, m);
      this.carBeams.setMatrixAt(k, m);
      this.carBodies.setColorAt(k, c.set(car.hurt ? '#3d3935' : car.color));
      k++;
    }
    this.carBodies.count = this.carGlass.count = this.carWheels.count = this.carLights.count = this.carTails.count = this.carBeams.count = k;
    // Everyone the strike killed or badly hurt, where they were: red rings that shrink away as the responders leave.
    for (const { c: hc, k } of casualties()) {
      if (rings >= 800) break;
      const sz = (hc.who.kind === 'car' ? 2.4 : hc.who.kind === 'in' ? 0.8 : 1) * k;
      this.rings.setMatrixAt(rings++, new THREE.Matrix4().compose(v.set(hc.x, hc.who.kind === 'in' ? 0.35 : 0.08, hc.y), q.identity(), new THREE.Vector3(sz, 1, sz)));
    }
    this.rings.count = rings;
    for (const im of [this.people, this.heads, this.wraps, this.rings, this.carBodies, this.carGlass, this.carWheels, this.carLights, this.carTails, this.carBeams]) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }

  private strike(f: Frame3D, now: number, dt: number) {
    const s = f.strike;
    if (!s) {
      this.plane.visible = this.bomb.visible = false;
      if (this.puffs.length || this.scraps.length) this.clearFx();
      this.flash.intensity = 0;
      return;
    }
    const t = s.t;
    const o = s.outcome;
    const h = (s.plan.heading * Math.PI) / 180;
    const ux = Math.sin(h);
    const uy = -Math.cos(h);
    const pt = t / IMPACT_AT;
    this.plane.visible = pt < 2.2;
    if (this.plane.visible) {
      const along = (pt - 0.72) * 280;
      this.plane.position.set(o.ix + ux * along, 100, o.iy + uy * along);
      this.plane.rotation.set(0, -h, 0);
    }
    this.bomb.visible = pt > 0.25 && pt < 1;
    if (this.bomb.visible) {
      const k = (pt - 0.25) / 0.75;
      const along = -(1 - k) * 120;
      this.bomb.position.set(o.ix + ux * along, 98 * (1 - k * k), o.iy + uy * along);
      this.bomb.rotation.set(Math.PI / 2 - 1.2 * k, -h, 0);
    }
    if (t >= IMPACT_AT && this.fxKey !== o) {
      this.fxKey = o;
      this.clearFx();
      this.burst(s.plan, o);
    }
    const since = t - IMPACT_AT;
    const mega = !!weapon(s.plan.weapon).mega;
    const fl = mega ? 1.4 : 0.6;
    this.flash.intensity = since > 0 && since < fl ? this.flashPower * (1 - since / fl) : 0;
    this.flash.position.set(o.ix, mega ? 60 : 8, o.iy);
    for (const b of this.balls) {
      const age = (now - b.born) / 1000;
      const k = age / b.lasts;
      if (age < 0 || k >= 1) {
        b.m.visible = false;
        continue;
      }
      // Swells fast, rises, cools from white-hot through orange to a dull red, and fades.
      b.m.visible = true;
      b.m.scale.setScalar(b.size * (0.35 + 1.1 * Math.sqrt(k)));
      b.m.position.set(b.x, b.size * (0.25 + 0.9 * k), b.z);
      const mat = b.m.material as THREE.MeshBasicMaterial;
      mat.color.setRGB(1, 0.95 - 0.55 * Math.min(1, k * 1.6), 0.75 - 0.6 * Math.min(1, k * 2));
      mat.opacity = 0.95 * (1 - k) ** 0.8;
    }
    for (const w of this.waves) {
      const age = (now - w.born) / 1000;
      const k = age / w.dur;
      if (age < 0 || k >= 1) {
        w.m.visible = false;
        continue;
      }
      w.m.visible = true;
      w.m.scale.setScalar(Math.max(0.01, w.max * Math.sqrt(k)));
      (w.m.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - k);
    }
    for (const p of this.puffs) {
      const age = (now - p.born) / 1000;
      if (age < 0) {
        p.m.visible = false;
        continue;
      }
      p.m.visible = true;
      p.m.position.addScaledVector(p.v, dt);
      p.v.y *= 0.985;
      p.m.scale.setScalar(1 + p.grow * Math.sqrt(age));
      (p.m.material as THREE.MeshStandardMaterial).opacity = Math.max(0, 0.95 * (1 - age / 11));
    }
    for (const s2 of this.streaks) {
      const k = (now - s2.born) / 1000 / s2.lasts;
      s2.m.visible = k < 1;
      if (k < 1) {
        (s2.m.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
        s2.m.scale.set(1 - k * 0.8, 1, 1 - k * 0.8);
      }
    }
    for (const p of this.scraps) {
      if (p.m.position.y <= 0.05 && p.v.y < 0) {
        p.v.set(0, 0, 0);
        p.m.position.y = 0.05;
        continue;
      }
      p.v.y -= 30 * dt;
      p.m.position.addScaledVector(p.v, dt);
      p.m.rotation.x += p.spin.x * dt;
      p.m.rotation.y += p.spin.y * dt;
    }
  }

  /** The slow things: smoke that lingers after a strike, and birds over the park and the mosque by day. */
  private drift(now: number, night: number) {
    const sm = this.smokeAt;
    const age = sm ? (now - sm.born) / 1000 : 99;
    if (sm && age > 62) this.smokeAt = null;
    const fade = Math.min(1, age / 4) * Math.max(0, Math.min(1, (62 - age) / 12));
    for (let k = 0; k < this.plume.length; k++) {
      const pm = this.plume[k];
      if (!sm || age > 62) {
        pm.visible = false;
        continue;
      }
      const u = (age * 0.045 + k / this.plume.length) % 1;
      pm.visible = true;
      pm.position.set(sm.x + u * 70 * sm.big + Math.sin(u * 5 + k) * 3, 6 + u * 60 * sm.big, sm.z - u * 26 * sm.big);
      pm.scale.setScalar((3 + u * 15) * sm.big);
      const mat = pm.material as THREE.MeshStandardMaterial;
      mat.opacity = Math.pow(1 - u, 1.3) * 0.4 * fade;
      mat.color.setScalar((0.5 - sm.dark * 0.2 + u * 0.3) * (1 - night * 0.4));
    }
    // Birds: five over each place, a while on and a while off, only by day.
    let n = 0;
    const t = now / 1000;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3(1.4, 1.4, 1.4);
    const v = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    if (night < 0.5)
      for (const [x, z, seed] of this.birdSpots()) {
        if (Math.sin(t / 23 + seed * 2.1) < 0.2) continue;
        for (let i = 0; i < 5; i++) {
          const a = t * 0.35 + i * 0.5 + seed;
          const r = 16 + i * 2.2;
          q.setFromAxisAngle(up, -a);
          sc.y = 1.4 * (0.6 + 0.5 * Math.sin(t * 9 + i));
          this.birds.setMatrixAt(n++, m.compose(v.set(x + Math.cos(a) * r, 26 + i * 1.5 + Math.sin(t + i) * 1.2, z + Math.sin(a) * r * 0.8), q, sc));
        }
      }
    this.birds.count = n;
    this.birds.instanceMatrix.needsUpdate = true;
  }
  private spots: [number, number, number][] | null = null;
  private birdSpots() {
    if (this.spots) return this.spots;
    const park = this.world.spaces.find((s) => s.name === 'Olive Park');
    const mosque = this.world.buildings.find((b) => b.kind === 'mosque');
    this.spots = [];
    if (park) this.spots.push([park.rect.x + park.rect.w / 2, park.rect.y + park.rect.h / 2, 1]);
    if (mosque) this.spots.push([mosque.cx, mosque.cy, 2]);
    return this.spots;
  }

  private burst(plan: Plan, o: Outcome) {
    const w = weapon(plan.weapon);
    const mega = !!w.mega;
    this.smokeAt = { x: o.ix, z: o.iy, born: performance.now(), dark: o.secondary.length ? 1 : 0.55, big: mega ? 4 : 1 };
    const r = rng(Math.round(o.ix * 97 + o.iy));
    const e = effect(plan, structureAt(this.world, o.ix, o.iy));
    const now = performance.now();
    // The fireball and the pressure ring, sized like the flat map's: the gap between bombs is plain to see.
    // The spear and the blades carry no explosive: a white-hot spark and a dust ring, no fireball.
    const size = mega ? 150 : w.kinetic ? (w.id === 'spear' ? 3 : 1) : 0.6 * 13 * (w.blast / 13) ** 1.45;
    if (w.id === 'spear') this.fireball(o.ix, o.iy, now, 0.35, 3);
    else if (!w.kinetic) this.fireball(o.ix, o.iy, now, mega ? 3.2 : 0.9 + size / 30, size);
    this.wave(now, mega ? 5.5 : w.kinetic ? 0.7 : 1.3, mega ? 700 : w.kinetic ? (w.id === 'spear' ? 30 : 6) : size * 3);
    this.flashPower = mega ? 60000 : w.kinetic ? (w.id === 'spear' ? 900 : 0) : 1100 * (size / 8) ** 1.2;
    this.flash.distance = mega ? 2600 : Math.max(180, size * 10);
    if (w.kinetic) this.smokeAt = null; // nothing burns
    const puff = (x: number, y: number, z: number, shade: number, v: THREE.Vector3, delay: number, grow: number, size: number) => {
      const geo = new THREE.IcosahedronGeometry(size, 1);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < pos.count; k++) pos.setXYZ(k, pos.getX(k) * (0.8 + r() * 0.4), pos.getY(k) * (0.8 + r() * 0.4), pos.getZ(k) * (0.8 + r() * 0.4));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: new THREE.Color(shade, shade * 0.98, shade * 0.95), roughness: 1, flatShading: true, transparent: true }));
      m.position.set(x, y, z);
      m.castShadow = true;
      this.fx.add(m);
      this.puffs.push({ m, v, born: now + delay, grow });
    };
    for (const b of o.blasts) {
      const big = b.kind === 'fuel' ? 26 : 18;
      this.fireball(b.x, b.y, now + b.at * 1000, 1.3, big);
      this.wave(now + b.at * 1000, 1.2, big * 3);
      for (let i = 0; i < 10; i++) puff(b.x + (r() - 0.5) * 16, 6, b.y + (r() - 0.5) * 16, 0.22 + r() * 0.12, new THREE.Vector3(0.8, 7 + r() * 7, 0), b.at * 1000 + 200 + r() * 600, 1.8, 4);
    }
    if (w.id === 'spear') {
      // The trail it left coming straight down: a white line hanging in the air a moment.
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 260, 8).translate(0, 130, 0), new THREE.MeshBasicMaterial({ color: '#f4f8ff', transparent: true, opacity: 0.9 }));
      col.position.set(o.ix, 0, o.iy);
      this.fx.add(col);
      this.streaks.push({ m: col, born: now, lasts: 0.9 });
    }
    if (w.id === 'blades') {
      // Six blades, swung out and spinning, catching the light, then falling.
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const m = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 0.28), new THREE.MeshStandardMaterial({ color: '#e8edf2', metalness: 0.9, roughness: 0.2, emissive: '#8a9aa8', emissiveIntensity: 0.4 }));
        m.position.set(o.ix + Math.cos(a) * 0.8, 1.4, o.iy + Math.sin(a) * 0.8);
        m.rotation.y = -a;
        m.castShadow = true;
        this.fx.add(m);
        this.scraps.push({ m, v: new THREE.Vector3(Math.cos(a) * 2.5, 4, Math.sin(a) * 2.5), spin: new THREE.Vector3(0, 22, 0) });
      }
    }
    if (w.deep) {
      // A column of earth and smoke, and the rubble thrown high: chunks going up tens of metres before they fall.
      for (let i = 0; i < 26; i++) puff(o.ix + (r() - 0.5) * 12, 6 + i * 3, o.iy + (r() - 0.5) * 12, 0.42 + r() * 0.2, new THREE.Vector3((r() - 0.5) * 2, 12 + r() * 8, (r() - 0.5) * 2), 150 + i * 35, 1.3, 5 + r() * 3);
      for (let i = 0; i < 120; i++) {
        const a = r() * Math.PI * 2;
        const s = 0.4 + r() * 1.6;
        const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), new THREE.MeshStandardMaterial({ color: ['#9a8f82', '#6e5a47', '#b8b1a6', '#4a3b2e'][Math.floor(r() * 4)], roughness: 1, flatShading: true }));
        m.position.set(o.ix + (r() - 0.5) * 6, 2, o.iy + (r() - 0.5) * 6);
        m.castShadow = true;
        this.fx.add(m);
        this.scraps.push({ m, v: new THREE.Vector3(Math.cos(a) * (3 + r() * 12), 30 + r() * 40, Math.sin(a) * (3 + r() * 12)), spin: new THREE.Vector3(r() * 6, r() * 6, 0) });
      }
    }
    for (let i = 0; i < (w.kinetic ? (w.id === 'spear' ? 10 : 3) : 16 + Math.round(e.blast)); i++) {
      const a = r() * Math.PI * 2;
      const d = r() * e.blast * 0.7;
      puff(o.ix + Math.cos(a) * d, 2 + r() * 6, o.iy + Math.sin(a) * d, 0.72 + r() * 0.26, new THREE.Vector3(Math.cos(a) * 2 + 1.2, 4 + r() * 7, Math.sin(a) * 2 - 0.5), r() * 400, 0.6 + r() * 0.9, 2 + r() * 2.5);
    }
    if (mega) {
      // A column and a spreading cap of dust and smoke, and a wall of dust thrown up as the wave crosses the city.
      for (let i = 0; i < 40; i++) puff(o.ix + (r() - 0.5) * 30, 10 + i * 4, o.iy + (r() - 0.5) * 30, 0.55 + r() * 0.25, new THREE.Vector3(0.5, 10 + r() * 6, 0), 300 + i * 40, 1.6, 10 + r() * 6);
      for (let i = 0; i < 60; i++) {
        const a = r() * Math.PI * 2;
        const d = 30 + r() * 110;
        puff(o.ix + Math.cos(a) * d * 0.4, 150 + r() * 60, o.iy + Math.sin(a) * d * 0.4, 0.45 + r() * 0.3, new THREE.Vector3(Math.cos(a) * 6, 3 + r() * 4, Math.sin(a) * 6), 1500 + r() * 1500, 2.2, 18 + r() * 10);
      }
      for (let i = 0; i < 90; i++) {
        const a = r() * Math.PI * 2;
        const d = 40 + r() * 260;
        puff(o.ix + Math.cos(a) * d, 3, o.iy + Math.sin(a) * d, 0.7 + r() * 0.2, new THREE.Vector3(Math.cos(a) * 3, 2 + r() * 3, Math.sin(a) * 3), (d / 160) * 1000 + r() * 300, 1.4, 8 + r() * 6);
      }
    }
    // Dark smoke from whatever else went off.
    for (const id of o.damaged) {
      const b = this.world.buildings[id];
      if (!b) continue;
      if (!b.hazard && !(o.secondary.length && b.id === targetOf(this.world, plan.target).buildingId)) continue;
      for (let i = 0; i < 8; i++) puff(b.cx + (r() - 0.5) * 14, 4, b.cy + (r() - 0.5) * 14, 0.3 + r() * 0.15, new THREE.Vector3(0.8, 6 + r() * 6, 0), 600 + r() * 900, 1.2, 3);
    }
    // The spear throws metal sparks and splinters; the blades almost nothing.
    const cols = w.id === 'spear' ? ['#f4f8ff', '#ffd9a0', '#9aa3ab', '#c9ced3'] : ['#f3f1ec', '#c99f69', '#8f8781', '#e7ddcc'];
    for (let i = 0; i < (mega ? 420 : w.id === 'blades' ? 6 : w.id === 'spear' ? 90 : 140); i++) {
      const a = r() * Math.PI * 2;
      const g = lobe(plan.heading, Math.sin(a), -Math.cos(a));
      const v = (6 + r() * 20) * (0.5 + g) * (plan.fuze === 'delay' ? 0.55 : 1) * (mega ? 4 : Math.sqrt(size / 8));
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.6 + r() * 1.4, 0.4 + r()), new THREE.MeshStandardMaterial({ color: cols[Math.floor(r() * cols.length)], side: THREE.DoubleSide, roughness: 1 }));
      m.position.set(o.ix, 3, o.iy);
      m.castShadow = true;
      this.fx.add(m);
      this.scraps.push({ m, v: new THREE.Vector3(Math.sin(a) * v, 8 + r() * 16, -Math.cos(a) * v), spin: new THREE.Vector3(r() * 8, r() * 8, 0) });
    }
  }

  private clearFx() {
    for (const c of this.fx.children) (c as THREE.Mesh).geometry.dispose();
    this.fx.clear();
    this.puffs = [];
    this.scraps = [];
    this.balls = [];
    this.waves = [];
    this.streaks = [];
  }

  private fireball(x: number, z: number, born: number, lasts: number, size: number) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), new THREE.MeshBasicMaterial({ color: '#fff2c8', transparent: true, opacity: 0, depthWrite: false, fog: false }));
    m.visible = false;
    this.fx.add(m);
    this.balls.push({ m, x, z, born, lasts, size });
  }

  private wave(born: number, dur: number, max: number) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 96), new THREE.MeshBasicMaterial({ color: '#fffaf0', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 1.5;
    m.visible = false;
    this.fx.add(m);
    this.waves.push({ m, born, dur, max });
  }

  // ---------------------------------------------------------------- labels

  private placeLabels(f: Frame3D) {
    const want = new Map<string, { x: number; y: number; z: number; text: string; tone?: string }>();
    const t = targetOf(this.world, f.plan.target);
    const th = t.buildingId != null ? this.world.buildings[t.buildingId].h : 2;
    if (f.layers.labels) {
      want.set('target', { x: t.rect.x + t.rect.w / 2, y: th + 10, z: t.rect.y + t.rect.h / 2, text: `Target: ${t.short}`, tone: 'target' });
      for (const b of this.world.buildings) if (b.landmark && b.name && b.id !== t.buildingId && (b.protected || b.hazard || b.kind === 'mosque')) want.set(`b${b.id}`, { x: b.cx, y: b.h + 9, z: b.cy, text: b.name, tone: b.protected ? 'protect' : b.hazard ? 'hazard' : undefined });
    }
    const o = f.outcome;
    if (o && (!f.strike || f.strike.t > IMPACT_AT + 0.8)) {
      const hit = Object.entries(o.hurtSlots).map(([id, s]) => [this.world.buildings[+id], s.length] as [Building, number]);
      hit.sort((a, b) => b[1] - a[1]);
      for (const [b, n] of hit.slice(0, 7)) {
        const where = b.id === t.buildingId ? 'inside' : buildingDist(b, t.rect.x + t.rect.w / 2, t.rect.y + t.rect.h / 2) < 30 ? 'next door' : b.name ? `in ${b.name}` : 'nearby';
        want.set(`h${b.id}`, { x: b.cx, y: b.h * 0.4 + 6, z: b.cy, text: `${n} ${where}`, tone: 'hurt' });
      }
      const onFoot = o.hurtWalkers.length + o.hurtCars.length;
      if (onFoot) want.set('street', { x: o.ix, y: 3, z: o.iy + 24, text: `${onFoot} in the street`, tone: 'hurt' });
    }
    if (f.layers.impacts && f.est && !o) want.set('land', { x: f.plan.aimX + 18, y: th + 4, z: f.plan.aimY - 4, text: 'Where it might land', tone: 'soft' });
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const v = new THREE.Vector3();
    for (const [k, el] of this.labels)
      if (!want.has(k)) {
        el.remove();
        this.labels.delete(k);
      }
    for (const [k, l] of want) {
      let el = this.labels.get(k);
      if (!el) {
        el = document.createElement('div');
        el.className = `cd3-label ${l.tone ?? ''}`;
        this.labelLayer.appendChild(el);
        this.labels.set(k, el);
      }
      if (el.textContent !== l.text) el.textContent = l.text;
      v.set(l.x, l.y, l.z).project(this.camera);
      const out = v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1;
      el.style.display = out ? 'none' : '';
      el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
    }
  }
}
