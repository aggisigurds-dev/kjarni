/** Delete a garment, then add a new one. In-place "change pants to shorts" rewrites the whole person. */

import { createRaster, type Raster } from "./adjust";

export type GarmentSlot = "top" | "sleeves" | "pants" | "shoes";

export const BODY_UNDER_ID = "bodyUnder";

export type BodyBox = { x0: number; y0: number; x1: number; y1: number };

export type ContinuePad = { left: number; right: number; top: number; bottom: number };

/** Inpaint must reconstruct the body under the clothes, never punch a hole. */
export const GARMENT_FILL =
  "fill every masked pixel, reconstruct the body underneath, continue the anatomy, no hole, no gap, no transparency, no missing limbs, painted masked region only";

export const GARMENT_NEGATIVE =
  "hole, gap, empty cutout, missing legs, missing arms, missing limb, transparency, checkerboard, background showing through the body, amputated, cropped body, floating clothes, discontinuity";

export type GarmentAdd = {
  id: string;
  slot: GarmentSlot;
  label: string;
  maskId: string;
  prompt: string;
};

export const GARMENT_ADDS: GarmentAdd[] = [
  {
    id: "shorts",
    slot: "pants",
    label: "Stuttbuxur",
    maskId: "shortsZone",
    prompt:
      "add fitted adult shorts over the existing reconstructed legs, keep the lower legs fully visible and complete below the hem, do not erase the legs, no hole, same adult person, keep face body and pose, photorealistic, no extra people, painted masked region only",
  },
  {
    id: "skinny",
    slot: "pants",
    label: "Þröngar buxur",
    maskId: "pants",
    prompt:
      "add tight slim-fit long trousers over the existing legs, keep the legs complete underneath, no hole, same adult person, keep face pose and shoes, photorealistic, no extra people, painted masked region only",
  },
  {
    id: "longPants",
    slot: "pants",
    label: "Langar buxur",
    maskId: "pants",
    prompt:
      "add long straight trousers over the existing legs, keep the legs complete underneath, no hole, same adult person, keep face pose and shoes, photorealistic, no extra people, painted masked region only",
  },
  {
    id: "shortSleeve",
    slot: "sleeves",
    label: "Stutterma",
    maskId: "shortSleeveZone",
    prompt:
      "add short sleeves over the existing reconstructed arms, keep the lower arms fully visible and complete, do not erase the arms, no hole, keep the same torso, same adult person, keep face and pose, photorealistic, no extra people, painted masked region only",
  },
  {
    id: "sleeveless",
    slot: "sleeves",
    label: "Ermalaus",
    maskId: "sleeves",
    prompt:
      "sleeveless top over the existing reconstructed arms, keep the arms fully visible and complete, no hole, keep the same torso, same adult person, keep face and pose, photorealistic, no extra people, painted masked region only",
  },
  {
    id: "longSleeve",
    slot: "sleeves",
    label: "Síðerma",
    maskId: "sleeves",
    prompt:
      "add long sleeves over the existing arms, keep the arms complete underneath, no hole, keep the same torso, same adult person, keep face and pose, photorealistic, no extra people, painted masked region only",
  },
  {
    id: "tee",
    slot: "top",
    label: "Stutterma bolur",
    maskId: "top",
    prompt:
      "add a short-sleeve t-shirt over the existing torso, keep the body complete underneath, no hole, same adult person, keep face pose and lower body, photorealistic, no extra people, painted masked region only",
  },
  {
    id: "longTee",
    slot: "top",
    label: "Síðerma bolur",
    maskId: "top",
    prompt:
      "add a long-sleeve top over the existing torso, keep the body complete underneath, no hole, same adult person, keep face pose and lower body, photorealistic, no extra people, painted masked region only",
  },
];

export function slotOfRegion(id: string, kind?: string): GarmentSlot | null {
  if (id === "top") return "top";
  if (id === "sleeves" || id === "shortSleeveZone") return "sleeves";
  if (id === "pants" || id === "shortsZone") return "pants";
  if (id === "shoes") return "shoes";
  if (kind === "clothes") return "pants";
  return null;
}

export function isGarmentChip(id: string): boolean {
  return id === "top" || id === "sleeves" || id === "pants" || id === "shoes" || id === BODY_UNDER_ID;
}

export function addsForSlot(slot: GarmentSlot | null): GarmentAdd[] {
  if (!slot) return [];
  return GARMENT_ADDS.filter((row) => row.slot === slot);
}

/** Rebuild the whole body under every garment. Face stays; clothes in the mask go. */
export function garmentBodyPrompt(): string {
  return `take off the clothes in the masked body and reconstruct the complete adult body that was underneath, torso both arms and both legs down to the feet, matching skin and pose, keep the unmasked face and hair identical, ${GARMENT_FILL}, same adult person, photorealistic, no extra people`;
}

export function garmentRemovePrompt(slot: GarmentSlot): string {
  const under =
    slot === "pants"
      ? "take off the trousers and reconstruct the adult legs that were underneath, continue the hips into complete photorealistic legs down to the ankles, matching skin"
      : slot === "sleeves"
        ? "take off the sleeves and reconstruct the adult arms that were underneath, continue the shoulders into complete arms, matching skin, keep the torso clothes"
        : slot === "top"
          ? "take off this top and reconstruct the adult torso that was underneath, continue the body, matching skin, keep lower-body clothes"
          : "take off the shoes and reconstruct the adult feet that were underneath, continue the ankles into complete feet, matching skin";
  return `${under}, ${GARMENT_FILL}, same adult person, keep unmasked face and pose, photorealistic, no extra people`;
}

