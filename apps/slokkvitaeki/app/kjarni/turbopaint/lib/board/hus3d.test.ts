import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bladDilarAMetra,
  bladSlod,
  eldflokkurNafns,
  festaAVegg,
  gerdTaekis,
  gerdTakns,
  giskDilarAMetra,
  golfHaedar,
  haedarNumer,
  husLengd,
  husUrBordi,
  klippaBut,
  merkjaEldveggi,
  siaVeggiFyrirYfirlit,
  midiTakns,
  pdfDilarAMetra,
  taknMidja,
  veljaDilarAMetra,
  type Veggbutur,
} from "./hus3d";
import type { BoardObject, SymbolObject } from "./types";

const mynd = (id: string, name: string, y: number, extra: Record<string, unknown> = {}): BoardObject => ({
  id, type: "image", name, x: 0, y, width: 1000, height: 700, assetId: "a" + id,
  rotation: 0, opacity: 1, locked: false, hidden: false, ...extra,
} as BoardObject);
const veggur = (parentId: string, pts: number[], w = 10, extra: Record<string, unknown> = {}): BoardObject => ({
  id: "v" + Math.random(), type: "polyline", name: "Veggur", x: 0, y: 0, points: pts, stroke: "#000",
  strokeWidth: w, dash: "solid", rotation: 0, opacity: 1, locked: false, hidden: false, parentId, veggur: true, ...extra,
} as BoardObject);
const takn = (parentId: string, symbolId: string, x: number, y: number, extra: Partial<SymbolObject> = {}): SymbolObject => ({
  id: "t" + Math.random(), type: "symbol", symbolId, x, y, size: 20, label: "", rotation: 0, opacity: 1,
  locked: false, hidden: false, name: symbolId, parentId, ...extra,
} as SymbolObject);
const butur = (ax: number, ay: number, bx: number, by: number, o: Partial<Veggbutur> = {}): Veggbutur => ({
  ax, ay, bx, by, thykkt: 10, litur: "#3f3a33", tegund: "veggur", eld: 0, merking: false, ...o,
});

test("haedarNumer les heiti hæða", () => {
  assert.equal(haedarNumer("Kjallari"), 0);
  assert.equal(haedarNumer("Skútuvogur 4 — 2. hæð"), 2);
  assert.equal(haedarNumer("1.hæð"), 1);
  assert.equal(haedarNumer("Ris"), 99);
  assert.equal(haedarNumer("Skráningartafla"), null);
  assert.equal(haedarNumer("2022-10-1139929"), null);
});

test("husUrBordi: hæðir raðast eftir stöðu þegar heitin eru skjalanúmer; veggir miðast við miðju teikningar", () => {
  const objs = [
    mynd("b", "2022-10-1139928", 2000), // 2. hæð neðar á borðinu
    mynd("a", "2022-10-1139929", 800),  // 1. hæð efst
    mynd("c", "Skráningartafla", 3500), // ekkert á henni — dettur út
    veggur("a", [100, 100, 900, 100], 12),
    veggur("b", [500, 2100, 500, 2600, 900, 2600]),
  ];
  const h = husUrBordi(objs);
  assert.deepEqual(h.map((x) => x.plan.id), ["a", "b"]);
  assert.equal(h[0].veggir.length, 1);
  const v = h[0].veggir[0];
  // teikning a: miðja (500, 1150) → bútur frá (-400, -1050) til (400, -1050)
  assert.deepEqual([v.ax, v.ay, v.bx, v.by, v.thykkt], [-400, -1050, 400, -1050, 12]);
  assert.equal(h[1].veggir.length, 2, "brotalína með þremur punktum = tveir bútar");
  assert.deepEqual(h[0].umfang, { x0: -400, y0: -1050, x1: 400, y1: -1050 });
});

test("husUrBordi: tegund veggjar (gler / hurð) fylgir í 3D", () => {
  const objs = [
    mynd("a", "1. hæð", 0),
    veggur("a", [100, 100, 500, 100], 12),
    veggur("a", [500, 100, 700, 100], 6, { veggTegund: "gler", name: "Veggur · gler" }),
    veggur("a", [700, 100, 780, 100], 12, { veggTegund: "hurd", name: "Veggur · hurð" }),
  ];
  const [h] = husUrBordi(objs);
  assert.deepEqual(h.veggir.map((v) => v.tegund), ["veggur", "gler", "hurd"]);
});

