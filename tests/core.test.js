import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import "fake-indexeddb/auto";
globalThis.window = globalThis;
import { remember } from "../src/undoHistory.js";
import {
  createManualPose,
  resolveManualJoints,
  distalTip,
  applyDrag,
} from "../src/dragPose.js";
import {
  encodePose,
  decodePose,
  readProject,
  updateProject,
  archiveAndStart,
  getArchives,
  restoreArchive,
} from "../src/projectStorage.js";
import {
  saveColoredPart,
  loadColoredPart,
  openDb,
} from "../src/colorStorage.js";
import { buildBoundaryMask, strokePaint, floodFill, opaqueBounds, applyPhotoCover } from "../src/colorFill.js";
import { coverFitTransform, maskToTemplateAlpha } from "../src/photoImport.js";
const rig = JSON.parse(
  readFileSync(
    new URL("../public/characters/wukong/rig.json", import.meta.url),
  ),
);
test("20 most recent undo states retained", () => {
  const h = [];
  for (let i = 0; i < 25; i++) remember(h, i);
  assert.equal(h.length, 20);
  assert.equal(h.pop(), 24);
  assert.equal(h[0], 5);
});
test("staff follows right wrist and forearm after IK", () => {
  const p = createManualPose(rig, { cx: 450, cy: 375, scale: 0.8 });
  for (const [x, y] of [
    [650, 300],
    [490, 180],
    [350, 400],
  ]) {
    applyDrag(
      rig,
      p,
      { kind: "wrist", chain: ["upperArmR", "lowerArmR"] },
      x,
      y,
    );
    const j = resolveManualJoints(rig, p);
    const tip = distalTip(j.get("lowerArmR"), p.scale);
    assert.equal(j.get("staff").x, tip.x);
    assert.equal(j.get("staff").y, tip.y);
    assert.equal(
      j.get("staff").rotation,
      j.get("lowerArmR").rotation + p.localRot.get("staff"),
    );
  }
});
test("normalized pose scales consistently", () => {
  const p = createManualPose(rig, { cx: 450, cy: 375, scale: 0.8 });
  const q = decodePose(encodePose(p, 900, 720), 1800, 1440);
  assert.equal(q.rootX, 900);
  assert.equal(q.rootY, 750);
  assert.equal(q.scale, 1.6);
  assert.deepEqual(q.localRot, p.localRot);
});
test("paint, erase and outside strokes respect boundaries", () => {
  const original = new Uint8ClampedArray([
    0, 0, 0, 0, 100, 100, 100, 255, 0, 0, 0, 255,
  ]);
  const data = original.slice(),
    mask = buildBoundaryMask(original, 3, 1);
  assert.equal(
    strokePaint(
      data,
      3,
      1,
      null,
      { x: -5, y: -5 },
      1,
      [255, 0, 0],
      mask,
      original,
      "brush",
    ),
    0,
  );
  assert.equal(floodFill(data, 3, 1, 0, 0, [255, 0, 0], mask), 0);
  assert.ok(
    strokePaint(
      data,
      3,
      1,
      null,
      { x: 1, y: 0 },
      1,
      [255, 0, 0],
      mask,
      original,
      "brush",
    ) > 0,
  );
  assert.equal(data[4], 255);
  strokePaint(
    data,
    3,
    1,
    null,
    { x: 1, y: 0 },
    1,
    [255, 0, 0],
    mask,
    original,
    "eraser",
  );
  assert.deepEqual(data, original);
});
test("legacy v1 DB upgrades without losing old colored PNG", async () => {
  await new Promise((resolve, reject) => {
    const r = indexedDB.open("shadow-puppet", 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore("coloredParts", {
        keyPath: ["characterId", "partId"],
      });
    r.onsuccess = () => {
      const db = r.result;
      const tx = db.transaction("coloredParts", "readwrite");
      tx.objectStore("coloredParts").put({
        characterId: "wukong",
        partId: "head",
        pngBlob: new Blob(["legacy"]),
      });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
    };
    r.onerror = () => reject(r.error);
  });
  assert.equal(
    await (await loadColoredPart("wukong", "head")).text(),
    "legacy",
  );
});
test("project and color writes preserve each other and archive restores both", async () => {
  await updateProject({ title: "悟空出發", characterId: "wukong", assetVersion: "wukong-legacy-v1" });
  await saveColoredPart("wukong", "torso", new Blob(["paint"]));
  const pose = encodePose(
    createManualPose(rig, { cx: 450, cy: 375, scale: 0.8 }),
    900,
    720,
  );
  await updateProject({ poses: [pose, pose, pose] });
  assert.equal((await readProject()).title, "悟空出發");
  assert.deepEqual((await readProject()).coloredPartIds, ["torso"]);
  await archiveAndStart();
  assert.equal(await loadColoredPart("wukong", "torso"), null);
  assert.equal((await readProject()).poses[0], null);
  const [archive] = await getArchives();
  await restoreArchive(archive);
  assert.equal((await readProject()).title, "悟空出發");
  assert.equal(
    await (await loadColoredPart("wukong", "torso")).text(),
    "paint",
  );
  assert.equal(
    await (await loadColoredPart("wukong", "head")).text(),
    "legacy",
  );
});
test("aborted transaction does not claim project save or lose original", async () => {
  const original = await readProject();
  const proto = IDBObjectStore.prototype,
    put = proto.put;
  proto.put = function (value, ...rest) {
    if (this.name === "projects") {
      this.transaction.abort();
      throw new DOMException("quota", "QuotaExceededError");
    }
    return put.call(this, value, ...rest);
  };
  try {
    await assert.rejects(updateProject({ title: "should fail" }));
  } finally {
    proto.put = put;
  }
  assert.equal((await readProject()).title, original.title);
});

test('dragging root far away is constrained back onto stage', async () => {
  const {constrainPose}=await import('../src/dragPose.js');
  const p=createManualPose(rig,{cx:10000,cy:-10000,scale:.8});
  constrainPose(rig,p,900,720);
  const first={x:p.rootX,y:p.rootY};
  assert.ok(p.rootX>0 && p.rootX<900 && p.rootY>0 && p.rootY<720);
  constrainPose(rig,p,900,720);
  assert.ok(Math.abs(first.x-p.rootX)<1e-8 && Math.abs(first.y-p.rootY)<1e-8);
});


test('whole-figure artwork archives with its asset version and returns intact', async () => {
  await archiveAndStart();
  assert.equal((await readProject()).assetVersion,'wukong-profile-jointfix1');
  await saveColoredPart('wukong-v2','whole',new Blob(['whole-painted-figure']));
  await updateProject({title:'側身悟空'});
  await archiveAndStart();
  const archive=(await getArchives()).find(x=>x.project.title==='側身悟空');
  assert.equal(archive.project.characterId,'wukong-v2');
  await restoreArchive(archive);
  assert.equal((await readProject()).assetVersion,'wukong-profile-jointfix1');
  assert.equal(await(await loadColoredPart('wukong-v2','whole')).text(),'whole-painted-figure');
});

test('cropped image grip coordinates keep the staff at the actual painted hand', () => {
  const cropped=structuredClone(rig);
  const hand=cropped.parts.find(p=>p.id==='lowerArmR');
  hand.tip={x:.38,y:.83};
  const p=createManualPose(cropped,{cx:450,cy:310,scale:.62});
  applyDrag(cropped,p,{kind:'wrist',chain:['upperArmR','lowerArmR']},580,260);
  const joints=resolveManualJoints(cropped,p);
  const wrist=distalTip(joints.get('lowerArmR'),p.scale);
  assert.equal(joints.get('staff').x,wrist.x);
  assert.equal(joints.get('staff').y,wrist.y);
});


test('turning mirrors every joint and the painted hand grip while preserving connected staff', () => {
  const right=createManualPose(rig,{cx:450,cy:310,scale:.62});
  const left={...right,facing:-1};
  const a=resolveManualJoints(rig,right),b=resolveManualJoints(rig,left);
  for(const [id,node] of a){
    assert.ok(Math.abs(b.get(id).x-(900-node.x))<1e-9);
    assert.equal(b.get(id).y,node.y);
  }
  const wrist=distalTip(b.get('lowerArmR'),left.scale);
  assert.ok(Math.abs(wrist.x-b.get('staff').x)<1e-9);
  assert.ok(Math.abs(wrist.y-b.get('staff').y)<1e-9);
});

test('left-facing hand drag is the exact reflection of right-facing drag', () => {
  const right=createManualPose(rig,{cx:450,cy:310,scale:.62});
  const left=createManualPose(rig,{cx:450,cy:310,scale:.62});left.facing=-1;
  const handle={kind:'wrist',chain:['upperArmR','lowerArmR']};
  applyDrag(rig,right,handle,550,280);
  applyDrag(rig,left,handle,350,280);
  assert.deepEqual(left.localRot,right.localRot);
  const a=distalTip(resolveManualJoints(rig,right).get('lowerArmR'),right.scale);
  const b=distalTip(resolveManualJoints(rig,left).get('lowerArmR'),left.scale);
  assert.ok(Math.abs(a.x+b.x-900)<1e-9);
  assert.ok(Math.abs(a.y-b.y)<1e-9);
});

test('facing survives clone, save, reload and old saves default right', async () => {
  const {clonePose,applyPose}=await import('../src/dragPose.js');
  const left=createManualPose(rig,{cx:450,cy:310,scale:.62});left.facing=-1;
  const saved=encodePose(clonePose(left),900,720);
  const restored=decodePose(saved,1800,1440);
  const target=createManualPose(rig,{cx:1,cy:1});applyPose(target,restored);
  assert.equal(target.facing,-1);assert.equal(target.rootX,900);
  delete saved.facing;assert.equal(decodePose(saved,900,720).facing,1);
});

test('body rod displacement drives legs without altering hand pose or requiring autoplay', async () => {
  const {moveBodyRod}=await import('../src/rodMotion.js');
  const profile={...rig,profile:true},base=createManualPose(profile,{cx:450,cy:310,scale:.62});
  const initial=moveBodyRod(profile,base,0,0);
  assert.deepEqual(initial.localRot,base.localRot);
  const moved=moveBodyRod(profile,base,24,-20);
  assert.equal(moved.rootX,474);assert.equal(moved.rootY,290);
  assert.notEqual(moved.localRot.get('thighL'),base.localRot.get('thighL'));
  assert.equal(moved.localRot.get('lowerArmR'),base.localRot.get('lowerArmR'));
  assert.deepEqual(moveBodyRod(profile,base,24,-20),moved);
  assert.deepEqual(moveBodyRod(profile,base,0,0),initial);
});

test("photo cover-fit and silhouette mask", () => {
  // 3x2 template: transparent | white fill | black outline on row0; rest transparent
  const template = new Uint8ClampedArray([
    0,0,0,0,  255,255,255,255,  0,0,0,255,
    0,0,0,0,  255,255,255,255,  0,0,0,0,
  ]);
  const bounds = opaqueBounds(template, 3, 2);
  assert.deepEqual(bounds, { x: 1, y: 0, w: 2, h: 2 });
  const lock = buildBoundaryMask(template, 3, 2);
  assert.equal(lock[0], 1);
  assert.equal(lock[1], 0);
  assert.equal(lock[2], 1);
  const photo = new Uint8ClampedArray([
    10,20,30,255, 40,50,60,255,
    70,80,90,255, 11,22,33,255,
  ]);
  const data = template.slice();
  const n = applyPhotoCover(data, 3, 2, photo, 2, 2, lock, bounds);
  assert.ok(n >= 2);
  assert.equal(data[0], 0); // outside stays
  assert.equal(data[8], 0); // outline locked stays black
  assert.equal(data[9], 0);
  assert.equal(data[10], 0);
  assert.notEqual(data[4], 255); // fill painted from photo
  const t = coverFitTransform(2, 2, bounds);
  assert.ok(t.scale >= 1);
  assert.equal(t.tx, bounds.x + bounds.w / 2);
  const masked = template.slice();
  // pretend photo already drawn as red everywhere
  for (let i = 0; i < masked.length; i += 4) {
    masked[i] = 200; masked[i+1] = 10; masked[i+2] = 10; masked[i+3] = 255;
  }
  const kept = maskToTemplateAlpha(masked, template, 3, 2, true);
  assert.ok(kept >= 2);
  assert.equal(masked[3], 0); // outside transparent
  assert.equal(masked[8], 0); // outline forced black
  assert.equal(masked[9], 0);
  assert.equal(masked[10], 0);
  assert.equal(masked[11], 255);
  assert.equal(masked[4], 200); // interior keeps photo color
  assert.equal(masked[7], 255);
});

import {
  listCharacters,
  getCharacter,
  getCharacterByAssetVersion,
  isProfileAssetVersion,
  defaultCharacter,
} from "../src/characters.js";

test("character registry has five profile roles with required fields", () => {
  const list = listCharacters();
  assert.equal(list.length, 4);
  assert.equal(defaultCharacter().id, "wukong-v2");
  for (const id of ["wukong-v2", "tangseng-v1", "bajie-v1", "sha-v1"]) {
    const ch = getCharacter(id);
    assert.ok(ch, id);
    assert.ok(ch.labelZh);
    assert.ok(ch.assetVersion);
    assert.ok(ch.templateUrl.includes(id) || id === "wukong-v2");
    assert.ok(ch.lineArtUrl || ch.printUrl);
    assert.ok(ch.rodPreset === "humanoid" || ch.rodPreset === "horse");
    assert.equal(ch.width, 1024);
    assert.equal(ch.height, 1536);
    assert.equal(getCharacterByAssetVersion(ch.assetVersion)?.id, id);
    assert.equal(isProfileAssetVersion(ch.assetVersion), true);
  }
  assert.equal(isProfileAssetVersion("nope"), false);
});

test("switching project characterId does not wipe other character whole blobs", async () => {
  await archiveAndStart("wukong-v2");
  await saveColoredPart("wukong-v2", "whole", new Blob(["wukong-paint"]));
  await saveColoredPart("tangseng-v1", "whole", new Blob(["monk-paint"]));
  await updateProject({
    characterId: "tangseng-v1",
    assetVersion: "tangseng-profile-v1",
    coloredPartIds: [],
    poses: [null, null, null],
  });
  assert.equal((await readProject()).characterId, "tangseng-v1");
  assert.equal(await (await loadColoredPart("wukong-v2", "whole")).text(), "wukong-paint");
  assert.equal(await (await loadColoredPart("tangseng-v1", "whole")).text(), "monk-paint");
  await archiveAndStart("bajie-v1");
  // tangseng was current — its whole archived/removed; wukong untouched
  assert.equal(await loadColoredPart("tangseng-v1", "whole"), null);
  assert.equal(await (await loadColoredPart("wukong-v2", "whole")).text(), "wukong-paint");
  assert.equal((await readProject()).characterId, "bajie-v1");
});

test("mask helper keeps outline and clears outside for any template size", () => {
  const template = new Uint8ClampedArray([
    0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 255,
    0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 0,
  ]);
  const photo = new Uint8ClampedArray(template.length);
  for (let i = 0; i < photo.length; i += 4) {
    photo[i] = 12;
    photo[i + 1] = 34;
    photo[i + 2] = 56;
    photo[i + 3] = 255;
  }
  const kept = maskToTemplateAlpha(photo, template, 3, 2, true);
  assert.ok(kept >= 2);
  assert.equal(photo[3], 0);
  assert.equal(photo[8], 0);
  assert.equal(photo[11], 255);
  assert.equal(photo[4], 12);
});
