// Valley layout: every position in the level lives here. Grey boxes only.
// Pure data and maths (no three.js), so world, lanterns and ending can all import it.

export const START = { x: 0, z: 0 };

// Walkable area: a circle. The terrain wall rises well before this radius.
export const BOUNDS = { radius: 92 };

// The end vista: a hill with a viewpoint on top. `height` is metres above the ground.
export const VISTA = {
  hill: { x: 42, z: -58, r: 22, h: 15 },
  camera: { x: 42, z: -58, height: 5 },
  lookAt: { x: -6, z: 14, height: 3 },
};

// Raised or lowered ground. `flat` is the fraction of the radius kept flat on top.
export const MOUNDS = [
  { ...VISTA.hill, flat: 0.25 },
  { x: -62, z: -8, r: 11, h: 7, flat: 0.6 }, // ledge on the west wall
  { x: 30, z: 28, r: 13, h: -4, flat: 0.35 }, // hollow
];

// Five hidden lanterns. `hint` says how each is hidden.
export const LANTERN_SPOTS = [
  { id: 1, x: -26, z: -22, hint: 'behind a rock cluster near the start' },
  { id: 2, x: -62, z: -8, hint: 'on a ledge up the west wall' },
  { id: 3, x: 30, z: 28, hint: 'in a hollow to the south-east' },
  { id: 4, x: 8, z: 62, hint: 'tucked behind rocks at the end of the south path' },
  { id: 5, x: 53, z: -71, hint: 'on the back slope of the vista hill' },
];

// Rocks that hide the spots (x, z, size). Ordinary scatter lives in world.js.
export const ROCKS = [
  [-23, -19, 2.4],
  [-22, -23, 2.0],
  [-25, -18, 1.6],
  [5, 59, 2.6],
  [11, 60, 2.2],
  [8, 65, 2.8],
  [-60, -3, 1.4],
];

// Paths as polylines from the start. They flatten and tint the ground.
export const PATHS = [
  [[0, 0], [-10, -8], [-26, -17], [-45, -14], [-62, -8]],
  [[0, 0], [14, 14], [30, 22]],
  [[0, 0], [2, 30], [6, 50], [8, 60]],
  [[0, 0], [18, -30], [38, -46], [52, -66]],
];
const PATH_HALF_WIDTH = 1.8;
const PATH_FADE = 2.2;

function distToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

// 1 on a path, fading to 0 just beside it.
export function pathMask(x, z) {
  let best = Infinity;
  for (const path of PATHS) {
    for (let i = 0; i < path.length - 1; i++) {
      best = Math.min(best, distToSegment(x, z, path[i][0], path[i][1], path[i + 1][0], path[i + 1][1]));
    }
  }
  const t = Math.min(1, Math.max(0, (best - PATH_HALF_WIDTH) / PATH_FADE));
  return 1 - t * t * (3 - 2 * t);
}

// Height added by mounds and hollows at (x, z).
export function moundHeight(x, z) {
  let h = 0;
  for (const m of MOUNDS) {
    const d = Math.hypot(x - m.x, z - m.z) / m.r;
    if (d >= 1) continue;
    const t = Math.min(1, Math.max(0, (1 - d) / (1 - m.flat)));
    h += m.h * t * t * (3 - 2 * t);
  }
  return h;
}

// Pull a position back inside the walkable circle (mutates and returns it).
export function clampToBounds(pos) {
  const r = Math.hypot(pos.x, pos.z);
  if (r > BOUNDS.radius) {
    pos.x *= BOUNDS.radius / r;
    pos.z *= BOUNDS.radius / r;
  }
  return pos;
}