test("eldflokkurNafns les EI-60 / EI-30 úr nafni merkingar", () => {
  assert.equal(eldflokkurNafns("EI-veggur EI-60"), 60);
  assert.equal(eldflokkurNafns("Eldveggur EI-30"), 30);
  assert.equal(eldflokkurNafns("Eldveggur E-60"), 60);
  assert.equal(eldflokkurNafns("EI-veggur"), 0);
  assert.equal(eldflokkurNafns("EI-veggur EI-CS"), 0);
  assert.equal(eldflokkurNafns("EI-veggur EI-120"), 0);
});

test("eldveggjamerking litar vegginn sem hún liggur eftir — og hurðina í honum; laus merking stendur sjálf", () => {
  const objs = [
    mynd("a", "1. hæð", 0),
    veggur("a", [100, 100, 500, 100], 12),
    veggur("a", [500, 100, 580, 100], 12, { veggTegund: "hurd", name: "Veggur · hurð" }),
    veggur("a", [100, 400, 500, 400], 12),
    // EI-60 eftir efri veggnum og hurðinni (ögn til hliðar, eins og handteiknuð merking)
    { ...veggur("a", [95, 103, 585, 103], 14), veggur: undefined, name: "EI-veggur EI-60", stroke: "#dc2626" } as BoardObject,
    // EI-30 þar sem enginn veggur er
    { ...veggur("a", [800, 200, 800, 600], 14), veggur: undefined, name: "Eldveggur EI-30", stroke: "#f87171" } as BoardObject,
  ];
  const [h] = husUrBordi(objs);
  const efri = h.veggir.find((v) => v.tegund === "veggur" && v.ay < -200)!;
  const nedri = h.veggir.find((v) => v.tegund === "veggur" && v.ay > -200 && !v.merking)!;
  const hurd = h.veggir.find((v) => v.tegund === "hurd")!;
  assert.equal(efri.eld, 60);
  assert.equal(hurd.eld, 60, "hurð í brunavegg er brunahurð");
  assert.equal(nedri.eld, 0);
  const laus = h.veggir.filter((v) => v.merking);
  assert.equal(laus.length, 1, "aðeins lausa merkingin stendur sjálf");
  assert.equal(laus[0].eld, 30);
  assert.equal(h.veggir.length, 4);
});

test("laus eldveggjamerking sem hleypur út af húsinu er klippt að gólfinu og ræður ekki stærð hússins", () => {
  const uttekt = { companyId: 1, haedId: "h", frumB: 1000, frumH: 700, skurdur: { x: 100, y: 100, w: 400, h: 300 } };
  const objs = [
    mynd("a", "1. hæð", 0, { uttekt }),
    veggur("a", [100, 100, 500, 100], 10),
    veggur("a", [100, 400, 500, 400], 10),
    // rakning sem fór út af blaðinu: frá húsinu (300, 250) langt til hægri og niður
    { ...veggur("a", [300, 250, 3000, 2600], 8), veggur: undefined, name: "Eldveggur EI-60", stroke: "#dc2626" } as BoardObject,
  ];
  const [h] = husUrBordi(objs);
  const laus = h.veggir.find((v) => v.laus)!;
  assert.ok(laus, "merkingin stendur (innan hússins)");
  assert.ok(laus.bx <= h.golf.x1 + 1e-9 && laus.by <= h.golf.y1 + 1e-9, "klippt að gólfinu");
  assert.ok(h.golf.x1 <= 500 && h.golf.y1 <= 350, "gólfið innan blaðsins");
  // stærð hússins = veggirnir (400 breiðir), ekki merkingin
  assert.deepEqual(h.umfang, { x0: -400, y0: -250, x1: 0, y1: 50 });
});

