import {loadColoredPart, blobToImage} from './colorStorage.js';
import {getCharacter, defaultCharacter, isProfileAssetVersion} from './characters.js';

/** @deprecated Prefer getCharacter(id).width — kept for photoImport defaults */
export const PROFILE_ID = 'wukong-v2';
export const TEMPLATE_URL = './characters/wukong-v2/template.png';
export const TEMPLATE_WIDTH = 640;
export const TEMPLATE_HEIGHT = 960;

/** Remove only light backdrop components that touch transparent canvas space. */
export function removeLightBackdrop(imageData) {
  const {data, width: w, height: h} = imageData;
  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  const isLight = (i) => {
    const p = i * 4;
    return data[p + 3] >= 8 && data[p] + data[p + 1] + data[p + 2] >= 270;
  };
  const add = (i) => {
    if (i < 0 || i >= w * h || seen[i] || !isLight(i)) return;
    seen[i] = 1;
    queue[tail++] = i;
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!isLight(i)) continue;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1 ||
          (x > 0 && data[i * 4 - 1] < 8) ||
          (x < w - 1 && data[i * 4 + 7] < 8) ||
          (y > 0 && data[(i - w) * 4 + 3] < 8) ||
          (y < h - 1 && data[(i + w) * 4 + 3] < 8)) add(i);
    }
  while (head < tail) {
    const i = queue[head++];
    if (i % w) add(i - 1);
    if (i % w < w - 1) add(i + 1);
    if (i >= w) add(i - w);
    if (i < (h - 1) * w) add(i + w);
  }
  for (let i = 0; i < tail; i++) data[queue[i] * 4 + 3] = 0;
  return imageData;
}

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
  // Wukong is the legacy raster with an opaque checkerboard; the newer
  // character templates are already transparent PNGs. Flood-clearing those
  // would eat white robe/skin interiors through small anti-aliased line gaps.
  const {data} = ch.id === 'wukong-v2' ? removeLightBackdrop(pixels) : pixels;
  for (let i = 0; i < data.length; i += 4)
    if (data[i] > 215 && data[i + 1] > 215 && data[i + 2] > 215 && data[i + 3] > 8)
      data[i] = data[i + 1] = data[i + 2] = 255;
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
  {id: 'upperArmR', labelZh: '右上臂', pivot: [644, 480], tip: [724, 587], parent: 'torso', polygon: [[628, 463], [681, 480], [710, 525], [710, 595], [684, 625], [646, 565]]},
  {id: 'staff', labelZh: '金箍棒', pivot: [919, 568], angle: 0, parent: 'lowerArmR', polygon: [[892, 95], [977, 95], [977, 1400], [879, 1400]]},
  {id: 'torso', labelZh: '身體', pivot: [644, 640], angle: 0, parent: null, polygon: [[0, 0], [1024, 0], [1024, 1536], [0, 1536]]},
];

// Wukong's source drawing has visible rivet discs at the left shoulder,
// elbows and knees. The hip/upper-right-arm pivots are cloth seams, not
// exposed pins, so adding synthetic caps there creates new floating blobs.
const WUKONG_HINGE_PART_IDS = new Set([
  'upperArmL', 'lowerArmL', 'lowerArmR',
]);

function inside(x, y, poly) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = poly[i];
    const [c, d] = poly[j];
    if (b > y !== d > y && x < ((c - a) * (y - b)) / (d - b) + a) hit = !hit;
  }
  return hit;
}

function createShaStaffCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 220;
  canvas.height = 1450;
  const ctx = canvas.getContext('2d');
  const cx = 110;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.strokeStyle = '#111';
  ctx.lineWidth = 26;
  ctx.beginPath();
  ctx.moveTo(cx, 210);
  ctx.lineTo(cx, 1360);
  ctx.stroke();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 15;
  ctx.beginPath();
  ctx.moveTo(cx, 210);
  ctx.lineTo(cx, 1360);
  ctx.stroke();

  ctx.strokeStyle = '#111';
  ctx.lineWidth = 13;
  ctx.beginPath();
  ctx.moveTo(cx, 270);
  ctx.bezierCurveTo(35, 260, 30, 155, 84, 48);
  ctx.bezierCurveTo(76, 145, 103, 176, cx, 205);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, 270, 34, 0, Math.PI * 2);
  ctx.stroke();
  for (const [y, radius] of [[215, 22], [315, 25], [355, 24]]) {
    ctx.beginPath();
    ctx.arc(cx, y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const y of [1295, 1330, 1365, 1400]) {
    ctx.fillStyle = '#111';
    ctx.fillRect(cx - 28, y, 56, 12);
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx - 18, y + 3, 36, 6);
  }
  return {canvas, pivotX: cx, pivotY: 560};
}

/** Keep a robe sleeve as a static silhouette while the small hand core moves. */
function restoreRightSleeve(source, pixels, layers, regions, box, handBox) {
  const torso = regions.find((r) => r.id === 'torso');
  const upper = regions.find((r) => r.id === 'upperArmR');
  const lower = regions.find((r) => r.id === 'lowerArmR');
  const staff = regions.find((r) => r.id === 'staff');
  if (!torso || !upper || !lower) return;
  const torsoLayer = layers[regions.indexOf(torso)].data;
  for (let y = Math.max(0, box.y0); y <= Math.min(source.height - 1, box.y1); y++)
    for (let x = Math.max(0, box.x0); x <= Math.min(source.width - 1, box.x1); x++) {
      if (inside(x, y, upper.polygon) || inside(x, y, lower.polygon)) continue;
      if (staff && inside(x, y, staff.polygon)) continue;
      if (x >= handBox.x0 && x <= handBox.x1 && y >= handBox.y0 && y <= handBox.y1) continue;
      const at = (y * source.width + x) * 4;
      if (pixels.data[at + 3]) torsoLayer.set(pixels.data.subarray(at, at + 4), at);
    }
}

function clearTorsoPropResidue(pixels, layers, regions, box) {
  const torso = regions.find((r) => r.id === 'torso');
  if (!torso) return;
  const data = layers[regions.indexOf(torso)].data;
  for (let y = Math.max(0, box.y0); y <= Math.min(pixels.height - 1, box.y1); y++)
    for (let x = Math.max(0, box.x0); x <= Math.min(pixels.width - 1, box.x1); x++)
      data[(y * pixels.width + x) * 4 + 3] = 0;
}

