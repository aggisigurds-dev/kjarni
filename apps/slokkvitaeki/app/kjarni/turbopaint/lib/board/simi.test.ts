import assert from "node:assert/strict";
import { test } from "node:test";
import { erSimi, sulaSamanbrotin } from "./simi";

test("verkfærasúlan: samanbrotin í síma, opin í tölvu þegar ekkert er vistað", () => {
  assert.equal(sulaSamanbrotin(null, true), true);
  assert.equal(sulaSamanbrotin(null, false), false);
  assert.equal(sulaSamanbrotin(undefined, true), true);
});

test("verkfærasúlan: vistað val vafrans gengur fyrir sjálfgefnu", () => {
  assert.equal(sulaSamanbrotin("0", true), false);
  assert.equal(sulaSamanbrotin("1", false), true);
});

test("verkfærasúlan: ólæsilegt gildi fellur á sjálfgefið", () => {
  assert.equal(sulaSamanbrotin("já", true), true);
  assert.equal(sulaSamanbrotin("", false), false);
});

test("erSimi án glugga (þjónn, próf) er tölva", () => {
  assert.equal(erSimi(), false);
});
