// Veggjalag úr skannaðri teikningu (Agnar 03.10.2026: „greina þessa veggi sem eru þá raun tvöfaldar línur lokaðar …
// nota það sem sér layer og sjá bara Veggja layer sem yrði þá mun smærri skrá").
//
// HOLUR VEGGUR = lokað, mjótt hvítt svæði milli tveggja lína (Skútuvogur 4). Hvít svæði teikningarinnar eru merkt;
// svæði sem er mjótt ALLS STAÐAR (enginn díll lengra frá bleki en hálf hámarksþykkt veggjar) og nógu langt er veggur.
// Herbergi eru breið (hafa „kjarna"), stafahol („o", „e") eru lítil og opnar málsetningarlínur loka engu — þau detta út.
// FYLLTUR VEGGUR = þykkt blek, fundið með opnun eins og í síunum. Útkoman er listi af rétthyrningum (vektorlag, KB ekki MB).
//
// Stórar myndir eru greindar í FULLRI upplausn í 10 láréttum beltum með skörun (Agnar: „10 umferðir niður á við").

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
  /** Fjöldi belta (sjálfgefið 10 yfir 12 MP, annars 1). */
  belti?: number;
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
  /** Veggjamaskinn sjálfur (1 = veggur), w×h — grunnur miðlínanna. */
  maski: Uint8Array;
}

/** Sjálfgefnar stillingar miðað við breidd myndarinnar (A1 í ~7.500 px ≈ 8,9 díll/mm á blaði). */
export function sjalfgefnarVeggjaStillingar(breidd: number): VeggjaStillingar {
  const k = Math.max(breidd, 1) / 7500;
  return { naemi: 0.62, hamarksThykkt: Math.round(40 * k), lagmarksLengd: Math.round(60 * k), fylltThykkt: Math.max(3, Math.round(7 * k)) };
}

