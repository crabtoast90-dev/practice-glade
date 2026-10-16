import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { heightAt } from './world.js';

const WALK_SPEED = 4.5; // metres per second
const TURN_SPEED = 2.2; // radians per second (keyboard turn)
const CAM_DIST = 6.5;
const CAM_HEIGHT = 1.6;
const PITCH_MIN = -0.35;
const PITCH_MAX = 0.9;
const WORLD_LIMIT = 120;

const MODEL_DIR = `${import.meta.env.BASE_URL}models/character/`;
const FADE = 0.25; // seconds to blend between idle and walk

// KayKit Ranger (CC0). The character file has no clips; idle and walk live in two shared-rig files.
export function createPlayer(scene) {
  const body = new THREE.Group(); // origin at the feet
  scene.add(body);

  const loader = new GLTFLoader();
  let mixer = null;
  const actions = {};
  let current = null;
  const load = (file) => loader.loadAsync(MODEL_DIR + file);
  Promise.all([load('Ranger.glb'), load('Rig_Medium_General.glb'), load('Rig_Medium_MovementBasic.glb')]).then(
    ([character, general, movement]) => {
      const model = character.scene;
      model.rotation.y = Math.PI; // model faces +Z; the game's 0 faces -Z
      model.traverse((o) => {
        if (o.isMesh) o.castShadow = true;
      });
      body.add(model);
      mixer = new THREE.AnimationMixer(model);
      const clip = (gltf, name) => THREE.AnimationClip.findByName(gltf.animations, name);
      actions.idle = mixer.clipAction(clip(general, 'Idle_A'));
      actions.walk = mixer.clipAction(clip(movement, 'Walking_A'));
      current = actions.idle;
      current.play();
      mixer.update(0); // pose the idle frame so it never shows a T-pose
      player.animation = 'idle';
    },
  );

  function play(name) {
    if (!mixer || player.animation === name) return;
    const next = actions[name];
    next.reset().play();
    current.crossFadeTo(next, FADE, false);
    current = next;
    player.animation = name;
  }

  const player = {
    mesh: body,
    position: new THREE.Vector3(0, 0, 0),
    facing: 0, // radians; 0 faces -Z
    camYaw: 0,
    camPitch: 0.18,
    moving: false,
    animation: 'loading', // idle | walk once the model is in
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
      body.position.copy(this.position);
      body.rotation.y = this.facing;
      play(this.moving ? 'walk' : 'idle');
      mixer?.update(dt);
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
