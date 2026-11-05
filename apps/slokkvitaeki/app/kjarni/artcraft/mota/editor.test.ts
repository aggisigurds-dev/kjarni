import assert from "node:assert/strict";
import { test } from "node:test";
import type { Raster } from "../studio/adjust.ts";
import { EditHistory, clipRect, cutRect, unionRect } from "./history.ts";
import { NEUTRAL_LOOKS, applyLooks, looksIsNeutral, normalizeLooks, toneCurve } from "./looks.ts";
import { BODY_TOOLS, LOOK_TOOLS, ZERO_BODY, ZERO_LOOKS, bodyTuneFromValues, looksFromValues } from "./tools.ts";
import { clampView, fitView, pinchView, toImage, toScreen, toggleZoom, zoomAt, zoomLimits } from "./viewport.ts";

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

function solid(width: number, height: number, rgb: [number, number, number]): Raster {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = 255;
  }
  return { data, width, height };
}

function ramp(width: number, height: number): Raster {
  const r = solid(width, height, [0, 0, 0]);
  for (let i = 0, p = 0; i < r.data.length; i += 4, p++) {
    const v = (p * 13) % 256;
    r.data[i] = v;
    r.data[i + 1] = (v * 7) % 256;
    r.data[i + 2] = 255 - v;
  }
  return r;
}

// ---------------------------------------------------------------- viewport

test("fitView centres the whole image inside the viewport", () => {
  // Breiddin ræður hér: 384/1707 < 584/2560.
  const v = fitView({ width: 400, height: 600 }, { width: 1707, height: 2560 }, 8);
  near(v.scale, 384 / 1707);
  near(v.tx, 8);
  near(v.ty, (600 - 2560 * v.scale) / 2);
  const wide = fitView({ width: 400, height: 600 }, { width: 3000, height: 1000 }, 8);
  near(wide.scale, 384 / 3000);
});

test("zoomAt keeps the image point under the finger fixed", () => {
  const limits = { min: 0.01, max: 100 };
  const v = { scale: 0.25, tx: 30, ty: 40 };
  const before = toImage(v, { x: 123, y: 321 });
  const z = zoomAt(v, 3, 123, 321, limits);
  near(z.scale, 0.75);
  const after = toScreen(z, before);
  near(after.x, 123);
  near(after.y, 321);
});

test("zoomAt respects the limits", () => {
  const z = zoomAt({ scale: 1, tx: 0, ty: 0 }, 100, 0, 0, { min: 0.5, max: 6 });
  assert.equal(z.scale, 6);
});

test("pinchView follows both fingers: zoom by distance, pan by midpoint", () => {
  const limits = { min: 0.01, max: 100 };
  const start = { scale: 0.5, tx: 10, ty: 20 };
  const startMid = { x: 200, y: 300 };
  const grabbed = toImage(start, startMid);
  const v = pinchView(start, startMid, 100, { x: 250, y: 280 }, 300, limits);
  near(v.scale, 1.5);
  const at = toScreen(v, grabbed);
  near(at.x, 250);
  near(at.y, 280);
});

test("clampView centres a small image and limits how far a big one can be dragged", () => {
  const vp = { width: 400, height: 600 };
  const img = { width: 1000, height: 1000 };
  const small = clampView({ scale: 0.2, tx: -500, ty: 900 }, vp, img);
  near(small.tx, 100);
  near(small.ty, 200);
  const big = clampView({ scale: 2, tx: 5000, ty: -99999 }, vp, img, 0.3);
  near(big.tx, 120);
  near(big.ty, 600 - 2000 - 180);
});

test("zoomLimits allow deep zoom on a large photo", () => {
  const lim = zoomLimits({ width: 400, height: 600 }, { width: 1707, height: 2560 });
  const fit = fitView({ width: 400, height: 600 }, { width: 1707, height: 2560 }).scale;
  assert.ok(lim.max / fit > 20, "more than 20× the fitted size");
  near(lim.min, fit / 2);
});

test("toggleZoom goes fit → 2.5× at the tap point → fit", () => {
  const vp = { width: 400, height: 600 };
  const img = { width: 2000, height: 3000 };
  const fit = fitView(vp, img);
  const lim = zoomLimits(vp, img);
  const tap = { x: 150, y: 220 };
  const zoomed = toggleZoom(fit, fit, tap, lim);
  near(zoomed.scale, fit.scale * 2.5);
  const p = toScreen(zoomed, toImage(fit, tap));
  near(p.x, tap.x);
  near(p.y, tap.y);
  assert.deepEqual(toggleZoom(zoomed, fit, tap, lim), fit);
});

