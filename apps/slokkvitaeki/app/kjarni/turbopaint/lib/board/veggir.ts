// Veggjalag úr skannaðri teikningu (Agnar 03.10.2026: „greina þessa veggi sem eru þá raun tvöfaldar línur lokaðar …
// nota það sem sér layer og sjá bara Veggja layer sem yrði þá mun smærri skrá").
//
// HOLUR VEGGUR = lokað, mjótt hvítt svæði milli tveggja lína (Skútuvogur 4). Hvít svæði teikningarinnar eru merkt;
// svæði sem er mjótt ALLS STAÐAR (enginn díll lengra frá bleki en hálf hámarksþykkt veggjar) og nógu langt er veggur.
// Herbergi eru breið (hafa „kjarna"), stafahol („o", „e") eru lítil og opnar málsetningarlínur loka engu — þau detta út.
// FYLLTUR VEGGUR = þykkt blek, fundið með opnun eins og í síunum. Útkoman er listi af rétthyrningum (vektorlag, KB ekki MB).
//
// Greint í hálfri upplausn á stórum myndum (max-pool á blekinu svo þunnar línur rofni ekki); hnitin skalast til baka.

import { flokkaDila, opna, rofa, thenja } from "./siur";

export interface VeggjaStillingar {
  /** Sama næmi og í síunum (0–1). */
  naemi: number;
  /** Mesta þykkt holrýmis veggjar, dílar í fullri upplausn. */
  hamarksThykkt: number;
  /** Styttri veggbútar en þetta (dílar í fullri upplausn) eru hunsaðir. */
  lagmarksLengd: number;
  /** Minnsta þykkt fyllts veggjar (dílar í fullri upplausn). */
  fylltThykkt: number;
}

export interface VeggKassi {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface VeggjaNidurstada {
  kassar: VeggKassi[];
  holir: number;          // fjöldi holra veggsvæða sem fundust
  fylltir: boolean;       // fannst fylltur veggur
}

/** Sjálfgefnar stillingar miðað við breidd myndarinnar (A1 í ~7.500 px ≈ 8,9 díll/mm á blaði). */
export function sjalfgefnarVeggjaStillingar(breidd: number): VeggjaStillingar {
  const k = Math.max(breidd, 1) / 7500;
  return { naemi: 0.62, hamarksThykkt: Math.round(40 * k), lagmarksLengd: Math.round(60 * k), fylltThykkt: Math.max(3, Math.round(7 * k)) };
}

/** Max-pool: blekdíll í minnkaðri mynd ef einhver díll í f×f reitnum er blek — þunnar línur rofna ekki. */
function minnkaBlek(blek: Uint8Array, w: number, h: number, f: number) {
  const sw = Math.ceil(w / f), sh = Math.ceil(h / f);
  const ut = new Uint8Array(sw * sh);
  for (let y = 0; y < h; y++) {
    const sy = ((y / f) | 0) * sw, rod = y * w;
    for (let x = 0; x < w; x++) if (blek[rod + x]) ut[sy + ((x / f) | 0)] = 1;
  }
  return { maski: ut, w: sw, h: sh };
}

/** Merkir 4-tengd svæði þar sem maski === 1 (union-find, tvær umferðir). Skilar merkjum (0 = utan) og fjölda. */
export function merkjaSvaedi(maski: Uint8Array, w: number, h: number): { merki: Int32Array; fjoldi: number } {
  const merki = new Int32Array(w * h);
  let foreldri = new Int32Array(1024);
  let naesta = 1;
  const rot = (a: number) => { while (foreldri[a] !== a) { foreldri[a] = foreldri[foreldri[a]]; a = foreldri[a]; } return a; };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!maski[p]) continue;
      const vinstri = x > 0 ? merki[p - 1] : 0;
      const ofan = y > 0 ? merki[p - w] : 0;
      if (!vinstri && !ofan) {
        if (naesta >= foreldri.length) { const n = new Int32Array(foreldri.length * 2); n.set(foreldri); foreldri = n; }
        foreldri[naesta] = naesta;
        merki[p] = naesta++;
      } else if (vinstri && ofan) {
        const a = rot(vinstri), b = rot(ofan);
        merki[p] = Math.min(a, b);
        if (a !== b) foreldri[Math.max(a, b)] = Math.min(a, b);
      } else merki[p] = vinstri || ofan;
    }
  }
  // samþjappa: rót → 1..fjöldi
  const nytt = new Int32Array(naesta);
  let fjoldi = 0;
  for (let i = 1; i < naesta; i++) { const r = rot(i); if (!nytt[r]) nytt[r] = ++fjoldi; nytt[i] = nytt[r]; }
  for (let p = 0; p < merki.length; p++) if (merki[p]) merki[p] = nytt[merki[p]];
  return { merki, fjoldi };
}

/** Brýtur maska niður í rétthyrninga: lóðrétt samfelldar línukeyrslur með sömu brúnum renna saman. */
export function rettHyrningar(maski: Uint8Array, w: number, h: number, vikmork = 1): VeggKassi[] {
  const lokid: VeggKassi[] = [];
  let virkir: VeggKassi[] = [];
  for (let y = 0; y <= h; y++) {
    const keyrslur: [number, number][] = [];
    if (y < h) {
      const rod = y * w;
      for (let x = 0; x < w; ) {
        if (!maski[rod + x]) { x++; continue; }
        const x0 = x;
        while (x < w && maski[rod + x]) x++;
        keyrslur.push([x0, x]);
      }
    }
    const naestu: VeggKassi[] = [];
    const notadir = new Set<VeggKassi>();
    for (const [x0, x1] of keyrslur) {
      const k = virkir.find((v) => !notadir.has(v) && Math.abs(v.x - x0) <= vikmork && Math.abs(v.x + v.w - x1) <= vikmork);
      if (k) { k.h++; notadir.add(k); naestu.push(k); }
      else naestu.push({ x: x0, y, w: x1 - x0, h: 1 });
    }
    for (const v of virkir) if (!notadir.has(v)) lokid.push(v);
    virkir = naestu;
  }
  return lokid;
}

