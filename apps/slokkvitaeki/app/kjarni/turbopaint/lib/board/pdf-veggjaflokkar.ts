// Veggir úr vigur-PDF með VÖLDUM línuflokkum (veggjaritillinn, Agnar 06.10.2026). CAD-teikning geymir hverja línu
// með sinni þykkt; „Veggir" giskaði áður á EINN flokk (veljaVeggjaflokk) og paraði hann hráan. Hér velur notandinn
// flokkana sjálfur (eins og „📄 Veggir úr PDF" í Teikning-glugganum 383 — einn eða fleiri), sér hvaða línur verða
// veggir, og sama heildarferli og innflutningur hæðar keyrir á þær (veggirUrPdfStrikum: pörun → samlínu-sameining →
// stakir veggfletir → gler úr þunnum pörum → horn), auk stakra lína sem veggja.
//
// Allt í punktum síðunnar (pt) þar til varpað er á borðið.

import { VEGGUR_HAMARK_CM } from "./veggja-linur";
import { finnaVeggiUrPdfFlokkum, veljaVeggjaflokk, type Strik } from "./pdf-veggir";
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
  /** Lítur EKKI út eins og veggir (hárlína, eða mjög mörg stutt strik = skástrikun / húsgögn / bílar / málstrik).
   * Agnar 07.10.2026: 0,24 + 0,48 pt saman gáfu 599 „veggi" — svartar klessur yfir allri teikningunni. */
  ekkiVeggir: boolean;
  /** Skýring á `ekkiVeggir` (birt í viðvöruninni). */
  astaeda?: string;
}

/** Flokkur með svona mörgum strikum … */
const MORG_STRIK = 3000;
/** … og svona stuttum að meðaltali (m í 1:100 á strik, löngu strikin) er skástrikun / húsgögn, ekki veggir. */
const STUTT_MEDALLENGD_M = 0.4;

/** Línuflokkar síðunnar, lengstir fyrst, tillagan merkt. Tómir flokkar sleppa. */
export function flokkaYfirlit(flokkar: Record<string, Strik[]>, bladB: number, bladH: number): PdfFlokkur[] {
  const val = veljaVeggjaflokk(flokkar, bladB, bladH);
  return val.yfirlit
    .filter((y) => y.strik > 0)
    .map((y) => {
      const lengdM = Math.round(y.lengd * PT_I_METRUM);
      const harlina = +y.breidd < 0.3;
      const morgStutt = y.strik >= MORG_STRIK && lengdM / y.strik < STUTT_MEDALLENGD_M;
      const f: PdfFlokkur = {
        breidd: y.breidd,
        strik: y.strik,
        long: y.long,
        lengdM,
        tillaga: y.breidd === val.valinn,
        harlina,
        ekkiVeggir: (harlina || morgStutt) && y.breidd !== val.valinn,
      };
      if (f.ekkiVeggir) f.astaeda = harlina ? "hárlína — skástrikun, húsgögn, málsetning" : "mjög mörg stutt strik — skástrikun / húsgögn";
      return f;
    });
}

/** SKÖNNUÐ PDF (Agnar 07.10.2026, Álfaborg 2. hæð — FotoWeb-PDF): síðan er ein mynd og engin vigurstrik, svo „Greina
 * veggi" fann enga línuflokka og skilaði 0 veggjum. PDF með minna en 30 m af strokuðum línum (1:100) — stimpill,
 * undirskrift, rammi — er skönnun: veggirnir eru þá greindir úr myndinni eins og í Teikning-glugganum. */
export const SKONNUN_HAMARK_M = 30;
export function pdfErSkonnun(flokkar: Record<string, Strik[]>): boolean {
  let pt = 0;
  for (const listi of Object.values(flokkar)) for (const s of listi) pt += Math.hypot(s[2] - s[0], s[3] - s[1]);
  return pt * PT_I_METRUM < SKONNUN_HAMARK_M;
}

/** Hámarksþykkt greinds veggjar (cm): mistök í greiningu mega aldrei mála þykkar svartar klessur. 40 → 35 cm (Agnar
 * 10.10.2026, Berjavellir 6: „koma leiðinlega þykkir út") — sama þak og síun skönnunar (veggja-linur.ts). */
export const GREINDUR_VEGGUR_HAMARK_CM = VEGGUR_HAMARK_CM;

/** Klemmir þykkt greindra veggja (borðdílar): ≤ 35 cm í kvarða borðsins; óþekktur kvarði → ≤ 3× miðgildi þykktar. */
export function klemmaGreindaThykkt<T extends { t: number }>(veggir: T[], dilarAMetra: number | null): T[] {
  if (!veggir.length) return veggir;
  let hamark: number;
  if (dilarAMetra && dilarAMetra > 0) hamark = (GREINDUR_VEGGUR_HAMARK_CM / 100) * dilarAMetra;
  else {
    const t = veggir.map((v) => v.t).sort((a, b) => a - b);
    hamark = Math.max(1, t[t.length >> 1] * 3);
  }
  return veggir.map((v) => (v.t > hamark ? { ...v, t: hamark } : v));
}

