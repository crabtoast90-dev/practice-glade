import * as THREE from 'three';
import { heightAt } from './world.js';

const WALK_SPEED = 4.5; // metres per second
const TURN_SPEED = 2.2; // radians per second (keyboard turn)
const CAM_DIST = 6.5;
const CAM_HEIGHT = 1.6;
const PITCH_MIN = -0.35;
const PITCH_MAX = 0.9;
const WORLD_LIMIT = 120;

// Placeholder capsule; Day 1 swaps in the CC0 animated character.
export function createPlayer(scene) {
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.35, 1.0, 4, 10),
    new THREE.MeshStandardMaterial({ color: '#b5462f', flatShading: true, roughness: 0.9 }),
  );
  body.castShadow = true;
  // A little "nose" so facing direction is visible.
  const nose = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.15, 0.25),
    new THREE.MeshStandardMaterial({ color: '#f1dcb0', flatShading: true }),
  );
  nose.position.set(0, 0.45, -0.35);
  body.add(nose);
  scene.add(body);

  const player = {
    mesh: body,
    position: new THREE.Vector3(0, 0, 0),
    facing: 0, // radians; 0 faces -Z
    camYaw: 0,
    camPitch: 0.18,
    moving: false,
    update(dt, input) {
      const look = input.consumeLook();
      this.camYaw += look.yaw - input.turn * TURN_SPEED * dt;
      this.camPitch = THREE.MathUtils.clamp(this.camPitch - look.pitch, PITCH_MIN, PITCH_MAX);

      const { x, y } = input.move;
      const len = Math.min(1, Math.hypot(x, y));
      this.moving = len > 0.05;
      if (this.moving) {
        // Move relative to where the camera looks.
        const sin = Math.sin(this.camYaw);
        const cos = Math.cos(this.camYaw);
        const fx = -sin, fz = -cos; // camera forward on the ground
        const rx = cos, rz = -sin; // camera right
        const dx = (fx * y + rx * x) / Math.max(len, 1e-6) * len;
        const dz = (fz * y + rz * x) / Math.max(len, 1e-6) * len;
        this.position.x = THREE.MathUtils.clamp(this.position.x + dx * WALK_SPEED * dt, -WORLD_LIMIT, WORLD_LIMIT);
        this.position.z = THREE.MathUtils.clamp(this.position.z + dz * WALK_SPEED * dt, -WORLD_LIMIT, WORLD_LIMIT);
        const target = Math.atan2(-dx, -dz);
        let diff = target - this.facing;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.facing += diff * Math.min(1, dt * 10);
      }
      this.position.y = heightAt(this.position.x, this.position.z);
      body.position.set(this.position.x, this.position.y + 0.85, this.position.z);
      body.rotation.y = this.facing;
    },
    placeCamera(camera) {
      const cp = Math.cos(this.camPitch);
      const pivot = new THREE.Vector3(this.position.x, this.position.y + CAM_HEIGHT, this.position.z);
      camera.position.set(
        pivot.x + Math.sin(this.camYaw) * cp * CAM_DIST,
        pivot.y + Math.sin(this.camPitch) * CAM_DIST,
        pivot.z + Math.cos(this.camYaw) * cp * CAM_DIST,
      );
      const groundY = heightAt(camera.position.x, camera.position.z) + 0.5;
      if (camera.position.y < groundY) camera.position.y = groundY;
      camera.lookAt(pivot);
    },
  };
  return player;
}
