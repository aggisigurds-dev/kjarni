/** Áferðarburstar fyrir Móta — vinna beint á pixlum (ekki liquify-geometry).
 *
 * Fjórir bursta-hamir:
 *   smooth   — jafnar út húð / sléttar yfir hrukkur með smá blur-i.
 *   lighten  — bætir birtu smám saman (klassískur dodge).
 *   darken   — minnkar birtu (klassískur burn).
 *   heal     — fjarlægir bletti/ör: tekur meðaltal af HRINGNUM UTAN við
 *              burstann og blandar inn í miðjuna. Vinnur best á litlum
 *              hlutum (fæðingarbletti, ör, hárspotti) með samleitri áferð
 *              í kringum.
 *
 * Allar aðgerðir mutera raster-inn beint (í samræmi við liquifyInPlace í
 * adjust.ts); kallandinn verður að pushUndo áður en strik byrjar. */

import type { Raster } from "../studio/adjust";

export type RetouchMode =
  | "smooth"
  | "lighten"
  | "darken"
  | "heal"
  | "clone"
  | "contrast"
  | "sharpen";

/** Soft brush falloff: 1 í miðjunni, 0 á brúninni, cos-shaped en nálgað
 *  með (1 - r/R)^0.75 fyrir eðlilegra heal/smooth. */
function brushWeight(d: number, radius: number): number {
  if (d >= radius) return 0;
  const t = 1 - d / radius;
  return Math.pow(t, 0.75);
}

export function smoothRegion(raster: Raster, cx: number, cy: number, radius: number, strength: number): void {
  const w = raster.width;
  const h = raster.height;
  const r2 = radius * radius;
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(w - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(h - 1, Math.ceil(cy + radius));
  // Afrit af pixlum í brush-svæðinu áður en við ritum — forðast feedback
  // sem myndi færa smooth-ið eftir sweep-áttinni.
  const kernel = Math.max(1, Math.round(radius / 20)); // skalar með bursta
  const src = raster.data.slice(y0 * w * 4, (y1 + 1) * w * 4);
  const srcOffset = y0 * w * 4;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const weight = brushWeight(Math.sqrt(d2), radius) * strength;
      if (weight <= 0) continue;
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let n = 0;
      for (let ky = -kernel; ky <= kernel; ky++) {
        for (let kx = -kernel; kx <= kernel; kx++) {
          const nx = x + kx;
          const ny = y + ky;
          if (nx < 0 || nx >= w || ny < y0 || ny > y1) continue;
          const i = (ny * w + nx) * 4 - srcOffset;
          sumR += src[i];
          sumG += src[i + 1];
          sumB += src[i + 2];
          n++;
        }
      }
      if (n === 0) continue;
      const idx = (y * w + x) * 4;
      raster.data[idx] = Math.round(raster.data[idx] * (1 - weight) + (sumR / n) * weight);
      raster.data[idx + 1] = Math.round(raster.data[idx + 1] * (1 - weight) + (sumG / n) * weight);
      raster.data[idx + 2] = Math.round(raster.data[idx + 2] * (1 - weight) + (sumB / n) * weight);
    }
  }
}

function adjustBrightness(
  raster: Raster,
  cx: number,
  cy: number,
  radius: number,
  strength: number,
  direction: 1 | -1,
): void {
  const w = raster.width;
  const h = raster.height;
  const r2 = radius * radius;
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(w - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(h - 1, Math.ceil(cy + radius));
  // Hámark ±40 per dab; margir dabsar magnast upp því brush-sweep leggur
  // margfalt yfir, en ekki svo mikið að eitt tap verði of hart.
  const maxDelta = 40;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const weight = brushWeight(Math.sqrt(d2), radius) * strength;
      if (weight <= 0) continue;
      const delta = direction * weight * maxDelta;
      const idx = (y * w + x) * 4;
      raster.data[idx] = Math.max(0, Math.min(255, raster.data[idx] + delta));
      raster.data[idx + 1] = Math.max(0, Math.min(255, raster.data[idx + 1] + delta));
      raster.data[idx + 2] = Math.max(0, Math.min(255, raster.data[idx + 2] + delta));
    }
  }
}

export function lightenRegion(raster: Raster, cx: number, cy: number, radius: number, strength: number): void {
  adjustBrightness(raster, cx, cy, radius, strength, 1);
}

export function darkenRegion(raster: Raster, cx: number, cy: number, radius: number, strength: number): void {
  adjustBrightness(raster, cx, cy, radius, strength, -1);
}

