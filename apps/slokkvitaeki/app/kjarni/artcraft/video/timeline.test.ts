import assert from "node:assert/strict";
import { test } from "node:test";
import {
  continueAt,
  defaultContinueTime,
  formatSeconds,
  globalTime,
  locate,
  segmentLength,
  snapToFrame,
  totalLength,
} from "./timeline.ts";

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≉ ${b}`);

test("segment length respects in/out points and the file length", () => {
  assert.equal(segmentLength({ duration: 5, inT: 0, outT: 5 }), 5);
  near(segmentLength({ duration: 5, inT: 0.0625, outT: 4 }), 3.9375);
  assert.equal(segmentLength({ duration: 5, inT: 0, outT: 9 }), 5, "out beyond the file is clamped");
  assert.equal(segmentLength({ duration: 5, inT: 4, outT: 3 }), 0, "inverted is empty");
});

test("locate and globalTime are inverse across clip boundaries", () => {
  const segs = [
    { duration: 5, inT: 0, outT: 4 },
    { duration: 5, inT: 0.5, outT: 5 },
  ];
  assert.equal(totalLength(segs), 8.5);
  assert.deepEqual(locate(segs, 1), { index: 0, local: 1 });
  assert.deepEqual(locate(segs, 4), { index: 1, local: 0.5 }, "boundary belongs to the next clip");
  assert.deepEqual(locate(segs, 6), { index: 1, local: 2.5 });
  assert.deepEqual(locate(segs, 99), { index: 1, local: 5 }, "past the end clamps to the end");
  for (const t of [0, 0.7, 3.99, 4, 5.25, 8.5]) {
    const { index, local } = locate(segs, t);
    near(globalTime(segs, index, local), t);
  }
});

test("continuing from a frame trims there, drops what follows, and skips the duplicated seam frame", () => {
  const segs = [
    { duration: 5, inT: 0, outT: 5, id: "a" },
    { duration: 5, inT: 0.0625, outT: 5, id: "b" },
  ];
  // Halda áfram 1 s fyrir enda fyrstu klippunnar: b dettur út.
  const out = continueAt(segs, 4, { duration: 5, inT: 0, outT: 5, id: "c" }, 16);
  assert.deepEqual(
    out.map((s) => s.id),
    ["a", "c"],
  );
  assert.equal(out[0].outT, 4);
  near(out[1].inT, 1 / 16);
  near(totalLength(out), 4 + 5 - 1 / 16);
  assert.deepEqual(continueAt([], 3, { duration: 5, inT: 0, outT: 5 }), [{ duration: 5, inT: 0, outT: 5 }]);
});

test("default continue point is a second before the end; frames snap to the frame grid", () => {
  assert.equal(defaultContinueTime(5.0625), 4.0625);
  assert.equal(defaultContinueTime(0.5), 0);
  assert.equal(defaultContinueTime(Number.NaN), 0);
  near(snapToFrame(4.03, 16), 4);
  near(snapToFrame(4.04, 16), 4.0625);
  assert.equal(formatSeconds(6.25), "6,3");
  assert.equal(formatSeconds(-1), "0,0");
});
