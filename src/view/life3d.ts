// The 3D model's version of the city's life (see lifeScene): the same boats, fishermen, café circles, smokers,
// animals, parked cars, buses, scooters, smoke and red lights as the flat map, as small folded-paper models.
// Everything is instanced: one draw per kind of thing, rebuilt each frame from the scene.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { riverX, type Rect, type World } from '../jev';
import { HULLS, type Ent } from './lifeScene';

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
    add('bus', mergeGeometries([box(0, 1.5, 0, 11, 2.6, 2.5), box(-0.3, 3.0, 0, 2.4, 0.4, 1.3)])!, std({ roughness: 0.6 }), 4);
    add('busglass', mergeGeometries([box(0.2, 2.0, 1.26, 9.6, 0.8, 0.04), box(0.2, 2.0, -1.26, 9.6, 0.8, 0.04), box(5.51, 1.9, 0, 0.04, 1.2, 2.2)])!, new THREE.MeshStandardMaterial({ color: '#2b3440', emissive: '#ffd9a0', emissiveIntensity: 0, roughness: 0.3 }), 4, false);
    add('scooter', mergeGeometries([box(0, 0.45, 0, 1.6, 0.35, 0.32), box(0.55, 0.9, 0, 0.12, 0.7, 0.12)])!, std({ roughness: 0.5 }), 20);
    add('smoke', new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#b9b4ac', roughness: 1, flatShading: true, transparent: true, opacity: 0.38, depthWrite: false }), 300, false);
    add('beacon', new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff2a1a' }), 30, false);
    add('lamp', new THREE.SphereGeometry(0.25, 6, 5), new THREE.MeshBasicMaterial({ color: '#ffe2a8' }), 40, false);

    // Night: pools of light on the ground under the street lights, and floodlights at the works. Fixed, faded in by the hour.
    this.poolMat = new THREE.MeshBasicMaterial({ map: poolTexture(), color: '#ffd28f', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const spots: [number, number, number][] = [];
    for (let x = 12; x < world.w; x += 24) spots.push([x, 350 - 10.5, 7], [x, 350 + 10.5, 7]);
    for (let y = 10; y < world.h; y += 26) spots.push([riverX(y) - 24, y, 6], [riverX(y) + 24, y, 6]);
    for (const rd of world.roads) {
      if (rd.kind !== 'street' || rd.rect.x > 1006) continue;
      const q: Rect = rd.rect;
      const h = q.w > q.h;
      const len = h ? q.w : q.h;
      for (let d = 16, k = 0; d < len; d += 34, k++) {
        const side = k % 2 ? 1 : -1;
        spots.push([h ? q.x + d : q.x + q.w / 2 + side * (q.w / 2 - 1), h ? q.y + q.h / 2 + side * (q.h / 2 - 1) : q.y + d, 6]);
      }
    }
    for (const b of world.buildings) if (b.kind === 'warehouse' || b.kind === 'factory') for (const [x, y] of [[b.rects[0].x, b.rects[0].y], [b.rects[0].x + b.rects[0].w, b.rects[0].y + b.rects[0].h]]) spots.push([x, y, 9]);
    this.pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), this.poolMat, spots.length);
    spots.forEach(([x, y, r], i) => this.pools.setMatrixAt(i, this.m.compose(this.v.set(x, 0.12, y), this.q.identity(), this.s.set(r, 1, r))));
    this.pools.frustumCulled = false;
    this.pools.renderOrder = 2;
    this.group.add(this.pools);
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
          this.put('bus', e.x, e.y, 0, e.dir > 0 ? 0 : Math.PI, 1, 1, 1, e.col);
          this.put('busglass', e.x, e.y, 0, e.dir > 0 ? 0 : Math.PI, 1, 1, 1);
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
    this.poolMat.opacity = night * 0.55;
    this.pools.visible = night > 0.05;
  }
}

void up;
