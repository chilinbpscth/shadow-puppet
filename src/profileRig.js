import {loadColoredPart, blobToImage} from './colorStorage.js';
import {getCharacter, defaultCharacter, isProfileAssetVersion} from './characters.js';

/** @deprecated Prefer getCharacter(id).width — kept for photoImport defaults */
export const PROFILE_ID = 'wukong-v2';
export const TEMPLATE_URL = './characters/wukong-v2/template.png';
export const TEMPLATE_WIDTH = 640;
export const TEMPLATE_HEIGHT = 960;

/**
 * Load template canvas for a character. Removes edge-connected light backdrop
 * (wukong-v2 checkerboard); transparent PNG templates pass through cleanly.
 */
export async function loadTemplate(characterId = PROFILE_ID) {
  const ch = getCharacter(characterId) || defaultCharacter();
  const tw = ch.width || TEMPLATE_WIDTH;
  const th = ch.height || TEMPLATE_HEIGHT;
  const image = new Image();
  image.src = ch.templateUrl;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const {data} = pixels;
  const w = canvas.width;
  const h = canvas.height;
  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  const add = (i) => {
    if (i < 0 || i >= w * h || seen[i]) return;
    const p = i * 4;
    if (data[p + 3] < 8) {
      // already transparent — mark seen so flood can cross? skip adding neighbors via transparent
      return;
    }
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
  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    if (seen[i]) data[p + 3] = 0;
    else if (data[p] > 215 && data[p + 1] > 215 && data[p + 2] > 215 && data[p + 3] > 8)
      data[p] = data[p + 1] = data[p + 2] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

// Wukong articulated regions (source 1024×1536 design coords).
const wukongRegions = [
  {id: 'head', labelZh: '頭', pivot: [567, 332], angle: 0, parent: 'torso', polygon: [[409, 20], [719, 20], [719, 332], [604, 350], [540, 315], [421, 304]]},
  {id: 'lowerArmL', labelZh: '左手', pivot: [324, 565], tip: [213, 824], parent: 'upperArmL', polygon: [[288, 532], [355, 545], [368, 663], [260, 751], [274, 886], [244, 933], [157, 930], [134, 832], [192, 725], [236, 631]]},
  {id: 'upperArmL', labelZh: '左上臂', pivot: [468, 390], tip: [324, 565], parent: 'torso', polygon: [[450, 351], [506, 365], [517, 409], [447, 584], [293, 539], [278, 511], [374, 428]]},
  {id: 'lowerArmR', labelZh: '右手', pivot: [724, 587], tip: [919, 568], parent: 'upperArmR', polygon: [[707, 557], [851, 555], [878, 516], [906, 506], [980, 511], [982, 613], [889, 626], [772, 677], [697, 638], [682, 611]]},
  {id: 'shinL', labelZh: '左小腿', pivot: [450, 1055], tip: [331, 1364], parent: 'thighL', polygon: [[429, 1025], [494, 1040], [515, 1274], [406, 1278], [388, 1385], [497, 1414], [503, 1507], [248, 1507], [285, 1407], [303, 1326], [339, 1229], [299, 1188]]},
  {id: 'shinR', labelZh: '右小腿', pivot: [699, 1055], tip: [750, 1365], parent: 'thighR', polygon: [[662, 1028], [733, 1029], [820, 1286], [781, 1291], [802, 1394], [938, 1414], [946, 1509], [676, 1514], [656, 1452], [707, 1367], [652, 1257], [583, 1244]]},
  {id: 'thighL', labelZh: '左腿', pivot: [569, 886], tip: [450, 1055], parent: 'torso', polygon: [[437, 928], [591, 865], [596, 951], [540, 1033], [481, 1075], [421, 1061], [401, 1006], [402, 957]]},
  {id: 'thighR', labelZh: '右腿', pivot: [638, 888], tip: [699, 1055], parent: 'torso', polygon: [[587, 900], [706, 924], [741, 978], [749, 1030], [725, 1078], [672, 1072], [627, 1040], [591, 961]]},
  {id: 'tail', labelZh: '尾巴', pivot: [414, 956], angle: 0, parent: 'torso', polygon: [[409, 941], [425, 961], [359, 1055], [291, 1120], [189, 1159], [80, 1128], [51, 1080], [48, 996], [93, 945], [145, 935], [170, 972], [120, 1017], [110, 1045], [157, 1090], [226, 1097], [307, 1056]]},
  {id: 'upperArmR', labelZh: '右上臂', pivot: [644, 480], tip: [724, 587], parent: 'torso', polygon: [[656, 489], [691, 505], [751, 564], [725, 615], [690, 625], [670, 577]]},
  {id: 'staff', labelZh: '金箍棒', pivot: [919, 568], angle: 0, parent: 'lowerArmR', polygon: [[892, 95], [977, 95], [977, 1400], [879, 1400]]},
  {id: 'torso', labelZh: '身體', pivot: [644, 640], angle: 0, parent: null, polygon: [[0, 0], [1024, 0], [1024, 1536], [0, 1536]]},
];

function inside(x, y, poly) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = poly[i];
    const [c, d] = poly[j];
    if (b > y !== d > y && x < ((c - a) * (y - b)) / (d - b) + a) hit = !hit;
  }
  return hit;
}
function localPoint(point, pivot, angle) {
  const dx = point[0] - pivot[0];
  const dy = point[1] - pivot[1];
  return [dx * Math.cos(angle) + dy * Math.sin(angle), -dx * Math.sin(angle) + dy * Math.cos(angle)];
}

