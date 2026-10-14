// EI-greiningin á borðinu: miðar (detect-firewalls) → eldveggir á veggjum teikningarinnar (ei-beiting / ei-festing).
// Eigi teikningin enga veggi á borðinu eru veggirnir greindir sjálfkrafa hér fyrst (vigur-PDF með tillöguflokknum,
// annars myndin — sama greining og Teikning) og AÐEINS eldveggjabútarnir bætast við borðið.

import type { FestiVeggur } from "./ei-festing";
import { flokkaYfirlit, klemmaGreindaThykkt, erNotanlegtVigurPdf, ptIBord, skurdurIPt, sjalfvirkirPdfVeggirPt } from "./pdf-veggjaflokkar";
import { greinaVeggiSkonnunar } from "./skonnun-veggir-mynd";
import { lesaPdfSidu } from "./strip";
import type { ImageObject } from "./types";

/** Veggir greindir sjálfkrafa (ekki settir á borðið): vigur-PDF með tillöguflokknum innan hússins, annars myndin. */
export async function sjalfvirkirVeggir(plan: ImageObject, dpm: number | null, onProgress?: (p: number) => void): Promise<FestiVeggur[]> {
  let sida = null;
  try {
    sida = await lesaPdfSidu(plan);
  } catch {
    sida = null;
  }
  if (sida && erNotanlegtVigurPdf(sida.flokkar, sida.breidd, sida.haed)) {
    const tillaga = flokkaYfirlit(sida.flokkar, sida.breidd, sida.haed).find((f) => f.tillaga);
    if (tillaga) {
      const sv = plan.uttekt ? skurdurIPt(plan.uttekt.skurdur, { b: plan.uttekt.frumB, h: plan.uttekt.frumH }, sida.breidd, sida.haed) : null;
      const pt = sjalfvirkirPdfVeggirPt(sida.flokkar, sida.breidd, sida.haed, { svaedi: sv, burt: plan.hvittad, adalFlokkur: tillaga.breidd }).veggir;
      return klemmaGreindaThykkt(ptIBord(pt, plan, sida.breidd, sida.haed), dpm).map((v, i) => ({ id: "sjalf:" + i, ...v }));
    }
  }
  const g = await greinaVeggiSkonnunar(plan, onProgress, dpm);
  return klemmaGreindaThykkt(g.veggir, dpm).map((v, i) => ({ id: "sjalf:" + i, ...v }));
}

