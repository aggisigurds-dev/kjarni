import { fitSize } from "./assets";
import { PDF_SAFE_AREA } from "./import-limits";

/** Decode a UTIF IFD into a board-sized RGBA buffer without allocating the
 * full-resolution canvas. A typical Reykjavík A1 TIF is 9933×7081 (70 MP);
 * toRGBA8 of that is ~280 MB and freezes the phone at "Afþjappa TIF". */

export type TiffRaster = {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  warning?: string;
};

function channelsOf(data: Uint8Array, width: number, height: number): 1 | 3 | 4 | 0 {
  const n = width * height;
  if (!n) return 0;
  if (data.length >= n * 4) return 4;
  if (data.length >= n * 3) return 3;
  if (data.length >= n) return 1;
  return 0;
}

export function planTiffRaster(
  srcW: number,
  srcH: number,
  maxPx: number,
  maxArea = PDF_SAFE_AREA
): { width: number; height: number; scale: number; warning?: string } {
  let fit = fitSize(srcW, srcH, maxPx);
  let warning: string | undefined;
  if (fit.width * fit.height > maxArea) {
    const areaScale = Math.sqrt(maxArea / (srcW * srcH));
    fit = {
      width: Math.max(1, Math.round(srcW * areaScale)),
      height: Math.max(1, Math.round(srcH * areaScale)),
      scale: areaScale,
    };
    warning =
      "TIF var of stór fyrir vafrann — teiknaði í lægri upplausn svo símanum lyfti ekki.";
  } else if (fit.scale < 1) {
    warning = `TIF ${srcW}×${srcH} px var minnkað svo innflutningurinn frysi ekki.`;
  }
  return { ...fit, warning };
}

/** Nearest-neighbour downsample of UTIF `ifd.data` (gray / RGB / RGBA). */
export function downsampleTiffData(
  data: Uint8Array,
  srcW: number,
  srcH: number,
  maxPx: number,
  maxArea = PDF_SAFE_AREA
): TiffRaster {
  const ch = channelsOf(data, srcW, srcH);
  if (!ch) throw new Error("Ógild TIF-myndgögn");
  const plan = planTiffRaster(srcW, srcH, maxPx, maxArea);
  const { width, height } = plan;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const xRatio = srcW / width;
  const yRatio = srcH / height;
  for (let y = 0; y < height; y++) {
    const sy = Math.min(srcH - 1, Math.floor(y * yRatio));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(srcW - 1, Math.floor(x * xRatio));
      const si = (sy * srcW + sx) * ch;
      const di = (y * width + x) * 4;
      if (ch === 1) {
        const g = data[si];
        rgba[di] = g;
        rgba[di + 1] = g;
        rgba[di + 2] = g;
        rgba[di + 3] = 255;
      } else {
        rgba[di] = data[si];
        rgba[di + 1] = data[si + 1];
        rgba[di + 2] = data[si + 2];
        rgba[di + 3] = ch === 4 ? data[si + 3] : 255;
      }
    }
  }
  return { width, height, rgba, warning: plan.warning };
}
