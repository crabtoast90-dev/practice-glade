// Sound: wind and birds loops, footsteps, a lantern chime, an ending swell.
// Created inside the tap-to-start click so phones allow it to play.
const FILES = {
  wind: 'wind.ogg',
  birds: 'birds.ogg',
  step0: 'step0.ogg',
  step1: 'step1.ogg',
  step2: 'step2.ogg',
  chime: 'chime.ogg',
  swell: 'swell.ogg',
};

export function createAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = Ctx ? new Ctx() : null;
  const buffers = {};
  const failed = {};
  const playing = {};
  let master = null;
  let stepClock = 0;
  let stepCount = 0;
  let seed = 12345; // seeded so footsteps sound the same every run

  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  function play(name, { gain = 1, rate = 1, loop = false } = {}) {
    if (!ctx || !buffers[name]) return;
    const src = ctx.createBufferSource();
    src.buffer = buffers[name];
    src.loop = loop;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(master);
    src.start();
    playing[name] = (playing[name] || 0) + 1;
    src.onended = () => { playing[name] -= 1; };
  }

  async function load(name) {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}audio/${FILES[name]}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      buffers[name] = await ctx.decodeAudioData(await res.arrayBuffer());
    } catch (err) {
      failed[name] = String(err.message || err);
    }
  }

  return {
    // Call from the start tap: unlocks audio, loads everything, then starts the ambience.
    async start() {
      if (!ctx) return;
      master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(ctx.destination);
      await ctx.resume();
      await Promise.all(Object.keys(FILES).map(load));
      play('wind', { gain: 0.35, loop: true });
      play('birds', { gain: 0.5, loop: true });
    },
    // Footsteps follow the game clock while the player walks or runs on the ground.
    update(dt, player) {
      if (!player.moving || player.airborne) {
        stepClock = 0.25; // first step lands quickly after setting off
        return;
      }
      stepClock -= dt;
      if (stepClock > 0) return;
      stepClock = player.sprinting ? 0.3 : 0.5;
      play(`step${stepCount++ % 3}`, { gain: 0.35, rate: 0.9 + rand() * 0.2 });
    },
    lanternFound() {
      play('chime', { gain: 0.6 });
    },
    ending() {
      play('swell', { gain: 0.8 });
    },
    // For stateText(): proves the context is running and each sound loaded.
    status() {
      if (!ctx) return { state: 'unsupported', loaded: [], failed: {} };
      return { state: ctx.state, loaded: Object.keys(buffers), failed: { ...failed } };
    },
  };
}
