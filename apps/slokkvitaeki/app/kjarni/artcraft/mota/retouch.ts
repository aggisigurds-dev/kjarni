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

// --- Skin tone adjustments ----------------------------------------------
// Áætlum "skin likelihood" á hverju pixli (0..1): hvað hue er nálægt
// húðlit (hue ~0-40°), saturation hóflegur og birta ekki of lág. Þessi
// weight er svo notaður til að blanda hue/sat shifti aðeins á húðsvæðum
// — bakgrunnur og föt breytast ekki (eða mjög lítið).

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60)       { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  return [
    Math.max(0, Math.min(255, (r + m) * 255)),
    Math.max(0, Math.min(255, (g + m) * 255)),
    Math.max(0, Math.min(255, (b + m) * 255)),
  ];
}

/** Skin likelihood 0..1 á pixli — hátt þegar hue er milli ~5° og 35°, sat
 *  hóflegur, light ekki of dökk eða of björt. */
function skinWeight(h: number, s: number, l: number): number {
  const hueDist = Math.min(Math.abs(h - 20), Math.abs(h - 20 + 360), Math.abs(h - 20 - 360));
  const hueScore = Math.max(0, 1 - hueDist / 30);
  const satScore = Math.max(0, Math.min(1, s * 2.5)) * (s > 0.6 ? 1 - (s - 0.6) * 1.5 : 1);
  const lightScore = l > 0.15 && l < 0.9 ? 1 - Math.abs(l - 0.6) * 1.4 : 0;
  return Math.max(0, Math.min(1, hueScore * Math.max(0.1, satScore) * Math.max(0, lightScore)));
}

/** Shift skin tone — hueDeg -30..+30 (hlýrra/kaldara), satDelta -0.5..+0.5
 *  (mettaðra/fölara), lightDelta -0.2..+0.2 (bjartara/dekkra). Áhrif eru
 *  weighted af skinWeight svo bakgrunnur og föt breytast lítið. */
export function shiftSkinTone(
  raster: Raster,
  hueDeg: number,
  satDelta: number,
  lightDelta: number,
): void {
  const data = raster.data;
  for (let i = 0; i < data.length; i += 4) {
    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    const w = skinWeight(h, s, l);
    if (w <= 0.02) continue;
    const nh = h + hueDeg * w;
    const ns = Math.max(0, Math.min(1, s + satDelta * w));
    const nl = Math.max(0, Math.min(1, l + lightDelta * w));
    const [r, g, b] = hslToRgb(nh, ns, nl);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}

/** Equalize skin tone — minnkar fráviksbreytingar í hue meðal húðpixla.
 *  Reiknar meðal-hue meðal pixla sem hafa skinWeight > 0.3 og togar þá
 *  nær því meðaltali (strength 0..1). Gott á roða-bletti, misliti og
 *  mislýstar húð-svæði. */
export function equalizeSkinTone(raster: Raster, strength: number): void {
  const data = raster.data;
  const amt = Math.max(0, Math.min(1, strength));
  // Fyrri pössun: safnið meðaltalið (hue + sat) með vectorial sum svo
  // það meðhöndlar wrap-around (hue 350° og 10° báru hliðarmeðaltal ~0°).
  let sumX = 0, sumY = 0, sumS = 0, wtot = 0;
  for (let i = 0; i < data.length; i += 4) {
    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    const w = skinWeight(h, s, l);
    if (w < 0.3) continue;
    const rad = (h * Math.PI) / 180;
    sumX += Math.cos(rad) * w;
    sumY += Math.sin(rad) * w;
    sumS += s * w;
    wtot += w;
  }
  if (wtot < 1) return;
  const avgHue = ((Math.atan2(sumY, sumX) * 180) / Math.PI + 360) % 360;
  const avgSat = sumS / wtot;
  // Önnur pössun: togum hue+sat skinpixla að meðaltali.
  for (let i = 0; i < data.length; i += 4) {
    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    const w = skinWeight(h, s, l);
    if (w < 0.1) continue;
    // Shortest-path hue distance
    let dh = avgHue - h;
    if (dh > 180) dh -= 360;
    if (dh < -180) dh += 360;
    const nh = h + dh * amt * w;
    const ns = s + (avgSat - s) * amt * w * 0.7;
    const [r, g, b] = hslToRgb(nh, Math.max(0, Math.min(1, ns)), l);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}

/** Stretch raster lóðrétt um factor — >1 teygjir upp (allur hærri), <1
 *  þjappar (lágvaxinn). Sýnishorn með bilinear í kringum lóðrétta miðju. */
export function stretchHeight(raster: Raster, factor: number): void {
  const f = Math.max(0.6, Math.min(1.6, factor));
  if (Math.abs(f - 1) < 0.001) return;
  const w = raster.width;
  const h = raster.height;
  const cy = (h - 1) / 2;
  const src = new Uint8ClampedArray(raster.data);
  for (let y = 0; y < h; y++) {
    const sy = cy + (y - cy) / f;
    const y0 = Math.max(0, Math.min(h - 1, Math.floor(sy)));
    const y1 = Math.max(0, Math.min(h - 1, Math.ceil(sy)));
    const fy = sy - y0;
    for (let x = 0; x < w; x++) {
      const i0 = (y0 * w + x) * 4;
      const i1 = (y1 * w + x) * 4;
      const idx = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) {
        raster.data[idx + c] = src[i0 + c] * (1 - fy) + src[i1 + c] * fy;
      }
    }
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
