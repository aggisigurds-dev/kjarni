import assert from "node:assert/strict";
import { test } from "node:test";
import type { BoardObject, LineObject } from "./types";
import {
  bilMilli,
  faeraEnda,
  greiningarLotur,
  heimsPunktar,
  hlidra,
  hornalas,
  kljufaVegg,
  lengjaAd,
  metraTexti,
  nyGreiningarLota,
  nyrVeggur,
  rettHyrningur,
  sameinaVeggi,
  sameinaVidVeggi,
  semButur,
  smella,
  talningTexti,
  tengdirEndar,
  veggirIKassa,
  veggjaTalning,
  veggurVid,
  type P,
} from "./veggja-ritill";
import { VEGG_LITIR } from "./veggja-leidretting";

let nr = 0;
const id = () => "t" + ++nr;
const vg = (i: string, points: number[], extra: Partial<LineObject> = {}): LineObject => ({
  ...nyrVeggur(points, { id: i, thykkt: 8, tegund: "veggur" }),
  ...extra,
});
const naerri = (a: number[], b: number[], vik = 1e-6) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= vik);

test("hornalás: 0/45/90° frá akkerinu, lengdin er ofanvarp bendilsins", () => {
  assert.deepEqual(hornalas([0, 0], [100, 7]), [100, 0]);
  assert.deepEqual(hornalas([10, 10], [12, 90]), [10, 90]);
  const s = hornalas([0, 0], [100, 90]);
  assert.ok(Math.abs(s[0] - s[1]) < 1e-9 && Math.abs(s[0] - 95) < 1e-9, JSON.stringify(s));
  assert.deepEqual(hornalas([0, 0], [-50, 3]), [-50, 0]);
});

test("smella: endapunktur gengur fyrir línu, lína fyrir lausum punkti; undan-veggur smellist ekki", () => {
  const V = [vg("a", [0, 0, 100, 0]), vg("b", [200, 0, 200, 100])];
  const e = smella([97, 4], V, { vik: 10 });
  assert.equal(e.tegund, "endi");
  assert.deepEqual(e.P, [100, 0]);
  assert.equal(e.veggId, "a");
  const l = smella([50, 6], V, { vik: 10 });
  assert.equal(l.tegund, "lina");
  assert.deepEqual(l.P, [50, 0]);
  const ekkert = smella([50, 40], V, { vik: 10 });
  assert.equal(ekkert.tegund, null);
  assert.deepEqual(ekkert.P, [50, 40]);
  const undan = smella([97, 4], V, { vik: 10, undan: new Set(["a"]) });
  assert.equal(undan.tegund, null);
  // hvarfpunktur: x/y hlutarins teljast með
  const hlidrad = [vg("c", [0, 0, 10, 0], { x: 500, y: 500 })];
  assert.deepEqual(smella([509, 501], hlidrad, { vik: 5 }).P, [510, 500]);
});

test("smella með hornalás: skurðpunktur geislans við vegg; annars læstur punktur", () => {
  const V = [vg("v", [100, -50, 100, 50])];
  // akkeri (0, 0), bendill rétt hjá veggnum en skakkur — lásinn gerir línuna lárétta og hún smellur á vegginn
  const s = smella([96, 7], V, { vik: 10, akkeri: [0, 0], hornalas: true });
  assert.equal(s.tegund, "lina");
  assert.ok(naerri(s.P, [100, 0]), JSON.stringify(s));
  const frjals = smella([40, 7], V, { vik: 10, akkeri: [0, 0], hornalas: true });
  assert.equal(frjals.tegund, "hornalas");
  assert.deepEqual(frjals.P, [40, 0]);
});

test("veggurVid: næsta miðlína innan vikmarka eða hálfrar þykktar", () => {
  const V = [vg("a", [0, 0, 100, 0]), vg("b", [0, 20, 100, 20], { strokeWidth: 30 })];
  assert.equal(veggurVid([50, 3], V, 5)?.o.id, "a");
  assert.equal(veggurVid([50, 12], V, 5)?.o.id, "b"); // innan hálfrar þykktar b (15)
  assert.equal(veggurVid([50, 60], V, 5), null);
});

