import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { heightAt, ROCK_BLOCKERS } from './world.js';
import { START, BOUNDS, LANTERN_SPOTS, VISTA, pathMask } from './level.js';
import { rng, scatterPoints, instanceModel, instanceShadowProxy } from './scatter.js';

const MODEL_DIR = `${import.meta.env.BASE_URL}models/props/`;

// What goes in the valley. Trees, dead trees, bushes, grass and flowers are from the Quaternius
// "Ultimate Stylized Nature" pack (CC0); pines, rocks and the lantern are Meshy (tools/meshy-prop.sh).
// height: metres once placed. gap: minimum spacing. trunk: collision radius (trees block the player).
const KINDS = [
  { name: 'trees', files: ['birch_2', 'maple_1', 'maple_3'], height: [6, 10], count: 44, gap: 5, trunk: 0.5, shadow: 'blob' },
  { name: 'pines', files: ['pine_1', 'pine_2', 'pine_3'], height: [7, 11], count: 12, gap: 5, trunk: 0.5, shadow: 'cone' },
  { name: 'snags', files: ['dead_1', 'dead_3', 'dead_4'], height: [3, 5], count: 10, gap: 8, trunk: 0.4, shadow: 'stick' },
  { name: 'bushes', files: ['bush_1', 'bush_2', 'bush_3'], height: [0.9, 1.5], count: 50, gap: 2.5 },
  { name: 'grass', files: ['grass_1', 'grass_2'], height: [0.5, 0.9], count: 280, gap: 1.2 },
  { name: 'flowers', files: ['flower_2', 'flower_3', 'flower_4', 'flower_5'], height: [0.4, 0.7], count: 130, gap: 1.6 },
];

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
  // Farthest any part of the model reaches from its centre, sideways (native units): sizes rocks to their collision circle.
  holder.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  let reach = 0;
  holder.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      reach = Math.max(reach, Math.hypot(v.x, v.z));
    }
  });
  holder.userData.reach = reach;
  return holder;
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

    // Everything is instanced: one draw call per model and material, however many copies.
    const addAll = (templates, spotsByVariant, castShadow, chunks = 1) =>
      templates.forEach((t, i) => {
        const { group: g, triangles } = instanceModel(t, spotsByVariant[i], { castShadow, chunks, radius: BOUNDS.radius });
        group.add(g);
        stats.triangles += triangles;
      });
    const ground = (x, z) => heightAt(x, z) - 0.05;

    // Swap the grey-box rocks for the real ones, at the same spots, each sized to sit inside its collision circle.
    const greyRocks = scene.children.find((c) => c.isGroup && c.children.length && c.children.every((m) => m.geometry?.type === 'DodecahedronGeometry'));
    if (greyRocks) greyRocks.visible = false;
    const rockTemplates = rocks.map((r) => normalise(r, 1));
    const rockSpots = rockTemplates.map(() => []);
    ROCK_BLOCKERS.forEach((b, i) => {
      const k = i % rockTemplates.length;
      rockSpots[k].push({ x: b.x, y: ground(b.x, b.z), z: b.z, scale: (b.r * 1.05) / rockTemplates[k].userData.reach, yaw: i * 1.7 });
    });
    addAll(rockTemplates, rockSpots, false); // rocks skip casting shadows: it doubles their cost for little look
    stats.counts.rocks = ROCK_BLOCKERS.length;

    const rand = rng(20261016);
    const spotRocks = ROCK_BLOCKERS.slice(); // rocks only; trees pushed below are not checked against
    KINDS.forEach((kind, ki) => {
      const tpl = sets[ki].map((t) => normalise(t, 1));
      const spots = scatterPoints(rand, {
        count: kind.count,
        gap: kind.gap,
        radius: BOUNDS.radius * (kind.trunk ? 0.8 : 0.95), // trees stay off the wall so it can't snag the player
        minRadius: kind.trunk ? 14 : 0, // trees stay out of the middle so the start view is open
        reject: (x, z) => keepClear(x, z, kind.trunk ? 1.5 : 0) || spotRocks.some((b) => Math.hypot(x - b.x, z - b.z) < b.r + 1.2),
      });
      const byVariant = tpl.map(() => []);
      for (const p of spots) {
        const v = Math.floor(rand() * tpl.length);
        const h = kind.height[0] + rand() * (kind.height[1] - kind.height[0]);
        byVariant[v].push({ x: p.x, y: ground(p.x, p.z), z: p.z, scale: h * tpl[v].userData.unit, yaw: rand() * Math.PI * 2 });
        if (kind.trunk) ROCK_BLOCKERS.push({ x: p.x, z: p.z, r: kind.trunk, prop: true });
      }
      addAll(tpl, byVariant, false); // the detailed models skip the shadow pass; a cheap stand-in casts instead
      if (kind.shadow) {
        const all = byVariant.flatMap((list, v) => list.map((sp) => ({ ...sp, w: tpl[v].userData.size.x, h: tpl[v].userData.size.y, d: tpl[v].userData.size.z })));
        const proxy = instanceShadowProxy(all, kind.shadow);
        group.add(proxy.mesh);
        stats.triangles += proxy.triangles;
      }
      stats.counts[kind.name] = spots.length;
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
