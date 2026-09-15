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
  countRegionPixels,
  DESIGN_CONTENT_BBOX,
} = await import('../src/profileRig.js');
const {getCharacter} = await import('../src/characters.js');

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

test('tangseng native regions have no staff/tail; bajie/sha keep staff drop tail', () => {
  const box = DESIGN_CONTENT_BBOX;
  const tang = resolveCutRegions(getCharacter('tangseng-v1'), box, 1024, 1536);
  assert.ok(!tang.some((r) => r.id === 'staff' || r.id === 'tail'));
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
