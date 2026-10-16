import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { heightAt, ROCK_BLOCKERS } from './world.js';
import { START, BOUNDS, LANTERN_SPOTS, VISTA, pathMask } from './level.js';

const MODEL_DIR = `${import.meta.env.BASE_URL}models/props/`;

// What goes in the valley. Trees, dead trees, bushes, grass and flowers are from the Quaternius
// "Ultimate Stylized Nature" pack (CC0); pines, rocks and the lantern are Meshy (tools/meshy-prop.sh).
// height: metres once placed. gap: minimum spacing. trunk: collision radius (trees block the player).
const KINDS = [
  { name: 'trees', files: ['birch_1', 'birch_2', 'birch_3', 'maple_1', 'maple_2', 'maple_3', 'maple_4'], height: [6, 10], count: 28, gap: 6, trunk: 0.5, shadow: true },
  { name: 'pines', files: ['pine_1', 'pine_2', 'pine_3'], height: [7, 11], count: 14, gap: 6, trunk: 0.5, shadow: true },
  { name: 'snags', files: ['dead_1', 'dead_2', 'dead_3', 'dead_4', 'dead_5'], height: [3, 5], count: 10, gap: 10, trunk: 0.4, shadow: true },
  { name: 'bushes', files: ['bush_1', 'bush_2', 'bush_3'], height: [0.9, 1.5], count: 46, gap: 3, shadow: true },
  { name: 'grass', files: ['grass_1', 'grass_2', 'grass_3'], height: [0.5, 0.9], count: 150, gap: 1.6 },
  { name: 'flowers', files: ['flower_1', 'flower_2', 'flower_3', 'flower_4', 'flower_5'], height: [0.4, 0.7], count: 90, gap: 2.2 },
];

// Seeded so every run (and every check screenshot) places the same props.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Stand a loaded model on y=0, centred, scaled to a target height.
function normalise(root, height) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  const holder = new THREE.Group();
  root.position.set(-c.x, -box.min.y, -c.z);
  holder.add(root);
  holder.userData.unit = height / size.y; // scale per metre of target height
  holder.userData.size = size;
  return holder;
}

function countTriangles(root) {
  let n = 0;
  root.traverse((o) => {
    if (o.isMesh) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
  });
  return n;
}

// Props placed along the layout from level.js.
// Pines and snags also block the player, using the same push-out list as rocks.
export function createProps(scene) {
  const group = new THREE.Group();
  group.name = 'props';
  scene.add(group);
  const stats = { triangles: 0, counts: {}, ready: false };
  const loader = new GLTFLoader();
  const load = (file) => loader.loadAsync(`${MODEL_DIR}${file}.glb`);

  // Keep clear of the start, paths, lantern spots and the vista viewpoint.
  const keepClear = (x, z, margin) => {
    if (Math.hypot(x - START.x, z - START.z) < 7 + margin) return true;
    if (pathMask(x, z) > 0.02) return true;
    for (const s of LANTERN_SPOTS) if (Math.hypot(x - s.x, z - s.z) < 5 + margin) return true;
    if (Math.hypot(x - VISTA.camera.x, z - VISTA.camera.z) < 5 + margin) return true;
    return false;
  };

  const place = (template, x, z, scale, yaw, castShadow) => {
    const inst = template.clone(true);
    inst.position.set(x, heightAt(x, z) - 0.05, z);
    inst.rotation.y = yaw;
    inst.scale.setScalar(scale);
    if (castShadow) inst.traverse((o) => (o.isMesh ? (o.castShadow = o.receiveShadow = true) : null));
    group.add(inst);
    stats.triangles += countTriangles(inst);
  };

  const prepare = async (files) => {
    const gltfs = await Promise.all(files.map(load));
    return gltfs.map((g) => {
      g.scene.traverse((o) => {
        if (o.isMesh && o.material) {
          o.material.metalness = 0;
          o.material.roughness = 1;
        }
      });
      return g.scene;
    });
  };

  const ready = (async () => {
    const rockFiles = ['rock_1', 'rock_2', 'rock_3'];
    const [rocks, ...sets] = await Promise.all([prepare(rockFiles), ...KINDS.map((k) => prepare(k.files))]);

    // Swap the grey-box rocks for the real ones, at the same spots and sizes (so collision still fits).
    const greyRocks = scene.children.find((c) => c.isGroup && c.children.length && c.children.every((m) => m.geometry?.type === 'DodecahedronGeometry'));
    if (greyRocks) greyRocks.visible = false;
    const rockTemplates = rocks.map((r) => normalise(r, 1));
    ROCK_BLOCKERS.forEach((b, i) => {
      const t = rockTemplates[i % rockTemplates.length];
      place(t, b.x, b.z, (b.r / 0.9) * 1.1 * t.userData.unit, i * 1.7, true); // about as tall as the grey rock was
    });
    stats.counts.rocks = ROCK_BLOCKERS.length;

    const rand = rng(20261016);
    const spotRocks = ROCK_BLOCKERS.slice(); // rocks only; trees pushed below are not checked against
    KINDS.forEach((kind, ki) => {
      const tpl = sets[ki].map((t) => normalise(t, 1));
      const placed = [];
      let tries = 0;
      while (placed.length < kind.count && tries++ < 6000) {
        const a = rand() * Math.PI * 2;
        const r = Math.sqrt(rand()) * BOUNDS.radius * 0.95;
        if (kind.trunk && r < 14) continue; // trees stay out of the middle so the start view is open
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        if (keepClear(x, z, kind.trunk ? 1.5 : 0)) continue;
        if (spotRocks.some((b) => Math.hypot(x - b.x, z - b.z) < b.r + 1.2)) continue;
        if (placed.some((p) => Math.hypot(x - p[0], z - p[1]) < kind.gap)) continue;
        const t = tpl[Math.floor(rand() * tpl.length)];
        const h = kind.height[0] + rand() * (kind.height[1] - kind.height[0]);
        place(t, x, z, h * t.userData.unit, rand() * Math.PI * 2, kind.shadow);
        placed.push([x, z]);
        if (kind.trunk) ROCK_BLOCKERS.push({ x, z, r: kind.trunk, prop: true });
      }
      stats.counts[kind.name] = placed.length;
    });
    stats.ready = true;
  })();

  return {
    group,
    ready,
    get triangles() {
      return Math.round(stats.triangles);
    },
    get counts() {
      return stats.counts;
    },
    get loaded() {
      return stats.ready;
    },
  };
}

// One lantern model, ready to clone (used by the lanterns once they swap their grey boxes).
export async function loadLanternModel() {
  const g = await new GLTFLoader().loadAsync(`${MODEL_DIR}lantern.glb`);
  return normalise(g.scene, 1.6);
}
