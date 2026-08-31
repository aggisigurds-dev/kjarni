import type { ImportQuality } from "./types";
import { IMPORT_MAX_PX } from "./types";

/** Soft notice only — local PDF/TIF is never POSTed to a function. */
export const IMPORT_FILE_WARN_BYTES = 40 * 1024 * 1024;

export const PDF_DPI: Record<ImportQuality, number> = {
  fast: 150,
  standard: 300,
  print: 600,
};

/**
 * RGBA canvas budget. 40 MP ≈ 160 MB. Print used to aim at 100 MP (~400 MB)
 * which OOMs on a 30 MB A1 at 600 DPI. All qualities share this ceiling;
 * requested DPI above it is clamped with an Icelandic warning.
 */
export const PDF_SAFE_AREA = 40_000_000;

export const IMPORT_SIZE_HINT =
  "PDF/TIF eru lesin í vafranum — engin 20 MB skráarhömlun. 30+ MB er í lagi; stórar síður eru teiknaðar í lægri DPI.";

/** File picker accept list. Do not use a bare `image/*` — Android then opens
 * Gallery/Camera and hides Documents, so a PDF looks like it "does not work". */
export const IMPORT_FILE_ACCEPT = [
  "application/pdf",
  ".pdf",
  ".tif",
  ".tiff",
  "image/tiff",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".svg",
  ".gif",
  ".kjarni.json",
].join(",");

export type PdfRasterPlan = {
  scale: number;
  width: number;
  height: number;
  dpi: number;
  requestedDpi: number;
  warning?: string;
};

export function fileSizeWarning(file: { name: string; size: number }): string | null {
  if (file.size < IMPORT_FILE_WARN_BYTES) return null;
  const mb = Math.round(file.size / (1024 * 1024));
  return `${file.name} er ${mb} MB. Innflutningur er í vafranum (ekki sendur á netþjón) en getur tekið minni.`;
}

export function planPdfRaster(
  baseW: number,
  baseH: number,
  quality: ImportQuality,
  maxArea = PDF_SAFE_AREA
): PdfRasterPlan {
  const longest = Math.max(baseW, baseH, 1);
  const requestedDpi = PDF_DPI[quality];
  let scale = requestedDpi / 72;
  const maxPx = IMPORT_MAX_PX[quality];
  if (longest * scale > maxPx) scale = maxPx / longest;
  const area = baseW * baseH * scale * scale;
  if (area > maxArea) scale = Math.sqrt(maxArea / Math.max(1, baseW * baseH));
  scale = Math.max(0.05, scale);
  const dpi = Math.round(scale * 72);
  const warning =
    dpi + 8 < requestedDpi
      ? `Stór síða: teiknað í ${dpi} DPI (beðið um ${requestedDpi}) svo vafrinn fari ekki úr minni.`
      : undefined;
  return {
    scale,
    width: Math.max(1, Math.round(baseW * scale)),
    height: Math.max(1, Math.round(baseH * scale)),
    dpi,
    requestedDpi,
    warning,
  };
}