test("klippaBut: Liang–Barsky", () => {
  const r = { x0: 0, y0: 0, x1: 10, y1: 10 };
  assert.deepEqual(klippaBut({ ax: -5, ay: 5, bx: 15, by: 5 }, r), { ax: 0, ay: 5, bx: 10, by: 5 });
  assert.equal(klippaBut({ ax: -5, ay: -5, bx: -1, by: 20 }, r), null);
  assert.deepEqual(klippaBut({ ax: 2, ay: 2, bx: 8, by: 8 }, r), { ax: 2, ay: 2, bx: 8, by: 8 });
});

test("merkjaEldveggi: þvermerking (hornrétt) snertir ekki vegginn", () => {
  const ut = merkjaEldveggi([butur(0, 0, 400, 0)], [butur(200, -100, 200, 100, { eld: 60, merking: true })]);
  assert.equal(ut[0].eld, 0);
  assert.equal(ut.length, 2);
});

test("gerdTaekis: sama regla og Teikning (383)", () => {
  assert.equal(gerdTaekis("Léttvatn 6 ltr"), "slokkvitaeki");
  assert.equal(gerdTaekis("CO2 5 kg"), "co2");
  assert.equal(gerdTaekis("Brunaslanga"), "slanga");
  assert.equal(gerdTaekis("Eldvarnarteppi"), "teppi");
  assert.equal(gerdTaekis("Reykskynjari"), "reykskynjari");
  assert.equal(gerdTaekis(null, "neyðarútgangur"), "skilti-ut");
  assert.equal(gerdTaekis(null, "ut"), "skilti-ut");
  assert.equal(gerdTaekis(null, "hose"), "slanga");
  assert.equal(gerdTaekis(null, "skilti_slt"), "skilti");
  assert.equal(gerdTaekis(null, "segull"), "segull");
  assert.equal(gerdTaekis(null, "hitaskynjari"), "hitaskynjari");
  assert.equal(gerdTaekis(null, "bjalla"), "bjalla");
  assert.equal(gerdTaekis(null, "rafmagn"), "rafmagn");
});

test("gerdTakns: merkjasafnið (teikn:*), tengt tæki eftir tegund, stimpill eftir merkinu, eldri tákn", () => {
  assert.equal(gerdTakns({ symbolId: "teikn:lettvatn" }), "slokkvitaeki");
  assert.equal(gerdTakns({ symbolId: "teikn:co2" }), "co2");
  assert.equal(gerdTakns({ symbolId: "teikn:segull" }), "segull");
  assert.equal(gerdTakns({ symbolId: "teikn:neydarutgangur" }), "skilti-ut");
  // tengt tæki: tegundin ræður (Teikning teiknar eftir uttaeki.type)
  assert.equal(gerdTakns({ symbolId: "teikn:annad", uttektUnitId: 25448 }, "Eldvarnarteppi"), "teppi");
  // stimpill: merkið ræður
  assert.equal(gerdTakns({ symbolId: "teikn:annad", uttektUnitId: "s:rafmagn:abc", uttektKind: "sign" }), "rafmagn");
  assert.equal(gerdTakns({ symbolId: "exit" }), "skilti-ut");
  assert.equal(gerdTakns({ symbolId: "extinguisher-co2" }), "co2");
  assert.equal(gerdTakns({ symbolId: "stairs" }), null, "stigi er ekki búnaður á vegg");
});

test("midiTakns: tæki sýnir tegundina (rautt ef komið fram yfir), stimpill nafn merkisins í sínum lit", () => {
  const t = takn("a", "teikn:lettvatn", 0, 0, { uttektUnitId: 25448, label: "N5VABN" });
  assert.deepEqual(midiTakns(t, { id: 25448, serial: "TMP-N5VABN", type: "Léttvatn 6 ltr", status: "ok" }), { texti: "Léttvatn 6 ltr", litur: "#2f9e55" });
  assert.equal(midiTakns(t, { id: 25448, serial: "TMP-N5VABN", type: null, status: "overdue" }).texti, "N5VABN");
  assert.equal(midiTakns(t, { id: 25448, serial: "TMP-N5VABN", type: "Duft", status: "overdue" }).litur, "#c93c1d");
  const s = takn("a", "teikn:neydarutgangur", 0, 0, { uttektUnitId: "s:neyðarútgangur:x1", uttektKind: "sign", uttektSign: "neyðarútgangur" });
  assert.deepEqual(midiTakns(s), { texti: "Neyðarútgangur", litur: "#15803d" });
});

