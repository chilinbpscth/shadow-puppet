import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {PNG} from 'pngjs';
import 'fake-indexeddb/auto';

globalThis.window = globalThis;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadPngImageData(rel) {
  const buf = readFileSync(join(root, rel));
  const png = PNG.sync.read(buf);
  return {data: png.data, width: png.width, height: png.height};
}

/** Match loadTemplate edge flood for light backdrop (wukong checkerboard). */
function stripLightBackdrop(imageData) {
  const {data, width: w, height: h} = imageData;
  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0,
    tail = 0;
  const add = (i) => {
    if (i < 0 || i >= w * h || seen[i]) return;
    const p = i * 4;
    if (data[p + 3] < 8) return;
    if (data[p] + data[p + 1] + data[p + 2] < 270) return;
    seen[i] = 1;
    queue[tail++] = i;
  };
  for (let x = 0; x < w; x++) {
    add(x);
    add((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    add(y * w);
    add(y * w + w - 1);
  }
  while (head < tail) {
    const i = queue[head++];
    if (i % w) add(i - 1);
    if (i % w < w - 1) add(i + 1);
    add(i - w);
    add(i + w);
  }
  for (let i = 0; i < w * h; i++) if (seen[i]) data[i * 4 + 3] = 0;
  return imageData;
}

const {
  opaqueContentBbox,
  mapRegionsToContent,
  resolveCutRegions,
  validateArticulatedRegions,
  removeLightBackdrop,
  countRegionPixels,
  DESIGN_CONTENT_BBOX,
  normalizedStageScale,
  REFERENCE_CONTENT_HEIGHT,
  NATIVE_DESIGN_BBOX,
  UNASSEMBLED_TANGSENG_PARTS,
  UNASSEMBLED_BAJIE_PARTS,
  UNASSEMBLED_SHA_PARTS,
} = await import('../src/profileRig.js');
const {getCharacter} = await import('../src/characters.js');

test('removes light halo beside transparent space but keeps enclosed white art', () => {
  const width = 7;
  const data = new Uint8ClampedArray(width * width * 4);
  const set = (x, y, r, g, b, a = 255) => {
    const i = (y * width + x) * 4;
    data.set([r, g, b, a], i);
  };
  set(1, 1, 255, 255, 255);
  set(1, 2, 255, 255, 255);
  for (const [x, y] of [[3, 3], [3, 4], [3, 5], [4, 3], [4, 5], [5, 3], [5, 4], [5, 5]]) set(x, y, 0, 0, 0);
  set(4, 4, 255, 255, 255);
  removeLightBackdrop({data, width, height: width});
  assert.equal(data[(1 * width + 1) * 4 + 3], 0);
  assert.equal(data[(4 * width + 4) * 4 + 3], 255);
});

test('mapRegionsToContent scales pivots into destination bbox', () => {
  const src = {x0: 0, y0: 0, x1: 100, y1: 200};
  const dst = {x0: 10, y0: 20, x1: 110, y1: 220};
  const regions = [
    {
      id: 'upperArmL',
      pivot: [50, 100],
      tip: [25, 150],
      polygon: [
        [40, 90],
        [60, 90],
        [60, 110],
        [40, 110],
      ],
      parent: 'torso',
    },
    {
      id: 'torso',
      pivot: [50, 100],
      polygon: [
        [0, 0],
        [100, 0],
        [100, 200],
        [0, 200],
      ],
      parent: null,
    },
  ];
  const mapped = mapRegionsToContent(regions, src, dst, 200, 300);
  assert.deepEqual(mapped[0].pivot, [60, 120]);
  assert.deepEqual(mapped[0].tip, [35, 170]);
  assert.deepEqual(mapped[1].polygon, [
    [0, 0],
    [200, 0],
    [200, 300],
    [0, 300],
  ]);
});

test('each profile keeps its own articulated prop and drops only unsupported tail parts', () => {
  const box = DESIGN_CONTENT_BBOX;
  const tang = resolveCutRegions(getCharacter('tangseng-v1'), box, 1024, 1536);
  assert.ok(tang.some((r) => r.id === 'staff'));
  assert.ok(!tang.some((r) => r.id === 'tail'));
  assert.ok(tang.some((r) => r.id === 'lowerArmL'));
  const bajie = resolveCutRegions(getCharacter('bajie-v1'), box, 1024, 1536);
  assert.ok(bajie.some((r) => r.id === 'staff'));
  assert.ok(!bajie.some((r) => r.id === 'tail'));
  const sha = resolveCutRegions(getCharacter('sha-v1'), box, 1024, 1536);
  assert.ok(sha.some((r) => r.id === 'staff'));
  assert.ok(!sha.some((r) => r.id === 'tail'));
  const wu = resolveCutRegions(getCharacter('wukong-v2'), box, 1024, 1536);
  assert.ok(wu.some((r) => r.id === 'tail'));
  assert.ok(wu.some((r) => r.id === 'staff'));
});

test('regenerated templates have stable transparent content boxes', () => {
  const expected = {
    'tangseng-v1': {x0: 95, y0: 28, x1: 912, y1: 1457},
    'bajie-v1': {x0: 50, y0: 147, x1: 979, y1: 1387},
    'sha-v1': {x0: 123, y0: 72, x1: 920, y1: 1395},
  };
  for (const id of ['tangseng-v1', 'bajie-v1', 'sha-v1']) {
    const imageData = loadPngImageData(`public/characters/${id}/template.png`);
    assert.deepEqual(opaqueContentBbox(imageData), expected[id], id);
  }
});

test('Tang Seng coloring sheet contains eleven detached, non-empty physical parts', () => {
  const image = loadPngImageData('public/characters/tangseng-v1/color-parts.png');
  assert.equal(image.width, 1536);
  assert.equal(image.height, 1024);
  assert.deepEqual(
    UNASSEMBLED_TANGSENG_PARTS.map((part) => part.id),
    ['torso', 'head', 'upperArmL', 'lowerArmL', 'upperArmR', 'lowerArmR', 'thighL', 'shinL', 'thighR', 'shinR', 'staff'],
  );
  const byId = new Map(UNASSEMBLED_TANGSENG_PARTS.map((part) => [part.id, part]));
  for (const part of UNASSEMBLED_TANGSENG_PARTS) {
    const [x0, y0, x1, y1] = part.rect;
    let opaque = 0;
    for (let y = y0; y < y1; y += 2)
      for (let x = x0; x < x1; x += 2)
        if (image.data[(y * image.width + x) * 4 + 3] >= 16) opaque++;
    assert.ok(opaque > 1000, `${part.id} has ${opaque} sampled pixels`);
    if (part.parent) assert.ok(byId.has(part.parent), `${part.id} parent exists`);
    if (part.tip) {
      const tipAt = (Math.round(part.tip[1]) * image.width + Math.round(part.tip[0])) * 4 + 3;
      assert.ok(image.data[tipAt] >= 16, `${part.id} distal brad is on artwork`);
    }
  }
  for (const [child, parent] of [
    ['lowerArmL', 'upperArmL'], ['lowerArmR', 'upperArmR'],
    ['shinL', 'thighL'], ['shinR', 'thighR'], ['staff', 'lowerArmR'],
  ]) {
    assert.deepEqual(byId.get(child).worldPivot, byId.get(parent).worldTip, `${child} joins ${parent}`);
  }
  const character = getCharacter('tangseng-v1');
  assert.equal(character.colorTemplateRig, 'tangseng-unassembled-v1');
  assert.equal(character.colorTemplateUrl, './characters/tangseng-v1/color-parts.png');
});

test('Bajie coloring sheet contains eleven detached, non-empty physical parts', () => {
  const image = loadPngImageData('public/characters/bajie-v1/color-parts.png');
  assert.equal(image.width, 1536);
  assert.equal(image.height, 1024);
  assert.deepEqual(
    UNASSEMBLED_BAJIE_PARTS.map((part) => part.id),
    ['torso', 'head', 'upperArmL', 'lowerArmL', 'upperArmR', 'lowerArmR', 'thighL', 'shinL', 'thighR', 'shinR', 'staff'],
  );
  const byId = new Map(UNASSEMBLED_BAJIE_PARTS.map((part) => [part.id, part]));
  for (const part of UNASSEMBLED_BAJIE_PARTS) {
    const [x0, y0, x1, y1] = part.rect;
    let opaque = 0;
    for (let y = y0; y < y1; y += 2)
      for (let x = x0; x < x1; x += 2)
        if (image.data[(y * image.width + x) * 4 + 3] >= 16) opaque++;
    assert.ok(opaque > 1000, `${part.id} has ${opaque} sampled pixels`);
    if (part.parent) assert.ok(byId.has(part.parent), `${part.id} parent exists`);
    if (part.tip) {
      const tipAt = (Math.round(part.tip[1]) * image.width + Math.round(part.tip[0])) * 4 + 3;
      assert.ok(image.data[tipAt] >= 16, `${part.id} tip is on artwork`);
    }
  }
  for (const [child, parent] of [
    ['lowerArmL', 'upperArmL'], ['lowerArmR', 'upperArmR'],
    ['shinL', 'thighL'], ['shinR', 'thighR'], ['staff', 'lowerArmR'],
  ]) {
    assert.deepEqual(byId.get(child).worldPivot, byId.get(parent).worldTip, `${child} joins ${parent}`);
  }
  const character = getCharacter('bajie-v1');
  assert.equal(character.colorTemplateRig, 'bajie-unassembled-v1');
  assert.equal(character.colorTemplateUrl, './characters/bajie-v1/color-parts.png');
});

test('Sha Seng coloring sheet contains eleven detached, non-empty physical parts', () => {
  const image = loadPngImageData('public/characters/sha-v1/color-parts.png');
  assert.equal(image.width, 1536);
  assert.equal(image.height, 1024);
  assert.deepEqual(
    UNASSEMBLED_SHA_PARTS.map((part) => part.id),
    ['torso', 'head', 'upperArmL', 'lowerArmL', 'upperArmR', 'lowerArmR', 'thighL', 'shinL', 'thighR', 'shinR', 'staff'],
  );
  const byId = new Map(UNASSEMBLED_SHA_PARTS.map((part) => [part.id, part]));
  for (const part of UNASSEMBLED_SHA_PARTS) {
    const [x0, y0, x1, y1] = part.rect;
    let opaque = 0;
    for (let y = y0; y < y1; y += 2)
      for (let x = x0; x < x1; x += 2)
        if (image.data[(y * image.width + x) * 4 + 3] >= 16) opaque++;
    assert.ok(opaque > 1000, `${part.id} has ${opaque} sampled pixels`);
    if (part.parent) assert.ok(byId.has(part.parent), `${part.id} parent exists`);
    if (part.tip) {
      const tipAt = (Math.round(part.tip[1]) * image.width + Math.round(part.tip[0])) * 4 + 3;
      assert.ok(image.data[tipAt] >= 16, `${part.id} tip is on artwork`);
    }
  }
  for (const [child, parent] of [
    ['lowerArmL', 'upperArmL'], ['lowerArmR', 'upperArmR'],
    ['shinL', 'thighL'], ['shinR', 'thighR'], ['staff', 'lowerArmR'],
  ]) {
    assert.deepEqual(byId.get(child).worldPivot, byId.get(parent).worldTip, `${child} joins ${parent}`);
  }
  const character = getCharacter('sha-v1');
  assert.equal(character.colorTemplateRig, 'sha-unassembled-v1');
  assert.equal(character.colorTemplateUrl, './characters/sha-v1/color-parts.png');
});

const ARM_IDS = ['upperArmL', 'lowerArmL', 'upperArmR', 'lowerArmR'];
const LEG_IDS = ['thighL', 'thighR', 'shinL', 'shinR'];
const MIN_ARM = 150; // sampled every 2px → ~600 real pixels

for (const id of ['wukong-v2', 'tangseng-v1', 'bajie-v1', 'sha-v1']) {
  test(`articulated cuts give non-empty arms+legs for ${id}`, () => {
    let imageData = loadPngImageData(`public/characters/${id}/template.png`);
    if (id === 'wukong-v2') imageData = stripLightBackdrop(imageData);
    const box = opaqueContentBbox(imageData);
    assert.ok(box, 'content bbox');
    const ch = getCharacter(id);
    const regions = resolveCutRegions(ch, box, imageData.width, imageData.height);
    const counts = countRegionPixels(imageData, regions, 2);
    for (const arm of ARM_IDS) {
      assert.ok(counts[arm] >= MIN_ARM, `${id} ${arm}=${counts[arm]}`);
    }
    for (const leg of LEG_IDS) {
      assert.ok(counts[leg] >= 80, `${id} ${leg}=${counts[leg]}`);
    }
  });
}

test('articulated props cover the complete staff or rake and attach to the hand', () => {
  for (const id of ['tangseng-v1', 'bajie-v1', 'sha-v1']) {
    const imageData = loadPngImageData(`public/characters/${id}/template.png`);
    const box = opaqueContentBbox(imageData);
    const regions = resolveCutRegions(getCharacter(id), box, imageData.width, imageData.height);
    const prop = regions.find((r) => r.id === 'staff');
    const hand = regions.find((r) => r.id === 'lowerArmR');
    assert.ok(prop, `${id} prop region`);
    assert.ok(countRegionPixels(imageData, [prop], 2).staff > 1000, `${id} prop pixels`);
    assert.ok(Math.hypot(prop.pivot[0] - hand.tip[0], prop.pivot[1] - hand.tip[1]) < 8, `${id} hand/prop attachment`);
  }
});

test('all character rigs have valid parent and pivot topology', () => {
  for (const id of ['wukong-v2', 'tangseng-v1', 'bajie-v1', 'sha-v1']) {
    const imageData = loadPngImageData(`public/characters/${id}/template.png`);
    const box = opaqueContentBbox(imageData);
    const regions = resolveCutRegions(getCharacter(id), box, imageData.width, imageData.height);
    assert.equal(validateArticulatedRegions(regions, box, imageData.width, imageData.height), true, id);
  }
});

test('invalid rig topology is rejected before rendering', () => {
  assert.throws(() => validateArticulatedRegions([
    {id: 'torso', pivot: [20, 20], polygon: [[0, 0], [100, 0], [100, 100], [0, 100]]},
    {id: 'head', pivot: [10, 10], parent: 'missing', polygon: [[0, 0], [10, 0], [10, 10]]},
  ], {x0: 0, y0: 0, x1: 100, y1: 100}, 100, 100), /missing parent/);
});


/** First-match ownership then keep largest component per non-torso region (mirrors buildProfileRig cleanup). */
function opaquePixelsAfterCut(imageData, regions) {
  const {data, width: w, height: h} = imageData;
  const owner = new Int32Array(w * h).fill(-1);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!data[i * 4 + 3]) continue;
      const idx = regions.findIndex((r) => {
        const poly = r.polygon;
        let hit = false;
        for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
          const [x1, y1] = poly[a];
          const [x2, y2] = poly[b];
          if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) hit = !hit;
        }
        return hit;
      });
      if (idx >= 0) owner[i] = idx;
    }
  const kept = new Uint8Array(w * h);
  const torsoIdx = regions.findIndex((r) => r.id === 'torso');
  for (let i = 0; i < w * h; i++) {
    if (owner[i] === torsoIdx) kept[i] = 1;
  }
  for (let ri = 0; ri < regions.length; ri++) {
    if (ri === torsoIdx || regions[ri].id === 'staff') continue;
    const seen = new Uint8Array(w * h);
    const comps = [];
    for (let start = 0; start < w * h; start++) {
      if (seen[start] || owner[start] !== ri) continue;
      const comp = [start];
      seen[start] = 1;
      for (let q = 0; q < comp.length; q++) {
        const at = comp[q];
        const x = at % w;
        const y = (at / w) | 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            const n = ny * w + nx;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h || seen[n] || owner[n] !== ri) continue;
            seen[n] = 1;
            comp.push(n);
          }
      }
      comps.push(comp);
    }
    comps.sort((a, b) => b.length - a.length);
    if (comps[0]) for (const i of comps[0]) kept[i] = 1;
  }
  return {owner, kept, width: w, height: h, data, torsoIdx};
}

