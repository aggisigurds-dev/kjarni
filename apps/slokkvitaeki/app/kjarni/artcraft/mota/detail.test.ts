import assert from "node:assert/strict";
import { test } from "node:test";
import { downscaleArea, icLightSize, motaFileName, padToAspect, restoreDetail, sameAspect, transferLighting } from "./detail.ts";

type R = { data: Uint8ClampedArray; width: number; height: number };

function make(w: number, h: number, f: (x: number, y: number) => [number, number, number]): R {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = f(x, y);
      const o = (y * w + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  return { data, width: w, height: h };
}

function shrink(src: R, w: number, h: number): R {
  const f = downscaleArea(src.data, src.width, src.height, w, h, 4);
  return { data: Uint8ClampedArray.from(f, (v) => Math.round(v)), width: w, height: h };
}

/** Meðalfrávik (gráþrep) milli tveggja jafnstórra mynda á RGB. */
function mae(a: R, b: R): number {
  let s = 0;
  for (let i = 0; i < a.data.length; i += 4) s += Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
  return s / ((a.data.length / 4) * 3);
}

// Fínt mynstur (2 px rendur) ofan á mjúkan halla — það sem týnist við smækkun.
const textured = (x: number, y: number): [number, number, number] => {
  const base = 80 + (x + y) * 0.2;
  const fine = (Math.floor(x / 2) + Math.floor(y / 2)) % 2 ? 40 : -40;
  return [base + fine, base + fine * 0.8, base + fine * 0.6];
};

test("area downscale keeps the mean and handles non-integer factors", () => {
  const src = make(10, 7, (x, y) => [x * 20, y * 30, 100]);
  const out = downscaleArea(src.data, 10, 7, 3, 2, 4);
  let sumSrc = 0;
  for (let i = 0; i < src.data.length; i += 4) sumSrc += src.data[i];
  let sumOut = 0;
  for (let i = 0; i < out.length; i += 4) sumOut += out[i];
  assert.ok(Math.abs(sumSrc / 70 - sumOut / 6) < 1e-3);
  assert.ok(out.every((v) => Number.isFinite(v)));
});

test("restore brings back full size and fine detail when the result is the same picture", () => {
  const src = make(240, 160, textured);
  const low = shrink(src, 80, 54 * 0 + 53); // ~3× minni, sama hlutfall innan 1,5 %
  assert.ok(sameAspect(240, 160, 80, 53));
  const out = restoreDetail(src, low);
  assert.equal(out.width, 240);
  assert.equal(out.height, 160);
  // Nánast frumritið aftur (smáatriðin komin), langt umfram bara stækkun.
  const naive = restoreDetail(src, low, { strength: 0 });
  assert.ok(mae(out, src) < 6, `restored ${mae(out, src)}`);
  assert.ok(mae(naive, src) > 20, `naive ${mae(naive, src)}`);
});

test("relit result: new light comes through, detail stays", () => {
  const src = make(240, 160, textured);
  const low = shrink(src, 80, 53);
  // „Endurljós“: hægri hliðin dekkri, vinstri bjartari og hlýrri.
  for (let y = 0; y < low.height; y++)
    for (let x = 0; x < low.width; x++) {
      const o = (y * low.width + x) * 4;
      const g = 1.3 - (x / low.width) * 0.7;
      low.data[o] = Math.min(255, low.data[o] * g + 10);
      low.data[o + 1] = low.data[o + 1] * g;
      low.data[o + 2] = low.data[o + 2] * g * 0.9;
    }
  const out = restoreDetail(src, low);
  const up = restoreDetail(src, low, { strength: 0 });
  // Meðallitur fylgir útkomunni (ljósið), ekki frumritinu.
  assert.ok(mae(shrink(out, 80, 53), low) < 3);
  // Fínu rendurnar eru komnar aftur: mikill munur milli nágrannapixla.
  const contrast = (r: R) => {
    let s = 0;
    for (let y = 10; y < 150; y++)
      for (let x = 10; x < 120; x++) s += Math.abs(r.data[(y * 240 + x) * 4 + 1] - r.data[(y * 240 + x + 2) * 4 + 1]);
    return s / (140 * 110);
  };
  assert.ok(contrast(out) > contrast(up) * 3, `${contrast(out)} vs ${contrast(up)}`);
});

test("new content (e.g. new background) gets no ghost of the old texture", () => {
  const src = make(240, 160, textured);
  const low = shrink(src, 80, 53);
  // Hægri helmingur: nýr, sléttur blár bakgrunnur.
  for (let y = 0; y < low.height; y++)
    for (let x = 40; x < low.width; x++) {
      const o = (y * low.width + x) * 4;
      low.data[o] = 40;
      low.data[o + 1] = 90;
      low.data[o + 2] = 200;
    }
  const out = restoreDetail(src, low);
  // Langt inni í nýja svæðinu: slétt og blátt, engar rendur.
  let maxDev = 0;
  for (let y = 20; y < 140; y++)
    for (let x = 160; x < 230; x++) {
      const o = (y * 240 + x) * 4;
      maxDev = Math.max(maxDev, Math.abs(out.data[o] - 40), Math.abs(out.data[o + 1] - 90), Math.abs(out.data[o + 2] - 200));
    }
  assert.ok(maxDev <= 3, `ghost ${maxDev}`);
});

test("IC-Light size follows the photo's shape instead of cropping to 4:5", () => {
  assert.deepEqual(icLightSize(3000, 4000), { width: 576, height: 768 });
  assert.deepEqual(icLightSize(4000, 3000), { width: 768, height: 576 });
  assert.deepEqual(icLightSize(2000, 2000), { width: 768, height: 768 });
  const tall = icLightSize(1080, 1920);
  assert.ok(Math.max(tall.width, tall.height) <= 768);
  assert.ok(Math.abs(tall.width / tall.height - 9 / 16) / (9 / 16) < 0.04);
  assert.deepEqual(icLightSize(1600, 2000), { width: 512, height: 640 });
  const { width, height } = icLightSize(1920, 1080);
  assert.ok(Math.abs(width / height - 16 / 9) / (16 / 9) < 0.04);
});

test("padding to the model's shape never crops", () => {
  const p = padToAspect(1080, 1920, 448, 768);
  assert.equal(p.height, 1920);
  assert.ok(p.width >= 1080 && Math.abs(p.width / p.height - 448 / 768) < 0.001);
  const t = padToAspect(1080, 1920, 384, 704);
  assert.equal(t.width, 1080);
  assert.ok(t.height >= 1920 && t.y === Math.floor((t.height - 1920) / 2));
  assert.equal(p.x, Math.floor((p.width - 1080) / 2));
  const q = padToAspect(4000, 3000, 768, 768);
  assert.deepEqual([q.width, q.height, q.x, q.y], [4000, 4000, 0, 500]);
});

test("every save gets its own file name", () => {
  const t = new Date(2026, 10, 5, 14, 30, 12);
  assert.equal(motaFileName("IMG_1234.jpg", "jpg", t), "IMG_1234-mota-20261105-143012.jpg");
  assert.equal(motaFileName("IMG_1234-mota-20261105-143012.jpg", "jpg", t), "IMG_1234-mota-20261105-143012.jpg");
  assert.equal(motaFileName("IMG_1234-mota.jpg", "png", t), "IMG_1234-mota-20261105-143012.png");
  assert.equal(motaFileName("IMG_1234-mota-20261105-143012-2.jpg", "jpg", t, "mota", 3), "IMG_1234-mota-20261105-143012-3.jpg");
  assert.equal(motaFileName("x-mota-topaz-20261105-143012.jpg", "jpg", t, "mota-topaz"), "x-mota-topaz-20261105-143012.jpg");
  assert.equal(motaFileName("", "jpg", t), "mynd-mota-20261105-143012.jpg");
  const later = new Date(2026, 10, 5, 14, 30, 13);
  assert.notEqual(motaFileName("a.jpg", "jpg", t), motaFileName("a.jpg", "jpg", later));
});

test("relight transfer keeps the original person even when the model drew someone else", () => {
  // Frumrit: áferð alls staðar. „IC-Light“-útkoman: dekkri hægra megin OG
  // allt annað mynstur í miðjunni (önnur manneskja).
  const src = make(240, 160, textured);
  const low = shrink(src, 120, 80);
  for (let y = 0; y < 80; y++)
    for (let x = 0; x < 120; x++) {
      const o = (y * 120 + x) * 4;
      const g = 1.25 - (x / 120) * 0.8;
      let r = low.data[o], gg = low.data[o + 1], b = low.data[o + 2];
      if (x > 40 && x < 80 && y > 20 && y < 60) {
        // önnur „manneskja“: láréttar rendur í stað frumritsins
        const v = (y % 6) < 3 ? 60 : 200;
        r = v; gg = v * 0.9; b = v * 0.7;
      }
      low.data[o] = Math.min(255, r * g);
      low.data[o + 1] = Math.min(255, gg * g);
      low.data[o + 2] = Math.min(255, b * g);
    }
  const out = transferLighting(src, low, { radius: 4 });
  assert.equal(out.width, 240);
  assert.equal(out.height, 160);
  // 1) Ljósið kemst í gegn: vinstri bjartari en hægri.
  const meanCol = (r: R, x0: number, x1: number) => {
    let s = 0, c = 0;
    for (let y = 0; y < r.height; y++) for (let x = x0; x < x1; x++) { s += r.data[(y * r.width + x) * 4 + 1]; c++; }
    return s / c;
  };
  assert.ok(meanCol(out, 0, 40) > meanCol(out, 200, 240) * 1.4, `${meanCol(out, 0, 40)} vs ${meanCol(out, 200, 240)}`);
  // 2) Í miðjunni er FRUMRITIÐ (lóðrétt 2 px mynstur), ekki láréttu rendurnar:
  //    fylgni við frumritið há, við „nýju manneskjuna“ lág.
  const corr = (a: number[], b: number[]) => {
    const ma = a.reduce((s, v) => s + v, 0) / a.length;
    const mb = b.reduce((s, v) => s + v, 0) / b.length;
    let c = 0, va = 0, vb = 0;
    for (let i = 0; i < a.length; i++) { c += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; }
    return c / Math.sqrt(va * vb);
  };
  const o: number[] = [], s: number[] = [], fake: number[] = [];
  for (let y = 50; y < 110; y++)
    for (let x = 90; x < 150; x++) {
      o.push(out.data[(y * 240 + x) * 4 + 1]);
      s.push(src.data[(y * 240 + x) * 4 + 1]);
      fake.push(((Math.floor(y / 2) % 6) < 3 ? 60 : 200));
    }
  assert.ok(corr(o, s) > 0.9, `corr with original ${corr(o, s)}`);
  assert.ok(Math.abs(corr(o, fake)) < 0.3, `corr with model's person ${corr(o, fake)}`);
});
