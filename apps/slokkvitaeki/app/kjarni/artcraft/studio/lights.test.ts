import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyPreset,
  backdropShootPrompt,
  backgroundOf,
  BACKGROUNDS,
  bumpPower,
  DEFAULT_LIGHT_PLAN,
  lightingPrompt,
  lightLine,
  mergePrompt,
} from "./lights.ts";

test("default high-key plan mentions pink backdrop and three umbrellas", () => {
  const text = lightingPrompt(DEFAULT_LIGHT_PLAN);
  assert.match(text, /high-key/);
  assert.match(text, /pink seamless/);
  assert.match(text, /left 85 inch silver umbrella/);
  assert.match(text, /right 85 inch silver umbrella/);
  assert.match(text, /front key 110 inch silver umbrella/);
  assert.match(text, /bronze gel/);
});

test("power 0 drops a light from the prompt", () => {
  assert.equal(lightLine("left", { power: 0, color: "white", modifier: "softbox" }), null);
  const off = applyPreset("off");
  assert.equal(lightingPrompt(off), "");
});

test("mergePrompt appends lighting once", () => {
  const light = lightingPrompt(DEFAULT_LIGHT_PLAN);
  const once = mergePrompt("adult woman, red dress", DEFAULT_LIGHT_PLAN);
  assert.ok(once.startsWith("adult woman, red dress, "));
  assert.ok(once.includes("high-key"));
  assert.equal(mergePrompt(once, DEFAULT_LIGHT_PLAN), once);
  assert.equal(mergePrompt("", DEFAULT_LIGHT_PLAN), light);
});

test("bumpPower stays in 0-10", () => {
  assert.equal(bumpPower(10, 1), 10);
  assert.equal(bumpPower(0, -1), 0);
  assert.equal(bumpPower(7, 1), 8);
});

test("backdrop picker has studio papers and a shoot prompt", () => {
  assert.ok(BACKGROUNDS.length >= 8);
  assert.equal(backgroundOf("canvas").label, "Strigi");
  const shoot = backdropShootPrompt("beige", "Sara");
  assert.match(shoot, /studio photoshoot/);
  assert.match(shoot, /Sara/);
  assert.match(shoot, /warm beige cream/);
  assert.match(shoot, /keep face identity and pose/);
});

test("rembrandt is key-left heavy", () => {
  const plan = applyPreset("rembrandt");
  assert.ok(plan.left.power > plan.right.power);
  assert.equal(plan.key.power, 0);
  assert.match(lightingPrompt(plan), /Rembrandt/);
});