export function healRegion(raster: Raster, cx: number, cy: number, radius: number, strength: number): void {
  // Tökum meðaltal úr þunnum hring utan við burstann (frá radius til
  // outerRadius) og blöndum inn í svæðið innan radius með falloff.
  const w = raster.width;
  const h = raster.height;
  const outerRadius = radius * 1.5;
  const r2 = radius * radius;
  const outer2 = outerRadius * outerRadius;
  const x0 = Math.max(0, Math.floor(cx - outerRadius));
  const x1 = Math.min(w - 1, Math.ceil(cx + outerRadius));
  const y0 = Math.max(0, Math.floor(cy - outerRadius));
  const y1 = Math.min(h - 1, Math.ceil(cy + outerRadius));
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > outer2 || d2 < r2) continue;
      const i = (y * w + x) * 4;
      sumR += raster.data[i];
      sumG += raster.data[i + 1];
      sumB += raster.data[i + 2];
      n++;
    }
  }
  if (n === 0) return;
  const avgR = sumR / n;
  const avgG = sumG / n;
  const avgB = sumB / n;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const weight = brushWeight(Math.sqrt(d2), radius) * strength;
      if (weight <= 0) continue;
      const idx = (y * w + x) * 4;
      raster.data[idx] = Math.round(raster.data[idx] * (1 - weight) + avgR * weight);
      raster.data[idx + 1] = Math.round(raster.data[idx + 1] * (1 - weight) + avgG * weight);
      raster.data[idx + 2] = Math.round(raster.data[idx + 2] * (1 - weight) + avgB * weight);
    }
  }
}

/** Clone Stamp — Photoshop-stíl. Afritar pixla úr source-stöðu yfir á
 *  burstastöðu með falloff + strength. Kallandinn verður að muna
 *  (sourceX, sourceY) ÁÐUR en strik byrjar, og uppfæra þannig að offset
 *  (dstX - firstDstX, dstY - firstDstY) sé bætt við original source.
 *  Við munum ekki afrita utan myndsvæðisins. */
export function cloneRegion(
  raster: Raster,
  dstX: number,
  dstY: number,
  srcX: number,
  srcY: number,
  radius: number,
  strength: number,
): void {
  const w = raster.width;
  const h = raster.height;
  const r2 = radius * radius;
  const x0 = Math.max(0, Math.floor(dstX - radius));
  const x1 = Math.min(w - 1, Math.ceil(dstX + radius));
  const y0 = Math.max(0, Math.floor(dstY - radius));
  const y1 = Math.min(h - 1, Math.ceil(dstY + radius));
  // Afrit af öllum raster áður en við ritum — annars myndi clone-ið lesa
  // frá nýlega-skrifuðum pixlum þegar src og dst skarast.
  const src = new Uint8ClampedArray(raster.data);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - dstX;
      const dy = y - dstY;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const sx = Math.round(srcX + dx);
      const sy = Math.round(srcY + dy);
      if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue;
      const weight = brushWeight(Math.sqrt(d2), radius) * strength;
      if (weight <= 0) continue;
      const srcIdx = (sy * w + sx) * 4;
      const dstIdx = (y * w + x) * 4;
      raster.data[dstIdx] = Math.round(raster.data[dstIdx] * (1 - weight) + src[srcIdx] * weight);
      raster.data[dstIdx + 1] = Math.round(raster.data[dstIdx + 1] * (1 - weight) + src[srcIdx + 1] * weight);
      raster.data[dstIdx + 2] = Math.round(raster.data[dstIdx + 2] * (1 - weight) + src[srcIdx + 2] * weight);
    }
  }
}

/** Contrast — s-curve lift innan burstans. Pullar skugga niður og
 *  highlights upp í kringum 128 miðju með falloff.
 *  factor er áhrifastyrkur: 0 = engin breyting, 1 = sterkt. */
export function contrastRegion(
  raster: Raster,
  cx: number,
  cy: number,
  radius: number,
  strength: number,
): void {
  const w = raster.width;
  const r2 = radius * radius;
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(w - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(raster.height - 1, Math.ceil(cy + radius));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const weight = brushWeight(Math.sqrt(d2), radius) * strength;
      if (weight <= 0) continue;
      const idx = (y * w + x) * 4;
      // S-curve lift: factor controls stiffness around 128.
      const factor = 1 + weight * 0.6; // max ~1.6x contrast per full-strength dab
      for (let c = 0; c < 3; c++) {
        const v = raster.data[idx + c];
        const lifted = (v - 128) * factor + 128;
        raster.data[idx + c] = Math.max(0, Math.min(255, Math.round(lifted)));
      }
    }
  }
}

/** Sharpen — unsharp mask innan burstans. Reiknar local blur og bætir
 *  við muninn margfaldað með amount. Virkar sem clarity/focus. */
