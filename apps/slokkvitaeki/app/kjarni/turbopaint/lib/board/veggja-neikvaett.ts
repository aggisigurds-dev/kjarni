/** Þjálfunarminni Veggjavélarinnar (Agnar 11.10.2026): „þegar kerfið merkir eitthvað skrítið sem vegg og ég ýti fjarlægja,
 * að kerfið muni að gera það ekki aftur á svona akkúrat stað" + „það sem ég tek út reynir kerfið að muna það munstur".
 *
 * Línur sem Agnar tekur út — úr forskoðun greiningar, eða veggir úr greiningarlotu sem hann eyðir á borðinu — skráðar í
 * Supabase-töfluna `veggjavel_neikvaett` í DÍLUM FRUMMYNDAR (sama kerfi og veggjaLinur og Veggjavélin). Næsta greining
 * sömu hæðar sleppir línum á sama stað (`siaNeikvaett`), og þjálfunin (teikning-greining/thjalfun) notar þær sem harða
 * neikvæða. Vefurinn má aðeins skrá og lesa (RLS) — aldrei uppfært né eytt hér. */
import { bladMyndar } from "./margar-haedir";
import { getSupabase } from "./supabase";
import type { ImageObject } from "./types";
import { bladIBordi } from "./uttekt";

export const NEIKVAETT_TAFLA = "veggjavel_neikvaett";
export type NLina = { p: number[]; t: number; tegund?: string };
export type NeikvUppruni = "forskodun" | "eytt-eftir-greiningu";

type Hvar = {
  companyId: number;
  haedId: string;
  imageUrl: string | null;
  frum: { b: number; h: number };
  blad: { x: number; y: number; width: number; height: number };
};

/** Hæðin sem myndin sýnir og vörpun blaðsins á borðið — null ef myndin er ekki tengd hæð í úttekt. */
export function hvarMyndar(plan: ImageObject): Hvar | null {
  const haedId = plan.uttekt?.haedId;
  const b = bladMyndar(plan);
  if (!haedId || b.companyId == null || !(b.frum.b > 0) || !(b.frum.h > 0)) return null;
  const blad = bladIBordi(plan, b.frum, b.svaedi);
  if (!(blad.width > 0) || !(blad.height > 0)) return null;
  return { companyId: b.companyId, haedId, imageUrl: b.imageUrl, frum: b.frum, blad };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Borðhnit → dílar frummyndar. */
export function iFrum(h: Hvar, l: NLina): NLina {
  const kx = h.frum.b / h.blad.width, ky = h.frum.h / h.blad.height;
  const ut: NLina = { p: l.p.map((n, i) => r1(i % 2 === 0 ? (n - h.blad.x) * kx : (n - h.blad.y) * ky)), t: r1(l.t * (kx + ky) / 2) };
  if (l.tegund) ut.tegund = l.tegund;
  return ut;
}

/** Dílar frummyndar → borðhnit. */
export function iBord(h: Hvar, l: NLina): NLina {
  const kx = h.blad.width / h.frum.b, ky = h.blad.height / h.frum.h;
  const ut: NLina = { p: l.p.map((n, i) => (i % 2 === 0 ? h.blad.x + n * kx : h.blad.y + n * ky)), t: l.t * (kx + ky) / 2 };
  if (l.tegund) ut.tegund = l.tegund;
  return ut;
}

/** Skrá línur (borðhnit) sem Agnar tók út. Þögul ef myndin er ekki tengd hæð eða skráningin bregst (aldrei hindrun). */
export async function skraNeikvaett(plan: ImageObject, linurBord: NLina[], uppruni: NeikvUppruni): Promise<number> {
  const h = hvarMyndar(plan);
  const sb = getSupabase();
  if (!h || !sb || !linurBord.length) return 0;
  const linur = linurBord.slice(0, 2000).map((l) => iFrum(h, l));
  const { error } = await sb.from(NEIKVAETT_TAFLA).insert({
    company_id: h.companyId,
    haed_id: h.haedId,
    image_url: h.imageUrl,
    frum_b: Math.round(h.frum.b),
    frum_h: Math.round(h.frum.h),
    linur,
    uppruni,
  });
  if (error) {
    console.warn("[neikvætt] skráning brást", error.message);
    return 0;
  }
  return linur.length;
}

/** Línur sem Agnar hefur tekið út á þessari hæð (sama blað), í borðhnitum. */
export async function saekjaNeikvaett(plan: ImageObject): Promise<NLina[]> {
  const h = hvarMyndar(plan);
  const sb = getSupabase();
  if (!h || !sb) return [];
  const r = await sb.from(NEIKVAETT_TAFLA).select("linur,image_url").eq("company_id", h.companyId).eq("haed_id", h.haedId).order("id", { ascending: false }).limit(300);
  if (r.error || !Array.isArray(r.data)) return [];
  const ut: NLina[] = [];
  for (const row of r.data as { linur: NLina[]; image_url: string | null }[]) {
    if (h.imageUrl && row.image_url && row.image_url !== h.imageUrl) continue;   // annað blað
    for (const l of row.linur || []) if (l && Array.isArray(l.p) && l.p.length >= 4) ut.push(iBord(h, l));
  }
  return ut;
}

/** Sama lína á sama stað: báðir endar innan `vik` (hvor átt sem er). */
export function aSamaStad(a: { p: number[] }, b: { p: number[] }, vik: number): boolean {
  const a0x = a.p[0], a0y = a.p[1], a1x = a.p[a.p.length - 2], a1y = a.p[a.p.length - 1];
  const b0x = b.p[0], b0y = b.p[1], b1x = b.p[b.p.length - 2], b1y = b.p[b.p.length - 1];
  const d = (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x1 - x2, y1 - y2) <= vik;
  return (d(a0x, a0y, b0x, b0y) && d(a1x, a1y, b1x, b1y)) || (d(a0x, a0y, b1x, b1y) && d(a1x, a1y, b0x, b0y));
}

/** Línur greiningar sem Agnar hefur áður tekið út á sama stað (vísar) — `vik` í borðeiningum. */
export function neikvaedarVisar(veggir: readonly { p: number[] }[], neikv: readonly NLina[], vik: number): number[] {
  if (!neikv.length) return [];
  const ut: number[] = [];
  veggir.forEach((v, i) => {
    if (neikv.some((n) => aSamaStad(v, n, vik))) ut.push(i);
  });
  return ut;
}
