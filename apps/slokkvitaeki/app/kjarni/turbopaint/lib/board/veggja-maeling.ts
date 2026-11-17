// MÆLING VEGGJAGREININGAR (Powerplan lota 5, 17.11.2026 — Agnar: „nær ekki að finna alla veggi í floorplani, nema
// svona 40%"). Ber greinda veggi saman við SANNLEIK (handmerktar/leiðréttar miðlínur) og gefur tvær tölur:
//
//   HITTNI     = hlutfall af lengd raunveggja (veggur / EI) sem greindur veggur liggur á  (recall)
//   NÁKVÆMNI   = hlutfall af lengd greindra veggja sem liggur á línu í sannleikanum       (precision)
//
// Hvort tveggja er LENGDARVEGIÐ: línurnar eru sýndar á 5 cm fresti. Sýni telst „á" línu ef næsta lína er innan
// `vikM` metra (+ hálf þykkt sannleikslínunnar — leiðréttingar Agnars liggja stundum á innri brún útveggjar) og
// stefnan munar ≤ `hornGr` gráðum. Nákvæmnin ber saman við ALLAR sannleikslínur (gler, hurð, svalir, stigi líka):
// greindur veggur á gluggalínu er ekki rusl. Hittnin telur aðeins heila veggi (veggur, ei60, ei30) — gluggi eða hurð
// sem finnst ekki er ekki „týndur veggur".
//
// Talning eftir veggjum fylgir með: raunveggur telst FUNDINN ef ≥ `fundinnHlutfall` af lengd hans er hulin.
// Hreinar föll — engin DOM, ekkert net. Prófað í veggja-maeling.test.ts; á raunteikningum: tools/veggja-maeling.ts.

import { finnaHurdir } from "./hurdagreining";
import { hreinsaVeggi, husUtlina, SJALFGEFIN_VIKMORK, utanHuss, type HLina, type HreinsunNidurstada, type Vikmork } from "./veggja-hreinsun";

export type MaelLinaInn = { p: ReadonlyArray<number>; t?: number; tegund?: string };

export interface MaelStillingar {
  /** dílar á metra í hnitakerfi línanna */
  dpm: number;
  /** vik í metrum (sjálfgefið 0,25 m) */
  vikM?: number;
  /** hámarks stefnumunur í gráðum (sjálfgefið 20°) */
  hornGr?: number;
  /** aðeins þetta svæði er mælt (dílar) — sýni utan þess eru hunsuð */
  svaedi?: { x: number; y: number; w: number; h: number } | null;
  /** raunveggur telst fundinn ef þetta hlutfall af lengd hans er hulið (sjálfgefið 0,6) */
  fundinnHlutfall?: number;
}

export interface MaelNidurstada {
  hittni: number;
  nakvaemni: number;
  /** raunveggir (heilir) taldir: fundnir / allir */
  veggirFundnir: number;
  veggirAllir: number;
  /** lengdir í metrum */
  raunM: number;
  greintM: number;
  /** týndir raunveggir (vísar í sannleikann) og hlutfall huliðs á hverjum */
  tyndir: { i: number; hulid: number; lengdM: number }[];
  /** greindar línur sem eru að mestu rangar (vísar í greininguna) */
  rangar: { i: number; rett: number; lengdM: number }[];
}

const HEILIR = new Set(["veggur", "ei60", "ei30"]);
/** Greindar línur sem teljast veggir (gler líka — það er hluti veggjarins í 3D). Hurðarlínur greiningar ekki taldar. */
const GREINDIR_VEGGIR = new Set(["veggur", "ei60", "ei30", "gler"]);

type Butur = { ax: number; ay: number; bx: number; by: number; ux: number; uy: number; L: number; t: number; i: number };

