import test from 'node:test';
import assert from 'node:assert/strict';
import {createRodControls, armRotationFromRod} from '../src/rodControls.js';
import {createManualPose, resolveManualJoints} from '../src/dragPose.js';

// Exercise the production pointer handlers with two simultaneous pointers.
// DOM geometry is stubbed; raster and real-browser dragging remain separate QA.
function element(rect) {
  const listeners = new Map();
  const captured = new Set();
  return {
    style: {}, children: [], classList: {add() {}, remove() {}},
    setAttribute() {}, remove() {},
    append(child) { this.children.push(child); },
    replaceChildren() { this.children = []; },
    addEventListener(type, fn) { listeners.set(type, fn); },
    getBoundingClientRect() { return rect; },
    setPointerCapture(id) { captured.add(id); },
    hasPointerCapture(id) { return captured.has(id); },
    releasePointerCapture(id) { captured.delete(id); },
    emit(type, pointerId, clientX, clientY) {
      listeners.get(type)({pointerId, clientX, clientY, pointerType: 'touch', preventDefault() {}});
    },
    key(key) { listeners.get('keydown')({key, preventDefault() {}}); },
  };
}

test('moving either held arm rod preserves the other held arm and passive elbow', () => {
  const column = element({left: 0, top: 0, width: 900, height: 900});
  const rail = element({left: 0, top: 800, right: 900, bottom: 880, width: 900, height: 80});
  const canvas = element({left: 0, top: 0, bottom: 720, width: 900, height: 720});
  canvas.width = 900; canvas.height = 720; canvas.closest = () => column;
  const turn = element({});
  globalThis.document = {
    createElement: () => element({left: 200, top: 800, width: 92, height: 58}),
    createElementNS: () => element({}),
    getElementById: () => turn, addEventListener() {},
  };
  globalThis.window = {addEventListener() {}};
  globalThis.ResizeObserver = class { observe() {} };
  const rig = {parts: [
    {id: 'torso', defaultPose: {}},
    {id: 'upperArmL', defaultPose: {x: -80, y: -150, parent: 'torso'}},
    {id: 'upperArmR', defaultPose: {x: 80, y: -150, parent: 'torso'}},
    {id: 'lowerArmL', defaultPose: {x: 0, y: 100, parent: 'upperArmL', rotation: 0.2}},
    {id: 'lowerArmR', defaultPose: {x: 0, y: 100, parent: 'upperArmR', rotation: -0.2}},
  ]};
  const pose = createManualPose(rig, {cx: 450, cy: 350});
  const controls = createRodControls({railEl: rail, canvas, getPose: () => pose, getRig: () => rig, onPoseChange() {}});
  const [left, right] = rail.children;
  left.emit('pointerdown', 1, 246, 820);
  right.emit('pointerdown', 2, 246, 820);
  left.emit('pointermove', 1, 400, 820);
  const leftAngle = pose.localRot.get('upperArmL');
  assert.notEqual(leftAngle, 0);
  right.emit('pointermove', 2, 500, 820);
  assert.equal(pose.localRot.get('upperArmL'), leftAngle);
  const rightAngle = pose.localRot.get('upperArmR');
  left.emit('pointermove', 1, 350, 820);
  assert.equal(pose.localRot.get('upperArmR'), rightAngle);
  assert.equal(pose.localRot.get('lowerArmL'), 0.2);
  assert.equal(pose.localRot.get('lowerArmR'), -0.2);
  left.emit('pointerup', 1, 350, 820);
  right.emit('pointerup', 2, 500, 820);
  const start = {...pose.rodEnds.left};
  const joint = resolveManualJoints(rig, pose).get('lowerArmL');
  const previous = pose.localRot.get('upperArmL');
  left.key('ArrowRight');
  const end = pose.rodEnds.left;
  assert.equal(end.x, start.x + 12);
  assert.equal(pose.localRot.get('upperArmL'), armRotationFromRod(previous, 0,
    Math.atan2(start.y - joint.y, start.x - joint.x),
    Math.atan2(end.y - joint.y, end.x - joint.x), pose.facing));
  for (let i = 0; i < 100; i++) left.key('ArrowUp');
  assert.ok(Math.abs(pose.rodEnds.left.y - 738) < 1e-9);
  const boundaryAngle = pose.localRot.get('upperArmL');
  left.key('ArrowUp');
  assert.equal(pose.localRot.get('upperArmL'), boundaryAngle);
  assert.equal(pose.localRot.get('upperArmR'), rightAngle);
  assert.equal(pose.localRot.get('lowerArmL'), 0.2);
  left.emit('pointerdown', 3, 246, 820);
  assert.equal(controls.isDragging(), true);
  controls.setVisible(false);
  assert.equal(controls.isDragging(), false);
  const hiddenAngle = pose.localRot.get('upperArmL');
  left.emit('pointermove', 3, 700, 820);
  assert.equal(pose.localRot.get('upperArmL'), hiddenAngle);
  controls.setVisible(true);
  controls.resetGripPositions();
  assert.deepEqual(pose.rodEnds, {});
});
