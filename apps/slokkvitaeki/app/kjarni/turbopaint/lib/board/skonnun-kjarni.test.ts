import assert from "node:assert/strict";
import { test } from "node:test";
import {
  birtStaerd,
  fylgni,
  lesari,
  lesariBirt,
  midgildi,
  rammaStaerd,
  snuningsKostir,
  synishornTif,
  teiknaIRamma,
  vaegiVidd,
  type Lesari,
} from "./skonnun-kjarni";

const R = (d: number) => d & 255, G = (d: number) => (d >> 8) & 255, B = (d: number) => (d >> 16) & 255;

test("lesari: litaspjald (8 bita) les litinn úr spjaldinu, ekki vísinn sem grátón", () => {
  // Þingholt: PhotometricInterpretation 3, 8 bitar, t320 = 3 × 256 (16 bita gildi)
  const n = 256, t320: number[] = Array.from({ length: 3 * n }, () => 0);
  t320[7] = 49 << 8; t320[n + 7] = 82 << 8; t320[2 * n + 7] = 66 << 8; // vísir 7 = (49, 82, 66)
  const les = lesari({ width: 2, height: 1, data: new Uint8Array([7, 0]), t262: [3], t258: [8], t320 });
  const d = les(0, 0);
  assert.deepEqual([R(d), G(d), B(d)], [49, 82, 66]);
});

test("lesari: tvílit (1 bita) og grátóna, WhiteIsZero snýr við", () => {
  const les = lesari({ width: 8, height: 1, data: new Uint8Array([0b10000000]), t262: [1], t258: [1] });
  assert.equal(R(les(0, 0)), 255);
  assert.equal(R(les(1, 0)), 0);
  const snuid = lesari({ width: 8, height: 1, data: new Uint8Array([0b10000000]), t262: [0], t258: [1] });
  assert.equal(R(snuid(0, 0)), 0);
  const rgb = lesari({ width: 1, height: 1, data: new Uint8Array([10, 20, 30]), t262: [2], t258: [8, 8, 8] });
  assert.deepEqual([R(rgb(0, 0)), G(rgb(0, 0)), B(rgb(0, 0))], [10, 20, 30]);
});

test("lesariBirt: TIFF Orientation — 3 = 180°, 6 = 90° réttsælis (birting víxlar málum)", () => {
  const W = 3, H = 2;
  const les: Lesari = (x, y) => y * 10 + x; // hrár díll (x, y) → 10y + x
  assert.equal(lesariBirt(les, 3, W, H)(0, 0), 12, "efra vinstra horn birtingar = neðra hægra hrátt");
  assert.equal(lesariBirt(les, 1, W, H)(2, 1), 12);
  assert.deepEqual(birtStaerd(6, W, H), { dW: 2, dH: 3 });
  // 90° réttsælis: efra vinstra horn birtingar = neðra vinstra hornið hrátt
  assert.equal(lesariBirt(les, 6, W, H)(0, 0), 10);
  assert.equal(lesariBirt(les, 6, W, H)(1, 0), 0);
});

test("snuningsKostir: Þingholt 7016 × 4961 passar aðeins við JPEG 6006 × 4251 óvíxlað (snúningar 1–4)", () => {
  const k = snuningsKostir(7016, 4961, { b: 6006, h: 4251 });
  assert.deepEqual(k.map((x) => x.o), [1, 2, 3, 4]);
  assert.ok(Math.abs(k[0].kp - 6006 / 7016) < 1e-12);
  // á hlið (víxlað) — 5–8
  assert.deepEqual(snuningsKostir(4961, 7016, { b: 6006, h: 4251 }).map((x) => x.o), [5, 6, 7, 8]);
  assert.deepEqual(snuningsKostir(5000, 5000, { b: 6006, h: 4251 }), []);
});

test("rammaStaerd: upplausn frumritsins í hlutföllum JPEG-sins; þak á langhlið og flatarmál", () => {
  // Þingholt (7016 breitt) — Staðall 7,2k og Há gæði 12,5k gefa bæði upplausn frumritsins
  assert.deepEqual(rammaStaerd(7016, { b: 6006, h: 4251 }, 7200, 40e6), { w: 7016, h: 4966 });
  assert.deepEqual(rammaStaerd(7016, { b: 6006, h: 4251 }, 12500, 40e6), { w: 7016, h: 4966 });
  // 9933 px TIF: Staðall klemmir langhliðina, Há gæði 40 MP
  assert.deepEqual(rammaStaerd(9933, { b: 6006, h: 4282 }, 7200, 40e6), { w: 7200, h: 5133 });
  const p = rammaStaerd(9933, { b: 6006, h: 4282 }, 12500, 40e6);
  assert.ok(p.w * p.h <= 40e6 + 1e4 && p.w > 7400, JSON.stringify(p));
});