test("husUrBordi: tæki fá líkan og miða úr tækjalistanum", () => {
  const objs = [
    mynd("a", "1. hæð", 0),
    veggur("a", [100, 100, 900, 100], 12),
    takn("a", "teikn:lettvatn", 490, 120, { uttektUnitId: 7 }) as BoardObject,
  ];
  const [h] = husUrBordi(objs, [{ id: 7, serial: "X-123456", type: "CO2 2 kg", status: "ok" }]);
  assert.equal(h.taeki.length, 1);
  assert.equal(h.taeki[0].gerd, "co2", "tegund tækisins ræður líkaninu");
  assert.equal(h.taeki[0].texti, "CO2 2 kg");
  // miðja táknsins (500, 130) miðuð við miðju teikningar (500, 350)
  assert.deepEqual([h.taeki[0].x, h.taeki[0].y], [0, -220]);
});

test("golfHaedar: gólfið er húsið (skurður úttektar + spássía), annars allt blaðið", () => {
  assert.deepEqual(golfHaedar({ width: 1000, height: 700 }), { x0: -500, y0: -350, x1: 500, y1: 350 });
  // borðið í hálfri stærð frummyndar; skurður 200,100 400×300 → borð 100,50 200×150; spássía 4 % af 200 = 8
  const g = golfHaedar({ width: 1000, height: 700, uttekt: { companyId: 1, haedId: "h", frumB: 2000, frumH: 1400, skurdur: { x: 200, y: 100, w: 400, h: 300 } } });
  assert.deepEqual(g, { x0: 100 - 8 - 500, y0: 50 - 8 - 350, x1: 300 + 8 - 500, y1: 200 + 8 - 350 });
  // spássían nær ekki út fyrir blaðið
  const k = golfHaedar({ width: 1000, height: 700, uttekt: { companyId: 1, haedId: "h", frumB: 1000, frumH: 700, skurdur: { x: 0, y: 0, w: 1000, h: 700 } } });
  assert.deepEqual(k, { x0: -500, y0: -350, x1: 500, y1: 350 });
});

test("taknMidja: snúið tákn heldur miðjunni", () => {
  assert.deepEqual(taknMidja({ x: 0, y: 0, size: 20, rotation: 0 }), { x: 10, y: 10 });
  const m = taknMidja({ x: 0, y: 0, size: 20, rotation: 90 });
  assert.ok(Math.abs(m.x + 10) < 1e-9 && Math.abs(m.y - 10) < 1e-9);
});

test("festaAVegg: tækið fer á yfirborð næsta veggjar, þeim megin sem það stendur, og snýr út", () => {
  const veggir = [butur(0, 0, 400, 0, { thykkt: 20 }), butur(0, 300, 400, 300, { tegund: "gler" })];
  const f = festaAVegg(veggir, 200, 40, 60);
  assert.equal(f.aVegg, true);
  assert.deepEqual([f.x, f.y, f.nx, f.ny], [200, 10, -0, 1]);
  const g = festaAVegg(veggir, 200, -30, 60);
  assert.deepEqual([g.y, g.ny], [-10, -1]);
  // gler er ekki veggur sem tæki hanga á; of langt frá → stendur þar sem merkið er
  const h = festaAVegg(veggir, 200, 280, 60);
  assert.equal(h.aVegg, false);
  assert.deepEqual([h.x, h.y], [200, 280]);
});

