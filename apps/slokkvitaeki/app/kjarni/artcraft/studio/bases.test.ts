import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adaptBasePrompt,
  BASE_DENOISING,
  figureOf,
  mannequinSvg,
  mergeBase,
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
  assert.equal(mergeBase(text, "Sara", studioBase("w-avg")), text);
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
