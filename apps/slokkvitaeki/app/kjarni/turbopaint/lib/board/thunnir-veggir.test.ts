import assert from "node:assert/strict";
import { test } from "node:test";
import { bakgrunnsTonn, finnaThunnaVeggi } from "./thunnir-veggir";

const DPM = 50;
const W = 1200;
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
