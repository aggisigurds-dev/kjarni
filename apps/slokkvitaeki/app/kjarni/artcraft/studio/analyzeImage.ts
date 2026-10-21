"use client";

import { createRaster, fitSize, type Raster } from "./adjust";
import { cutProductBackground } from "../bakgrunnur/cut";
import { personMaskFromCutout, regionsFromPerson, type AnalyzedRegion } from "./analyze";

export type StudioRegion = {
  id: string;
  kind: AnalyzedRegion["kind"];
  label: string;
  maskUrl: string;
  coverage: number;
};

function rasterToDataUrl(raster: Raster): string {
  const canvas = document.createElement("canvas");
  canvas.width = raster.width;
  canvas.height = raster.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.putImageData(new ImageData(new Uint8ClampedArray(raster.data), raster.width, raster.height), 0, 0);
  return canvas.toDataURL("image/png");
}

async function rasterFromUrl(src: string, width: number, height: number): Promise<Raster> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Gat ekki lesið greiningarmynd"));
    el.src = src;
  });
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return createRaster(width, height, 0);
  ctx.drawImage(img, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height);
  return { data: new Uint8ClampedArray(data.data), width, height };
}

export async function analyzeStudioImage(
  source: string,
  onProgress?: (text: string) => void,
): Promise<StudioRegion[]> {
  onProgress?.("Hleð greiningarlíkani…");
  const size = await imageSize(source);
  const fitted = fitSize(size.width, size.height);
  onProgress?.("Greini manneskju og bakgrunn…");
  const cut = await cutProductBackground(source, (info) => {
    if (info.total > 0) onProgress?.(`Hleð greiningarlíkani ${Math.round((info.current / info.total) * 100)}%`);
  });
  const cutUrl = URL.createObjectURL(cut);
  try {
    const image = await rasterFromUrl(source, fitted.width, fitted.height);
    const cutout = await rasterFromUrl(cutUrl, fitted.width, fitted.height);
    const person = personMaskFromCutout(cutout);
    onProgress?.("Finn föt, bakgrunn og hluti…");
    return regionsFromPerson(image, person).map((region) => ({
      id: region.id,
      kind: region.kind,
      label: region.label,
      maskUrl: rasterToDataUrl(region.mask),
      coverage: region.coverage,
    }));
  } finally {
    URL.revokeObjectURL(cutUrl);
  }
}

async function imageSize(src: string): Promise<{ width: number; height: number }> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Gat ekki opnað myndina"));
    el.src = src;
  });
  return { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height };
}
