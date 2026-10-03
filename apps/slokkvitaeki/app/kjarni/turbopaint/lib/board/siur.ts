// Síur á skannaða teikningu (Agnar 03.10.2026: „að sýna bara veggi og ákveðnar merkingar").
//
// TIF/skannað PDF er ljósmynd af blaði — engin lög, engar tegundir. Það sem má lesa úr dílunum:
//   • VEGGIR: þykkt dökkt blek. Fundið með OPNUN (rof + útþensla) á blekgrímunni: allt þynnra en
//     veggþykktin hverfur (málsetningar, texti, innréttingar), fylltir veggir standa. Veggir teiknaðir
//     sem tvær þunnar línur (holir) hverfa líka — það er takmörkun dílagreiningar, ekki villa.
//   • ÞUNNT BLEK: blek sem er EKKI veggur (texti, málsetningar, hurðir, innréttingar).
//   • RAUTT: ÚT-örvar, flóttaleiðir. • BLEIKT: skýjalínur breytinga, EI-merkingar teiknara.
// Blekreglan er sú sama og í „Hreinsa" (strip.ts): nógu dökkt OG nálægt gráskala.

export type SiaFlokkur = "veggir" | "thunnt" | "rautt" | "bleikt";

export interface SiaVal {
  veggir: boolean;
  thunnt: boolean;
  rautt: boolean;
  bleikt: boolean;
  /** 0–1: hærra heldur fleiri daufum línum (sama og Næmi í Hreinsa). */
  naemi: number;
  /** Lágmarksþykkt veggjar í dílum myndarinnar (sjá sjalfgefinVeggthykkt). */
  veggthykkt: number;
}

/** Það sem glugginn velur — veggþykkt sem margfaldari af sjálfvirka gildinu, af því dílastærð fer eftir upplausn. */
export interface SiaUrGlugga {
  veggir: boolean;
  thunnt: boolean;
  rautt: boolean;
  bleikt: boolean;
  naemi: number;
  veggStudull: number;
}

export const SJALFGEFIN_SIA: SiaVal = {
  veggir: true,
  thunnt: true,
  rautt: false,
  bleikt: false,
  naemi: 0.62,
  veggthykkt: 7,
};

/** Veggþykkt sem hentar myndinni: ~7 px á 7.500 px breiðri A1-skönnun (≈0,8 mm á blaði). */
export function sjalfgefinVeggthykkt(breidd: number): number {
  return Math.max(3, Math.round((7 * Math.max(breidd, 1)) / 7500));
}

const BLEK = 1;
const RAUTT = 2;
const BLEIKT = 3;

/** Flokkar hvern díl: 0 bakgrunnur · 1 blek · 2 rautt · 3 bleikt. */
export function flokkaDila(rgba: Uint8ClampedArray, naemi: number): Uint8Array {
  const n = rgba.length >> 2;
  const out = new Uint8Array(n);
  const cut = naemi * 255;
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2], a = rgba[i + 3];
    if (a <= 60) continue;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (sat < 0.45) {
      if (lum < cut) out[p] = BLEK;
      continue;
    }
    if (max < 70) continue;                  // of dökkt til að lesa lit — mettun er þá suð
    const d = max - min;
    let h: number;                           // litblær í gráðum
    if (max === r) h = (60 * ((g - b) / d) + 360) % 360;
    else if (max === g) h = 60 * ((b - r) / d) + 120;
    else h = 60 * ((r - g) / d) + 240;
    if (h >= 345 || h < 22) out[p] = RAUTT;
    else if (h >= 275 && h < 345) out[p] = BLEIKT;
  }
  return out;
}

