"use client";

import { createRaster, type Raster } from "./adjust";
import { stampRefRaster } from "./paintEdit";

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Gat ekki lesið skjáskotið"));
    img.src = src;
  });
}

function rasterFromImage(img: HTMLImageElement, width: number, height: number): Raster {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return createRaster(width, height, 0);
  ctx.drawImage(img, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height);
  return { data: new Uint8ClampedArray(data.data), width, height };
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

/** Stamp the dropped screenshot into the painted hole so Forge starts from that look. */
export async function stampShotIntoMask(initUrl: string, maskUrl: string, shotUrl: string): Promise<string> {
  const [initImg, maskImg, shotImg] = await Promise.all([load(initUrl), load(maskUrl), load(shotUrl)]);
  const width = initImg.naturalWidth || initImg.width;
  const height = initImg.naturalHeight || initImg.height;
  if (width < 1 || height < 1) return initUrl;
  const init = rasterFromImage(initImg, width, height);
  const mask = rasterFromImage(maskImg, width, height);
  const shot = rasterFromImage(shotImg, shotImg.naturalWidth || shotImg.width, shotImg.naturalHeight || shotImg.height);
  return rasterToDataUrl(stampRefRaster(init, mask, shot)) || initUrl;
}