/** Keep robe-covered leg artwork on the continuous torso silhouette. */
function restoreCoveredLegs(source, pixels, layers, regions) {
  const torso = regions.find((r) => r.id === 'torso');
  if (!torso) return;
  const torsoLayer = layers[regions.indexOf(torso)].data;
  const legRegions = regions.filter((r) => r.id.startsWith('thigh') || r.id.startsWith('shin'));
  for (let y = 0; y < source.height; y++)
    for (let x = 0; x < source.width; x++) {
      if (!legRegions.some((r) => inside(x, y, r.polygon))) continue;
      const at = (y * source.width + x) * 4;
      if (pixels.data[at + 3]) torsoLayer.set(pixels.data.subarray(at, at + 4), at);
    }
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
  // artmatch1 silhouette (content ≈49,248–974,1286): distal capsules only — waist/belly stay on torso
  {id: 'head', labelZh: '頭', pivot: [430.0, 400.0], angle: 0, parent: 'torso', polygon: [[310.0, 250.0], [545.0, 255.0], [555.0, 400.0], [490.0, 480.0], [350.0, 485.0], [295.0, 380.0]]},
  {id: 'lowerArmL', labelZh: '左手', pivot: [160.0, 820.0], tip: [90.0, 940.0], parent: 'upperArmL', polygon: [[132.2, 792.2], [52.1, 929.5], [117.8, 967.8], [197.9, 830.5]]},
  {id: 'upperArmL', labelZh: '左上臂', pivot: [250.0, 680.0], tip: [160.0, 820.0], parent: 'torso', polygon: [[221.8, 650.0], [120.9, 806.8], [188.2, 850.0], [289.1, 693.2]]},
  {id: 'lowerArmR', labelZh: '右手', pivot: [720.0, 570.0], tip: [780.0, 600.0], parent: 'upperArmR', polygon: [[693.0, 535.0], [830.0, 520.0], [850.0, 650.0], [730.0, 690.0]]},
  {id: 'shinL', labelZh: '左小腿', pivot: [300.0, 1150.0], tip: [280.0, 1270.0], parent: 'thighL', polygon: [[258.2, 1132.9], [235.0, 1272.6], [321.8, 1287.1], [345.0, 1147.4]]},
  {id: 'shinR', labelZh: '右小腿', pivot: [590.0, 1150.0], tip: [610.0, 1270.0], parent: 'thighR', polygon: [[545.0, 1147.4], [568.2, 1287.1], [655.0, 1272.6], [631.8, 1132.9]]},
  {id: 'thighL', labelZh: '左腿', pivot: [370.0, 1020.0], tip: [300.0, 1150.0], parent: 'torso', polygon: [[334.2, 989.4], [254.8, 1137.0], [335.8, 1180.6], [415.2, 1033.0]]},
  {id: 'thighR', labelZh: '右腿', pivot: [550.0, 1020.0], tip: [590.0, 1150.0], parent: 'torso', polygon: [[503.1, 1024.0], [549.0, 1173.1], [636.9, 1146.0], [591.0, 996.9]]},
  // Keep the rake head and shaft in one articulated part. The old cut only
  // captured the head, so moving the right hand left the shaft behind.
  {id: 'staff', labelZh: '九齒釘耙', pivot: [780.0, 600.0], angle: 0, parent: 'lowerArmR', polygon: [[630.0, 280.0], [950.0, 280.0], [950.0, 370.0], [805.0, 370.0], [805.0, 1000.0], [730.0, 1000.0], [730.0, 370.0], [630.0, 370.0]]},
  {id: 'upperArmR', labelZh: '右上臂', pivot: [620.0, 530.0], tip: [720.0, 570.0], parent: 'torso', polygon: [[590.0, 500.0], [710.0, 500.0], [760.0, 620.0], [700.0, 690.0], [600.0, 620.0]]},
  {id: 'torso', labelZh: '身體', pivot: [450.0, 780.0], angle: 0, parent: null, polygon: [[0.0, 0.0], [1024.0, 0.0], [1024.0, 1536.0], [0.0, 1536.0]]},
];

const tangsengRegions = [
  // artmatch1: narrow distal capsules follow the printed joint lines; flowing robe stays on torso.
  {id: 'head', labelZh: '頭', pivot: [585, 445], angle: 0, parent: 'torso', polygon: [[445, 92], [680, 92], [690, 455], [610, 505], [495, 465], [430, 300]]},
  // Keep the broad robe sleeves on the torso. Only the narrow arm cores and
  // hands are movable, so a raised hand does not punch a giant hole through
  // the continuous robe.
  {id: 'lowerArmL', labelZh: '左手', pivot: [348, 700], tip: [405, 895], parent: 'upperArmL', polygon: [[330, 680], [392, 690], [444, 885], [370, 925]]},
  {id: 'upperArmL', labelZh: '左上臂', pivot: [445, 475], tip: [348, 700], parent: 'torso', polygon: [[425, 450], [470, 470], [380, 700], [330, 720]]},
  {id: 'lowerArmR', labelZh: '右手', pivot: [720, 620], tip: [840, 675], parent: 'upperArmR', polygon: [[755, 625], [835, 650], [852, 685], [825, 710], [760, 680]]},
  {id: 'shinL', labelZh: '左小腿', pivot: [350, 1260], tip: [330, 1385], parent: 'thighL', polygon: [[313, 1248], [292, 1395], [369, 1407], [390, 1260]]},
  {id: 'shinR', labelZh: '右小腿', pivot: [700, 1260], tip: [760, 1365], parent: 'thighR', polygon: [[666, 1271], [728, 1380], [792, 1344], [730, 1235]]},
  {id: 'thighL', labelZh: '左腿', pivot: [405, 1160], tip: [350, 1260], parent: 'torso', polygon: [[370, 1137], [312, 1243], [388, 1283], [446, 1177]]},
  {id: 'thighR', labelZh: '右腿', pivot: [650, 1150], tip: [700, 1260], parent: 'torso', polygon: [[611, 1150], [663, 1270], [737, 1236], [685, 1116]]},
  // Keep the wide ringed head with the shaft; cutting only the centre strip
  // leaves the ornament behind when the right hand swings the staff.
  // Include the full ornate head, but keep the shaft corridor narrow so the
  // neighbouring robe remains part of the continuous torso silhouette.
  {id: 'staff', labelZh: '九環錫杖', pivot: [840, 675], angle: 0, parent: 'lowerArmR', polygon: [[680, 50], [980, 50], [980, 370], [850, 370], [785, 1400], [755, 1400], [820, 370], [680, 370]]},
  // The long outer sleeve stays on the torso; this tiny shoulder core only
  // supplies the articulated chain for the hand and staff.
  {id: 'upperArmR', labelZh: '右上臂', pivot: [610, 515], tip: [720, 620], parent: 'torso', polygon: [[574, 528], [669, 671], [731, 629], [636, 486]]},
  {id: 'torso', labelZh: '身體', pivot: [540, 760], angle: 0, parent: null, polygon: [[0, 0], [1024, 0], [1024, 1536], [0, 1536]]},
];

