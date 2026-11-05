import assert from "node:assert/strict";
import { test } from "node:test";
import { hreinsaEignir, LISTI_HAMARK } from "./heimilisfang-leit";

const e = (landnr: number, label: string) => ({ landnr, label });

test("hreinsaEignir: sama lóð einu sinni (Brekka lóð ×35 → 1)", () => {
  const res = [e(167210, "Brekka lóð (806) - L 167210"), e(167210, "Brekka lóð (806) - L 167210"), e(167212, "Brekka lóð (806) - L 167212"), e(167210, "Brekka lóð (806) - L 167210")];
  assert.deepEqual(hreinsaEignir(res, "Br").map((x) => x.landnr), [167210, 167212]);
});

test("hreinsaEignir: það sem líkist innslættinum fyrst; röð safnsins heldur sér innan flokks", () => {
  const res = [e(1, "Brekka lóð (806) - L 1"), e(2, "Bríetartún 3 3-5 (105) - L 2"), e(3, "Bríetartún 9 (105) - L 3"), e(4, "Braut (320) - L 4")];
  assert.deepEqual(hreinsaEignir(res, "Bríetartún").map((x) => x.landnr), [2, 3, 1, 4]);
  assert.deepEqual(hreinsaEignir(res, "Bríetartún 9").map((x) => x.landnr), [3, 1, 2, 4], "nákvæmt heiti fyrst");
});

test("hreinsaEignir: NFC — sími sendir „í“ sem i + lausan brodd", () => {
  const res = [e(1, "Brekka lóð (806) - L 1"), e(3, "Bríetartún 9 (105) - L 3")];
  assert.equal(hreinsaEignir(res, "Bríetartún 9")[0].landnr, 3);
});

test("LISTI_HAMARK: „Br“ (249 lóðir) er yfir hamrinum, „Brí“ (11) undir", () => {
  assert.ok(249 > LISTI_HAMARK && 11 < LISTI_HAMARK);
});
