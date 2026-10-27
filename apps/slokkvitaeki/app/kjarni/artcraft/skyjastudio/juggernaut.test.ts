import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clampJugGuidance,
  clampJugNumOutputs,
  clampJugSeed,
  clampJugSize,
  clampJugSteps,
  DEFAULT_JUGGERNAUT_SETTINGS,
  normalizeJuggernautSettings,
} from "./juggernaut.ts";

test("clamp helpers keep values in Juggernaut XL v7's accepted ranges", () => {
  assert.equal(clampJugSize(10000), 1536);
  assert.equal(clampJugSize(1), 512);
  assert.equal(clampJugSize(1020), 1024); // rounds to nearest multiple of 8
  assert.equal(clampJugSteps(0), 1);
  assert.equal(clampJugSteps(500), 100); // schema allows 500, we cap the UI at 100
  assert.equal(clampJugGuidance(0), 1);
  assert.equal(clampJugGuidance(100), 50);
  assert.equal(clampJugNumOutputs(0), 1);
  assert.equal(clampJugNumOutputs(10), 4);
  assert.equal(clampJugSeed(3.7), 3);
  assert.equal(clampJugSeed(NaN), -1);
  assert.equal(clampJugSize(NaN), DEFAULT_JUGGERNAUT_SETTINGS.width);
});

test("normalizeJuggernautSettings falls back to defaults for unknown scheduler and keeps a valid one", () => {
  const fallback = normalizeJuggernautSettings({ scheduler: "nope" as never });
  assert.equal(fallback.scheduler, DEFAULT_JUGGERNAUT_SETTINGS.scheduler);

  const kept = normalizeJuggernautSettings({ scheduler: "DDIM" });
  assert.equal(kept.scheduler, "DDIM");
});

test("normalizeJuggernautSettings keeps prompt/negativePrompt text as-is, defaults when missing", () => {
  const out = normalizeJuggernautSettings({ prompt: "a cat" });
  assert.equal(out.prompt, "a cat");
  assert.equal(out.negativePrompt, DEFAULT_JUGGERNAUT_SETTINGS.negativePrompt);

  const empty = normalizeJuggernautSettings(null);
  assert.equal(empty.prompt, DEFAULT_JUGGERNAUT_SETTINGS.prompt);
});
