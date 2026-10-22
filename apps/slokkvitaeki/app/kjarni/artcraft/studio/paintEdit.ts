/** Painted-region prompt edits. Default img2img (0.35 + original fill) does not rewrite the mask. */

export const PAINT_EDIT_DENOISING = 0.62;
export const PAINT_INPAINT_FILL = 2;
export const PAINT_MASK_BLUR = 8;
export const PAINT_CFG_MIN = 7;

/** Form submit with a mask — not studio-shoot / imprint / fix that pass their own denoise. */
export function isUserPaintEdit(painted: boolean, explicitDenoise?: number): boolean {
  return painted && explicitDenoise == null;
}

export function paintEditPrompt(user: string): string {
  const base = user.trim();
  const line =
    "change only the painted masked region as asked, keep every unmasked pixel identical, photorealistic, same adult person, no extra people";
  if (!base) return line;
  if (base.includes("painted masked region") || base.includes("painted region")) return base;
  return `${base}, ${line}`;
}

export function paintEditDenoising(value: number): number {
  const n = Number.isFinite(value) ? value : PAINT_EDIT_DENOISING;
  return Math.min(0.72, Math.max(PAINT_EDIT_DENOISING, Math.round(n * 100) / 100));
}

export function paintEditCfg(value: number): number {
  const n = Number.isFinite(value) ? value : PAINT_CFG_MIN;
  return Math.max(PAINT_CFG_MIN, n);
}

export function paintEditMaskBlur(value: number): number {
  const n = Number.isFinite(value) ? value : PAINT_MASK_BLUR;
  return Math.max(PAINT_MASK_BLUR, Math.round(n));
}