const shaRegions = [
  // artmatch1: keep the cape, sash and skirt on torso; articulate only anatomical limb cores.
  {id: 'head', labelZh: '頭', pivot: [520, 430], angle: 0, parent: 'torso', polygon: [[305, 92], [650, 92], [665, 430], [575, 510], [430, 500], [305, 330]]},
  {id: 'lowerArmL', labelZh: '左手', pivot: [260, 640], tip: [285, 900], parent: 'upperArmL', polygon: [[216, 638], [243, 914], [329, 906], [302, 630]]},
  {id: 'upperArmL', labelZh: '左上臂', pivot: [350, 460], tip: [260, 640], parent: 'torso', polygon: [[314, 442], [220, 630], [300, 670], [394, 482]]},
  // The sleeve is one continuous printed shape. Only the hand/short forearm
  // core moves; cutting the whole sleeve creates a large triangular void.
  {id: 'lowerArmR', labelZh: '右手', pivot: [690, 575], tip: [835, 605], parent: 'upperArmR', polygon: [[770, 545], [835, 535], [865, 650], [815, 675], [785, 625]]},
  {id: 'shinL', labelZh: '左小腿', pivot: [382, 1080], tip: [350, 1290], parent: 'thighL', polygon: [[340, 1068], [307, 1300], [393, 1313], [426, 1081]]},
  {id: 'shinR', labelZh: '右小腿', pivot: [575, 1080], tip: [600, 1300], parent: 'thighR', polygon: [[532, 1074], [558, 1310], [644, 1300], [618, 1064]]},
  {id: 'thighL', labelZh: '左腿', pivot: [410, 970], tip: [382, 1080], parent: 'torso', polygon: [[371, 950], [340, 1073], [424, 1095], [455, 972]]},
  {id: 'thighR', labelZh: '右腿', pivot: [545, 970], tip: [575, 1080], parent: 'torso', polygon: [[505, 972], [538, 1093], [620, 1071], [587, 950]]},
  {id: 'staff', labelZh: '降妖寶杖', pivot: [835.0, 605.0], angle: 0, parent: 'lowerArmR', polygon: [[735.0, 150.0], [935.0, 150.0], [935.0, 350.0], [940.0, 350.0], [940.0, 1320.0], [965.0, 1320.0], [965.0, 1450.0], [760.0, 1450.0], [760.0, 1320.0], [760.0, 350.0], [735.0, 350.0]]},
  {id: 'upperArmR', labelZh: '右上臂', pivot: [580, 500], tip: [690, 575], parent: 'torso', polygon: [[560, 537], [684, 622], [716, 548], [592, 463]]},
  {id: 'torso', labelZh: '身體', pivot: [435, 735], angle: 0, parent: null, polygon: [[0, 0], [1024, 0], [1024, 1536], [0, 1536]]},
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

/**
 * Validate an articulated region set before it is used for rendering.
 * A rig with an empty limb is visually indistinguishable from a broken
 * whole-figure cut, so fail early with a useful error instead of rendering it.
 */
export function validateArticulatedRegions(regions, contentBox, width, height) {
  const ids = new Set(regions.map((r) => r.id));
  const errors = [];
  for (const region of regions) {
    if (!Array.isArray(region.polygon) || region.polygon.length < 3)
      errors.push(`${region.id}: polygon is missing`);
    if (region.parent && !ids.has(region.parent)) errors.push(`${region.id}: missing parent ${region.parent}`);
    if (!Array.isArray(region.pivot) || region.pivot.length !== 2)
      errors.push(`${region.id}: pivot is missing`);
    else if (contentBox) {
      const [x, y] = region.pivot;
      const margin = Math.max(16, Math.min(width, height) * 0.025);
      if (x < contentBox.x0 - margin || x > contentBox.x1 + margin || y < contentBox.y0 - margin || y > contentBox.y1 + margin)
        errors.push(`${region.id}: pivot is outside content`);
    }
    if (region.tip && (!Array.isArray(region.tip) || region.tip.length !== 2))
      errors.push(`${region.id}: tip is invalid`);
  }
  for (const required of ['torso', 'head']) if (!ids.has(required)) errors.push(`missing ${required}`);
  if (errors.length) throw new Error(`Invalid articulated rig: ${errors.join('; ')}`);
  return true;
}

/** Design-space content bboxes for native region sets (pre-artmatch1 templates). */
export const NATIVE_DESIGN_BBOX = {
  'tangseng-v1': {x0: 80, y0: 92, x1: 943, y1: 1431},
  'bajie-v1': {x0: 49, y0: 248, x1: 974, y1: 1286},
  'sha-v1': {x0: 74, y0: 92, x1: 948, y1: 1442},
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
  validateArticulatedRegions(regions, contentBox, w, h);
  // Joint blend radius: scale with figure height; floor for compact native templates
  const designH = DESIGN_CONTENT_BBOX.y1 - DESIGN_CONTENT_BBOX.y0;
  const contentH = Math.max(1, contentBox.y1 - contentBox.y0);
  const ratio = contentH / designH;
  const blendFloor = ch.id === 'wukong-v2' ? 34 : ch.id === 'tangseng-v1' ? 55 : ch.id === 'bajie-v1' ? 32 : 55;
  const layers = regions.map(() => new ImageData(w, h));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (!pixels.data[i + 3]) continue;
      const owner = regions.findIndex((r) => inside(x, y, r.polygon));
      if (owner < 0) continue;
      layers[owner].data.set(pixels.data.subarray(i, i + 4), i);
    }
  if (ch.id === 'wukong-v2') {
    // The printed hand wraps around the staff. The broad staff polygon used
    // to capture the hand pixels outside lowerArmR as well, producing a
    // second floating hand whenever the staff rotated. In the grip window,
    // retain only the narrow shaft core; the complete hand stays on the arm.
    const staff = regions.find((r) => r.id === 'staff');
    if (staff) {
      const [cx, cy] = staff.pivot;
      const gripRadiusY = 76;
      const staffLayer = layers[regions.indexOf(staff)].data;
      const sampleY = Math.min(h - 1, Math.round(cy + 150));
      for (let y = Math.max(0, Math.floor(cy - gripRadiusY)); y <= Math.min(h - 1, Math.ceil(cy + gripRadiusY)); y++)
        for (let x = Math.max(0, Math.floor(cx - 100)); x <= Math.min(w - 1, Math.ceil(cx + 100)); x++) {
          const at = (y * w + x) * 4;
          const sampleAt = (sampleY * w + x) * 4;
          // Rebuild this short section from a clean shaft row below the hand.
          // The source hand overlaps the shaft, so retaining source pixels here
          // would make a second hand travel with the staff during rotation.
          staffLayer.set(pixels.data.subarray(sampleAt, sampleAt + 4), at);
        }
    }
  }
  layers.forEach((layer, layerIndex) => {
    // Non-Wukong line art uses several intentional disconnected islands
    // (robe hems, sleeve ornaments, and joint rings). Keeping only the
    // largest component tears those pieces out of the character.
    if (ch.id !== 'wukong-v2') return;
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
    // Blend both ends of a limb into its parent. The old implementation only
    // blended at pivot, leaving a visible white/transparent cut at the distal
    // end when the hand or foot was rotated.
    const points = [r.pivot];
    // Keep each distal limb's hand/foot on its own piece. Blending the tip
    // into the parent duplicates that endpoint and creates a floating copy
    // as soon as the limb bends; the parent-side hinge cap covers the seam.
    for (const [px, py] of points)
      for (let y = Math.max(0, Math.floor(py - radius)); y < Math.min(h, py + radius); y++)
        for (let x = Math.max(0, Math.floor(px - radius)); x < Math.min(w, px + radius); x++) {
          if ((x - px) ** 2 + (y - py) ** 2 > radius ** 2) continue;
          const at = (y * w + x) * 4;
          for (const target of [i, parentIndex]) layers[target].data.set(pixels.data.subarray(at, at + 4), at);
        }
  });

  if (ch.id === 'wukong-v2') {
    // The hand must have one physical owner: the distal right-arm piece.
    // Apply this after parent blending as well, otherwise lowerArmR's tip
    // blend would put a second hand back onto upperArmR.
    const hand = regions.find((r) => r.id === 'lowerArmR');
    if (hand) {
      const handIndex = regions.indexOf(hand);
      const [hx, hy] = hand.tip || hand.pivot;
      const handRadius = 88;
      for (let y = Math.max(0, Math.floor(hy - handRadius)); y <= Math.min(h - 1, Math.ceil(hy + handRadius)); y++)
        for (let x = Math.max(0, Math.floor(hx - handRadius)); x <= Math.min(w - 1, Math.ceil(hx + handRadius)); x++) {
          if ((x - hx) ** 2 + (y - hy) ** 2 > handRadius ** 2) continue;
          const at = (y * w + x) * 4;
          for (let i = 0; i < layers.length; i++)
            if (i !== handIndex && regions[i].id !== 'staff') layers[i].data[at + 3] = 0;
          layers[handIndex].data.set(pixels.data.subarray(at, at + 4), at);
        }
    }

    // The printed elbow disc belongs to the distal piece. If it remains in
    // upperArmR as well, large swings expose it as a second floating sleeve.
    const upperArmR = regions.find((r) => r.id === 'upperArmR');
    if (upperArmR?.tip) {
      const index = regions.indexOf(upperArmR);
      const data = layers[index].data;
      const [tx, ty] = upperArmR.tip;
      const radius = 46;
      for (let y = Math.max(0, Math.floor(ty - radius)); y <= Math.min(h - 1, Math.ceil(ty + radius)); y++)
        for (let x = Math.max(0, Math.floor(tx - radius)); x <= Math.min(w - 1, Math.ceil(tx + radius)); x++)
          if ((x - tx) ** 2 + (y - ty) ** 2 <= radius ** 2)
            data[(y * w + x) * 4 + 3] = 0;
    }
  }

  if (ch.id === 'tangseng-v1') {
    const staff = regions.find((r) => r.id === 'staff');
    const torso = regions.find((r) => r.id === 'torso');
    if (staff && torso) {
      const staffIndex = regions.indexOf(staff);
      const torsoIndex = regions.indexOf(torso);
      const staffLayer = layers[staffIndex].data;
      const torsoLayer = layers[torsoIndex].data;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          if (!inside(x, y, staff.polygon)) continue;
          const at = (y * w + x) * 4;
          staffLayer.fill(0, at, at + 4);
          torsoLayer[at + 3] = 0;
      }
    }
    restoreRightSleeve(source, pixels, layers, regions,
      {x0: 560, y0: 420, x1: 950, y1: 1050},
      {x0: 745, y0: 555, x1: 885, y1: 770});
  }

  if (ch.id === 'sha-v1') {
    const staff = regions.find((r) => r.id === 'staff');
    if (staff) layers[regions.indexOf(staff)].data.fill(0);
    restoreRightSleeve(source, pixels, layers, regions,
      {x0: 540, y0: 420, x1: 950, y1: 930},
      {x0: 745, y0: 500, x1: 885, y1: 700});
    clearTorsoPropResidue(pixels, layers, regions, {x0: 760, y0: 100, x1: 960, y1: 1450});
  }

  if (ch.id !== 'wukong-v2') restoreCoveredLegs(source, pixels, layers, regions);

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
    jointCaps: [],
  };
  const images = new Map();

  // Extract the visible hinge covers before removing the same pixels from the
  // articulated layers. This mirrors a physical rivet: both pieces may move,
  // while the connector stays at the shared pivot.
  const capRadius = ch.id === 'wukong-v2' ? 28 : 30;
  // The three newer line-art templates already contain their own printed
  // joint discs. Copying a square source patch into a synthetic cap picks up
  // nearby robe pixels and creates floating fragments during another limb's
  // movement. Keep synthetic caps only for Wukong, whose cleaned source needs
  // them to bridge the deliberate cut seams.
  const hingeIds = ch.id === 'wukong-v2' ? WUKONG_HINGE_PART_IDS : new Set();
  const hingeRegions = regions.filter((r) => r.parent && hingeIds.has(r.id));
  for (const r of hingeRegions) {
    const parent = regions.find((p) => p.id === r.parent);
    if (!parent) continue;
    const parentAngle = angles.get(parent.id) || 0;
    const [offsetX, offsetY] = localPoint(r.pivot.slice(), parent.pivot.slice(), parentAngle);
    const size = capRadius * 2 + 4;
    const capCanvas = document.createElement('canvas');
    capCanvas.width = size;
    capCanvas.height = size;
    const capContext = capCanvas.getContext('2d');
    capContext.save();
    capContext.beginPath();
    capContext.arc(size / 2, size / 2, capRadius, 0, Math.PI * 2);
    capContext.clip();
    capContext.drawImage(
      source,
      r.pivot[0] - capRadius,
      r.pivot[1] - capRadius,
      size,
      size,
      0,
      0,
      size,
      size,
    );
    capContext.restore();
    const capId = `joint-${r.id}`;
    rig.jointCaps.push({
      id: capId,
      parent: r.parent,
      width: size,
      height: size,
      pivot: {x: 0.5, y: 0.5},
      // Keep the source patch upright at the default pose. The cap is round,
      // but this also keeps its small line details aligned with the artwork.
      defaultPose: {parent: r.parent, x: offsetX, y: offsetY, rotation: -parentAngle},
      drawOrder: 60,
    });
    images.set(capId, capCanvas);

    const radiusSq = (capRadius + 1) ** 2;
    for (let y = Math.max(0, Math.floor(r.pivot[1] - capRadius - 1)); y <= Math.min(h - 1, Math.ceil(r.pivot[1] + capRadius + 1)); y++)
      for (let x = Math.max(0, Math.floor(r.pivot[0] - capRadius - 1)); x <= Math.min(w - 1, Math.ceil(r.pivot[0] + capRadius + 1)); x++) {
        if ((x - r.pivot[0]) ** 2 + (y - r.pivot[1]) ** 2 > radiusSq) continue;
        const at = (y * w + x) * 4;
        for (const layer of layers) layer.data[at + 3] = 0;
      }
  }

  regions.forEach((r, i) => {
    const angle = angles.get(r.id);
    const pivot = r.pivot.slice();
    if (ch.id === 'sha-v1' && r.id === 'staff') {
      const parent = regions.find((p) => p.id === r.parent);
      const parentAngle = parent ? angles.get(parent.id) : 0;
      const offset = parent ? localPoint(pivot, parent.pivot.slice(), parentAngle) : [0, 0];
      const custom = createShaStaffCanvas();
      rig.parts.push({
        id: r.id,
        labelZh: r.labelZh,
        width: custom.canvas.width,
        height: custom.canvas.height,
        pivot: {x: custom.pivotX / custom.canvas.width, y: custom.pivotY / custom.canvas.height},
        defaultPose: {parent: r.parent, x: offset[0], y: offset[1], rotation: angle - parentAngle},
        drawOrder: 25,
      });
      images.set(r.id, custom.canvas);
      return;
    }
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
    if (ch.id === 'wukong-v2' && r.id === 'upperArmR') {
      // A thin printed line can connect several visually separate scraps in
      // source space, but that bridge disappears after the part is rotated
      // and scaled for the stage. Keep only the main upper-arm component.
      const packed = ctx.getImageData(0, 0, partCanvas.width, partCanvas.height);
      const seen = new Uint8Array(partCanvas.width * partCanvas.height);
      const components = [];
      for (let start = 0; start < seen.length; start++) {
        if (seen[start] || packed.data[start * 4 + 3] < 24) continue;
        const component = [start];
        seen[start] = 1;
        for (let q = 0; q < component.length; q++) {
          const at = component[q];
          const x = at % partCanvas.width;
          const y = Math.floor(at / partCanvas.width);
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              const n = ny * partCanvas.width + nx;
              if (nx < 0 || nx >= partCanvas.width || ny < 0 || ny >= partCanvas.height || seen[n] || packed.data[n * 4 + 3] < 24) continue;
              seen[n] = 1;
              component.push(n);
            }
        }
        components.push(component);
      }
      components.sort((a, b) => b.length - a.length);
      for (const component of components.slice(1))
        for (const at of component) packed.data.fill(0, at * 4, at * 4 + 4);
      ctx.putImageData(packed, 0, 0);
    }
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
      // Tang Seng's staff is printed over the robe but under the hand. The
      // other props retain the original under-arm order.
      drawOrder: r.id === 'staff' ? (ch.id === 'tangseng-v1' ? 25 : 0) : r.id === 'torso' ? 20 : r.id === 'head' ? 50 : ch.id !== 'wukong-v2' && (r.id.startsWith('thigh') || r.id.startsWith('shin')) ? 10 : 30,
    };
    if (tip) part.tip = {x: (tip[0] - minX) / part.width, y: (tip[1] - minY) / part.height};
    rig.parts.push(part);
    images.set(r.id, partCanvas);
  });
  return {rig, images};
}

