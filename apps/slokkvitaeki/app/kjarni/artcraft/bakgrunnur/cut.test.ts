import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cutoutFilename,
  isProductImageFile,
  isWhiteBackground,
  PRODUCT_IMAGE_ACCEPT,
} from "./cut.ts";

test("accepts typical product photo files", () => {
  assert.equal(isProductImageFile({ type: "image/jpeg", name: "tæki.jpg" }), true);
  assert.equal(isProductImageFile({ type: "image/png", name: "tæki.png" }), true);
  assert.equal(isProductImageFile({ type: "application/pdf", name: "skyrsla.pdf" }), false);
  assert.match(PRODUCT_IMAGE_ACCEPT, /image\/jpeg/);
});

test("cutout downloads as a transparent PNG", () => {
  assert.equal(cutoutFilename("Duft 6 kg.jpg"), "Duft 6 kg-an-bakgrunns.png");
  assert.equal(cutoutFilename("co2.png"), "co2-an-bakgrunns.png");
  assert.equal(cutoutFilename(""), "vara-an-bakgrunns.png");
});

test("white shop background is a query mode on the same tool", () => {
  assert.equal(isWhiteBackground("hvitt"), true);
  assert.equal(isWhiteBackground(null), false);
  assert.equal(cutoutFilename("Duft 6 kg.jpg", true), "Duft 6 kg-a-hvitu.png");
});
