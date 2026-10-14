import assert from "node:assert/strict";
import { test } from "node:test";
import { erSimi, sulaSamanbrotin } from "./simi";

test("verkfærasúlan: opin í síma OG tölvu þegar ekkert er vistað (14.10.2026)", () => {
  assert.equal(sulaSamanbrotin(null, true), false);
  assert.equal(sulaSamanbrotin(null, false), false);
  assert.equal(sulaSamanbrotin(undefined, true), false);
});

test("verkfærasúlan: vistað val vafrans gengur fyrir sjálfgefnu", () => {
  assert.equal(sulaSamanbrotin("0", true), false);
  assert.equal(sulaSamanbrotin("1", false), true);
});

test("verkfærasúlan: ólæsilegt gildi fellur á sjálfgefið (opin)", () => {
  assert.equal(sulaSamanbrotin("já", true), false);
  assert.equal(sulaSamanbrotin("", false), false);
});

test("erSimi án glugga (þjónn, próf) er tölva", () => {
  assert.equal(erSimi(), false);
});
