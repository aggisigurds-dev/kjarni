/** Lightweight in-browser "repair" — unsharp-mask sharpening, no server,
 * no ML model. Honest framing: this is NOT GFPGAN-quality face
 * restoration — it sharpens blur and mild noise but can't invent detail
 * that isn't there. Pure pixel math (PixelBuffer in/out, no DOM), so it's
 * directly unit-testable like gradient.ts/warp.ts elsewhere in ArtCraft. */

export type PixelBuffer = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

export type SharpenSettings = {
  /** 0..2 — how strongly to push the unsharp-mask. 0 leaves the image unchanged. */
  amount: number;
  /** 1..6 — box-blur radius the sharpening is based on. */
  radius: number;
};

export const DEFAULT_SHARPEN_SETTINGS: SharpenSettings = { amount: 0.8, radius: 2 };

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** Separable box blur (two 1-D passes) — a true Gaussian isn't worth the
 * extra cost here, this is only used as the unsharp-mask's blurred base. */
export function boxBlur(image: PixelBuffer, radius: number): PixelBuffer {
  const { width, height, data } = image;
  const r = Math.max(1, Math.round(radius));
  const horiz = new Uint8ClampedArray(data.length);
  const out = new Uint8ClampedArray(data.length);

  for (let y = 0; y < height; y++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let x = -r; x <= r; x++) {
        const xx = Math.min(width - 1, Math.max(0, x));
        sum += data[(y * width + xx) * 4 + c];
      }
      for (let x = 0; x < width; x++) {
        horiz[(y * width + x) * 4 + c] = Math.round(sum / (2 * r + 1));
        const addX = Math.min(width - 1, x + r + 1);
        const subX = Math.max(0, x - r);
        sum += data[(y * width + addX) * 4 + c] - data[(y * width + subX) * 4 + c];
      }
    }
  }

  for (let x = 0; x < width; x++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) {
        const yy = Math.min(height - 1, Math.max(0, y));
        sum += horiz[(yy * width + x) * 4 + c];
      }
      for (let y = 0; y < height; y++) {
        out[(y * width + x) * 4 + c] = Math.round(sum / (2 * r + 1));
        const addY = Math.min(height - 1, y + r + 1);
        const subY = Math.max(0, y - r);
        sum += horiz[(addY * width + x) * 4 + c] - horiz[(subY * width + x) * 4 + c];
      }
    }
  }

  for (let i = 3; i < data.length; i += 4) out[i] = data[i];
  return { data: out, width, height };
}

/** output = original + amount * (original - blurred), clamped — classic
 * unsharp mask. amount=0 returns the input unchanged. */
export function applySharpen(image: PixelBuffer, settings: SharpenSettings): PixelBuffer {
  const amount = Math.max(0, Math.min(2, settings.amount));
  const out = new Uint8ClampedArray(image.data.length);
  if (amount === 0) {
    out.set(image.data);
    return { data: out, width: image.width, height: image.height };
  }
  const blurred = boxBlur(image, settings.radius);
  for (let i = 0; i < image.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const orig = image.data[i + c];
      const blur = blurred.data[i + c];
      out[i + c] = clamp255(orig + (orig - blur) * amount);
    }
    out[i + 3] = image.data[i + 3];
  }
  return { data: out, width: image.width, height: image.height };
}
