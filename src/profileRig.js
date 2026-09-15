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

/** Reference silhouette height (Wukong). Solo uses baseScale≈0.62 against this height. */
export const REFERENCE_CONTENT_HEIGHT = DESIGN_CONTENT_BBOX.y1 - DESIGN_CONTENT_BBOX.y0;

/**
 * Stage pose.scale so bipeds match Wukong on-screen height at `baseScale`.
 * Templates fill the canvas differently (Wukong ≈ full height; Bajie much smaller),
 * so the same raw scale makes compact figures look tiny.
 *
 * @param {number|{contentHeight?:number,y0?:number,y1?:number}|null|undefined} contentHeightOrRigOrBbox
 *   Rig with contentHeight, raw height, or {y0,y1} content bbox.
 * @param {number} [baseScale=0.62]  Solo layoutCenter; live uses 0.58 / 0.5 for multi-seat.
 * @returns {number}
 */
export function normalizedStageScale(contentHeightOrRigOrBbox, baseScale = 0.62) {
  let h;
  if (typeof contentHeightOrRigOrBbox === 'number') {
    h = contentHeightOrRigOrBbox;
  } else if (contentHeightOrRigOrBbox && typeof contentHeightOrRigOrBbox === 'object') {
    if (typeof contentHeightOrRigOrBbox.contentHeight === 'number') {
      h = contentHeightOrRigOrBbox.contentHeight;
    } else if (
      typeof contentHeightOrRigOrBbox.y0 === 'number' &&
      typeof contentHeightOrRigOrBbox.y1 === 'number'
    ) {
      h = contentHeightOrRigOrBbox.y1 - contentHeightOrRigOrBbox.y0;
    }
  }
  if (!h || h <= 0) h = REFERENCE_CONTENT_HEIGHT;
  return baseScale * (REFERENCE_CONTENT_HEIGHT / h);
}

/** Native template regions (1024×1536 PNG space) for non-Wukong poses.
 * Hand-tuned to each template so waist/shoulder stay on torso; limbs are distal capsules.
 * Tang Seng no longer reuses wukongRegions (robe proportions differ → white holes).
 */
const bajieRegions = [
  {id: 'head', labelZh: '頭', pivot: [320.0, 560.0], angle: 0, parent: 'torso', polygon: [[200.0, 430.0], [480.0, 430.0], [480.0, 600.0], [350.0, 600.0], [200.0, 600.0]]},
  {id: 'lowerArmL', labelZh: '左手', pivot: [150.0, 760.0], tip: [90.0, 900.0], parent: 'upperArmL', polygon: [[119.0, 713.6], [26.0, 930.6], [112.0, 967.4], [205.0, 750.4]]},
  {id: 'upperArmL', labelZh: '左上臂', pivot: [240.0, 620.0], tip: [150.0, 760.0], parent: 'torso', polygon: [[225.2, 541.3], [81.2, 765.3], [173.8, 824.7], [317.8, 600.7]]},
  {id: 'lowerArmR', labelZh: '右手', pivot: [490.0, 700.0], tip: [560.0, 820.0], parent: 'upperArmR', polygon: [[435.6, 699.6], [544.1, 885.6], [624.9, 838.4], [516.4, 652.4]]},
  {id: 'shinL', labelZh: '左小腿', pivot: [200.0, 970.0], tip: [140.0, 1060.0], parent: 'thighL', polygon: [[170.8, 924.5], [74.8, 1068.5], [157.2, 1123.5], [253.2, 979.5]]},
  {id: 'shinR', labelZh: '右小腿', pivot: [430.0, 980.0], tip: [450.0, 1065.0], parent: 'thighR', polygon: [[377.8, 974.3], [409.8, 1110.3], [506.2, 1087.7], [474.2, 951.7]]},
  {id: 'thighL', labelZh: '左腿', pivot: [270.0, 870.0], tip: [200.0, 970.0], parent: 'torso', polygon: [[252.9, 798.5], [137.4, 963.5], [227.6, 1026.5], [343.1, 861.5]]},
  {id: 'thighR', labelZh: '右腿', pivot: [400.0, 875.0], tip: [430.0, 980.0], parent: 'torso', polygon: [[335.1, 848.1], [384.6, 1021.4], [490.4, 991.1], [440.9, 817.9]]},
  {id: 'staff', labelZh: '九齒釘耙', pivot: [600.0, 700.0], angle: 0, parent: 'lowerArmR', polygon: [[555.0, 200.0], [655.0, 200.0], [645.0, 1400.0], [545.0, 1400.0]]},
  {id: 'upperArmR', labelZh: '右上臂', pivot: [400.0, 610.0], tip: [490.0, 700.0], parent: 'torso', polygon: [[329.6, 617.4], [473.6, 761.4], [551.4, 683.6], [407.4, 539.6]]},
  {id: 'torso', labelZh: '身體', pivot: [340.0, 730.0], angle: 0, parent: null, polygon: [[0.0, 0.0], [1024.0, 0.0], [1024.0, 1536.0], [0.0, 1536.0]]},
];

