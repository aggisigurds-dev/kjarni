import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clampSdxlGuidance,
  clampSdxlNumOutputs,
  clampSdxlSeed,
  clampSdxlSize,
  clampSdxlSteps,
  DEFAULT_SDXL_SETTINGS,
  normalizeSdxlSettings,
} from "./sdxl.ts";

test("clamp helpers keep values in SDXL's accepted ranges", () => {
  assert.equal(clampSdxlSize(10000), 1536);
  assert.equal(clampSdxlSize(1), 512);
  assert.equal(clampSdxlSize(1020), 1024); // rounds to nearest multiple of 8
  assert.equal(clampSdxlSteps(0), 1);
  assert.equal(clampSdxlSteps(500), 100); // schema allows 500, we cap the UI at 100
  assert.equal(clampSdxlGuidance(0), 1);
  assert.equal(clampSdxlGuidance(100), 50);
  assert.equal(clampSdxlNumOutputs(0), 1);
  assert.equal(clampSdxlNumOutputs(10), 4);
  assert.equal(clampSdxlSeed(3.7), 3);
  assert.equal(clampSdxlSeed(NaN), -1);
  assert.equal(clampSdxlSize(NaN), DEFAULT_SDXL_SETTINGS.width);
});

test("normalizeSdxlSettings falls back to defaults for unknown scheduler and keeps a valid one", () => {
  const fallback = normalizeSdxlSettings({ scheduler: "nope" as never });
  assert.equal(fallback.scheduler, DEFAULT_SDXL_SETTINGS.scheduler);

  const kept = normalizeSdxlSettings({ scheduler: "DDIM" });
  assert.equal(kept.scheduler, "DDIM");
});

test("normalizeSdxlSettings keeps prompt/negativePrompt text as-is, defaults when missing", () => {
  const out = normalizeSdxlSettings({ prompt: "a cat" });
  assert.equal(out.prompt, "a cat");
  assert.equal(out.negativePrompt, DEFAULT_SDXL_SETTINGS.negativePrompt);

  const empty = normalizeSdxlSettings(null);
  assert.equal(empty.prompt, DEFAULT_SDXL_SETTINGS.prompt);
});

test("normalizeSdxlSettings keeps disableSafetyChecker/applyWatermark booleans, defaults when missing", () => {
  const out = normalizeSdxlSettings({ disableSafetyChecker: true, applyWatermark: false });
  assert.equal(out.disableSafetyChecker, true);
  assert.equal(out.applyWatermark, false);

  const defaults = normalizeSdxlSettings({});
  assert.equal(defaults.disableSafetyChecker, DEFAULT_SDXL_SETTINGS.disableSafetyChecker);
  assert.equal(defaults.applyWatermark, DEFAULT_SDXL_SETTINGS.applyWatermark);
});
