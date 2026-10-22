import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isUserPaintEdit,
  PAINT_CFG_MIN,
  PAINT_EDIT_DENOISING,
  PAINT_INPAINT_FILL,
  paintEditCfg,
  paintEditDenoising,
  paintEditMaskBlur,
  paintEditPrompt,
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

test("paint denoise, cfg and blur sit in a rewrite band", () => {
  assert.equal(paintEditDenoising(0.35), PAINT_EDIT_DENOISING);
  assert.equal(paintEditDenoising(0.7), 0.7);
  assert.ok(paintEditDenoising(0.9) <= 0.72);
  assert.equal(paintEditCfg(5), PAINT_CFG_MIN);
  assert.equal(paintEditCfg(9), 9);
  assert.equal(paintEditMaskBlur(4), 8);
  assert.equal(PAINT_INPAINT_FILL, 2);
});
