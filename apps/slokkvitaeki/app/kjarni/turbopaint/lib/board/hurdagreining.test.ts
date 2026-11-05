import assert from "node:assert/strict";
import { test } from "node:test";
import { finnaHurdir } from "./hurdagreining";
import { lesaVikmork, type HLina } from "./veggja-hreinsun";

// 1 eining = 1 cm (dpm = 100)
const DPM = 100;
const L = (x0: number, y0: number, x1: number, y1: number, t = 15, tegund?: HLina["tegund"]): HLina =>
  tegund ? { p: [x0, y0, x1, y1], t, tegund } : { p: [x0, y0, x1, y1], t };

/** Hús 10 × 8 m: útveggir, innveggur í x = 500 með götum. */
function hus(innveggur: HLina[], utveggir?: HLina[]): HLina[] {
  return [
    ...(utveggir ?? [L(0, 0, 1000, 0), L(0, 800, 1000, 800)]),
    L(0, 0, 0, 800),
    L(1000, 0, 1000, 800),
    ...innveggur,
  ];
}

test("90 cm bil í innvegg verður hurð — línan fyllir gatið frá vegg að vegg", () => {
  const r = finnaHurdir(hus([L(500, 0, 500, 300), L(500, 390, 500, 800)]), [], DPM);
  assert.equal(r.hurdir.length, 1, JSON.stringify(r));
  assert.deepEqual(r.hurdir[0].p.map(Math.round), [500, 300, 500, 390]);
  assert.equal(r.hurdir[0].tegund, "hurd");
  assert.equal(r.hurdir[0].gerd, "a");
});

test("50 cm og 2 m bil verða ekki hurðir (2 m ekki heldur með boga — mælt: 2 af 10); 65 cm MEÐ boga verður hurð", () => {
  assert.equal(finnaHurdir(hus([L(500, 0, 500, 300), L(500, 350, 500, 800)]), [], DPM).hurdir.length, 0);
  const tveir = hus([L(500, 0, 500, 300), L(500, 500, 500, 800)]);
  assert.equal(finnaHurdir(tveir, [], DPM).hurdir.length, 0);
  assert.equal(finnaHurdir(tveir, [], DPM, { bogi: () => true }).hurdir.length, 0);
  const mjo = hus([L(500, 0, 500, 300), L(500, 365, 500, 800)]);
  assert.equal(finnaHurdir(mjo, [], DPM).hurdir.length, 0);
  const r = finnaHurdir(mjo, [], DPM, { bogi: () => true });
  assert.equal(r.hurdir.length, 1);
  assert.equal(r.hurdir[0].bogi, true);
});

test("bílahurð: 3,5 m op í ÚTVEGG verður hurð (bilahurd), líka með línu yfir gatið (flekahurð); sama op í innvegg ekki", () => {
  const ut = hus([], [L(0, 0, 300, 0), L(650, 0, 1000, 0), L(0, 800, 1000, 800)]);
  const r = finnaHurdir(ut, [], DPM);
  assert.equal(r.hurdir.length, 1, JSON.stringify(r.talning));
  assert.equal(r.hurdir[0].bilahurd, true);
  assert.equal(finnaHurdir(ut, [], DPM, { linaIBili: () => true }).hurdir.length, 1);
  const inn = hus([L(500, 0, 500, 200), L(500, 550, 500, 800)]);
  assert.equal(finnaHurdir(inn, [], DPM).hurdir.filter((h) => h.bilahurd).length, 0);
});

test("ekki hurð í krossi: þverveggur gengur inn í miðju gatsins", () => {
  const veggir = hus([L(500, 0, 500, 300), L(500, 390, 500, 800), L(500, 345, 1000, 345)]);
  const r = finnaHurdir(veggir, [], DPM);
  assert.equal(r.hurdir.length, 0);
  assert.ok(r.talning.hafnad.kross >= 1);
});

test("T við karminn er ekki kross: þverveggur mætir línunni við enda gatsins", () => {
  const veggir = hus([L(500, 0, 500, 300), L(500, 390, 500, 800), L(500, 300, 1000, 300)]);
  assert.equal(finnaHurdir(veggir, [], DPM).hurdir.length, 1);
});

test("ekki hurð á skávegg; ekki þar sem gler er þegar; ekki þar sem gluggi (lína í bili) sést", () => {
  const ska = [L(0, 0, 400, 300), L(472, 354, 800, 600)];
  assert.equal(finnaHurdir(ska, [], DPM).hurdir.length, 0);
  const veggir = hus([L(500, 0, 500, 300), L(500, 390, 500, 800)]);
  assert.equal(finnaHurdir(veggir, [L(500, 300, 500, 390, 8, "gler")], DPM).hurdir.length, 0);
  const g = finnaHurdir(veggir, [], DPM, { linaIBili: () => true });
  assert.equal(g.hurdir.length, 0);
  assert.equal(g.gler.length, 0, "sjálfgefið: ekkert gler úr gati (mælt: 1 af 13)");
  // lína yfir gatið MEÐ boga er hurð (5 af 6)
  assert.equal(finnaHurdir(veggir, [], DPM, { linaIBili: () => true, bogi: () => true }).hurdir.length, 1);
  const v = lesaVikmork({ hurd: { glerUrBili: 1 } }).hurd;
  const g2 = finnaHurdir(veggir, [], DPM, { linaIBili: () => true, vik: v });
  assert.equal(g2.gler.length, 1, "glerUrBili: 1 → gatið verður gler");
  assert.deepEqual(g2.gler[0].p.map(Math.round), [500, 300, 500, 390]);
});

test("laus endi sem horfir á þvervegg 90 cm frá verður hurð (b) — aðeins með boga (mælt: 15 af 15 með, 2 af 8 án)", () => {
  // innveggur frá suðurvegg upp að y = 700; þverveggurinn (norður, y = 800) er 90 cm frá endanum (yfirborð 92,5 → ~0,92 m)
  assert.equal(finnaHurdir(hus([L(500, 0, 500, 700)]), [], DPM).hurdir.length, 0);
  const r = finnaHurdir(hus([L(500, 0, 500, 700)]), [], DPM, { bogi: () => true });
  assert.equal(r.hurdir.length, 1, JSON.stringify(r));
  assert.equal(r.hurdir[0].gerd, "b");
  assert.ok(Math.abs(r.hurdir[0].p[3] - 792.5) < 1, JSON.stringify(r.hurdir[0].p));
});
