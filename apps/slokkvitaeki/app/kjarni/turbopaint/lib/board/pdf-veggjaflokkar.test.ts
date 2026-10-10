import assert from "node:assert/strict";
import { test } from "node:test";
import fiskislod from "./fixtures/fiskislod41-1haed.json";
import type { Strik } from "./pdf-veggir";
import {
  flokkaYfirlit,
  GREINDUR_VEGGUR_HAMARK_CM,
  greiningKrefstStadfestingar,
  klemmaGreindaThykkt,
  ptIBord,
  skurdurIPt,
  strikValinna,
  veggirUrStrikumPt,
} from "./pdf-veggjaflokkar";
import { dilarAPunkt, veggirHaedar, veggirUrPdfStrikum } from "./teikning-veggir";
import { maelaThekju, veggjaFletir } from "./veggja-thekja";
import { sameinaVidVeggi } from "./veggja-ritill";

// Síðan á Fiskislóð 41 er A1 (1684 × 2384 pt); fixture-línurnar (0,48 pt-flokkurinn) eru í dílum frummyndar.
const { frum, skurdur, pdfVeggir } = fiskislod as { frum: { b: number; h: number }; skurdur: { x: number; y: number; w: number; h: number }; pdfVeggir: number[][] };
const k = dilarAPunkt(frum);
const B = frum.b / k, H = frum.h / k;
const veggjalinur: Strik[] = pdfVeggir.map((s) => [s[0] / k, s[1] / k, s[2] / k, s[3] / k]);
// Gervi-skástrikun (0,24 pt): þéttar samsíða línur 1,8 pt sundur — paraðar hráar yrðu þær að „veggjum"
const skastrikun: Strik[] = Array.from({ length: 400 }, (_, i) => [500, 900 + i * 1.8, 560, 900 + i * 1.8] as Strik);
// málstrik (0,66 pt): fá og stutt
const malstrik: Strik[] = Array.from({ length: 30 }, (_, i) => [400 + i * 20, 600, 405 + i * 20, 600] as Strik);
// lóðarmörk (1,38 pt) utan hússins
const lod: Strik[] = [[20, 20, 1600, 20], [1600, 20, 1600, 2300], [1600, 2300, 20, 2300], [20, 2300, 20, 20]];
const flokkar: Record<string, Strik[]> = { "0.24": skastrikun, "0.48": veggjalinur, "0.66": malstrik, "1.38": lod };

test("flokkaYfirlit: allir flokkar, lengstir fyrst, veggjaflokkurinn (0,48) er tillagan, hárlína merkt", () => {
  const y = flokkaYfirlit(flokkar, B, H);
  assert.deepEqual(y.map((f) => f.breidd).sort(), ["0.24", "0.48", "0.66", "1.38"]);
  assert.equal(y.filter((f) => f.tillaga).length, 1);
  assert.equal(y.find((f) => f.tillaga)!.breidd, "0.48");
  assert.equal(y.find((f) => f.breidd === "0.24")!.harlina, true);
  assert.equal(y.find((f) => f.breidd === "0.48")!.strik, 776);
  for (let i = 1; i < y.length; i++) assert.ok(y[i - 1].lengdM >= y[i].lengdM, "raðað eftir lengd");
});

test("strikValinna: margir flokkar saman; aðeins innan hússins; hreinsuð svæði hunsuð", () => {
  assert.equal(strikValinna(flokkar, ["0.48"], { bladB: B, bladH: H }).length, 776);
  assert.equal(strikValinna(flokkar, ["0.48", "0.24"], { bladB: B, bladH: H }).length, 1176);
  const sv = skurdurIPt(skurdur, frum, B, H)!;
  assert.ok(sv.x0 < skurdur.x / k && sv.x1 > (skurdur.x + skurdur.w) / k);
  // lóðarmörkin eru utan hússins
  assert.equal(strikValinna(flokkar, ["1.38"], { svaedi: sv, bladB: B, bladH: H }).length, 0);
  assert.equal(strikValinna(flokkar, ["0.48"], { svaedi: sv, bladB: B, bladH: H }).length, 776);
  // hreinsað svæði: vestari helmingur síðunnar
  const vestur = strikValinna(flokkar, ["0.48"], { burt: [{ x: 0, y: 0, w: 0.5, h: 1 }], bladB: B, bladH: H });
  assert.ok(vestur.length > 0 && vestur.length < 776);
  assert.ok(vestur.every((s) => (s[0] + s[2]) / 2 / B > 0.5));
  assert.equal(skurdurIPt(null, frum, B, H), null);
});

