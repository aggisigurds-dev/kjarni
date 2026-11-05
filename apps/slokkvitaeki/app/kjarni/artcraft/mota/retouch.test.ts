import assert from "node:assert/strict";
import { test } from "node:test";
import type { Raster } from "../studio/adjust.ts";
import { cloneRegion, restoreRegion, smoothRegion } from "./retouch.ts";

function noise(width: number, height: number, seed = 7): Raster {
  const data = new Uint8ClampedArray(width * height * 4);
  let s = seed;
  for (let i = 0; i < data.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    data[i] = (i & 3) === 3 ? 255 : s % 256;
  }
  return { data, width, height };
}

function copy(r: Raster): Raster {
  return { data: new Uint8ClampedArray(r.data), width: r.width, height: r.height };
}

function brushWeight(d: number, radius: number): number {
  if (d >= radius) return 0;
  return Math.pow(1 - d / radius, 0.75);
}

/** Beina (hæga) útgáfan sem smoothRegion leysti af — viðmið fyrir summed-area töfluna. */
function smoothNaive(raster: Raster, cx: number, cy: number, radius: number, strength: number) {
  const w = raster.width;
  const h = raster.height;
  const r2 = radius * radius;
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(w - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(h - 1, Math.ceil(cy + radius));
  const kernel = Math.max(1, Math.round(radius / 20));
  const src = raster.data.slice(y0 * w * 4, (y1 + 1) * w * 4);
  const off = y0 * w * 4;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d2 = (x - cx) ** 2 + (y - cy) ** 2;
      if (d2 > r2) continue;
      const weight = brushWeight(Math.sqrt(d2), radius) * strength;
      if (weight <= 0) continue;
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let n = 0;
      for (let ky = -kernel; ky <= kernel; ky++) {
        for (let kx = -kernel; kx <= kernel; kx++) {
          const nx = x + kx;
          const ny = y + ky;
          if (nx < 0 || nx >= w || ny < y0 || ny > y1) continue;
          const i = (ny * w + nx) * 4 - off;
          sr += src[i];
          sg += src[i + 1];
          sb += src[i + 2];
          n++;
        }
      }
      const idx = (y * w + x) * 4;
      raster.data[idx] = Math.round(raster.data[idx] * (1 - weight) + (sr / n) * weight);
      raster.data[idx + 1] = Math.round(raster.data[idx + 1] * (1 - weight) + (sg / n) * weight);
      raster.data[idx + 2] = Math.round(raster.data[idx + 2] * (1 - weight) + (sb / n) * weight);
    }
  }
}

function cloneNaive(raster: Raster, dstX: number, dstY: number, srcX: number, srcY: number, radius: number, strength: number) {
  const w = raster.width;
  const h = raster.height;
  const r2 = radius * radius;
  const src = new Uint8ClampedArray(raster.data);
  for (let y = Math.max(0, Math.floor(dstY - radius)); y <= Math.min(h - 1, Math.ceil(dstY + radius)); y++) {
    for (let x = Math.max(0, Math.floor(dstX - radius)); x <= Math.min(w - 1, Math.ceil(dstX + radius)); x++) {
      const dx = x - dstX;
      const dy = y - dstY;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const sx = Math.round(srcX + dx);
      const sy = Math.round(srcY + dy);
      if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue;
      const weight = brushWeight(Math.sqrt(d2), radius) * strength;
      if (weight <= 0) continue;
      const si = (sy * w + sx) * 4;
      const di = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) raster.data[di + c] = Math.round(raster.data[di + c] * (1 - weight) + src[si + c] * weight);
    }
  }
}

test("smoothRegion (summed-area) matches the direct box blur exactly", () => {
  const base = noise(97, 83);
  const cases: Array<[number, number, number, number]> = [
    [40, 40, 25, 0.7],
    [3, 5, 30, 1], // við horn — klemmt við myndbrún
    [90.4, 80.6, 47, 0.4], // brot og utan hægri/neðri brúnar
    [50, 10, 61, 0.9], // kjarni 3
  ];
  for (const [cx, cy, r, s] of cases) {
    const a = copy(base);
    const b = copy(base);
    smoothRegion(a, cx, cy, r, s);
    smoothNaive(b, cx, cy, r, s);
    assert.deepEqual(a.data, b.data, `smooth ${cx},${cy} r=${r}`);
  }
});

test("cloneRegion from the same image matches copying the whole image first", () => {
  const base = noise(120, 90, 3);
  const cases: Array<[number, number, number, number, number, number]> = [
    [60, 45, 20, 20, 15, 0.8],
    [10, 10, 100, 80, 22, 1], // upptök við neðra horn
    [60, 45, 64, 40, 18, 0.6], // skarast: upptök og áfangastaður nærri hvor öðrum
    [115.3, 2.7, 3.2, 87.9, 9, 0.5],
  ];
  for (const [dx, dy, sx, sy, r, s] of cases) {
    const a = copy(base);
    const b = copy(base);
    cloneRegion(a, dx, dy, sx, sy, r, s);
    cloneNaive(b, dx, dy, sx, sy, r, s);
    assert.deepEqual(a.data, b.data, `clone ${dx},${dy} <- ${sx},${sy}`);
  }
});

test("restoreRegion blends the original back under the brush only", () => {
  const original = noise(40, 40, 11);
  const edited = copy(original);
  for (let i = 0; i < edited.data.length; i += 4) edited.data[i] = 0;
  restoreRegion(edited, original, 20, 20, 8, 1);
  const at = (x: number, y: number) => (y * 40 + x) * 4;
  assert.equal(edited.data[at(20, 20)], original.data[at(20, 20)], "full weight at centre");
  assert.equal(edited.data[at(2, 2)], 0, "outside the brush stays edited");
  const mismatch = noise(41, 40);
  const untouched = copy(edited);
  restoreRegion(edited, mismatch, 20, 20, 8, 1);
  assert.deepEqual(edited.data, untouched.data, "different sizes: no-op");
});
