import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
globalThis.window = globalThis;
const {
  buildUnassembledWukongRig, buildUnassembledTangsengRig,
  buildUnassembledBajieRig, buildUnassembledShaRig,
} = await import('../src/profileRig.js');
const {createManualPose, resolveManualJoints, distalTip, applyDrag, getHandles} = await import('../src/dragPose.js');
const {applyElbowKneeLinkage, rodSegmentsForPose} = await import('../src/rodControls.js');

// Canvas drawing is deliberately stubbed: this regression checks the actual
// production builder's transforms, not raster appearance (browser QA covers it).
const context = {
  save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
  drawImage() {}, translate() {}, rotate() {}, putImageData() {},
  createImageData(w, h) { return {data: new Uint8ClampedArray(w * h * 4)}; },
};
globalThis.document = {createElement() { return {getContext() { return context; }}; }};
const source = {
  width: 1536, height: 1024,
  getContext() { return {getImageData() {
    const data = new Uint8ClampedArray(1536 * 1024 * 4);
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    return {data};
  }}; },
};

test('Wukong staff stays in front of the torso but behind the gripping hand', () => {
  const {rig} = buildUnassembledWukongRig(source);
  const part = id => rig.parts.find(p => p.id === id);
  assert.ok(part('staff').drawOrder > part('torso').drawOrder);
  assert.ok(part('staff').drawOrder < part('lowerArmR').drawOrder);
  assert.equal(part('staff').defaultPose.parent, 'lowerArmR');
});

test('Wukong two-hole rod keeps elbow-to-knee distance while arm and leg move together', () => {
  const {rig} = buildUnassembledWukongRig(source);
  for (const [side, facing] of [['L', 1], ['R', 1], ['L', -1], ['R', -1]]) {
    const pose = createManualPose(rig, {cx: 500, cy: 400, scale: .55});
    pose.facing = facing;
    const before = resolveManualJoints(rig, pose);
    const elbow0 = before.get('lowerArm' + side), knee0 = before.get('shin' + side);
    const distance = Math.hypot(knee0.x - elbow0.x, knee0.y - elbow0.y);
    const oldThigh = pose.localRot.get('thigh' + side);
    assert.equal(applyElbowKneeLinkage(rig, pose, side,
      pose.localRot.get('upperArm' + side) + .05), true);
    const after = resolveManualJoints(rig, pose);
    const elbow = after.get('lowerArm' + side), knee = after.get('shin' + side);
    assert.ok(Math.abs(Math.hypot(knee.x - elbow.x, knee.y - elbow.y) - distance) < 1e-6,
      `${side} facing ${facing} changes the fixed rod-hole distance`);
    assert.notEqual(pose.localRot.get('thigh' + side), oldThigh);
  }
});

test('Wukong control rods are straight lines through the elbow and knee pins', () => {
  const {rig} = buildUnassembledWukongRig(source);
  const pose = createManualPose(rig, {cx: 500, cy: 400, scale: .55});
  const joints = resolveManualJoints(rig, pose);
  for (const segment of rodSegmentsForPose(rig, pose, 900, 720)) {
    const side = segment.id === 'left' ? 'L' : 'R';
    const knee = joints.get('shin' + side);
    const cross = (knee.x - segment.x1) * (segment.y2 - segment.y1)
      - (knee.y - segment.y1) * (segment.x2 - segment.x1);
    assert.ok(Math.abs(cross) < 1e-6, `${segment.id} rod bends away from its knee pin`);
    assert.ok(segment.y2 > knee.y, `${segment.id} grip does not extend below its knee pin`);
  }
});

test('Bajie can reach a bent-knee pose rather than only shuffle its feet', () => {
  const {rig} = buildUnassembledBajieRig(source);
  for (const side of ['L', 'R']) {
    const pose = createManualPose(rig, {cx: 500, cy: 400, scale: 0.55});
    const targetPose = createManualPose(rig, {cx: 500, cy: 400, scale: 0.55});
    const upper = 'thigh' + side;
    const lower = 'shin' + side;
    const bend = (pose.localRot.get(lower) || 0) >= 0 ? 1 : -1;
    targetPose.localRot.set(upper, targetPose.localRot.get(upper) - bend * 0.4);
    targetPose.localRot.set(lower, targetPose.localRot.get(lower) + bend * 0.75);
    const target = distalTip(resolveManualJoints(rig, targetPose).get(lower), pose.scale);
    applyDrag(rig, pose, {kind: 'ankle', chain: [upper, lower]}, target.x, target.y);
    const actual = distalTip(resolveManualJoints(rig, pose).get(lower), pose.scale);
    assert.ok(Math.hypot(actual.x - target.x, actual.y - target.y) < 1);
  }
});