test('tangseng lower robe hem stays on torso without cut voids', () => {
  const imageData = loadPngImageData('public/characters/tangseng-v1/template.png');
  const box = opaqueContentBbox(imageData);
  assert.ok(box);
  const ch = getCharacter('tangseng-v1');
  const regions = resolveCutRegions(ch, box, imageData.width, imageData.height);
  const {kept, data, width: w, owner, torsoIdx} = opaquePixelsAfterCut(imageData, regions);
  let opaque = 0;
  let holes = 0;
  let torsoOwned = 0;
  for (let y = 950; y <= 1250; y++)
    for (let x = 80; x <= 340; x++) {
      const i = y * w + x;
      if (!data[i * 4 + 3]) continue;
      opaque++;
      if (!kept[i]) holes++;
      if (owner[i] === torsoIdx) torsoOwned++;
    }
  assert.ok(opaque > 5000, `robe band opaque=${opaque}`);
  assert.ok(holes < 50, `robe band cut voids/holes=${holes}`);
  assert.ok(torsoOwned / opaque > 0.85, `robe band torso share=${torsoOwned}/${opaque}`);
});

test('normalizedStageScale keeps wukong at baseScale', () => {
  assert.equal(normalizedStageScale(REFERENCE_CONTENT_HEIGHT, 0.62), 0.62);
  assert.equal(normalizedStageScale({contentHeight: REFERENCE_CONTENT_HEIGHT}, 0.58), 0.58);
  assert.equal(normalizedStageScale(null, 0.62), 0.62);
});

test('normalizedStageScale boosts compact templates toward wukong height', () => {
  // Measured fills (contentH / canvasH) ≈ bajie 0.42, sha 0.57, tangseng 0.74
  const bajieH = 643;
  const shaH = 873;
  const tangH = 1138;
  const base = 0.62;
  const bajie = normalizedStageScale(bajieH, base);
  const sha = normalizedStageScale(shaH, base);
  const tang = normalizedStageScale(tangH, base);
  assert.ok(bajie > sha && sha > tang && tang > base);
  // On-screen height ≈ contentH * scale should match reference * base
  const target = REFERENCE_CONTENT_HEIGHT * base;
  assert.ok(Math.abs(bajieH * bajie - target) < 1e-6);
  assert.ok(Math.abs(shaH * sha - target) < 1e-6);
  assert.ok(Math.abs(tangH * tang - target) < 1e-6);
  assert.equal(normalizedStageScale({y0: 10, y1: 10 + bajieH}, base), bajie);
});
