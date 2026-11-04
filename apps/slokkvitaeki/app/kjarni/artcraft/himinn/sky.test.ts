import { test } from "node:test";
import assert from "node:assert/strict";
import { clampSkySeed, normalizeSkySettings, DEFAULT_SKY_SETTINGS } from "./sky";

test("clampSkySeed: truncates to integer, NaN falls back to -1", () => {
  assert.equal(clampSkySeed(7.8), 7);
  assert.equal(clampSkySeed(NaN), -1);
});

test("normalizeSkySettings: fills in defaults for missing/invalid fields", () => {
  assert.deepEqual(normalizeSkySettings(undefined), DEFAULT_SKY_SETTINGS);
});

test("normalizeSkySettings: passes through valid values", () => {
  const out = normalizeSkySettings({ prompt: "starry night", negativePrompt: "blurry", seed: 7 });
  assert.equal(out.prompt, "starry night");
  assert.equal(out.negativePrompt, "blurry");
  assert.equal(out.seed, 7);
});
