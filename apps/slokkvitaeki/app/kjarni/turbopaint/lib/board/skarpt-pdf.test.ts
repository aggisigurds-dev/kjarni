import assert from "node:assert/strict";
import { test } from "node:test";
import { blekgrima, samaSvaedi, sidaPassar, SKARPT_HAMARK, skarptSvaedi } from "./skarpt-pdf";

// Fiskislóð 41: A1-síða 1684 × 2384 pt á borðinu (1 borðeining á pt), rastamynd 5316 × 7526 dílar (227 DPI)
const PLAN = { x: 0, y: 880, width: 1684, height: 2384, rotation: 0 };
const RASTER_B = 5316;

test("skarptSvaedi: ekkert skarpt lag á meðan myndin dugar (yfirlit, 100 %)", () => {
  assert.equal(skarptSvaedi(PLAN, { x: 0, y: 0, scale: 0.3 }, { w: 1600, h: 900 }, 1, RASTER_B), null);
  // 3,16 dílar myndar á borðeiningu; 3,5× aðdráttur er undir 1,2 × 3,16
  assert.equal(skarptSvaedi(PLAN, { x: 0, y: 0, scale: 3.5 }, { w: 1600, h: 900 }, 1, RASTER_B), null);
});

test("skarptSvaedi: þysjað nær — aðeins sýnilegi hlutinn, í skjáupplausn", () => {
  // aðdráttur 8: skjárinn sýnir 1600 / 8 = 200 × 112,5 borðeiningar frá (500, 1380)
  const cam = { x: -500 * 8, y: -1380 * 8, scale: 8 };
  const sv = skarptSvaedi(PLAN, cam, { w: 1600, h: 900 }, 1, RASTER_B)!;
  assert.ok(sv);
  assert.deepEqual([sv.x, sv.y, sv.w, sv.h], [500, 500, 200, 113]);
  assert.equal(sv.k, 8);
  assert.deepEqual([sv.cw, sv.ch], [1600, 904]);
  // tvöfaldur skjár (dpr 2) → tvöfalt fleiri dílar
  assert.equal(skarptSvaedi(PLAN, cam, { w: 1600, h: 900 }, 2, RASTER_B)!.cw, 3200);
});

test("skarptSvaedi: klippt að myndinni, hámarksstærð, snúin mynd og utan skjás", () => {
  // skjárinn nær út fyrir vinstri brún myndarinnar
  const sv = skarptSvaedi(PLAN, { x: 400, y: -1000 * 6, scale: 6 }, { w: 1600, h: 900 }, 1, RASTER_B)!;
  assert.equal(sv.x, 0);
  assert.ok(sv.w <= (1600 - 400) / 6 + 1);
  // risaskjár: strigi takmarkaður við SKARPT_HAMARK
  const stor = skarptSvaedi(PLAN, { x: 0, y: -880 * 20, scale: 20 }, { w: 30000, h: 30000 }, 1, RASTER_B)!;
  assert.ok(stor.cw <= SKARPT_HAMARK && stor.ch <= SKARPT_HAMARK);
  assert.equal(skarptSvaedi({ ...PLAN, rotation: 90 }, { x: 0, y: 0, scale: 8 }, { w: 1600, h: 900 }, 1, RASTER_B), null);
  assert.equal(skarptSvaedi(PLAN, { x: 50000, y: 0, scale: 8 }, { w: 1600, h: 900 }, 1, RASTER_B), null);
});

test("samaSvaedi / sidaPassar", () => {
  const a = { x: 10, y: 10, w: 100, h: 50, cw: 800, ch: 400, k: 8 };
  assert.ok(samaSvaedi(a, { ...a, x: 10.03 }));
  assert.ok(!samaSvaedi(a, { ...a, x: 11 }));
  assert.ok(!samaSvaedi(a, { ...a, k: 9 }));
  assert.ok(!samaSvaedi(null, a));
  assert.ok(sidaPassar({ width: 1684, height: 2384 }, { b: 1684, h: 2384 }));
  assert.ok(!sidaPassar({ width: 1000, height: 2384 }, { b: 1684, h: 2384 }), "skorin mynd passar ekki");
});

test("blekgrima: blek myndarinnar víkkað um 2 díla — það sem var strokað út (hvítt) fær enga grímu", () => {
  const w = 12, h = 5, rgba = new Uint8ClampedArray(w * h * 4).fill(255);
  rgba[(2 * w + 5) * 4] = rgba[(2 * w + 5) * 4 + 1] = rgba[(2 * w + 5) * 4 + 2] = 20; // einn svartur díll (5, 2)
  const g = blekgrima(rgba, w, h, 235, 2);
  assert.equal(g[2 * w + 5], 255);
  assert.equal(g[2 * w + 7], 255, "víkkað 2 til hægri");
  assert.equal(g[3], 255, "og 2 á ská (ferningur): díll (3, 0)");
  assert.equal(g[2 * w + 8], 0, "ekki 3");
  assert.equal(g[2 * w + 0], 0);
  // ljósgrátt (≥ 235) er pappír
  const p = new Uint8ClampedArray(4).fill(240);
  assert.equal(blekgrima(p, 1, 1)[0], 0);
  // sjálfgefið: víkkað um 1 díl (svo PDF-blek nái ekki inn á útstrokað svæði við jaðar þess)
  const s = blekgrima(rgba, w, h);
  assert.equal(s[2 * w + 6], 255);
  assert.equal(s[2 * w + 7], 0);
});
