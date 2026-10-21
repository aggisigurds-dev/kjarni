import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bodyIsIdentity,
  createRaster,
  liquifyAt,
  maskHasPaint,
  normalizeBody,
  paintMask,
  scaleAtY,
  strokePoints,
  warpBody,
} from "./adjust.ts";

function fillRect(img: ReturnType<typeof createRaster>, x0: number, y0: number, x1: number, y1: number, rgb: number) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * img.width + x) * 4;
      img.data[i] = rgb;
      img.data[i + 1] = rgb;
      img.data[i + 2] = rgb;
      img.data[i + 3] = 255;
    }
  }
}

function lumaAt(img: ReturnType<typeof createRaster>, x: number, y: number): number {
  return img.data[(y * img.width + x) * 4];
}

test("expand pulls bright pixels outward from the center", () => {
  const src = createRaster(32, 32, 0);
  fillRect(src, 16, 16, 16, 16, 255);
  const dest = createRaster(32, 32, 0);
  dest.data.set(src.data);
  liquifyAt(src, dest, 16, 16, 10, 1, "expand");
  assert.ok(lumaAt(dest, 15, 16) > lumaAt(src, 15, 16), "expand should bleed the center pixel outward");
});

test("shrink pulls bright pixels inward", () => {
  const src = createRaster(32, 32, 0);
  fillRect(src, 8, 14, 10, 17, 255);
  const dest = createRaster(32, 32, 0);
  dest.data.set(src.data);
  liquifyAt(src, dest, 16, 16, 12, 1, "shrink");
  assert.ok(lumaAt(dest, 11, 16) > lumaAt(src, 11, 16), "shrink should pull the block toward the center");
});

test("waist slider narrows mid-body more than the hips", () => {
  const slim = scaleAtY(0.48, { bust: 0, waist: -1, hips: 0, width: 0 });
  const hip = scaleAtY(0.64, { bust: 0, waist: -1, hips: 0, width: 0 });
  assert.ok(slim < hip);
  assert.ok(slim < 1);
});

test("warpBody with zero amounts copies the source", () => {
  const src = createRaster(8, 8, 90);
  src.data[0] = 12;
  const dest = createRaster(8, 8, 0);
  warpBody(src, dest, normalizeBody({}));
  assert.equal(dest.data[0], 12);
  assert.equal(bodyIsIdentity(normalizeBody({})), true);
});

test("paintMask marks the brush and maskHasPaint sees it", () => {
  const mask = createRaster(24, 24, 0);
  assert.equal(maskHasPaint(mask), false);
  paintMask(mask, 12, 12, 6, 255);
  assert.equal(maskHasPaint(mask), true);
  assert.ok(mask.data[(12 * 24 + 12) * 4] > 200);
  paintMask(mask, 12, 12, 8, 0);
  assert.equal(maskHasPaint(mask), false);
});

test("strokePoints interpolates along a drag", () => {
  const pts = strokePoints(0, 0, 10, 0, 5);
  assert.ok(pts.length >= 2);
  assert.equal(pts[pts.length - 1].x, 10);
});
