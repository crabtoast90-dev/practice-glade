import * as THREE from 'three';

// Golden-hour palette: the one set of colours everything draws from.
export const PALETTE = {
  skyTop: new THREE.Color('#1c6670'),
  skyMid: new THREE.Color('#3f8f94'),
  skyHorizon: new THREE.Color('#a7c3a6'),
  sunGlow: new THREE.Color('#ffc46b'),
  sunCore: new THREE.Color('#ffe9b0'),
  fog: new THREE.Color('#86aea8'),
  sun: new THREE.Color('#ffae5c'),
  hemiSky: new THREE.Color('#6fa3aa'),
  hemiGround: new THREE.Color('#a8683c'),
  ground: new THREE.Color('#c08a3e'),
  path: new THREE.Color('#e8c98e'),
  rock: new THREE.Color('#9a8c80'),
  // Ridge rings, near to far: deeper teal close up, paler and bluer with distance.
  ridgeNear: new THREE.Color('#2c5d64'),
  ridgeMid: new THREE.Color('#4b8088'),
  ridgeFar: new THREE.Color('#7fa9aa'),
};

// Distance haze with a height term: thicker in the valley floor, thinner up the
// slopes. Patched into a standard material's fog chunk; needs scene.fog (exp2).
export function applyHaze(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <fog_pars_vertex>', '#include <fog_pars_vertex>\nvarying float vHazeY;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvHazeY = (modelMatrix * vec4(transformed, 1.0)).y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\nvarying float vHazeY;')
      .replace(
        '#include <fog_fragment>',
        /* glsl */ `
        #ifdef USE_FOG
          float hz = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          hz = clamp(hz * mix(1.3, 0.6, smoothstep(0.0, 35.0, vHazeY)), 0.0, 1.0);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, hz);
        #endif`,
      );
  };
  return material;
}

// Flat-shaded, fully rough materials, all from the palette. `color` is a
// palette name or any THREE.Color; `vertexColors` for painted terrain.
export function makeMaterial(color, options = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color: typeof color === 'string' ? PALETTE[color] : color,
    flatShading: true,
    roughness: 1,
    metalness: 0,
    ...options,
  });
  return applyHaze(mat);
}