test("Fiskislóð 41 (0,48 pt valinn): sama ferli og innflutningur — heilir veggir + gler, þekja ≥ 95 % af 776 línum", () => {
  const v = veggirUrStrikumPt(strikValinna(flokkar, ["0.48"], { bladB: B, bladH: H }), B, H);
  const imp = veggirHaedar(fiskislod, frum).veggir;
  assert.ok(Math.abs(v.length - imp.length) <= 2, `veggir ${v.length} vs innflutningur ${imp.length}`);
  assert.ok(v.filter((w) => w.tegund === "gler").length >= 3);
  // aftur í dílum frummyndar til samanburðar við þekjumælingu 1. áfanga
  const iFrum = v.map((w) => ({ ...w, p: w.p.map((n) => n * k), t: w.t * k }));
  const th = maelaThekju(pdfVeggir, iFrum);
  assert.ok(th.thekja >= 0.95, `þekja ${(th.thekja * 100).toFixed(1)} %`);
  assert.ok(th.utan <= 0.01);
  const fl = maelaThekju(veggjaFletir(pdfVeggir, k), iFrum);
  assert.ok(fl.thekja >= 0.99, `veggflatir ${(fl.thekja * 100).toFixed(1)} %`);
});

test("Fiskislóð 41: greining ofan á innflutta veggi bætir nánast engu við (enginn tvíveggur)", () => {
  const imp = veggirHaedar(fiskislod, frum).veggir;
  const v = veggirUrStrikumPt(strikValinna(flokkar, ["0.48"], { bladB: B, bladH: H }), B, H).map((w) => ({ ...w, p: w.p.map((n) => n * k), t: w.t * k }));
  const r = sameinaVidVeggi(imp, v, { vik: 0.1 * 71.44, lagmark: 0.25 * 71.44 });
  assert.ok(r.tviteknir >= v.length - 3, `tvíteknir ${r.tviteknir} af ${v.length}`);
  assert.ok(r.baeta.length <= 3, "bætt við: " + JSON.stringify(r.baeta));
});

test("skástrikun valin með: ferlið gerir veggi úr pörum hennar — þess vegna velur notandinn flokkana sjálfur", () => {
  const an = veggirUrStrikumPt(strikValinna(flokkar, ["0.48"], { bladB: B, bladH: H }), B, H).length;
  const med = veggirUrStrikumPt(strikValinna(flokkar, ["0.48", "0.24"], { bladB: B, bladH: H }), B, H).length;
  assert.ok(med > an, `${med} > ${an}`);
});

test("stakar línur → veggir með dæmigerðri þykkt; hurðarblöð (< 1,2 m) ekki", () => {
  // 1 pt = 1 díll (frum 2384 breið); veggur 10 cm = ~2,8 pt; 1,2 m = 34 pt
  const f = { b: 2384, h: 1684 };
  const paradur = [[100, 100, 400, 100], [100, 103, 400, 103]];
  const stok = [600, 100, 600, 300]; // 200 pt ≈ 7 m, ein lína
  const blad = [800, 100, 800, 126]; // 26 pt ≈ 0,9 m — hurðarblað
  const an = veggirUrPdfStrikum([...paradur, stok, blad], f);
  assert.equal(an.length, 1, "án stakra: aðeins paraði veggurinn");
  const med = veggirUrPdfStrikum([...paradur, stok, blad], f, { stakar: true });
  assert.equal(med.length, 2, JSON.stringify(med));
  const s = med.find((w) => Math.abs(w.p[0] - 600) < 1)!;
  assert.ok(s && Math.abs(s.t - 3) <= 1, "þykkt paraða veggjarins: " + JSON.stringify(s));
  // lína sem paraður veggur þekur verður ekki tvíveggur
  const tvi = veggirUrPdfStrikum([...paradur, [100, 101, 400, 101]], f, { stakar: true });
  assert.equal(tvi.length, 1, JSON.stringify(tvi));
});

