import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dropQueue,
  lookbookPrompt,
  LOOKBOOK_SHOTS,
  looksLine,
  mergeLooks,
  pushQueue,
  sequenceFrames,
  toggleLook,
} from "./looks.ts";

test("one chip per group and mergeLooks stacks them", () => {
  let sel = toggleLook([], "smile");
  sel = toggleLook(sel, "close");
  sel = toggleLook(sel, "suit");
  sel = toggleLook(sel, "laugh");
  assert.deepEqual(sel.sort(), ["close", "laugh", "suit"].sort());
  const line = looksLine(sel);
  assert.match(line, /close-up/);
  assert.match(line, /laugh/);
  assert.match(line, /black tailored suit/);
  assert.match(mergeLooks("studio", sel), /studio/);
  assert.equal(mergeLooks(mergeLooks("studio", sel), sel), mergeLooks("studio", sel));
});

test("lookbook has four stills and names the person", () => {
  assert.equal(LOOKBOOK_SHOTS.length, 4);
  assert.match(lookbookPrompt("side", "Sara"), /Sara/);
  assert.match(lookbookPrompt("full"), /full body/);
});

test("action queue caps at four unique ids", () => {
  let q = pushQueue([], "dance");
  q = pushQueue(q, "spin");
  q = pushQueue(q, "dance");
  q = pushQueue(q, "stand");
  q = pushQueue(q, "poses");
  q = pushQueue(q, "walk");
  assert.deepEqual(q, ["dance", "spin", "stand", "poses"]);
  assert.deepEqual(dropQueue(q, 1), ["dance", "stand", "poses"]);
  assert.equal(sequenceFrames(4, 12), 4);
  assert.ok(sequenceFrames(1, 8) >= 4);
});
