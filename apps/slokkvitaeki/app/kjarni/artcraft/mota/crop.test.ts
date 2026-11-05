import assert from "node:assert/strict";
import { test } from "node:test";
import { aspectRatio, clampRect, cropPixels, dragCrop, fitAspect, isFullImage, roundRect } from "./crop.ts";

const W = 4000;
const H = 3000;
const full = { x: 0, y: 0, w: W, h: H };
const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test("choosing an aspect gives the largest centred frame of that shape", () => {
  const sq = fitAspect(full, 1, W, H);
  assert.deepEqual(sq, { x: 500, y: 0, w: 3000, h: 3000 });
  const tall = fitAspect(full, 9 / 16, W, H);
  near(tall.h, 3000);
  near(tall.w, 3000 * (9 / 16));
  near(tall.x + tall.w / 2, 2000);
  assert.deepEqual(fitAspect(full, null, W, H), full);
  near(aspectRatio("orig", W, H)!, 4 / 3);
  assert.equal(aspectRatio("free", W, H), null);
});

test("free corner drag moves only that corner and stays inside the photo", () => {
  const r = dragCrop(full, "se", -1000, -500, null, W, H);
  assert.deepEqual(r, { x: 0, y: 0, w: 3000, h: 2500 });
  const out = dragCrop(full, "nw", -200, -200, null, W, H);
  assert.deepEqual(out, full, "cannot grow past the edges");
  const tiny = dragCrop(full, "e", -10000, 0, null, W, H, 32);
  assert.equal(tiny.w, 32, "minimum size");
});

test("locked aspect: corner drag keeps the ratio and the opposite corner", () => {
  const start = fitAspect(full, 1, W, H); // 3000×3000 at x=500
  const r = dragCrop(start, "se", -1000, 0, 1, W, H);
  near(r.w, 2000);
  near(r.h, 2000);
  near(r.x, 500);
  near(r.y, 0);
  const n = dragCrop(start, "nw", 600, 900, 1, W, H);
  near(n.w / n.h, 1);
  near(n.x + n.w, 3500, 1e-6);
  near(n.y + n.h, 3000, 1e-6);
  // Kantur með hlutfalli: miðjan helst á hinum ásnum.
  const e = dragCrop({ x: 1000, y: 1000, w: 1000, h: 1000 }, "e", 400, 0, 1, W, H);
  near(e.w, 1400);
  near(e.h, 1400);
  near(e.y + e.h / 2, 1500);
  // Má ekki stækka út fyrir myndina.
  const big = dragCrop(start, "se", 5000, 5000, 1, W, H);
  assert.ok(big.x + big.w <= W + 1e-6 && big.y + big.h <= H + 1e-6);
  near(big.w / big.h, 1);
});

test("moving and rounding", () => {
  const r = dragCrop({ x: 100, y: 100, w: 1000, h: 800 }, "move", 99999, -500, null, W, H);
  assert.deepEqual(r, { x: 3000, y: 0, w: 1000, h: 800 });
  assert.deepEqual(roundRect({ x: 10.4, y: 0.6, w: 99.6, h: 50.2 }, W, H), { x: 10, y: 1, w: 100, h: 50 });
  assert.ok(isFullImage(full, W, H));
  assert.ok(!isFullImage({ x: 1, y: 0, w: W - 1, h: H }, W, H));
  assert.deepEqual(clampRect({ x: -50, y: 2900, w: 500, h: 500 }, W, H), { x: 0, y: 2500, w: 500, h: 500 });
});

test("cropping copies exactly the pixels inside the frame", () => {
  const w = 5, h = 4;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data[i * 4] = i;
  const out = cropPixels({ data, width: w, height: h }, { x: 1, y: 2, w: 3, h: 2 });
  assert.equal(out.width, 3);
  assert.equal(out.height, 2);
  assert.deepEqual(Array.from({ length: 6 }, (_, i) => out.data[i * 4]), [11, 12, 13, 16, 17, 18]);
});