test("ptIBord: síðuhnit → borð (teikning á x/y með breidd/hæð)", () => {
  const b = ptIBord([{ p: [0, 0, 100, 50], t: 4, tegund: "gler" }], { x: 10, y: 20, width: 200, height: 100 }, 100, 50);
  assert.deepEqual(b, [{ p: [10, 20, 210, 120], t: 8, tegund: "gler" }]);
});

test("vörn 07.10: hárlína og mjög mörg stutt strik merkt „ekki veggir“; tillagan aldrei", () => {
  // eins og Fiskislóð: 0,24 pt með þúsundum stuttra strika (skástrikun, bílar, málstrik)
  const mikil: Strik[] = Array.from({ length: 4000 }, (_, i) => [100 + (i % 200) * 5, 300 + Math.floor(i / 200) * 4, 103 + (i % 200) * 5, 300 + Math.floor(i / 200) * 4] as Strik);
  // 0,66 pt: mörg stutt strik en EKKI hárlína
  const stutt66: Strik[] = Array.from({ length: 3500 }, (_, i) => [200 + (i % 100) * 6, 900 + Math.floor(i / 100) * 5, 204 + (i % 100) * 6, 900 + Math.floor(i / 100) * 5] as Strik);
  const y = flokkaYfirlit({ ...flokkar, "0.24": mikil, "0.66": stutt66 }, B, H);
  const f = (b: string) => y.find((x) => x.breidd === b)!;
  assert.equal(f("0.24").ekkiVeggir, true);
  assert.match(f("0.24").astaeda!, /hárlína/);
  assert.equal(f("0.66").ekkiVeggir, true, "3500 stutt strik");
  assert.match(f("0.66").astaeda!, /stutt strik/);
  assert.equal(f("0.48").ekkiVeggir, false, "veggjaflokkurinn");
  assert.equal(f("0.48").tillaga, true);
  assert.equal(f("1.38").ekkiVeggir, false, "fáar langar línur");
  assert.equal(f("1.38").astaeda, undefined);
});

test("vörn 07.10: staðfesting yfir 120 veggjum eða > 3× þeim sem fyrir eru", () => {
  assert.equal(greiningKrefstStadfestingar(63, 0), false, "Fiskislóð 0,48 á tóma teikningu");
  assert.equal(greiningKrefstStadfestingar(120, 0), false);
  assert.equal(greiningKrefstStadfestingar(121, 0), true);
  assert.equal(greiningKrefstStadfestingar(537, 62), true, "0,24 + 0,48 ofan á 62 veggi");
  assert.equal(greiningKrefstStadfestingar(6, 61), false, "Bæta við +6");
  assert.equal(greiningKrefstStadfestingar(63, 61), false, "Skipta út 61 → 63");
  assert.equal(greiningKrefstStadfestingar(31, 10), true, "> 3× þeir sem fyrir eru");
  assert.equal(greiningKrefstStadfestingar(30, 10), false);
});

test("vörn 07.10 / 10.10: þykkt greindra veggja klemmd við 35 cm (kvarði þekktur) eða 3× miðgildi (óþekktur)", () => {
  const v = [{ p: [0, 0, 10, 0], t: 5 }, { p: [0, 0, 10, 0], t: 12 }, { p: [0, 0, 10, 0], t: 90 }];
  // 50 borðdílar á metra → 35 cm = 17,5 dílar
  const k = klemmaGreindaThykkt(v, 50);
  assert.deepEqual(k.map((x) => x.t), [5, 12, 17.5]);
  assert.equal(k[0], v[0], "óbreyttur veggur er sami hlutur");
  assert.equal(GREINDUR_VEGGUR_HAMARK_CM, 35);
  // óþekktur kvarði: miðgildi 12 → hámark 36
  assert.deepEqual(klemmaGreindaThykkt(v, null).map((x) => x.t), [5, 12, 36]);
  assert.deepEqual(klemmaGreindaThykkt([], 50), []);
});
