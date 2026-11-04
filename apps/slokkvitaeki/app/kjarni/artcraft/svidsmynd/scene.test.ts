import { test } from "node:test";
import assert from "node:assert/strict";
import { clampSceneSeed, normalizeSceneSettings, DEFAULT_SCENE_SETTINGS } from "./scene";

test("clampSceneSeed: truncates to integer, NaN falls back to -1", () => {
  assert.equal(clampSceneSeed(4.9), 4);
  assert.equal(clampSceneSeed(NaN), -1);
});

test("normalizeSceneSettings: fills in defaults for missing/invalid fields", () => {
  const out = normalizeSceneSettings(null);
  assert.deepEqual(out, DEFAULT_SCENE_SETTINGS);
});

test("normalizeSceneSettings: passes through valid values", () => {
  const out = normalizeSceneSettings({ prompt: "marble table", negativePrompt: "blurry", seed: 42 });
  assert.equal(out.prompt, "marble table");
  assert.equal(out.negativePrompt, "blurry");
  assert.equal(out.seed, 42);
});
