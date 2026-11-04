import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRetouchPrompt,
  normalizeRetouchSettings,
  DEFAULT_RETOUCH_SETTINGS,
  type RetouchSettings,
} from "./retouch";

test("buildRetouchPrompt: no options selected -> empty string", () => {
  const settings: RetouchSettings = { skinSmooth: false, blemishes: false, teeth: false, underEye: false, extra: "" };
  assert.equal(buildRetouchPrompt(settings), "");
});

test("buildRetouchPrompt: combines selected fragments and always appends the preserve clause", () => {
  const settings: RetouchSettings = { skinSmooth: true, blemishes: false, teeth: true, underEye: false, extra: "" };
  const prompt = buildRetouchPrompt(settings);
  assert.match(prompt, /smooth the skin/);
  assert.match(prompt, /whiten the teeth/);
  assert.doesNotMatch(prompt, /blemishes/);
  assert.match(prompt, /Do not change the face shape/);
});

test("buildRetouchPrompt: appends free-text extra instruction when present", () => {
  const settings: RetouchSettings = { skinSmooth: true, blemishes: false, teeth: false, underEye: false, extra: "soften the nose shadow" };
  assert.match(buildRetouchPrompt(settings), /soften the nose shadow/);
});

test("normalizeRetouchSettings: fills in defaults for missing/invalid fields", () => {
  assert.deepEqual(normalizeRetouchSettings(null), DEFAULT_RETOUCH_SETTINGS);
});

test("normalizeRetouchSettings: passes through valid values", () => {
  const out = normalizeRetouchSettings({ skinSmooth: false, teeth: true, extra: "x" });
  assert.equal(out.skinSmooth, false);
  assert.equal(out.teeth, true);
  assert.equal(out.extra, "x");
});
