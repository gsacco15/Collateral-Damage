// The 3D model's version of the city's life (see lifeScene): the same boats, fishermen, café circles, smokers,
// animals, parked cars, buses, scooters, smoke and red lights as the flat map, as small folded-paper models.
// Everything is instanced: one draw per kind of thing, rebuilt each frame from the scene.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type World } from '../jev';
import { HULLS, type Ent } from './lifeScene';
import { brokenLights, streetLights } from './streetLights';

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
  private lampParts!: { posts: THREE.InstancedMesh; arms: THREE.InstancedMesh; heads: THREE.InstancedMesh; deadHeads: THREE.InstancedMesh };
  private world: World;
  private brokenKey = '';
  private lampHeadMat!: THREE.MeshStandardMaterial;

  constructor(scene: THREE.Scene, world: World) {
    this.world = world;
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
    add('truck', mergeGeometries([box(1.6, 1.15, 0, 1.7, 1.7, 2.1), box(-1.1, 0.75, 0, 3.6, 0.5, 2.1), box(-1.1, 1.25, 1.02, 3.6, 0.5, 0.06), box(-1.1, 1.25, -1.02, 3.6, 0.5, 0.06), box(-2.88, 1.25, 0, 0.06, 0.5, 2.1)])!, std({ roughness: 0.6 }), 16);
    add('lorry', mergeGeometries([box(2.3, 1.2, 0, 1.6, 1.9, 2.2), box(-0.9, 1.6, 0, 4.6, 2.6, 2.3)])!, std({ roughness: 0.6 }), 8);
    add('cargo', box(-1.1, 1.3, 0, 3.2, 0.6, 1.9), std(), 16, false);
    add('twheels', mergeGeometries([[1.5, 1.05], [1.5, -1.05], [-1.8, 1.05], [-1.8, -1.05]].map(([x, z]) => new THREE.CylinderGeometry(0.4, 0.4, 0.3, 8).rotateX(Math.PI / 2).translate(x, 0.4, z).toNonIndexed()))!, std({ color: '#232120' }), 24, false);
    add('basin', mergeGeometries([new THREE.CylinderGeometry(6.2, 6.4, 0.9, 32, 1, true).translate(0, 0.45, 0).toNonIndexed(), new THREE.RingGeometry(5.8, 6.3, 32).rotateX(-Math.PI / 2).translate(0, 0.9, 0).toNonIndexed(), new THREE.CylinderGeometry(0.7, 1.1, 2.6, 12).translate(0, 1.3, 0).toNonIndexed(), new THREE.CylinderGeometry(2.2, 1.2, 0.4, 16).translate(0, 2.6, 0).toNonIndexed()])!, std({ color: '#e8e1d2', side: THREE.DoubleSide, flatShading: false }), 1);
    add('water', new THREE.CircleGeometry(6, 32).rotateX(-Math.PI / 2).translate(0, 0.62, 0), new THREE.MeshStandardMaterial({ color: '#8fb5c4', roughness: 0.15, metalness: 0.2, emissive: '#a8d4ff', emissiveIntensity: 0 }), 1, false);
    add('drop', new THREE.SphereGeometry(0.16, 5, 4), new THREE.MeshStandardMaterial({ color: '#eef7fb', emissive: '#bfe0ff', emissiveIntensity: 0, roughness: 0.2, transparent: true, opacity: 0.85 }), 60, false);
    // Yard clutter.
    add('c_drum', mergeGeometries([new THREE.CylinderGeometry(0.3, 0.3, 0.9, 10).translate(0, 0.45, 0).toNonIndexed(), new THREE.TorusGeometry(0.3, 0.025, 4, 12).rotateX(Math.PI / 2).translate(0, 0.3, 0).toNonIndexed(), new THREE.TorusGeometry(0.3, 0.025, 4, 12).rotateX(Math.PI / 2).translate(0, 0.62, 0).toNonIndexed()])!, std({ roughness: 0.6, metalness: 0.2 }), 400);
    add('c_gas', mergeGeometries([new THREE.CapsuleGeometry(0.16, 0.45, 3, 8).translate(0, 0.4, 0).toNonIndexed(), new THREE.CylinderGeometry(0.05, 0.05, 0.15, 6).translate(0, 0.8, 0).toNonIndexed()])!, std({ roughness: 0.5 }), 300);
    add('c_jerry', box(0, 0.25, 0, 0.2, 0.5, 0.36), std({ roughness: 0.7 }), 300);
    add('c_pallet', mergeGeometries([0, 1, 2, 3, 4].map((k) => box(0, 0.14, -0.44 + k * 0.22, 1.2, 0.04, 0.14)).concat([box(-0.5, 0.06, 0, 0.1, 0.12, 1), box(0, 0.06, 0, 0.1, 0.12, 1), box(0.5, 0.06, 0, 0.1, 0.12, 1)]))!, std({ color: '#b89968' }), 120);
    add('c_tyres', mergeGeometries([0, 1, 2].map((k) => new THREE.TorusGeometry(0.32, 0.12, 6, 12).rotateX(Math.PI / 2).translate(0, 0.12 + k * 0.24, 0).toNonIndexed()))!, std({ color: '#2a2826' }), 120);
    add('c_crate', box(0, 0.3, 0, 0.6, 0.6, 0.6), std(), 300);
    add('c_sacks', new THREE.SphereGeometry(0.35, 7, 5).scale(1, 0.55, 0.7).translate(0, 0.18, 0), std(), 200);
    add('c_skip', mergeGeometries([box(0, 0.6, 0, 1.9, 1.2, 1.2), box(0, 1.24, -0.3, 1.9, 0.06, 0.62)])!, std({ roughness: 0.6 }), 60);
    add('c_wreck', mergeGeometries([box(0, 0.35, 0, 4.2, 0.7, 1.9), box(-0.35, 1.0, 0, 2.0, 0.6, 1.62), box(1.4, 0.12, 0.7, 0.3, 0.24, 0.3), box(-1.4, 0.12, -0.7, 0.3, 0.24, 0.3), box(1.4, 0.12, -0.7, 0.3, 0.24, 0.3), box(-1.4, 0.12, 0.7, 0.3, 0.24, 0.3)])!, std({ roughness: 0.9 }), 80);
    add('c_rust', mergeGeometries([box(-1.0, 0.72, 0.96, 1.2, 0.5, 0.02), box(1.1, 0.72, -0.96, 1.0, 0.4, 0.02), box(0.9, 0.71, 0, 1.4, 0.02, 1.2)])!, std({ color: '#8a4a26', roughness: 1 }), 120, false);
    add('c_tyrepile', mergeGeometries([[0, 0, 0], [0.7, 0, 0.3], [0.3, 0.24, 0.1], [-0.4, 0, 0.5], [0.2, 0.48, 0.2]].map(([x, y, z]) => new THREE.TorusGeometry(0.32, 0.12, 6, 12).rotateX(Math.PI / 2 + (x - z) * 0.4).translate(x, 0.12 + y, z).toNonIndexed()))!, std({ color: '#2a2826' }), 60);
    add('c_cactus', mergeGeometries([[0, 0.45, 0, 0], [0.3, 0.95, 0.05, 0.5], [-0.3, 0.9, 0, -0.6], [0.05, 1.35, 0.05, 0.2]].map(([x, y, z, a]) => new THREE.SphereGeometry(0.34, 7, 5).scale(1, 1.25, 0.28).rotateZ(a).translate(x, y, z).toNonIndexed()))!, std({ color: '#6f8f4a' }), 80);
    add('c_shrub', new THREE.IcosahedronGeometry(0.9, 1).scale(1, 0.85, 1).translate(0, 0.8, 0), std({ color: '#5f7a45' }), 40);
    add('c_bloom', new THREE.IcosahedronGeometry(0.95, 0).scale(1, 0.8, 1).translate(0, 0.9, 0), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true, transparent: true, opacity: 0.55 }), 40, false);
    add('c_pot', mergeGeometries([new THREE.CylinderGeometry(0.26, 0.18, 0.45, 8).translate(0, 0.22, 0).toNonIndexed(), new THREE.IcosahedronGeometry(0.3, 0).translate(0, 0.62, 0).toNonIndexed()])!, std(), 200);
    add('c_bougain', mergeGeometries([new THREE.IcosahedronGeometry(1, 1).scale(1.7, 1.1, 0.55).translate(0, 1.9, 0).toNonIndexed(), new THREE.IcosahedronGeometry(0.7, 0).scale(1.2, 0.9, 0.5).translate(0.9, 1.1, 0).toNonIndexed()])!, std(), 120);
    add('t_door', box(1.6, 1.0, 1.06, 0.95, 0.9, 0.04), std({ roughness: 0.7 }), 16, false);
    add('t_load', mergeGeometries([box(-1.6, 1.6, -0.5, 1.1, 1.0, 1.1), box(-0.5, 1.7, 0.45, 1.1, 1.2, 1.1), box(-1.5, 2.4, 0.3, 1.0, 0.6, 1.4), box(-0.4, 1.5, -0.6, 1.0, 0.8, 1.0)])!, std(), 16);
    // Tarp shelters: an A-frame of blue sheet over a ridge, with a mat under it.
    {
      const p: number[] = [];
      const L = 1.4;
      const W = 1.15;
      const H = 1.15;
      const tri = (a: number[], b: number[], c: number[]) => p.push(...a, ...b, ...c);
      tri([-L, 0, -W], [L, 0, -W], [L, H, 0]), tri([-L, 0, -W], [L, H, 0], [-L, H - 0.15, 0]);
      tri([-L, 0, W], [L, H, 0], [L, 0, W]), tri([-L, 0, W], [-L, H - 0.15, 0], [L, H, 0]);
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      tg.computeVertexNormals();
      add('tarp', tg, std({ side: THREE.DoubleSide, roughness: 0.6 }), 60);
      add('tarpmat', box(0, 0.03, 0, 3.4, 0.05, 2.6), std({ color: '#b89a6a' }), 60, false);
    }
    add('goat', mergeGeometries([box(0, 0.55, 0, 0.34, 0.36, 0.8), box(0, 0.8, -0.5, 0.2, 0.26, 0.3), box(-0.1, 0.25, -0.28, 0.08, 0.5, 0.08), box(0.1, 0.25, -0.28, 0.08, 0.5, 0.08), box(-0.1, 0.25, 0.28, 0.08, 0.5, 0.08), box(0.1, 0.25, 0.28, 0.08, 0.5, 0.08), box(-0.06, 1.0, -0.48, 0.04, 0.2, 0.04), box(0.06, 1.0, -0.48, 0.04, 0.2, 0.04)])!, std(), 40);
    add('chicken', mergeGeometries([new THREE.SphereGeometry(0.16, 6, 5).scale(1, 0.9, 1.3).translate(0, 0.22, 0).toNonIndexed(), new THREE.SphereGeometry(0.08, 5, 4).translate(0, 0.38, -0.15).toNonIndexed()])!, std(), 90, false);
    add('pigeon', new THREE.SphereGeometry(0.09, 5, 4).scale(1, 0.8, 1.5).translate(0, 0.09, 0), std(), 200, false);
    add('donkey', mergeGeometries([box(0, 0.9, 0, 0.42, 0.5, 1.1), box(0, 1.25, -0.7, 0.26, 0.34, 0.46), box(-0.14, 0.4, -0.4, 0.1, 0.8, 0.1), box(0.14, 0.4, -0.4, 0.1, 0.8, 0.1), box(-0.14, 0.4, 0.4, 0.1, 0.8, 0.1), box(0.14, 0.4, 0.4, 0.1, 0.8, 0.1), box(-0.08, 1.55, -0.62, 0.05, 0.25, 0.05), box(0.08, 1.55, -0.62, 0.05, 0.25, 0.05)])!, std(), 8);
    add('cart', mergeGeometries([box(0, 0.75, 1.6, 1.3, 0.12, 1.6), box(0, 0.95, 1.6, 1.2, 0.3, 1.5), new THREE.CylinderGeometry(0.45, 0.45, 0.1, 10).rotateZ(Math.PI / 2).translate(0.7, 0.45, 1.6).toNonIndexed(), new THREE.CylinderGeometry(0.45, 0.45, 0.1, 10).rotateZ(Math.PI / 2).translate(-0.7, 0.45, 1.6).toNonIndexed(), box(-0.25, 0.8, 0.5, 0.05, 0.05, 1), box(0.25, 0.8, 0.5, 0.05, 0.05, 1)])!, std({ color: '#8a6a48' }), 8);
    // Litter: a crushed can, a plastic bottle, a plastic bag caught on the ground.
    add('l_can', new THREE.CylinderGeometry(0.07, 0.07, 0.24, 7).rotateZ(Math.PI / 2).translate(0, 0.07, 0), std({ roughness: 0.4, metalness: 0.4 }), 800, false);
    add('l_bottle', new THREE.CapsuleGeometry(0.07, 0.3, 2, 6).rotateZ(Math.PI / 2).translate(0, 0.07, 0), new THREE.MeshStandardMaterial({ roughness: 0.2, transparent: true, opacity: 0.8 }), 800, false);
    add('l_bag', new THREE.IcosahedronGeometry(0.28, 0).scale(1.1, 0.35, 0.8).translate(0, 0.08, 0), std({ roughness: 0.7 }), 800, false);
    // Junk heaps: a lumpy mound, and bits sticking out of it (sheets, a tyre, a crate, a bottle).
    add('j_mound', new THREE.IcosahedronGeometry(1, 1).scale(1, 0.45, 0.85).translate(0, 0.2, 0), std(), 80);
    add('j_bit', box(0, 0, 0, 0.9, 0.12, 0.6), std({ roughness: 0.7 }), 1800, false);
    add('dumpground', new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2).translate(0, 0.06, 0), new THREE.MeshStandardMaterial({ color: '#9a8a72', roughness: 1, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), 1, false);
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
    const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.2, 6, 6).translate(0, 3, 0), std({ color: '#5c5751', roughness: 0.6 }), lights.length);
    const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.14, 0.14).translate(0.5, 0, 0), std({ color: '#5c5751', roughness: 0.6 }), lights.length);
    this.lampHeadMat = new THREE.MeshStandardMaterial({ color: '#e9e2cf', emissive: '#ffd79a', emissiveIntensity: 0, roughness: 0.5 });
    const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.26, 0.55), this.lampHeadMat, lights.length);
    // Dead lamps get a separate head with no glow.
    const deadHeads = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.26, 0.55), std({ color: '#4a4742', roughness: 0.8 }), lights.length);
    deadHeads.frustumCulled = false;
    this.group.add(deadHeads);
    this.lampParts = { posts, arms, heads, deadHeads };
    lights.forEach((l, i) => this.pools.setColorAt(i, this.c.set(l.flood ? '#dfe9ff' : '#ffd9a0')));
    this.placeLamps(new Map());
    for (const im of [this.pools, posts, arms, heads]) {
      im.frustumCulled = false;
      this.group.add(im);
    }
    posts.castShadow = true;
    this.pools.renderOrder = 2;
  }

  /** Stand every street light up, except those a strike knocked flat (lying away from it) or left dark. */
  private placeLamps(broken: Map<number, number | null>) {
    const { posts, arms, heads, deadHeads } = this.lampParts;
    const zero = new THREE.Vector3(0, 0, 0);
    streetLights(this.world).forEach((l, i) => {
      const len = Math.hypot(l.x - l.px, l.y - l.py);
      const yaw = Math.atan2(-(l.y - l.py), l.x - l.px);
      const cold = l.flood;
      const hy = cold ? 1.4 : 1;
      const fall = broken.get(i);
      const dead = broken.has(i);
      this.pools.setMatrixAt(i, this.m.compose(this.v.set(l.x, 0.3, l.y), this.q.identity(), dead ? zero : this.s.set(l.r, 1, l.r)));
      if (fall != null) {
        // Flat on the ground: the post turned about the axis across its fall, the head smashed at the far end.
        const d = new THREE.Vector3(Math.cos(fall), 0, Math.sin(fall));
        const axis = new THREE.Vector3().crossVectors(up, d).normalize();
        this.q.setFromAxisAngle(axis, 1.5);
        posts.setMatrixAt(i, this.m.compose(this.v.set(l.px, 0.15, l.py), this.q, this.s.set(1, hy, 1)));
        arms.setMatrixAt(i, this.m.compose(this.v, this.q, zero));
        deadHeads.setMatrixAt(i, this.m.compose(this.v.set(l.px + d.x * 6 * hy, 0.15, l.py + d.z * 6 * hy), this.q.setFromAxisAngle(up, -fall + 0.6), this.s.set(1, 1, 1)));
        heads.setMatrixAt(i, this.m.compose(this.v, this.q, zero));
      } else {
        posts.setMatrixAt(i, this.m.compose(this.v.set(l.px, 0, l.py), this.q.identity(), this.s.set(1, hy, 1)));
        arms.setMatrixAt(i, this.m.compose(this.v.set(l.px, cold ? 8.3 : 5.95, l.py), this.q.setFromAxisAngle(up, yaw), this.s.set(Math.max(0.01, len), 1, 1)));
        this.m.compose(this.v.set(l.x, cold ? 8.2 : 5.85, l.y), this.q.setFromAxisAngle(up, yaw), this.s.set(1, 1, 1));
        heads.setMatrixAt(i, dead ? new THREE.Matrix4().makeScale(0, 0, 0) : this.m);
        deadHeads.setMatrixAt(i, dead ? this.m : new THREE.Matrix4().makeScale(0, 0, 0));
      }
    });
    for (const im of [this.pools, posts, arms, heads, deadHeads]) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }

  /** After a strike (or a rebuild), knock down or darken the lamps it reached. */
  setDamage(damaged: Set<number>, blast: { x: number; y: number; r: number } | null) {
    const key = `${[...damaged].join('.')}|${blast ? `${blast.x.toFixed(1)},${blast.y.toFixed(1)},${blast.r}` : ''}`;
    if (key === this.brokenKey) return;
    this.brokenKey = key;
    this.placeLamps(brokenLights(this.world, damaged, blast));
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
        case 'truck': {
          const yaw = -e.a;
          // Janky: leaning on tired springs, a door from another truck, loaded high.
          this.put(e.lorry ? 'lorry' : 'truck', e.x, e.y, 0, yaw, 1, 1, 1, e.col, e.lean);
          this.put('t_door', e.x, e.y, 0, yaw, 1, 1, 1, e.door, e.lean);
          if (!e.lorry) this.put('t_load', e.x, e.y, 0, yaw, 1, 1, 1, e.load, e.lean * 1.5);
          this.put('smoke', e.x - Math.cos(e.a) * (3.4 + e.smoke * 2), e.y - Math.sin(e.a) * (3.4 + e.smoke * 2), 0.5 + e.smoke * 0.8, e.smoke * 3, 0.25 + e.smoke * 0.5, 0.25 + e.smoke * 0.5, 0.25 + e.smoke * 0.5, '#9a9aa0');
          this.put('twheels', e.x, e.y, 0, yaw, 1, 1, 1);
          if (night > 0.3) this.put('dpool', e.x + Math.cos(e.a) * 6, e.y + Math.sin(e.a) * 6, 0.3, 0, 4, 1, 4, '#fff0c8');
          break;
        }
        case 'fountain': {
          this.put('basin', e.x, e.y, 0, 0, 1, 1, 1);
          this.put('water', e.x, e.y, 0, 0, 1, 1, 1);
          if (e.r)
            for (let k = 0; k < 36; k++) {
              // Jets arching up from the bowl and falling into the basin.
              const a = (k / 36) * Math.PI * 2;
              const u = (time * 0.7 + (k % 6) / 6) % 1;
              const rr = 1.2 + u * 4.2;
              this.put('drop', e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr, 2.8 + Math.sin(u * Math.PI) * 3.2 - u * 2, 0, 1, 1, 1);
            }
          if (night > 0.3) this.put('dpool', e.x, e.y, 0.95, 0, 7, 1, 7, '#cfe6ff');
          break;
        }
        case 'litter':
          this.put(e.kind === 0 ? 'l_can' : e.kind === 1 ? 'l_bottle' : 'l_bag', e.x, e.y, 0, e.a, 1.8, 1.8, 1.8, e.col);
          break;
        case 'tarp':
          if (e.mat) this.put('tarpmat', e.x, e.y, 0, -e.a, e.size, 1, e.size);
          this.put('tarp', e.x, e.y, 0, -e.a, e.size, e.size, e.size, e.col);
          break;
        case 'beast': {
          const yaw = -e.a;
          if (e.kind === 'goat') this.put('goat', e.x, e.y, 0, yaw, 1.5, e.lying ? 0.55 : 1.5, 1.5, e.col);
          else if (e.kind === 'chicken') this.put('chicken', e.x, e.y, 0, yaw, 1.6, 1.6, 1.6, e.col);
          else if (e.kind === 'pigeon') this.put('pigeon', e.x, e.y, 0, yaw, 1.6, 1.6, 1.6, e.col);
          else {
            this.put('donkey', e.x, e.y, 0, yaw, 1.5, 1.5, 1.5, e.col);
            this.put('cart', e.x, e.y, 0, yaw, 1.5, 1.5, 1.5);
          }
          break;
        }
        case 'dump':
          this.put('dumpground', e.x + e.w / 2, e.y + e.h / 2, 0, 0.1, e.w * 0.55, 1, e.h * 0.55);
          break;
        case 'junk': {
          let n = e.seed;
          const r = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
          const sy = 0.9 + r() * 0.5;
          this.put('j_mound', e.x, e.y, 0, r() * 6, e.size, e.size * sy, e.size, ['#6e6356', '#7a6e60', '#5f564c'][Math.floor(r() * 3)]);
          const cols = ['#c9c2b4', '#3a7a9a', '#b8483a', '#e0cfa8', '#2a2826', '#8a4a2a', '#f4f2ec', '#5f8a4a'];
          for (let k = 0; k < 4 + e.size * 3; k++) {
            const a = r() * Math.PI * 2;
            const d = r() * e.size * 0.75;
            // On the mound's surface, poking out of it.
            const hgt = e.size * sy * (0.2 + 0.45 * Math.sqrt(Math.max(0, 1 - (d / (e.size * 0.95)) ** 2)));
            const k2 = 0.5 + e.size * 0.18;
            this.put('j_bit', e.x + Math.cos(a) * d, e.y + Math.sin(a) * d * 0.85, hgt, r() * 6, (0.6 + r()) * k2, 1 + r() * 2, (0.6 + r()) * k2, cols[Math.floor(r() * cols.length)], (r() - 0.5) * 1.2);
          }
          break;
        }
        case 'clutter':
          if (e.kind === 'shrub') {
            this.put('c_shrub', e.x, e.y, 0, 0, 1, 1, 1);
            this.put('c_bloom', e.x, e.y, 0, 0.4, 1, 1, 1, e.col);
          } else if (e.kind === 'wreck') {
            this.put('c_wreck', e.x, e.y, 0, -e.a, 1, 1, 1, e.col);
            this.put('c_rust', e.x, e.y, 0, -e.a, 1, 1, 1);
          } else this.put('c_' + e.kind, e.x, e.y, 0, -e.a, 1, 1, 1, e.kind === 'pallet' || e.kind === 'tyres' || e.kind === 'tyrepile' || e.kind === 'cactus' ? undefined : e.col);
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
    this.poolMat.opacity = night * 0.26;
    this.dpoolMat.opacity = 0.55 * Math.max(0.3, night);
    this.lampHeadMat.emissiveIntensity = night * 2.4;
    // The fountain is lit from under the water at night.
    (this.meshes.water.material as THREE.MeshStandardMaterial).emissiveIntensity = night * 0.6;
    (this.meshes.drop.material as THREE.MeshStandardMaterial).emissiveIntensity = night * 0.9;
    this.pools.visible = night > 0.05;
  }
}

void up;
