import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BODY_PARTS,
  coverageLabel,
  hitPart,
  imprintPrompt,
  partBox,
  partCoverage,
  pickKeyFrame,
  isClipStamp,
  stampIds,
} from "./parts.ts";

test("six body parts cover a full-body A-pose", () => {
  assert.equal(BODY_PARTS.length, 6);
  assert.ok(BODY_PARTS.every((p) => p.w > 0 && p.h > 0 && p.x + p.w <= 1.01 && p.y + p.h <= 1.01));
});

test("hitPart finds the head and misses the gap", () => {
  const head = hitPart(0.5, 0.1);
  assert.equal(head?.id, "head");
  assert.equal(hitPart(0.01, 0.01), null);
});

test("partBox scales to pixels", () => {
  const box = partBox(1000, 2000, BODY_PARTS[0]);
  assert.equal(box.x, 320);
  assert.equal(box.y, 60);
  assert.equal(box.w, 360);
  assert.equal(box.h, 360);
});

test("coverage counts unique stamped parts", () => {
  assert.equal(partCoverage([]), 0);
  assert.equal(partCoverage(["head", "torso", "head"]), 2 / 6);
  assert.match(coverageLabel(["head", "torso", "armL"]), /3 af 6/);
  assert.match(imprintPrompt(BODY_PARTS[0], "Sara"), /Sara/);
  assert.match(imprintPrompt(BODY_PARTS[0], "Sara"), /Andlit/);
});

test("video stamps keep a key frame and count clip frames", () => {
  assert.equal(pickKeyFrame(["a", "b", "c", "d"]), "b");
  assert.equal(pickKeyFrame(["only"]), "only");
  assert.equal(pickKeyFrame([]), "");
  assert.equal(isClipStamp({ image: "a", frames: ["a", "b", "c"] }), true);
  assert.equal(isClipStamp({ image: "a", frames: ["a"] }), false);
  assert.equal(isClipStamp({ image: "a" }), false);
  assert.deepEqual(stampIds({ head: { image: "x", frames: ["x", "y"] }, torso: "" }), ["head"]);
  assert.deepEqual(stampIds({ head: { image: "face" }, armL: { image: "hand", frames: ["1", "2"] } }), [
    "head",
    "armL",
  ]);
});
