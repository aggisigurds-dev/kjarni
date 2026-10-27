import assert from "node:assert/strict";
import { test } from "node:test";
import { createRaster } from "../studio/adjust.ts";
import { compositeMaskOverlay, maskCoverage, paintCircle } from "./maskPaint.ts";

function pixelAt(mask: { data: Uint8ClampedArray; width: number }, x: number, y: number) {
  const i = (y * mask.width + x) * 4;
  return { r: mask.data[i], g: mask.data[i + 1], b: mask.data[i + 2], a: mask.data[i + 3] };
}

test("paintCircle starts from an all-black mask (preserve everything)", () => {
  const mask = createRaster(10, 10, 0);
  assert.equal(maskCoverage(mask), 0);
  const p = pixelAt(mask, 5, 5);
  assert.deepEqual(p, { r: 0, g: 0, b: 0, a: 255 });
});

test("paintCircle paints a solid white disc centered at (cx, cy)", () => {
  const mask = createRaster(20, 20, 0);
  paintCircle(mask, 10, 10, 4);
  assert.deepEqual(pixelAt(mask, 10, 10), { r: 255, g: 255, b: 255, a: 255 }); // center
  assert.deepEqual(pixelAt(mask, 10, 6), { r: 255, g: 255, b: 255, a: 255 }); // on the edge (dist 4)
  assert.deepEqual(pixelAt(mask, 10, 0), { r: 0, g: 0, b: 0, a: 255 }); // well outside
});

test("paintCircle clips to the raster bounds without throwing", () => {
  const mask = createRaster(10, 10, 0);
  assert.doesNotThrow(() => paintCircle(mask, 0, 0, 20));
  assert.deepEqual(pixelAt(mask, 0, 0), { r: 255, g: 255, b: 255, a: 255 });
  assert.deepEqual(pixelAt(mask, 9, 9), { r: 255, g: 255, b: 255, a: 255 });
});

test("maskCoverage reports the painted fraction of the mask", () => {
  const mask = createRaster(10, 10, 0);
  assert.equal(maskCoverage(mask), 0);
  paintCircle(mask, 5, 5, 100); // covers the whole 10x10 raster
  assert.equal(maskCoverage(mask), 1);
});

test("paintCircle strokes accumulate — multiple dabs grow coverage, never shrink it", () => {
  const mask = createRaster(40, 40, 0);
  paintCircle(mask, 10, 10, 5);
  const after1 = maskCoverage(mask);
  assert.ok(after1 > 0);
  paintCircle(mask, 30, 30, 5);
  const after2 = maskCoverage(mask);
  assert.ok(after2 > after1);
});

test("compositeMaskOverlay leaves unpainted pixels untouched", () => {
  const source = createRaster(10, 10, 100);
  const mask = createRaster(10, 10, 0);
  const out = compositeMaskOverlay(source, mask);
  const i = (5 * 10 + 5) * 4;
  assert.deepEqual([out.data[i], out.data[i + 1], out.data[i + 2]], [100, 100, 100]);
});

test("compositeMaskOverlay blends the tint onto painted pixels without mutating the inputs", () => {
  const source = createRaster(10, 10, 100);
  const mask = createRaster(10, 10, 0);
  paintCircle(mask, 5, 5, 3);
  const out = compositeMaskOverlay(source, mask, [255, 0, 0], 0.5);
  const i = (5 * 10 + 5) * 4;
  assert.equal(out.data[i], 178); // 100*0.5 + 255*0.5 = 177.5 -> clamped/rounded by Uint8ClampedArray
  assert.equal(out.data[i + 1], 50); // 100*0.5 + 0*0.5 = 50
  // source raster itself must be unchanged
  assert.equal(source.data[i], 100);
});
