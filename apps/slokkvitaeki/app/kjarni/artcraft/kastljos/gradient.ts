/** Spotlight compositing — pure pixel math, no DOM/Canvas. Takes a plain
 * RGBA buffer (shape matches ImageData, but isn't the browser class, so
 * this is testable in plain Node) plus a person-coverage mask (alpha
 * channel = how "person" vs "background" a pixel is) and brightens or
 * darkens the background / the person independently from each of the
 * four edges — the edges combine additively, so a corner can get two
 * edges' worth of effect at once. */

export type GradientDirection = "upp" | "nidur" | "vinstri" | "haegri";

export const GRADIENT_DIRECTIONS: GradientDirection[] = ["upp", "nidur", "vinstri", "haegri"];

export type PixelBuffer = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

/** One signed amount per edge, -100..100. Negative darkens toward that
 * edge, positive brightens toward it. All four can be set at once. */
export type EdgeAmounts = Record<GradientDirection, number>;

export const ZERO_EDGES: EdgeAmounts = { upp: 0, nidur: 0, vinstri: 0, haegri: 0 };

export type SpotlightSettings = {
  background: EdgeAmounts;
  person: EdgeAmounts;
};

export const DEFAULT_SPOTLIGHT_SETTINGS: SpotlightSettings = {
  background: { upp: 0, nidur: -75, vinstri: 0, haegri: 0 },
  person: { upp: 20, nidur: 0, vinstri: 0, haegri: 0 },
};

function clampEdgeAmount(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(-100, Math.min(100, v));
}

export function normalizeEdges(raw: Partial<EdgeAmounts> | null | undefined): EdgeAmounts {
  const src = raw || {};
  return {
    upp: clampEdgeAmount(src.upp ?? 0),
    nidur: clampEdgeAmount(src.nidur ?? 0),
    vinstri: clampEdgeAmount(src.vinstri ?? 0),
    haegri: clampEdgeAmount(src.haegri ?? 0),
  };
}

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

/** Combined signed multiplier offset from all four edges at one pixel —
 * e.g. a bottom-right corner pixel sums both "nidur" and "haegri"'s
 * contribution, so corners can get darker/brighter than a single edge
 * alone would make them. */
export function edgeMultiplier(edges: EdgeAmounts, x: number, y: number, width: number, height: number): number {
  let total = 0;
  for (const dir of GRADIENT_DIRECTIONS) {
    const amount = edges[dir] / 100;
    if (amount === 0) continue;
    total += amount * directionFactor(dir, x, y, width, height);
  }
  return total;
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
  const background = normalizeEdges(settings.background);
  const person = normalizeEdges(settings.person);

  for (let y = 0; y < height; y++) {
    const bgRow: number[] = [];
    const personRow: number[] = [];
    for (let x = 0; x < width; x++) {
      bgRow.push(edgeMultiplier(background, x, y, width, height));
      personRow.push(edgeMultiplier(person, x, y, width, height));
    }
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const personWeight = mask.data[i + 3] / 255;
      const bgWeight = 1 - personWeight;

      const multiplier = 1 + bgWeight * bgRow[x] + personWeight * personRow[x];

      out[i] = clamp255(image.data[i] * multiplier);
      out[i + 1] = clamp255(image.data[i + 1] * multiplier);
      out[i + 2] = clamp255(image.data[i + 2] * multiplier);
      out[i + 3] = image.data[i + 3];
    }
  }

  return { data: out, width, height };
}