/** Greining sem þarf skýrt já áður en henni er beitt: > 120 nýir veggir, eða > 3× þeir sem fyrir eru. */
export const GREINING_STADFESTA_YFIR = 120;
export function greiningKrefstStadfestingar(nyir: number, fyrir: number): boolean {
  return nyir > GREINING_STADFESTA_YFIR || (fyrir > 0 && nyir > 3 * fyrir);
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

/**
 * Automatic vector extraction used by TurboPaint's building workflow.
 * Preserve the primary class parser for doors and glass, adding only credible
 * *paired* walls from secondary stroke-width classes.
 */
export function sjalfvirkirPdfVeggirPt(
  flokkar: Record<string, Strik[]>,
  bladB: number,
  bladH: number,
  st: { svaedi?: SvaediPt | null; burt?: { x: number; y: number; w: number; h: number }[]; adalFlokkur?: string | null } = {}
): { veggir: FrumVeggur[]; flokkar: string[]; vidbotar: number } {
  const yfirlit = flokkaYfirlit(flokkar, bladB, bladH);
  const adal = st.adalFlokkur ?? yfirlit.find((f) => f.tillaga)?.breidd;
  if (!adal) return { veggir: [], flokkar: [], vidbotar: 0 };
  const val = (key: string) => strikValinna(flokkar, [key], { svaedi: st.svaedi, burt: st.burt, bladB, bladH });
  const primary = veggirUrStrikumPt(val(adal), bladB, bladH, { gler: true, stakar: true });
  const secondary: Record<string, Strik[]> = {};
  for (const group of yfirlit) {
    if (group.breidd === adal || group.ekkiVeggir || !Number.isFinite(+group.breidd) || +group.breidd < 0.3 || group.strik > 5000) continue;
    const strokes = val(group.breidd);
    if (strokes.length) secondary[group.breidd] = strokes;
  }
  const paired = finnaVeggiUrPdfFlokkum(secondary, bladB, bladH);
  const solids = primary.filter((w) => w.p.length === 4 && w.tegund !== "gler");
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const wall of solids) {
    for (let i = 0; i < 4; i += 2) {
      b.x0 = Math.min(b.x0, wall.p[i]); b.y0 = Math.min(b.y0, wall.p[i + 1]);
      b.x1 = Math.max(b.x1, wall.p[i]); b.y1 = Math.max(b.y1, wall.p[i + 1]);
    }
  }
  const margin = Math.max(8, Math.min(bladB, bladH) * 0.015);
  const inside = (p: number[]) => !solids.length || [0, 2].every((i) =>
    p[i] >= b.x0 - margin && p[i] <= b.x1 + margin &&
    p[i + 1] >= b.y0 - margin && p[i + 1] <= b.y1 + margin);
  const overlaps = (p: number[], q: number[]) => {
    if (p.length !== 4 || q.length !== 4) return false;
    const dx = p[2] - p[0], dy = p[3] - p[1], L = Math.hypot(dx, dy);
    const ex = q[2] - q[0], ey = q[3] - q[1], M = Math.hypot(ex, ey);
    if (L < 1 || M < 1 || Math.abs(dx * ey - dy * ex) / (L * M) > 0.02) return false;
    const ux = dx / L, uy = dy / L;
    const distance = (x: number, y: number) => Math.abs((x - p[0]) * uy - (y - p[1]) * ux);
    if (Math.max(distance(q[0], q[1]), distance(q[2], q[3])) > 1.5) return false;
    const a = (q[0] - p[0]) * ux + (q[1] - p[1]) * uy;
    const c = (q[2] - p[0]) * ux + (q[3] - p[1]) * uy;
    const overlap = Math.max(0, Math.min(L, Math.max(a, c)) - Math.max(0, Math.min(a, c)));
    return overlap >= Math.min(L, M) * 0.75;
  };
  const veggir = primary.slice();
  let vidbotar = 0;
  for (const wall of paired.veggir) {
    const p = [wall.a[0], wall.a[1], wall.b[0], wall.b[1]];
    if (!inside(p) || veggir.some((v) => overlaps(v.p, p))) continue;
    veggir.push({ p, t: wall.thykkt });
    vidbotar++;
  }
  return { veggir, flokkar: [adal, ...paired.flokkar], vidbotar };
}

/** Only treat a PDF as vector wall geometry if it has a plausible wall stroke class. */
export function erNotanlegtVigurPdf(flokkar: Record<string, Strik[]>, bladB: number, bladH: number): boolean {
  return !pdfErSkonnun(flokkar) && flokkaYfirlit(flokkar, bladB, bladH).some((f) => f.tillaga && !f.ekkiVeggir);
}
