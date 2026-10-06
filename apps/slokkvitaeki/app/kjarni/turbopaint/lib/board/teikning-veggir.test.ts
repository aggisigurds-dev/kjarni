import assert from "node:assert/strict";
import { test } from "node:test";
import fiskislod from "./fixtures/fiskislod41-1haed.json";
import {
  dilarAMetraGisk,
  dilarAPunkt,
  lesaVeggjaLinur,
  veggirHaedar,
  veggirUrHanddregnum,
  veggirUrPdfStrikum,
  type FrumVeggur,
} from "./teikning-veggir";
import { heilirVeggir383 } from "./teikning-383-vidmid";
import { maelaFlatarThekju, maelaThekju, veggjaFletir } from "./veggja-thekja";

const lengd = (v: FrumVeggur) => {
  let s = 0;
  for (let i = 2; i < v.p.length; i += 2) s += Math.hypot(v.p[i] - v.p[i - 2], v.p[i + 1] - v.p[i - 1]);
  return s;
};

test("kvarðinn: A1-blað í 1:100 — Fiskislóð 41 ≈ 71,4 díll/m (mælt 71,44 á málsetningum)", () => {
  assert.ok(Math.abs(dilarAPunkt({ b: 4244, h: 6006 }) - 6006 / 2384) < 1e-9);
  assert.ok(Math.abs(dilarAMetraGisk({ b: 4244, h: 6006 }) - 71.44) < 0.1);
});

test("Fiskislóð 41: 776 veggflatir úr PDF verða heilir veggir, flestir ~10 cm, enginn smábútur", () => {
  const { frum, skurdur, pdfVeggir } = fiskislod;
  assert.equal(pdfVeggir.length, 776);
  const v = veggirUrPdfStrikum(pdfVeggir, frum);
  const S = 71.44;
  // Fyrri greining (thrividd/01_veggir.py) fékk 90 búta með súlustubbum; hér renna samlínu bútar saman yfir súlur og
  // rifur ≤ 0,63 m (eins og heilirVeggir í Teikning) og stubbar < 0,25 m (7 pt, mark Teikning) detta út — færri, lengri.
  assert.ok(v.length >= 35 && v.length <= 110, "fjöldi veggja " + v.length);
  for (const w of v) {
    assert.equal(w.p.length, 4);
    assert.ok(lengd(w) >= 0.25 * S - 1, "smábútur " + JSON.stringify(w));
    assert.ok(w.t >= 1 && w.t <= 0.36 * S, "þykkt " + w.t);
    // allt innan hússins (skurður hæðarinnar, smá svigrúm)
    for (let i = 0; i < 4; i += 2) {
      assert.ok(w.p[i] >= skurdur.x - 30 && w.p[i] <= skurdur.x + skurdur.w + 30, "x utan húss " + w.p[i]);
      assert.ok(w.p[i + 1] >= skurdur.y - 30 && w.p[i + 1] <= skurdur.y + skurdur.h + 30, "y utan húss " + w.p[i + 1]);
    }
  }
  const tiu = v.filter((w) => w.t / S >= 0.065 && w.t / S <= 0.12).length;
  assert.ok(tiu / v.length >= 0.8, `flestir 7–12 cm, fékk ${tiu}/${v.length}`);
  // Útveggurinn að sunnan (y ≈ 4595) er einn ~33 m veggur, ekki brotinn í búta við súlurnar; sá að norðan (y ≈ 1654)
  // er tveir ~15 m hlutar — hurðin (ÚT) á milli helst opin.
  const sunnan = v.filter((w) => Math.abs(w.p[1] - w.p[3]) < 2 && Math.abs(w.p[1] - 4595) < 20);
  assert.ok(sunnan.some((w) => lengd(w) > 32 * S), "langur útveggur að sunnan: " + JSON.stringify(sunnan.map(lengd)));
  const nordan = v.filter((w) => Math.abs(w.p[1] - w.p[3]) < 2 && Math.abs(w.p[1] - 1654) < 20 && lengd(w) > 10 * S);
  assert.equal(nordan.length, 2, "norðurveggurinn í tveimur hlutum: " + JSON.stringify(nordan));
  // Heildarlengd veggja: fyrri greiningin fékk 262 m (með súlustubbum og opum); hér ~250 m + gler.
  const alls = v.reduce((s, w) => s + lengd(w), 0) / S;
  assert.ok(alls > 220 && alls < 290, "heildarlengd " + alls.toFixed(0) + " m");
});

