# Session log

date | session | directing min | reviewing min | playing min | shipped/killed | usage cap hit | fun 1-5 | look 1-5 | notes
--- | --- | --- | --- | --- | --- | --- | --- | --- | ---
2026-10-13 | 0 setup | 5 | 1 | 1 | shipped (setup: blank scene, check, deploy, 3 style frames, plan) | no | 1 | 1 | ~8 min build time; check passes locally and on the live link; no blockers
2026-10-16 | 1A character | 0 | 0 | 1 | shipped (KayKit Ranger, idle/walk blend) | no | 1 | 2 | check passes locally; no blockers
2026-10-16 | 1B valley layout | 2 | 2 | 2 | shipped (bowl, paths, vista hill, 5 lantern spots, bounds; plus two playtest fixes: lower wall, visible paths) | no | 1 | 2 | check passes locally; also touched main.js and check.mjs for the done-check
2026-10-16 | 1C lanterns and ending | 0 | 1 | 2 | shipped (5 lanterns, vista ending, end screen; then playtest fixes: rock collision, 3x sprint) | no | 2 | 2 | check passes locally
2026-10-16 | 1D controls and camera | 0 | 0.5 | 0.3 | shipped (rock-safe follow camera, sprint, jump, phone jump button, joystick dead zone) | no | 2 | 2 | sprint raised to 3x walk by a parallel session; also touched main.js, check.mjs for the done-check
2026-10-16 | 2D sound | 0 | 0 | 1 | shipped (wind and birds loops, footsteps, lantern chime, ending swell) | no | 2.3 | 2 | check passes locally; also touched main.js, check.mjs for the done-check
2026-10-16 | 2A look | 0 | 0.5 | 0.3 | shipped (golden-hour sky, layered haze, soft shadows, bloom and grade, shared palette) | no | 2.3 | 2.2 | check passes locally; user: changes only mildly noticeable, look should jump once trees and props land; also touched main.js, check.mjs for the done-check
2026-10-16 | 2B props | 0 | 1 | 1 | shipped (Meshy pines, snags, rocks, grass, flowers; lantern model made but not wired in) | no | 2.3 | 2.5 | check passes locally; CC0 packs unreachable from cloud (see FRICTION.md); user: fine but not very high quality and sparsely populated; also touched main.js, check.mjs for the done-check
2026-10-16 | 2C vegetation scatter and budget | 0 | 0.5 | 0.5 | shipped (Quaternius CC0 pack swap, instanced seeded scatter, cheap tree shadows; 92 draw calls / 270k tris at start, 94 / 261k at vista) | no | 2.3 | 2.7 | check passes locally; user: looks solid; flat rocks still clip slightly; ground mesh ~80k tris; also touched main.js, check.mjs
