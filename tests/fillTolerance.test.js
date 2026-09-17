import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBoundaryMask, floodFill} from '../src/colorFill.js';

test('fill crosses off-white variation without crossing ink or transparency', () => {
  const pixels = new Uint8ClampedArray([
    255,255,255,255, 247,249,250,240, 235,236,237,255,
    0,0,0,255, 255,255,255,255, 255,255,255,0,
  ]);
  const lock = buildBoundaryMask(pixels, 6, 1);
  assert.equal(floodFill(pixels, 6, 1, 0, 0, [188,53,50], lock), 3);
  assert.deepEqual([...pixels.slice(4,8)], [188,53,50,240]);
  assert.deepEqual([...pixels.slice(12)], [0,0,0,255,255,255,255,255,255,255,255,0]);
  assert.equal(floodFill(pixels, 6, 1, 0, 0, [188,53,50], lock), 0);
});