test("Fiskislóð 41: ALLT sem Teikning sýndi kemur yfir (Teikning notar aðeins veggjaLinur eftir vistun)", () => {
  const { frum, pdfVeggir } = fiskislod;
  const v = veggirHaedar(fiskislod, frum).veggir;
  // 1) allar 776 PDF-línur (1 díll) innan innfluttra veggja (í sinni þykkt + 2 díla): ≥ 95 %. Afgangurinn eru
  //    hurðarblöð (stakar línur út úr útveggnum), póstar/karmar bílskúrshurða (3 × 10–16 dílar) og smákubbar < 0,25 m
  //    — sjá turbopaint_afangi1/thekja_*.png.
  const hratt = maelaThekju(pdfVeggir, v);
  assert.ok(hratt.thekja >= 0.95, `þekja allra PDF-lína ${(hratt.thekja * 100).toFixed(1)} %`);
  // ekkert búið til sem var ekki á teikningunni
  assert.ok(hratt.utan <= 0.01, `utan teikningar ${(hratt.utan * 100).toFixed(1)} %`);
  // 2) línurnar sem GETA verið veggflötur skv. reglu Teikning (parast 1,5–20 pt, ≥ 7 pt): ≥ 99 %
  const fletir = maelaThekju(veggjaFletir(pdfVeggir, dilarAPunkt(frum)), v);
  assert.ok(fletir.thekja >= 0.99, `þekja veggflata ${(fletir.thekja * 100).toFixed(1)} %`);
  // 3) veggirnir sem Teikning-glugginn (383 heilirVeggir) sýndi úr sömu línum: öll flötin þakin
  const t383 = heilirVeggir383(pdfVeggir, frum.b, frum.h);
  assert.ok(t383.length > 30);
  const flatar = maelaFlatarThekju(t383, v);
  assert.ok(flatar >= 0.995, `veggir Teikning þaktir ${(flatar * 100).toFixed(1)} %`);
});

test("Fiskislóð 41: gluggar (þunn pör í útveggnum) koma sem gler, ekki göt", () => {
  const v = veggirUrPdfStrikum(fiskislod.pdfVeggir, fiskislod.frum);
  const gler = v.filter((w) => w.tegund === "gler");
  assert.ok(gler.length >= 3, JSON.stringify(gler));
  // GN-glugginn á austurveggnum (línur x = 3326/3329, y 2390–2665) — inndreginn 10 cm frá veggfletinum
  assert.ok(
    gler.some((w) => Math.abs(w.p[0] - 3327.5) <= 2 && Math.abs(w.p[2] - 3327.5) <= 2 && Math.min(w.p[1], w.p[3]) <= 2395 && Math.max(w.p[1], w.p[3]) >= 2660),
    JSON.stringify(gler)
  );
  // E30-glerið í veggnum milli verkstæðis og starfsmannarýmis (y ≈ 3972)
  assert.ok(gler.some((w) => Math.abs(w.p[1] - 3972) <= 3 && Math.abs(w.p[3] - 3972) <= 3), JSON.stringify(gler));
});

test("veggur sem heldur áfram framhjá þvervegg (T) er ekki klipptur; stakur veggflötur verður veggur", () => {
  const frum = { b: 2384, h: 1684 };
  // lóðréttur veggur x 100–103 frá y 0 til 200; þverveggur til hægri við y 100 (endar á lóðrétta veggnum)
  const T = veggirUrPdfStrikum(
    [[100, 0, 100, 200], [103, 0, 103, 200], [103, 100, 300, 100], [103, 103, 300, 103]],
    frum
  );
  const lodr = T.find((w) => Math.abs(w.p[0] - w.p[2]) < 1)!;
  assert.ok(Math.min(lodr.p[1], lodr.p[3]) <= 1 && Math.max(lodr.p[1], lodr.p[3]) >= 199, "lóðrétti veggurinn heill: " + JSON.stringify(T));
  // ytri flöturinn heldur áfram 60 pt niður fyrir þar sem innri flöturinn endar
  const S = veggirUrPdfStrikum([[100, 0, 100, 260], [103, 0, 103, 200]], frum);
  const alls = S.reduce((s, w) => s + lengd(w), 0);
  assert.ok(alls >= 258, "stakur flötur kemur með: " + JSON.stringify(S));
  assert.ok(S.every((w) => Math.abs(w.t - 3) <= 1 && Math.abs(w.p[0] - 101.5) <= 1), JSON.stringify(S));
});

test("handdregnir veggir Teikning tapast aldrei", () => {
  const frum = { b: 4244, h: 6006 };
  const hand = [[100, 100, 900, 100], [900, 100, 900, 700], [120, 400, 128, 400], [500, 500, 520, 530]];
  const ur = veggirHaedar({ veggir: hand, pdfVeggir: fiskislod.pdfVeggir }, frum).veggir;
  for (const h of hand) assert.ok(ur.some((w) => w.p.join() === h.join()), "vantar " + JSON.stringify(h));
  assert.equal(maelaThekju(hand, ur).thekja, 1);
});