const tangsengRegions = [
  {id: 'head', labelZh: '頭', pivot: [560.0, 430.0], angle: 0, parent: 'torso', polygon: [[480.0, 200.0], [720.0, 200.0], [720.0, 450.0], [590.0, 470.0], [480.0, 450.0]]},
  {id: 'lowerArmL', labelZh: '左手', pivot: [220.0, 680.0], tip: [100.0, 820.0], parent: 'upperArmL', polygon: [[198.8, 613.3], [12.8, 830.3], [103.2, 907.7], [289.2, 690.7]]},
  {id: 'upperArmL', labelZh: '左上臂', pivot: [420.0, 520.0], tip: [220.0, 680.0], parent: 'torso', polygon: [[446.3, 409.3], [126.3, 665.3], [213.7, 774.7], [533.7, 518.7]]},
  {id: 'lowerArmR', labelZh: '右手', pivot: [820.0, 650.0], tip: [920.0, 760.0], parent: 'upperArmR', polygon: [[756.0, 668.0], [911.0, 838.5], [999.0, 758.5], [844.0, 588.0]]},
  // Distal L-leg capsules only — trailing robe hem stays on torso (avoids orphan cut voids).
  {id: 'shinL', labelZh: '左小腿', pivot: [375.0, 1125.0], tip: [350.0, 1310.0], parent: 'thighL', polygon: [[335.0, 1118.0], [415.0, 1135.0], [400.0, 1320.0], [300.0, 1300.0]]},
  {id: 'shinR', labelZh: '右小腿', pivot: [700.0, 1120.0], tip: [760.0, 1310.0], parent: 'thighR', polygon: [[623.6, 1102.3], [719.6, 1406.3], [848.4, 1365.7], [752.4, 1061.7]]},
  {id: 'thighL', labelZh: '左腿', pivot: [425.0, 960.0], tip: [375.0, 1125.0], parent: 'torso', polygon: [[390.0, 920.0], [500.0, 940.0], [450.0, 1120.0], [340.0, 1100.0]]},
  {id: 'thighR', labelZh: '右腿', pivot: [620.0, 920.0], tip: [700.0, 1120.0], parent: 'torso', polygon: [[518.4, 867.9], [650.4, 1197.9], [789.6, 1142.1], [657.6, 812.1]]},
  {id: 'upperArmR', labelZh: '右上臂', pivot: [680.0, 520.0], tip: [820.0, 650.0], parent: 'torso', polygon: [[583.4, 525.8], [807.4, 733.8], [902.6, 631.2], [678.6, 423.2]]},
  {id: 'torso', labelZh: '身體', pivot: [540.0, 700.0], angle: 0, parent: null, polygon: [[0.0, 0.0], [1024.0, 0.0], [1024.0, 1536.0], [0.0, 1536.0]]},
];