/** Second pass if the first fill still misses limb continuation. */
export function garmentContinuePrompt(slot: GarmentSlot): string {
  const limb =
    slot === "pants"
      ? "outpaint and continue both adult legs below the frame, complete legs from hip to feet, matching skin and pose"
      : slot === "sleeves"
        ? "outpaint and continue both adult arms beyond the frame, complete the arms, matching skin and pose"
        : slot === "top"
          ? "continue generating the adult torso, complete the body, matching skin"
          : "outpaint and continue the adult feet below the frame, complete the anatomy, matching skin";
  return `${limb}, ${GARMENT_FILL}, same adult person, keep unmasked pixels, photorealistic, no extra people`;
}

function round8(n: number): number {
  return Math.max(0, Math.round(n / 8) * 8);
}

/** Extra canvas so Áframhald can generate legs/arms that were cropped off. */
export function continuePad(
  slot: GarmentSlot,
  width: number,
  height: number,
  box: BodyBox,
): ContinuePad {
  const pad: ContinuePad = { left: 0, right: 0, top: 0, bottom: 0 };
  const bodyH = Math.max(1, box.y1 - box.y0 + 1);
  const bodyW = Math.max(1, box.x1 - box.x0 + 1);
  if (slot === "pants" || slot === "shoes") {
    const want = round8(bodyH * 0.55);
    const room = Math.max(0, height - 1 - box.y1);
    pad.bottom = round8(Math.max(0, want - room));
  }
  if (slot === "sleeves") {
    const want = round8(bodyW * 0.4);
    pad.left = round8(Math.max(0, want - box.x0));
    pad.right = round8(Math.max(0, want - (width - 1 - box.x1)));
  }
  return pad;
}

export function padHasExtent(pad: ContinuePad): boolean {
  return pad.left + pad.right + pad.top + pad.bottom > 0;
}

export function padRaster(src: Raster, pad: ContinuePad, fill = 18): Raster {
  const width = src.width + pad.left + pad.right;
  const height = src.height + pad.top + pad.bottom;
  const out = createRaster(width, height, fill);
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const si = (y * src.width + x) * 4;
      const di = ((y + pad.top) * width + (x + pad.left)) * 4;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = src.data[si + 3];
    }
  }
  return out;
}

export function shiftRaster(src: Raster, pad: ContinuePad, destW: number, destH: number): Raster {
  const out = createRaster(destW, destH, 0);
  for (let y = 0; y < src.height; y++) {
    const dy = y + pad.top;
    if (dy < 0 || dy >= destH) continue;
    for (let x = 0; x < src.width; x++) {
      const dx = x + pad.left;
      if (dx < 0 || dx >= destW) continue;
      const si = (y * src.width + x) * 4;
      const di = (dy * destW + dx) * 4;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = src.data[si + 3];
    }
  }
  return out;
}

export function orRaster(a: Raster, b: Raster): Raster {
  const width = Math.min(a.width, b.width);
  const height = Math.min(a.height, b.height);
  const out = createRaster(a.width, a.height, 0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * a.width + x) * 4;
      const j = (y * b.width + x) * 4;
      const on = a.data[i] > 20 || b.data[j] > 20 ? 255 : 0;
      out.data[i] = on;
      out.data[i + 1] = on;
      out.data[i + 2] = on;
      out.data[i + 3] = 255;
    }
  }
  return out;
}

/** White strip where the body should continue (below hips, or beside arms). */
export function continueStripMask(
  destW: number,
  destH: number,
  pad: ContinuePad,
  box: BodyBox,
  slot: GarmentSlot,
  overlap = 24,
): Raster {
  const out = createRaster(destW, destH, 0);
  const x0 = Math.max(0, box.x0 + pad.left);
  const x1 = Math.min(destW - 1, box.x1 + pad.left);
  const y0 = Math.max(0, box.y0 + pad.top);
  const y1 = Math.min(destH - 1, box.y1 + pad.top);
  if (slot === "pants" || slot === "shoes") {
    const top = Math.max(0, y1 - overlap);
    fillWhite(out, x0, top, x1, destH - 1);
  }
  if (slot === "sleeves") {
    const armTop = y0 + Math.round((y1 - y0) * 0.16);
    const armBot = y0 + Math.round((y1 - y0) * 0.55);
    if (pad.left > 0) fillWhite(out, 0, armTop, x0 + overlap, armBot);
    if (pad.right > 0) fillWhite(out, x1 - overlap, armTop, destW - 1, armBot);
  }
  return out;
}

function fillWhite(dest: Raster, x0: number, y0: number, x1: number, y1: number): void {
  const xa = Math.max(0, Math.min(x0, x1));
  const xb = Math.min(dest.width - 1, Math.max(x0, x1));
  const ya = Math.max(0, Math.min(y0, y1));
  const yb = Math.min(dest.height - 1, Math.max(y0, y1));
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      const i = (y * dest.width + x) * 4;
      dest.data[i] = 255;
      dest.data[i + 1] = 255;
      dest.data[i + 2] = 255;
      dest.data[i + 3] = 255;
    }
  }
}

export function addMaskId(add: GarmentAdd, fallback: string): string {
  return add.maskId || fallback;
}