/** Wukong silhouette content bbox in design 1024×1536 (after backdrop flood). */
export const DESIGN_CONTENT_BBOX = {x0: 63, y0: 42, x1: 964, y1: 1494};

/** Native template regions for characters whose pose ≠ Wukong (no affine). */
const bajieRegions = [
  {id: 'head', labelZh: '頭', pivot: [360, 520], angle: 0, parent: 'torso', polygon: [[220, 440], [520, 440], [560, 560], [480, 620], [300, 620], [200, 560]]},
  {id: 'lowerArmL', labelZh: '左手', pivot: [180, 780], tip: [120, 880], parent: 'upperArmL', polygon: [[140, 720], [240, 730], [260, 840], [200, 940], [100, 950], [70, 870], [90, 780], [130, 730]]},
  {id: 'upperArmL', labelZh: '左上臂', pivot: [260, 640], tip: [180, 780], parent: 'torso', polygon: [[230, 580], [340, 590], [360, 700], [280, 820], [180, 840], [140, 760], [170, 650], [210, 590]]},
  {id: 'lowerArmR', labelZh: '右手', pivot: [500, 720], tip: [540, 820], parent: 'upperArmR', polygon: [[450, 660], [560, 650], [600, 740], [580, 880], [500, 920], [440, 860], [430, 740], [440, 680]]},
  {id: 'shinL', labelZh: '左小腿', pivot: [280, 980], tip: [200, 1080], parent: 'thighL', polygon: [[240, 940], [340, 950], [360, 1040], [280, 1100], [140, 1100], [120, 1040], [160, 980], [220, 950]]},
  {id: 'shinR', labelZh: '右小腿', pivot: [420, 980], tip: [480, 1080], parent: 'thighR', polygon: [[360, 940], [480, 945], [540, 1040], [520, 1100], [380, 1100], [340, 1040], [350, 980]]},
  {id: 'thighL', labelZh: '左腿', pivot: [320, 880], tip: [280, 980], parent: 'torso', polygon: [[260, 840], [380, 850], [400, 960], [340, 1010], [250, 1000], [230, 920]]},
  {id: 'thighR', labelZh: '右腿', pivot: [400, 880], tip: [420, 980], parent: 'torso', polygon: [[340, 850], [470, 860], [500, 960], [460, 1010], [360, 1000], [330, 920]]},
  {id: 'upperArmR', labelZh: '右上臂', pivot: [420, 640], tip: [500, 720], parent: 'torso', polygon: [[380, 580], [480, 585], [530, 670], [510, 760], [420, 780], [360, 700], [360, 610]]},
  {id: 'staff', labelZh: '九齒釘耙', pivot: [540, 820], angle: 0, parent: 'lowerArmR', polygon: [[500, 450], [620, 450], [600, 1100], [520, 1100]]},
  {id: 'torso', labelZh: '身體', pivot: [360, 750], angle: 0, parent: null, polygon: [[0, 0], [1024, 0], [1024, 1536], [0, 1536]]},
];

