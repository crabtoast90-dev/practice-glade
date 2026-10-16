// Turn the Quaternius "Ultimate Stylized Nature" models we use (tools/source-assets/quaternius-nature/, CC0)
// into small GLBs in public/models/props/: normal maps dropped, leaf cut-outs hard-edged, textures 512 px WebP.
// Needs, once, outside the repo's dependencies:  npm i --no-save @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions sharp
// Run: node tools/build-pack-props.mjs
import { NodeIO } from '@gltf-transform/core';
import { EXTTextureWebP } from '@gltf-transform/extensions';
import { textureCompress, prune, dedup } from '@gltf-transform/functions';
import sharp from 'sharp';
import { existsSync } from 'node:fs';

const SRC = 'tools/source-assets/quaternius-nature/';
const OUT = 'public/models/props/';
const MODELS = {
  birch_1: 'BirchTree_1', birch_2: 'BirchTree_4', birch_3: 'BirchTree_5',
  maple_1: 'MapleTree_1', maple_2: 'MapleTree_2', maple_3: 'MapleTree_4', maple_4: 'MapleTree_5',
  dead_1: 'DeadTree_10', dead_2: 'DeadTree_6', dead_3: 'DeadTree_9', dead_4: 'DeadTree_5', dead_5: 'DeadTree_4',
  grass_1: 'Grass_Large', grass_2: 'Grass_Small', grass_3: 'Grass_Large_Extruded',
  flower_1: 'Flower_1_Clump', flower_2: 'Flower_2_Clump', flower_3: 'Flower_3_Clump', flower_4: 'Flower_4_Clump', flower_5: 'Flower_5_Clump',
  bush_1: 'Bush', bush_2: 'Bush_Large', bush_3: 'Bush_Small',
};

// The big *_Normal.png maps were left out of the repo (too large to upload); the models still name them, so
// give the reader a 1x1 stand-in. They are dropped from the output anyway.
for (const n of ['BirchTree_Bark', 'MapleTree_Bark', 'PineTree_Bark', 'NormalTree_Bark', 'PalmTree_Trunk']) {
  const f = `${SRC}${n}_Normal.png`;
  if (!existsSync(f)) await sharp({ create: { width: 1, height: 1, channels: 3, background: '#8080ff' } }).png().toFile(f);
}

const io = new NodeIO().registerExtensions([EXTTextureWebP]);
for (const [out, src] of Object.entries(MODELS)) {
  const doc = await io.read(`${SRC}${src}.gltf`);
  for (const m of doc.getRoot().listMaterials()) {
    m.setNormalTexture(null);
    m.setMetallicFactor(0).setRoughnessFactor(1);
    if (m.getAlphaMode() === 'BLEND') m.setAlphaMode('MASK').setAlphaCutoff(0.5);
  }
  await doc.transform(prune(), dedup(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512] }));
  await io.write(`${OUT}${out}.glb`, doc);
  console.log('wrote', out);
}
