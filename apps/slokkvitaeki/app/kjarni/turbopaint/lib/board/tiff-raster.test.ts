import assert from "node:assert/strict";
import { test } from "node:test";
import { PDF_SAFE_AREA } from "./import-limits";
import { downsampleTiffData, planTiffRaster } from "./tiff-raster";

test("9933×7081 TIF is planned down to the 40 MP budget", () => {
  const plan = planTiffRaster(9933, 7081, 7200);
  assert.ok(plan.width * plan.height <= PDF_SAFE_AREA);
  assert.ok(plan.width < 9933);
  assert.ok(plan.warning);
});

test("downsamples gray TIF without allocating full-resolution RGBA", () => {
  const srcW = 100;
  const srcH = 50;
  const data = new Uint8Array(srcW * srcH);
  data[0] = 255;
  data[srcW * srcH - 1] = 128;
  const out = downsampleTiffData(data, srcW, srcH, 20);
  assert.equal(out.width, 20);
  assert.equal(out.height, 10);
  assert.equal(out.rgba.length, 20 * 10 * 4);
  assert.equal(out.rgba[0], 255);
  assert.equal(out.rgba[1], 255);
  assert.equal(out.rgba[2], 255);
  assert.equal(out.rgba[3], 255);
});

test("ordinary small TIF keeps native size", () => {
  const plan = planTiffRaster(800, 600, 7200);
  assert.equal(plan.width, 800);
  assert.equal(plan.height, 600);
  assert.equal(plan.warning, undefined);
});
