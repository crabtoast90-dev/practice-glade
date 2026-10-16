import * as THREE from 'three';
import { VISTA } from './level.js';
import { heightAt } from './world.js';

const RISE_SECONDS = 5;
const GLOW_START = 0.5; // fraction of the rise at which the beams begin to fade in
const smooth = (t) => t * t * (3 - 2 * t);

const CSS = `
#ending { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 1rem;
  padding-bottom: 12vh; pointer-events: none; color: #fff4dc; font-family: Georgia, serif; opacity: 0; transition: opacity 2s ease; }
#ending.show { opacity: 1; pointer-events: auto; }
#ending .title { font-size: clamp(2rem, 7vw, 4rem); letter-spacing: .08em; text-shadow: 0 2px 14px rgba(0,0,0,.55); }
#ending button { border: 1px solid rgba(255,244,220,.6); background: rgba(20,40,44,.35); color: inherit; font: 1.1rem Georgia, serif;
  padding: .6rem 1.6rem; border-radius: 2rem; cursor: pointer; }
`;

// The ending: controls lock, the camera rises to the vista, the lanterns glow, then "The End".
// screen goes playing -> ending (camera rising) -> end (overlay shown).
export function createEnding({ lanterns, onPlayAgain }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);

  const overlay = document.createElement('div');
  overlay.id = 'ending';
  overlay.hidden = true;
  overlay.innerHTML = '<span class="title">The End</span><button type="button">Play again</button>';
  document.body.append(overlay);
  overlay.querySelector('button').addEventListener('click', () => onPlayAgain());

  const from = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  const to = {
    pos: new THREE.Vector3(VISTA.camera.x, heightAt(VISTA.camera.x, VISTA.camera.z) + VISTA.camera.height, VISTA.camera.z),
    look: new THREE.Vector3(VISTA.lookAt.x, heightAt(VISTA.lookAt.x, VISTA.lookAt.z) + VISTA.lookAt.height, VISTA.lookAt.z),
  };
  let t = 0;

  return {
    screen: 'idle', // idle | ending | end
    // Start from the gameplay camera's current position and target.
    start(camera, target) {
      this.screen = 'ending';
      t = 0;
      from.pos.copy(camera.position);
      from.look.copy(target);
    },
    update(dt) {
      if (this.screen !== 'ending') return;
      t += dt;
      lanterns.glowAll(THREE.MathUtils.clamp((t / RISE_SECONDS - GLOW_START) / (1 - GLOW_START), 0, 1));
      if (t >= RISE_SECONDS) {
        this.screen = 'end';
        overlay.hidden = false;
        requestAnimationFrame(() => overlay.classList.add('show'));
      }
    },
    placeCamera(camera) {
      const k = smooth(Math.min(1, t / RISE_SECONDS));
      camera.position.lerpVectors(from.pos, to.pos, k);
      camera.lookAt(new THREE.Vector3().lerpVectors(from.look, to.look, k));
    },
    reset() {
      this.screen = 'idle';
      t = 0;
      overlay.classList.remove('show');
      overlay.hidden = true;
    },
  };
}
