import assert from "node:assert/strict";
import { test } from "node:test";
import { createRaster } from "./adjust.ts";
import { bboxMask, garmentRegions, sleeveMask } from "./analyze.ts";
import {
  addMaskId,
  addsForSlot,
  continuePad,
  continueStripMask,
  GARMENT_ADDS,
  GARMENT_DENOISING,
  GARMENT_INPAINT_FILL,
  GARMENT_NEGATIVE,
  eraseMaskedClothes,
  garmentBodyPrompt,
  garmentContinuePrompt,
  garmentRemovePrompt,
  garmentRunOptions,
  isGarmentChip,
  padHasExtent,
  padRaster,
  scaleMaskTo,
  shouldWipeClothes,
  slotOfRegion,
} from "./garments.ts";

function paint(
  img: ReturnType<typeof createRaster>,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * img.width + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }
}

test("slot maps chips; adds are delete-then-add not in-place rewrite", () => {
  assert.equal(slotOfRegion("pants"), "pants");
  assert.equal(slotOfRegion("sleeves"), "sleeves");
  assert.equal(isGarmentChip("pants"), true);
  assert.equal(isGarmentChip("head"), false);
  const pants = addsForSlot("pants").map((row) => row.label);
  assert.deepEqual(pants, ["Stuttbuxur", "Þröngar buxur", "Langar buxur"]);
  const shorts = addsForSlot("pants").find((row) => row.id === "shorts");
  assert.equal(shorts?.maskId, "shortsZone");
  const takeOff = garmentRemovePrompt("pants");
  assert.match(takeOff, /reconstruct the adult legs/);
  assert.match(takeOff, /no hole/);
  assert.match(takeOff, /continue the hips/);
  assert.doesNotMatch(takeOff, /change the trousers/);
  assert.match(garmentContinuePrompt("pants"), /outpaint and continue both adult legs/);
  assert.match(garmentBodyPrompt(), /complete adult body that was underneath/);
  assert.doesNotMatch(garmentBodyPrompt(), /(?<!out)paint/);
  assert.match(GARMENT_NEGATIVE, /hole/);
  assert.match(GARMENT_NEGATIVE, /mosaic/);
  assert.match(GARMENT_NEGATIVE, /scribble/);
  assert.equal(shouldWipeClothes("rebuild"), true);
  assert.equal(shouldWipeClothes("add"), false);
  for (const add of GARMENT_ADDS) {
    assert.doesNotMatch(add.prompt, /(?<!out)paint/, add.id);
  }
  const flags = garmentRunOptions();
  assert.equal(flags.skipPaint, true);
  assert.equal(flags.ignoreRefs, true);
  assert.equal(flags.restoreFaces, false);
  assert.equal(flags.inpaintingFill, GARMENT_INPAINT_FILL);
  assert.equal(flags.inpaintingFill, 1);
  assert.equal(flags.inpaintFullRes, false);
  assert.ok(flags.denoisingStrength <= 0.5);
  assert.equal(GARMENT_DENOISING, flags.denoisingStrength);
  assert.match(shorts!.prompt, /over the existing reconstructed legs/);
  assert.equal(addMaskId(shorts!, "pants"), "shortsZone");
});

test("garment bands split torso, sleeves and pants", () => {
  const person = createRaster(40, 80, 0);
  paint(person, 8, 4, 31, 74);
  paint(person, 0, 16, 7, 40);
  paint(person, 32, 16, 39, 40);
  const found = garmentRegions(person);
  const ids = found.map((r) => r.id);
  assert.ok(ids.includes("top"));
  assert.ok(ids.includes("sleeves"));
  assert.ok(ids.includes("pants"));
  assert.ok(ids.includes("shortsZone"));
  const pants = found.find((r) => r.id === "pants")!;
  const shorts = found.find((r) => r.id === "shortsZone")!;
  const top = found.find((r) => r.id === "top")!;
  assert.ok(shorts.hidden);
  assert.ok(pants.coverage > shorts.coverage);
  assert.equal(top.slot, "top");
  assert.equal(bboxMask(person, 0.5, 0.9).data[(60 * 40 + 20) * 4], 255);
  assert.equal(bboxMask(person, 0.5, 0.9).data[(10 * 40 + 20) * 4], 0);
  assert.equal(sleeveMask(person, 0.16, 0.5).data[(28 * 40 + 3) * 4], 255);
  assert.equal(sleeveMask(person, 0.16, 0.5).data[(28 * 40 + 20) * 4], 0);
});

test("continuePad grows the canvas when legs are cropped", () => {
  const cropped = continuePad("pants", 40, 80, { x0: 8, y0: 4, x1: 31, y1: 78 });
  assert.ok(padHasExtent(cropped));
  assert.ok(cropped.bottom >= 24);
  assert.equal(cropped.bottom % 8, 0);
  const roomy = continuePad("pants", 40, 160, { x0: 8, y0: 4, x1: 31, y1: 78 });
  assert.equal(roomy.bottom, 0);
  const src = createRaster(8, 8, 90);
  const padded = padRaster(src, { left: 0, right: 0, top: 0, bottom: 8 });
  assert.equal(padded.width, 8);
  assert.equal(padded.height, 16);
  assert.equal(padded.data[0], 90);
  assert.equal(padded.data[(8 * 8 + 0) * 4], 18);
  const strip = continueStripMask(8, 16, { left: 0, right: 0, top: 0, bottom: 8 }, { x0: 2, y0: 1, x1: 5, y1: 7 }, "pants", 1);
  assert.equal(strip.data[(7 * 8 + 4) * 4], 255);
  assert.equal(strip.data[(12 * 8 + 4) * 4], 255);
  assert.equal(strip.data[(12 * 8 + 0) * 4], 0);
});

test("eraseMaskedClothes replaces the sweater, not the face", () => {
  const image = createRaster(8, 12, 0);
  const mask = createRaster(8, 12, 0);
  paint(image, 2, 1, 5, 3);
  for (let y = 1; y <= 3; y++) {
    for (let x = 2; x <= 5; x++) {
      const i = (y * 8 + x) * 4;
      image.data[i] = 210;
      image.data[i + 1] = 170;
      image.data[i + 2] = 140;
    }
  }
  for (let y = 4; y <= 10; y++) {
    for (let x = 2; x <= 5; x++) {
      const i = (y * 8 + x) * 4;
      image.data[i] = 20;
      image.data[i + 1] = 80;
      image.data[i + 2] = 220;
      mask.data[i] = 255;
      mask.data[i + 1] = 255;
      mask.data[i + 2] = 255;
    }
  }
  const wiped = eraseMaskedClothes(image, mask);
  assert.equal(wiped.data[(2 * 8 + 3) * 4], 210);
  assert.ok(wiped.data[(7 * 8 + 3) * 4 + 2] < 180);
});

test("scaleMaskTo keeps the white hole when the still is a different size", () => {
  const mask = createRaster(4, 4, 0);
  paint(mask, 1, 1, 2, 2);
  const scaled = scaleMaskTo(mask, 8, 8);
  assert.equal(scaled.width, 8);
  assert.equal(scaled.height, 8);
  assert.equal(scaled.data[(3 * 8 + 3) * 4], 255);
  assert.equal(scaled.data[(0 * 8 + 0) * 4], 0);
});