export function finnaVeggi(rgba: Uint8ClampedArray, w: number, h: number, st: VeggjaStillingar): VeggjaNidurstada {
  const flokkar = flokkaDila(rgba, st.naemi);
  const blekFullt = new Uint8Array(flokkar.length);
  for (let p = 0; p < flokkar.length; p++) blekFullt[p] = flokkar[p] === 1 ? 1 : 0;

  const f = w * h > 12_000_000 ? 2 : 1;
  const { maski: blek, w: sw, h: sh } = f > 1 ? minnkaBlek(blekFullt, w, h, f) : { maski: blekFullt, w, h };
  const thykkt = Math.max(2, st.hamarksThykkt / f);
  const lengd = Math.max(4, st.lagmarksLengd / f);

  // 1) holir veggir: hvít svæði sem eru mjó alls staðar. Blekið er þétt um einn díl fyrst: 1–2 díla rifa í línu
  //    (skönnun, slitið strik) lét holið leka inn í herbergið og veggurinn tapaðist (Agnar 03.10: „vantaði smá uppá").
  const thett = thenja(blek, sw, sh, 3);
  const hvitt = new Uint8Array(blek.length);
  for (let p = 0; p < blek.length; p++) hvitt[p] = thett[p] ? 0 : 1;
  const kjarni = rofa(hvitt, sw, sh, Math.ceil(thykkt) | 1);       // díll sem er lengra en ~þykkt/2 frá bleki
  const { merki, fjoldi } = merkjaSvaedi(hvitt, sw, sh);
  const hefurKjarna = new Uint8Array(fjoldi + 1);
  const flatarmal = new Int32Array(fjoldi + 1);
  const xmin = new Int32Array(fjoldi + 1).fill(sw), xmax = new Int32Array(fjoldi + 1).fill(-1);
  const ymin = new Int32Array(fjoldi + 1).fill(sh), ymax = new Int32Array(fjoldi + 1).fill(-1);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const p = y * sw + x, m = merki[p];
    if (!m) continue;
    flatarmal[m]++;
    if (kjarni[p]) hefurKjarna[m] = 1;
    if (x < xmin[m]) xmin[m] = x; if (x > xmax[m]) xmax[m] = x;
    if (y < ymin[m]) ymin[m] = y; if (y > ymax[m]) ymax[m] = y;
  }
  const veggur = new Uint8Array(fjoldi + 1);
  let holir = 0;
  for (let m = 1; m <= fjoldi; m++) {
    if (hefurKjarna[m]) continue;                                   // herbergi / opið svæði
    const langhlid = Math.max(xmax[m] - xmin[m], ymax[m] - ymin[m]) + 1;
    if (langhlid < lengd) continue;                                 // stafahol, smáreitir
    if (flatarmal[m] < langhlid * 1.5) continue;                    // eins díls rifa (t.d. milli tveggja samliggjandi lína)
    if (xmin[m] === 0 || ymin[m] === 0 || xmax[m] === sw - 1 || ymax[m] === sh - 1) continue; // nær út á brún = ekki lokað
    // Innréttingar (salerni, vaskar, borð): lokaðar og mjóar en ÞÉTTAR — hvorki bein ræma (stutta hliðin breiðari en
    // veggur) né nógu langar til að vera veggjahorn. Veggur er annaðhvort bein ræma eða langur (Agnar 03.10: „baðherbergin
    // virðast fyllast sem veggur … og kringum vaskana").
    const bw = xmax[m] - xmin[m] + 1, bh = ymax[m] - ymin[m] + 1;
    if (Math.min(bw, bh) > thykkt * 1.2 && Math.max(bw, bh) < lengd * 4) continue;
    veggur[m] = 1;
    holir++;
  }
  let veggMaski: Uint8Array = new Uint8Array(sw * sh);
  for (let p = 0; p < merki.length; p++) if (veggur[merki[p]]) veggMaski[p] = 1;
  // línurnar sem afmarka holrýmið teljast með veggnum
  veggMaski = thenja(veggMaski, sw, sh, 5);           // 3 + 1 díll sem blekið var þétt um

  // 2) fylltir veggir: þykkt blek
  const fyllt = opna(blek, sw, sh, Math.max(3, st.fylltThykkt / f));
  let fylltir = false;
  for (let p = 0; p < fyllt.length; p++) if (fyllt[p]) { veggMaski[p] = 1; fylltir = true; }

  // 3) rétthyrningar í fullri upplausn; smábútar burt
  const lagmark = Math.max(2, Math.round(lengd * 0.25));
  const kassar = rettHyrningar(veggMaski, sw, sh)
    .filter((k) => Math.max(k.w, k.h) >= lagmark)
    .map((k) => ({ x: k.x * f, y: k.y * f, w: k.w * f, h: k.h * f }));
  return { kassar, holir, fylltir };
}