const shaRegions = [
  {id: 'head', labelZh: '頭', pivot: [450, 450], angle: 0, parent: 'torso', polygon: [[320, 340], [580, 340], [620, 500], [520, 560], [360, 560], [280, 480]]},
  {id: 'lowerArmL', labelZh: '左手', pivot: [200, 720], tip: [130, 820], parent: 'upperArmL', polygon: [[150, 660], [280, 670], [300, 780], [220, 900], [100, 920], [60, 820], [90, 720], [140, 670]]},
  {id: 'upperArmL', labelZh: '左上臂', pivot: [320, 580], tip: [200, 720], parent: 'torso', polygon: [[280, 520], [400, 530], [420, 640], [320, 760], [200, 780], [160, 680], [200, 560], [260, 530]]},
  {id: 'lowerArmR', labelZh: '右手', pivot: [680, 680], tip: [800, 720], parent: 'upperArmR', polygon: [[620, 620], [780, 600], [880, 640], [900, 760], [820, 820], [700, 800], [640, 720], [620, 650]]},
  {id: 'shinL', labelZh: '左小腿', pivot: [360, 1050], tip: [280, 1180], parent: 'thighL', polygon: [[300, 1000], [430, 1010], [450, 1140], [360, 1200], [180, 1200], [160, 1120], [220, 1050], [280, 1010]]},
  {id: 'shinR', labelZh: '右小腿', pivot: [520, 1050], tip: [580, 1180], parent: 'thighR', polygon: [[450, 1000], [580, 1005], [650, 1140], [620, 1200], [460, 1200], [420, 1120], [440, 1050]]},
  {id: 'thighL', labelZh: '左腿', pivot: [400, 920], tip: [360, 1050], parent: 'torso', polygon: [[320, 880], [460, 890], [480, 1020], [400, 1080], [300, 1060], [280, 960]]},
  {id: 'thighR', labelZh: '右腿', pivot: [480, 920], tip: [520, 1050], parent: 'torso', polygon: [[420, 880], [560, 890], [590, 1020], [540, 1080], [440, 1060], [400, 960]]},
  {id: 'upperArmR', labelZh: '右上臂', pivot: [540, 580], tip: [680, 680], parent: 'torso', polygon: [[500, 520], [600, 525], [700, 600], [690, 720], [580, 740], [480, 660], [480, 560]]},
  {id: 'staff', labelZh: '降妖寶杖', pivot: [800, 720], angle: 0, parent: 'lowerArmR', polygon: [[760, 360], [920, 360], [900, 1200], [780, 1200]]},
  {id: 'torso', labelZh: '身體', pivot: [450, 700], angle: 0, parent: null, polygon: [[0, 0], [1024, 0], [1024, 1536], [0, 1536]]},
];

/** Characters whose region sets are already in template pixel space. */

/**
 * Opaque content bbox from ImageData (alpha > 8).
 * @returns {{x0:number,y0:number,x1:number,y1:number}|null}
 */
export function opaqueContentBbox(imageData) {
  const {data, width: w, height: h} = imageData;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  if (x1 < 0) return null;
  return {x0, y0, x1, y1};
}

function mapPoint(p, src, dst) {
  const sx = (dst.x1 - dst.x0) / (src.x1 - src.x0);
  const sy = (dst.y1 - dst.y0) / (src.y1 - src.y0);
  return [dst.x0 + (p[0] - src.x0) * sx, dst.y0 + (p[1] - src.y0) * sy];
}