function butar(linur: ReadonlyArray<MaelLinaInn>, sia: (l: MaelLinaInn) => boolean): Butur[] {
  const ut: Butur[] = [];
  linur.forEach((l, i) => {
    if (!sia(l)) return;
    for (let k = 2; k + 1 < l.p.length; k += 2) {
      const ax = l.p[k - 2], ay = l.p[k - 1], bx = l.p[k], by = l.p[k + 1];
      const L = Math.hypot(bx - ax, by - ay);
      if (!(L > 0)) continue;
      ut.push({ ax, ay, bx, by, ux: (bx - ax) / L, uy: (by - ay) / L, L, t: l.t ?? 0, i });
    }
  });
  return ut;
}

/** Rist yfir bútana svo nálægðarleit sé hröð. */
function rist(B: Butur[], reitur: number) {
  const m = new Map<string, number[]>();
  B.forEach((b, j) => {
    const x0 = Math.floor((Math.min(b.ax, b.bx) - reitur) / reitur), x1 = Math.floor((Math.max(b.ax, b.bx) + reitur) / reitur);
    const y0 = Math.floor((Math.min(b.ay, b.by) - reitur) / reitur), y1 = Math.floor((Math.max(b.ay, b.by) + reitur) / reitur);
    for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
      const k = gx + "," + gy;
      const a = m.get(k);
      if (a) a.push(j);
      else m.set(k, [j]);
    }
  });
  return (x: number, y: number) => m.get(Math.floor(x / reitur) + "," + Math.floor(y / reitur)) ?? [];
}

function fjarlaegd(b: Butur, x: number, y: number) {
  const s = Math.max(0, Math.min(b.L, (x - b.ax) * b.ux + (y - b.ay) * b.uy));
  return Math.hypot(b.ax + b.ux * s - x, b.ay + b.uy * s - y);
}

/** Hlutfall sýna á hverri línu í `fra` sem liggja á einhverri línu í `vid`. */
function hula(fra: Butur[], vid: Butur[], dpm: number, vikPx: (v: Butur) => number, cosMin: number, inni: (x: number, y: number) => boolean) {
  const skref = Math.max(0.5, dpm * 0.05);
  const maxVik = vid.reduce((m, v) => Math.max(m, vikPx(v)), 1);
  const leit = rist(vid, Math.max(4, maxVik * 2));
  const perLina = new Map<number, { alls: number; hulid: number }>();
  let alls = 0, hulid = 0;
  for (const b of fra) {
    const n = Math.max(1, Math.round(b.L / skref));
    for (let k = 0; k < n; k++) {
      const s = (k + 0.5) * (b.L / n);
      const x = b.ax + b.ux * s, y = b.ay + b.uy * s;
      if (!inni(x, y)) continue;
      let a = false;
      for (const j of leit(x, y)) {
        const v = vid[j];
        if (Math.abs(v.ux * b.ux + v.uy * b.uy) < cosMin) continue;
        if (fjarlaegd(v, x, y) <= vikPx(v)) {
          a = true;
          break;
        }
      }
      alls++;
      if (a) hulid++;
      const p = perLina.get(b.i) ?? { alls: 0, hulid: 0 };
      p.alls++;
      if (a) p.hulid++;
      perLina.set(b.i, p);
    }
  }
  return { alls, hulid, perLina, skref };
}

