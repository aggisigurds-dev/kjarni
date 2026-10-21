// Vegghjálp úr Búnaðargreiningu (EI-merki + hurðarop) og ein teikningarregla fyrir „Greina veggi" (21.10.2026).
import assert from "node:assert/strict";
import { test } from "node:test";
import { teikningTilGreiningar } from "./greining-teikning";
import type { BoardObject, ImageObject } from "./types";
import { eiMidarUrVegghjalpi, lesaVegghjalpHaed } from "./vegghjalp";

function mynd(o: Partial<ImageObject> = {}): ImageObject {
  return {
    id: "m1", type: "image", assetId: "a1", x: 100, y: 50, width: 3003, height: 2149, rotation: 0, opacity: 1, locked: false, hidden: false, name: "1. hæð",
    uttekt: { companyId: 1612, haedId: "hmuaaaw83rg9", frumB: 6006, frumH: 4298, skurdur: { x: 0, y: 0, w: 6006, h: 4298 } },
    heimild: { slod: "https://skjalasafn.reykjavik.is/fotoweb/archives/5000/x.pdf.info", b: 3003, h: 2149 },
    ...o,
  } as ImageObject;
}

test("vegghjálp: JSON úr gagnagrunninum — rusl síast burt, tómt = null", () => {
  assert.equal(lesaVegghjalpHaed(null), null);
  assert.equal(lesaVegghjalpHaed({ ei: [], hurdir: [] }), null);
  assert.equal(lesaVegghjalpHaed({ ei: [{ t: "EI60", x: "a", y: 1 }], hurdir: [{ hjor: [1, 2] }] }), null);
  const v = lesaVegghjalpHaed({
    ei: [{ t: "EI60", x: 1000, y: 400, ori: "v" }, { t: 5, x: 1, y: 1 }, { t: "EI30-CS", x: 2000, y: 800 }],
    hurdir: [{ hjor: [10, 20], a: [30, 20], b: [10, 40], breidd_m: 0.9, blad: true }, { hjor: [1, 2], a: [3, 4], b: [5, 6] }],
    pxm: 71.4,
  });
  assert.ok(v);
  assert.equal(v.ei.length, 2);
  assert.equal(v.ei[0].ori, "v");
  assert.equal(v.ei[1].ori, "h");
  assert.equal(v.hurdir.length, 1, "bogi án breidd_m er ekki hurð");
  assert.equal(v.hurdir[0].blad, true);
  assert.equal(v.pxm, 71.4);
});

test("vegghjálp: EI-merki → borðhnit (sama snið og OCR): flokkun, EI-CS = hurð, utan flokka fellur, A- forskeyti", () => {
  const m = mynd();
  const kx = 3003 / 6006, ky = 2149 / 4298;
  const v = lesaVegghjalpHaed({
    ei: [
      { t: "EI60", x: 1000, y: 400, ori: "v" },
      { t: "A-EI30", x: 2000, y: 800, ori: "h" },
      { t: "EI30-CS", x: 3000, y: 900 },
      { t: "EI90", x: 3100, y: 900 },
      { t: "REIM60", x: 3200, y: 900 },
    ],
    hurdir: [],
  })!;
  const midar = eiMidarUrVegghjalpi(v, m);
  assert.equal(midar.length, 3, "EI90 og REIM falla");
  assert.deepEqual(midar[0], { x: 100 + 1000 * kx, y: 50 + 400 * ky, lodrett: true, minutur: 60, reyk: false });
  assert.deepEqual([midar[1].minutur, midar[1].lodrett, midar[1].reyk], [30, false, false]);
  assert.equal(midar[2].reyk, true, "EI-CS er reykþétt hurð, ekki veggur");
});

test("vegghjálp: skorin mynd (Croppa oft) — aðeins merki innan hlutans, hnit um skurðinn", () => {
  const svaedi = { x: 3000, y: 0, w: 3006, h: 4298 };
  const m = mynd({ x: 0, y: 0, width: 1503, height: 2149, uttekt: { companyId: 1612, haedId: "h2", frumB: 6006, frumH: 4298, skurdur: svaedi, myndSkurdur: svaedi } as never });
  const v = lesaVegghjalpHaed({ ei: [{ t: "EI60", x: 1000, y: 400 }, { t: "EI60", x: 4000, y: 400 }], hurdir: [] })!;
  const midar = eiMidarUrVegghjalpi(v, m);
  assert.equal(midar.length, 1, "merkið utan hlutans (x 1000) kemur ekki");
  assert.ok(Math.abs(midar[0].x - (4000 - 3000) * 0.5) < 1e-6);
});

test("ein teikningarregla: valin → foreldri valins hlutar → eina myndin → eina myndin með úttekt → annars null", () => {
  const a = mynd({ id: "a" }), b = mynd({ id: "b", uttekt: undefined }), c = mynd({ id: "c", uttekt: undefined });
  const veggur = { id: "v1", type: "line", parentId: "c" } as unknown as BoardObject;
  // valin mynd ræður
  assert.equal(teikningTilGreiningar([a, b], ["b"])?.id, "b");
  // valinn veggur festur við teikningu → sú teikning
  assert.equal(teikningTilGreiningar([a, c, veggur], ["v1"])?.id, "c");
  // tvær myndir, engin valin, aðeins ein með úttekt → hún
  assert.equal(teikningTilGreiningar([a, b], [])?.id, "a");
  // tvær með úttekt og ekkert valið → null (áður tók ritillinn FYRSTU og greindi mögulega ranga hæð)
  assert.equal(teikningTilGreiningar([a, mynd({ id: "a2" })], []), null);
  // ein mynd → hún; falin mynd telst ekki með
  assert.equal(teikningTilGreiningar([b], [])?.id, "b");
  assert.equal(teikningTilGreiningar([mynd({ id: "h", hidden: true }), b], [])?.id, "b");
});
