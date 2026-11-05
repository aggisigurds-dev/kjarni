import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clampPan,
  clampZoom,
  distance,
  MAX_ZOOM,
  midpoint,
  MIN_ZOOM,
  RESET_ZOOM,
  toggleZoom,
  wheelZoomFactor,
  zoomAround,
  type ZoomState,
} from "./imageZoom.ts";

test("clampZoom keeps scale within MIN_ZOOM..MAX_ZOOM", () => {
  assert.equal(clampZoom(0.2), MIN_ZOOM);
  assert.equal(clampZoom(50), MAX_ZOOM);
  assert.equal(clampZoom(2), 2);
  assert.equal(clampZoom(NaN), MIN_ZOOM);
});

test("zoomAround keeps the anchor point visually stationary", () => {
  const state: ZoomState = { scale: 1, x: 0, y: 0 };
  const anchor = { x: 120, y: 80 };
  const next = zoomAround(state, 2, anchor.x, anchor.y);
  // The point that was at image-local (anchor - old translate)/old scale
  // must map to the same screen point under the new transform.
  const localX = (anchor.x - state.x) / state.scale;
  const localY = (anchor.y - state.y) / state.scale;
  const screenX = next.x + localX * next.scale;
  const screenY = next.y + localY * next.scale;
  assert.ok(Math.abs(screenX - anchor.x) < 1e-9);
  assert.ok(Math.abs(screenY - anchor.y) < 1e-9);
});

test("zoomAround is a no-op once already at MAX_ZOOM (factor would exceed the cap)", () => {
  const atMax: ZoomState = { scale: MAX_ZOOM, x: -10, y: -5 };
  const next = zoomAround(atMax, 1.5, 50, 50);
  assert.deepEqual(next, atMax);
});

test("zoomAround zooming out from MIN_ZOOM clamps to MIN_ZOOM, state unchanged", () => {
  const atMin: ZoomState = { scale: MIN_ZOOM, x: 0, y: 0 };
  const next = zoomAround(atMin, 0.5, 50, 50);
  assert.deepEqual(next, atMin);
});

test("repeated zoom-in then zoom-out around the same point returns to the start", () => {
  let state: ZoomState = { scale: 1, x: 0, y: 0 };
  state = zoomAround(state, 2, 100, 60);
  state = zoomAround(state, 1.5, 100, 60);
  state = zoomAround(state, 1 / 1.5, 100, 60);
  state = zoomAround(state, 1 / 2, 100, 60);
  assert.ok(Math.abs(state.scale - 1) < 1e-9);
  assert.ok(Math.abs(state.x) < 1e-9);
  assert.ok(Math.abs(state.y) < 1e-9);
});

test("wheelZoomFactor: negative deltaY (scroll up) zooms in, positive zooms out", () => {
  assert.ok(wheelZoomFactor(-100) > 1);
  assert.ok(wheelZoomFactor(100) < 1);
  assert.equal(wheelZoomFactor(0), 1);
});

test("clampPan centers a scaled-down-to-container image on both axes", () => {
  const state: ZoomState = { scale: 1, x: 999, y: -999 };
  const out = clampPan(state, 400, 300);
  assert.equal(out.x, 0);
  assert.equal(out.y, 0);
});

test("clampPan keeps a zoomed-in image covering the container — no gap on either side", () => {
  // scale 2 on a 400x300 container -> content is 800x600; x must stay in [400-800, 0] = [-400, 0]
  const tooFarRight: ZoomState = { scale: 2, x: 500, y: 0 };
  const clampedRight = clampPan(tooFarRight, 400, 300);
  assert.equal(clampedRight.x, 0);

  const tooFarLeft: ZoomState = { scale: 2, x: -1000, y: 0 };
  const clampedLeft = clampPan(tooFarLeft, 400, 300);
  assert.equal(clampedLeft.x, -400);
});

test("distance and midpoint compute correctly for two touch points", () => {
  const a = { x: 0, y: 0 };
  const b = { x: 6, y: 8 };
  assert.equal(distance(a, b), 10);
  assert.deepEqual(midpoint(a, b), { x: 3, y: 4 });
});

test("toggleZoom zooms in from rest, and resets from any zoomed-in state", () => {
  const zoomedIn = toggleZoom(RESET_ZOOM, 50, 50, 2.5);
  assert.equal(zoomedIn.scale, 2.5);

  const backToRest = toggleZoom(zoomedIn, 50, 50);
  assert.deepEqual(backToRest, RESET_ZOOM);
});