test("kassaval: „inni“ krefst alls veggjarins, „snerta“ nægir að skera", () => {
  const V = [vg("inni", [10, 10, 40, 10]), vg("sker", [30, 20, 200, 20]), vg("utan", [300, 300, 400, 300]), vg("thvert", [50, -100, 50, 200])];
  const k = { x: 0, y: 0, width: 100, height: 50 };
  assert.deepEqual(veggirIKassa(V, k, "inni"), ["inni"]);
  assert.deepEqual(veggirIKassa(V, k, "snerta").sort(), ["inni", "sker", "thvert"]);
});

test("rétthyrningur → fjórir veggir sem mætast í hornunum, með tegund og þykkt", () => {
  const R = rettHyrningur([100, 50], [20, 10], { thykkt: 12, tegund: "gler", parentId: "mynd" }, id);
  assert.equal(R.length, 4);
  assert.deepEqual(R.map((o) => o.points), [
    [20, 10, 100, 10],
    [100, 10, 100, 50],
    [100, 50, 20, 50],
    [20, 50, 20, 10],
  ]);
  for (const o of R) {
    assert.equal(o.strokeWidth, 12);
    assert.equal(o.veggTegund, "gler");
    assert.equal(o.stroke, VEGG_LITIR.gler);
    assert.equal(o.parentId, "mynd");
    assert.equal(o.layerId, "veggir");
    assert.equal(o.veggur, true);
  }
  assert.equal(new Set(R.map((o) => o.id)).size, 4);
  assert.deepEqual(rettHyrningur([0, 0], [0, 10], { thykkt: 1, tegund: "veggur" }, id), []);
});

test("kljúfa: tveir veggir sem mætast við smellinn, tegund/þykkt/festing haldast; ekki við enda", () => {
  const o = vg("a", [0, 0, 100, 0], { veggTegund: "hurd", strokeWidth: 9, parentId: "m", x: 5, y: 0 });
  const r = kljufaVegg(o, [45, 3], id)!;
  assert.ok(r);
  assert.deepEqual(heimsPunktar(r[0]), [5, 0, 45, 0]);
  assert.deepEqual(heimsPunktar(r[1]), [45, 0, 105, 0]);
  for (const b of r) {
    assert.equal(b.veggTegund, "hurd");
    assert.equal(b.strokeWidth, 9);
    assert.equal(b.parentId, "m");
    assert.notEqual(b.id, "a");
  }
  assert.equal(kljufaVegg(o, [5.2, 0], id, 1), null);
  // brotalína klofin í miðjum seinni bút
  const L = vg("L", [0, 0, 100, 0, 100, 100]);
  const r2 = kljufaVegg(L, [104, 50], id)!;
  assert.deepEqual(r2[0].points, [0, 0, 100, 0, 100, 50]);
  assert.deepEqual(r2[1].points, [100, 50, 100, 100]);
});

test("sameina: samlínu veggir verða einn frá ysta enda til ysta enda; lengdarvegin þykkt", () => {
  const a = vg("a", [0, 0, 100, 0], { strokeWidth: 10 });
  const b = vg("b", [150, 1, 120, 1], { strokeWidth: 4 }); // öfug stefna, smá hliðrun
  const r = sameinaVeggi([b, a], id);
  assert.ok("nyr" in r, JSON.stringify(r));
  if (!("nyr" in r)) return;
  const p = heimsPunktar(r.nyr);
  assert.ok(Math.abs(p[0] - 0) < 1e-6 && Math.abs(p[2] - 150) < 1e-6, JSON.stringify(p));
  assert.ok(Math.abs(p[1] - p[3]) < 1e-9 && p[1] > 0 && p[1] < 0.5, "meðallína " + JSON.stringify(p));
  assert.ok(Math.abs(r.nyr.strokeWidth - (10 * 100 + 4 * 30) / 130) < 1e-9);
  assert.deepEqual(r.eyda.sort(), ["a", "b"]);
  // ekki samsíða / ekki á sömu línu
  assert.ok("villa" in sameinaVeggi([a, vg("c", [0, 0, 0, 100])], id));
  assert.ok("villa" in sameinaVeggi([a, vg("d", [0, 50, 100, 50])], id));
  assert.ok("villa" in sameinaVeggi([a], id));
});

