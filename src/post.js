import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Light colour grade, done in linear light before tone mapping: warm highlights,
// teal shadows, a touch more contrast, a soft vignette.
const GradeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(c, c * vec3(0.86, 1.02, 1.10), 1.0 - smoothstep(0.0, 0.5, l));   // teal shadows
      c = mix(c, c * vec3(1.10, 1.0, 0.86), smoothstep(0.25, 1.2, l));         // warm highlights
      c = mix(vec3(l), c, 1.08);                                               // a little saturation
      float v = smoothstep(0.95, 0.35, distance(vUv, vec2(0.5)));
      c *= mix(0.78, 1.0, v);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

// Tiers: 'full' (bloom + grade), 'cheap' (half-resolution bloom, no extra
// buffers at full size; the phone default), 'off' (plain render, tone mapping only).
// ?post=full|cheap|off overrides the tier the quality level (src/quality.js) picks.
export function pickPostTier(params, quality) {
  const asked = params.get('post');
  if (asked === 'full' || asked === 'cheap' || asked === 'off') return asked;
  return quality.post;
}

export function createPost(renderer, scene, camera, tier) {
  if (tier === 'off') {
    return { tier, resize() {}, render: () => renderer.render(scene, camera) };
  }
  const cheap = tier === 'cheap';
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // Bloom threshold sits above sunlit ground, so only the sun and lit lanterns glow.
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), cheap ? 0.5 : 0.65, 0.7, 1.0);
  composer.addPass(bloom);
  composer.addPass(new ShaderPass(GradeShader));
  composer.addPass(new OutputPass()); // tone mapping + sRGB, from the renderer's settings

  return {
    tier,
    resize(w, h) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
      // Bloom works on a smaller copy of the picture; cheaper still on phones.
      const k = cheap ? 0.25 : 0.5;
      bloom.setSize(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)));
    },
    render: () => composer.render(),
  };
}