for (const build of [buildUnassembledWukongRig, buildUnassembledTangsengRig,
  buildUnassembledBajieRig, buildUnassembledShaRig]) {
  test(`${build.name}: joint mode exposes every physical shoulder, elbow, hip and knee pin`, () => {
    const {rig} = build(source);
    const pose = createManualPose(rig, {cx: 500, cy: 400, scale: .55});
    const handles = getHandles(rig, pose, resolveManualJoints(rig, pose));
    assert.deepEqual(
      handles.filter(h => h.kind === 'joint').map(h => h.partId).sort(),
      ['lowerArmL', 'lowerArmR', 'shinL', 'shinR',
        'thighL', 'thighR', 'upperArmL', 'upperArmR'],
    );
  });
  test(`${build.name}: dragging a brad rotates its card without disconnecting the pin`, () => {
    const {rig} = build(source);
    const pose = createManualPose(rig, {cx: 500, cy: 400, scale: .55});
    const before = resolveManualJoints(rig, pose);
    const elbow = before.get('lowerArmL');
    const oldRotation = pose.localRot.get('lowerArmL');
    applyDrag(rig, pose, {
      id: 'lowerArmL-pin', kind: 'joint', partId: 'lowerArmL',
      x: elbow.x, y: elbow.y,
    }, elbow.x - 70, elbow.y + 50);
    assert.notEqual(pose.localRot.get('lowerArmL'), oldRotation);
    const after = resolveManualJoints(rig, pose);
    const upperTip = distalTip(after.get('upperArmL'), pose.scale);
    const lowerPin = after.get('lowerArmL');
    assert.ok(Math.hypot(upperTip.x - lowerPin.x, upperTip.y - lowerPin.y) < 1e-7);
  });
  test(`${build.name}: both physical rods couple each elbow to its same-side knee`, () => {
    const {rig} = build(source);
    for (const facing of [1, -1]) for (const side of ['L', 'R']) {
      const pose = createManualPose(rig, {cx: 500, cy: 400, scale: .55});
      pose.facing = facing;
      const before = resolveManualJoints(rig, pose);
      const elbow0 = before.get('lowerArm' + side), knee0 = before.get('shin' + side);
      const fixedDistance = Math.hypot(knee0.x - elbow0.x, knee0.y - elbow0.y);
      const restArm = pose.localRot.get('upperArm' + side);
      const moved = applyElbowKneeLinkage(rig, pose, side, restArm + .03)
        || applyElbowKneeLinkage(rig, pose, side, restArm - .03);
      assert.equal(moved, true, `${rig.id} ${side}, facing ${facing} has no reachable linked pose`);
      const after = resolveManualJoints(rig, pose);
      const elbow = after.get('lowerArm' + side), knee = after.get('shin' + side);
      assert.ok(Math.abs(Math.hypot(knee.x - elbow.x, knee.y - elbow.y) - fixedDistance) < 1e-6,
        `${rig.id} ${side}, facing ${facing}`);
    }
  });
  test(`${build.name}: linked knees stop before crossing the body centre`, () => {
    const {rig} = build(source);
    for (const facing of [1, -1]) for (const side of ['L', 'R']) {
      for (let delta = -1.2; delta <= 1.2; delta += .05) {
        const pose = createManualPose(rig, {cx: 500, cy: 400, scale: .55});
        pose.facing = facing;
        const rest = pose.localRot.get('upperArm' + side);
        if (!applyElbowKneeLinkage(rig, pose, side, rest + delta)) continue;
        const knee = resolveManualJoints(rig, pose).get('shin' + side);
        const outward = side === 'L' ? -1 : 1;
        assert.ok((knee.x - pose.rootX) * outward * facing >= -1e-7,
          `${rig.id} ${side}, facing ${facing}, delta ${delta}`);
      }
    }
  });
  test(`${build.name}: extreme micro-adjustments keep elbows and knees within limits`, () => {
    const {rig} = build(source);
    for (const facing of [1, -1]) {
      const pose = createManualPose(rig, {cx: 500, cy: 400, scale: 0.55});
      pose.facing = facing;
      for (const [upper, lower, kind, limit] of [
        ['upperArmL', 'lowerArmL', 'wrist', 0.58],
        ['upperArmR', 'lowerArmR', 'wrist', 0.58],
        ['thighL', 'shinL', 'ankle', rig.id === 'bajie-v1' ? 0.95 : 0.3],
        ['thighR', 'shinR', 'ankle', rig.id === 'bajie-v1' ? 0.95 : 0.3],
      ]) {
        for (const [x, y] of [[500, 400], [-2000, -2000], [3000, 3000]]) {
          applyDrag(rig, pose, {kind, chain: [upper, lower]}, x, y);
          const rest = rig.parts.find(p => p.id === lower).defaultPose.rotation || 0;
          assert.ok(Math.abs(pose.localRot.get(lower) - rest) <= limit + 1e-9,
            `${rig.id} ${lower} exceeds micro-adjustment range`);
        }
      }
    }
  });
  test(`${build.name}: elbow and knee pins remain coincident while moving and turning`, () => {
    const {rig} = build(source);
    for (const facing of [1, -1]) {
      for (const swing of [-0.7, 0, 0.7]) {
        const pose = createManualPose(rig, {cx: 500, cy: 400, scale: 0.55});
        pose.facing = facing;
        for (const id of ['upperArmL', 'upperArmR', 'thighL', 'thighR'])
          pose.localRot.set(id, pose.localRot.get(id) + swing);
        const joints = resolveManualJoints(rig, pose);
        for (const [parent, child] of [
          ['upperArmL', 'lowerArmL'], ['upperArmR', 'lowerArmR'],
          ['thighL', 'shinL'], ['thighR', 'shinR'], ['lowerArmR', 'staff'],
        ]) {
          const tip = distalTip(joints.get(parent), pose.scale);
          const pin = joints.get(child);
          assert.ok(Math.hypot(tip.x - pin.x, tip.y - pin.y) < 1e-7,
            `${rig.id} ${parent}/${child}, facing ${facing}, swing ${swing}`);
        }
      }
    }
  });
}
