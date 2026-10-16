import * as THREE from 'three';
import { LANTERN_SPOTS } from './level.js';
import { heightAt } from './world.js';

const FIND_RADIUS = 2.5; // metres from a lantern at which it counts as found
const UNLIT = new THREE.Color(0x3a3430);
const LIT = new THREE.Color(0xffb347);

// Five grey-box lanterns at the spots from level.js. Walking close lights one.
export function createLanterns(scene) {
  const items = LANTERN_SPOTS.map((spot) => {
    const group = new THREE.Group();
    group.position.set(spot.x, heightAt(spot.x, spot.z), spot.z);

    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.12), new THREE.MeshStandardMaterial({ color: 0x4a3a2c, flatShading: true }));
    post.position.y = 0.55;
    post.castShadow = true;
    const glassMat = new THREE.MeshStandardMaterial({ color: UNLIT, emissive: 0x000000, flatShading: true });
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.46, 0.36), glassMat);
    glass.position.y = 1.3;
    glass.castShadow = true;

    // A faint tall beam so a lit lantern can be seen across the valley; shown only at the ending.
    const beamMat = new THREE.MeshBasicMaterial({ color: LIT, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.9, 26, 10, 1, true), beamMat);
    beam.position.y = 13;
    beam.visible = false;

    group.add(post, glass, beam);
    scene.add(group);
    return { spot, group, glassMat, beamMat, beam, found: false };
  });

  function light(item, on) {
    item.found = on;
    item.glassMat.color.copy(on ? LIT : UNLIT);
    item.glassMat.emissive.copy(on ? LIT : new THREE.Color(0x000000));
    item.glassMat.emissiveIntensity = on ? 1.6 : 1;
  }

  return {
    total: items.length,
    get found() {
      return items.filter((i) => i.found).length;
    },
    foundIds() {
      return items.filter((i) => i.found).map((i) => i.spot.id);
    },
    // Light any lantern the player is standing near. Returns true if one was newly found.
    update(pos) {
      let newly = false;
      for (const item of items) {
        if (item.found) continue;
        if (Math.hypot(pos.x - item.spot.x, pos.z - item.spot.z) <= FIND_RADIUS) {
          light(item, true);
          newly = true;
        }
      }
      return newly;
    },
    // Ending: every lantern glows, with beams fading in as `amount` goes 0 to 1.
    glowAll(amount) {
      for (const item of items) {
        if (!item.found) light(item, true);
        item.beam.visible = amount > 0;
        item.beamMat.opacity = 0.22 * amount;
        item.glassMat.emissiveIntensity = 1.6 + 1.4 * amount;
      }
    },
    reset() {
      for (const item of items) {
        light(item, false);
        item.beam.visible = false;
        item.beamMat.opacity = 0;
      }
    },
  };
}
