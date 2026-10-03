import assert from "node:assert/strict";
import { test } from "node:test";
import { finnaVeggi, merkjaSvaedi, rettHyrningar, type VeggjaStillingar } from "./veggir";

const W = 240, H = 160;
const ST: VeggjaStillingar = { naemi: 0.62, hamarksThykkt: 16, lagmarksLengd: 30, fylltThykkt: 5 };

function mynd() {
  const d = new Uint8ClampedArray(W * H * 4).fill(255);
  const svart = (x: number, y: number) => { const i = (y * W + x) * 4; d[i] = d[i + 1] = d[i + 2] = 25; };
  const lina = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) svart(x, y);
  };
  const ramma = (x0: number, y0: number, x1: number, y1: number) => { lina(x0, y0, x1, y0); lina(x0, y1, x1, y1); lina(x0, y0, x0, y1); lina(x1, y0, x1, y1); };
  ramma(20, 20, 200, 30);        // holur veggur: tvær línur 10 dílum frá hvor annarri, lokaðir endar
  ramma(20, 50, 200, 140);       // herbergi: breitt lokað svæði
  ramma(215, 60, 221, 66);       // „o": lítið lokað gat
  lina(30, 150, 200, 150);       // opin málsetningarlína
  lina(30, 154, 200, 154);       // önnur samsíða — ekki lokað á endum
  for (let y = 70; y < 120; y++) lina(100, y, 107, y);   // fylltur veggur 8 díla þykkur
  return d;
}

test("merkjaSvaedi: tvö aðskilin svæði fá tvö merki", () => {
  const m = new Uint8Array([1, 1, 0, 1, 1, 0, 0, 0, 1]);
  const { merki, fjoldi } = merkjaSvaedi(m, 3, 3);
  assert.equal(fjoldi, 2);
  assert.equal(merki[0], merki[3]);
  assert.notEqual(merki[0], merki[8]);
});

test("rettHyrningar: L-laga maski verður tveir rétthyrningar sem þekja hann", () => {
  const w = 6, h = 4, m = new Uint8Array(w * h);
  for (let x = 0; x < 6; x++) m[x] = 1;                   // lárétt lína efst
  for (let y = 0; y < 4; y++) m[y * w] = 1;               // lóðrétt niður vinstra megin
  const k = rettHyrningar(m, w, h);
  const thekja = k.reduce((s, r) => s + r.w * r.h, 0);
  assert.equal(thekja, 6 + 3);
});

test("finnaVeggi: holur veggur finnst, herbergi / stafahol / opnar línur ekki", () => {
  const r = finnaVeggi(mynd(), W, H, ST);
  assert.equal(r.holir, 1, "aðeins holi veggurinn");
  const iVegg = (x: number, y: number) => r.kassar.some((k) => x >= k.x && x < k.x + k.w && y >= k.y && y < k.y + k.h);
  assert.ok(iVegg(110, 25), "miðja hola veggjarins er veggur");
  assert.ok(iVegg(110, 20) && iVegg(110, 30), "afmarkandi línurnar teljast með");
  assert.ok(!iVegg(60, 95), "inni í herberginu er ekki veggur");
  assert.ok(!iVegg(218, 63), "stafahol er ekki veggur");
  assert.ok(!iVegg(110, 152), "milli opinna málsetningarlína er ekki veggur");
});

test("finnaVeggi: fylltur veggur finnst líka", () => {
  const r = finnaVeggi(mynd(), W, H, ST);
  assert.equal(r.fylltir, true);
  assert.ok(r.kassar.some((k) => 103 >= k.x && 103 < k.x + k.w && 95 >= k.y && 95 < k.y + k.h));
});

test("finnaVeggi: innrétting (lítill lokaður hringur / vaskur) er ekki veggur", () => {
  const W2 = 240, H2 = 160, d = new Uint8ClampedArray(W2 * H2 * 4).fill(255);
  const svart = (x: number, y: number) => { const i = (y * W2 + x) * 4; d[i] = d[i + 1] = d[i + 2] = 25; };
  // tveir sammiðja hringir (salernissetan): hringlaga, mjótt hol milli þeirra, alls um 36 dílar í þvermál
  for (let a = 0; a < 720; a++) {
    const t = (a / 720) * Math.PI * 2;
    svart(Math.round(120 + 18 * Math.cos(t)), Math.round(80 + 18 * Math.sin(t)));
    svart(Math.round(120 + 11 * Math.cos(t)), Math.round(80 + 11 * Math.sin(t)));
  }
  const r = finnaVeggi(d, W2, H2, { naemi: 0.62, hamarksThykkt: 16, lagmarksLengd: 30, fylltThykkt: 5 });
  assert.equal(r.holir, 0);
});
