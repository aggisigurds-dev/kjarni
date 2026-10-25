"use client";

import { createRaster, type Raster } from "./adjust";
import { personBBox } from "./analyze";
import {
  continuePad,
  continueStripMask,
  eraseMaskedClothes,
  orRaster,
  padHasExtent,
  padRaster,
  scaleMaskTo,
  shiftRaster,
  type GarmentSlot,
} from "./garments";

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Gat ekki lesið myndina"));
    img.src = src;
  });
}

function rasterFromImage(img: HTMLImageElement, width?: number, height?: number): Raster {
  const w = width || img.naturalWidth || img.width;
  const h = height || img.naturalHeight || img.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return createRaster(w, h, 0);
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  return { data: new Uint8ClampedArray(data.data), width: w, height: h };
}

function rasterToDataUrl(raster: Raster): string {
  const canvas = document.createElement("canvas");
  canvas.width = raster.width;
  canvas.height = raster.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.putImageData(new ImageData(new Uint8ClampedArray(raster.data), raster.width, raster.height), 0, 0);
  return canvas.toDataURL("image/png");
}

export async function stillSize(src: string): Promise<{ width: number; height: number }> {
  const img = await load(src);
  return { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height };
}

/** Wipe the sweater/pants in the hole so Forge does not morph the pattern into scribble. */
export async function wipeClothesOnStill(stillUrl: string, maskUrl: string): Promise<string> {
  const [stillImg, maskImg] = await Promise.all([load(stillUrl), load(maskUrl)]);
  const still = rasterFromImage(stillImg);
  const mask = rasterFromImage(maskImg, still.width, still.height);
  return rasterToDataUrl(eraseMaskedClothes(still, mask));
}

/** Forge needs the mask at the same pixel size as the still, not the Greina crop. */
export async function alignMaskToStill(maskUrl: string, stillUrl: string): Promise<string> {
  const [maskImg, stillImg] = await Promise.all([load(maskUrl), load(stillUrl)]);
  const width = stillImg.naturalWidth || stillImg.width;
  const height = stillImg.naturalHeight || stillImg.height;
  const mask = rasterFromImage(maskImg, maskImg.naturalWidth || maskImg.width, maskImg.naturalHeight || maskImg.height);
  if (mask.width === width && mask.height === height) return maskUrl;
  return rasterToDataUrl(scaleMaskTo(mask, width, height));
}

export type ContinueExtent = {
  image: string;
  mask: string;
  width: number;
  height: number;
  padded: boolean;
};

/** Grow the still so Áframhald can generate legs/arms that were cut off, plus the in-frame garment hole. */
export async function extendForContinue(
  stillUrl: string,
  slot: GarmentSlot,
  personMaskUrl: string,
  garmentMaskUrl?: string,
): Promise<ContinueExtent> {
  const [stillImg, personImg, garmentImg] = await Promise.all([
    load(stillUrl),
    load(personMaskUrl),
    garmentMaskUrl ? load(garmentMaskUrl) : Promise.resolve(null),
  ]);
  const still = rasterFromImage(stillImg);
  const person = rasterFromImage(personImg, still.width, still.height);
  const box = personBBox(person);
  if (!box) {
    return { image: stillUrl, mask: garmentMaskUrl || personMaskUrl, width: still.width, height: still.height, padded: false };
  }
  const pad = continuePad(slot, still.width, still.height, box);
  const padded = padHasExtent(pad);
  let canvas = padded ? padRaster(still, pad) : still;
  let mask = continueStripMask(canvas.width, canvas.height, pad, box, slot);
  if (garmentMaskUrl && garmentImg) {
    const garment = rasterFromImage(garmentImg, still.width, still.height);
    const shifted = padded ? shiftRaster(garment, pad, canvas.width, canvas.height) : garment;
    canvas = eraseMaskedClothes(canvas, shifted);
    mask = orRaster(mask, shifted);
  }
  return {
    image: rasterToDataUrl(canvas),
    mask: rasterToDataUrl(mask),
    width: canvas.width,
    height: canvas.height,
    padded,
  };
}