const UNASSEMBLED_WUKONG_PARTS = [
  {id: 'torso', labelZh: '身體', rect: [610, 219, 928, 586], pivot: [768, 580], parent: null, worldPivot: [0, 0], worldRotation: 0, drawOrder: 20},
  {id: 'head', labelZh: '頭', rect: [170, 10, 567, 334], pivot: [370, 326], parent: 'torso', worldPivot: [0, -350], worldRotation: 0, drawOrder: 50},
  {id: 'upperArmL', labelZh: '左上臂', rect: [320, 322, 548, 449], pivot: [509, 366], tip: [345, 405], parent: 'torso', worldPivot: [-77, -296], worldTip: [-127, -146], drawOrder: 30},
  {id: 'lowerArmL', labelZh: '左手', rect: [189, 458, 532, 577], pivot: [488, 512], tip: [193, 514], parent: 'upperArmL', worldPivot: [-215, -100], worldTip: [-300, 35], drawOrder: 30},
  {id: 'upperArmR', labelZh: '右上臂', rect: [990, 321, 1207, 447], pivot: [1026, 365], tip: [1180, 405], parent: 'torso', worldPivot: [72, -296], worldTip: [122, -146], drawOrder: 30},
  {id: 'lowerArmR', labelZh: '右手', rect: [1002, 458, 1306, 583], pivot: [1024, 512], tip: [1303, 518], parent: 'upperArmR', worldPivot: [215, -100], worldTip: [300, 35], drawOrder: 30},
  {id: 'thighL', labelZh: '左腿', rect: [568, 554, 724, 747], pivot: [650, 590], tip: [633, 714], parent: 'torso', worldPivot: [-97, -70], worldTip: [-120, 65], drawOrder: 10},
  {id: 'shinL', labelZh: '左小腿', rect: [523, 746, 681, 984], pivot: [626, 775], tip: [600, 960], parent: 'thighL', worldPivot: [-120, 65], worldTip: [-135, 260], drawOrder: 10},
  {id: 'thighR', labelZh: '右腿', rect: [843, 556, 997, 747], pivot: [920, 590], tip: [926, 714], parent: 'torso', worldPivot: [96, -70], worldTip: [120, 65], drawOrder: 10},
  {id: 'shinR', labelZh: '右小腿', rect: [891, 746, 1051, 984], pivot: [944, 775], tip: [980, 960], parent: 'thighR', worldPivot: [120, 65], worldTip: [135, 260], drawOrder: 10},
  {id: 'tail', labelZh: '尾巴', rect: [1099, 641, 1245, 938], pivot: [1175, 904], parent: 'torso', worldPivot: [-105, -40], worldRotation: -Math.PI / 2, drawOrder: 9},
  {id: 'staff', labelZh: '金箍棒', rect: [1385, 89, 1442, 946], pivot: [1413, 515], parent: 'lowerArmR', worldRotation: 0, drawOrder: 25},
];