/**
 * Affine-map region polygons/pivots/tips from src bbox into dst bbox (scale+translate).
 * Torso polygon is forced to full canvas after mapping.
 */
export function mapRegionsToContent(regions, srcBox, dstBox, canvasW, canvasH) {
  return regions.map((r) => {
    const next = {
      ...r,
      pivot: mapPoint(r.pivot, srcBox, dstBox),
      polygon: r.id === 'torso'
        ? [[0, 0], [canvasW, 0], [canvasW, canvasH], [0, canvasH]]
        : r.polygon.map((p) => mapPoint(p, srcBox, dstBox)),
    };
    if (r.tip) next.tip = mapPoint(r.tip, srcBox, dstBox);
    return next;
  });
}

/**
 * Resolve cut regions for a character (design-space or native), optionally affine-mapped.
 * Exported for unit tests (layer hit counts without DOM canvas).
 */
export function resolveCutRegions(ch, contentBox, canvasW, canvasH) {
  const id = ch?.id || 'wukong-v2';
  let regions;
  let mapped = false;
  if (id === 'bajie-v1') {
    regions = bajieRegions.map((r) => ({...r, polygon: r.polygon.map((p) => p.slice()), pivot: r.pivot.slice(), tip: r.tip ? r.tip.slice() : undefined}));
  } else if (id === 'sha-v1') {
    regions = shaRegions.map((r) => ({...r, polygon: r.polygon.map((p) => p.slice()), pivot: r.pivot.slice(), tip: r.tip ? r.tip.slice() : undefined}));
  } else if (id === 'wukong-v2') {
    regions = wukongRegions.map((r) => ({...r, polygon: r.polygon.map((p) => p.slice()), pivot: r.pivot.slice(), tip: r.tip ? r.tip.slice() : undefined}));
    mapped = true;
  } else if (id === 'tangseng-v1') {
    regions = wukongRegions
      .filter((r) => r.id !== 'tail' && r.id !== 'staff')
      .map((r) => ({...r, polygon: r.polygon.map((p) => p.slice()), pivot: r.pivot.slice(), tip: r.tip ? r.tip.slice() : undefined}));
    mapped = true;
  } else {
    regions = wukongRegions
      .filter((r) => r.id !== 'tail' && r.id !== 'staff')
      .map((r) => ({...r, polygon: r.polygon.map((p) => p.slice()), pivot: r.pivot.slice(), tip: r.tip ? r.tip.slice() : undefined}));
    mapped = true;
  }
  if (mapped && contentBox) {
    regions = mapRegionsToContent(regions, DESIGN_CONTENT_BBOX, contentBox, canvasW, canvasH);
  } else {
    // Native sets: still force torso to full canvas
    regions = regions.map((r) =>
      r.id === 'torso'
        ? {...r, polygon: [[0, 0], [canvasW, 0], [canvasW, canvasH], [0, canvasH]]}
        : r,
    );
  }
  return regions;
}

/** Count opaque pixels per region (first-match), for tests. */
export function countRegionPixels(imageData, regions, step = 2) {
  const {data, width: w, height: h} = imageData;
  const counts = Object.fromEntries(regions.map((r) => [r.id, 0]));
  for (let y = 0; y < h; y += step)
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      if (!data[i + 3]) continue;
      const owner = regions.findIndex((r) => inside(x, y, r.polygon));
      if (owner >= 0) counts[regions[owner].id]++;
    }
  return counts;
}

function regionsForCharacter(ch) {
  const id = ch?.id || 'wukong-v2';
  if (id === 'bajie-v1') return bajieRegions;
  if (id === 'sha-v1') return shaRegions;
  if (id === 'wukong-v2') return wukongRegions;
  if (id === 'tangseng-v1') return wukongRegions.filter((r) => r.id !== 'tail' && r.id !== 'staff');
  return wukongRegions.filter((r) => r.id !== 'tail' && r.id !== 'staff');
}

