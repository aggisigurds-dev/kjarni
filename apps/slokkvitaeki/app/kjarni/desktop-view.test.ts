import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DESK_WIDTH,
  ZOOM_MAX,
  ZOOM_MIN,
  clampZoom,
  fitZoom,
  isPhoneScreen,
  isStationDesktopPath,
  readStoredZoom,
  shouldLockDesktop,
  stepZoom,
} from "./desktop-view";

test("phone screens are the short edge under 850px", () => {
  assert.equal(isPhoneScreen(412, 915), true);
  assert.equal(isPhoneScreen(1440, 900), false);
  assert.equal(isPhoneScreen(768, 1024), true);
});

test("fit zoom is viewport / desktop width", () => {
  assert.equal(fitZoom(360), clampZoom(360 / DESK_WIDTH));
});

test("clamp keeps zoom in range", () => {
  assert.equal(clampZoom(0), ZOOM_MIN);
  assert.equal(clampZoom(99), ZOOM_MAX);
  assert.equal(clampZoom(1), 1);
});

test("step zoom in and out", () => {
  const up = stepZoom(0.5, 1);
  const down = stepZoom(up, -1);
  assert.ok(up > 0.5);
  assert.ok(Math.abs(down - 0.5) < 0.02);
});

test("stored zoom falls back when missing", () => {
  assert.equal(readStoredZoom(null, 0.4), 0.4);
  assert.equal(readStoredZoom("nope", 0.4), 0.4);
  assert.equal(readStoredZoom("0.8", 0.4), 0.8);
});

test("station paths lock desktop except TurboPaint", () => {
  assert.equal(isStationDesktopPath("/kerfi"), true);
  assert.equal(isStationDesktopPath("/kjarni"), true);
  assert.equal(isStationDesktopPath("/kjarni/turbopaint"), false);
  assert.equal(isStationDesktopPath("/"), false);
});

test("desktop lock also follows a narrow viewport", () => {
  assert.equal(shouldLockDesktop(1920, 1080, 390), true);
  assert.equal(shouldLockDesktop(1920, 1080, 1440), false);
});
