/** Painted-region prompt edits. Default img2img (0.35 + original fill) does not rewrite the mask. */

import { cloneRaster, type Raster } from "./adjust";
import { personBBox } from "./analyze";

export const PAINT_EDIT_DENOISING = 0.62;
export const PAINT_SHOT_DENOISING = 0.5;
export const PAINT_INPAINT_FILL = 2;
export const PAINT_SHOT_FILL = 1;
export const PAINT_MASK_BLUR = 8;
export const PAINT_CFG_MIN = 7;
const MASK_ON = 20;

export type PaintShotKind = "clothes" | "head";

export const PAINT_SHOT_KINDS: Array<{ id: PaintShotKind; label: string; hint: string }> = [
  { id: "clothes", label: "Fatnaður", hint: "kjól → bikini / sundföt" },
  { id: "head", label: "Höfuð", hint: "skipta um haus" },
];

/** Form submit with a mask — not studio-shoot / imprint / fix that pass their own denoise. */
export function isUserPaintEdit(painted: boolean, explicitDenoise?: number): boolean {
  return painted && explicitDenoise == null;
}

export function canPaintSubmit(mask: string | null | undefined, prompt: string, shot: string): boolean {
  if (!mask) return true;
  return Boolean(prompt.trim() || shot.trim());
}

export function paintEditPrompt(user: string, hasShot = false, kind: PaintShotKind = "clothes"): string {
  const base = user.trim();
  const keep =
    "change only the painted masked region as asked, keep every unmasked pixel identical, photorealistic, no extra people";
  const shotLine =
    kind === "head"
      ? "replace the painted head with the person from the dropped screenshot, match their face and hair, keep the unmasked body and pose"
      : "replace the painted clothes with the outfit from the dropped screenshot, same adult person, keep the same face and body";
  const line = hasShot ? `${shotLine}, ${keep}` : `${keep}, same adult person`;
  if (!base) return line;
  if (base.includes("painted masked region") || base.includes("painted region")) return base;
  return `${base}, ${line}`;
}

export function paintEditDenoising(value: number, hasShot = false): number {
  const floor = hasShot ? PAINT_SHOT_DENOISING : PAINT_EDIT_DENOISING;
  const n = Number.isFinite(value) ? value : floor;
  return Math.min(0.72, Math.max(floor, Math.round(n * 100) / 100));
}

export function paintInpaintFill(hasShot = false): number {
  return hasShot ? PAINT_SHOT_FILL : PAINT_INPAINT_FILL;
}

export function paintEditCfg(value: number): number {
  const n = Number.isFinite(value) ? value : PAINT_CFG_MIN;
  return Math.max(PAINT_CFG_MIN, n);
}

export function paintEditMaskBlur(value: number): number {
  const n = Number.isFinite(value) ? value : PAINT_MASK_BLUR;
  return Math.max(PAINT_MASK_BLUR, Math.round(n));
}

/** Head swap uses only the screenshot. Clothes keep the locked face so the person stays. */
export function paintEditFaceRefs(
  kind: PaintShotKind,
  shot: string,
  locked: string[] | undefined,
): string[] | undefined {
  if (shot.trim() && kind === "head") return [shot.trim()];
  return locked;
}

export function paintEditRestoreFaces(kind: PaintShotKind, hasShot: boolean): boolean {
  return !(hasShot && kind === "head");
}

function maskOnAt(mask: Raster, destX: number, destY: number, destW: number, destH: number): boolean {
  if (mask.width <= 0 || mask.height <= 0) return false;
  const mx = Math.min(mask.width - 1, Math.max(0, Math.floor(((destX + 0.5) / destW) * mask.width)));
  const my = Math.min(mask.height - 1, Math.max(0, Math.floor(((destY + 0.5) / destH) * mask.height)));
  return mask.data[(my * mask.width + mx) * 4] > MASK_ON;
}

/** Paste the screenshot into the painted bbox. Unmasked pixels stay the still. */
export function stampRefRaster(init: Raster, mask: Raster, shot: Raster): Raster {
  const out = cloneRaster(init);
  const box = personBBox(mask);
  if (!box || shot.width < 1 || shot.height < 1) return out;
  const scaleX = init.width / Math.max(1, mask.width);
  const scaleY = init.height / Math.max(1, mask.height);
  const x0 = Math.max(0, Math.floor(box.x0 * scaleX));
  const y0 = Math.max(0, Math.floor(box.y0 * scaleY));
  const x1 = Math.min(init.width - 1, Math.ceil((box.x1 + 1) * scaleX) - 1);
  const y1 = Math.min(init.height - 1, Math.ceil((box.y1 + 1) * scaleY) - 1);
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  if (bw < 1 || bh < 1) return out;
  const fit = Math.min(bw / shot.width, bh / shot.height);
  const dw = Math.max(1, Math.round(shot.width * fit));
  const dh = Math.max(1, Math.round(shot.height * fit));
  const ox = x0 + Math.floor((bw - dw) / 2);
  const oy = y0 + Math.floor((bh - dh) / 2);

  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const dx = ox + x;
      const dy = oy + y;
      if (dx < 0 || dy < 0 || dx >= out.width || dy >= out.height) continue;
      if (!maskOnAt(mask, dx, dy, out.width, out.height)) continue;
      const sx = Math.min(shot.width - 1, Math.floor(((x + 0.5) / dw) * shot.width));
      const sy = Math.min(shot.height - 1, Math.floor(((y + 0.5) / dh) * shot.height));
      const si = (sy * shot.width + sx) * 4;
      const di = (dy * out.width + dx) * 4;
      out.data[di] = shot.data[si];
      out.data[di + 1] = shot.data[si + 1];
      out.data[di + 2] = shot.data[si + 2];
      out.data[di + 3] = 255;
    }
  }
  return out;
}