// ---------------------------------------------------------------- history

test("patch undo/redo restores exactly the stroke rectangle", () => {
  const img = ramp(20, 10);
  const original = new Uint8ClampedArray(img.data);
  const h = new EditHistory();
  const rect = { x: 3, y: 2, w: 5, h: 4 };
  h.pushPatch(rect, cutRect(img.data, img.width, rect));
  for (let y = 2; y < 6; y++) for (let x = 3; x < 8; x++) img.data[(y * 20 + x) * 4] = 0;
  const edited = new Uint8ClampedArray(img.data);
  const afterUndo = h.undo(img);
  assert.equal(afterUndo, img, "patch undo works in place");
  assert.deepEqual(img.data, original);
  assert.ok(h.canRedo);
  h.redo(img);
  assert.deepEqual(img.data, edited);
});

test("full entries swap whole rasters, including a different size", () => {
  const a = solid(4, 4, [1, 2, 3]);
  const b = solid(4, 6, [9, 9, 9]);
  const h = new EditHistory();
  h.pushFull(a);
  const back = h.undo(b);
  assert.equal(back, a);
  const fwd = h.redo(back);
  assert.equal(fwd, b);
});

test("revertTo(mark) cancels a tool session and drops it from redo", () => {
  const img = ramp(8, 8);
  const start = new Uint8ClampedArray(img.data);
  const h = new EditHistory();
  const mark = h.mark();
  for (let k = 0; k < 3; k++) {
    const rect = { x: k, y: k, w: 2, h: 2 };
    h.pushPatch(rect, cutRect(img.data, 8, rect));
    img.data[((k + 1) * 8 + k) * 4] = 7;
  }
  const result = h.revertTo(mark, img);
  assert.deepEqual(result.data, start);
  assert.equal(h.canUndo, false);
  assert.equal(h.canRedo, false);
  assert.equal(h.usedBytes, 0);
});

test("history drops the oldest entries when over budget but keeps the newest", () => {
  const h = new EditHistory(100);
  for (let i = 0; i < 5; i++) h.pushFull(solid(3, 3, [i, i, i])); // 36 bytes each
  assert.ok(h.usedBytes <= 100);
  let cur = solid(3, 3, [99, 99, 99]);
  cur = h.undo(cur);
  assert.equal(cur.data[0], 4, "newest entry survived");
});

test("a new edit after undo clears redo", () => {
  const h = new EditHistory();
  h.pushFull(solid(2, 2, [1, 1, 1]));
  h.undo(solid(2, 2, [2, 2, 2]));
  assert.ok(h.canRedo);
  h.pushFull(solid(2, 2, [3, 3, 3]));
  assert.equal(h.canRedo, false);
});

test("clipRect and unionRect", () => {
  assert.deepEqual(clipRect({ x: -3.5, y: 2.2, w: 10, h: 100 }, 5, 20), { x: 0, y: 2, w: 5, h: 18 });
  assert.equal(clipRect({ x: 10, y: 10, w: 2, h: 2 }, 5, 5), null);
  assert.deepEqual(unionRect({ x: 1, y: 1, w: 2, h: 2 }, { x: 4, y: 0, w: 1, h: 1 }), { x: 1, y: 0, w: 4, h: 3 });
});

// ---------------------------------------------------------------- looks

test("neutral looks leave the image untouched", () => {
  const img = ramp(16, 16);
  const before = new Uint8ClampedArray(img.data);
  applyLooks(img, NEUTRAL_LOOKS);
  assert.deepEqual(img.data, before);
  assert.ok(looksIsNeutral(NEUTRAL_LOOKS));
});

test("tone curve stays monotonic at every extreme", () => {
  for (const b of [-1, 0, 1]) for (const c of [-1, 0, 1]) for (const hi of [-1, 1]) for (const sh of [-1, 1]) {
    const lut = toneCurve({ brightness: b, contrast: c, highlights: hi, shadows: sh });
    for (let v = 1; v < 256; v++) assert.ok(lut[v] >= lut[v - 1], `b${b} c${c} h${hi} s${sh} at ${v}`);
  }
});

