import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adaptBasePrompt,
  BASE_DENOISING,
  DEFAULT_LOOK,
  figureFor,
  figureOf,
  mannequinSvg,
  mergeBase,
  parseLook,
  STUDIO_BASES,
  studioBase,
} from "./bases.ts";

test("six adult bases cover woman man and a solid neutral", () => {
  assert.equal(STUDIO_BASES.length, 6);
  assert.ok(STUDIO_BASES.every((b) => b.kind === "woman" || b.kind === "man" || b.kind === "neutral"));
  assert.equal(studioBase("nope").id, "w-avg");
  assert.ok(BASE_DENOISING < 0.5);
});

test("athletic man is broader in the shoulders than a slim woman", () => {
  const slim = figureOf("woman", "slim");
  const strong = figureOf("man", "athletic");
  assert.ok(strong.shoulder > slim.shoulder);
  assert.ok(slim.hip / slim.shoulder > strong.hip / strong.shoulder);
});

test("adaptBasePrompt keeps proportions and names the person", () => {
  const text = adaptBasePrompt("Sara", studioBase("w-avg"));
  assert.match(text, /Sara/);
  assert.match(text, /body volume/);
  assert.match(text, /proportions/);
  assert.match(text, /A-pose joints/);
  assert.match(text, /adult woman/);
  assert.match(text, /170 cm/);
  assert.match(text, /athletic muscular build|average build/);
  assert.equal(mergeBase(text, "Sara", studioBase("w-avg")), text);
});

test("look sliders change height weight skin and hair", () => {
  const tall = figureFor(studioBase("w-avg"), { ...DEFAULT_LOOK, heightCm: 190, weightKg: 55, build: "slim" });
  const heavy = figureFor(studioBase("w-avg"), { ...DEFAULT_LOOK, heightCm: 160, weightKg: 110, build: "solid" });
  assert.ok(tall.inseam > heavy.inseam);
  assert.ok(heavy.waist > tall.waist);
  const parsed = parseLook({ heightCm: 12, weightKg: 900, skin: "nope", hair: "x", hairLength: "x", build: "nope" });
  assert.equal(parsed.heightCm, 150);
  assert.equal(parsed.weightKg, 130);
  assert.equal(parsed.skin, "warm");
  const long = mannequinSvg(studioBase("w-avg"), {
    ...DEFAULT_LOOK,
    skin: "deep",
    hair: "blonde",
    hairLength: "long",
  });
  assert.match(long, /#d4b06a/);
  assert.match(long, /#4a2e20/);
  assert.match(long, /ac-hair/);
  const bald = mannequinSvg(studioBase("m-avg"), { ...DEFAULT_LOOK, hairLength: "bald" });
  assert.doesNotMatch(bald, /ac-hair/);
});

test("mannequin svg draws a volumetric adult body, not stick lines", () => {
  const svg = mannequinSvg(studioBase("m-ath"));
  assert.match(svg, /<svg /);
  assert.match(svg, /<path /);
  assert.equal((svg.match(/<path /g) || []).length >= 8, true);
  assert.doesNotMatch(svg, /stroke-linecap/);
  assert.equal((svg.match(/<circle /g) || []).length >= 12, true);
  assert.doesNotMatch(svg, /child|kid|teen/i);
  const woman = mannequinSvg(studioBase("w-avg"));
  assert.match(woman, /linearGradient/);
  assert.ok(woman.includes("e2b89a"));
});