test("karmur/súlukubbur í PDF verður ekki ruslveggur; krossaður kubbur verður einn bútur", () => {
  // frum 2384 × 1684 → 1 díll = 1 pt; 1 pt ≈ 3,5 cm í 1:100
  const frum = { b: 2384, h: 1684 };
  const rett = (x0: number, y0: number, x1: number, y1: number) => [
    [x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0],
  ];
  // veggur 10 m × 10 cm (tvær línur 3 pt sundur)
  const veggur = [[100, 100, 383, 100], [100, 103, 383, 103]];
  // karmur 6 × 3 pt (21 × 10 cm) — styttri en 0,25 m
  const karmur = rett(500, 300, 506, 303);
  // súla 12 × 12 pt (42 × 42 cm): parast bæði lárétt og lóðrétt
  const sula = rett(600, 400, 612, 412);
  const v = veggirUrPdfStrikum([...veggur, ...karmur, ...sula], frum);
  assert.equal(v.length, 2, JSON.stringify(v));
  const langur = v.find((w) => lengd(w) > 200)!;
  assert.ok(Math.abs(langur.p[1] - 101.5) < 1 && Math.abs(langur.t - 3) <= 1, JSON.stringify(langur));
  const kubbur = v.find((w) => lengd(w) < 20)!;
  assert.ok(kubbur && Math.abs(kubbur.t - 12) <= 1, "súlan einu sinni: " + JSON.stringify(v));
});

test("samlínu bútar af svipaðri þykkt renna saman yfir súlu; hurðargat (> 0,63 m) helst opið", () => {
  const frum = { b: 2384, h: 1684 };
  const v = veggirUrPdfStrikum(
    [
      // vinstri hluti, súla 10 pt (á milli), hægri hluti, svo hurðargat 30 pt (~1 m) og síðasti hluti
      [0, 0, 100, 0], [0, 3, 100, 3],
      [110, 0, 200, 0], [110, 3, 200, 3],
      [230, 0, 300, 0], [230, 3, 300, 3],
    ],
    frum
  );
  assert.equal(v.length, 2, JSON.stringify(v));
  const L = v.map(lengd).sort((a, b) => a - b);
  assert.ok(Math.abs(L[0] - 70) < 1 && Math.abs(L[1] - 200) < 1, JSON.stringify(L));
  assert.ok(v.every((w) => Math.abs(w.t - 3) < 1), "þykktin helst 3 (ekki hámarkið)");
});

test("handdregnir veggir fá 15 cm þykkt; rusl síast", () => {
  const frum = { b: 4244, h: 6006 };
  const v = veggirUrHanddregnum([[10, 10, 500, 10], [1, 2], [5, 5, 5, 5], [0, 0, 0, 300.4]] as number[][], frum);
  assert.equal(v.length, 2);
  assert.equal(v[0].t, Math.round(0.15 * dilarAMetraGisk(frum)));
  assert.deepEqual(v[1].p, [0, 0, 0, 300]);
});

test("veggjaLinur ganga fyrir; annars PDF + handdregnir saman", () => {
  const frum = { b: 2384, h: 1684 };
  const pdf = [[0, 0, 300, 0], [0, 3, 300, 3]];
  const vistadir = veggirHaedar({ veggjaLinur: [{ p: [1, 2, 3, 4], t: 5, tegund: "gler" }], pdfVeggir: pdf }, frum);
  assert.equal(vistadir.heimild, "turbopaint");
  assert.deepEqual(vistadir.veggir, [{ p: [1, 2, 3, 4], t: 5, tegund: "gler" }]);
  const ur = veggirHaedar({ veggjaLinur: [], pdfVeggir: pdf, veggir: [[0, 100, 0, 400]] }, frum);
  assert.equal(ur.heimild, "teikning");
  assert.equal(ur.veggir.length, 2);
  assert.equal(veggirHaedar({}, frum).heimild, null);
});

test("lesaVeggjaLinur sleppir rusli og óþekktri tegund", () => {
  const v = lesaVeggjaLinur([null, { p: [1, 2] }, { p: [0, 0, 10, 0], t: 4, tegund: "steypa" }, { p: [0, 0, 0, 9], tegund: "hurd" }, "x"]);
  assert.deepEqual(v, [{ p: [0, 0, 10, 0], t: 4 }, { p: [0, 0, 0, 9], t: 1, tegund: "hurd" }]);
  assert.deepEqual(lesaVeggjaLinur(undefined), []);
});