// Tang Seng follows the actual classroom kit: every limb is a complete,
// detached card piece with paired brad holes. Source coordinates are the
// punched locations on color-parts.png; world coordinates are its assembled
// bind pose on stage.
export const UNASSEMBLED_TANGSENG_PARTS = [
  {id: 'torso', labelZh: '身體', rect: [675, 145, 1062, 622], pivot: [868, 598], parent: null, worldPivot: [0, 0], worldRotation: 0, drawOrder: 20},
  {id: 'head', labelZh: '頭', rect: [33, 28, 515, 520], pivot: [365, 492], componentSeed: [250, 350], parent: 'torso', worldPivot: [0, -443], worldRotation: 0, drawOrder: 50},
  {id: 'upperArmL', labelZh: '左上臂', rect: [496, 148, 674, 421], pivot: [620, 187], tip: [616, 374], parent: 'torso', worldPivot: [-89, -399], worldTip: [-210, -250], drawOrder: 30},
  {id: 'lowerArmL', labelZh: '左手', rect: [410, 397, 638, 634], pivot: [606, 438], tip: [460, 550], parent: 'upperArmL', worldPivot: [-210, -250], worldTip: [-315, -115], drawOrder: 30},
  {id: 'upperArmR', labelZh: '右上臂', rect: [1054, 148, 1245, 381], pivot: [1092, 186], tip: [1190, 335], parent: 'torso', worldPivot: [78, -399], worldTip: [200, -250], drawOrder: 30},
  {id: 'lowerArmR', labelZh: '右手', rect: [1105, 376, 1286, 639], pivot: [1154, 414], tip: [1248, 526], parent: 'upperArmR', worldPivot: [200, -250], worldTip: [290, -105], drawOrder: 30},
  {id: 'thighL', labelZh: '左腿', rect: [69, 625, 340, 941], pivot: [251, 664], tip: [252, 875], parent: 'torso', worldPivot: [-146, -46], worldTip: [-175, 160], drawOrder: 10},
  {id: 'shinL', labelZh: '左小腿', rect: [429, 664, 639, 949], pivot: [497, 701], tip: [554, 919], parent: 'thighL', worldPivot: [-175, 160], worldTip: [-195, 385], drawOrder: 10},
  {id: 'thighR', labelZh: '右腿', rect: [728, 641, 1006, 948], pivot: [867, 680], tip: [870, 878], parent: 'torso', worldPivot: [155, -46], worldTip: [175, 160], drawOrder: 10},
  {id: 'shinR', labelZh: '右小腿', rect: [1069, 662, 1238, 946], pivot: [1168, 702], tip: [1150, 919], parent: 'thighR', worldPivot: [175, 160], worldTip: [195, 385], drawOrder: 10},
  {id: 'staff', labelZh: '九環錫杖', rect: [1257, 28, 1520, 964], pivot: [1392, 515], parent: 'lowerArmR', worldPivot: [290, -105], worldRotation: 0, drawOrder: 0},
];