export function maelaVeggi(sannleikur: ReadonlyArray<MaelLinaInn>, greint: ReadonlyArray<MaelLinaInn>, o: MaelStillingar): MaelNidurstada {
  const dpm = o.dpm;
  const vik = (o.vikM ?? 0.25) * dpm;
  const cosMin = Math.cos(((o.hornGr ?? 20) * Math.PI) / 180);
  const sv = o.svaedi;
  const inni = sv ? (x: number, y: number) => x >= sv.x && y >= sv.y && x <= sv.x + sv.w && y <= sv.y + sv.h : () => true;
  const teg = (l: MaelLinaInn) => l.tegund ?? "veggur";
  const raunHeilir = butar(sannleikur, (l) => HEILIR.has(teg(l)));
  const raunAllir = butar(sannleikur, () => true);
  const greindir = butar(greint, (l) => GREINDIR_VEGGIR.has(teg(l)));
  // hittni: raunveggir hulir af greindum (vik + hálf þykkt greinda veggjarins)
  const h = hula(raunHeilir, greindir, dpm, (v) => vik + v.t / 2, cosMin, inni);
  // nákvæmni: greindir veggir á sannleikslínu (vik + hálf þykkt sannleikslínunnar)
  const n = hula(greindir, raunAllir, dpm, (v) => vik + v.t / 2, cosMin, inni);
  const fh = o.fundinnHlutfall ?? 0.6;
  let fundnir = 0;
  const tyndir: MaelNidurstada["tyndir"] = [];
  for (const [i, p] of h.perLina) {
    const r = p.hulid / p.alls;
    if (r >= fh) fundnir++;
    else tyndir.push({ i, hulid: Math.round(r * 100) / 100, lengdM: Math.round(((p.alls * h.skref) / dpm) * 10) / 10 });
  }
  const rangar: MaelNidurstada["rangar"] = [];
  for (const [i, p] of n.perLina) {
    const r = p.hulid / p.alls;
    if (r < 0.5) rangar.push({ i, rett: Math.round(r * 100) / 100, lengdM: Math.round(((p.alls * n.skref) / dpm) * 10) / 10 });
  }
  tyndir.sort((a, b) => b.lengdM - a.lengdM);
  rangar.sort((a, b) => b.lengdM - a.lengdM);
  return {
    hittni: h.alls ? h.hulid / h.alls : 0,
    nakvaemni: n.alls ? n.hulid / n.alls : 0,
    veggirFundnir: fundnir,
    veggirAllir: h.perLina.size,
    raunM: Math.round(((h.alls * h.skref) / dpm) * 10) / 10,
    greintM: Math.round(((n.alls * n.skref) / dpm) * 10) / 10,
    tyndir,
    rangar,
  };
}

/** Hreinsunarhluti sjálfvirka verkferlisins fyrir SKÖNNUN (sjalfvirkt.ts vinnaLinur: d) hreinsun → e) hurðir → utan
 * húss), án myndprófanna (hurðabogi / lína í bili þurfa myndina) og án fastra lína Agnars. Skilar veggjum + gleri. */
export function hreinsunSkonnunar(
  hrar: HLina[],
  dpm: number,
  vik: Vikmork = SJALFGEFIN_VIKMORK,
  o: { anUtan?: boolean } = {}
): { linur: HLina[]; fjarlaegdar: HreinsunNidurstada["fjarlaegdar"]; talning: HreinsunNidurstada["talning"] } {
  const erV = (l: HLina) => HEILIR.has(l.tegund ?? "veggur");
  const h = hreinsaVeggi(hrar, [], dpm, { ...vik, stakurM: Math.max(vik.stakurM, vik.stakurSkonnunM) });
  const hreinar = h.linur;
  const d = finnaHurdir(hreinar.filter(erV), hreinar.filter((l) => !erV(l)), dpm, { vik: vik.hurd });
  if (o.anUtan) return { linur: [...hreinar, ...d.gler], fjarlaegdar: h.fjarlaegdar, talning: h.talning };
  const u = husUtlina([...hreinar, ...d.hurdir, ...d.gler], dpm, vik.lokunM, vik.husHlutur, null);
  // opin útlína → engu hent (eins og sjalfvirkt.ts síðan lota 5)
  if (!u.lokud) return { linur: [...hreinar, ...d.gler], fjarlaegdar: h.fjarlaegdar, talning: h.talning };
  const bV = utanHuss(hreinar, u), bG = utanHuss(d.gler, u);
  return { linur: [...hreinar.filter((_, i) => !bV.has(i)), ...d.gler.filter((_, i) => !bG.has(i))], fjarlaegdar: h.fjarlaegdar, talning: h.talning };
}

/** F1 (samræmt meðaltal) — ein tala til að raða tilraunum; ákvörðun tekur samt mið af hvorri fyrir sig. */
export function f1(m: Pick<MaelNidurstada, "hittni" | "nakvaemni">): number {
  return m.hittni + m.nakvaemni > 0 ? (2 * m.hittni * m.nakvaemni) / (m.hittni + m.nakvaemni) : 0;
}
