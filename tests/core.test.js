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
import { buildBoundaryMask, strokePaint, floodFill } from "../src/colorFill.js";
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
  assert.equal((await readProject()).assetVersion,'wukong-profile-v2');
  await saveColoredPart('wukong-v2','whole',new Blob(['whole-painted-figure']));
  await updateProject({title:'側身悟空'});
  await archiveAndStart();
  const archive=(await getArchives()).find(x=>x.project.title==='側身悟空');
  assert.equal(archive.project.characterId,'wukong-v2');
  await restoreArchive(archive);
  assert.equal((await readProject()).assetVersion,'wukong-profile-v2');
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
