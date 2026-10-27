/** Pure mask-painting math for Skýjastúdíó's inpaint brush — reuses the
 * generic Raster/strokePoints/fitSize helpers from studio/adjust.ts (same
 * pattern as Móta's liquify brush) rather than duplicating them. The mask
 * convention matches Replicate's SDXL input: white = inpaint this area,
 * black = preserve it. */

import type { Raster } from "../studio/adjust";

/** Fills a solid white circle into the mask raster at (cx, cy), mutating
 * in place — same "dab" shape as a round brush. */
export function paintCircle(mask: Raster, cx: number, cy: number, radius: number): void {
  const r2 = radius * radius;
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(mask.width - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(mask.height - 1, Math.ceil(cy + radius));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) {
        const i = (y * mask.width + x) * 4;
        mask.data[i] = 255;
        mask.data[i + 1] = 255;
        mask.data[i + 2] = 255;
        mask.data[i + 3] = 255;
      }
    }
  }
}

/** Fraction (0..1) of the mask that is painted white — used to block
 * submitting an inpaint request with an empty (all-black) mask. */
export function maskCoverage(mask: Raster): number {
  const total = mask.width * mask.height;
  if (total === 0) return 0;
  let white = 0;
  for (let i = 0; i < mask.data.length; i += 4) {
    if (mask.data[i] > 127) white++;
  }
  return white / total;
}

/** Blends a translucent tint onto `source` wherever `mask` is white —
 * what the brush canvas actually displays while painting. `source` and
 * `mask` must be the same size; `mask` itself is never shown to the user
 * (and never sent anywhere) tinted — only this composite is. */
export function compositeMaskOverlay(
  source: Raster,
  mask: Raster,
  tint: [number, number, number] = [255, 64, 64],
  alpha = 0.45,
): Raster {
  const out: Raster = { data: new Uint8ClampedArray(source.data), width: source.width, height: source.height };
  for (let i = 0; i < out.data.length; i += 4) {
    if (mask.data[i] > 127) {
      out.data[i] = out.data[i] * (1 - alpha) + tint[0] * alpha;
      out.data[i + 1] = out.data[i + 1] * (1 - alpha) + tint[1] * alpha;
      out.data[i + 2] = out.data[i + 2] * (1 - alpha) + tint[2] * alpha;
    }
  }
  return out;
}