test("vaegiVidd: vægi hvers úttaksdíls summast í 1, líka með hliðrun og minnkun", () => {
  for (const [c, f, k] of [[1, 0, 1], [1, 0.4, 1], [6006 / 7016, -0.75, 6006 / 7016], [1.4, 3.4, 1]]) {
    const v = vaegiVidd(50, c, f, k);
    for (let u = 0; u < 50; u++) {
      let s = 0;
      for (let m = 0; m < v.fjoldi[u]; m++) s += v.vaegi[u * v.K + m];
      assert.ok(Math.abs(s - 1) < 1e-5, `${c},${f},${k} u=${u} s=${s}`);
    }
  }
});

/** Gervi-skönnun: hrátt TIF sem er á hvolfi (Orientation 3) — svartir krossar á hvítu. */
function gerviTif(W: number, H: number) {
  const data = new Uint8Array(W * H).fill(255);
  const kross = (cx: number, cy: number) => {
    for (let i = -6; i <= 6; i++) {
      data[cy * W + cx + i] = 0;
      data[(cy + i) * W + cx] = 0;
    }
  };
  for (const [x, y] of [[30, 20], [150, 40], [90, 100], [200, 130]]) kross(x, y);
  return { width: W, height: H, data, t262: [1], t258: [8], t274: [3] };
}

test("teiknaIRamma: TIF á hvolfi + hliðrun lendir í ramma JPEG-sins — kross sem var í TIF-díl t er í JPEG-díl kp·t + f", () => {
  const W = 240, H = 160, f = gerviTif(W, H);
  const les = lesariBirt(lesari(f), 3, W, H); // birtingarhnit
  const frum = { b: 206, h: 138 }; // „JPEG-ið": kp = 206/240
  const kp = frum.b / W, fx = 2.5, fy = -1.25;
  const ut = { w: 240, h: Math.round((240 * frum.h) / frum.b) };
  const px = teiknaIRamma(les, W, H, ut, frum, { kpx: kp, kpy: kp, fx, fy });
  // krossinn í hráa díl (90, 100) er í birtingardíl (W−1−90, H−1−100) = (149, 59)
  const t = { x: 149 + 0.5, y: 59 + 0.5 };
  const jpeg = { x: kp * t.x + fx, y: kp * t.y + fy }; // JPEG-díll merkis sem stendur á krossinum
  // sama staður í borðmyndinni (úttak w × h í ramma JPEG-sins)
  const u = Math.floor((jpeg.x / frum.b) * ut.w), v = Math.floor((jpeg.y / frum.h) * ut.h);
  const dekkst = (uu: number, vv: number) => px[(vv * ut.w + uu) * 4];
  assert.ok(dekkst(u, v) < 90, `miðja krossins dökk: ${dekkst(u, v)}`);
  assert.ok(dekkst(u + 12, v + 12) > 240, "hvítt utan krossins");
  // utan TIF-sins (efst til vinstri, fy < 0 ⇒ efsta röðin nær út fyrir) er hvítt, aldrei svart
  assert.ok(px[0] > 240);
});

test("teiknaIRamma: kp = 1, engin hliðrun = sama mynd (afrit)", () => {
  const W = 50, H = 30, data = new Uint8Array(W * H);
  for (let i = 0; i < data.length; i++) data[i] = (i * 37) % 256;
  const les = lesari({ width: W, height: H, data, t262: [1], t258: [8] });
  const px = teiknaIRamma(les, W, H, { w: W, h: H }, { b: W, h: H }, { kpx: 1, kpy: 1, fx: 0, fy: 0 });
  for (let i = 0; i < data.length; i++) assert.equal(px[i * 4], data[i]);
});

test("synishornTif + fylgni: réttur snúningur fylgir JPEG-inu, rangur ekki", () => {
  const W = 240, H = 160, f = gerviTif(W, H);
  const les = lesari(f);
  const rett = synishornTif(lesariBirt(les, 3, W, H), W, H, { x: 0, y: 0, w: W, h: H }, 20);
  const hratt = synishornTif(lesariBirt(les, 1, W, H), W, H, { x: 0, y: 0, w: W, h: H }, 20);
  // „JPEG-ið" = rétt snúin mynd
  assert.ok(fylgni(rett, rett) > 0.999);
  assert.ok(fylgni(rett, hratt) < 0.5);
  assert.equal(midgildi([3, 1, 2]), 2);
  assert.equal(midgildi([4, 1, 2, 3]), 2.5);
});