test("kvarði: blaðstærð í 1:100, PDF-síðan og A1-ágiskun", () => {
  // Þingholt kjallari: 6006 px JPEG af A2-skönnun (594 × 420 mm) → 101,1 dílar á metra
  assert.ok(Math.abs(bladDilarAMetra({ b_mm: 594.02, h_mm: 420.03 }, { b: 6006, h: 4251 })! - 101.11) < 0.01);
  assert.equal(bladDilarAMetra({ b_mm: 10, h_mm: 10 }, { b: 6006, h: 4251 }), null);
  assert.equal(bladDilarAMetra(null, { b: 6006, h: 4251 }), null);
  // PDF teiknuð inn í pt (1 borðdíll á pt): 1 m í 1:100 = 10 mm = 28,35 pt
  assert.ok(Math.abs(pdfDilarAMetra({ pixelsPerPdfPoint: 1 })! - 28.346) < 0.01);
  assert.equal(pdfDilarAMetra({}), null);
  // A1 í 1:100 eftir frummynd úttektarinnar (Fiskislóð: 71,4 dílar frummyndar á metra)
  const g = giskDilarAMetra({ width: 4244, height: 6006, uttekt: { companyId: 1, haedId: "h", frumB: 4244, frumH: 6006 } });
  assert.ok(Math.abs(g! - 71.44) < 0.05);
});

test("veljaDilarAMetra: fyrsti trúverðugi kostur (hús 4–300 m), annars næsti", () => {
  // hús 2000 borðdílar: kvarði 1 díll/m → 2 km (ótrúverðugt) → PDF 28,35 → 70 m
  const v = veljaDilarAMetra([{ gildi: 1, heimild: "kvardi" }, { gildi: 28.35, heimild: "pdf" }], 2000);
  assert.deepEqual(v, { dilar: 28.35, heimild: "pdf" });
  assert.equal(veljaDilarAMetra([{ gildi: 1000, heimild: "kvardi" }], 2000), null, "2 m hús er ekki hús");
  assert.equal(veljaDilarAMetra([{ gildi: null, heimild: "blad" }, { gildi: undefined, heimild: "gisk" }], 2000), null);
  assert.equal(husLengd({ umfang: null, breidd: 1000, haed: 700 }), 1000);
  assert.equal(husLengd({ umfang: { x0: -100, y0: -50, x1: 300, y1: 20 }, breidd: 1000, haed: 700 }), 400);
});

test("bladSlod: slóðin sem innflutningurinn geymdi, annars úttektarslóðin — aldrei á skorinni teikningu", () => {
  const p = "https://skjalasafn.reykjavik.is/fotoweb/archives/x/2014-06-2461_3.tif.info";
  assert.deepEqual(bladSlod({ width: 900, height: 600, heimild: { slod: p, b: 6006, h: 4251 } }), { slod: p, b: 6006, h: 4251 });
  const uttekt = { companyId: 199, haedId: "k", frumB: 6006, frumH: 4251 };
  const haedir = [{ id: "k", image_url: "/.netlify/functions/teikn-mynd?url=" + encodeURIComponent(p) }];
  assert.deepEqual(bladSlod({ width: 6006, height: 4251, uttekt }, haedir), { slod: p, b: 6006, h: 4251 });
  assert.equal(bladSlod({ width: 3000, height: 4251, uttekt }, haedir), null, "skorin teikning");
  assert.equal(bladSlod({ width: 6006, height: 4251 }), null);
});

test("siaVeggiFyrirYfirlit: stuttir húsgagna-bútar detta út, gler/hurðir/eldveggir haldast", () => {
  const hus = 260;
  const langur = butur(0, 0, 80, 0);
  const stuttur = butur(10, 10, 14, 10);
  const gler = butur(0, 20, 8, 20, { tegund: "gler" });
  const hurd = butur(20, 0, 24, 0, { tegund: "hurd" });
  const eld = butur(0, 40, 6, 40, { eld: 60 });
  const ut = siaVeggiFyrirYfirlit([langur, stuttur, gler, hurd, eld, butur(1, 1, 2, 1), butur(3, 3, 4, 3), butur(5, 5, 6, 5)], hus);
  assert.equal(ut.includes(stuttur), false);
  assert.ok(ut.includes(langur));
  assert.ok(ut.includes(gler));
  assert.ok(ut.includes(hurd));
  assert.ok(ut.includes(eld));
});

test("siaVeggiFyrirYfirlit: fáir veggir (handteiknað) eru ekki síaðir", () => {
  const stuttur = butur(0, 0, 4, 0);
  assert.deepEqual(siaVeggiFyrirYfirlit([stuttur], 200), [stuttur]);
});
