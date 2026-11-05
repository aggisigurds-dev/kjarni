/** „Ljós og litir“ í Móta — allar sleðastillingar sem gilda á alla myndina,
 *  keyrðar í einni fastri röð svo forsýn og full upplausn verði eins.
 *  Hrein föll, prófuð í node. Húðaðgerðirnar koma úr retouch.ts. */

import type { Raster } from "../studio/adjust";
import { equalizeSkinTone, sharpenGlobal, shiftSkinTone } from "./retouch";

/** Öll gildi -1..1, nema sharpen og skinEven sem eru 0..1. 0 = óbreytt. */
export type Looks = {
  brightness: number;
  contrast: number;
  highlights: number;
  shadows: number;
  warmth: number;
  saturation: number;
  sharpen: number;
  skinEven: number;
  skinTone: number;
  skinLight: number;
};

export const NEUTRAL_LOOKS: Looks = {
  brightness: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  warmth: 0,
  saturation: 0,
  sharpen: 0,
  skinEven: 0,
  skinTone: 0,
  skinLight: 0,
};

const ONE_SIDED: ReadonlySet<keyof Looks> = new Set(["sharpen", "skinEven"]);

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function normalizeLooks(raw: Partial<Looks> | null | undefined): Looks {
  const out = { ...NEUTRAL_LOOKS };
  for (const key of Object.keys(NEUTRAL_LOOKS) as Array<keyof Looks>) {
    const v = Number(raw?.[key] ?? 0);
    out[key] = Number.isFinite(v) ? clamp(v, ONE_SIDED.has(key) ? 0 : -1, 1) : 0;
  }
  return out;
}

export function looksIsNeutral(looks: Looks): boolean {
  return (Object.keys(NEUTRAL_LOOKS) as Array<keyof Looks>).every((k) => Math.abs(looks[k]) < 1e-4);
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Tónaferill (256 gildi) fyrir birtu, kontrast, ljósa tóna og skugga. Alltaf
 *  vaxandi: hver liður hefur afleiðu > 0 á öllu sviðinu. */
export function toneCurve(looks: Pick<Looks, "brightness" | "contrast" | "highlights" | "shadows">): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  const gamma = Math.pow(2, -0.9 * looks.brightness);
  const mult = 1 + 0.7 * looks.contrast;
  for (let v = 0; v < 256; v++) {
    let x = Math.pow(v / 255, gamma);
    x = 0.5 + (x - 0.5) * mult;
    x = clamp(x, 0, 1);
    x += looks.highlights * 0.25 * smoothstep(0.4, 1, x);
    x += looks.shadows * 0.25 * (1 - smoothstep(0, 0.6, x));
    lut[v] = Math.round(clamp(x, 0, 1) * 255);
  }
  return lut;
}

/** Keyrir allar stillingar á `raster` (breytir honum). Húðin fyrst (hún
 *  þekkir húð á litblæ, áður en tónar og litir hreyfast), svo tónaferill,
 *  hlýja og mettun í einni umferð, skerpa síðast. */
export function applyLooks(raster: Raster, looksIn: Looks): void {
  const looks = normalizeLooks(looksIn);
  if (looksIsNeutral(looks)) return;

  if (looks.skinEven > 0) equalizeSkinTone(raster, looks.skinEven);
  if (looks.skinTone !== 0 || looks.skinLight !== 0) {
    // Neikvæður litblær = hlýrri húð (sama og „Hlýrra“ hnappurinn í Móta).
    shiftSkinTone(raster, -looks.skinTone * 12, 0, looks.skinLight * 0.08);
  }

  const toneActive = looks.brightness || looks.contrast || looks.highlights || looks.shadows;
  const lut = toneActive ? toneCurve(looks) : null;
  const warmR = 1 + 0.12 * looks.warmth;
  const warmG = 1 + 0.02 * looks.warmth;
  const warmB = 1 - 0.12 * looks.warmth;
  const sat = 1 + looks.saturation;
  const colourActive = looks.warmth !== 0 || looks.saturation !== 0;
  if (lut || colourActive) {
    const d = raster.data;
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i];
      let g = d[i + 1];
      let b = d[i + 2];
      if (lut) {
        r = lut[r];
        g = lut[g];
        b = lut[b];
      }
      if (colourActive) {
        r *= warmR;
        g *= warmG;
        b *= warmB;
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        r = l + (r - l) * sat;
        g = l + (g - l) * sat;
        b = l + (b - l) * sat;
      }
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
    }
  }

  if (looks.sharpen > 0) sharpenGlobal(raster, looks.sharpen * 1.5);
}