const shaRegions = [
  {id: 'head', labelZh: '頭', pivot: [430.0, 480.0], angle: 0, parent: 'torso', polygon: [[320.0, 340.0], [560.0, 340.0], [560.0, 520.0], [460.0, 520.0], [320.0, 520.0]]},
  {id: 'lowerArmL', labelZh: '左手', pivot: [180.0, 700.0], tip: [120.0, 840.0], parent: 'upperArmL', polygon: [[145.1, 651.9], [52.1, 868.9], [145.9, 909.1], [238.9, 692.1]]},
  {id: 'upperArmL', labelZh: '左上臂', pivot: [300.0, 560.0], tip: [180.0, 700.0], parent: 'torso', polygon: [[296.4, 472.0], [104.4, 696.0], [195.6, 774.0], [387.6, 550.0]]},
  {id: 'lowerArmR', labelZh: '右手', pivot: [700.0, 660.0], tip: [820.0, 760.0], parent: 'upperArmR', polygon: [[643.4, 679.2], [829.4, 834.2], [894.6, 755.8], [708.6, 600.8]]},
  {id: 'shinL', labelZh: '左小腿', pivot: [280.0, 1050.0], tip: [200.0, 1180.0], parent: 'thighL', polygon: [[250.0, 995.7], [122.0, 1203.7], [214.0, 1260.3], [342.0, 1052.3]]},
  {id: 'shinR', labelZh: '右小腿', pivot: [560.0, 1050.0], tip: [580.0, 1185.0], parent: 'thighR', polygon: [[502.6, 1030.9], [534.6, 1246.9], [641.4, 1231.1], [609.4, 1015.1]]},
  {id: 'thighL', labelZh: '左腿', pivot: [340.0, 880.0], tip: [280.0, 1050.0], parent: 'torso', polygon: [[307.4, 792.0], [208.4, 1072.5], [321.6, 1112.5], [420.6, 832.0]]},
  {id: 'thighR', labelZh: '右腿', pivot: [500.0, 880.0], tip: [560.0, 1050.0], parent: 'torso', polygon: [[419.4, 832.0], [518.4, 1112.5], [631.6, 1072.5], [532.6, 792.0]]},
  {id: 'staff', labelZh: '降妖寶杖', pivot: [850.0, 700.0], angle: 0, parent: 'lowerArmR', polygon: [[805.0, 200.0], [905.0, 200.0], [895.0, 1400.0], [795.0, 1400.0]]},
  {id: 'upperArmR', labelZh: '右上臂', pivot: [560.0, 550.0], tip: [700.0, 660.0], parent: 'torso', polygon: [[473.9, 558.7], [697.9, 734.7], [772.1, 640.3], [548.1, 464.3]]},
  {id: 'torso', labelZh: '身體', pivot: [430.0, 700.0], angle: 0, parent: null, polygon: [[0.0, 0.0], [1024.0, 0.0], [1024.0, 1536.0], [0.0, 1536.0]]},
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
function cloneRegions(src) {
  return src.map((r) => ({
    ...r,
    polygon: r.polygon.map((p) => p.slice()),
    pivot: r.pivot.slice(),
    tip: r.tip ? r.tip.slice() : undefined,
  }));
}

/** Design-space content bboxes for native region sets (pre-artmatch1 templates). */
const NATIVE_DESIGN_BBOX = {
  'tangseng-v1': {x0: 51, y0: 198, x1: 971, y1: 1336},
  'bajie-v1': {x0: 51, y0: 431, x1: 971, y1: 1103},
  'sha-v1': {x0: 51, y0: 330, x1: 971, y1: 1204},
};

export function resolveCutRegions(ch, contentBox, canvasW, canvasH) {
  const id = ch?.id || 'wukong-v2';
  let regions;
  let designBox = null;
  if (id === 'bajie-v1') {
    regions = cloneRegions(bajieRegions);
    designBox = NATIVE_DESIGN_BBOX['bajie-v1'];
  } else if (id === 'sha-v1') {
    regions = cloneRegions(shaRegions);
    designBox = NATIVE_DESIGN_BBOX['sha-v1'];
  } else if (id === 'tangseng-v1') {
    regions = cloneRegions(tangsengRegions);
    designBox = NATIVE_DESIGN_BBOX['tangseng-v1'];
  } else if (id === 'wukong-v2') {
    regions = cloneRegions(wukongRegions);
    designBox = DESIGN_CONTENT_BBOX;
  } else {
    regions = cloneRegions(wukongRegions.filter((r) => r.id !== 'tail' && r.id !== 'staff'));
    designBox = DESIGN_CONTENT_BBOX;
  }
  if (designBox && contentBox) {
    regions = mapRegionsToContent(regions, designBox, contentBox, canvasW, canvasH);
  } else {
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
  if (id === 'tangseng-v1') return tangsengRegions;
  if (id === 'wukong-v2') return wukongRegions;
  return wukongRegions.filter((r) => r.id !== 'tail' && r.id !== 'staff');
}

export function buildProfileRig(source, characterMeta = null) {
  const ch = characterMeta || getCharacter('wukong-v2');
  const w = source.width;
  const h = source.height;
  const pixels = source.getContext('2d').getImageData(0, 0, w, h);
  const contentBox = opaqueContentBbox(pixels) || {x0: 0, y0: 0, x1: w - 1, y1: h - 1};
  const regions = resolveCutRegions(ch, contentBox, w, h);
  // Joint blend radius: scale with figure height; floor for compact native templates
  const designH = DESIGN_CONTENT_BBOX.y1 - DESIGN_CONTENT_BBOX.y0;
  const contentH = Math.max(1, contentBox.y1 - contentBox.y0);
  const ratio = contentH / designH;
  const blendFloor = ch.id === 'wukong-v2' ? 0 : ch.id === 'tangseng-v1' ? 30 : 26;
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
    const radius = Math.max(blendFloor, 19 * ratio);
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
    contentHeight: contentH,
    contentBox: {x0: contentBox.x0, y0: contentBox.y0, x1: contentBox.x1, y1: contentBox.y1},
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
  const sctx = partCanvas.getContext('2d');
  sctx.drawImage(source, 0, 0);
  const pixels = sctx.getImageData(0, 0, w, h);
  const contentBox = opaqueContentBbox(pixels) || {x0: 0, y0: 0, x1: w - 1, y1: h - 1};
  const contentH = Math.max(1, contentBox.y1 - contentBox.y0);
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
    contentHeight: contentH,
    contentBox: {x0: contentBox.x0, y0: contentBox.y0, x1: contentBox.x1, y1: contentBox.y1},
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
