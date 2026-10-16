import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Seeded so every run (and every check screenshot) places the same things.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Quality tiers thin the scatter by scaling every count (1 = full).
let density = 1;
export const setScatterDensity = (d) => { density = d; };

// Pick `count` spots inside a circle, at least `gap` apart, skipping any the `reject` callback refuses.
export function scatterPoints(rand, { count, gap, radius, minRadius = 0, reject }) {
  const pts = [];
  count = Math.round(count * density);
  for (let tries = 0; pts.length < count && tries < count * 60; tries++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * radius;
    if (r < minRadius) continue;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (reject?.(x, z)) continue;
    if (pts.some((p) => Math.hypot(x - p.x, z - p.z) < gap)) continue;
    pts.push({ x, z });
  }
  return pts;
}

// One draw call per material of a model, however many copies there are.
// `template` is a normalised model (feet at y=0); `spots` are { x, y, z, scale, yaw }.
// `chunks` > 1 splits the copies into an n x n grid over the valley, so a view or a shadow that only
// reaches part of the valley skips the rest (costs a few extra draw calls per model).
export function instanceModel(template, spots, { castShadow = false, chunks = 1, radius = 100 } = {}) {
  const group = new THREE.Group();
  if (!spots.length) return { group, triangles: 0 };
  template.updateMatrixWorld(true);
  const place = new THREE.Matrix4();
  const rot = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const m = new THREE.Matrix4();
  const cellOf = (v) => Math.min(chunks - 1, Math.max(0, Math.floor(((v + radius) / (2 * radius)) * chunks)));
  const cells = new Map();
  for (const s of spots) {
    const key = cellOf(s.x) * chunks + cellOf(s.z);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(s);
  }
  let triangles = 0;
  template.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const tris = (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count) / 3;
    for (const cell of cells.values()) {
      const inst = new THREE.InstancedMesh(mesh.geometry, mesh.material, cell.length);
      cell.forEach((s, i) => {
        place.compose(new THREE.Vector3(s.x, s.y, s.z), rot.setFromAxisAngle(up, s.yaw), new THREE.Vector3(s.scale, s.scale, s.scale));
        inst.setMatrixAt(i, m.multiplyMatrices(place, mesh.matrixWorld));
      });
      inst.instanceMatrix.needsUpdate = true;
      inst.castShadow = castShadow;
      inst.receiveShadow = castShadow;
      group.add(inst);
      triangles += tris * cell.length;
    }
  });
  return { group, triangles };
}

// A cheap shadow stand-in for trees: a unit-size blob (crown, or cone for pines) on a trunk, 1 wide x 1 high x 1 deep.
// Never visible itself (no colour or depth written); it only casts, so the detailed tree can skip the shadow pass.
function proxyGeometry(shape) {
  const parts = [];
  const trunk = (r, h) => parts.push(new THREE.CylinderGeometry(r, r * 1.3, h, 5).translate(0, h / 2, 0));
  if (shape === 'cone') {
    trunk(0.04, 0.3);
    parts.push(new THREE.ConeGeometry(0.5, 0.85, 6).translate(0, 0.55, 0));
  } else if (shape === 'stick') {
    trunk(0.07, 1);
  } else {
    trunk(0.04, 0.5);
    parts.push(new THREE.IcosahedronGeometry(1, 1).scale(0.46, 0.3, 0.46).translate(0, 0.68, 0));
  }
  parts.forEach((g) => g.deleteAttribute('uv'));
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}
const PROXY_MATERIAL = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

// `spots` are { x, y, z, scale, yaw, w, h, d } with w/h/d the model's native size.
export function instanceShadowProxy(spots, shape) {
  const geo = proxyGeometry(shape);
  const inst = new THREE.InstancedMesh(geo, PROXY_MATERIAL, spots.length);
  const place = new THREE.Matrix4();
  const rot = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  spots.forEach((s, i) => {
    place.compose(new THREE.Vector3(s.x, s.y, s.z), rot.setFromAxisAngle(up, s.yaw), new THREE.Vector3(s.w * s.scale, s.h * s.scale, s.d * s.scale));
    inst.setMatrixAt(i, place);
  });
  inst.instanceMatrix.needsUpdate = true;
  inst.castShadow = true;
  inst.frustumCulled = false; // it must still cast when its (invisible) body is off screen
  return { mesh: inst, triangles: (geo.attributes.position.count / 3) * spots.length };
}
