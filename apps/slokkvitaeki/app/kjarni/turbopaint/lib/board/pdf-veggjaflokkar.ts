// Veggir úr vigur-PDF með VÖLDUM línuflokkum (veggjaritillinn, Agnar 06.10.2026). CAD-teikning geymir hverja línu
// með sinni þykkt; „Veggir" giskaði áður á EINN flokk (veljaVeggjaflokk) og paraði hann hráan. Hér velur notandinn
// flokkana sjálfur (eins og „📄 Veggir úr PDF" í Teikning-glugganum 383 — einn eða fleiri), sér hvaða línur verða
// veggir, og sama heildarferli og innflutningur hæðar keyrir á þær (veggirUrPdfStrikum: pörun → samlínu-sameining →
// stakir veggfletir → gler úr þunnum pörum → horn), auk stakra lína sem veggja.
//
// Allt í punktum síðunnar (pt) þar til varpað er á borðið.

import { veljaVeggjaflokk, type Strik } from "./pdf-veggir";
import { veggirUrPdfStrikum, type FrumVeggur, type PdfVeggjaStillingar } from "./teikning-veggir";

/** 1 pt á blaði í 1:100 = 0,03528 m. */
const PT_I_METRUM = (0.0254 / 72) * 100;

export interface PdfFlokkur {
  /** Línuþykkt í pt, tveir aukastafir („0.48"). */
  breidd: string;
  /** Fjöldi strika í flokknum. */
  strik: number;
  /** Strik sem eru „löng" (≥ 0,4 % af blaðinu). */
  long: number;
  /** Samanlögð lengd langra strika í metrum (1:100). */
  lengdM: number;
  /** Flokkurinn sem vélin giskar á (veljaVeggjaflokk). */
  tillaga: boolean;
  /** Hárlína (< 0,3 pt): skástrikun, húsgögn, málsetning — sjaldan veggir. */
  harlina: boolean;
}

/** Línuflokkar síðunnar, lengstir fyrst, tillagan merkt. Tómir flokkar sleppa. */
export function flokkaYfirlit(flokkar: Record<string, Strik[]>, bladB: number, bladH: number): PdfFlokkur[] {
  const val = veljaVeggjaflokk(flokkar, bladB, bladH);
  return val.yfirlit
    .filter((y) => y.strik > 0)
    .map((y) => ({
      breidd: y.breidd,
      strik: y.strik,
      long: y.long,
      lengdM: Math.round(y.lengd * PT_I_METRUM),
      tillaga: y.breidd === val.valinn,
      harlina: +y.breidd < 0.3,
    }));
}

export interface SvaediPt {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Strik valinna flokka, valfrjálst aðeins innan svæðis (hússins) og utan hreinsaðra svæða (hlutföll síðunnar). */
export function strikValinna(
  flokkar: Record<string, Strik[]>,
  valdir: readonly string[],
  st: { svaedi?: SvaediPt | null; burt?: { x: number; y: number; w: number; h: number }[]; bladB: number; bladH: number }
): Strik[] {
  const ut: Strik[] = [];
  const sv = st.svaedi;
  const burt = st.burt ?? [];
  for (const l of valdir) {
    for (const s of flokkar[l] ?? []) {
      if (sv && !(s[0] >= sv.x0 && s[2] >= sv.x0 && s[0] <= sv.x1 && s[2] <= sv.x1 && s[1] >= sv.y0 && s[3] >= sv.y0 && s[1] <= sv.y1 && s[3] <= sv.y1)) continue;
      if (burt.length) {
        const mx = (s[0] + s[2]) / 2 / st.bladB, my = (s[1] + s[3]) / 2 / st.bladH;
        if (burt.some((b) => mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h)) continue;
      }
      ut.push(s);
    }
  }
  return ut;
}

/** Einingar sem ferlið keyrir í: ¼ pt (heiltölurúnnun veggjaferlisins verður þá 0,9 mm í 1:100). */
const EIN = 4;

export interface PdfVeggirStillingar {
  gler?: boolean;
  stakar?: boolean;
  stakarLagmarkM?: number;
}

/** Valin strik (pt) → veggir í pt (miðlína + þykkt + tegund), sama ferli og innflutningur hæðar. */
export function veggirUrStrikumPt(strik: Strik[], bladB: number, bladH: number, st: PdfVeggirStillingar = {}): FrumVeggur[] {
  const pv: PdfVeggjaStillingar = { dilarAPunkt: EIN, gler: st.gler !== false, stakar: !!st.stakar };
  if (st.stakarLagmarkM != null) pv.stakarLagmarkM = st.stakarLagmarkM;
  const v = veggirUrPdfStrikum(
    strik.map((s) => [s[0] * EIN, s[1] * EIN, s[2] * EIN, s[3] * EIN]),
    { b: bladB * EIN, h: bladH * EIN },
    pv
  );
  return v.map((w) => {
    const ut: FrumVeggur = { p: w.p.map((n) => n / EIN), t: w.t / EIN };
    if (w.tegund) ut.tegund = w.tegund;
    return ut;
  });
}

/** Síða (pt) → borð: teikningin liggur á (x, y) með breidd/hæð; snúningur ekki studdur. */
export function ptIBord(
  veggir: FrumVeggur[],
  mynd: { x: number; y: number; width: number; height: number },
  bladB: number,
  bladH: number
): FrumVeggur[] {
  const kx = mynd.width / bladB, ky = mynd.height / bladH;
  return veggir.map((v) => {
    const ut: FrumVeggur = { p: v.p.map((n, i) => (i % 2 === 0 ? mynd.x + n * kx : mynd.y + n * ky)), t: v.t * kx };
    if (v.tegund) ut.tegund = v.tegund;
    return ut;
  });
}

/** Skurður hæðarinnar (dílar frummyndar) → svæði í pt síðunnar, með smá svigrúmi. */
export function skurdurIPt(
  sk: { x: number; y: number; w: number; h: number } | null | undefined,
  frum: { b: number; h: number } | null,
  bladB: number,
  bladH: number,
  svigrumHlutfall = 0.02
): SvaediPt | null {
  if (!sk || !frum || !(sk.w > 8) || !(sk.h > 8) || !(frum.b > 0) || !(frum.h > 0)) return null;
  const kx = bladB / frum.b, ky = bladH / frum.h;
  const m = Math.max(sk.w * kx, sk.h * ky) * svigrumHlutfall;
  return { x0: sk.x * kx - m, y0: sk.y * ky - m, x1: (sk.x + sk.w) * kx + m, y1: (sk.y + sk.h) * ky + m };
}
