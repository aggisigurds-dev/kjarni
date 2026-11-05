import assert from "node:assert/strict";
import { test } from "node:test";
import { createRaster } from "./adjust.ts";
import {
  canPaintSubmit,
  isUserPaintEdit,
  PAINT_CFG_MIN,
  PAINT_EDIT_DENOISING,
  PAINT_INPAINT_FILL,
  PAINT_SHOT_DENOISING,
  PAINT_SHOT_FILL,
  paintEditCfg,
  paintEditDenoising,
  paintEditFaceRefs,
  paintEditMaskBlur,
  paintEditPrompt,
  paintEditRestoreFaces,
  paintInpaintFill,
  stampRefRaster,
} from "./paintEdit.ts";

test("form paint is a user edit; explicit denoise is a named tool", () => {
  assert.equal(isUserPaintEdit(true), true);
  assert.equal(isUserPaintEdit(true, 0.46), false);
  assert.equal(isUserPaintEdit(false), false);
});

test("paint prompt names the change and keeps unmasked pixels", () => {
  const text = paintEditPrompt("red silk dress");
  assert.match(text, /red silk dress/);
  assert.match(text, /painted masked region/);
  assert.equal(paintEditPrompt(text), text);
});

test("dropped screenshot names clothes or a head swap", () => {
  const bikini = paintEditPrompt("bikini", true, "clothes");
  assert.match(bikini, /bikini/);
  assert.match(bikini, /outfit from the dropped screenshot/);
  assert.match(bikini, /same face/);
  const head = paintEditPrompt("", true, "head");
  assert.match(head, /painted head/);
  assert.match(head, /dropped screenshot/);
  assert.doesNotMatch(head, /same face and body/);
});

test("paint denoise, cfg and blur sit in a rewrite band", () => {
  assert.equal(paintEditDenoising(0.35), PAINT_EDIT_DENOISING);
  assert.equal(paintEditDenoising(0.7), 0.7);
  assert.ok(paintEditDenoising(0.9) <= 0.72);
  assert.equal(paintEditDenoising(0.35, true), PAINT_SHOT_DENOISING);
  assert.equal(paintEditCfg(5), PAINT_CFG_MIN);
  assert.equal(paintEditCfg(9), 9);
  assert.equal(paintEditMaskBlur(4), 8);
  assert.equal(PAINT_INPAINT_FILL, 2);
  assert.equal(paintInpaintFill(false), PAINT_INPAINT_FILL);
  assert.equal(paintInpaintFill(true), PAINT_SHOT_FILL);
});

test("paint submit needs a prompt or a screenshot when a mask is on", () => {
  assert.equal(canPaintSubmit(null, "", ""), true);
  assert.equal(canPaintSubmit("mask", "", ""), false);
  assert.equal(canPaintSubmit("mask", "bikini", ""), true);
  assert.equal(canPaintSubmit("mask", "", "data:image/png;base64,xx"), true);
});

test("head swap uses only the screenshot; clothes keep the locked face", () => {
  const locked = ["still", "face-a"];
  assert.deepEqual(paintEditFaceRefs("head", "shot", locked), ["shot"]);
  assert.deepEqual(paintEditFaceRefs("clothes", "shot", locked), locked);
  assert.deepEqual(paintEditFaceRefs("head", "", locked), locked);
  assert.equal(paintEditRestoreFaces("head", true), false);
  assert.equal(paintEditRestoreFaces("clothes", true), true);
});

test("stamp pastes the screenshot into the painted hole only", () => {
  const init = createRaster(8, 8, 10);
  const mask = createRaster(8, 8, 0);
  const shot = createRaster(2, 2, 200);
  for (let y = 2; y <= 5; y++) {
    for (let x = 2; x <= 5; x++) {
      const i = (y * 8 + x) * 4;
      mask.data[i] = 255;
      mask.data[i + 1] = 255;
      mask.data[i + 2] = 255;
    }
  }
  const out = stampRefRaster(init, mask, shot);
  assert.equal(out.data[0], 10);
  const mid = (4 * 8 + 4) * 4;
  assert.equal(out.data[mid], 200);
  assert.equal(out.data[mid + 3], 255);
});

test("stamp maps a smaller mask onto the still", () => {
  const init = createRaster(8, 8, 4);
  const mask = createRaster(4, 4, 0);
  const shot = createRaster(2, 2, 180);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 2; x++) {
      const i = (y * 4 + x) * 4;
      mask.data[i] = 255;
      mask.data[i + 1] = 255;
      mask.data[i + 2] = 255;
    }
  }
  const out = stampRefRaster(init, mask, shot);
  const stamped = (4 * 8 + 1) * 4;
  assert.equal(out.data[stamped], 180);
  const right = (0 * 8 + 7) * 4;
  assert.equal(out.data[right], 4);
});
