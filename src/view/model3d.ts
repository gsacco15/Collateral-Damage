// The model view: the same city, people and strike as a tilted paper diorama in three.js.
// Loaded only when someone opens it.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildingAt, buildingDist, effect, lobe, riverX, rng, structureAt, targetOf, type Building, type Estimate, type Plan, type Population, type Rect, type World } from '../jev';
import type { Car, Walker } from './crowd';
import { drawCity } from './drawCity';
import type { Layers, Outcome } from './map';
import { grade, nightness, sun } from './paper';

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
      if (!lit) grain(g, r, 128, 128, 14);
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
function wallsGeo(q: Rect, h: number, base: number, tileU: number, tileV: number) {
  const pos: number[] = [];
  const uv: number[] = [];
  const nor: number[] = [];
  const quad = (x0: number, z0: number, x1: number, z1: number, nx: number, nz: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const u1 = len / tileU;
    const v1 = h / tileV;
    const y0 = base;
    const y1 = base + h;
    pos.push(x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y0, z0, x1, y1, z1, x0, y1, z0);
    uv.push(0, 0, u1, 0, u1, v1, 0, 0, u1, v1, 0, v1);
    for (let i = 0; i < 6; i++) nor.push(nx, 0, nz);
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
  return g;
}

function roofGeo(q: Rect, y: number, tile: number) {
  const g = new THREE.PlaneGeometry(q.w, q.h);
  g.rotateX(-Math.PI / 2);
  g.translate(q.x + q.w / 2, y, q.y + q.h / 2);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * q.w) / tile + q.x / tile, (uv.getY(i) * q.h) / tile + q.y / tile);
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
  g.add(mk([0, 0, -2 * s, -1.6 * s, 0.5, 1.4 * s, 0, -0.6, 0.8 * s], '#f7f5f0'));
  g.add(mk([0, 0, -2 * s, 0, -0.6, 0.8 * s, 1.6 * s, 0.5, 1.4 * s], '#dcd6cb'));
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
  private smokeAt: { x: number; z: number; born: number; dark: number } | null = null;
  private birds!: THREE.InstancedMesh;
  private scraps: { m: THREE.Mesh; v: THREE.Vector3; spin: THREE.Vector3 }[] = [];
  private fxKey: Outcome | null = null;
  private plane: THREE.Group;
  private bomb: THREE.Mesh;
  private last = performance.now();

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
    this.controls.maxPolarAngle = 1.38;
    this.controls.minPolarAngle = 0.1;
    this.preset('drone', true);

    this.resize();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    this.raf = requestAnimationFrame(loop);
  }

  private fly: { t0: THREE.Vector3; t1: THREE.Vector3; p0: THREE.Vector3; p1: THREE.Vector3; k: number } | null = null;

  /** Glide the camera to look at a spot on the map, keeping the current angle, from a comfortable distance. */
  flyTo(x: number, y: number, dist = 160) {
    const t1 = new THREE.Vector3(x, 4, y);
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    if (dir.y < 0.35) dir.y = 0.35;
    dir.normalize();
    this.fly = { t0: this.controls.target.clone(), t1, p0: this.camera.position.clone(), p1: t1.clone().add(dir.multiplyScalar(dist)), k: 0 };
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
      tinWall: new THREE.MeshStandardMaterial({ map: stripesTex('#9aa0a3', '#b3b8ba', 8), roughness: 0.7, metalness: 0.2 }),
      terracottaWall: new THREE.MeshStandardMaterial({ map: wallTex('#f1ece2', false, 4), emissiveMap: wallTex('#000', true, 4), emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.95 }),
      whiteRoof: new THREE.MeshStandardMaterial({ map: roofTex('#f1eee8', 4, 14), roughness: 1 }),
      greyRoof: new THREE.MeshStandardMaterial({ map: roofTex('#cdc8bf', 6, 14), roughness: 1 }),
      kraftRoof: new THREE.MeshStandardMaterial({ map: roofTex('#c99f69', 5, 20), roughness: 1 }),
      tinRoof: new THREE.MeshStandardMaterial({ map: stripesTex('#a3a9ac', '#c0c4c6', 16), roughness: 0.6, metalness: 0.25 }),
      terracottaRoof: new THREE.MeshStandardMaterial({ color: '#c47a5a', roughness: 0.9, flatShading: true }),
      fold: new THREE.MeshStandardMaterial({ color: '#f5f3ee', roughness: 0.9, flatShading: true, side: THREE.DoubleSide }),
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
      plastic: new THREE.MeshStandardMaterial({ color: '#eeeae2', roughness: 0.7 }),
      wood: new THREE.MeshStandardMaterial({ color: '#8a6a4a', roughness: 1 }),
      rail: new THREE.MeshStandardMaterial({ color: '#4a4640', roughness: 0.8 }),
      door0: new THREE.MeshStandardMaterial({ color: '#2e6f73', roughness: 0.9 }),
      door1: new THREE.MeshStandardMaterial({ color: '#3a5f9a', roughness: 0.9 }),
      door2: new THREE.MeshStandardMaterial({ color: '#4d7a4a', roughness: 0.9 }),
      door3: new THREE.MeshStandardMaterial({ color: '#9a3b2e', roughness: 0.9 }),
      door4: new THREE.MeshStandardMaterial({ color: '#6b4a33', roughness: 0.9 }),
      door5: new THREE.MeshStandardMaterial({ color: '#c49a3a', roughness: 0.9 }),
    };
    this.litMats = [this.mats.whiteWall, this.mats.greyWall, this.mats.kraftWall, this.mats.terracottaWall] as THREE.MeshStandardMaterial[];
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
      for (let y = sp.rect.y + 4; y < sp.rect.y + sp.rect.h - 6; y += 10)
        for (let x = sp.rect.x + 4; x < sp.rect.x + sp.rect.w - 6; x += 8.5) {
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
    this.scene.fog = new THREE.Fog('#e6d8c0', 500, 2100);
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
        put(M.fuel, new THREE.CylinderGeometry(q.w / 2, q.w / 2, b.h, 24).translate(q.x + q.w / 2, b.h / 2, q.y + q.h / 2));
        continue;
      }
      if (b.kind === 'minaret') {
        const q = b.rects[0];
        const cx = q.x + q.w / 2;
        const cz = q.y + q.h / 2;
        put(M.kraftWall, new THREE.CylinderGeometry(q.w * 0.42, q.w * 0.5, b.h, 12).translate(cx, b.h / 2, cz));
        put(M.kraftWall, new THREE.CylinderGeometry(q.w * 0.75, q.w * 0.75, 1, 12).translate(cx, b.h * 0.78, cz));
        put(M.kraftRoof, new THREE.ConeGeometry(q.w * 0.45, 5, 12).translate(cx, b.h + 2.5, cz));
        continue;
      }
      for (const q of b.rects) {
        const wallTile = b.kind === 'warehouse' || b.kind === 'stand' || b.kind === 'shelter' ? 8 : 4;
        put(b.kind === 'stand' ? M.stand : wallOf[p], wallsGeo(q, b.h, 0, wallTile, 3.1));
        if (b.kind === 'warehouse' && p === 'white') put(M.fold, foldedGeo(q, b.h));
        else if (p === 'terracotta') put(M.terracottaRoof, hipGeo(q, b.h, Math.min(q.w, q.h) * 0.35));
        else put(b.kind === 'stand' ? M.stand : roofOf[p], roofGeo(q, b.h, 12));
        // Crenellated parapets on some kraft roofs; plain parapets on some white ones.
        if ((p === 'kraft' || p === 'white') && b.kind !== 'warehouse' && q.w > 8 && q.h > 8 && r() < 0.35) {
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
      if (b.kind === 'mosque') {
        const q = b.rects[0];
        const rad = Math.min(q.w, q.h) * 0.36;
        put(M.dome, new THREE.SphereGeometry(rad, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2).translate(q.x + q.w * 0.42, b.h, q.y + q.h / 2));
      }
      for (const k of b.roof) {
        if (k.kind === 'tank') {
          put(M.tank, new THREE.CylinderGeometry(0.9, 0.9, 1.5, 12).translate(k.x, b.h + 1.5, k.y));
          put(M.tank, boxGeo(k.x, b.h + 0.4, k.y, 1.2, 0.8, 1.2));
        } else if (k.kind === 'box') put(wallOf[p === 'tin' ? 'grey' : p], boxGeo(k.x + 1.1, b.h + 1, k.y + 0.8, 2.2, 2, 1.6));
      }
      // Lived-in roofs: a satellite dish on some homes and flats, washing on a line on others.
      if ((b.kind === 'home' || b.kind === 'apartment') && b.rects[0].w > 7 && b.rects[0].h > 7) {
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
        if (b.kind === 'home' && p !== 'terracotta' && r() < 0.14) {
          const tx = q.x + 2 + r() * (q.w - 4);
          const tz = q.y + 2 + r() * (q.h - 4);
          const mat = r() < 0.5 ? M.plastic : M.wood;
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
        if (r() < 0.14) {
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

  private frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const f = this.getFrame();
    if (!f) return;
    if (this.fly) {
      const fl = this.fly;
      fl.k = Math.min(1, fl.k + dt / 1.1);
      const e = fl.k * fl.k * (3 - 2 * fl.k);
      this.controls.target.lerpVectors(fl.t0, fl.t1, e);
      this.camera.position.lerpVectors(fl.p0, fl.p1, e);
      if (fl.k >= 1) this.fly = null;
    }
    this.controls.update();
    this.light(f.plan.hour);
    this.overlays(f);
    this.damage(f);
    this.crowd(f);
    this.strike(f, now, dt);
    this.drift(now, nightness(f.plan.hour));
    this.renderer.render(this.scene, this.camera);
    this.placeLabels(f);
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
    for (const m of this.litMats) m.emissiveIntensity = night * 1.6;
    this.lightMat.emissiveIntensity = night * 2.2; // headlights at night
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
    const crater = new THREE.Mesh(new THREE.CircleGeometry(4.5, 24), new THREE.MeshBasicMaterial({ color: '#3a3029', transparent: true, opacity: 0.8 }));
    crater.rotation.x = -Math.PI / 2;
    crater.position.set(o.ix, 0.1, o.iy);
    this.rubble.add(crater);
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
      if (w.hurt) {
        if (rings < 800) this.rings.setMatrixAt(rings++, m.makeTranslation(w.x, 0.08, w.y));
        continue;
      }
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
          wrap(1.62, 0.95, 0.45, 0, '#f2eee6');
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
      this.carBodies.setColorAt(k, c.set(car.hurt ? '#3d3935' : car.color));
      if (car.hurt && rings < 800) this.rings.setMatrixAt(rings++, new THREE.Matrix4().compose(v.set(car.x, 0.08, car.y), q.identity(), new THREE.Vector3(2.4, 1, 2.4)));
      k++;
    }
    this.carBodies.count = this.carGlass.count = this.carWheels.count = this.carLights.count = k;
    this.rings.count = rings;
    for (const im of [this.people, this.heads, this.wraps, this.rings, this.carBodies, this.carGlass, this.carWheels, this.carLights]) {
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
    this.flash.intensity = since > 0 && since < 0.6 ? 1100 * (1 - since / 0.6) : 0;
    this.flash.position.set(o.ix, 8, o.iy);
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
      pm.position.set(sm.x + u * 70 + Math.sin(u * 5 + k) * 3, 6 + u * 60, sm.z - u * 26);
      pm.scale.setScalar(3 + u * 15);
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
    this.smokeAt = { x: o.ix, z: o.iy, born: performance.now(), dark: o.secondary.length ? 1 : 0.55 };
    const r = rng(Math.round(o.ix * 97 + o.iy));
    const e = effect(plan, structureAt(this.world, o.ix, o.iy));
    const now = performance.now();
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
    for (let i = 0; i < 16 + Math.round(e.blast); i++) {
      const a = r() * Math.PI * 2;
      const d = r() * e.blast * 0.7;
      puff(o.ix + Math.cos(a) * d, 2 + r() * 6, o.iy + Math.sin(a) * d, 0.72 + r() * 0.26, new THREE.Vector3(Math.cos(a) * 2 + 1.2, 4 + r() * 7, Math.sin(a) * 2 - 0.5), r() * 400, 0.6 + r() * 0.9, 2 + r() * 2.5);
    }
    // Dark smoke from whatever else went off.
    for (const id of o.damaged) {
      const b = this.world.buildings[id];
      if (!b) continue;
      if (!b.hazard && !(o.secondary.length && b.id === targetOf(this.world, plan.target).buildingId)) continue;
      for (let i = 0; i < 8; i++) puff(b.cx + (r() - 0.5) * 14, 4, b.cy + (r() - 0.5) * 14, 0.3 + r() * 0.15, new THREE.Vector3(0.8, 6 + r() * 6, 0), 600 + r() * 900, 1.2, 3);
    }
    const cols = ['#f3f1ec', '#c99f69', '#8f8781', '#e7ddcc'];
    for (let i = 0; i < 140; i++) {
      const a = r() * Math.PI * 2;
      const g = lobe(plan.heading, Math.sin(a), -Math.cos(a));
      const v = (6 + r() * 20) * (0.5 + g) * (plan.fuze === 'delay' ? 0.55 : 1);
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
