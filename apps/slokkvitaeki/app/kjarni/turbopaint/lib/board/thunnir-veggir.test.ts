import assert from "node:assert/strict";
import { test } from "node:test";
import { bakgrunnsTonn, finnaThunnaVeggi, maelaHallaMyndar } from "./thunnir-veggir";

const DPM = 50;
// BLAÐIÐ ER 3000 DÍLA BREITT AF ÁSTÆÐU (Lisbeth 05.11.2026): á 1200 dílum dregst 0,6° skökk lína aðeins 11 díla og lifir
// beina leitina af — prófið sannaði þá aðeins að rákin yrði grennri, ekki að hún fyndist. Raðirnar renna saman í eitt blobb
// sem er jafnþykkt drættinum, svo blaðið verður að vera breitt nóg að blobbið falli á þykktarþakinu (0,45 m = 22,5 dílar):
// á 2000 dílum mælist blobbið 22 dílar og sleppur ennþá, á 3000 dílum er það ~35 dílar og beina leitin finnur EKKERT.
// Raunblaðið er 6006 dílar (121 m) — þetta er hálft blað, ekki ýkt tilfelli.
const W = 3000;
const H = 800;

/** Ljós blað með dökkum láréttum / lóðréttum rákum: [x0, y0, x1, y1, þykkt í dílum]. */
function blad(rakir: [number, number, number, number, number][]): Uint8Array {
  const g = new Uint8Array(W * H).fill(243);
  for (const [x0, y0, x1, y1, th] of rakir) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) for (let k = 0; k < th; k++) {
      const yy = y0 === y1 ? y + k : y, xx = x0 === x1 ? x + k : x;
      if (xx < W && yy < H) g[yy * W + xx] = 205;
    }
  }
  return g;
}

test("bakgrunnur: miðgildi blaðsins", () => {
  assert.equal(bakgrunnsTonn(blad([])), 243);
});

test("þunnir veggir: 9 dílar breið rák (tvöföld hárlína) finnst, 4 dílar (málsetning) ekki", () => {
  const g = blad([
    [100, 300, 1000, 300, 9], // veggur, 18 m
    [100, 100, 1000, 100, 4], // málsetningarlína
    [200, 350, 200, 700, 9], // lóðréttur veggur, 7 m
  ]);
  const r = finnaThunnaVeggi(g, W, H, { dpm: DPM });
  assert.equal(r.length, 2, JSON.stringify(r));
  const lar = r.find((v) => v[1] === v[3])!;
  assert.ok(Math.abs(lar[1] - 304.5) < 1.5 && lar[0] <= 101 && lar[2] >= 1000, JSON.stringify(lar));
  const lod = r.find((v) => v[0] === v[2])!;
  assert.ok(Math.abs(lod[0] - 204.5) < 1.5 && lod[1] <= 351 && lod[3] >= 699, JSON.stringify(lod));
});

test("þunnir veggir: stutt rák (< 6 m), þykk fylling og brot sömu línu með litlu bili", () => {
  const g = blad([
    [100, 500, 300, 500, 9], // 4 m — of stutt
    [100, 600, 1000, 640, 1], // ekki rák (skálína) — hverfur
  ]);
  for (let y = 100; y < 160; y++) for (let x = 400; x < 1000; x++) g[y * W + x] = 205; // 60 díla (1,2 m) fylling
  // sama lína í tveimur brotum með 0,1 m bili
  for (const [a, b] of [[100, 600], [606, 1100]] as const) for (let y = 700; y < 709; y++) for (let x = a; x < b; x++) g[y * W + x] = 205;
  const r = finnaThunnaVeggi(g, W, H, { dpm: DPM });
  const nedst = r.filter((v) => v[1] > 690 && v[1] < 720);
  assert.equal(nedst.length, 1, JSON.stringify(r));
  assert.ok(nedst[0][0] <= 101 && nedst[0][2] >= 1099, "brotin runnu saman");
  assert.equal(r.filter((v) => v[1] === 504 || (v[1] > 495 && v[1] < 515)).length, 0, "4 m rák telst ekki");
  assert.equal(r.filter((v) => v[1] > 90 && v[1] < 170).length, 0, "1,2 m þykk fylling telst ekki");
});

