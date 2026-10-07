// Veggir úr skannaðri teikningu (383-greiningin flutt í TurboPaint, 07.10.2026) — og skönnuð PDF er mynd, ekki „engar
// línur, 0 veggir" (Álfaborg 661 2. hæð).
import assert from "node:assert/strict";
import { test } from "node:test";
import { pdfErSkonnun } from "./pdf-veggjaflokkar";
import { butarIBord, greiningarkvardi, greiningarSvaedi, skonnunarVeggir } from "./skonnun-veggir";

test("skönnun: þykkir veggir hússins finnast; strik-punkta ásalína þvert yfir blaðið verður EKKI veggur", () => {
  const fb = 6006, fh = 4298, kv = greiningarkvardi(fb, fh);
  const W = 1400, H = 1000, gra = new Uint8Array(W * H).fill(250);
  const kassi = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) gra[y * W + x] = 30;
  };
  kassi(200, 150, 1200, 158);
  kassi(200, 842, 1200, 850);
  kassi(200, 150, 208, 850);
  kassi(1192, 150, 1200, 850);
  kassi(600, 158, 606, 842);
  kassi(206, 500, 600, 505);
  for (let x = 20; x < 1380; x++) {
    const f = x % 40;
    if (f < 24 || (f >= 30 && f < 33)) gra[320 * W + x] = 120;
  }
  const r = skonnunarVeggir(gra, W, H, kv, fb, fh);
  assert.equal(r.veggir.length, 6, JSON.stringify(r.talning));
  for (const v of r.veggir) {
    const [ax, ay, bx, by] = v.map((n) => n * kv);
    // innan hússins (200–1200 × 150–850, smá svigrúm) og ekkert á ásalínunni (y = 320)
    assert.ok(Math.min(ax, bx) >= 195 && Math.max(ax, bx) <= 1205 && Math.min(ay, by) >= 145 && Math.max(ay, by) <= 855, "utan húss " + v);
    assert.ok(!(Math.abs(ay - 320) < 4 && Math.abs(by - 320) < 4), "ásalína varð veggur " + v);
  }
  const millivegg = r.veggir.filter((v) => Math.abs(v[1] * kv - 502) < 4 && Math.abs(v[3] * kv - 502) < 4);
  assert.equal(millivegg.length, 1);
});

test("svæði greiningar: skurður hæðarinnar innan myndarinnar, fastur kvarði blaðsins; vörpun á borðið", () => {
  const plan = { x: 0, y: 880, width: 2378, height: 1701, uttekt: { frumB: 6006, frumH: 4298, skurdur: { x: 760, y: 14, w: 4070, h: 4236 } } };
  const g = greiningarSvaedi(plan, { w: 7477, h: 5349 });
  assert.deepEqual(g.sk, { x: 760, y: 14, w: 4070, h: 4236 });
  assert.ok(Math.abs(g.kvardi - 2800 / 6006) < 1e-12);
  assert.equal(g.W, Math.round(4070 * g.kvardi));
  assert.ok(Math.abs(g.uppspretta.x - (760 * 7477) / 6006) < 1e-9);
  // bútur á svæðinu (dílar frummyndar frá horni skurðar) → borðhnit
  const [v] = butarIBord([[0, 0, 100, 0, 11]], g, plan);
  const k = 2378 / 6006;
  assert.ok(Math.abs(v.p[0] - 760 * k) < 1e-9 && Math.abs(v.p[1] - (880 + 14 * (1701 / 4298))) < 1e-9);
  assert.ok(Math.abs(v.t - 11 * k) < 1e-9);
  // án tengingar: öll myndin, myndin sjálf er frummyndin
  const g2 = greiningarSvaedi({ uttekt: null }, { w: 3000, h: 2000 });
  assert.deepEqual(g2.sk, { x: 0, y: 0, w: 3000, h: 2000 });
  // skorin mynd (Croppa oft): svæðið innan hlutans
  const g3 = greiningarSvaedi(
    { uttekt: { frumB: 6006, frumH: 4298, skurdur: { x: 0, y: 0, w: 6006, h: 4298 }, myndSkurdur: { x: 3000, y: 100, w: 2000, h: 3000 } } },
    { w: 1000, h: 1500 }
  );
  assert.deepEqual(g3.sk, { x: 3000, y: 100, w: 2000, h: 3000 });
  assert.deepEqual(g3.uppspretta, { x: 0, y: 0, w: 1000, h: 1500 });
});

test("skönnuð PDF (FotoWeb: ein mynd, engin strik) er skönnun; vigur-PDF ekki", () => {
  assert.equal(pdfErSkonnun({}), true);
  assert.equal(pdfErSkonnun({ "0.48": [[0, 0, 100, 0]] }), true); // 100 pt ≈ 3,5 m — stimpill
  const veggir: number[][] = [];
  for (let i = 0; i < 40; i++) veggir.push([0, i * 10, 1000, i * 10]);
  assert.equal(pdfErSkonnun({ "0.48": veggir as [number, number, number, number][] }), false);
});
