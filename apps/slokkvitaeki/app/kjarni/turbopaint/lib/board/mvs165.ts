import type { OcrWord } from "./firewall-rating";
import type { BoardObject } from "./types";

/** Brunamálastofnun 165.BR1 — val og staðsetning handslökkvitækja. */
export const MVS165 = {
  source: "165.BR1",
  title: "Leiðbeiningar um val og staðsetningu handslökkvitækja",
  docUrl: "/docs/MVS-165_BR1.pdf",
  maxTravelAMeters: 25,
  maxTravelBMeters: 20,
  handleHeightCm: [70, 80] as const,
  minDevicesPerFloor: 2,
  minClassA: 26,
  classAPerSquareMeter: 0.065,
  typicalClassA: 13,
  minPowderKgIfAlone: 6,
  minPowderKgExtra: 2,
};

export function isMvsMark(obj: BoardObject) {
  return obj.name.startsWith("165.BR1");
}

function parseScale(text: string): number | null {
  const m = text.replace(/\s/g, "").match(/1:(\d{2,4})/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 20 && n <= 2000 ? n : null;
}

export function drawingScaleFromWords(words: OcrWord[]): number | null {
  for (const word of words) {
    const scale = parseScale(word.text);
    if (scale) return scale;
  }
  return null;
}

export function pixelsPerMeterFromScale(scale: number, pixelsPerPdfPoint: number) {
  const pdfPointsPerMeter = 1000 / 25.4 * 72 / scale;
  return pdfPointsPerMeter * pixelsPerPdfPoint;
}

// (Áður: placeMvs165Equipment — las SLT/BRSL/ÚT úr OCR-orðunum og setti 165.BR1-hönnunartákn þar sem TEXTINN var, í
// myndardílum eins og þeir væru borðeiningar (3,14× of langt frá horni myndarinnar á Álfaborg 1. hæð), með 25 m
// þekjuhringjum, og tengdi ekkert við tæki staðarins. Agnar 07.10.2026. Nú: slt-brsl.ts + slt-brsl-bord.ts.)