test("brightness, contrast, warmth and saturation move the image the right way", () => {
  const mean = (r: Raster) => {
    let s = 0;
    for (let i = 0; i < r.data.length; i += 4) s += r.data[i] + r.data[i + 1] + r.data[i + 2];
    return s / (r.data.length * 0.75);
  };
  const bright = ramp(16, 16);
  applyLooks(bright, { ...NEUTRAL_LOOKS, brightness: 0.6 });
  assert.ok(mean(bright) > mean(ramp(16, 16)));

  const flat = solid(2, 1, [60, 60, 60]);
  flat.data[4] = 200;
  flat.data[5] = 200;
  flat.data[6] = 200;
  applyLooks(flat, { ...NEUTRAL_LOOKS, contrast: 0.8 });
  assert.ok(flat.data[0] < 60 && flat.data[4] > 200);

  const warm = solid(1, 1, [120, 120, 120]);
  applyLooks(warm, { ...NEUTRAL_LOOKS, warmth: 1 });
  assert.ok(warm.data[0] > 120 && warm.data[2] < 120);

  const grey = solid(1, 1, [200, 80, 40]);
  applyLooks(grey, { ...NEUTRAL_LOOKS, saturation: -1 });
  assert.equal(grey.data[0], grey.data[1]);
  assert.equal(grey.data[1], grey.data[2]);
});

test("normalizeLooks clamps one-sided sliders to 0..1", () => {
  const l = normalizeLooks({ sharpen: -1, skinEven: 3, brightness: -7, warmth: Number.NaN });
  assert.equal(l.sharpen, 0);
  assert.equal(l.skinEven, 1);
  assert.equal(l.brightness, -1);
  assert.equal(l.warmth, 0);
});

// ---------------------------------------------------------------- tools

test("body sliders map onto the body tune; auto adds a gentle preset", () => {
  assert.deepEqual(bodyTuneFromValues(ZERO_BODY), { waist: 0, hips: 0, bust: 0, shoulders: 0, slim: 0, legs: 0, head: 0 });
  const t = bodyTuneFromValues({ ...ZERO_BODY, waist: -50, legs: 40 });
  near(t.waist, -0.5);
  near(t.legs, 0.4);
  const auto = bodyTuneFromValues({ ...ZERO_BODY, auto: 100 });
  assert.ok(auto.waist < 0 && auto.slim < 0 && auto.hips < 0 && auto.legs > 0);
  const capped = bodyTuneFromValues({ ...ZERO_BODY, auto: 100, waist: -100 });
  assert.equal(capped.waist, -1);
});

test("every tool has a slider spec and look values map to looks", () => {
  for (const tool of [...BODY_TOOLS, ...LOOK_TOOLS]) assert.ok(tool.slider.max > tool.slider.min, tool.id);
  const looks = looksFromValues({ ...ZERO_LOOKS, brightness: 50, sharpen: 30 });
  near(looks.brightness, 0.5);
  near(looks.sharpen, 0.3);
});

// ---------------------------------------------------------------- snjallt

test("AI tools and presets are complete and unambiguous", async () => {
  const { AI_TOOLS, BACKGROUND_CHOICES, LIGHT_PRESETS, QUICK_EDITS, PORTRAIT_PRESETS } = await import("./aiPresets.ts");
  const ids = AI_TOOLS.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, ["vidgerd", "fjarlaegja", "bakgrunnur", "himinn", "hradbreyta", "endurljos", "andlitsfegrun", "topaz", "clarity", "utvikka", "litun", "andlit"]);
  assert.equal(new Set(BACKGROUND_CHOICES.map((c) => c.id)).size, BACKGROUND_CHOICES.length);
  for (const c of BACKGROUND_CHOICES) {
    assert.ok(c.swatch, c.id);
    if (c.kind === "scene") assert.ok((c.prompt ?? "").length > 20, `${c.id} has a real prompt`);
    else assert.equal(c.prompt, undefined, `${c.id} needs no prompt`);
  }
  for (const p of [...LIGHT_PRESETS, ...QUICK_EDITS, ...PORTRAIT_PRESETS]) assert.ok(p.prompt.trim().length > 10, p.label);
});

test("Replicate throttling is recognised and waits as long as Replicate asks", async () => {
  const { throttleDelaySeconds } = await import("./aiPresets.ts");
  const msg =
    'Replicate hafnaði beiðninni (429): {"detail":"Request was throttled. Your rate limit for creating predictions is reduced to 6 requests per minute with a burst of 1 requests while you have less than $5.0 in credit. Your rate limit resets in ~4s.","status":429,"retry_after":4}';
  assert.equal(throttleDelaySeconds(msg), 5);
  assert.equal(throttleDelaySeconds("Request was throttled. Your rate limit resets in ~30s."), 31);
  assert.equal(throttleDelaySeconds("429 too many"), 11);
  assert.equal(throttleDelaySeconds("REPLICATE_API_TOKEN vantar"), null);
  assert.equal(throttleDelaySeconds('{"status":429,"retry_after":600}'), 61, "capped at a minute");
});