/** Stillingar eftir kvarða blaðsins: dílar á millimetra pappírs (A1 í 7.500 px ≈ 8,9 díll/mm). */
export function veggjaStillingarFyrirKvarda(dilarAMm: number): VeggjaStillingar {
  return sjalfgefnarVeggjaStillingar(7500 * (dilarAMm / 8.9));
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

/** Greinir eitt belti teikningarinnar (eða alla myndina). `efstBrun`/`nedstBrun`: er efri/neðri brún beltisins raunveruleg
 * brún myndarinnar? Skilar veggjamaska beltisins. */
function veggMaskiBeltis(blek: Uint8Array, sw: number, sh: number, thykkt: number, lengd: number, fylltThykkt: number,
  efstBrun: boolean, nedstBrun: boolean): { veggMaski: Uint8Array; holir: number; fylltir: boolean } {
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
  // BEINT: hlutfall díla hvers svæðis sem liggja í beinum köflum (lárétt eða lóðrétt) sem ná yfir ≥ 70% af stuttu hlið
  // reitsins. Armar L-veggjar og hliðar veggjaramma gera það; salernisseta og spírall brunaslöngu hafa aðeins stuttar
  // sneiðar (Agnar 03.10: „nokkrir veggir kringum baðherbergin hafa horfið" — stuttir L-veggir féllu á þéttleikareglunni).
  const beint = new Int32Array(fjoldi + 1);
  const kafli = (m: number) => Math.max(4, Math.round(0.7 * (Math.min(xmax[m] - xmin[m], ymax[m] - ymin[m]) + 1)));
  for (let y = 0; y < sh; y++) {
    const rod = y * sw;
    for (let x = 0; x < sw; ) {
      const m = merki[rod + x];
      if (!m) { x++; continue; }
      const x0 = x;
      while (x < sw && merki[rod + x] === m) x++;
      if (!hefurKjarna[m] && x - x0 >= kafli(m)) beint[m] += x - x0;
    }
  }
  for (let x = 0; x < sw; x++) {
    for (let y = 0; y < sh; ) {
      const m = merki[y * sw + x];
      if (!m) { y++; continue; }
      const y0 = y;
      while (y < sh && merki[y * sw + x] === m) y++;
      if (!hefurKjarna[m] && y - y0 >= kafli(m)) beint[m] += y - y0;
    }
  }
  const veggur = new Uint8Array(fjoldi + 1);
  let holir = 0;
  for (let m = 1; m <= fjoldi; m++) {
    if (hefurKjarna[m]) continue;                                   // herbergi / opið svæði
    const langhlid = Math.max(xmax[m] - xmin[m], ymax[m] - ymin[m]) + 1;
    if (langhlid < lengd) continue;                                 // stafahol, smáreitir
    if (flatarmal[m] < langhlid * 1.5) continue;                    // eins díls rifa (t.d. milli tveggja samliggjandi lína)
    // nær út á brún MYNDARINNAR = ekki lokað. Beltaskil eru ekki brún: veggur sem heldur áfram í næsta belti er lokaður þar.
    if (xmin[m] === 0 || xmax[m] === sw - 1 || (efstBrun && ymin[m] === 0) || (nedstBrun && ymax[m] === sh - 1)) continue;
    // Innréttingar (salerni, vaskar, borð): lokaðar og mjóar en ÞÉTTAR — hvorki bein ræma (stutta hliðin breiðari en
    // veggur) né nógu langar til að vera veggjahorn. Veggur er annaðhvort bein ræma eða langur (Agnar 03.10: „baðherbergin
    // virðast fyllast sem veggur … og kringum vaskana").
    const bw = xmax[m] - xmin[m] + 1, bh = ymax[m] - ymin[m] + 1;
    if (Math.min(bw, bh) > thykkt * 1.2 && Math.max(bw, bh) < lengd * 4 && beint[m] < flatarmal[m] * 0.6) continue;
    veggur[m] = 1;
    holir++;
  }
  let veggMaski: Uint8Array = new Uint8Array(sw * sh);
  for (let p = 0; p < merki.length; p++) if (veggur[merki[p]]) veggMaski[p] = 1;
  // línurnar sem afmarka holrýmið teljast með veggnum
  veggMaski = thenja(veggMaski, sw, sh, 5);           // 3 + 1 díll sem blekið var þétt um

  // 2) fylltir veggir: þykkt blek
  const fyllt = opna(blek, sw, sh, Math.max(3, fylltThykkt));
  let fylltir = false;
  for (let p = 0; p < fyllt.length; p++) if (fyllt[p]) { veggMaski[p] = 1; fylltir = true; }

  return { veggMaski, holir, fylltir };
}

export function finnaVeggi(rgba: Uint8ClampedArray, w: number, h: number, st: VeggjaStillingar): VeggjaNidurstada {
  const flokkar = flokkaDila(rgba, st.naemi);
  const blek = new Uint8Array(flokkar.length);
  for (let p = 0; p < flokkar.length; p++) blek[p] = flokkar[p] === 1 ? 1 : 0;
  return finnaVeggiUrBleki(blek, w, h, st);
}

/** Sama greining á tilbúnum blekmaska (1 = blek) — t.d. aðeins veggjaflokkur vigur-PDF teiknaður á auðan grunn. */
export function finnaVeggiUrBleki(blek: Uint8Array, w: number, h: number, st: VeggjaStillingar): VeggjaNidurstada {
  const thykkt = Math.max(2, st.hamarksThykkt);
  const lengd = Math.max(4, st.lagmarksLengd);

  // Agnar 03.10: „skoða vel zoomað inn … bara 10 prósent af hæðinni í einu, 10 umferðir niður á við". Greint í FULLRI
  // upplausn í beltum (áður minnkað um helming — þunnar línur runnu saman og veggir slitnuðu). Skörunin er meiri en
  // lágmarkslengd veggjar, svo bútur sem nær inn í kjarna beltis er alltaf nógu langur innan þess.
  const fjoldiBelta = st.belti ?? (w * h > 12_000_000 ? 10 : 1);
  const kjarnaHaed = Math.ceil(h / fjoldiBelta);
  const skorun = Math.ceil(lengd + thykkt * 2);
  const veggMaski = new Uint8Array(w * h);
  let holir = 0, fylltir = false;
  for (let b = 0; b < fjoldiBelta; b++) {
    const k0 = b * kjarnaHaed, k1 = Math.min(h, k0 + kjarnaHaed);
    if (k0 >= k1) break;
    const y0 = Math.max(0, k0 - skorun), y1 = Math.min(h, k1 + skorun);
    const belti = blek.subarray(y0 * w, y1 * w);
    const r = veggMaskiBeltis(belti, w, y1 - y0, thykkt, lengd, st.fylltThykkt, y0 === 0, y1 === h);
    veggMaski.set(r.veggMaski.subarray((k0 - y0) * w, (k1 - y0) * w), k0 * w);
    holir += r.holir;
    fylltir = fylltir || r.fylltir;
  }

  // rétthyrningar í fullri upplausn; smábútar burt
  const lagmark = Math.max(2, Math.round(lengd * 0.25));
  const kassar = rettHyrningar(veggMaski, w, h).filter((k) => Math.max(k.w, k.h) >= lagmark);
  return { kassar, holir, fylltir, maski: veggMaski };
}
