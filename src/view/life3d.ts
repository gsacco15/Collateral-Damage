// The 3D model's version of the city's life (see lifeScene): the same boats, fishermen, café circles, smokers,
// animals, parked cars, buses, scooters, smoke and red lights as the flat map, as small folded-paper models.
// Everything is instanced: one draw per kind of thing, rebuilt each frame from the scene.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type World } from '../jev';
import { HULLS, type Ent } from './lifeScene';
import { streetLights } from './streetLights';

const box = (x: number, y: number, z: number, w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed();
const up = new THREE.Vector3(0, 1, 0);

/** A folded paper boat, bow toward -z: two hull faces meeting at the keel, and the folded tent standing in the middle. */
function boatGeo() {
  const L = 3;
  const w = 0.95;
  const top = 0.75;
  const p: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => p.push(...a, ...b, ...c);
  const bow = [0, top + 0.15, -L];
  const stern = [0, top + 0.15, L];
  const keel = [0, 0.05, 0];
  const pl = [-w, top, -0.7];
  const pr = [w, top, -0.7];
  const sl = [-w * 0.9, top, 0.9];
  const sr = [w * 0.9, top, 0.9];
  tri(bow, pl, keel), tri(pl, sl, keel), tri(sl, stern, keel);
  tri(bow, keel, pr), tri(pr, keel, sr), tri(sr, keel, stern);
  tri(bow, pr, pl), tri(pl, pr, sr), tri(pl, sr, sl), tri(sl, sr, stern); // the deck, so it isn't hollow from above
  // The tent: two leaning faces meeting at a ridge.
  const t0 = [0, top, -1.25];
  const t1 = [0, top, 1.25];
  const ridge = [0, top + 1.1, 0];
  tri(t0, [-0.55, top, 0], ridge), tri([-0.55, top, 0], t1, ridge), tri(t0, ridge, [0.55, top, 0]), tri([0.55, top, 0], ridge, t1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}

function carGeo() {
  return mergeGeometries([box(0, 0.62, 0, 4.2, 0.85, 1.9), box(-0.35, 1.66, 0, 2.0, 0.1, 1.62)])!;
}

/** A soft round pool of light, for the ground under street lights, lanterns and floodlights. */
function poolTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Life3D {
  private group = new THREE.Group();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private meshes: Record<string, THREE.InstancedMesh> = {};
  private counts: Record<string, number> = {};
  private pools: THREE.InstancedMesh;
  private poolMat: THREE.MeshBasicMaterial;
  private dpoolMat!: THREE.MeshBasicMaterial;
  private lampHeadMat!: THREE.MeshStandardMaterial;

  constructor(scene: THREE.Scene, world: World) {
    scene.add(this.group);
    const std = (o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true, ...o });
    const add = (name: string, geo: THREE.BufferGeometry, mat: THREE.Material, cap: number, shadow = true) => {
      const im = new THREE.InstancedMesh(geo, mat, cap);
      im.count = 0;
      im.frustumCulled = false;
      im.castShadow = shadow;
      this.group.add(im);
      this.meshes[name] = im;
    };
    add('boat', boatGeo(), std({ side: THREE.DoubleSide }), 40);
    add('body', new THREE.CylinderGeometry(0.34, 0.42, 1.25, 7).translate(0, 0.62, 0), std(), 400);
    add('head', new THREE.SphereGeometry(0.28, 8, 6).translate(0, 1.48, 0), std({ roughness: 0.8 }), 400);
    add('rod', new THREE.CylinderGeometry(0.03, 0.05, 1, 4).translate(0, 0.5, 0), std({ color: '#6e5238' }), 80);
    add('float', new THREE.SphereGeometry(0.2, 6, 4), std({ color: '#d4452e' }), 80, false);
    add('prop', new THREE.CylinderGeometry(0.5, 0.5, 1, 10), std(), 120);
    add('hookah', mergeGeometries([new THREE.SphereGeometry(0.32, 8, 6).translate(0, 0.9, 0).toNonIndexed(), new THREE.CylinderGeometry(0.05, 0.08, 0.7, 6).translate(0, 1.4, 0).toNonIndexed(), new THREE.CylinderGeometry(0.16, 0.1, 0.12, 8).translate(0, 1.8, 0).toNonIndexed()])!, std({ color: '#6fa0a8', roughness: 0.4 }), 10);
    add('coal', new THREE.SphereGeometry(0.09, 6, 4), new THREE.MeshBasicMaterial({ color: '#ff7a3a' }), 10, false);
    add('duck', mergeGeometries([new THREE.SphereGeometry(0.22, 8, 6).scale(1, 0.7, 1.6).translate(0, 0.12, 0.05).toNonIndexed(), new THREE.SphereGeometry(0.12, 6, 5).translate(0, 0.32, -0.28).toNonIndexed()])!, std(), 30, false);
    add('swan', mergeGeometries([new THREE.SphereGeometry(0.5, 8, 6).scale(1, 0.6, 1.7).translate(0, 0.25, 0.1).toNonIndexed(), new THREE.CylinderGeometry(0.08, 0.1, 1.1, 6).rotateX(-0.35).translate(0, 0.85, -0.55).toNonIndexed(), new THREE.SphereGeometry(0.13, 6, 5).translate(0, 1.4, -0.75).toNonIndexed()])!, std({ color: '#fbfaf6' }), 4, false);
    add('dog', mergeGeometries([box(0, 0.45, 0, 0.36, 0.34, 0.9), box(0, 0.62, -0.55, 0.28, 0.28, 0.32), box(0, 0.2, -0.3, 0.3, 0.4, 0.1), box(0, 0.2, 0.3, 0.3, 0.4, 0.1), box(0, 0.6, 0.55, 0.06, 0.06, 0.35)])!, std(), 12);
    add('cat', mergeGeometries([box(0, 0.16, 0, 0.2, 0.26, 0.38), box(0, 0.36, -0.2, 0.18, 0.16, 0.16), box(0, 0.12, 0.3, 0.05, 0.05, 0.3)])!, std(), 20, false);
    add('car', carGeo(), std({ roughness: 0.6, flatShading: false }), 700);
    add('glass', box(-0.3, 1.33, 0, 2.3, 0.56, 1.72), std({ color: '#2b3440', roughness: 0.25, metalness: 0.4, flatShading: false }), 700, false);
    add('wheels', mergeGeometries([[1.3, 0.95], [1.3, -0.95], [-1.3, 0.95], [-1.3, -0.95]].map(([x, z]) => new THREE.CylinderGeometry(0.36, 0.36, 0.28, 8).rotateX(Math.PI / 2).translate(x, 0.36, z).toNonIndexed()))!, std({ color: '#232120' }), 700, false);
    add('bus', mergeGeometries([box(0, 1.5, 0, 11, 2.6, 2.5), box(-0.3, 3.0, 0, 2.4, 0.4, 1.3)])!, std({ roughness: 0.6 }), 16);
    add('busglass', mergeGeometries([box(0.2, 2.0, 1.26, 9.6, 0.8, 0.04), box(0.2, 2.0, -1.26, 9.6, 0.8, 0.04), box(5.51, 1.9, 0, 0.04, 1.2, 2.2)])!, new THREE.MeshStandardMaterial({ color: '#2b3440', emissive: '#ffd9a0', emissiveIntensity: 0, roughness: 0.3 }), 16, false);
    add('scooter', mergeGeometries([box(0, 0.45, 0, 1.6, 0.35, 0.32), box(0.55, 0.9, 0, 0.12, 0.7, 0.12)])!, std({ roughness: 0.5 }), 20);
    add('smoke', new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#b9b4ac', roughness: 1, flatShading: true, transparent: true, opacity: 0.38, depthWrite: false }), 300, false);
    add('beacon', new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff2a1a' }), 30, false);
    add('lamp', new THREE.SphereGeometry(0.25, 6, 5), new THREE.MeshBasicMaterial({ color: '#ffe2a8' }), 40, false);
    add('lightbar', box(-0.3, 1.82, 0, 0.4, 0.16, 1.3), new THREE.MeshBasicMaterial({ color: '#ffffff' }), 6, false);
    add('engine', mergeGeometries([box(-0.7, 1.4, 0, 6.6, 2.4, 2.5), box(3.3, 1.2, 0, 1.4, 2.0, 2.5)])!, std({ color: '#c0392b', roughness: 0.5, flatShading: false }), 4);
    add('ladder', mergeGeometries([box(-0.7, 2.7, 0.45, 6, 0.1, 0.1), box(-0.7, 2.7, -0.45, 6, 0.1, 0.1), ...Array.from({ length: 9 }, (_, k) => box(-3.4 + k * 0.7, 2.7, 0, 0.08, 0.08, 0.9))])!, std({ color: '#d9d4c8' }), 4, false);
    add('pole', new THREE.CylinderGeometry(0.07, 0.09, 1, 6).translate(0, 0.5, 0), std({ color: '#5a5550', roughness: 0.6 }), 40);
    add('flag', new THREE.PlaneGeometry(2.4, 1.4).translate(1.2, 0, 0), std({ color: '#f4f2ec', side: THREE.DoubleSide, flatShading: false }), 2, false);
    add('flagband', new THREE.PlaneGeometry(2.4, 0.45).translate(1.2, 0, 0.01), std({ color: '#2e6f73', side: THREE.DoubleSide, flatShading: false }), 2, false);
    add('log', box(0, 0.15, 0, 1.6, 0.25, 0.25), std({ color: '#5a4030' }), 40, false);
    add('flame', new THREE.ConeGeometry(0.45, 1.4, 6).translate(0, 0.7, 0), new THREE.MeshBasicMaterial({ color: '#ff8a3a' }), 40, false);
    add('flamecore', new THREE.ConeGeometry(0.25, 0.9, 6).translate(0, 0.45, 0), new THREE.MeshBasicMaterial({ color: '#ffd27a' }), 40, false);
    add('posthead', box(0.35, 0, 0, 0.9, 0.2, 0.4), new THREE.MeshBasicMaterial({ color: '#ffffff' }), 40, false);
    add('mast', mergeGeometries([new THREE.CylinderGeometry(0.06, 0.18, 1, 4).translate(0, 0.5, 0).toNonIndexed(), box(0, 0.55, 0, 0.9, 0.03, 0.03), box(0, 0.75, 0, 0.6, 0.03, 0.03), box(0, 0.35, 0, 0.03, 0.03, 1.1)])!, std({ color: '#8a857e', roughness: 0.6 }), 20);
    add('chair', mergeGeometries([box(0, 0.45, 0, 0.5, 0.06, 0.5), box(0, 0.75, 0.22, 0.5, 0.6, 0.06), box(0, 0.22, 0, 0.4, 0.45, 0.4)])!, std({ color: '#8a6a48' }), 40, false);
    add('awning', mergeGeometries([box(0, 2.6, 0, 6, 0.06, 2.6).rotateX(0.22).toNonIndexed(), box(-2.9, 1.25, 1.2, 0.08, 2.5, 0.08), box(2.9, 1.25, 1.2, 0.08, 2.5, 0.08)])!, std({ side: THREE.DoubleSide }), 6);
    this.dpoolMat = new THREE.MeshBasicMaterial({ map: poolTexture(), transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const dp = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), this.dpoolMat, 80);
    dp.count = 0;
    dp.frustumCulled = false;
    dp.renderOrder = 2;
    this.group.add(dp);
    this.meshes.dpool = dp;

    // Street lights (shared with the flat map): a paper post on the kerb, its arm over the road, a lamp head that
    // glows after dark, and a smooth pool of light on the ground beneath it.
    const lights = streetLights(world);
    this.poolMat = new THREE.MeshBasicMaterial({ map: poolTexture(), color: '#ffd9a0', transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), this.poolMat, lights.length);
    const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.12, 6, 5).translate(0, 3, 0), std({ color: '#5c5751', roughness: 0.6 }), lights.length);
    const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.08, 0.08).translate(0.5, 0, 0), std({ color: '#5c5751', roughness: 0.6 }), lights.length);
    this.lampHeadMat = new THREE.MeshStandardMaterial({ color: '#e9e2cf', emissive: '#ffd79a', emissiveIntensity: 0, roughness: 0.5 });
    const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.18, 0.4), this.lampHeadMat, lights.length);
    lights.forEach((l, i) => {
      const len = Math.hypot(l.x - l.px, l.y - l.py);
      const yaw = Math.atan2(-(l.y - l.py), l.x - l.px);
      const cold = l.flood;
      this.pools.setMatrixAt(i, this.m.compose(this.v.set(l.x, 0.3, l.y), this.q.identity(), this.s.set(l.r, 1, l.r)));
      this.pools.setColorAt(i, this.c.set(cold ? '#dfe9ff' : '#ffd9a0'));
      posts.setMatrixAt(i, this.m.compose(this.v.set(l.px, 0, l.py), this.q.identity(), this.s.set(1, cold ? 1.4 : 1, 1)));
      arms.setMatrixAt(i, this.m.compose(this.v.set(l.px, cold ? 8.3 : 5.95, l.py), this.q.setFromAxisAngle(up, yaw), this.s.set(Math.max(0.01, len), 1, 1)));
      heads.setMatrixAt(i, this.m.compose(this.v.set(l.x, cold ? 8.2 : 5.85, l.y), this.q.setFromAxisAngle(up, yaw), this.s.set(1, 1, 1)));
    });
    for (const im of [this.pools, posts, arms, heads]) {
      im.frustumCulled = false;
      this.group.add(im);
    }
    posts.castShadow = true;
    this.pools.renderOrder = 2;
  }

  private put(name: string, x: number, y: number, z: number, rotY: number, sx: number, sy: number, sz: number, col?: string, tiltX = 0) {
    const im = this.meshes[name];
    const n = this.counts[name] ?? 0;
    if (n >= im.instanceMatrix.count) return;
    this.q.setFromEuler(new THREE.Euler(tiltX, rotY, 0, 'YXZ'));
    im.setMatrixAt(n, this.m.compose(this.v.set(x, z, y), this.q, this.s.set(sx, sy, sz)));
    if (col) im.setColorAt(n, this.c.set(col));
    this.counts[name] = n + 1;
  }

  /** Build this moment's scene. time: the map's clock; night 0..1. */
  update(ents: Ent[], time: number, night: number) {
    this.counts = {};
    // The map's angle a (clockwise from north, x east, y south) as a turn about the 3D up axis.
    const yawN = (a: number) => -a; // bow (-y) toward the heading
    for (const e of ents) {
      switch (e.t) {
        case 'boat': {
          const sc = e.len / 6;
          this.put('boat', e.x, e.y, Math.sin(time * 1.3 + e.x) * 0.05, yawN(e.a), sc, sc, sc, HULLS[e.hull][0]);
          if (e.kind === 'row') {
            // Oars, swinging with the stroke.
            for (const s of [-1, 1]) this.put('rod', e.x, e.y, 0.8, yawN(e.a) + s * (Math.PI / 2 - e.stroke * 0.5), 1, 2.4, 1, '#6e5238', Math.PI / 2 + 0.25);
          }
          if (e.kind === 'motor' && night > 0.4) this.put('lamp', e.x, e.y, 1.6, 0, 1, 1, 1);
          break;
        }
        case 'person': {
          // The flat map's facing is an angle from east; seated people are drawn a little lower and wider.
          const sy = e.sit ? 0.72 : 1;
          const id = e.id;
          this.put('body', e.x, e.y, e.sit ? 0.25 : 0, 0, 1.3, 1.3 * sy, 1.3, ['#5b6b7c', '#8a7a5c', '#6e4a3a', '#d8d2c4', '#3f4a3a', '#7d6b8a', '#2f3440'][id % 7]);
          this.put('head', e.x, e.y, (e.sit ? 0.25 : 0) - (1 - sy) * 1.9, 0, 1.3, 1.3, 1.3, ['#c8a07a', '#a8805e', '#8a6446', '#d6b08a'][id % 4]);
          if (e.smoke) this.put('smoke', e.x + ((time * 0.35) % 1) * 1.5, e.y, 2.2 + ((time * 0.35) % 1) * 1.2, time, 0.18 + ((time * 0.35) % 1) * 0.3, 0.18 + ((time * 0.35) % 1) * 0.3, 0.18 + ((time * 0.35) % 1) * 0.3, '#e8e5de');
          break;
        }
        case 'rod': {
          // Held out over the water, rising at an angle; the float where the line meets the water.
          const yaw = Math.atan2(Math.cos(e.a), Math.sin(e.a));
          this.put('rod', e.x, e.y, e.z, yaw, 1, e.len * 0.5, 1, undefined, Math.PI / 2 - 0.45);
          const bob = Math.sin(time * 2 + e.seed) * 0.05;
          this.put('float', e.x + Math.cos(e.a) * e.len, e.y + Math.sin(e.a) * e.len, 0.05 + bob, 0, 1, 1, 1);
          break;
        }
        case 'table':
          this.put('prop', e.x, e.y, 0.35, 0, 1.9, 0.7, 1.9, '#b08a5e');
          break;
        case 'stool':
          this.put('prop', e.x, e.y, 0.25, 0, 0.7, 0.5, 0.7, '#7a5a3a');
          break;
        case 'bucket':
          this.put('prop', e.x, e.y, 0.2, 0, 0.6, 0.4, 0.6, '#6f8a96');
          break;
        case 'hookah':
          this.put('hookah', e.x, e.y, 0, 0, 1, 1, 1);
          this.put('coal', e.x, e.y, 1.9, 0, 1, 1, 1);
          for (let k = 0; k < 3; k++) {
            const u = (time * 0.3 + k / 3 + e.seed) % 1;
            this.put('smoke', e.x + u * 1.6, e.y, 2.1 + u * 1.6, time + k, 0.15 + u * 0.4, 0.15 + u * 0.4, 0.15 + u * 0.4, '#ecebe6');
          }
          break;
        case 'glow':
          this.put('lamp', e.x, e.y, e.z, 0, 1, 1, 1);
          this.put('dpool', e.x, e.y, 0.3, 0, e.r * 1.4, 1, e.r * 1.4, '#ffcf8a');
          break;
        case 'duck':
          this.put('duck', e.x, e.y, 0, yawN(e.a), 1.8 * e.s, e.asleep ? 1.2 * e.s : 1.8 * e.s, 1.8 * e.s, e.drake ? '#8b7358' : '#9a8062');
          break;
        case 'swan':
          this.put('swan', e.x, e.y, 0, yawN(e.a), 1.3, 1.3, 1.3);
          break;
        case 'dog':
          this.put('dog', e.x, e.y, 0, yawN(e.a), 1.6, e.lying ? 0.6 : 1.6, 1.6, e.col);
          break;
        case 'cat':
          this.put('cat', e.x, e.y, e.z, yawN(e.a), 1.8, e.curled ? 0.7 : 1.8, 1.8, e.col);
          break;
        case 'car':
          for (const n of ['car', 'glass', 'wheels']) this.put(n, e.x, e.y, 0, e.h ? (e.dir > 0 ? 0 : Math.PI) : e.dir > 0 ? -Math.PI / 2 : Math.PI / 2, 1, 1, 1, n === 'car' ? e.col : undefined);
          break;
        case 'bus':
          {
            const yaw = e.v ? (e.dir > 0 ? -Math.PI / 2 : Math.PI / 2) : e.dir > 0 ? 0 : Math.PI;
            this.put('bus', e.x, e.y, 0, yaw, 1, 1, 1, e.col);
            this.put('busglass', e.x, e.y, 0, yaw, 1, 1, 1);
          }
          break;
        case 'scooter':
          this.put('scooter', e.x, e.y, 0, Math.atan2(Math.sin(e.a), Math.cos(e.a)) * -1, 1, 1, 1, e.col);
          this.put('body', e.x, e.y, 0.35, 0, 1.1, 0.9, 1.1, '#4a4a50');
          this.put('head', e.x, e.y, 0.1, 0, 1.2, 1.2, 1.2, e.col === '#1f1f22' ? '#c9c2b4' : '#1f1f22');
          break;
        case 'smoke':
          if (e.strength > 0.02)
            for (let k = 0; k < 5; k++) {
              const u = (time * 0.07 + k / 5 + e.seed * 0.37) % 1;
              const r = (0.5 + u * 2.6) * e.size * Math.min(1, e.strength + 0.2);
              this.put('smoke', e.x + u * 12 * e.size, e.y - u * 5 * e.size, e.z + u * 16 * e.size, u * 3 + k, r, r, r, e.dark > 0.5 ? '#6d6862' : '#c9c4ba');
            }
          break;
        case 'police': {
          const yaw = e.h ? (e.dir > 0 ? 0 : Math.PI) : e.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
          for (const n2 of ['car', 'glass', 'wheels']) this.put(n2, e.x, e.y, 0, yaw, 1, 1, 1, n2 === 'car' ? '#f4f2ec' : undefined);
          this.put('lightbar', e.x, e.y, 0, yaw, 1, 1, 1, e.flash === 1 ? '#ff3a2a' : e.flash === 2 ? '#4a8cff' : '#6a5a6a');
          if (e.flash) this.put('dpool', e.x, e.y, 0.3, 0, 7, 1, 7, e.flash === 1 ? '#ff4a3a' : '#5a8cff');
          break;
        }
        case 'engine': {
          const yaw = e.h ? (e.dir > 0 ? 0 : Math.PI) : e.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
          this.put('engine', e.x, e.y, 0, yaw, 1, 1, 1);
          this.put('ladder', e.x, e.y, 0, yaw, 1, 1, 1);
          this.put('wheels', e.x, e.y, 0, yaw, 1.4, 1.2, 1.2);
          break;
        }
        case 'flag':
          this.put('pole', e.x, e.y, e.z, 0, 1, 6, 1);
          this.put('flag', e.x, e.y, e.z + 5.1, 0.6 + e.wave * 0.25, 1, 1, 1);
          this.put('flagband', e.x, e.y, e.z + 5.1, 0.6 + e.wave * 0.25, 1, 1, 1);
          break;
        case 'fire': {
          const k = e.size;
          this.put('log', e.x, e.y, 0, 0.6, k, k, k, '#5a4030');
          this.put('log', e.x, e.y, 0, -0.6, k, k, k, '#4a3428');
          const f = 1 + e.flicker * 0.18;
          this.put('flame', e.x, e.y, 0.1, e.flicker, k, k * f, k);
          this.put('flamecore', e.x, e.y, 0.1, -e.flicker, k, k * (2 - f), k);
          this.put('dpool', e.x, e.y, 0.3, 0, 8 * k * f, 1, 8 * k * f, '#ff9a4a');
          break;
        }
        case 'post':
          this.put('pole', e.x, e.y, 0, 0, 1.4, 6.5, 1.4);
          this.put('posthead', e.x, e.y, 6.4, 0, 1, 1, 1, e.lit ? '#fff0c8' : '#6a6560');
          if (e.lit) this.put('dpool', e.x, e.y, 0.3, 0, 10, 1, 10, '#ffe0a8');
          break;
        case 'antenna':
          this.put('mast', e.x, e.y, e.z, 0.4, 1.2, e.h, 1.2);
          break;
        case 'chair':
          this.put('chair', e.x, e.y, 0, -e.a + Math.PI / 2, 1, 1, 1);
          break;
        case 'awning':
          this.put('awning', e.x, e.y, 0, -e.a + Math.PI / 2, e.w / 6, 1, 1, e.col);
          break;
        case 'beacon':
          this.put('beacon', e.x, e.y, e.z, 0, e.big ? 1.3 : 1, e.big ? 1.3 : 1, e.big ? 1.3 : 1);
          break;
      }
    }
    for (const [name, im] of Object.entries(this.meshes)) {
      im.count = this.counts[name] ?? 0;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
    (this.meshes.busglass.material as THREE.MeshStandardMaterial).emissiveIntensity = night * 1.4;
    this.poolMat.opacity = night * 0.42;
    this.dpoolMat.opacity = 0.55 * Math.max(0.3, night);
    this.lampHeadMat.emissiveIntensity = night * 2.4;
    this.pools.visible = night > 0.05;
  }
}

void up;
