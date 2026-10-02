import assert from "node:assert/strict";
import { test } from "node:test";
import {
  erStimpil,
  giskaFrumStaerd,
  innflutningsSlod,
  merkiIBord,
  merkiLykill,
  stimpilStaerdABladi,
  symbolFyrirMerki,
  symbolFyrirStimpil,
  symbolFyrirTegund,
  taknIMerki,
  uppfaeraHaedir,
  uttektBordNafn,
  veljaUttektHaed,
  type UttektHaed,
} from "./uttekt";

test("device types map to TurboPaint symbols", () => {
  assert.equal(symbolFyrirTegund("Léttvatn"), "extinguisher-lettvatn");
  assert.equal(symbolFyrirTegund("ABC Duft"), "extinguisher-duft");
  assert.equal(symbolFyrirTegund("CO₂"), "extinguisher-co2");
  assert.equal(symbolFyrirTegund("CO2"), "extinguisher-co2");
  assert.equal(symbolFyrirTegund("Brunaslanga"), "hose");
  assert.equal(symbolFyrirTegund("Slönguskápur"), "hose");
  assert.equal(symbolFyrirTegund("Reykskynjari"), "detector");
  assert.equal(symbolFyrirTegund("Eldvarnarteppi"), "blanket");
  assert.equal(symbolFyrirTegund("Óþekkt"), "extinguisher");
  assert.equal(symbolFyrirTegund(null), "extinguisher");
});

test("marker → board → marker is lossless when the plan is imported at another size", () => {
  // Frummynd safnsins 4244×6006 px; TurboPaint teiknaði PDF-ið í 5086×7200 og setti það á (80, 120).
  const frum = { b: 4244, h: 6006 };
  const mynd = { x: 80, y: 120, width: 5086, height: 7200 };
  for (const m of [{ x: 1119, y: 1874 }, { x: 0, y: 0 }, { x: 4244, y: 6006 }, { x: 3075, y: 4217 }]) {
    const bord = merkiIBord(m, mynd, frum, 64);
    const aftur = taknIMerki({ x: bord.x, y: bord.y, size: 64 }, mynd, frum);
    assert.deepEqual(aftur, m);
  }
});

test("a moved symbol lands where it was dropped, in original pixels", () => {
  const frum = { b: 6006, h: 4295 };
  const mynd = { x: 0, y: 0, width: 3003, height: 2147.5 };
  // Tákn 40 px, miðja þess á (1500, 1000) á borðinu = (3000, 2000) í frummynd.
  assert.deepEqual(taknIMerki({ x: 1480, y: 980, size: 40 }, mynd, frum), { x: 3000, y: 2000 });
});

test("FotoWeb JPEGs are 6006 px on the long edge", () => {
  assert.deepEqual(giskaFrumStaerd({ width: 5086, height: 7200 }), { b: 4243, h: 6006 });
  assert.deepEqual(giskaFrumStaerd({ width: 7200, height: 5149 }), { b: 6006, h: 4295 });
});

test("positions update one floor, keep untouched devices and pull a moved device off other floors", () => {
  const haedir: UttektHaed[] = [
    { id: "a", nafn: "1. hæð", markers: [{ unitId: 1, x: 10, y: 10 }, { unitId: 2, x: 20, y: 20 }], skurdur: { x: 1, y: 2, w: 3, h: 4 } },
    { id: "b", nafn: "2. hæð", markers: [{ unitId: 3, x: 30, y: 30 }, { unitId: 4, x: 40, y: 40 }] },
  ];
  const stodur = new Map([
    [1, { x: 15, y: 10 }], // fært
    [3, { x: 99, y: 98 }], // var á 2. hæð — flutt á 1. hæð
  ]);
  const u = uppfaeraHaedir(haedir, "a", stodur);
  assert.deepEqual(u.haedir[0].markers, [{ unitId: 1, x: 15, y: 10 }, { unitId: 2, x: 20, y: 20 }, { unitId: 3, x: 99, y: 98 }]);
  assert.deepEqual(u.haedir[1].markers, [{ unitId: 4, x: 40, y: 40 }]);
  assert.deepEqual(u.haedir[0].skurdur, { x: 1, y: 2, w: 3, h: 4 }); // annað á hæðinni er ósnert
  assert.equal(u.breytt, 1);
  assert.equal(u.ny, 1);
});

