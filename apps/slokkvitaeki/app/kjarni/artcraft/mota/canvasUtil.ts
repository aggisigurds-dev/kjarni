/** Vafra-hluti Móta-ritilsins: lesa mynd í pixla, teikna á striga og halda
 *  „mip-pýramída“ (full, ½, ¼) svo myndin líti vel út hvort sem hún er
 *  smækkuð til að passa á símaskjá eða zoom-uð inn að pixlum. */

import type { Raster } from "../studio/adjust";
import type { Rect } from "./history";

/** Lengri hlið vinnumyndarinnar. 2560 = 4,9 MP við 4:3 — rúmlega tvöfalt
 *  fyrra 1200-þak í hvora átt, en burstarnir haldast liprir í síma. */
export const MAX_WORKING = 2560;

export const PYRAMID_LEVELS = 3;

function canvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, width);
  c.height = Math.max(1, height);
  return c;
}

function ctx2d(c: HTMLCanvasElement, read = false): CanvasRenderingContext2D {
  const ctx = c.getContext("2d", read ? { willReadFrequently: true } : undefined);
  if (!ctx) throw new Error("Vafrinn leyfir ekki teikningu á striga");
  return ctx;
}

/** ImageData sem deilir minni með rasternum (engin afritun). */
export function imageDataFor(r: Raster): ImageData {
  return new ImageData(r.data as Uint8ClampedArray<ArrayBuffer>, r.width, r.height);
}

/** Les skrá í pixla, smækkaða svo lengri hliðin sé í mesta lagi `maxDim`.
 *  Helmingað í skrefum svo stór mynd verði ekki gróf (bilinear í einu stökki
 *  sleppir pixlum). createImageBitmap virðir EXIF-snúning. */
export async function loadRaster(file: Blob, maxDim = MAX_WORKING): Promise<Raster> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const tw = Math.max(1, Math.round(bitmap.width * scale));
    const th = Math.max(1, Math.round(bitmap.height * scale));
    let src: CanvasImageSource = bitmap;
    let sw = bitmap.width;
    let sh = bitmap.height;
    while (sw > tw * 2) {
      const half = canvas(Math.ceil(sw / 2), Math.ceil(sh / 2));
      const hctx = ctx2d(half);
      hctx.imageSmoothingQuality = "high";
      hctx.drawImage(src, 0, 0, half.width, half.height);
      src = half;
      sw = half.width;
      sh = half.height;
    }
    const out = canvas(tw, th);
    const octx = ctx2d(out, true);
    octx.imageSmoothingQuality = "high";
    octx.drawImage(src, 0, 0, tw, th);
    const img = octx.getImageData(0, 0, tw, th);
    return { data: img.data, width: tw, height: th };
  } finally {
    bitmap.close();
  }
}

/** Teiknar raster á nýjan striga (fyrir líkamsgreiningu o.fl.). */
export function rasterCanvas(r: Raster): HTMLCanvasElement {
  const c = canvas(r.width, r.height);
  ctx2d(c).putImageData(imageDataFor(r), 0, 0);
  return c;
}

/** Smækkuð útgáfa af því sem pýramídinn sýnir — grunnur fyrir forsýn sleða. */
export function previewFromLevels(levels: HTMLCanvasElement[], maxDim: number): Raster {
  const full = levels[0];
  const scale = Math.min(1, maxDim / Math.max(full.width, full.height));
  const tw = Math.max(1, Math.round(full.width * scale));
  const th = Math.max(1, Math.round(full.height * scale));
  // Minnsta stigið sem er enn stærra en markið — aldrei meira en 2× minnkun í einu.
  let src = full;
  for (const level of levels) if (level.width >= tw) src = level;
  const out = canvas(tw, th);
  const octx = ctx2d(out, true);
  octx.imageSmoothingQuality = "high";
  octx.drawImage(src, 0, 0, tw, th);
  const img = octx.getImageData(0, 0, tw, th);
  return { data: img.data, width: tw, height: th };
}

/** Stillir stærð strigastiganna (full, ½, ¼). Skilar true ef stærð breyttist. */
export function sizeLevels(levels: HTMLCanvasElement[], width: number, height: number): boolean {
  let changed = false;
  levels.forEach((c, k) => {
    const w = Math.max(1, Math.ceil(width / 2 ** k));
    const h = Math.max(1, Math.ceil(height / 2 ** k));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
      changed = true;
    }
  });
  return changed;
}

/** Teiknar rasterinn (eða bara `rect` úr honum) á öll stigin. Hvert stig er
 *  búið til úr stiginu fyrir ofan með nákvæmri 2× minnkun (kassasía). */
export function paintLevels(levels: HTMLCanvasElement[], image: ImageData, rect: Rect | null): void {
  const r = rect ?? { x: 0, y: 0, w: image.width, h: image.height };
  ctx2d(levels[0]).putImageData(image, 0, 0, r.x, r.y, r.w, r.h);
  for (let k = 1; k < levels.length; k++) {
    const src = levels[k - 1];
    const dst = levels[k];
    const f = 2 ** k;
    const lx0 = Math.floor(r.x / f);
    const ly0 = Math.floor(r.y / f);
    const lx1 = Math.min(dst.width, Math.ceil((r.x + r.w) / f));
    const ly1 = Math.min(dst.height, Math.ceil((r.y + r.h) / f));
    if (lx1 <= lx0 || ly1 <= ly0) continue;
    const sx = lx0 * 2;
    const sy = ly0 * 2;
    const sw = Math.min(src.width - sx, (lx1 - lx0) * 2);
    const sh = Math.min(src.height - sy, (ly1 - ly0) * 2);
    const dctx = ctx2d(dst);
    dctx.imageSmoothingEnabled = true;
    dctx.imageSmoothingQuality = "medium";
    dctx.clearRect(lx0, ly0, lx1 - lx0, ly1 - ly0);
    dctx.drawImage(src, sx, sy, sw, sh, lx0, ly0, sw / 2, sh / 2);
  }
}

/** Hvaða stig á að sýna: aldrei meira en ~2× minnkun í skjákortinu. */
export function chooseLevel(scale: number, dpr: number): number {
  const m = 1 / Math.max(1e-6, scale * dpr);
  if (m >= 4) return 2;
  if (m >= 2) return 1;
  return 0;
}

export function canvasToBlob(c: HTMLCanvasElement, type: string, quality = 0.95): Promise<Blob> {
  return new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("Gat ekki vistað mynd"))), type, quality);
  });
}
