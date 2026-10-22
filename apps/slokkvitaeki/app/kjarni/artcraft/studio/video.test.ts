import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clampFrames,
  clipSeconds,
  mergeMotion,
  motionLine,
  normalizeVideo,
  pingPong,
  videoDenoising,
} from "./video.ts";

test("motion line asks for the same person", () => {
  assert.match(motionLine("head"), /same adult person|same identity|same face/);
  assert.match(motionLine("turn"), /same adult person/);
});

test("mergeMotion appends once", () => {
  const once = mergeMotion("red dress", "breathe");
  assert.match(once, /red dress/);
  assert.match(once, /breathing/);
  assert.equal(mergeMotion(once, "breathe"), once);
});

test("videoDenoising stays in a keep-identity band", () => {
  assert.ok(videoDenoising(1) >= 0.1);
  assert.ok(videoDenoising(1) < videoDenoising(10));
  assert.ok(videoDenoising(10) <= 0.35);
  assert.equal(videoDenoising(99), videoDenoising(10));
});

test("pingPong loops without a jump", () => {
  assert.deepEqual(pingPong(["a"]), ["a"]);
  assert.deepEqual(pingPong(["a", "b", "c", "d"]), ["a", "b", "c", "d", "c", "b"]);
});

test("clip length and clamps", () => {
  assert.equal(clampFrames(2), 4);
  assert.equal(clampFrames(40), 12);
  assert.equal(clipSeconds(8, 8), 1);
  const n = normalizeVideo({ frames: 99, fps: 1, motion: 0, kind: "nope" as never });
  assert.equal(n.frames, 12);
  assert.equal(n.fps, 4);
  assert.equal(n.motion, 1);
  assert.equal(n.kind, "breathe");
});
