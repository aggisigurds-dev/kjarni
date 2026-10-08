import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hreinsaVeggi,
  husKassi,
  husUtlina,
  lesaVikmork,
  retta,
  sameinaSamlinur,
  SJALFGEFIN_VIKMORK,
  stakirButar,
  strikPunktLinur,
  utanHuss,
  type HLina,
} from "./veggja-hreinsun";

// 1 eining = 1 cm (dpm = 100)
const DPM = 100;
const L = (x0: number, y0: number, x1: number, y1: number, t = 15, tegund?: HLina["tegund"]): HLina =>
  tegund ? { p: [x0, y0, x1, y1], t, tegund } : { p: [x0, y0, x1, y1], t };
const ferningur = (x: number, y: number, b: number, h: number, t = 15): HLina[] => [
  L(x, y, x + b, y, t),
  L(x + b, y, x + b, y + h, t),
  L(x + b, y + h, x, y + h, t),
  L(x, y + h, x, y, t),
];
const endar = (l: HLina) => [l.p[0], l.p[1], l.p[l.p.length - 2], l.p[l.p.length - 1]].map((n) => Math.round(n));

test("vikmörk: sjálfgefin gildi og stilling úr JSON — ógild gildi hunsast", () => {
  const v = lesaVikmork('{"smellaM":0.2,"hurd":{"maxM":1.4},"lengjaM":-3,"rugl":5}');
  assert.equal(v.smellaM, 0.2);
  assert.equal(v.hurd.maxM, 1.4);
  assert.equal(v.hurd.minM, SJALFGEFIN_VIKMORK.hurd.minM);
  assert.equal(v.lengjaM, SJALFGEFIN_VIKMORK.lengjaM);
  assert.equal((v as unknown as Record<string, unknown>).rugl, undefined);
  assert.deepEqual(lesaVikmork("ekki json"), SJALFGEFIN_VIKMORK);
});

test("rétta: ±3° verður nákvæmlega 0° / 90° um miðjuna; 5° skáveggur óbreyttur", () => {
  assert.deepEqual(retta([0, 0, 1000, 30], 3), [0, 15, 1000, 15]); // 1,7°
  assert.deepEqual(retta([0, 0, 40, 1000], 3), [20, 0, 20, 1000]); // 2,3° frá lóðréttu
  assert.equal(retta([0, 0, 1000, 90], 3), null); // 5,1°
  assert.equal(retta([0, 0, 1000, 0], 3), null); // þegar beinn
});

test("sameina: samlínu bútar með < 10 cm bili og skörun renna saman; 30 cm bil og ólík tegund ekki", () => {
  const r = sameinaSamlinur([L(0, 0, 300, 0), L(306, 2, 600, 2), L(580, 0, 900, 0), L(1200, 0, 1500, 0), L(1500, 0, 1800, 0, 15, "gler")], 10, 5);
  const veggir = r.butar.filter((b) => !b.tegund);
  assert.equal(veggir.length, 2, JSON.stringify(r.butar));
  const langur = veggir.find((b) => Math.abs(b.p[2] - b.p[0]) > 800)!;
  assert.ok(Math.abs(Math.min(langur.p[0], langur.p[2]) - 0) < 1 && Math.abs(Math.max(langur.p[0], langur.p[2]) - 900) < 1);
  assert.equal(r.horfnir, 2);
  assert.equal(r.butar.filter((b) => b.tegund === "gler").length, 1);
});

test("sameina: súla (40 cm) í 10 cm vegg rennur EKKI saman við hann; tvítekning ofan á fastri línu fer", () => {
  const r = sameinaSamlinur([L(0, 0, 500, 0, 10), L(500, 0, 540, 0, 40), L(540, 0, 900, 0, 10)], 10, 5);
  assert.ok(r.butar.some((b) => b.t === 40), "súlan stendur");
  const fast = [L(0, 300, 1000, 300, 15)];
  const r2 = sameinaSamlinur([L(100, 302, 400, 302, 14), L(0, 600, 300, 600)], 10, 5, fast);
  assert.equal(r2.butar.length, 1);
  assert.equal(r2.butar[0].p[1], 600);
});

test("sameina: bútur sem rennur ekki saman kemur ÓBREYTTUR út — líka langt frá núllpunkti í hópi með örlítið skökkum bút", () => {
  // Fiskislóð 2. hæð 08.10.2026: meðalstefna hópsins (0,05°) hliðraði lóðréttum veggjum um 7–10 díla
  const a = L(3260, 1556, 3260, 3947, 7), b = L(1786, 1917, 1789, 3875, 6);
  const r = sameinaSamlinur([a, b], 7, 4);
  assert.equal(r.horfnir, 0);
  assert.ok(r.butar.some((x) => x.p.join() === a.p.join()), JSON.stringify(r.butar));
  assert.ok(r.butar.some((x) => x.p.join() === b.p.join()), JSON.stringify(r.butar));
});

test("strik-punkt: regluleg röð (langt strik + punktur) fer; veggur með hurðargötum stendur", () => {
  const asalina: HLina[] = [];
  for (let x = 0; x < 2000; x += 260) {
    asalina.push(L(x, 0, x + 200, 0, 5));
    asalina.push(L(x + 220, 0, x + 240, 0, 5));
  }
  const s = strikPunktLinur(asalina, DPM);
  assert.equal(s.size, asalina.length);
  // veggur með þremur hurðum (90 cm göt) — bilin eru utan strik-punkt-bilsins
  const hurdaveggur = [L(0, 500, 300, 500), L(390, 500, 700, 500), L(790, 500, 1100, 500), L(1190, 500, 1500, 500)];
  assert.equal(strikPunktLinur(hurdaveggur, DPM).size, 0);
  // stutt strikalína (falin lína): 60 cm strik, 20 cm bil
  const falin: HLina[] = [];
  for (let y = 0; y < 600; y += 80) falin.push(L(800, y, 800, y + 60, 4));
  assert.equal(strikPunktLinur(falin, DPM).size, falin.length);
});

