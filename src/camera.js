import * as THREE from 'three';
import { heightAt } from './world.js';

const DIST = 6.5; // preferred distance behind the player
const HEIGHT = 1.6; // pivot height above the feet
const PITCH_MIN = -0.35;
const PITCH_MAX = 0.9;
const MIN_DIST = 0.9; // closest the camera may be pulled in
const MARGIN = 0.5; // gap kept between camera and anything it would touch
const FOLLOW_XZ = 12; // how fast the pivot catches up sideways (1/s)
const FOLLOW_Y = 7; // slower vertically, so jumps and slopes don't bob the view
const EASE_OUT = 4; // how fast the camera drifts back out after being pushed in (1/s)

// Third-person follow camera. Owns yaw and pitch; `update` runs in the game step,
// `place` positions the real camera each frame.
export function createCameraRig(scene) {
  const pivot = new THREE.Vector3();
  const wanted = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  let colliders = null; // boulders; found once the world exists
  let dist = DIST;
  let started = false;

  function findColliders() {
    colliders = [];
    scene.traverse((o) => {
      if (o.isMesh && o.geometry.type === 'DodecahedronGeometry') colliders.push(o);
    });
    scene.updateMatrixWorld(true);
  }

  // Free distance along the line from the pivot toward `dir`, up to `max`.
  function clearDistance(max) {
    let best = max;
    // Several rays (centre and four sides) so a rock edge can't slip into the lens.
    right.set(dir.z, 0, -dir.x).normalize();
    up.crossVectors(dir, right).normalize();
    for (const [a, b] of [[0, 0], [0.35, 0], [-0.35, 0], [0, 0.35], [0, -0.35]]) {
      origin.copy(pivot).addScaledVector(right, a).addScaledVector(up, b);
      raycaster.set(origin, dir);
      raycaster.far = max;
      const hit = raycaster.intersectObjects(colliders, false)[0];
      if (hit) best = Math.min(best, hit.distance - MARGIN);
    }
    // Ground: walk along the line until it dips below the terrain.
    for (let d = 0.5; d <= best; d += 0.5) {
      const x = pivot.x + dir.x * d;
      const z = pivot.z + dir.z * d;
      if (pivot.y + dir.y * d < heightAt(x, z) + MARGIN) {
        best = Math.max(0, d - 0.5);
        break;
      }
    }
    return Math.max(MIN_DIST, best);
  }

  const rig = {
    yaw: 0,
    pitch: 0.18,
    distance: DIST, // current distance, for the state summary
    get ready() { return started; },
    pulledIn: false, // true while something is in the way
    update(dt, target, look = { yaw: 0, pitch: 0 }, keyTurn = 0) {
      this.yaw += look.yaw + keyTurn;
      this.pitch = THREE.MathUtils.clamp(this.pitch - look.pitch, PITCH_MIN, PITCH_MAX);
      if (!colliders) findColliders();

      const ty = target.y + HEIGHT;
      if (!started) {
        pivot.set(target.x, ty, target.z);
        started = true;
      } else {
        const kxz = 1 - Math.exp(-FOLLOW_XZ * dt);
        const ky = 1 - Math.exp(-FOLLOW_Y * dt);
        pivot.x += (target.x - pivot.x) * kxz;
        pivot.z += (target.z - pivot.z) * kxz;
        pivot.y += (ty - pivot.y) * ky;
      }

      const cp = Math.cos(this.pitch);
      dir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
      const free = clearDistance(DIST);
      // Pull in at once (never clip), drift back out gently.
      dist = free < dist ? free : dist + (free - dist) * (1 - Math.exp(-EASE_OUT * dt));
      this.distance = dist;
      this.pulledIn = free < DIST - 0.05;
      wanted.copy(pivot).addScaledVector(dir, dist);
      const floor = heightAt(wanted.x, wanted.z) + 0.4;
      if (wanted.y < floor) wanted.y = floor;
    },
    // Jump straight to the target position (teleports, first frame).
    snap() {
      started = false;
      dist = DIST;
    },
    place(camera) {
      camera.position.copy(wanted);
      camera.lookAt(pivot);
    },
  };
  return rig;
}