export function buildProfileRig(source, characterMeta = null) {
  const ch = characterMeta || getCharacter('wukong-v2');
  const w = source.width;
  const h = source.height;
  const pixels = source.getContext('2d').getImageData(0, 0, w, h);
  const contentBox = opaqueContentBbox(pixels) || {x0: 0, y0: 0, x1: w - 1, y1: h - 1};
  const regions = resolveCutRegions(ch, contentBox, w, h);
  // Joint blend radius scales with figure height vs design content height
  const designH = DESIGN_CONTENT_BBOX.y1 - DESIGN_CONTENT_BBOX.y0;
  const contentH = Math.max(1, contentBox.y1 - contentBox.y0);
  const ratio = contentH / designH;
  const layers = regions.map(() => new ImageData(w, h));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (!pixels.data[i + 3]) continue;
      const owner = regions.findIndex((r) => inside(x, y, r.polygon));
      if (owner < 0) continue;
      layers[owner].data.set(pixels.data.subarray(i, i + 4), i);
    }
  layers.forEach((layer, layerIndex) => {
    if (regions[layerIndex].id === 'staff') return;
    const data = layer.data;
    const seen = new Uint8Array(w * h);
    const components = [];
    for (let start = 0; start < w * h; start++) {
      if (seen[start] || !data[start * 4 + 3]) continue;
      const component = [start];
      seen[start] = 1;
      for (let q = 0; q < component.length; q++) {
        const at = component[q];
        const x = at % w;
        const y = Math.floor(at / w);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            const n = ny * w + nx;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h || seen[n] || !data[n * 4 + 3]) continue;
            seen[n] = 1;
            component.push(n);
          }
      }
      components.push(component);
    }
    components.sort((a, b) => b.length - a.length);
    for (const component of components.slice(1)) {
      for (const i of component) data.fill(0, i * 4, i * 4 + 4);
    }
  });
  regions.forEach((r, i) => {
    if (!r.parent || r.id === 'staff' || r.id === 'tail' || r.id === 'head') return;
    const parentIndex = regions.findIndex((p) => p.id === r.parent);
    const radius = 19 * ratio;
    const px = r.pivot[0];
    const py = r.pivot[1];
    for (let y = Math.max(0, Math.floor(py - radius)); y < Math.min(h, py + radius); y++)
      for (let x = Math.max(0, Math.floor(px - radius)); x < Math.min(w, px + radius); x++) {
        if ((x - px) ** 2 + (y - py) ** 2 > radius ** 2) continue;
        const at = (y * w + x) * 4;
        for (const target of [i, parentIndex]) layers[target].data.set(pixels.data.subarray(at, at + 4), at);
      }
  });
  const angles = new Map(
    regions.map((r) => [r.id, r.tip ? Math.atan2(r.tip[1] - r.pivot[1], r.tip[0] - r.pivot[0]) - Math.PI / 2 : r.angle]),
  );
  const rig = {
    id: ch.id,
    labelZh: ch.labelZh,
    assetVersion: ch.assetVersion,
    profile: true,
    rodPreset: ch.rodPreset || 'humanoid',
    kind: ch.kind || 'biped',
    parts: [],
  };
  const images = new Map();
  regions.forEach((r, i) => {
    const angle = angles.get(r.id);
    const pivot = r.pivot.slice();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (layers[i].data[(y * w + x) * 4 + 3]) {
          const [a, b] = localPoint([x, y], pivot, angle);
          minX = Math.min(minX, a);
          minY = Math.min(minY, b);
          maxX = Math.max(maxX, a);
          maxY = Math.max(maxY, b);
        }
    minX = Math.floor(Math.min(minX, -8));
    minY = Math.floor(Math.min(minY, -8));
    maxX = Math.ceil(Math.max(maxX, 8));
    maxY = Math.ceil(Math.max(maxY, 8));
    const atlas = document.createElement('canvas');
    atlas.width = w;
    atlas.height = h;
    atlas.getContext('2d').putImageData(layers[i], 0, 0);
    const partCanvas = document.createElement('canvas');
    partCanvas.width = maxX - minX + 2;
    partCanvas.height = maxY - minY + 2;
    const ctx = partCanvas.getContext('2d');
    ctx.translate(-minX, -minY);
    ctx.rotate(-angle);
    ctx.translate(-pivot[0], -pivot[1]);
    ctx.drawImage(atlas, 0, 0);
    const parent = regions.find((p) => p.id === r.parent);
    const parentAngle = parent ? angles.get(parent.id) : 0;
    const offset = parent ? localPoint(pivot, parent.pivot.slice(), parentAngle) : [0, 0];
    const tip = r.tip ? localPoint(r.tip.slice(), pivot, angle) : null;
    const part = {
      id: r.id,
      labelZh: r.labelZh,
      width: partCanvas.width,
      height: partCanvas.height,
      pivot: {x: -minX / partCanvas.width, y: -minY / partCanvas.height},
      defaultPose: {parent: r.parent, x: offset[0], y: offset[1], rotation: angle - parentAngle},
      drawOrder: r.id === 'staff' ? 0 : r.id === 'torso' ? 20 : r.id === 'head' ? 50 : 30,
    };
    if (tip) part.tip = {x: (tip[0] - minX) / part.width, y: (tip[1] - minY) / part.height};
    rig.parts.push(part);
    images.set(r.id, partCanvas);
  });
  return {rig, images};
}

