import assert from "node:assert/strict";
import { test } from "node:test";
import { blockedForMinors } from "./guard.ts";

test("adult nudity is allowed", () => {
  assert.equal(blockedForMinors("nude adult woman, explicit"), null);
  assert.equal(blockedForMinors("naked man, nsfw, erotic"), null);
  assert.equal(blockedForMinors("25 year old woman, nude"), null);
  assert.equal(blockedForMinors("full frontal adult couple"), null);
});

test("sexual content involving minors is blocked", () => {
  assert.match(blockedForMinors("nude child") || "", /börnum/);
  assert.match(blockedForMinors("underage girl") || "", /börnum/);
  assert.match(blockedForMinors("loli") || "", /börnum/);
  assert.match(blockedForMinors("14 year old") || "", /börnum/);
  assert.match(blockedForMinors("nakinn unglingur") || "", /börnum/);
});

test("empty prompt is not a minor block", () => {
  assert.equal(blockedForMinors(""), null);
  assert.equal(blockedForMinors("   "), null);
});