// Bajie uses the same two-control-rod mechanics as the physical classroom
// puppet: one rod on each arm chain. The rake is rigidly attached to the
// gripping hand, while the torso and legs follow through their brad joints.
export const UNASSEMBLED_BAJIE_PARTS = [
  {id: 'torso', labelZh: '身體', rect: [525, 118, 980, 539], pivot: [753, 449], parent: null, worldPivot: [0, 0], worldRotation: 0, drawOrder: 20},
  {id: 'head', labelZh: '頭', rect: [26, 31, 538, 414], pivot: [300, 400], parent: 'torso', worldPivot: [0, -345], worldRotation: 0, drawOrder: 50},
  {id: 'upperArmL', labelZh: '左上臂', rect: [106, 706, 316, 907], pivot: [276, 740], tip: [230, 832], parent: 'torso', worldPivot: [-77, -289], worldTip: [-190, -205], drawOrder: 30},
  {id: 'lowerArmL', labelZh: '左手', rect: [195, 401, 494, 620], pivot: [451, 430], tip: [245, 530], parent: 'upperArmL', worldPivot: [-190, -205], worldTip: [-310, -90], drawOrder: 30},
  {id: 'upperArmR', labelZh: '右上臂', rect: [1001, 204, 1226, 411], pivot: [1042, 238], tip: [1098, 331], parent: 'torso', worldPivot: [81, -290], worldTip: [190, -205], drawOrder: 30},
  {id: 'lowerArmR', labelZh: '右手', rect: [1007, 408, 1288, 598], pivot: [1045, 441], tip: [1240, 505], parent: 'upperArmR', worldPivot: [190, -205], worldTip: [310, -95], drawOrder: 30},
  {id: 'thighL', labelZh: '左腿', rect: [457, 542, 704, 756], pivot: [566, 589], tip: [564, 708], parent: 'torso', worldPivot: [-175, 0], worldTip: [-130, 180], drawOrder: 10},
  {id: 'shinL', labelZh: '左小腿', rect: [435, 743, 619, 990], pivot: [562, 773], tip: [515, 960], parent: 'thighL', worldPivot: [-130, 180], worldTip: [-150, 400], drawOrder: 10},
  {id: 'thighR', labelZh: '右腿', rect: [796, 543, 1046, 756], pivot: [938, 589], tip: [936, 708], parent: 'torso', worldPivot: [176, 0], worldTip: [130, 180], drawOrder: 10},
  {id: 'shinR', labelZh: '右小腿', rect: [881, 743, 1070, 990], pivot: [940, 773], tip: [1020, 960], parent: 'thighR', worldPivot: [130, 180], worldTip: [150, 400], drawOrder: 10},
  {id: 'staff', labelZh: '九齒釘耙', rect: [1197, 32, 1498, 990], pivot: [1348, 505], parent: 'lowerArmR', worldPivot: [310, -95], worldRotation: 0, drawOrder: 0},
];