test("sign stamps round-trip with string unit ids and keep kind/sign", () => {
  assert.equal(symbolFyrirStimpil("ut"), "exit");
  assert.equal(symbolFyrirStimpil("skilti_slt"), "sign-extinguisher");
  assert.equal(symbolFyrirMerki({ unitId: "s:ut:abc", x: 1, y: 2, kind: "sign", sign: "ut" }), "exit");
  assert.equal(erStimpil({ unitId: "s:ut:abc", kind: "sign" }), true);
  assert.equal(erStimpil({ unitId: 25442 }), false);
  assert.equal(merkiLykill("s:ut:abc"), "s:ut:abc");
  const haedir: UttektHaed[] = [
    { id: "a", markers: [{ unitId: 25442, x: 10, y: 10 }, { unitId: "s:ut:abc", x: 20, y: 20, kind: "sign", sign: "ut" }] },
  ];
  const stodur = new Map([
    ["25442", { x: 11, y: 10, unitId: 25442 }],
    ["s:ut:abc", { x: 21, y: 22, unitId: "s:ut:abc", kind: "sign", sign: "ut" }],
  ]);
  const u = uppfaeraHaedir(haedir, "a", stodur);
  assert.deepEqual(u.haedir[0].markers, [
    { unitId: 25442, x: 11, y: 10 },
    { unitId: "s:ut:abc", x: 21, y: 22, kind: "sign", sign: "ut" },
  ]);
  assert.equal(u.breytt, 2);
});

test("veljaUttektHaed prefers id, then matching plan permalink, then first floor", () => {
  const info = "https://skjalasafn.reykjavik.is/fotoweb/x.pdf.info";
  const haedir: UttektHaed[] = [
    { id: "h1", nafn: "1. hæð", image_url: "/.netlify/functions/teikn-mynd?url=" + encodeURIComponent(info) },
    { id: "h2", nafn: "2. hæð", image_url: "https://example.com/annad.png" },
  ];
  assert.equal(veljaUttektHaed(haedir, "h2")?.id, "h2");
  assert.equal(veljaUttektHaed(haedir, "", info)?.id, "h1");
  assert.equal(veljaUttektHaed(haedir)?.id, "h1");
  assert.equal(uttektBordNafn("Bílabúð Benna - Fiskislóð", haedir[0]), "Bílabúð Benna - Fiskislóð — 1. hæð");
});

test("the archive permalink is recovered from the app's image proxy URL", () => {
  const info = "https://skjalasafn.reykjavik.is/fotoweb/archives/5000-A%C3%B0aluppdr%C3%A6ttir/x/2023-11-2843345.pdf.info";
  assert.equal(innflutningsSlod("/.netlify/functions/teikn-mynd?url=" + encodeURIComponent(info)), info);
  assert.equal(innflutningsSlod("https://example.com/plan.png"), "https://example.com/plan.png");
  assert.equal(innflutningsSlod("data:image/jpeg;base64,AAAA"), "");
  assert.equal(innflutningsSlod(null), "");
});

test("round-trip stamps stay readable when a 6006 px sheet is fit to a phone", () => {
  const s = stimpilStaerdABladi({ width: 4244, height: 6006 }, 56);
  assert.ok(s >= 400, "world size must scale with the sheet, got " + s);
  const css = s * (390 / 6006);
  assert.ok(css >= 26, "phone fit must be ≥26 CSS px, got " + css.toFixed(1));
  assert.equal(stimpilStaerdABladi({ width: 400, height: 300 }, 56), 56);
});
