/** Client-side liquify + body-line warps + inpaint mask. No server. */

export type Raster = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

export type LiquifyMode = "expand" | "shrink" | "drag";

export type BodyAmounts = {
  bust: number;
  waist: number;
  hips: number;
  width: number;
};

export const DEFAULT_BODY: BodyAmounts = {
  bust: 0,
  waist: 0,
  hips: 0,
  width: 0,
};

export function clampBody(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(-1, Math.round(n * 100) / 100));
}

export function normalizeBody(raw: Partial<BodyAmounts> | null | undefined): BodyAmounts {
  const src = raw || {};
  return {
    bust: clampBody(src.bust ?? 0),
    waist: clampBody(src.waist ?? 0),
    hips: clampBody(src.hips ?? 0),
    width: clampBody(src.width ?? 0),
  };
}

export function bodyIsIdentity(body: BodyAmounts): boolean {
  return body.bust === 0 && body.waist === 0 && body.hips === 0 && body.width === 0;
}

export function createRaster(width: number, height: number, fill = 0, alpha = 255): Raster {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill;
    data[i + 1] = fill;
    data[i + 2] = fill;
    data[i + 3] = alpha;
  }
  return { data, width, height };
}

export function cloneRaster(src: Raster): Raster {
  return { data: new Uint8ClampedArray(src.data), width: src.width, height: src.height };
}

export function copyRaster(src: Raster, dest: Raster): void {
  dest.data.set(src.data);
}

function gauss(x: number, mu: number, sigma: number): number {
  const d = (x - mu) / sigma;
  return Math.exp(-0.5 * d * d);
}

export function scaleAtY(yNorm: number, body: BodyAmounts): number {
  const y = Math.min(1, Math.max(0, yNorm));
  const s =
    1 +
    body.width * 0.22 +
    body.bust * 0.28 * gauss(y, 0.34, 0.08) +
    body.waist * 0.34 * gauss(y, 0.48, 0.07) +
    body.hips * 0.3 * gauss(y, 0.64, 0.09);
  return Math.min(1.55, Math.max(0.55, s));
}

function sampleBilinear(src: Raster, x: number, y: number, dest: Uint8ClampedArray, di: number): void {
  const maxX = src.width - 1;
  const maxY = src.height - 1;
  const xx = Math.min(maxX, Math.max(0, x));
  const yy = Math.min(maxY, Math.max(0, y));
  const x0 = Math.floor(xx);
  const y0 = Math.floor(yy);
  const x1 = Math.min(maxX, x0 + 1);
  const y1 = Math.min(maxY, y0 + 1);
  const fx = xx - x0;
  const fy = yy - y0;
  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;
  const i00 = (y0 * src.width + x0) * 4;
  const i10 = (y0 * src.width + x1) * 4;
  const i01 = (y1 * src.width + x0) * 4;
  const i11 = (y1 * src.width + x1) * 4;
  for (let c = 0; c < 4; c++) {
    dest[di + c] = src.data[i00 + c] * w00 + src.data[i10 + c] * w10 + src.data[i01 + c] * w01 + src.data[i11 + c] * w11;
  }
}

export function liquifyAt(
  src: Raster,
  dest: Raster,
  cx: number,
  cy: number,
  radius: number,
  strength: number,
  mode: LiquifyMode,
  moveX = 0,
  moveY = 0,
): void {
  const r = Math.max(4, radius);
  const r2 = r * r;
  const force = Math.min(1, Math.max(0, strength));
  const x0 = Math.max(0, Math.floor(cx - r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const x1 = Math.min(src.width - 1, Math.ceil(cx + r));
  const y1 = Math.min(src.height - 1, Math.ceil(cy + r));

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const falloff = (1 - Math.sqrt(d2) / r) ** 2 * force;
      let sx = x;
      let sy = y;
      if (mode === "expand") {
        sx = cx + dx * (1 - falloff * 0.38);
        sy = cy + dy * (1 - falloff * 0.38);
      } else if (mode === "shrink") {
        sx = cx + dx * (1 + falloff * 0.38);
        sy = cy + dy * (1 + falloff * 0.38);
      } else {
        sx = x - moveX * falloff;
        sy = y - moveY * falloff;
      }
      sampleBilinear(src, sx, sy, dest.data, (y * dest.width + x) * 4);
    }
  }
}

export function liquifyInPlace(
  img: Raster,
  cx: number,
  cy: number,
  radius: number,
  strength: number,
  mode: LiquifyMode,
  moveX = 0,
  moveY = 0,
): void {
  const src = cloneRaster(img);
  liquifyAt(src, img, cx, cy, radius, strength, mode, moveX, moveY);
}

export function warpBody(src: Raster, dest: Raster, body: BodyAmounts): void {
  if (bodyIsIdentity(body)) {
    copyRaster(src, dest);
    return;
  }
  const cx = (src.width - 1) / 2;
  const denom = Math.max(1, src.height - 1);
  for (let y = 0; y < src.height; y++) {
    const s = scaleAtY(y / denom, body);
    for (let x = 0; x < src.width; x++) {
      sampleBilinear(src, cx + (x - cx) / s, y, dest.data, (y * dest.width + x) * 4);
    }
  }
}

export function paintMask(mask: Raster, cx: number, cy: number, radius: number, value: number, softness = 0.45): void {
  const r = Math.max(3, radius);
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(cx - r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const x1 = Math.min(mask.width - 1, Math.ceil(cx + r));
  const y1 = Math.min(mask.height - 1, Math.ceil(cy + r));
  const target = Math.min(255, Math.max(0, value));

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d2 = (x - cx) ** 2 + (y - cy) ** 2;
      if (d2 > r2) continue;
      const t = 1 - Math.sqrt(d2) / r;
      const a = t < softness ? t / Math.max(0.001, softness) : 1;
      const i = (y * mask.width + x) * 4;
      const next = mask.data[i] * (1 - a) + target * a;
      mask.data[i] = next;
      mask.data[i + 1] = next;
      mask.data[i + 2] = next;
      mask.data[i + 3] = 255;
    }
  }
}

export function maskHasPaint(mask: Raster, threshold = 20): boolean {
  for (let i = 0; i < mask.data.length; i += 4) {
    if (mask.data[i] > threshold) return true;
  }
  return false;
}

export function strokePoints(x0: number, y0: number, x1: number, y1: number, spacing: number): Array<{ x: number; y: number }> {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const step = Math.max(1, spacing);
  if (dist < step) return [{ x: x1, y: y1 }];
  const n = Math.floor(dist / step);
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    out.push({ x: x0 + dx * t, y: y0 + dy * t });
  }
  return out;
}

export function fitSize(width: number, height: number, max = 1024): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const scale = max / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
