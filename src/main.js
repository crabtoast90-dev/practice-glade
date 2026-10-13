import * as THREE from 'three';
import { createClock, STEP } from './clock.js';
import { createInput } from './input.js';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createDebugOverlay } from './debug.js';

const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const DEBUG = params.has('debug');
const LANTERN_TOTAL = 5;

const $ = (id) => document.getElementById(id);
const canvas = $('game');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: TEST });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1200);
const world = createWorld(scene);
const player = createPlayer(scene);
const input = createInput(canvas, $('joystick'), $('stick'));
const clock = createClock({ manual: TEST });
const debug = DEBUG ? createDebugOverlay($('fps'), renderer) : null;

const game = { screen: 'start', lanternsFound: 0 };

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// Tap to start: unlocks audio on phones (needs a user gesture) and shows the HUD.
let audioCtx = null;
$('start').addEventListener('click', () => {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = audioCtx.createBufferSource();
    src.buffer = audioCtx.createBuffer(1, 1, 22050);
    src.connect(audioCtx.destination);
    src.start();
    audioCtx.resume();
  } catch {
    // No audio available; the game still runs.
  }
  $('start').hidden = true;
  $('hud').hidden = false;
  if (matchMedia('(pointer: coarse)').matches) $('joystick').hidden = false;
  game.screen = 'playing';
});

function step(dt) {
  input.update();
  if (game.screen === 'playing') player.update(dt, input);
  clock.tick(dt);
}

function render() {
  player.placeCamera(camera);
  world.follow(player.position);
  $('lanterns').textContent = `${game.lanternsFound} / ${LANTERN_TOTAL}`;
  renderer.render(scene, camera);
  debug?.frame();
}

// Plain-text summary of game state, read by the check script.
function state() {
  const p = player.position;
  const deg = (r) => Math.round(THREE.MathUtils.radToDeg(r));
  return {
    screen: game.screen,
    time: +clock.time.toFixed(3),
    frame: clock.frame,
    player: { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), facingDeg: deg(player.facing), moving: player.moving },
    cameraYawDeg: deg(player.camYaw),
    lanterns: `${game.lanternsFound}/${LANTERN_TOTAL}`,
  };
}
function stateText() {
  const s = state();
  return [
    `screen: ${s.screen}`,
    `time: ${s.time}s (frame ${s.frame})`,
    `player: x=${s.player.x} y=${s.player.y} z=${s.player.z} facing=${s.player.facingDeg}deg moving=${s.player.moving}`,
    `camera yaw: ${s.cameraYawDeg}deg`,
    `lanterns: ${s.lanterns}`,
  ].join('\n');
}

window.__game = {
  test: TEST,
  state,
  stateText,
  // Test clock: advance simulated time in fixed steps, then draw one frame.
  advance(ms) {
    const n = Math.round(ms / 1000 / STEP);
    for (let i = 0; i < n; i++) step(STEP);
    render();
    return state();
  },
};

if (TEST) {
  render();
} else {
  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    step(dt);
    render();
  });
}
