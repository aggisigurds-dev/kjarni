import assert from "node:assert/strict";
import { test } from "node:test";
import { gluggaHaedir } from "./hus3d-gluggar";

test("window has sill, glazing and lintel", () => {
  const h = gluggaHaedir(300);
  assert.equal(h.brjost, 85);
  assert.equal(h.efri, 35);
  assert.equal(h.gler, 180);
  assert.equal(h.brjost + h.gler + h.efri, 300);
  assert.equal(h.glerMidja, 175);
});

test("proportions scale and height must be positive", () => {
  const h = gluggaHaedir(90);
  assert.equal(h.brjost + h.gler + h.efri, 90);
  assert.throws(() => gluggaHaedir(0), RangeError);
  assert.throws(() => gluggaHaedir(NaN), RangeError);
});