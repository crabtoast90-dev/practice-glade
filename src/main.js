import * as THREE from 'three';
import { createClock, STEP } from './clock.js';
import { createInput } from './input.js';
import { createWorld, heightAt, pushOutOfRocks } from './world.js';
import { createPlayer } from './player.js';
import { createDebugOverlay } from './debug.js';
import { START, BOUNDS, LANTERN_SPOTS, clampToBounds } from './level.js';
import { createLanterns } from './lanterns.js';
import { createEnding } from './ending.js';
import { createAudio } from './audio.js';
import { createPost, pickPostTier } from './post.js';
import { createProps } from './props.js';

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
const post = createPost(renderer, scene, camera, pickPostTier(params));
const debug = DEBUG ? createDebugOverlay($('fps'), renderer) : null;

player.position.set(START.x, 0, START.z);

const props = createProps(scene);
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
  post.resize(w, h);
}
window.addEventListener('resize', resize);
resize();

// Tap to start: unlocks audio on phones (needs a user gesture) and shows the HUD.
let audio = null;
$('start').addEventListener('click', () => {
  audio = createAudio();
  audio.start();
  $('start').hidden = true;
  $('hud').hidden = false;
  if (matchMedia('(pointer: coarse)').matches) $('joystick').hidden = false;
  game.screen = 'playing';
});

function step(dt) {
  input.update();
  if (game.screen === 'playing') {
    player.update(dt, input);
    pushOutOfRocks(player.position);
    clampToBounds(player.position);
    audio?.update(dt, player);
    if (lanterns.update(player.position)) audio?.lanternFound();
    if (lanterns.found === LANTERN_TOTAL) {
      audio?.ending();
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
  post.render();
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
    player: { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), facingDeg: deg(player.facing), moving: player.moving, animation: player.animation, sprinting: player.sprinting, airborne: player.airborne },
    cameraYawDeg: deg(player.camYaw),
    camera: { distance: +player.cam.distance.toFixed(2), pitchDeg: deg(player.camPitch), pulledIn: player.cam.pulledIn, y: +camera.position.y.toFixed(2), groundBelow: +heightAt(camera.position.x, camera.position.z).toFixed(2) },
    audio: audio ? audio.status() : null,
    post: post.tier,
    lanterns: `${lanterns.found}/${LANTERN_TOTAL}`,
    lanternsFound: lanterns.foundIds(),
    props: { loaded: props.loaded, triangles: props.triangles, counts: props.counts },
    distFromCentre: +Math.hypot(p.x, p.z).toFixed(2),
  };
}
function audioText() {
  if (!audio) return 'not started';
  const a = audio.status();
  const failed = Object.entries(a.failed).map(([k, v]) => `${k} (${v})`);
  return `context ${a.state}, loaded ${a.loaded.length}/7${failed.length ? `, FAILED ${failed.join(', ')}` : ''}`;
}
function stateText() {
  const s = state();
  return [
    `screen: ${s.screen}`,
    `time: ${s.time}s (frame ${s.frame})`,
    `player: x=${s.player.x} y=${s.player.y} z=${s.player.z} facing=${s.player.facingDeg}deg moving=${s.player.moving} animation=${s.player.animation} sprinting=${s.player.sprinting} airborne=${s.player.airborne}`,
    `camera: yaw=${s.cameraYawDeg}deg pitch=${s.camera.pitchDeg}deg distance=${s.camera.distance}m pulledIn=${s.camera.pulledIn} height=${s.camera.y}m (ground below ${s.camera.groundBelow}m)`,
    `look: post-processing ${s.post}`,
    `lanterns: ${s.lanterns} (found: ${s.lanternsFound.join(',') || 'none'})`,
    `audio: ${audioText()}`,
    `props: ${s.props.loaded ? 'loaded' : 'loading'}, ${s.props.triangles} triangles (${Object.entries(s.props.counts).map(([k, v]) => `${v} ${k}`).join(', ')})`,
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
  // Test-only: stand somewhere and face a direction (degrees; pitch is camera elevation).
  teleport(x, z, yawDeg, pitchDeg) {
    player.position.set(x, heightAt(x, z), z);
    player.cam.yaw = THREE.MathUtils.degToRad(yawDeg);
    player.cam.pitch = THREE.MathUtils.degToRad(pitchDeg);
    player.cam.snap();
    player.update(0, input);
    render();
    return state();
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
