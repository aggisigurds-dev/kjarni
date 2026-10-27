/** Spotlight compositing — pure pixel math, no DOM/Canvas. Takes a plain
 * RGBA buffer (shape matches ImageData, but isn't the browser class, so
 * this is testable in plain Node) plus a person-coverage mask (alpha
 * channel = how "person" vs "background" a pixel is) and darkens the
 * background / brightens-or-darkens the person along a chosen edge. */

export type GradientDirection = "upp" | "nidur" | "vinstri" | "haegri";

export const GRADIENT_DIRECTIONS: GradientDirection[] = ["upp", "nidur", "vinstri", "haegri"];

export type PixelBuffer = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

export type SpotlightSettings = {
  backgroundDirection: GradientDirection;
  /** 0..1 — how much the darkest edge of the background dims. */
  backgroundStrength: number;
  personDirection: GradientDirection;
  /** -1..1 — negative darkens, positive brightens the person's darkest/brightest edge. */
  personStrength: number;
};

export const DEFAULT_SPOTLIGHT_SETTINGS: SpotlightSettings = {
  backgroundDirection: "nidur",
  backgroundStrength: 0.6,
  personDirection: "upp",
  personStrength: 0,
};

/** 1 at the named edge, fading linearly to 0 at the opposite edge. */
export function directionFactor(
  direction: GradientDirection,
  x: number,
  y: number,
  width: number,
  height: number,
): number {
  switch (direction) {
    case "upp":
      return height <= 1 ? 0 : 1 - y / (height - 1);
    case "nidur":
      return height <= 1 ? 0 : y / (height - 1);
    case "vinstri":
      return width <= 1 ? 0 : 1 - x / (width - 1);
    case "haegri":
      return width <= 1 ? 0 : x / (width - 1);
  }
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/**
 * `image` is the original photo's pixels. `mask` is same-size RGBA where
 * the alpha channel is the person-coverage estimate (255 = fully person,
 * 0 = fully background, values between = soft edge) — exactly what
 * @imgly/background-removal's cutout gives you when drawn to a canvas.
 */
export function applySpotlight(image: PixelBuffer, mask: PixelBuffer, settings: SpotlightSettings): PixelBuffer {
  const { width, height } = image;
  const out = new Uint8ClampedArray(image.data.length);
  const bgStrength = Math.max(0, Math.min(1, settings.backgroundStrength));
  const personStrength = Math.max(-1, Math.min(1, settings.personStrength));

  for (let y = 0; y < height; y++) {
    const bgFactorRow = [];
    const personFactorRow = [];
    for (let x = 0; x < width; x++) {
      bgFactorRow.push(directionFactor(settings.backgroundDirection, x, y, width, height));
      personFactorRow.push(directionFactor(settings.personDirection, x, y, width, height));
    }
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const personWeight = mask.data[i + 3] / 255;
      const bgWeight = 1 - personWeight;

      const multiplier = 1 - bgWeight * bgStrength * bgFactorRow[x] + personWeight * personStrength * personFactorRow[x];

      out[i] = clamp255(image.data[i] * multiplier);
      out[i + 1] = clamp255(image.data[i + 1] * multiplier);
      out[i + 2] = clamp255(image.data[i + 2] * multiplier);
      out[i + 3] = image.data[i + 3];
    }
  }

  return { data: out, width, height };
}