test("bil milli samlínu veggja (hurð í bil)", () => {
  const a = vg("a", [0, 0, 100, 0], { strokeWidth: 10 });
  const b = vg("b", [180, 0, 300, 0], { strokeWidth: 6 });
  const r = bilMilli(b, a)!;
  assert.ok(r);
  assert.ok(naerri(r.heims, [100, 0, 180, 0]), JSON.stringify(r));
  assert.equal(r.thykkt, 8);
  assert.equal(bilMilli(a, vg("c", [50, 0, 150, 0])), null); // skarast
  assert.equal(bilMilli(a, vg("d", [200, 0, 200, 100])), null); // ekki samsíða
});

test("lengja/klippa að vegg: nær endinn færist á miðlínu marksins", () => {
  const mark = vg("m", [200, -100, 200, 100]);
  // of stuttur: lengist
  const stuttur = lengjaAd(vg("a", [0, 0, 150, 0]), mark)!;
  assert.deepEqual(heimsPunktar(stuttur), [0, 0, 200, 0]);
  // of langur (fer í gegn): klippist
  const langur = lengjaAd(vg("b", [0, 10, 260, 10]), mark)!;
  assert.deepEqual(heimsPunktar(langur), [0, 10, 200, 10]);
  // fyrsti punktur nær markinu → hann færist
  const ofugur = lengjaAd(vg("c", [180, 20, 0, 20]), mark)!;
  assert.deepEqual(heimsPunktar(ofugur), [200, 20, 0, 20]);
  // skáveggur
  const ska = lengjaAd(vg("d", [0, 0, 100, 100]), vg("e", [0, 150, 400, 150]))!;
  assert.ok(naerri(heimsPunktar(ska), [0, 0, 150, 150]), JSON.stringify(ska.points));
  // samsíða: ekkert
  assert.equal(lengjaAd(vg("f", [0, 0, 100, 0]), vg("g", [0, 50, 100, 50])), null);
});

test("færa enda, hliðra og tengdir endar", () => {
  const a = vg("a", [0, 0, 100, 0], { x: 10, y: 5 });
  assert.deepEqual(heimsPunktar(faeraEnda(a, 1, [200, 5])), [10, 5, 200, 5]);
  assert.deepEqual(heimsPunktar(faeraEnda(a, 0, [0, 0])), [0, 0, 110, 5]);
  assert.deepEqual(heimsPunktar(hlidra(a, 3, -2)), [13, 3, 113, 3]);
  const V = [a, vg("b", [110, 5, 110, 90]), vg("c", [300, 0, 110.4, 5.3]), vg("d", [0, 50, 50, 50])];
  assert.deepEqual(tengdirEndar([110, 5], V, "a", 1), [
    { id: "b", hlid: 0 },
    { id: "c", hlid: 1 },
  ]);
});

