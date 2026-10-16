# Plan

Each item can be pasted alone into a fresh builder session. Every session reads CLAUDE.md first, follows the merge rule, and adds steps to `npm run check` for what it builds.

**Parallel lanes:** items marked with the same lane letter touch different files and can run at the same time. An item marked "after X" waits for X to be merged.

## Day 0: setup (done 2026-10-13)
- [x] Scaffold, blank scene (ground, sky, low sun, shadows, fog, capsule), self-check, Pages deploy, three style frames, docs.

## Day 1: grey box

- [x] **1A. Character.** Lane A. Replace the placeholder capsule with a free CC0 animated character (Quaternius "Universal Animation Library" or a KayKit character pack, GLB). Idle when still, walk when moving, blended; faces the movement direction; feet on the ground. Put the model in `public/models/character/`, add it to `CREDITS.md` with its license link. Files: `src/player.js`, `public/models/character/`, `CREDITS.md`.
  *Done when:* the check's screenshots show the character mid-walk on laptop and phone, `stateText()` reports the current animation, no console errors.

- [x] **1B. Valley layout.** Lane B. Shape the grey-box valley: a walkable bowl with a few paths, raised edges the player can't leave, one hill for the end vista, and five lantern spots that are hidden but findable (behind rocks, on a ledge, in a hollow, etc.). All positions live in one file. Grey boxes only, no art. Files: `src/world.js` (`heightAt` and terrain), new `src/level.js` (lantern spots, vista viewpoint, start point, bounds).
  *Done when:* the check adds an overhead screenshot of the whole valley with the five spots and the vista marked; the player can't walk off the map (check walks into a wall for 5 s and confirms the position is clamped).

- [ ] **1C. Lanterns and the ending.** After 1B. Five lanterns at the spots from `src/level.js`. Walking close to one finds it (it lights, counter goes up). Finding the fifth starts the ending: controls lock, camera rises over a few seconds to the vista viewpoint, all five lanterns glow across the valley, a quiet "The End / play again" appears. Files: new `src/lanterns.js`, new `src/ending.js`, small hook in `src/main.js`.
  *Done when:* the check teleports to each lantern via a test-only hook, screenshots the counter at 1/5 and 5/5 and the vista, and `stateText()` shows `screen: ending` then `screen: end`.

- [ ] **1D. Controls and camera feel.** After 1A. Camera doesn't clip into terrain or rocks, smooth follow, sensible look sensitivity on mouse and touch, joystick dead zone, hold Shift to sprint, Space to jump (a jump button on phone too; jump and sprint animations from the same KayKit pack, which has Running_A and Jump_* clips). Move the camera code out of `player.js` into new `src/camera.js`. Files: `src/camera.js`, `src/input.js`, `src/player.js` (camera part, plus sprint and jump), `CREDITS.md` if new clips are used.
  *Done when:* the check drags the view into a rock and the screenshot shows no clipping; a phone-size run shows the joystick and look working together (two touches).

## Day 2: look

- [ ] **2A. The look (ONE session: lighting, sky, fog, post-processing, materials).** Lane A. Match style frame 1, `style-frames/1-close-to-reference.png` (chosen 2026-10-13, see DECISIONS.md). Warm low sun against a teal sky, long soft-edged shadows, layered distance haze (height or distance fog plus haze colours per distance), soft bloom on the sun and lanterns, a light colour grade, and one flat-shaded material palette everything uses. Phone-safe: post-processing must have a cheap path. Files: `src/world.js` (sky, lights, fog), new `src/look.js` (palette and materials), new `src/post.js`, `src/main.js` (render call only).
  *Done when:* the check saves the same three camera angles as the style frame next to each other (`check-output/look-compare.png`), and you say in one line how close it is; no console errors.

- [ ] **2B. Props.** Lane B (parallel with 2A: use the palette names from `src/look.js` or `src/world.js` PALETTE, don't edit lighting). Make or fetch: 3 pine variants, 2 dead snags, 3 rocks, grass clump, flower clump, lantern. CC0 packs first (Quaternius, KayKit, Kenney); Meshy text-to-3D (low poly, flat colours, under ~5k triangles each) for anything missing, prompted from style frame 1. Place them along the layout from 1B. Files: `public/models/props/`, new `src/props.js`, `tools/` for any Meshy scripts, `CREDITS.md`.
  *Done when:* screenshots from the start point and the vista show the props in place, total triangle count is reported in `stateText()`, every asset is in `CREDITS.md`.

- [ ] **2C. Vegetation scatter and budget.** After 2B. Instance grass, flowers and trees across the valley with a seeded scatter; keep the start view under a set budget (draw calls < 150, triangles < 300k). Files: `src/props.js`, new `src/scatter.js`.
  *Done when:* `stateText()` reports draw calls and triangles under budget at the start and vista views; screenshots show a full valley.

- [ ] **2D. Sound.** Lane C (any time after Day 1). CC0 ambient wind and birds loop, soft footsteps, a chime when a lantern is found, a swell for the ending. Starts on tap-to-start. Files: new `src/audio.js`, `public/audio/`, `CREDITS.md`.
  *Done when:* the check confirms the audio context is running after the start tap and each sound loads without errors.

## Day 3: ship

- [ ] **3A. Phone performance.** Lane A. Using `?debug` numbers the user reads on their phone and laptop, add quality tiers (pixel ratio, shadow map size, post on/off, scatter density), picked automatically and switchable with `?quality=low|mid|high`. Files: new `src/quality.js`, small hooks in `src/main.js`, `src/post.js`, `src/scatter.js`.
  *Done when:* the check runs once per tier and screenshots all three; the user reports phone FPS in LOG.md.

- [ ] **3B. Start and end screens, counter.** Lane B. Style the start screen, lantern counter and end screen to match the look (title, a one-line hint per device: "WASD + drag" vs "joystick + drag"), and a credits line. Files: `index.html`, `src/style.css`, `src/ending.js` (screen part only).
  *Done when:* laptop and phone screenshots of start, play and end screens.

- [ ] **3C. Playtest fixes.** After the user's playtest. One session per batch of notes the user gives; each note becomes a line here first.
  *Done when:* each note is ticked with a screenshot that shows the fix.

- [ ] **3D. Release.** Last. Check the live site with `npm run check -- --url=https://crabtoast90-dev.github.io/practice-glade/`, confirm README link, CREDITS complete, LOG.md up to date.
  *Done when:* the live-site check passes and its screenshots are described in one line each.