/**
 * P1a whole-figure rig: single torso part = painted silhouette.
 * Stage shows whole + body-rod translate (and horse preset flag for P1b).
 */
export function buildWholeFigureRig(source, ch) {
  const w = source.width;
  const h = source.height;
  const partCanvas = document.createElement('canvas');
  partCanvas.width = w;
  partCanvas.height = h;
  partCanvas.getContext('2d').drawImage(source, 0, 0);
  const pivotX = 0.5;
  const pivotY = ch.kind === 'horse' ? 0.5 : 0.42;
  const rig = {
    id: ch.id,
    labelZh: ch.labelZh,
    assetVersion: ch.assetVersion,
    profile: true,
    wholeFigure: true,
    rodPreset: ch.rodPreset || (ch.kind === 'horse' ? 'horse' : 'humanoid'),
    kind: ch.kind || 'biped',
    parts: [
      {
        id: 'torso',
        labelZh: '身體',
        width: w,
        height: h,
        pivot: {x: pivotX, y: pivotY},
        defaultPose: {parent: null, x: 0, y: 0, rotation: 0},
        drawOrder: 20,
      },
    ],
  };
  return {rig, images: new Map([['torso', partCanvas]])};
}

/**
 * @param {boolean|string} [applyColoredOrId]
 * @param {string} [characterId]
 */
export async function loadProfileRig(applyColored = true, characterId) {
  let id = characterId;
  let apply = applyColored;
  if (typeof applyColored === 'string') {
    id = applyColored;
    apply = true;
  }
  if (!id) {
    const {readProject} = await import('./projectStorage.js');
    const project = await readProject();
    id = project?.characterId || PROFILE_ID;
  }
  const ch = getCharacter(id) || defaultCharacter();
  const template = await loadTemplate(ch.id);
  let hasColored = false;
  if (apply) {
    const blob = await loadColoredPart(ch.id, 'whole');
    if (blob) {
      const img = await blobToImage(blob);
      const c = template.getContext('2d');
      c.clearRect(0, 0, template.width, template.height);
      c.drawImage(img, 0, 0, template.width, template.height);
      hasColored = true;
    }
  }
  const built =
    ch.rigMode === 'articulated' || ch.id === 'wukong-v2'
      ? buildProfileRig(template, ch)
      : buildWholeFigureRig(template, ch);
  return {...built, hasColored, coloredPartIds: hasColored ? ['whole'] : []};
}

export {isProfileAssetVersion};
