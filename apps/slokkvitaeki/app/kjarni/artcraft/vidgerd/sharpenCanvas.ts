/** Canvas glue for the in-browser sharpen path — the pixel math lives in
 * sharpen.ts (pure, tested without a DOM); this file is the part that
 * needs a browser. */

import { applySharpen, type PixelBuffer, type SharpenSettings } from "./sharpen";

const MAX_DIMENSION = 1600;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Gat ekki opnað myndina"));
    img.src = src;
  });
}

export async function enhancePhotoInBrowser(file: Blob, settings: SharpenSettings): Promise<Blob> {
  const img = await loadImage(URL.createObjectURL(file));
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  const scale = longest > MAX_DIMENSION ? MAX_DIMENSION / longest : 1;
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Gat ekki teiknað á striga");
  ctx.drawImage(img, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels: PixelBuffer = { data: imageData.data, width, height };
  const result = applySharpen(pixels, settings);

  const out = ctx.createImageData(result.width, result.height);
  out.data.set(result.data);
  ctx.putImageData(out, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Gat ekki vistað mynd"))), "image/jpeg", 0.95);
  });
}
