import assert from "node:assert/strict";
import { test } from "node:test";
import { applySpotlight, directionFactor, edgeMultiplier, normalizeEdges, ZERO_EDGES, type PixelBuffer } from "./gradient.ts";

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

test("normalizeEdges fills in missing edges as 0 and clamps to -100..100", () => {
  assert.deepEqual(normalizeEdges(null), ZERO_EDGES);
  assert.deepEqual(normalizeEdges({ nidur: -500, haegri: 500 }), { upp: 0, nidur: -100, vinstri: 0, haegri: 100 });
});

test("edgeMultiplier sums several edges at once — a corner gets both", () => {
  // bottom-right corner: full "nidur" and full "haegri" factor
  const edges = { upp: 0, nidur: -50, vinstri: 0, haegri: -25 };
  assert.ok(Math.abs(edgeMultiplier(edges, 9, 9, 10, 10) - (-0.75)) < 1e-9);
  // top-left corner: neither nidur nor haegri contribute
  assert.equal(edgeMultiplier(edges, 0, 0, 10, 10), 0);
});

test("pure background darkens toward a negative edge, person untouched elsewhere", () => {
  // 1x4 column, white image, fully background (mask alpha 0 everywhere)
  const image = solidBuffer(1, 4, [200, 200, 200, 255]);
  const mask = solidBuffer(1, 4, [0, 0, 0, 0]);
  const out = applySpotlight(image, mask, {
    background: { upp: 0, nidur: -100, vinstri: 0, haegri: 0 },
    person: ZERO_EDGES,
  });
  // top row (y=0): factor 0 -> unchanged; bottom row (y=3): factor 1 -> fully dark
  assert.equal(out.data[0], 200);
  assert.equal(out.data[3 * 4], 0);
  // monotonically darker going down
  assert.ok(out.data[0 * 4] >= out.data[1 * 4]);
  assert.ok(out.data[1 * 4] >= out.data[2 * 4]);
  assert.ok(out.data[2 * 4] >= out.data[3 * 4]);
});

test("positive background edge brightens instead of darkening", () => {
  const image = solidBuffer(1, 2, [100, 100, 100, 255]);
  const mask = solidBuffer(1, 2, [0, 0, 0, 0]);
  const out = applySpotlight(image, mask, {
    background: { upp: 100, nidur: 0, vinstri: 0, haegri: 0 },
    person: ZERO_EDGES,
  });
  assert.equal(out.data[0], 200); // top: factor 1, 100 * (1+1) = 200
  assert.equal(out.data[1 * 4], 100); // bottom: factor 0, unchanged
});

test("pure person (alpha=255 mask) is brightened toward the chosen edge when background is zero", () => {
  const image = solidBuffer(1, 4, [100, 100, 100, 255]);
  const mask = solidBuffer(1, 4, [255, 255, 255, 255]);
  const out = applySpotlight(image, mask, {
    background: { upp: 0, nidur: 100, vinstri: 0, haegri: 0 }, // irrelevant: bgWeight is 0 everywhere here
    person: { upp: 100, nidur: 0, vinstri: 0, haegri: 0 },
  });
  assert.equal(out.data[0], 200); // top: factor 1, 100 * (1+1) = 200
  assert.equal(out.data[3 * 4], 100); // bottom: factor 0, unchanged
});

test("negative person edge darkens the person instead", () => {
  const image = solidBuffer(1, 2, [200, 200, 200, 255]);
  const mask = solidBuffer(1, 2, [255, 255, 255, 255]);
  const out = applySpotlight(image, mask, {
    background: ZERO_EDGES,
    person: { upp: -50, nidur: 0, vinstri: 0, haegri: 0 },
  });
  assert.equal(out.data[0], 100); // top: factor 1, 200 * (1 - 0.5) = 100
  assert.equal(out.data[1 * 4], 200); // bottom: factor 0, unchanged
});

test("soft mask edge blends background darkening and person brightening smoothly", () => {
  const image = solidBuffer(1, 1, [100, 100, 100, 255]);
  const halfMask = solidBuffer(1, 1, [0, 0, 0, 128]); // ~50% person
  const out = applySpotlight(image, halfMask, {
    background: { upp: 0, nidur: -100, vinstri: 0, haegri: 0 },
    person: { upp: 0, nidur: 100, vinstri: 0, haegri: 0 },
  });
  // single pixel is at the "nidur" edge for both (factor 1 either way):
  // multiplier = 1 + bgWeight*(-1) + personWeight*(1), bgWeight≈personWeight≈0.5 -> ≈ unchanged
  assert.ok(Math.abs(out.data[0] - 100) <= 2);
});

test("several background edges combine — e.g. dark bottom + darker right corner", () => {
  const image = solidBuffer(2, 2, [200, 200, 200, 255]);
  const mask = solidBuffer(2, 2, [0, 0, 0, 0]);
  const out = applySpotlight(image, mask, {
    background: { upp: 0, nidur: -100, vinstri: 0, haegri: -100 },
    person: ZERO_EDGES,
  });
  // top-left (0,0): neither edge contributes -> unchanged
  assert.equal(out.data[0], 200);
  // bottom-right (1,1): both edges at full factor -> multiplier 1-1-1=-1 -> clamps to 0
  const brIndex = (1 * 2 + 1) * 4;
  assert.equal(out.data[brIndex], 0);
});