export const UNASSEMBLED_SHA_PARTS = [
  {id: 'torso', labelZh: '身體', rect: [618, 151, 1008, 580], pivot: [815, 510], parent: null, worldPivot: [0, 0], worldRotation: 0, drawOrder: 20},
  {id: 'head', labelZh: '頭', rect: [28, 82, 410, 486], pivot: [220, 470], parent: 'torso', worldPivot: [0, -375], worldRotation: 0, drawOrder: 50},
  {id: 'upperArmL', labelZh: '左上臂', rect: [434, 140, 628, 344], pivot: [478, 175], tip: [595, 239], parent: 'torso', worldPivot: [-117, -304], worldTip: [-195, -210], drawOrder: 30},
  {id: 'lowerArmL', labelZh: '左手', rect: [271, 441, 575, 635], pivot: [542, 470], tip: [330, 535], parent: 'upperArmL', worldPivot: [-195, -210], worldTip: [-310, -80], drawOrder: 30},
  {id: 'upperArmR', labelZh: '右上臂', rect: [1006, 145, 1205, 343], pivot: [1162, 179], tip: [1038, 237], parent: 'torso', worldPivot: [119, -304], worldTip: [195, -210], drawOrder: 30},
  {id: 'lowerArmR', labelZh: '右手', rect: [1030, 440, 1303, 635], pivot: [1061, 470], tip: [1250, 530], parent: 'upperArmR', worldPivot: [195, -210], worldTip: [310, -80], drawOrder: 30},
  {id: 'thighL', labelZh: '左腿', rect: [228, 667, 414, 897], pivot: [358, 700], tip: [278, 851], parent: 'torso', worldPivot: [-105, 0], worldTip: [-145, 180], drawOrder: 10},
  {id: 'shinL', labelZh: '左小腿', rect: [429, 725, 583, 948], pivot: [532, 759], tip: [500, 920], parent: 'thighL', worldPivot: [-145, 180], worldTip: [-145, 400], drawOrder: 10},
  {id: 'thighR', labelZh: '右腿', rect: [677, 667, 855, 908], pivot: [732, 700], tip: [807, 861], parent: 'torso', worldPivot: [104, 0], worldTip: [145, 180], drawOrder: 10},
  {id: 'shinR', labelZh: '右小腿', rect: [894, 716, 1051, 940], pivot: [942, 748], tip: [1000, 920], parent: 'thighR', worldPivot: [145, 180], worldTip: [145, 400], drawOrder: 10},
  {id: 'staff', labelZh: '降妖寶杖', rect: [1255, 73, 1500, 930], pivot: [1376, 515], parent: 'lowerArmR', worldPivot: [310, -80], worldRotation: 0, drawOrder: 0},
];

function inverseRotate(point, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [point[0] * cos + point[1] * sin, -point[0] * sin + point[1] * cos];
}

function labelOpaqueComponents(source, minAlpha = 16) {
  const ctx = source.getContext('2d', {willReadFrequently: true});
  const pixels = ctx.getImageData(0, 0, source.width, source.height);
  const labels = new Int32Array(source.width * source.height);
  const queue = new Int32Array(labels.length);
  let nextLabel = 1;
  for (let start = 0; start < labels.length; start++) {
    if (labels[start] || pixels.data[start * 4 + 3] < minAlpha) continue;
    let head = 0;
    let tail = 0;
    labels[start] = nextLabel;
    queue[tail++] = start;
    while (head < tail) {
      const at = queue[head++];
      const x = at % source.width;
      for (const neighbour of [at - 1, at + 1, at - source.width, at + source.width]) {
        if (neighbour < 0 || neighbour >= labels.length || labels[neighbour] ||
            pixels.data[neighbour * 4 + 3] < minAlpha) continue;
        if ((neighbour === at - 1 && x === 0) || (neighbour === at + 1 && x === source.width - 1)) continue;
        labels[neighbour] = nextLabel;
        queue[tail++] = neighbour;
      }
    }
    nextLabel++;
  }
  return {pixels, labels};
}

/**
 * Prototype rig for the unassembled, uncolored Wukong worksheet.
 * The worksheet is deliberately packed apart; this converts its punched
 * joint locations into an assembled stage pose without reusing the old atlas.
 */
