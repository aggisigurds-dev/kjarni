import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clampFluxGuidance,
  clampFluxNumOutputs,
  clampFluxSeed,
  clampFluxSteps,
  DEFAULT_FLUX_FILL_SETTINGS,
  normalizeFluxFillSettings,
} from "./fluxFill.ts";

test("clamp helpers keep values in flux-fill-dev's accepted ranges", () => {
  assert.equal(clampFluxGuidance(-5), 0);
  assert.equal(clampFluxGuidance(150), 100);
  assert.equal(clampFluxGuidance(29.6), 30);
  assert.equal(clampFluxGuidance(NaN), DEFAULT_FLUX_FILL_SETTINGS.guidance);

  assert.equal(clampFluxSteps(0), 1);
  assert.equal(clampFluxSteps(80), 50); // schema max is 50, unlike SDXL's 500
  assert.equal(clampFluxSteps(NaN), DEFAULT_FLUX_FILL_SETTINGS.steps);

  assert.equal(clampFluxNumOutputs(0), 1);
  assert.equal(clampFluxNumOutputs(10), 4);

  assert.equal(clampFluxSeed(3.7), 3);
  assert.equal(clampFluxSeed(NaN), -1);
});

test("normalizeFluxFillSettings keeps prompt/disableSafetyChecker as-is, defaults when missing", () => {
  const out = normalizeFluxFillSettings({ prompt: "remove the curtain", disableSafetyChecker: true });
  assert.equal(out.prompt, "remove the curtain");
  assert.equal(out.disableSafetyChecker, true);

  const empty = normalizeFluxFillSettings(null);
  assert.equal(empty.prompt, DEFAULT_FLUX_FILL_SETTINGS.prompt);
  assert.equal(empty.disableSafetyChecker, DEFAULT_FLUX_FILL_SETTINGS.disableSafetyChecker);
  assert.equal(empty.guidance, DEFAULT_FLUX_FILL_SETTINGS.guidance);
  assert.equal(empty.steps, DEFAULT_FLUX_FILL_SETTINGS.steps);
});
