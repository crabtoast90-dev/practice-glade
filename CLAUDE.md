# Practice Glade

When the user asks for ideas, options, or a plan, give them that and stop.

## The game
Golden-hour exploration in a small stylized valley, third person. Walk and look; find five hidden lanterns; finding all five ends on a vista (camera rises to a viewpoint, lanterns light up across the valley). No combat, no inventory, no UI beyond a lantern counter and a tap-to-start screen. Look: Firewatch-style (flat-shaded forms, warm low sun on a teal sky, long shadows, layered haze, soft bloom); style frames in `style-frames/`. Character: free CC0 animated (Quaternius or KayKit), not AI-generated. Props: Meshy or CC0 packs, matched to the chosen style frame. Must play on laptop (keyboard + mouse drag) and phone (left joystick, drag to look).

The user is a game designer, not a programmer: report in plain language, no code. They make taste calls and playtest; you make the technical calls.

## Stack
three.js (pinned, WebGLRenderer; current API docs: https://threejs.org/llms.txt), Vite, plain JS modules in `src/`. Assets go in `public/`. Credit every CC0 asset in `CREDITS.md`.
- Meshy: the API key is injected by the network proxy for `api.meshy.ai`. Never ask for it, print it, or write it anywhere. `tools/meshy-image.sh` shows the call pattern.
- Test hooks: `?test` freezes the clock (the check advances it with `window.__game.advance(ms)`); `window.__game.stateText()` gives a text summary of game state. Keep both working and extend the summary when you add state. Never use unseeded randomness.
- `?debug` shows the FPS overlay. The cloud has no GPU: screenshots prove the look, not the speed.

## Self-check
`npm run check` builds, plays a scripted laptop and phone run headless, writes screenshots and `summary.txt` to a new timestamped folder in `check-output/` (the last 5 runs are kept, older ones deleted; the folder is git-ignored). It fails on any console error or if the state didn't change. Add steps to `scripts/check.mjs` for every feature you build. `npm run check -- --url=https://crabtoast90-dev.github.io/practice-glade/` checks the live site.
Before calling any task done: open the screenshots and say in one line what you see.

## Deploy
Every push to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`: https://crabtoast90-dev.github.io/practice-glade/

## Merge rule (every session)
Work on your own branch. When the check passes and you have looked at the screenshots: rebase on main, rerun the check, merge to main, push. One merge at a time; if main moved, rebase and check again.

## End of every session
Ask the user for their minutes (directing / reviewing / playing) and fun and look scores 1-5, then write the `LOG.md` row yourself. The user never edits `LOG.md` by hand.

## Files to keep up to date
- `LOG.md`: add one line per session (date, minutes directing / reviewing / playing, shipped or killed, usage cap hit yes/no, fun and look 1-5 left blank for the user).
- `DECISIONS.md`: one dated line per decision the user makes.
- `FRICTION.md`: when the user says "friction: ...", add a timestamped line.
- `PLAN.md`: tick items when merged.
