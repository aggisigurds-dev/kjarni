import assert from "node:assert/strict";
import { test } from "node:test";
import { createRaster } from "./adjust.ts";
import {
  actionPrompt,
  bandMask,
  invertMask,
  objectMasks,
  personMaskFromCutout,
  regionsFromPerson,
} from "./analyze.ts";

function paint(img: ReturnType<typeof createRaster>, x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number, a = 255) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * img.width + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = a;
    }
  }
}

test("personMaskFromCutout uses alpha, invert is the rest", () => {
  const cut = createRaster(20, 20, 0, 0);
  paint(cut, 6, 4, 13, 16, 80, 60, 50, 255);
  const person = personMaskFromCutout(cut);
  assert.equal(person.data[(10 * 20 + 10) * 4], 255);
  assert.equal(person.data[(1 * 20 + 1) * 4], 0);
  const bg = invertMask(person);
  assert.equal(bg.data[(1 * 20 + 1) * 4], 255);
  assert.equal(bg.data[(10 * 20 + 10) * 4], 0);
});

test("bandMask keeps the torso and drops the head", () => {
  const person = createRaster(20, 40, 0);
  paint(person, 6, 2, 13, 37, 255, 255, 255);
  const clothes = bandMask(person, 0.3, 0.75);
  assert.equal(clothes.data[(4 * 20 + 10) * 4], 0);
  assert.equal(clothes.data[(20 * 20 + 10) * 4], 255);
});

test("regionsFromPerson returns person, garments, background and objects", () => {
  const image = createRaster(48, 48, 180);
  paint(image, 0, 0, 47, 47, 30, 120, 40);
  paint(image, 16, 8, 30, 40, 90, 70, 60);
  paint(image, 2, 30, 10, 38, 200, 40, 40);
  const person = createRaster(48, 48, 0);
  paint(person, 16, 8, 30, 40, 255, 255, 255);
  const regions = regionsFromPerson(image, person);
  const ids = regions.map((r) => r.id);
  assert.ok(ids.includes("person"));
  assert.ok(ids.includes("pants"));
  assert.ok(ids.includes("top"));
  assert.ok(ids.includes("background"));
  assert.equal(ids.includes("clothes"), false);
  assert.ok(regions.some((r) => r.kind === "object"), "red blob on green field should become an object");
});

test("objectMasks ignores tiny specks", () => {
  const image = createRaster(32, 32, 20);
  paint(image, 0, 0, 31, 31, 20, 140, 30);
  paint(image, 2, 2, 2, 2, 255, 0, 0);
  const person = createRaster(32, 32, 0);
  paint(person, 12, 8, 20, 24, 255, 255, 255);
  assert.equal(objectMasks(image, person).length, 0);
});

test("actionPrompt writes focused img2img text", () => {
  assert.match(actionPrompt("clothes", "recolor", "blue"), /blue/);
  assert.match(actionPrompt("object", "remove"), /remove this object/);
  assert.match(actionPrompt("background", "background", "tokyo night"), /tokyo night/);
});
