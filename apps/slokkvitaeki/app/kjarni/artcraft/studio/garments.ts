/** Delete a garment, then add a new one. In-place "change pants to shorts" rewrites the whole person. */

import { cloneRaster, createRaster, type Raster } from "./adjust";

export type GarmentSlot = "top" | "sleeves" | "pants" | "shoes";

export type GarmentAction = "rebuild" | "remove" | "continue" | "add";

/** Rebuild/remove must wipe the pattern. Add keeps the reconstructed skin. */
export function shouldWipeClothes(action: GarmentAction): boolean {
  return action !== "add";
}

export const BODY_UNDER_ID = "bodyUnder";

export type BodyBox = { x0: number; y0: number; x1: number; y1: number };

export type ContinuePad = { left: number; right: number; top: number; bottom: number };

/** Inpaint must reconstruct the body under the clothes, never punch a hole or paint a pattern. */
export const GARMENT_FILL =
  "photorealistic skin and anatomy, no clothing pattern, no scribble, no crayon, no brush texture, no mosaic, no statue, no hole, no gap, no transparency, no missing limbs";

export const GARMENT_NEGATIVE =
  "hole, gap, empty cutout, missing legs, missing arms, missing limb, transparency, checkerboard, background showing through the body, amputated, cropped body, floating clothes, discontinuity, latent noise, mosaic, pixelated body, statue, marble, blue statue, scribble, crayon, colored pencil, abstract pattern, painted bodysuit";

/** Keep the photo pixels. Paint-edit latent noise (fill 2) turns the whole body into a mosaic. */
export const GARMENT_DENOISING = 0.46;
export const GARMENT_INPAINT_FILL = 1;

export function garmentRunOptions(): {
  skipPaint: true;
  ignoreRefs: true;
  restoreFaces: false;
  denoisingStrength: number;
  inpaintingFill: number;
  inpaintFullRes: false;
} {
  return {
    skipPaint: true,
    ignoreRefs: true,
    restoreFaces: false,
    denoisingStrength: GARMENT_DENOISING,
    inpaintingFill: GARMENT_INPAINT_FILL,
    inpaintFullRes: false,
  };
}

/** Exact Forge fields. Tests fail if Endurbyggja goes back to noise fill or GFPGAN. */
export function garmentApiFields(): {
  denoising_strength: number;
  inpainting_fill: number;
  inpaint_full_res: boolean;
  restore_faces: boolean;
} {
  const flags = garmentRunOptions();
  return {
    denoising_strength: flags.denoisingStrength,
    inpainting_fill: flags.inpaintingFill,
    inpaint_full_res: flags.inpaintFullRes,
    restore_faces: flags.restoreFaces,
  };
}

