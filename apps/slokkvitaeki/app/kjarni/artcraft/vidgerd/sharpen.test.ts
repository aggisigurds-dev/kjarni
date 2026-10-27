import assert from "node:assert/strict";
import { test } from "node:test";
import { applySharpen, boxBlur, DEFAULT_SHARPEN_SETTINGS, type PixelBuffer } from "./sharpen.ts";

function solidImage(width: number, height: number, [r, g, b, a]: [number, number, number, number]): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  return { data, width, height };
}

test("amount=0 leaves the image byte-for-byte unchanged", () => {
  const image = solidImage(6, 6, [90, 140, 30, 255]);
  image.data[4 * 4] = 250; // one outlier pixel so it isn't trivially flat
  const out = applySharpen(image, { amount: 0, radius: 3 });
  assert.deepEqual(Array.from(out.data), Array.from(image.data));
});

test("boxBlur on a flat image returns the same flat image", () => {
  const image = solidImage(10, 10, [120, 80, 200, 255]);
  const blurred = boxBlur(image, 3);
  assert.equal(blurred.data[0], 120);
  assert.equal(blurred.data[1], 80);
  assert.equal(blurred.data[2], 200);
  // alpha preserved
  assert.equal(blurred.data[3], 255);
});

test("sharpening a flat image changes nothing — no edges to exaggerate", () => {
  const image = solidImage(10, 10, [100, 100, 100, 255]);
  const out = applySharpen(image, DEFAULT_SHARPEN_SETTINGS);
  for (let i = 0; i < out.data.length; i += 4) {
    assert.equal(out.data[i], 100);
    assert.equal(out.data[i + 1], 100);
    assert.equal(out.data[i + 2], 100);
  }
});

test("unsharp mask exaggerates a step edge — bright side gets brighter, dark side darker", () => {
  const width = 20;
  const height = 4;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = x < width / 2 ? 50 : 200;
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  const image: PixelBuffer = { data, width, height };
  const out = applySharpen(image, { amount: 1, radius: 2 });

  // just left of the seam (still on the dark side, near the edge): sharpened
  // should be darker than the original flat 50, since the blurred average
  // there is pulled up by the bright side, so (orig - blur) < 0.
  const leftOfSeam = (2 * width + (width / 2 - 1)) * 4;
  assert.ok(out.data[leftOfSeam] < image.data[leftOfSeam], `expected overshoot darker than 50, got ${out.data[leftOfSeam]}`);

  // just right of the seam: sharpened should be brighter than the original flat 200.
  const rightOfSeam = (2 * width + width / 2) * 4;
  assert.ok(out.data[rightOfSeam] > image.data[rightOfSeam], `expected overshoot brighter than 200, got ${out.data[rightOfSeam]}`);

  // far from the seam, flat regions stay flat (no blur influence from the edge there).
  assert.equal(out.data[(2 * width + 0) * 4], 50);
  assert.equal(out.data[(2 * width + width - 1) * 4], 200);
});

test("alpha channel is always preserved", () => {
  const image = solidImage(5, 5, [10, 20, 30, 128]);
  const out = applySharpen(image, { amount: 1.5, radius: 2 });
  for (let i = 3; i < out.data.length; i += 4) {
    assert.equal(out.data[i], 128);
  }
});

test("output is clamped to 0..255 even at strong amount on a high-contrast edge", () => {
  const width = 10;
  const height = 2;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = x < width / 2 ? 0 : 255;
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  const out = applySharpen({ data, width, height }, { amount: 2, radius: 1 });
  for (const v of out.data) assert.ok(v >= 0 && v <= 255);
});