function buildUnassembledRig(source, ch, specs, prototypeRig, contentHeight) {
  const rig = {
    id: ch.id,
    labelZh: ch.labelZh,
    assetVersion: ch.assetVersion,
    profile: true,
    prototypeRig,
    rodPreset: ch.rodPreset || 'humanoid',
    kind: ch.kind || 'biped',
    contentHeight,
    contentBox: {x0: 0, y0: 0, x1: source.width - 1, y1: source.height - 1},
    parts: [],
    jointCaps: [],
  };
  const images = new Map();
  const worldRotations = new Map([['torso', 0]]);
  const worldPivots = new Map([['torso', [0, 0]]]);
  const assembledTips = new Map();
  const components = labelOpaqueComponents(source);

  for (const spec of specs) {
    const sourceAngle = spec.tip
      ? Math.atan2(spec.tip[1] - spec.pivot[1], spec.tip[0] - spec.pivot[0]) - Math.PI / 2
      : 0;
    const corners = [
      [spec.rect[0], spec.rect[1]],
      [spec.rect[2], spec.rect[1]],
      [spec.rect[2], spec.rect[3]],
      [spec.rect[0], spec.rect[3]],
    ].map((point) => localPoint(point, spec.pivot, sourceAngle));
    let minX = Math.floor(Math.min(...corners.map(([x]) => x), -8));
    let minY = Math.floor(Math.min(...corners.map(([, y]) => y), -8));
    let maxX = Math.ceil(Math.max(...corners.map(([x]) => x), 8));
    let maxY = Math.ceil(Math.max(...corners.map(([, y]) => y), 8));
    const partCanvas = document.createElement('canvas');
    partCanvas.width = maxX - minX + 2;
    partCanvas.height = maxY - minY + 2;
    const layer = document.createElement('canvas');
    layer.width = source.width;
    layer.height = source.height;
    const layerContext = layer.getContext('2d');
    if (components) {
      const [seedX, seedY] = spec.componentSeed || spec.pivot;
      const seed = Math.round(seedY) * source.width + Math.round(seedX);
      let component = components.labels[seed];
      // A virtual pivot can lie outside the card (e.g. Wukong's hip).
      // Select its largest opaque card, never transparent background label 0.
      if (!component) {
        const counts = new Map();
        for (let y = spec.rect[1]; y < spec.rect[3]; y++)
          for (let x = spec.rect[0]; x < spec.rect[2]; x++) {
            const label = components.labels[y * source.width + x];
            if (label) counts.set(label, (counts.get(label) || 0) + 1);
          }
        component = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
      }
      const isolated = layerContext.createImageData(source.width, source.height);
      for (let y = spec.rect[1]; y < spec.rect[3]; y++)
        for (let x = spec.rect[0]; x < spec.rect[2]; x++) {
          const at = y * source.width + x;
          if (components.labels[at] !== component) continue;
          isolated.data.set(components.pixels.data.subarray(at * 4, at * 4 + 4), at * 4);
        }
      layerContext.putImageData(isolated, 0, 0);
    } else {
      layerContext.save();
      layerContext.beginPath();
      layerContext.rect(spec.rect[0], spec.rect[1], spec.rect[2] - spec.rect[0], spec.rect[3] - spec.rect[1]);
      layerContext.clip();
      layerContext.drawImage(source, 0, 0);
      layerContext.restore();
    }
    const ctx = partCanvas.getContext('2d');
    ctx.translate(-minX, -minY);
    ctx.rotate(-sourceAngle);
    ctx.translate(-spec.pivot[0], -spec.pivot[1]);
    ctx.drawImage(layer, 0, 0);

    const parentRotation = spec.parent ? (worldRotations.get(spec.parent) || 0) : 0;
    const parentPivot = spec.parent ? (worldPivots.get(spec.parent) || [0, 0]) : [0, 0];
    const worldPivot = assembledTips.get(spec.parent) || spec.worldPivot || parentPivot;
    const offset = inverseRotate(
      [worldPivot[0] - parentPivot[0], worldPivot[1] - parentPivot[1]],
      parentRotation,
    );
    const worldRotation = spec.worldTip
      ? Math.atan2(spec.worldTip[1] - spec.worldPivot[1], spec.worldTip[0] - spec.worldPivot[0]) - Math.PI / 2
      : (spec.worldRotation || 0);
    const part = {
      id: spec.id,
      labelZh: spec.labelZh,
      width: partCanvas.width,
      height: partCanvas.height,
      pivot: {x: -minX / partCanvas.width, y: -minY / partCanvas.height},
      defaultPose: {
        parent: spec.parent,
        x: offset[0],
        y: offset[1],
        rotation: worldRotation - parentRotation,
      },
      drawOrder: spec.drawOrder,
    };
    if (spec.tip) {
      const tip = localPoint(spec.tip, spec.pivot, sourceAngle);
      part.tip = {x: (tip[0] - minX) / part.width, y: (tip[1] - minY) / part.height};
    }
    rig.parts.push(part);
    images.set(spec.id, partCanvas);
    worldRotations.set(spec.id, worldRotation);
    worldPivots.set(spec.id, worldPivot);
    if (spec.tip) {
      const length = Math.hypot(spec.tip[0] - spec.pivot[0], spec.tip[1] - spec.pivot[1]);
      assembledTips.set(spec.id, [
        worldPivot[0] - Math.sin(worldRotation) * length,
        worldPivot[1] + Math.cos(worldRotation) * length,
      ]);
    }
  }
  return {rig, images};
}

export function buildUnassembledWukongRig(source, characterMeta = null) {
  const ch = characterMeta || getCharacter('wukong-v2');
  return buildUnassembledRig(source, ch, UNASSEMBLED_WUKONG_PARTS, 'wukong-unassembled-v1', 1140);
}

export function buildUnassembledTangsengRig(source, characterMeta = null) {
  const ch = characterMeta || getCharacter('tangseng-v1');
  return buildUnassembledRig(source, ch, UNASSEMBLED_TANGSENG_PARTS, 'tangseng-unassembled-v1', 1500);
}

export function buildUnassembledBajieRig(source, characterMeta = null) {
  const ch = characterMeta || getCharacter('bajie-v1');
  return buildUnassembledRig(source, ch, UNASSEMBLED_BAJIE_PARTS, 'bajie-unassembled-v1', 1300);
}

export function buildUnassembledShaRig(source, characterMeta = null) {
  const ch = characterMeta || getCharacter('sha-v1');
  return buildUnassembledRig(source, ch, UNASSEMBLED_SHA_PARTS, 'sha-unassembled-v1', 1300);
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
  const colorPartId = ch.colorTemplatePartId || 'whole';
  let coloredSource = null;
  if (apply) {
    const blob = await loadColoredPart(ch.id, colorPartId);
    if (blob) {
      const img = await blobToImage(blob);
      if (ch.colorTemplateRig) {
        coloredSource = document.createElement('canvas');
        coloredSource.width = img.naturalWidth;
        coloredSource.height = img.naturalHeight;
        coloredSource.getContext('2d').drawImage(img, 0, 0);
      } else {
        const c = template.getContext('2d');
        c.clearRect(0, 0, template.width, template.height);
        c.drawImage(img, 0, 0, template.width, template.height);
      }
      hasColored = true;
    }
  }
  if (!coloredSource && ch.colorTemplateRig && ch.colorTemplateUrl) {
    const image = new Image();
    image.src = ch.colorTemplateUrl;
    await image.decode();
    coloredSource = document.createElement('canvas');
    coloredSource.width = image.naturalWidth;
    coloredSource.height = image.naturalHeight;
    coloredSource.getContext('2d').drawImage(image, 0, 0);
  }
  if (coloredSource) {
    const builders = {
      'wukong-unassembled-v1': buildUnassembledWukongRig,
      'tangseng-unassembled-v1': buildUnassembledTangsengRig,
      'bajie-unassembled-v1': buildUnassembledBajieRig,
      'sha-unassembled-v1': buildUnassembledShaRig,
    };
    const built = (builders[ch.colorTemplateRig] || buildUnassembledWukongRig)(coloredSource, ch);
    return {...built, hasColored, coloredPartIds: hasColored ? [colorPartId] : []};
  }
  const built =
    ch.rigMode === 'articulated' || ch.id === 'wukong-v2'
      ? buildProfileRig(template, ch)
      : buildWholeFigureRig(template, ch);
  return {...built, hasColored, coloredPartIds: hasColored ? [colorPartId] : []};
}

export {isProfileAssetVersion};
