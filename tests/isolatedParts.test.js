import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PNG} from 'pngjs';
import 'fake-indexeddb/auto';

globalThis.window = globalThis;
// Capture the real builder's isolated source pixels before canvas rotation.
// This tests component selection, not raster resampling or rendered seams.
globalThis.document = {createElement() {
  const canvas = {};
  const context = {
    translate() {}, rotate() {},
    createImageData(w, h) {return {data: new Uint8ClampedArray(w * h * 4)};},
    putImageData(pixels) {canvas.pixels = pixels;},
    drawImage(source) {canvas.source = source;},
  };
  canvas.getContext = () => context;
  return canvas;
}};
const builders = await import('../src/profileRig.js');
for (const [id, filename, name] of [
  ['wukong-v2', 'color-prototype.png', 'Wukong'],
  ['tangseng-v1', 'color-parts.png', 'Tangseng'],
  ['bajie-v1', 'color-parts.png', 'Bajie'],
  ['sha-v1', 'color-parts.png', 'Sha'],
]) {
  for (const colored of [false, true]) {
  test(`${id}: production isolation preserves ${colored ? 'colored' : 'uncolored'} articulated cards`, () => {
    const png = PNG.sync.read(readFileSync(new URL(`../public/characters/${id}/${filename}`, import.meta.url)));
    if (colored) {
      for (let at = 0; at < png.data.length; at += 4) {
        if (png.data[at + 3] >= 16 && png.data[at] + png.data[at + 1] + png.data[at + 2] > 660)
          png.data.set([93, 148, 190], at);
      }
    }
    const source = {width: png.width, height: png.height,
      getContext() {return {getImageData() {return png;}};}};
    const {rig, images} = builders[`buildUnassembled${name}Rig`](source);
    assert.equal(rig.id, id);
    assert.equal(images.size, id === 'wukong-v2' ? 12 : 11);
    for (const part of rig.parts) {
      const pixels = images.get(part.id).source.pixels.data;
      let opaque = 0;
      let ink = 0;
      let paint = 0;
      for (let at = 0; at < pixels.length; at += 4) {
        if (pixels[at + 3] < 16) continue;
        opaque++;
        if (pixels[at] + pixels[at + 1] + pixels[at + 2] < 150) ink++;
        if (pixels[at] === 93 && pixels[at + 1] === 148 && pixels[at + 2] === 190) paint++;
        for (let channel = 0; channel < 4; channel++)
          assert.equal(pixels[at + channel], png.data[at + channel],
            `${part.id}: isolated pixel differs from source`);
      }
      assert.ok(opaque > 1000, `${part.id}: only ${opaque} opaque pixels survived isolation`);
      assert.ok(ink > 50, `${part.id}: missing line art`);
      if (colored) assert.ok(paint > 300, `${part.id}: missing painted pixels`);
      assert.ok(part.pivot.x >= 0 && part.pivot.x <= 1 && part.pivot.y >= 0 && part.pivot.y <= 1,
        `${part.id}: pivot outside output layer`);
      if (part.defaultPose.parent)
        assert.ok(images.has(part.defaultPose.parent), `${part.id}: missing parent`);
    }
  });
  }
}
