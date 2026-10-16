import * as THREE from 'three';
import { pathMask, moundHeight, ROCKS, LANTERN_SPOTS, VISTA, START } from './level.js';

// Golden-hour palette. The Day 2 "look" session owns these numbers.
export const PALETTE = {
  skyTop: new THREE.Color('#1f5f68'),
  skyHorizon: new THREE.Color('#8fb7ad'),
  sunGlow: new THREE.Color('#ffc46b'),
  fog: new THREE.Color('#a9b9a0'),
  sun: new THREE.Color('#ffb36b'),
  hemiSky: new THREE.Color('#8a9fb8'),
  hemiGround: new THREE.Color('#b0603a'),
  ground: new THREE.Color('#c79a4a'),
  rock: new THREE.Color('#8a7a6e'),
  mountain: new THREE.Color('#4f7f86'),
};

// Low sun in front of the starting view (player starts facing -Z), so the
// first frame is backlit like the reference shots.
export const SUN_DIR = new THREE.Vector3(0.7, 0.18, -1).normalize();

// Deterministic valley: a bowl with steep walls, gentle rolls (flattened along
// paths), plus the hills and hollows from level.js.
export function heightAt(x, z) {
  const r = Math.hypot(x, z);
  const t = THREE.MathUtils.smoothstep(r, 55, 110);
  const bowl = t * 9;
  const roll = Math.sin(x * 0.08) * Math.cos(z * 0.07) * 1.2 + Math.sin((x + z) * 0.03) * 1.5;
  return roll * (1 - 0.8 * pathMask(x, z)) + bowl + moundHeight(x, z);
}

function makeSky() {
  const geo = new THREE.SphereGeometry(900, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: PALETTE.skyTop },
      horizon: { value: PALETTE.skyHorizon },
      glow: { value: PALETTE.sunGlow },
      sunDir: { value: SUN_DIR },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top, horizon, glow, sunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(horizon, top, pow(h, 0.55));
        float s = max(dot(d, sunDir), 0.0);
        col = mix(col, glow, pow(s, 6.0) * 0.85 * (1.0 - h * 0.6));
        col += glow * smoothstep(0.9993, 0.9997, s);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  return sky;
}

function makeGround() {
  const geo = new THREE.PlaneGeometry(400, 400, 200, 200);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const path = new THREE.Color('#f1e4b6');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
    c.copy(PALETTE.ground).lerp(path, pathMask(x, z)).toArray(colors, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, flatShading: true, roughness: 1 }));
  mesh.receiveShadow = true;
  return mesh;
}

// Distant low-poly ridges in rings, so the fog reads as layered haze.
function makeMountains() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: PALETTE.mountain, flatShading: true, roughness: 1 });
  const rings = [
    { r: 160, n: 14, h: 45 },
    { r: 260, n: 18, h: 80 },
    { r: 380, n: 22, h: 120 },
  ];
  rings.forEach((ring, ri) => {
    for (let i = 0; i < ring.n; i++) {
      const a = (i / ring.n) * Math.PI * 2 + ri * 0.4;
      const h = ring.h * (0.6 + 0.4 * Math.abs(Math.sin(i * 2.3 + ri)));
      const m = new THREE.Mesh(new THREE.ConeGeometry(h * 0.9, h, 5 + (i % 3)), mat);
      m.position.set(Math.cos(a) * ring.r, h / 2 - 4, Math.sin(a) * ring.r);
      m.rotation.y = i * 1.7;
      group.add(m);
    }
  });
  return group;
}

// A few grey-box boulders so movement and shadows are visible.
// Every rock on the map as [x, z, size], scattered ones first. Used for drawing and for collision.
const SCATTER_ROCKS = Array.from({ length: 24 }, (_, i) => {
  const a = i * 2.399;
  const r = 8 + (i * 7.3) % 40;
  return [Math.cos(a) * r, Math.sin(a) * r, 0.8 + (i % 5) * 0.5];
});
export const ROCK_BLOCKERS = [...SCATTER_ROCKS, ...ROCKS].map(([x, z, s]) => ({ x, z, r: s * 0.9 }));

// Push a position out of any rock it overlaps (mutates and returns it).
export function pushOutOfRocks(pos) {
  for (const b of ROCK_BLOCKERS) {
    const dx = pos.x - b.x, dz = pos.z - b.z;
    const d = Math.hypot(dx, dz);
    if (d < b.r) {
      const k = d > 1e-6 ? b.r / d : 0;
      pos.x = b.x + (d > 1e-6 ? dx * k : b.r);
      pos.z = b.z + (d > 1e-6 ? dz * k : 0);
    }
  }
  return pos;
}

function makeRocks() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: PALETTE.rock, flatShading: true, roughness: 1 });
  SCATTER_ROCKS.forEach(([x, z, s], i) => {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), mat);
    m.position.set(x, heightAt(x, z) + s * 0.4, z);
    m.rotation.set(i, i * 0.7, 0);
    m.scale.y = 0.7;
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  });
  ROCKS.forEach(([x, z, s], i) => {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), mat);
    m.position.set(x, heightAt(x, z) + s * 0.45, z);
    m.rotation.set(i * 1.3, i * 2.1, 0);
    m.scale.y = 1.1;
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  });
  return group;
}

// Tall coloured posts for the overhead check view only: red = lantern spot,
// blue = vista viewpoint, green = start. Hidden during play.
function makeMarkers() {
  const group = new THREE.Group();
  const post = (x, z, color) => {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(3.5, 3.5, 12, 12),
      new THREE.MeshBasicMaterial({ color, fog: false }),
    );
    m.position.set(x, heightAt(x, z) + 6, z);
    group.add(m);
  };
  LANTERN_SPOTS.forEach((s) => post(s.x, s.z, '#ff2a2a'));
  post(VISTA.camera.x, VISTA.camera.z, '#2a6cff');
  post(START.x, START.z, '#2aff5a');
  group.visible = false;
  return group;
}

export function createWorld(scene) {
  scene.background = PALETTE.skyHorizon;
  scene.fog = new THREE.Fog(PALETTE.fog, 25, 420);

  const hemi = new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 1.1);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(PALETTE.sun, 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const c = sun.shadow.camera;
  c.left = c.bottom = -30;
  c.right = c.top = 30;
  c.near = 1;
  c.far = 200;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  const markers = makeMarkers();
  scene.add(makeSky(), makeGround(), makeMountains(), makeRocks(), markers);

  return {
    sun,
    markers,
    // Keep the shadow box centred on the player so shadows stay sharp.
    follow(target) {
      sun.target.position.copy(target);
      sun.position.copy(target).addScaledVector(SUN_DIR, 100);
    },
  };
}