export function scaleMaskTo(src: Raster, width: number, height: number): Raster {
  const out = createRaster(width, height, 0);
  if (src.width < 1 || src.height < 1 || width < 1 || height < 1) return out;
  for (let y = 0; y < height; y++) {
    const sy = Math.min(src.height - 1, Math.floor((y / height) * src.height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(src.width - 1, Math.floor((x / width) * src.width));
      const si = (sy * src.width + sx) * 4;
      const di = (y * width + x) * 4;
      const on = src.data[si] > 20 ? 255 : 0;
      out.data[di] = on;
      out.data[di + 1] = on;
      out.data[di + 2] = on;
      out.data[di + 3] = 255;
    }
  }
  return out;
}

export type GarmentAdd = {
  id: string;
  slot: GarmentSlot;
  label: string;
  maskId: string;
  prompt: string;
};

const GARMENT_ADD_KEEP =
  "photorealistic clothing, no scribble, no crayon, no abstract pattern, no extra people";

export const GARMENT_ADDS: GarmentAdd[] = [
  {
    id: "shorts",
    slot: "pants",
    label: "Stuttbuxur",
    maskId: "shortsZone",
    prompt:
      `add fitted adult shorts over the existing reconstructed legs, keep the lower legs fully visible and complete below the hem, do not erase the legs, no hole, same adult person, keep face body and pose, ${GARMENT_ADD_KEEP}`,
  },
  {
    id: "skinny",
    slot: "pants",
    label: "Þröngar buxur",
    maskId: "pants",
    prompt:
      `add tight slim-fit long trousers over the existing legs, keep the legs complete underneath, no hole, same adult person, keep face pose and shoes, ${GARMENT_ADD_KEEP}`,
  },
  {
    id: "longPants",
    slot: "pants",
    label: "Langar buxur",
    maskId: "pants",
    prompt:
      `add long straight trousers over the existing legs, keep the legs complete underneath, no hole, same adult person, keep face pose and shoes, ${GARMENT_ADD_KEEP}`,
  },
  {
    id: "shortSleeve",
    slot: "sleeves",
    label: "Stutterma",
    maskId: "shortSleeveZone",
    prompt:
      `add short sleeves over the existing reconstructed arms, keep the lower arms fully visible and complete, do not erase the arms, no hole, keep the same torso, same adult person, keep face and pose, ${GARMENT_ADD_KEEP}`,
  },
  {
    id: "sleeveless",
    slot: "sleeves",
    label: "Ermalaus",
    maskId: "sleeves",
    prompt:
      `sleeveless top over the existing reconstructed arms, keep the arms fully visible and complete, no hole, keep the same torso, same adult person, keep face and pose, ${GARMENT_ADD_KEEP}`,
  },
  {
    id: "longSleeve",
    slot: "sleeves",
    label: "Síðerma",
    maskId: "sleeves",
    prompt:
      `add long sleeves over the existing arms, keep the arms complete underneath, no hole, keep the same torso, same adult person, keep face and pose, ${GARMENT_ADD_KEEP}`,
  },
  {
    id: "tee",
    slot: "top",
    label: "Stutterma bolur",
    maskId: "top",
    prompt:
      `add a short-sleeve t-shirt over the existing torso, keep the body complete underneath, no hole, same adult person, keep face pose and lower body, ${GARMENT_ADD_KEEP}`,
  },
  {
    id: "longTee",
    slot: "top",
    label: "Síðerma bolur",
    maskId: "top",
    prompt:
      `add a long-sleeve top over the existing torso, keep the body complete underneath, no hole, same adult person, keep face pose and lower body, ${GARMENT_ADD_KEEP}`,
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

/** Skin sampled from the neck line. Grass beside the body must not win. */
export const FALLBACK_SKIN = { r: 214, g: 176, b: 148 };

function isSkinLike(r: number, g: number, b: number): boolean {
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  if (luma < 70 || luma > 245) return false;
  if (r < g + 8) return false;
  if (r < b) return false;
  const max = Math.max(r, g, b);
  const sat = (max - Math.min(r, g, b)) / Math.max(1, max);
  return sat <= 0.55;
}

function addSample(
  image: Raster,
  x: number,
  y: number,
  acc: { r: number; g: number; b: number; n: number },
): void {
  const i = (y * image.width + x) * 4;
  const r = image.data[i];
  const g = image.data[i + 1];
  const b = image.data[i + 2];
  if (!isSkinLike(r, g, b)) return;
  acc.r += r;
  acc.g += g;
  acc.b += b;
  acc.n += 1;
}

export function sampleEdgeSkin(image: Raster, mask: Raster): { r: number; g: number; b: number } {
  const width = Math.min(image.width, mask.width);
  const height = Math.min(image.height, mask.height);
  const neck = { r: 0, g: 0, b: 0, n: 0 };
  const any = { r: 0, g: 0, b: 0, n: 0 };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask.data[(y * mask.width + x) * 4] <= 20) continue;
      if (y > 0 && mask.data[((y - 1) * mask.width + x) * 4] <= 20) {
        addSample(image, x, y - 1, neck);
      }
      for (const [dx, dy] of [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (mask.data[(ny * mask.width + nx) * 4] > 20) continue;
        addSample(image, nx, ny, any);
      }
    }
  }
  const pick = neck.n >= 4 ? neck : any.n >= 4 ? any : null;
  if (!pick) return { ...FALLBACK_SKIN };
  return {
    r: Math.round(pick.r / pick.n),
    g: Math.round(pick.g / pick.n),
    b: Math.round(pick.b / pick.n),
  };
}

/**
 * Replace clothing in the mask with skin. Fill 1 on the original sweater is what
 * became the scribble turtleneck.
 */
export function eraseMaskedClothes(image: Raster, mask: Raster): Raster {
  const fill = sampleEdgeSkin(image, mask);
  const out = cloneRaster(image);
  const width = Math.min(image.width, mask.width);
  const height = Math.min(image.height, mask.height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask.data[(y * mask.width + x) * 4] <= 20) continue;
      const i = (y * out.width + x) * 4;
      out.data[i] = fill.r;
      out.data[i + 1] = fill.g;
      out.data[i + 2] = fill.b;
      out.data[i + 3] = 255;
    }
  }
  return out;
}