test("stakir: 30 cm bútur sem tengist engu fer; tengdur í öðrum enda stendur; 80 cm stakur stendur", () => {
  const veggir = [L(0, 0, 1000, 0), L(500, 300, 530, 300), L(1000, 0, 1000, 40), L(200, 600, 280, 600)];
  const st = stakirButar(veggir, [], 50, 4);
  assert.deepEqual([...st], [1]);
});

test("hreinsun: horn smellast (≤ 15 cm), laus endi lengist að þvervegg (≤ 40 cm), 60 cm bil stendur opið", () => {
  const veggir = [
    L(0, 0, 990, 0), // 10 cm frá horninu
    L(1000, 8, 1000, 800), // horn
    L(500, 30, 500, 600), // laus endi 30 cm frá veggnum fyrir ofan → lengist (T)
    L(0, 800, 400, 800),
    L(460, 800, 1000, 800), // 60 cm bil (hurð / op) stendur
  ];
  const r = hreinsaVeggi(veggir, [], DPM);
  const a = r.linur.find((l) => Math.abs(l.p[1]) < 1 && Math.abs(l.p[3]) < 1 && Math.max(l.p[0], l.p[2]) > 900)!;
  assert.ok(a && Math.abs(Math.max(a.p[0], a.p[2]) - 1000) < 1, "lárétti veggurinn nær horninu: " + JSON.stringify(a));
  const b = r.linur.find((l) => Math.abs(l.p[0] - 1000) < 1 && Math.abs(l.p[2] - 1000) < 1)!;
  assert.ok(Math.abs(Math.min(b.p[1], b.p[3])) < 1, "lóðrétti veggurinn nær horninu: " + JSON.stringify(b));
  const t = r.linur.find((l) => Math.abs(l.p[0] - 500) < 1 && Math.abs(l.p[2] - 500) < 1)!;
  assert.ok(Math.abs(Math.min(t.p[1], t.p[3])) < 1, "T: endinn lengdist að veggnum: " + JSON.stringify(t));
  const nedri = r.linur.filter((l) => Math.abs(l.p[1] - 800) < 1 && Math.abs(l.p[3] - 800) < 1);
  assert.equal(nedri.length, 2, "60 cm bilið lokast ekki");
  assert.ok(r.talning.smellt >= 1 && r.talning.lengdir >= 1, JSON.stringify(r.talning));
});

test("hreinsun: fastar línur (Agnars) hreyfast aldrei — nýr veggur smellist AÐ þeim", () => {
  const fast = [L(0, 0, 1000, 0, 15)];
  const ny = [L(300, 12, 300, 500)];
  const r = hreinsaVeggi(ny, fast, DPM);
  assert.equal(r.linur.length, 1);
  assert.ok(Math.abs(Math.min(r.linur[0].p[1], r.linur[0].p[3])) < 1, JSON.stringify(r.linur[0]));
  assert.deepEqual(fast[0].p, [0, 0, 1000, 0]);
});

test("hreinsun: skáveggur (20°) heldur stefnu, næstum lóðréttur réttist, 2 cm brotalína verður bútar", () => {
  const r = hreinsaVeggi([L(0, 0, 940, 342), L(2000, 0, 2030, 800), { p: [3000, 0, 3000, 400, 3400, 400], t: 15 }], [], DPM);
  const ska = r.linur.find((l) => l.p[0] < 100)!;
  assert.ok(Math.abs(Math.atan2(ska.p[3] - ska.p[1], ska.p[2] - ska.p[0]) * (180 / Math.PI) - 20) < 0.1);
  const rettur = r.linur.find((l) => l.p[0] > 1900 && l.p[0] < 2100)!;
  assert.equal(rettur.p[0], rettur.p[2]);
  assert.equal(r.linur.filter((l) => l.p[0] >= 3000).length, 2);
  assert.equal(r.talning.rettir, 1);
});

test("utan húss: lóðarmörk og nágrannahús utan útlínunnar fara; innveggir og útveggir með hurðargati standa", () => {
  const hus = [
    L(0, 0, 1000, 0),
    L(1000, 0, 1000, 800),
    L(1000, 800, 600, 800),
    L(510, 800, 0, 800), // 90 cm hurðargat í útvegg
    L(0, 800, 0, 0),
    L(500, 0, 500, 400), // innveggur
  ];
  const ruslid = [L(-800, -500, 1800, -500, 8), L(2500, 0, 3000, 0), L(2500, 0, 2500, 500)];
  const u = husUtlina([...hus, ...ruslid], DPM);
  assert.equal(u.lokud, true);
  const burt = utanHuss([...hus, ...ruslid], u);
  assert.deepEqual([...burt].sort(), [6, 7, 8]);
});

test("húskassi: stærsti veggjaklasinn + 2,5 % spássía; titilreitur (þunnar línur) utan hans", () => {
  const hus = [...ferningur(0, 0, 3000, 2000, 25), L(1500, 0, 1500, 2000, 15)];
  const titill = [...ferningur(5000, 1500, 800, 400, 2), L(5000, 1600, 5800, 1600, 2), L(5000, 1700, 5800, 1700, 2)];
  const k = husKassi([...hus, ...titill], DPM)!;
  assert.ok(k);
  assert.ok(Math.abs(k.x0 - -75) < 1 && Math.abs(k.x1 - 3075) < 1 && Math.abs(k.y0 - -75) < 1 && Math.abs(k.y1 - 2075) < 1, JSON.stringify(k));
});
