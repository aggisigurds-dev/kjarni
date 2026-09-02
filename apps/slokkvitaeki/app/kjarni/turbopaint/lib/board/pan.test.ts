import assert from "node:assert/strict";
import { test } from "node:test";
import { isRightMouseButton, shouldPanView } from "./pan";

test("right mouse button pans the view in every tool", () => {
  for (const tool of ["select", "hand", "rect", "pen", "measure", "eraser"]) {
    assert.equal(shouldPanView({ button: 2, pointerType: "mouse", tool, spacePan: false }), true);
  }
});

test("middle mouse and space also pan", () => {
  assert.equal(shouldPanView({ button: 1, pointerType: "mouse", tool: "pen", spacePan: false }), true);
  assert.equal(shouldPanView({ button: 0, pointerType: "mouse", tool: "pen", spacePan: true }), true);
});

test("left mouse on a drawing tool does not pan", () => {
  assert.equal(shouldPanView({ button: 0, pointerType: "mouse", tool: "pen", spacePan: false }), false);
  assert.equal(shouldPanView({ button: 0, pointerType: "mouse", tool: "select", spacePan: false }), false);
});

test("touch and pen pan with the hand tool, not via the right-button rule", () => {
  assert.equal(shouldPanView({ button: 0, pointerType: "touch", tool: "hand", spacePan: false }), true);
  assert.equal(shouldPanView({ button: 0, pointerType: "pen", tool: "rect", spacePan: false }), false);
  assert.equal(isRightMouseButton(2, "touch"), false);
});
