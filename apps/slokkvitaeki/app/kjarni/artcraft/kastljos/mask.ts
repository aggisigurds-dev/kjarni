/** Person-segmentation + canvas glue for the spotlight tool. The actual
 * pixel math lives in gradient.ts (pure, tested without a DOM); this file
 * is the part that needs a browser. */

import { applySpotlight, type PixelBuffer, type SpotlightSettings } from "./gradient";

async function imageDataFrom(source: Blob | string): Promise<{ bitmap: ImageBitmap; pixels: PixelBuffer }> {
  const bitmap = await createImageBitmap(await (typeof source === "string" ? fetch(source).then((r) => r.blob()) : source));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Gat ekki teiknað á striga");
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  return { bitmap, pixels: { data: imageData.data, width: imageData.width, height: imageData.height } };
}

/** Runs @imgly/background-removal and returns the cutout's alpha channel
 * resampled to the original image's exact pixel dimensions — that alpha
 * *is* the person-coverage mask applySpotlight needs. */
export async function personMask(
  source: Blob,
  targetWidth: number,
  targetHeight: number,
  onProgress?: (current: number, total: number) => void,
): Promise<PixelBuffer> {
  const { removeBackground } = await import("@imgly/background-removal");
  const cutout = await removeBackground(source, {
    model: "isnet_quint8",
    output: { format: "image/png", quality: 0.92 },
    progress: (_key, current, total) => onProgress?.(current, total),
  });
  const bitmap = await createImageBitmap(cutout);
  const canvas = new OffscreenCanvas(targetWidth, targetHeight);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Gat ekki teiknað grímu á striga");
  // The cutout can come back a slightly different size than the source
  // (model's internal resolution); stretch it back to match exactly so
  // mask and image pixels line up 1:1.
  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
  return { data: imageData.data, width: imageData.width, height: imageData.height };
}

export async function renderSpotlight(
  source: Blob,
  mask: PixelBuffer,
  settings: SpotlightSettings,
): Promise<Blob> {
  const { pixels } = await imageDataFrom(source);
  const result = applySpotlight(pixels, mask, settings);

  const canvas = new OffscreenCanvas(result.width, result.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Gat ekki teiknað útkomu á striga");
  const out = ctx.createImageData(result.width, result.height);
  out.data.set(result.data);
  ctx.putImageData(out, 0, 0);
  return canvas.convertToBlob({ type: "image/jpeg", quality: 0.95 });
}
