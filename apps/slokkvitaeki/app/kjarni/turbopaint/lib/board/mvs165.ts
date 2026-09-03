import { newId } from "./ids";
import { makeSymbol } from "./markup-kit";
import { getStampSize } from "./symbol-settings";
import type { OcrWord } from "./firewall-rating";
import type { BoardObject, EllipseObject, ImageObject, StickyObject } from "./types";

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

function compact(text: string) {
  return text.toUpperCase().replace(/[ÚÜ]/g, "U").replace(/[^A-Z0-9:]/g, "");
}

function inTitleBlock(word: OcrWord, width: number, height: number) {
  const cx = word.x + word.width / 2;
  const cy = word.y + word.height / 2;
  return cx > width * 0.84 && cy > height * 0.42;
}

function isSlt(text: string) {
  const c = compact(text);
  return /^S[LI1]T\d*$/.test(c);
}

function isHose(text: string) {
  const c = compact(text);
  return /^(BRSL|BRS|SLG|8RSL|BR5L)\d*$/.test(c);
}

function isExit(text: string) {
  const c = compact(text);
  if (c === "UT" || c === "U1" || c === "U7") return true;
  return false;
}

function parseScale(text: string): number | null {
  const m = text.replace(/\s/g, "").match(/1:(\d{2,4})/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 20 && n <= 2000 ? n : null;
}

function nms(words: OcrWord[], dist: number) {
  const ordered = [...words].sort((a, b) => b.confidence - a.confidence);
  const kept: OcrWord[] = [];
  for (const word of ordered) {
    const cx = word.x + word.width / 2;
    const cy = word.y + word.height / 2;
    const dup = kept.some((other) => {
      const ox = other.x + other.width / 2;
      const oy = other.y + other.height / 2;
      return (cx - ox) ** 2 + (cy - oy) ** 2 < dist * dist;
    });
    if (!dup) kept.push(word);
  }
  return kept;
}

function nearby(a: OcrWord, b: OcrWord, dist: number) {
  const dx = a.x + a.width / 2 - (b.x + b.width / 2);
  const dy = a.y + a.height / 2 - (b.y + b.height / 2);
  return dx * dx + dy * dy < dist * dist;
}

function coverageCircle(
  cx: number,
  cy: number,
  radius: number,
  label: string
): EllipseObject {
  return {
    id: newId(),
    type: "ellipse",
    x: cx - radius,
    y: cy - radius,
    width: radius * 2,
    height: radius * 2,
    fill: "#dc26261f",
    stroke: "#dc2626",
    strokeWidth: 2,
    rotation: 0,
    opacity: 0.7,
    locked: true,
    hidden: false,
    name: label,
  };
}

function sticky(x: number, y: number, text: string, fill: string, h = 280): StickyObject {
  return {
    id: newId(),
    type: "sticky",
    x,
    y,
    width: 268,
    height: h,
    text,
    fill,
    fontSize: 14,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    name: "165.BR1 staðsetning",
  };
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

export function placeMvs165Equipment(
  plan: ImageObject,
  words: OcrWord[],
  options?: { pixelsPerMeter?: number | null }
): { objects: BoardObject[]; pixelsPerMeter: number | null; summary: string } {
  const width = plan.width;
  const height = plan.height;
  const sx = 1;
  const sy = 1;
  const usable = words.filter((w) => !inTitleBlock(w, width, height) && w.confidence >= 40);

  const slt = nms(usable.filter((w) => isSlt(w.text) && w.confidence >= 50), 48);
  const hoses = nms(usable.filter((w) => isHose(w.text) && w.confidence >= 50), 48);
  const exits = nms(usable.filter((w) => isExit(w.text) && w.confidence >= 50), 70);
  const scale = drawingScaleFromWords(words);
  let ppm = options?.pixelsPerMeter ?? null;
  if (!ppm && scale && plan.pixelsPerPdfPoint) {
    ppm = pixelsPerMeterFromScale(scale, plan.pixelsPerPdfPoint);
  }

  // Stærðirnar voru fastar (56/36/44) og komu því alltaf eins út, sama hvað stóð
  // í Merkingar-stikunni — Agnar þurfti að minnka hvert merki handvirkt eftir á.
  // Núna kvarðast þær allar af stimpilstærðinni með ÓBREYTTUM innbyrðis
  // hlutföllum og uppstillingu (56 var gamla viðmiðið).
  const S = getStampSize();
  const px = (n: number) => Math.round((n * S) / 56);
  const signPx = px(36);
  const markPx = px(44);

  const objects: BoardObject[] = [];
  const toWorld = (word: OcrWord) => ({
    x: plan.x + (word.x + word.width / 2) * sx,
    y: plan.y + (word.y + word.height / 2) * sy,
  });

  slt.forEach((word, i) => {
    const p = toWorld(word);
    const label = `SLT-${i + 1}`;
    const ext = makeSymbol("extinguisher", p.x - S / 2, p.y - S / 2, label, S);
    ext.name = `165.BR1 ${label}`;
    objects.push(ext);
    const sign = makeSymbol("sign-extinguisher", p.x - signPx / 2, p.y - px(78), "Skilti SLT", signPx);
    sign.name = `165.BR1 skilti ${label}`;
    objects.push(sign);
    if (ppm) {
      objects.push(
        coverageCircle(p.x, p.y, MVS165.maxTravelAMeters * ppm, `165.BR1 þekja 25 m · ${label}`)
      );
    }
  });

  hoses.forEach((word, i) => {
    const p = toWorld(word);
    const label = `BRSL-${i + 1}`;
    const hose = makeSymbol("hose", p.x - S / 2, p.y - S / 2, label, S);
    hose.name = `165.BR1 ${label}`;
    objects.push(hose);
    const sign = makeSymbol("sign-hose", p.x + px(22), p.y - px(78), "Skilti slöngu", signPx);
    sign.name = `165.BR1 skilti ${label}`;
    objects.push(sign);
    const paired = slt.some((s) => nearby(word, s, 110));
    if (paired) {
      const alarm = makeSymbol("alarm", p.x + px(36), p.y + px(8), "Varnarstaður", markPx);
      alarm.name = `165.BR1 varnarstaður ${label}`;
      objects.push(alarm);
    }
  });

  exits.forEach((word, i) => {
    const p = toWorld(word);
    const exit = makeSymbol("exit", p.x - markPx / 2, p.y - markPx / 2, "ÚT", markPx);
    exit.name = `165.BR1 útgangur ${i + 1}`;
    objects.push(exit);
  });

  const requiredA = ppm
    ? Math.max(
        MVS165.minClassA,
        Math.ceil(MVS165.classAPerSquareMeter * ((width * 0.78) / ppm) * ((height * 0.82) / ppm))
      )
    : MVS165.minClassA;
  const haveA = slt.length * MVS165.typicalClassA;
  const hasHose = hoses.length > 0;
  const travelOk = slt.length >= MVS165.minDevicesPerFloor;
  const ratingLine = ppm
    ? `Minnst ${MVS165.minDevicesPerFloor} tæki á hæð. Æskilegt slökkvigildi ≥ ${requiredA}A (nú ~${haveA}A miðað við 13A/tæki).`
    : `Minnst ${MVS165.minDevicesPerFloor} tæki á hæð (nú ${slt.length}). Kvarðaðu til að reikna slökkvigildi.`;
  const lines = [
    `165.BR1 staðsetning`,
    `${slt.length} slökkvitæki, ${hoses.length} brunaslöngur, ${exits.length} ÚT, ${slt.length} skilti.`,
    hasHose ? "Slöngukefli + SLT = varnarstaður (firepoint)." : "Ekkert slöngukefli fannst — bættu við á göngum.",
    `Hámarks göngufjarlægð í tæki: ${MVS165.maxTravelAMeters} m (A) / ${MVS165.maxTravelBMeters} m (B).`,
    ratingLine,
    `Handfang í ${MVS165.handleHeightCm[0]}–${MVS165.handleHeightCm[1]} cm. Ekki bak við hurð / í skáp.`,
    ppm
      ? `Kvarði 1:${scale ?? "?"} — rauðir hringir sýna ${MVS165.maxTravelAMeters} m þekju.`
      : "Kvarðaðu borðið til að teikna 25 m þekju.",
    travelOk ? "Lágmarksfjöldi tækja: staðist." : "Bættu við slökkvitæki — færri en tvö á hæð.",
  ];

  objects.push(
    sticky(
      plan.x + plan.width + 48,
      plan.y + 370,
      lines.join("\n"),
      "#fed7aa",
      320
    )
  );

  return {
    objects: objects.map((obj) => ({ ...obj, parentId: plan.id })),
    pixelsPerMeter: ppm,
    summary: `${slt.length} SLT · ${hoses.length} BRSL`,
  };
}
