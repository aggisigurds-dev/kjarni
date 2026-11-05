import assert from "node:assert/strict";
import { test } from "node:test";
import { createRaster } from "./adjust.ts";
import { regionsFromPerson } from "./analyze.ts";
import {
  GARMENT_ADDS,
  GARMENT_FILL,
  GARMENT_INPAINT_FILL,
  GARMENT_NEGATIVE,
  eraseMaskedClothes,
  garmentApiFields,
  garmentBodyPrompt,
  garmentContinuePrompt,
  garmentRemovePrompt,
  garmentRunOptions,
  shouldWipeClothes,
} from "./garments.ts";
import { isUserPaintEdit, PAINT_INPAINT_FILL } from "./paintEdit.ts";
import { studioScripts } from "./refs.ts";
import { img2img } from "./webui.ts";

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

test("Endurbyggja cannot use the paint-edit noise path that made the mosaic", () => {
  const flags = garmentRunOptions();
  const api = garmentApiFields();
  assert.equal(flags.skipPaint, true);
  assert.equal(isUserPaintEdit(true, flags.denoisingStrength), false);
  assert.equal(api.inpainting_fill, 1);
  assert.equal(api.inpainting_fill, GARMENT_INPAINT_FILL);
  assert.notEqual(api.inpainting_fill, PAINT_INPAINT_FILL);
  assert.notEqual(api.inpainting_fill, 2);
});

test("Endurbyggja cannot turn on GFPGAN — that swapped the woman", () => {
  const api = garmentApiFields();
  assert.equal(api.restore_faces, false);
  const extra = studioScripts({
    faceRefs: ["data:image/png;base64,FACE"],
    restoreFaces: garmentRunOptions().restoreFaces,
    toApi: (s) => s,
  });
  assert.notEqual(extra.restore_faces, true);
  assert.equal(extra.restore_faces, undefined);
});

test("body prompt cannot ask the model to paint — that made the scribble turtleneck", () => {
  const body = garmentBodyPrompt();
  assert.match(body, /unmasked face and hair identical/);
  assert.match(body, /photorealistic/);
  const noPaint = /(?<!out)paint/;
  assert.doesNotMatch(body, noPaint);
  assert.doesNotMatch(GARMENT_FILL, noPaint);
  assert.match(GARMENT_FILL, /no scribble/);
  assert.match(GARMENT_NEGATIVE, /scribble/);
  assert.match(GARMENT_NEGATIVE, /statue/);
  assert.doesNotMatch(garmentRemovePrompt("pants"), noPaint);
  assert.doesNotMatch(garmentContinuePrompt("pants"), noPaint);
  for (const add of GARMENT_ADDS) {
    assert.doesNotMatch(add.prompt, noPaint, add.id);
  }
});

test("Endurbyggja must wipe clothing pixels before Forge sees them — leftover pattern became the scribble turtleneck", () => {
  assert.equal(shouldWipeClothes("rebuild"), true);
  assert.equal(shouldWipeClothes("remove"), true);
  assert.equal(shouldWipeClothes("continue"), true);
  assert.equal(shouldWipeClothes("add"), false);
  const image = createRaster(16, 24, 0);
  const mask = createRaster(16, 24, 0);
  paint(image, 4, 1, 11, 6);
  for (let y = 1; y <= 6; y++) {
    for (let x = 4; x <= 11; x++) {
      const i = (y * 16 + x) * 4;
      image.data[i] = 220;
      image.data[i + 1] = 180;
      image.data[i + 2] = 150;
    }
  }
  for (let y = 7; y <= 22; y++) {
    for (let x = 4; x <= 11; x++) {
      const i = (y * 16 + x) * 4;
      image.data[i] = 255;
      image.data[i + 1] = 0;
      image.data[i + 2] = 180;
      mask.data[i] = 255;
      mask.data[i + 1] = 255;
      mask.data[i + 2] = 255;
    }
  }
  const wiped = eraseMaskedClothes(image, mask);
  const torso = (14 * 16 + 8) * 4;
  const face = (3 * 16 + 8) * 4;
  assert.equal(image.data[torso], 255);
  assert.equal(image.data[torso + 1], 0);
  assert.ok(wiped.data[torso + 1] > 80, "magenta sweater must be gone");
  assert.notEqual(wiped.data[torso], 255);
  assert.equal(wiped.data[face], 220);
  assert.equal(wiped.data[face + 1], 180);
});

test("skin sample uses the neck, not grass beside the body", () => {
  const image = createRaster(16, 24, 0);
  const mask = createRaster(16, 24, 0);
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = 40;
    image.data[i + 1] = 160;
    image.data[i + 2] = 50;
  }
  for (let y = 1; y <= 6; y++) {
    for (let x = 4; x <= 11; x++) {
      const i = (y * 16 + x) * 4;
      image.data[i] = 220;
      image.data[i + 1] = 180;
      image.data[i + 2] = 150;
    }
  }
  for (let y = 7; y <= 22; y++) {
    for (let x = 4; x <= 11; x++) {
      const i = (y * 16 + x) * 4;
      image.data[i] = 255;
      image.data[i + 1] = 0;
      image.data[i + 2] = 180;
      mask.data[i] = 255;
      mask.data[i + 1] = 255;
      mask.data[i + 2] = 255;
    }
  }
  const wiped = eraseMaskedClothes(image, mask);
  const torso = (14 * 16 + 8) * 4;
  assert.ok(wiped.data[torso] > wiped.data[torso + 1], "fill must be skin, not grass");
  assert.ok(wiped.data[torso] > 180);
  assert.ok(wiped.data[torso + 1] < 200);
});

test("bodyUnder mask leaves the head black so the face is not rewritten", () => {
  const image = createRaster(40, 80, 180);
  const person = createRaster(40, 80, 0);
  paint(person, 10, 4, 29, 74);
  const body = regionsFromPerson(image, person).find((r) => r.id === "bodyUnder");
  assert.ok(body);
  assert.equal(body.mask.data[(8 * 40 + 20) * 4], 0);
  assert.equal(body.mask.data[(12 * 40 + 20) * 4], 0);
  assert.equal(body.mask.data[(50 * 40 + 20) * 4], 255);
});

test("img2img garment payload stays on original fill and no restore_faces", async () => {
  const prev = globalThis.fetch;
  let sent: Record<string, unknown> = {};
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
    return new Response(JSON.stringify({ images: ["zzz"] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  const api = garmentApiFields();
  try {
    await img2img("http://127.0.0.1:7860", {
      prompt: garmentBodyPrompt(),
      initImage: "data:image/png;base64,SRC",
      mask: "data:image/png;base64,MASK",
      denoisingStrength: api.denoising_strength,
      inpaintingFill: api.inpainting_fill,
      inpaintFullRes: api.inpaint_full_res,
      restoreFaces: api.restore_faces,
      faceRefs: ["data:image/png;base64,FACE"],
    });
    assert.equal(sent.inpainting_fill, 1);
    assert.equal(sent.inpaint_full_res, false);
    assert.notEqual(sent.restore_faces, true);
    assert.match(String(sent.prompt), /unmasked face/);
    assert.doesNotMatch(String(sent.prompt), /painted/);
  } finally {
    globalThis.fetch = prev;
  }
});
