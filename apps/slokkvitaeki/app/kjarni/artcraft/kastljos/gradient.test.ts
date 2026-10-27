import assert from "node:assert/strict";
import { test } from "node:test";
import { applySpotlight, directionFactor, type PixelBuffer } from "./gradient.ts";

function solidBuffer(width: number, height: number, [r, g, b, a]: [number, number, number, number]): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  return { data, width, height };
}

test("directionFactor is 1 at the named edge, 0 at the opposite edge", () => {
  assert.equal(directionFactor("upp", 5, 0, 10, 10), 1);
  assert.equal(directionFactor("upp", 5, 9, 10, 10), 0);
  assert.equal(directionFactor("nidur", 5, 9, 10, 10), 1);
  assert.equal(directionFactor("nidur", 5, 0, 10, 10), 0);
  assert.equal(directionFactor("vinstri", 0, 5, 10, 10), 1);
  assert.equal(directionFactor("vinstri", 9, 5, 10, 10), 0);
  assert.equal(directionFactor("haegri", 9, 5, 10, 10), 1);
  assert.equal(directionFactor("haegri", 0, 5, 10, 10), 0);
});

test("directionFactor doesn't divide by zero on a 1px-wide/tall image", () => {
  assert.equal(directionFactor("upp", 0, 0, 1, 1), 0);
  assert.equal(directionFactor("haegri", 0, 0, 1, 1), 0);
});

test("pure background (alpha=0 mask) darkens toward the chosen edge, person untouched elsewhere", () => {
  // 1x4 column, white image, fully background (mask alpha 0 everywhere)
  const image = solidBuffer(1, 4, [200, 200, 200, 255]);
  const mask = solidBuffer(1, 4, [0, 0, 0, 0]);
  const out = applySpotlight(image, mask, {
    backgroundDirection: "nidur",
    backgroundStrength: 1,
    personDirection: "upp",
    personStrength: 0,
  });
  // top row (y=0): factor 0 -> unchanged; bottom row (y=3): factor 1 -> fully dark
  assert.equal(out.data[0], 200);
  assert.equal(out.data[(3 * 1) * 4], 0);
  // monotonically darker going down
  assert.ok(out.data[0 * 4] >= out.data[1 * 4]);
  assert.ok(out.data[1 * 4] >= out.data[2 * 4]);
  assert.ok(out.data[2 * 4] >= out.data[3 * 4]);
});

test("pure person (alpha=255 mask) is brightened toward the chosen edge when backgroundStrength=0", () => {
  const image = solidBuffer(1, 4, [100, 100, 100, 255]);
  const mask = solidBuffer(1, 4, [255, 255, 255, 255]);
  const out = applySpotlight(image, mask, {
    backgroundDirection: "nidur",
    backgroundStrength: 1, // irrelevant: bgWeight is 0 everywhere here
    personDirection: "upp",
    personStrength: 1,
  });
  assert.equal(out.data[0], 200); // top: factor 1, 100 * (1+1) = 200
  assert.equal(out.data[3 * 4], 100); // bottom: factor 0, unchanged
});

test("negative personStrength darkens the person instead", () => {
  const image = solidBuffer(1, 2, [200, 200, 200, 255]);
  const mask = solidBuffer(1, 2, [255, 255, 255, 255]);
  const out = applySpotlight(image, mask, {
    backgroundDirection: "nidur",
    backgroundStrength: 0,
    personDirection: "upp",
    personStrength: -0.5,
  });
  assert.equal(out.data[0], 100); // top: factor 1, 200 * (1 - 0.5) = 100
  assert.equal(out.data[1 * 4], 200); // bottom: factor 0, unchanged
});

test("soft mask edge blends background darkening and person brightening smoothly", () => {
  const image = solidBuffer(1, 1, [100, 100, 100, 255]);
  const halfMask = solidBuffer(1, 1, [0, 0, 0, 128]); // ~50% person
  const out = applySpotlight(image, halfMask, {
    backgroundDirection: "nidur",
    backgroundStrength: 1,
    personDirection: "nidur",
    personStrength: 1,
  });
  // single pixel is at the "nidur" edge for both (factor 1 either way):
  // multiplier = 1 - bgWeight*1*1 + personWeight*1*1, bgWeight≈personWeight≈0.5 -> ≈ unchanged
  assert.ok(Math.abs(out.data[0] - 100) <= 2);
});

test("strength is clamped into its valid range", () => {
  const image = solidBuffer(1, 2, [200, 200, 200, 255]);
  const mask = solidBuffer(1, 2, [0, 0, 0, 0]);
  const out = applySpotlight(image, mask, {
    backgroundDirection: "nidur",
    backgroundStrength: 5, // way out of range, should clamp to 1
    personDirection: "upp",
    personStrength: 0,
  });
  assert.equal(out.data[1 * 4], 0); // bottom row (factor 1), same as backgroundStrength=1
});
