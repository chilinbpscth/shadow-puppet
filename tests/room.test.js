import test from "node:test";
import assert from "node:assert/strict";
import {
  generateRoomCode,
  roomMissingMessage,
  poseToPayload,
  payloadToPoseFields,
  P2A_SEAT_IDS,
  MAX_SEATS_P2A,
  seatIdsForP2a,
} from "../src/live/room.js";

test("generateRoomCode is 6 chars from allowed alphabet", () => {
  const code = generateRoomCode(6);
  assert.equal(code.length, 6);
  assert.match(code, /^[A-HJ-NP-Z2-9]+$/);
});

test("roomMissingMessage hints 6-digit codes for short mistypes", () => {
  assert.equal(roomMissingMessage("D4BB9"), "房間碼通常 6 位，請對齊老師螢幕");
  assert.equal(roomMissingMessage("ABCD"), "房間碼通常 6 位，請對齊老師螢幕");
  assert.equal(roomMissingMessage("D4BB97"), "搵唔到呢個房間");
  assert.equal(roomMissingMessage("ABCDEF"), "搵唔到呢個房間");
});

test("pose payload round-trip keeps rods and facing", () => {
  const pose = {
    rootX: 120.4,
    rootY: 330.6,
    scale: 0.58,
    facing: -1,
    localRot: new Map([
      ["upperArmR", 0.25],
      ["lowerArmR", -0.5],
    ]),
  };
  const payload = poseToPayload(pose);
  assert.equal(payload.x, 120);
  assert.equal(payload.y, 331);
  assert.equal(payload.facing, -1);
  assert.equal(payload.rods.upperArmR, 0.25);
  const fields = payloadToPoseFields(payload);
  assert.equal(fields.facing, -1);
  assert.equal(fields.localRot.get("upperArmR"), 0.25);
  assert.equal(fields.localRot.get("lowerArmR"), -0.5);
});

test("P2a seat roster is four characters", () => {
  assert.equal(MAX_SEATS_P2A, 4);
  assert.equal(P2A_SEAT_IDS.length, 4);
  const ids = seatIdsForP2a();
  assert.equal(ids.length, 4);
  assert.deepEqual(ids, P2A_SEAT_IDS);
});
