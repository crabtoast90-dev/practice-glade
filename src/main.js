import * as THREE from 'three';
import { createClock, STEP } from './clock.js';
import { createInput } from './input.js';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createDebugOverlay } from './debug.js';
import { START, BOUNDS, LANTERN_SPOTS, clampToBounds } from './level.js';
import { createLanterns } from './lanterns.js';
import { createEnding } from './ending.js';

const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const DEBUG = params.has('debug');

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

player.position.set(START.x, 0, START.z);

const lanterns = createLanterns(scene);
const LANTERN_TOTAL = lanterns.total;
const ending = createEnding({ lanterns, onPlayAgain: playAgain });
const game = { screen: 'start', overhead: false };
const NO_INPUT = { consumeLook: () => ({ yaw: 0, pitch: 0 }), turn: 0, move: { x: 0, y: 0 } };

function playAgain() {
  lanterns.reset();
  ending.reset();
  player.position.set(START.x, 0, START.z);
  game.screen = 'playing';
}

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
  if (game.screen === 'playing') {
    player.update(dt, input);
    clampToBounds(player.position);
    lanterns.update(player.position);
    if (lanterns.found === LANTERN_TOTAL) {
      // Controls lock; the camera leaves from where the player was looking.
      player.placeCamera(camera);
      ending.start(camera, new THREE.Vector3(player.position.x, player.position.y + 1.6, player.position.z));
      game.screen = 'ending';
    }
  } else if (game.screen === 'ending') {
    player.update(dt, NO_INPUT); // stand still, idle animation
    ending.update(dt);
    game.screen = ending.screen === 'end' ? 'end' : 'ending';
  }
  clock.tick(dt);
}

// Test-only: look straight down on the whole valley with the spots marked.
const savedFog = scene.fog;
function setOverhead(on) {
  game.overhead = on;
  world.markers.visible = on;
  scene.fog = on ? null : savedFog;
}

function render() {
  if (game.overhead) {
    camera.position.set(0, 270, 0);
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0);
  } else {
    camera.up.set(0, 1, 0);
    if (game.screen === 'ending' || game.screen === 'end') ending.placeCamera(camera);
    else player.placeCamera(camera);
  }
  world.follow(player.position);
  $('lanterns').textContent = `${lanterns.found} / ${LANTERN_TOTAL}`;
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
    player: { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), facingDeg: deg(player.facing), moving: player.moving, animation: player.animation },
    cameraYawDeg: deg(player.camYaw),
    lanterns: `${lanterns.found}/${LANTERN_TOTAL}`,
    lanternsFound: lanterns.foundIds(),
    distFromCentre: +Math.hypot(p.x, p.z).toFixed(2),
  };
}
function stateText() {
  const s = state();
  return [
    `screen: ${s.screen}`,
    `time: ${s.time}s (frame ${s.frame})`,
    `player: x=${s.player.x} y=${s.player.y} z=${s.player.z} facing=${s.player.facingDeg}deg moving=${s.player.moving} animation=${s.player.animation}`,
    `camera yaw: ${s.cameraYawDeg}deg`,
    `lanterns: ${s.lanterns} (found: ${s.lanternsFound.join(',') || 'none'})`,
    `valley: ${LANTERN_SPOTS.length} lantern spots, walkable radius ${BOUNDS.radius}m, player ${s.distFromCentre}m from centre`,
  ].join('\n');
}

window.__game = {
  test: TEST,
  state,
  stateText,
  // Test-only: stand on a lantern so it is found on the next step.
  teleportToLantern(id) {
    if (!TEST) return;
    const spot = LANTERN_SPOTS.find((l) => l.id === id);
    player.position.set(spot.x, 0, spot.z);
  },
  overhead(on) {
    setOverhead(on);
    render();
  },
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
