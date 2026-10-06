import assert from "node:assert/strict";
import { test } from "node:test";
import {
  erStimpil,
  giskaFrumStaerd,
  innflutningsSlod,
  merkiIBord,
  merkiLykill,
  skrifaVeggiIHaed,
  skurdurIBord,
  stimpilStaerdABladi,
  symbolFyrirMerki,
  symbolFyrirStimpil,
  symbolFyrirTegund,
  taknIMerki,
  uppfaeraHaedir,
  veggirIBord,
  veggirIFrum,
  uttektBordNafn,
  veljaUttektHaed,
  type UttektHaed,
} from "./uttekt";
import type { BoardObject } from "./types";
import { VEGG_LITIR } from "./veggja-leidretting";

test("device types map to the Teikning catalogue symbols (same rule as 434 fjold)", () => {
  assert.equal(symbolFyrirTegund("Léttvatn"), "teikn:lettvatn");
  assert.equal(symbolFyrirTegund("ABC Duft"), "teikn:duft");
  assert.equal(symbolFyrirTegund("CO2"), "teikn:co2");
  assert.equal(symbolFyrirTegund("Brunaslanga"), "teikn:slanga");
  assert.equal(symbolFyrirTegund("CO₂"), "teikn:co2");
  assert.equal(symbolFyrirTegund("Slönguskápur"), "teikn:slanga");
  // Teikning-glugginn les þessar sem „annað" — TurboPaint sýnir þær eins (sjá merkjasafn.test.ts)
  assert.equal(symbolFyrirTegund("Reykskynjari"), "teikn:annad");
  assert.equal(symbolFyrirTegund("Óþekkt"), "teikn:annad");
  assert.equal(symbolFyrirTegund(null), "teikn:annad");
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
  assert.equal(symbolFyrirStimpil("ut"), "teikn:ut");
  assert.equal(symbolFyrirStimpil("skilti_slt"), "teikn:skilti_slt");
  assert.equal(symbolFyrirMerki({ unitId: "s:ut:abc", x: 1, y: 2, kind: "sign", sign: "ut" }), "teikn:ut");
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

test("stamps are sized to the building (floor crop), not the whole sheet", () => {
  // Fiskislóð 41 (A1, 4244×6006, skurður 2666×3068): tákn ≈ 1/28 af húsinu, ekki 1/14 af blaðinu (Agnar 06.10.2026).
  const frum = { b: 4244, h: 6006 };
  const s = stimpilStaerdABladi({ width: 4244, height: 6006 }, 56, { w: 2666, h: 3068 }, frum);
  assert.equal(s, Math.round(3068 / 28));
  assert.ok(s < 6006 / 14 / 3, "must be far smaller than the old sheet-based size, got " + s);
  // Borðið getur verið hærri upplausn en frummyndin (Há gæði 12.5k): stærðin fylgir.
  const hq = stimpilStaerdABladi({ width: 8838, height: 12500 }, 56, { w: 2666, h: 3068 }, frum);
  assert.ok(Math.abs(hq - s * (8838 / 4244)) <= 2, "scales with board resolution, got " + hq);
  // Stimpilstærð notandans kvarðar í báðar áttir (ekki lengur aðeins lágmark).
  assert.ok(stimpilStaerdABladi({ width: 4244, height: 6006 }, 28, { w: 2666, h: 3068 }, frum) < s);
  assert.ok(stimpilStaerdABladi({ width: 4244, height: 6006 }, 112, { w: 2666, h: 3068 }, frum) > s);
  // Án skurðar: lengri hlið blaðsins ÷ 40; lágmark 24.
  assert.equal(stimpilStaerdABladi({ width: 4244, height: 6006 }, 56), Math.round(6006 / 40));
  assert.equal(stimpilStaerdABladi({ width: 400, height: 300 }, 56), 24);
});

test("veggir fara fram og til baka milli borðs og frummyndar (TurboPaint → teikning_bord → TurboPaint)", () => {
  const mynd = { id: "m", x: 100, y: 50, width: 2000, height: 1400 };
  const frum = { b: 9933, h: 6953 };
  const bord = veggirIBord([{ p: [0, 0, 9933, 0, 9933, 6953], t: 50 }], mynd, frum);
  assert.equal(bord.length, 1);
  assert.deepEqual(bord[0].points.map((n) => Math.round(n)), [100, 50, 2100, 50, 2100, 1450]);
  assert.ok(Math.abs(bord[0].strokeWidth - 50 * (2000 / 9933)) < 1e-9);
  const aftur = veggirIFrum(bord as BoardObject[], mynd, frum);
  assert.deepEqual(aftur, [{ p: [0, 0, 9933, 0, 9933, 6953], t: 50, tegund: "veggur" }]);
  // aðeins greindir veggir ÞESSARAR myndar fara með
  assert.equal(veggirIFrum([{ ...bord[0], parentId: "annad" }] as BoardObject[], mynd, frum).length, 0);
});

test("tegund veggjar (gler/hurð) fer fram og til baka og ræður litnum", () => {
  const mynd = { id: "m", x: 0, y: 0, width: 4244, height: 6006 };
  const frum = { b: 4244, h: 6006 };
  const bord = veggirIBord(
    [
      { p: [0, 0, 100, 0], t: 7 },
      { p: [0, 10, 100, 10], t: 7, tegund: "gler" },
      { p: [0, 20, 100, 20], t: 7, tegund: "hurd" },
    ],
    mynd,
    frum
  );
  assert.deepEqual(bord.map((o) => o.stroke), ["#1c1917", VEGG_LITIR.gler, VEGG_LITIR.hurd]);
  assert.deepEqual(bord.map((o) => o.veggTegund), [undefined, "gler", "hurd"]);
  const aftur = veggirIFrum(bord as BoardObject[], mynd, frum);
  assert.deepEqual(aftur.map((v) => v.tegund), ["veggur", "gler", "hurd"]);
});

test("veggur teiknaður með W-tólinu ofan á myndina vistast; utan myndar ekki", () => {
  const mynd = { id: "m", x: 100, y: 100, width: 1000, height: 1000 };
  const frum = { b: 2000, h: 2000 };
  const w = (points: number[]) =>
    ({ id: "w" + points[0], type: "polyline", x: 0, y: 0, points, stroke: "#000", strokeWidth: 4, dash: "solid",
       rotation: 0, opacity: 1, locked: false, hidden: false, name: "Veggir", layerId: "almennt" }) as BoardObject;
  const v = veggirIFrum([w([200, 200, 600, 200]), w([1500, 1500, 1800, 1500])], mynd, frum);
  assert.deepEqual(v, [{ p: [200, 200, 1000, 200], t: 8, tegund: "veggur" }]);
});

test("skurður hæðarinnar → rammi á borðinu (myndin sjálf ósnert)", () => {
  // Fiskislóð 41: frummynd 4244×6006, borðið teiknaði PDF-ið í 5086×7200 á (80, 120)
  const r = skurdurIBord({ x: 861, y: 1590, w: 2605, h: 3068 }, { x: 80, y: 120, width: 5086, height: 7200 }, { b: 4244, h: 6006 })!;
  const k = 5086 / 4244;
  assert.ok(Math.abs(r.x - (80 + 861 * k)) < 1e-6 && Math.abs(r.width - 2605 * k) < 1e-6);
  assert.ok(Math.abs(r.y - (120 + 1590 * (7200 / 6006))) < 1e-6 && Math.abs(r.height - 3068 * (7200 / 6006)) < 1e-6);
  assert.equal(skurdurIBord(null, { x: 0, y: 0, width: 1, height: 1 }, { b: 1, h: 1 }), null);
  assert.equal(skurdurIBord({ x: 0, y: 0, w: 2, h: 2 }, { x: 0, y: 0, width: 1, height: 1 }, { b: 1, h: 1 }), null);
});

test("Vista í úttekt: veggjaLinur + leidrett á einni hæð; aðrar hæðir og annað ósnert; engir veggir = engin breyting", () => {
  const haedir: UttektHaed[] = [
    { id: "a", nafn: "1. hæð", markers: [], pdfVeggir: [[1, 2, 3, 4]], skurdur: { x: 1, y: 2, w: 30, h: 40 } },
    { id: "b", nafn: "2. hæð", markers: [], veggjaLinur: [{ p: [0, 0, 5, 5], t: 2 }] },
  ];
  const veggir = [{ p: [0, 0, 10, 0], t: 7, tegund: "gler" as const }];
  const ut = skrifaVeggiIHaed(haedir, "a", veggir, "2026-10-06T12:00:00.000Z");
  assert.deepEqual(ut[0].veggjaLinur, veggir);
  assert.deepEqual(ut[0].leidrett, { af: "turbopaint", kl: "2026-10-06T12:00:00.000Z" });
  assert.deepEqual(ut[0].pdfVeggir, [[1, 2, 3, 4]]);
  assert.deepEqual(ut[0].skurdur, haedir[0].skurdur);
  assert.equal(ut[1], haedir[1]);
  assert.equal(skrifaVeggiIHaed(haedir, "a", [], "x"), haedir);
});