test("halli blaðsins: skakkt blað mælist, og rákir finnast sem fundust ekki á beinni leit", () => {
  // 0,6° skakkt blað: lárétt lína dregst um 0,0105 · x. Yfir 2890 díla eru það 30 dílar — margfalt þykkt rákarinnar (9).
  const t = Math.tan((0.6 * Math.PI) / 180);
  const g = new Uint8Array(W * H).fill(243);
  const settu = (x: number, y: number) => {
    const yy = Math.round(y);
    if (x >= 0 && x < W && yy >= 0 && yy < H) g[yy * W + x] = 205;
  };
  // tvær langar „tvöfaldar hárlínur" (9 dílar) á skökku blaði
  for (const y0 of [340, 700]) for (let x = 60; x < W - 50; x++) for (let k = 0; k < 9; k++) settu(x, y0 - t * x + k);
  // og einn lóðréttur veggur
  for (let y = 120; y < 760; y++) for (let k = 0; k < 9; k++) settu(Math.round(200 + t * y) + k, y);
  const m = new Uint8Array(W * H);
  const thr = bakgrunnsTonn(g) - 16;
  for (let i = 0; i < m.length; i++) m[i] = g[i] < thr ? 1 : 0;
  const halli = maelaHallaMyndar(m, W, H);
  assert.ok(Math.abs(halli - t) < 0.003, "mældur halli " + halli.toFixed(4) + " á móti " + t.toFixed(4));
  const larettar = (r: number[][]) => r.filter((v) => Math.abs(v[2] - v[0]) > Math.abs(v[3] - v[1]));
  const an = finnaThunnaVeggi(g, W, H, { dpm: DPM, skekkja: 0 });
  const med = finnaThunnaVeggi(g, W, H, { dpm: DPM });
  // ÞETTA ER PRÓFIÐ: beina leitin finnur EKKERT af löngu láréttu rákunum — raðirnar renna saman í ~35 díla blobb sem fellur
  // á þykktarþakinu. Skekkjuleiðrétt leit finnur þær báðar (+ lóðrétta vegginn).
  assert.equal(larettar(an).length, 0, "BEIN leit á að finna 0 láréttar rákir: " + JSON.stringify(an));
  assert.equal(larettar(med).length, 2, "skekkjuleiðrétt leit finnur báðar láréttu rákirnar: " + JSON.stringify(med));
  assert.ok(med.length >= 3, "og lóðrétta vegginn með: " + JSON.stringify(med));
  // rákirnar fylgja hallanum — ekki nákvæmlega láréttar — og eru á réttum stað á blaðinu
  for (const lar of larettar(med)) {
    assert.ok(lar[1] - lar[3] > 25, "rákin er á ská eins og blaðið: " + JSON.stringify(lar));
    assert.ok(lar[4] <= 11, "og 9 díla þykk, ekki samanrunnið blobb: " + JSON.stringify(lar));
  }
});

test("halli blaðsins: beint blað mælist 0 og leitin er óbreytt", () => {
  const g = blad([[100, 300, 1000, 300, 9], [200, 350, 200, 700, 9]]);
  const m = new Uint8Array(W * H);
  const thr = bakgrunnsTonn(g) - 16;
  for (let i = 0; i < m.length; i++) m[i] = g[i] < thr ? 1 : 0;
  assert.equal(maelaHallaMyndar(m, W, H), 0);
  assert.deepEqual(finnaThunnaVeggi(g, W, H, { dpm: DPM }), finnaThunnaVeggi(g, W, H, { dpm: DPM, skekkja: 0 }));
});
