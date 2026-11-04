/** Upscales a painted mask to match the original photo's pixel dimensions.
 * Brush-based ArtCraft tools (Fjarlægja hlut, Himinn, Skýjastúdíó's inpaint
 * brush) paint on a canvas capped at a performance-friendly size — the
 * mask is only ever as big as that canvas. Now that the photo itself
 * uploads at full resolution (see uploadToStorage.ts) instead of being
 * downscaled to match, the mask has to be scaled up to line up with it
 * before both go to Replicate. */

import type { Raster } from "./studio/adjust";

export async function upscaleMaskToBlob(mask: Raster, targetWidth: number, targetHeight: number): Promise<Blob> {
  const small = document.createElement("canvas");
  small.width = mask.width;
  small.height = mask.height;
  const smallCtx = small.getContext("2d");
  if (!smallCtx) throw new Error("Gat ekki teiknað grímu á striga");
  smallCtx.putImageData(new ImageData(new Uint8ClampedArray(mask.data), mask.width, mask.height), 0, 0);

  const big = document.createElement("canvas");
  big.width = targetWidth;
  big.height = targetHeight;
  const bigCtx = big.getContext("2d");
  if (!bigCtx) throw new Error("Gat ekki teiknað grímu á striga");
  bigCtx.imageSmoothingEnabled = true;
  bigCtx.drawImage(small, 0, 0, targetWidth, targetHeight);

  return new Promise((resolve, reject) => {
    big.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Gat ekki vistað grímu"))), "image/png");
  });
}
