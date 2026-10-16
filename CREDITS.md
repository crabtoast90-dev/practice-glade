# Credits

Every third-party asset, with source and license.

- three.js (MIT): https://threejs.org
- Style frames in `style-frames/` generated with Meshy image-to-image from two Firewatch reference screenshots (references kept in `style-frames/reference/`, for internal style matching only).
- Character and animations (Ranger model; Idle_A, Walking_A, Running_A, Jump_Start and Jump_Idle clips) from KayKit Adventurers Character Pack 2.0 by Kay Lousberg (CC0): https://kaylousberg.itch.io/kaykit-adventurers, license https://creativecommons.org/publicdomain/zero/1.0/ (copy in `public/models/character/License.txt`).
- Sound, in `public/audio/`:
  - `birds.ogg`: "Ambient Bird Sounds" by isaiah658 (CC0), https://opengameart.org/content/ambient-bird-sounds
  - `wind.ogg`: "wind whoosh loop" by SketchMan3 (CC0), https://opengameart.org/content/wind-whoosh-loop
  - `step0.ogg`, `step1.ogg`, `step2.ogg`: footstep_grass_000 to 002 from Kenney Impact Sounds (CC0), https://kenney.nl/assets/impact-sounds
  - `chime.ogg`, `swell.ogg`: synthesised for this project with ffmpeg sine tones (no third-party source; released as CC0).
- Trees (Birch, Maple), dead trees, bushes, grass and flower clumps: Quaternius "Ultimate Stylized Nature" (CC0, https://quaternius.com/packs/ultimatestylizednature.html, license https://creativecommons.org/publicdomain/zero/1.0/). Source glTF files in `tools/source-assets/quaternius-nature/` (the pack's license file and large normal maps are not included); converted by `tools/build-pack-props.mjs` into the small GLBs in `public/models/props/` (normal maps dropped, textures 512 px WebP, via glTF-Transform, MIT).
- Pines (3), rocks (3) and the lantern in `public/models/props/`: generated with Meshy text-to-3D (low poly, via `tools/meshy-prop.sh`), textures shrunk to 256 px WebP. No third-party models.
