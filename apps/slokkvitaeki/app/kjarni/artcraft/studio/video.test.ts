import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BUILTIN_ACTIONS,
  clampFrames,
  clipSeconds,
  commandFromPrompt,
  findAction,
  loopFrames,
  mergeMotion,
  motionLine,
  normalizeVideo,
  pingPong,
  saveCustomAction,
  resolveClipSeed,
  videoDenoising,
  videoFrameInit,
  videoFrameSeed,
  VIDEO_DENOISING_MAX,
} from "./video.ts";

test("built-in actions cover dance, poses, stand and spin", () => {
  const ids = BUILTIN_ACTIONS.map((a) => a.id);
  for (const id of ["dance", "poses", "stand", "spin", "breathe"]) {
    assert.ok(ids.includes(id), id);
  }
  assert.match(motionLine("dance"), /dancing/);
  assert.match(motionLine("stand"), /standing up/);
  assert.match(motionLine("spin"), /360/);
  assert.match(motionLine("poses"), /poses/);
});

test("motion line asks for the same person", () => {
  assert.match(motionLine("head"), /same adult person|same identity|same face/);
  assert.match(motionLine("turn"), /same adult person/);
});

test("mergeMotion appends once and uses a saved command", () => {
  const once = mergeMotion("red dress", "breathe");
  assert.match(once, /red dress/);
  assert.match(once, /breathing/);
  assert.equal(mergeMotion(once, "breathe"), once);
  const custom = [{ id: "c_1", label: "Vinka", prompt: "waving hello, same adult person", custom: true, loop: "forward" as const, motion: 6 }];
  assert.match(mergeMotion("studio", "c_1", custom), /waving hello/);
});

test("commandFromPrompt saves a named action from prompt text", () => {
  assert.equal(commandFromPrompt("Dans", "   "), null);
  const row = commandFromPrompt("Salsa", "salsa dance, keep face");
  assert.ok(row);
  assert.equal(row?.label, "Salsa");
  assert.equal(row?.prompt, "salsa dance, keep face");
  assert.equal(row?.custom, true);
  assert.match(row?.id || "", /^c_/);
});

test("findAction falls back to breathe and saveCustomAction prepends", () => {
  assert.equal(findAction("missing").id, "breathe");
  const saved = saveCustomAction([], {
    id: "c_x",
    label: "Hoppa",
    prompt: "jump once",
    custom: true,
    loop: "forward",
    motion: 6,
  });
  assert.equal(saved[0].label, "Hoppa");
});

test("loopFrames ping-pongs subtle moves and keeps dance forward", () => {
  const frames = ["a", "b", "c", "d"];
  assert.deepEqual(loopFrames(frames, "breathe"), ["a", "b", "c", "d", "c", "b"]);
  assert.deepEqual(loopFrames(frames, "dance"), frames);
  assert.deepEqual(pingPong(["a"]), ["a"]);
});

test("videoDenoising stays in a keep-identity band", () => {
  assert.ok(videoDenoising(1) >= 0.1);
  assert.ok(videoDenoising(1) < videoDenoising(10));
  assert.ok(videoDenoising(10) <= VIDEO_DENOISING_MAX);
  assert.equal(videoDenoising(99), videoDenoising(10));
});

test("clip seed is locked and frames start from the original still", () => {
  assert.equal(resolveClipSeed(42), 42);
  assert.ok(resolveClipSeed(-1, () => 0.5) >= 0);
  assert.equal(videoFrameSeed(100, 3), 103);
  assert.equal(videoFrameInit("orig", "other-woman"), "orig");
});

test("clip length and clamps", () => {
  assert.equal(clampFrames(2), 4);
  assert.equal(clampFrames(40), 16);
  assert.equal(clipSeconds(8, 8), 1);
  const n = normalizeVideo({ frames: 99, fps: 1, motion: 0, kind: "c_saved" });
  assert.equal(n.frames, 16);
  assert.equal(n.fps, 4);
  assert.equal(n.motion, 1);
  assert.equal(n.kind, "c_saved");
});
