import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { heightAt } from './world.js';
import { createCameraRig } from './camera.js';

const WALK_SPEED = 4.5; // metres per second
const TURN_SPEED = 2.2; // radians per second (keyboard turn)
const SPRINT_SPEED = 13.5; // metres per second while Shift is held (3x walk, for fast playtesting)
const JUMP_SPEED = 6.2; // upward metres per second at take-off
const GRAVITY = 18;
const WORLD_LIMIT = 120;

const MODEL_DIR = `${import.meta.env.BASE_URL}models/character/`;
const FADE = 0.25; // seconds to blend between idle and walk

// KayKit Ranger (CC0). The character file has no clips; they live in two shared-rig files.
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
      actions.run = mixer.clipAction(clip(movement, 'Running_A'));
      actions.jump = mixer.clipAction(clip(movement, 'Jump_Start'));
      actions.jump.setLoop(THREE.LoopOnce, 1);
      actions.jump.clampWhenFinished = true;
      actions.air = mixer.clipAction(clip(movement, 'Jump_Idle'));
      current = actions.idle;
      current.play();
      mixer.update(0); // pose the idle frame so it never shows a T-pose
      player.animation = 'idle';
    },
  );

  let playedFor = 0; // seconds the current clip has been playing
  function play(name) {
    if (!mixer || player.animation === name) return;
    const next = actions[name];
    next.reset().play();
    current.crossFadeTo(next, name === 'jump' ? 0.08 : FADE, false);
    current = next;
    player.animation = name;
    playedFor = 0;
  }

  const cam = createCameraRig(scene);
  const player = {
    mesh: body,
    position: new THREE.Vector3(0, 0, 0),
    facing: 0, // radians; 0 faces -Z
    get camYaw() { return cam.yaw; },
    get camPitch() { return cam.pitch; },
    cam,
    moving: false,
    sprinting: false,
    airborne: false,
    vy: 0,
    animation: 'loading', // idle | walk | run | jump | air once the model is in
    update(dt, input) {
      cam.update(dt, this.position, input.consumeLook(), -input.turn * TURN_SPEED * dt);

      const { x, y } = input.move;
      const len = Math.min(1, Math.hypot(x, y));
      this.moving = len > 0.05;
      this.sprinting = this.moving && input.sprint;
      const speed = this.sprinting ? SPRINT_SPEED : WALK_SPEED;
      if (this.moving) {
        // Move relative to where the camera looks.
        const sin = Math.sin(cam.yaw);
        const cos = Math.cos(cam.yaw);
        const fx = -sin, fz = -cos; // camera forward on the ground
        const rx = cos, rz = -sin; // camera right
        const dx = (fx * y + rx * x) / Math.max(len, 1e-6) * len;
        const dz = (fz * y + rz * x) / Math.max(len, 1e-6) * len;
        this.position.x = THREE.MathUtils.clamp(this.position.x + dx * speed * dt, -WORLD_LIMIT, WORLD_LIMIT);
        this.position.z = THREE.MathUtils.clamp(this.position.z + dz * speed * dt, -WORLD_LIMIT, WORLD_LIMIT);
        const target = Math.atan2(-dx, -dz);
        let diff = target - this.facing;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.facing += diff * Math.min(1, dt * 10);
      }
      const jumpAsked = input.consumeJump?.();
      const ground = heightAt(this.position.x, this.position.z);
      if (jumpAsked && !this.airborne) {
        this.airborne = true;
        this.vy = JUMP_SPEED;
        this.position.y = Math.max(this.position.y, ground);
      }
      if (this.airborne) {
        this.vy -= GRAVITY * dt;
        this.position.y += this.vy * dt;
        if (this.position.y <= ground && this.vy <= 0) {
          this.position.y = ground;
          this.airborne = false;
          this.vy = 0;
        }
      } else {
        this.position.y = ground;
      }
      body.position.copy(this.position);
      body.rotation.y = this.facing;
      if (this.airborne) {
        // Take-off clip once, then the hanging pose until we land.
        if (this.animation !== 'jump' && this.animation !== 'air') play('jump');
        else if (this.animation === 'jump' && playedFor > 0.25) play('air');
      } else {
        play(this.sprinting ? 'run' : this.moving ? 'walk' : 'idle');
      }
      playedFor += dt;
      mixer?.update(dt);
    },
    placeCamera(camera) {
      if (!cam.ready) cam.update(0, this.position); // first frame, before any game step
      cam.place(camera);
    },
  };
  return player;
}