export function sharpenRegion(
  raster: Raster,
  cx: number,
  cy: number,
  radius: number,
  strength: number,
): void {
  const w = raster.width;
  const h = raster.height;
  const r2 = radius * radius;
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(w - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(h - 1, Math.ceil(cy + radius));
  // Afrit af svæðinu áður en við ritum — annars les blur frá nýju gildunum.
  const src = raster.data.slice(y0 * w * 4, (y1 + 1) * w * 4);
  const srcOffset = y0 * w * 4;
  const amount = 1.2; // max multiplier per full-strength dab
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const weight = brushWeight(Math.sqrt(d2), radius) * strength;
      if (weight <= 0) continue;
      // 3x3 blur av source
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let n = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const nx = x + kx;
          const ny = y + ky;
          if (nx < 0 || nx >= w || ny < y0 || ny > y1) continue;
          const i = (ny * w + nx) * 4 - srcOffset;
          sumR += src[i];
          sumG += src[i + 1];
          sumB += src[i + 2];
          n++;
        }
      }
      if (n === 0) continue;
      const blurR = sumR / n;
      const blurG = sumG / n;
      const blurB = sumB / n;
      const idx = (y * w + x) * 4;
      const i0 = idx - srcOffset;
      for (let c = 0; c < 3; c++) {
        const orig = src[i0 + c];
        const blur = c === 0 ? blurR : c === 1 ? blurG : blurB;
        const sharpened = orig + (orig - blur) * amount * weight;
        raster.data[idx + c] = Math.max(0, Math.min(255, Math.round(sharpened)));
      }
    }
  }
}

export function applyRetouch(
  raster: Raster,
  cx: number,
  cy: number,
  radius: number,
  strength: number,
  mode: RetouchMode,
  clone?: { srcX: number; srcY: number },
): void {
  switch (mode) {
    case "smooth":
      smoothRegion(raster, cx, cy, radius, strength);
      break;
    case "lighten":
      lightenRegion(raster, cx, cy, radius, strength);
      break;
    case "darken":
      darkenRegion(raster, cx, cy, radius, strength);
      break;
    case "heal":
      healRegion(raster, cx, cy, radius, strength);
      break;
    case "clone":
      if (clone) cloneRegion(raster, cx, cy, clone.srcX, clone.srcY, radius, strength);
      break;
    case "contrast":
      contrastRegion(raster, cx, cy, radius, strength);
      break;
    case "sharpen":
      sharpenRegion(raster, cx, cy, radius, strength);
      break;
  }
}

// Whole-image aðgerðir — nota sömu stærðfræði og brush-ar en á allri myndinni
// í einni pösun. Kallandinn verður að pushUndo áður.

export function adjustBrightnessGlobal(raster: Raster, delta: number): void {
  // delta -100..+100
  const amount = Math.max(-100, Math.min(100, delta));
  const data = raster.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.max(0, Math.min(255, data[i] + amount));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + amount));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + amount));
  }
}

export function adjustContrastGlobal(raster: Raster, factor: number): void {
  // factor -1..+1 (0 = no change, +1 = ~2x contrast, -1 = flat)
  const f = Math.max(-1, Math.min(1, factor));
  const mult = 1 + f;
  const data = raster.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.max(0, Math.min(255, (data[i] - 128) * mult + 128));
    data[i + 1] = Math.max(0, Math.min(255, (data[i + 1] - 128) * mult + 128));
    data[i + 2] = Math.max(0, Math.min(255, (data[i + 2] - 128) * mult + 128));
  }
}

export function sharpenGlobal(raster: Raster, amount: number): void {
  // amount 0..3 (0 = no change)
  const amt = Math.max(0, Math.min(3, amount));
  if (amt <= 0) return;
  const w = raster.width;
  const h = raster.height;
  const src = new Uint8ClampedArray(raster.data);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      // 3x3 blur
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const i = ((y + ky) * w + (x + kx)) * 4;
          sumR += src[i];
          sumG += src[i + 1];
          sumB += src[i + 2];
        }
      }
      const blurR = sumR / 9;
      const blurG = sumG / 9;
      const blurB = sumB / 9;
      raster.data[idx] = Math.max(0, Math.min(255, src[idx] + (src[idx] - blurR) * amt));
      raster.data[idx + 1] = Math.max(0, Math.min(255, src[idx + 1] + (src[idx + 1] - blurG) * amt));
      raster.data[idx + 2] = Math.max(0, Math.min(255, src[idx + 2] + (src[idx + 2] - blurB) * amt));
    }
  }
}