/** Rof eða útþensla í eina átt með rennandi glugga (O(n) óháð k). */
function rennaLina(src: Uint8Array, dst: Uint8Array, w: number, h: number, k: number, lodrett: boolean, rof: boolean) {
  const r = k >> 1;
  const lengd = lodrett ? h : w;
  const fjoldi = lodrett ? w : h;
  const skref = lodrett ? w : 1;               // fjarlægð milli nágranna í línunni
  for (let j = 0; j < fjoldi; j++) {
    const byrjun = lodrett ? j : j * w;
    let summa = 0;
    // gluggi [t-r, t+r]; utan myndar telst 0 (rof sker á brúninni, útþensla gerir það ekki)
    for (let t = 0; t <= r && t < lengd; t++) summa += src[byrjun + t * skref];
    for (let t = 0; t < lengd; t++) {
      dst[byrjun + t * skref] = rof ? (summa === k ? 1 : 0) : (summa > 0 ? 1 : 0);
      const ut = t - r, inn = t + r + 1;
      if (ut >= 0) summa -= src[byrjun + ut * skref];
      if (inn < lengd) summa += src[byrjun + inn * skref];
    }
  }
}

/** Opnun með ferningi k×k: heldur aðeins blekklessum sem eru a.m.k. k dílar á þykkt. */
export function opna(maski: Uint8Array, w: number, h: number, k: number): Uint8Array {
  const kk = Math.max(1, Math.round(k)) | 1;   // oddatala svo glugginn sé miðjaður
  if (kk <= 1) return maski.slice();
  const a = new Uint8Array(maski.length), b = new Uint8Array(maski.length);
  rennaLina(maski, a, w, h, kk, false, true);
  rennaLina(a, b, w, h, kk, true, true);
  rennaLina(b, a, w, h, kk, false, false);
  rennaLina(a, b, w, h, kk, true, false);
  return b;
}

/** Litakort síunnar: hver díll sem sést fær sinn upprunalega lit (veggir svartir), annað hvítt. */
export function siaRgba(rgba: Uint8ClampedArray, w: number, h: number, val: SiaVal): Uint8ClampedArray {
  const flokkar = flokkaDila(rgba, val.naemi);
  const blek = new Uint8Array(flokkar.length);
  for (let p = 0; p < flokkar.length; p++) blek[p] = flokkar[p] === BLEK ? 1 : 0;
  const veggir = val.veggir || val.thunnt ? opna(blek, w, h, val.veggthykkt) : null;
  const ut = new Uint8ClampedArray(rgba.length);
  for (let p = 0, i = 0; p < flokkar.length; p++, i += 4) {
    const f = flokkar[p];
    let synd = false, svart = false;
    if (f === BLEK) {
      const erVeggur = veggir ? veggir[p] === 1 : false;
      if (erVeggur && val.veggir) { synd = true; svart = true; }
      else if (!erVeggur && val.thunnt) { synd = true; svart = true; }   // svart blek á hvítu, eins og Hreinsa
    } else if (f === RAUTT) synd = val.rautt;
    else if (f === BLEIKT) synd = val.bleikt;
    if (synd && !svart) { ut[i] = rgba[i]; ut[i + 1] = rgba[i + 1]; ut[i + 2] = rgba[i + 2]; }
    else if (!synd) { ut[i] = 255; ut[i + 1] = 255; ut[i + 2] = 255; }
    ut[i + 3] = 255;
  }
  return ut;
}

/** Hversu margir dílar lenda í hverjum flokki — svo glugginn geti sagt „ekkert rautt fannst". */
export function teljaFlokka(rgba: Uint8ClampedArray, w: number, h: number, val: SiaVal): Record<SiaFlokkur, number> {
  const flokkar = flokkaDila(rgba, val.naemi);
  const blek = new Uint8Array(flokkar.length);
  let rautt = 0, bleikt = 0, blekAllt = 0;
  for (let p = 0; p < flokkar.length; p++) {
    if (flokkar[p] === BLEK) { blek[p] = 1; blekAllt++; }
    else if (flokkar[p] === RAUTT) rautt++;
    else if (flokkar[p] === BLEIKT) bleikt++;
  }
  const v = opna(blek, w, h, val.veggthykkt);
  let veggir = 0;
  for (let p = 0; p < v.length; p++) veggir += v[p];
  return { veggir, thunnt: blekAllt - veggir, rautt, bleikt };
}