test("samruni greiningar: tvítekningar falla, aðeins óþakið bætist við, gamlir veggir ósnertir", () => {
  const fyrir = [
    { p: [0, 0, 1000, 0], t: 8 },
    { p: [0, 0, 0, 500], t: 8, tegund: "gler" as const },
  ];
  const nyir = [
    { p: [2, 1, 998, 1], t: 8 }, // sami veggur, smá hliðrun → fellur
    { p: [0, 2, 0, 800], t: 8 }, // lengri en gamli: aðeins 500–800 bætist við
    { p: [500, 300, 900, 300], t: 8 }, // nýr
    { p: [1, 250, 1, 300], t: 8 }, // ofan á gleri → fellur
    { p: [0, 498, 0, 504], t: 8 }, // agnarlítill afgangur → fellur (lágmark)
  ];
  const r = sameinaVidVeggi(fyrir, nyir, { vik: 3, lagmark: 10 });
  assert.equal(r.tviteknir, 3);
  assert.equal(r.styttir, 1);
  assert.equal(r.baeta.length, 2);
  const lodr = r.baeta.find((b) => Math.abs(b.p[0] - b.p[2]) < 1e-6)!;
  assert.ok(Math.abs(Math.min(lodr.p[1], lodr.p[3]) - 503) < 1e-6 && Math.abs(Math.max(lodr.p[1], lodr.p[3]) - 800) < 1e-6, JSON.stringify(lodr));
  assert.ok(r.baeta.some((b) => b.p.join() === "500,300,900,300"));
  // tegund nýja veggjarins fylgir
  const g = sameinaVidVeggi([], [{ p: [0, 0, 10, 0], t: 2, tegund: "gler" }], { vik: 1, lagmark: 1 });
  assert.deepEqual(g.baeta, [{ p: [0, 0, 10, 0], t: 2, tegund: "gler" }]);
  // samsíða veggur við hliðina (annar veggur, utan þykktar) fellur EKKI
  const hlid = sameinaVidVeggi(fyrir, [{ p: [0, 30, 1000, 30], t: 8 }], { vik: 3, lagmark: 10 });
  assert.equal(hlid.baeta.length, 1);
  assert.equal(hlid.tviteknir, 0);
  // semButur: heimshnit og tegund
  assert.deepEqual(semButur(vg("x", [0, 0, 5, 0], { x: 1, veggTegund: "hurd" })), { p: [1, 0, 6, 0], t: 8, tegund: "hurd" });
});

test("talning: 62 veggir · 5 gler · 3 hurðir (íslensk eintala), faldir og aðrar línur teljast ekki", () => {
  const O: BoardObject[] = [
    ...Array.from({ length: 21 }, (_, i) => vg("v" + i, [0, 0, 1, 0])),
    vg("g", [0, 0, 1, 0], { veggTegund: "gler" }),
    vg("h", [0, 0, 1, 0], { veggTegund: "hurd" }),
    vg("falinn", [0, 0, 1, 0], { hidden: true }),
    { ...vg("ei", [0, 0, 1, 0]), veggur: undefined, layerId: "almennt", name: "EI-veggur" },
  ];
  const t = veggjaTalning(O);
  assert.deepEqual(t, { veggur: 21, gler: 1, hurd: 1, eld: 0, svalir: 0, alls: 23 });
  assert.equal(talningTexti(t), "21 veggur · 1 gler · 1 hurð");
  assert.equal(talningTexti({ veggur: 62, gler: 5, hurd: 3, eld: 0, svalir: 0, alls: 70 }), "62 veggir · 5 gler · 3 hurðir");
  assert.equal(talningTexti({ veggur: 11, gler: 0, hurd: 0, eld: 0, svalir: 0, alls: 11 }), "11 veggir");
  assert.equal(metraTexti(345, 100), "3,45 m");
  assert.equal(metraTexti(1234, 100), "12,3 m");
  assert.equal(metraTexti(50, null), "50 dílar");
});

test("hornalás heldur hnitum nákvæmum (enginn fljótandi skekkja á 90°)", () => {
  const A: P = [123.4, 56.7];
  const B = hornalas(A, [123.9, 300]);
  assert.equal(B[0], 123.4);
});

test("greiningarlotur: veggir merktir lotu, nýjasta lotan fyrst; ómerktir veggir ekki með", () => {
  const a = nyGreiningarLota(1_791_000_000_000), b = nyGreiningarLota(1_791_000_090_000), c = nyGreiningarLota(3_000_000_000_000);
  assert.ok(a < b, "tímaröð");
  assert.ok(c.length > b.length, "lengra auðkenni = seinna (raðast samt rétt)");
  const v = (id: string, greining?: string) => ({ ...nyrVeggur([0, 0, 10, 0], { id, thykkt: 4, tegund: "veggur", greining }) });
  assert.equal(v("x", a).greining, a);
  assert.equal("greining" in v("y"), false, "handteiknaður veggur fær ekki merki");
  const l = greiningarLotur([v("1", a), v("2", b), v("3"), v("4", b), v("5", c), v("6", a)]);
  assert.deepEqual(l.map((x) => x.id), [c, b, a]);
  assert.deepEqual(l[1].ids, ["2", "4"]);
  assert.deepEqual(l[2].ids, ["1", "6"]);
});
