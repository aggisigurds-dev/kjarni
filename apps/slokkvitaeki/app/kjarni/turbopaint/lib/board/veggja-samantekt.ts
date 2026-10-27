/** Sjálfvirk samantekt veggjagreiningarinnar á borðinu (Agnar 26.10.2026: „betri automatic samantekt, auka stiku fyrir
 *  neðan efsta bannerinn, collapsable, með helstu hjálpargreiningartölunum fyrir veggina"). Hreint fall — les aðeins
 *  hlutina á borðinu, skrifar ekkert. Birtist í VeggjaYfirlit.tsx. */

import { erVeggur, veggTegundAf, bordDilarAMetra } from "./veggja-leidretting";
import { giskDilarAMetra, pdfDilarAMetra } from "./hus3d";
import { veggLengd } from "./veggja-ritill";
import type { VeggTegund } from "./teikning-veggir";
import type { BoardObject, ImageObject } from "./types";

export const VEGG_TEGUNDIR: VeggTegund[] = ["veggur", "ei60", "ei30", "gler", "hurd", "svalir", "stigi"];

export interface TegundTala {
  /** Fjöldi búta. */
  n: number;
  /** Samanlögð lengd í metrum — null þegar enginn kvarði er til. */
  metrar: number | null;
}

export interface VeggjaSamantekt {
  /** Veggbútar alls (allar tegundir), sýnilegir. */
  veggir: number;
  /** Lengd allra bútanna (án hurða og glers — veggir hússins) í metrum. */
  metrarVeggir: number | null;
  eftirTegund: Record<VeggTegund, TegundTala>;
  /** Bútar sem enginn hefur flokkað (veggTegund vantar) — greiningin gaf þeim sjálfgefna tegund „veggur". */
  oflokkadir: number;
  /** Rými í fermetratöku og nettó-flatarmál þeirra (m²). */
  rymi: number;
  rymiM2: number | null;
  /** Tæki á borðinu eftir tegund tákns. */
  taeki: { slokkvitaeki: number; slanga: number; ut: number };
  /** Hvaðan metrarnir koma: kvarði (K) eða ágiskun út frá tengdu úttektarmyndinni — null = engir metrar. */
  kvardi: "kvardi" | "agiskun" | null;
}

/** Borðdílar á metra: kvarði borðsins (K) ef hann er til; annars ágiskun — úttektarmynd, PDF-síðan teiknuð í 1:100, eða
 *  stærð blaðsins (A1, 1:100). Sama röð og 3D-ið notar. */
function kvardiBords(objects: BoardObject[], pixelsPerMeter: number | null): { ppm: number | null; kvardi: VeggjaSamantekt["kvardi"] } {
  if (pixelsPerMeter && pixelsPerMeter > 0) return { ppm: pixelsPerMeter, kvardi: "kvardi" };
  const uttekt = bordDilarAMetra(objects, null);
  if (uttekt) return { ppm: uttekt, kvardi: "agiskun" };
  const mynd = objects.find((o): o is ImageObject => o.type === "image" && !o.hidden);
  const gisk = mynd ? (pdfDilarAMetra(mynd) ?? giskDilarAMetra(mynd)) : null;
  return gisk ? { ppm: gisk, kvardi: "agiskun" } : { ppm: null, kvardi: null };
}

export function veggjaSamantekt(objects: BoardObject[], pixelsPerMeter: number | null): VeggjaSamantekt {
  const { ppm, kvardi } = kvardiBords(objects, pixelsPerMeter);
  const dilar: Record<VeggTegund, number> = { veggur: 0, ei60: 0, ei30: 0, gler: 0, hurd: 0, svalir: 0, stigi: 0 };
  const fjoldi: Record<VeggTegund, number> = { veggur: 0, ei60: 0, ei30: 0, gler: 0, hurd: 0, svalir: 0, stigi: 0 };
  let veggir = 0, oflokkadir = 0, rymi = 0, rymiPx2 = 0;
  const taeki = { slokkvitaeki: 0, slanga: 0, ut: 0 };
  for (const o of objects) {
    if (o.hidden) continue;
    if (erVeggur(o)) {
      const t = veggTegundAf(o);
      veggir++;
      fjoldi[t]++;
      dilar[t] += veggLengd(o);
      if (o.veggTegund === undefined) oflokkadir++;
    } else if (o.type === "rect" && o.isRoom && o.roomCounted !== false) {
      rymi++;
      if (!o.roomExcluded) rymiPx2 += o.width * o.height;
    } else if (o.type === "symbol") {
      if (o.symbolId.startsWith("extinguisher")) taeki.slokkvitaeki++;
      else if (o.symbolId === "hose") taeki.slanga++;
      else if (o.symbolId === "exit") taeki.ut++;
    }
  }
  const m = (px: number) => (ppm ? Math.round((px / ppm) * 10) / 10 : null);
  const eftirTegund = {} as Record<VeggTegund, TegundTala>;
  for (const t of VEGG_TEGUNDIR) eftirTegund[t] = { n: fjoldi[t], metrar: m(dilar[t]) };
  const veggjaDilar = dilar.veggur + dilar.ei60 + dilar.ei30 + dilar.svalir;
  return {
    veggir,
    metrarVeggir: m(veggjaDilar),
    eftirTegund,
    oflokkadir,
    rymi,
    rymiM2: ppm ? Math.round(rymiPx2 / (ppm * ppm)) : null,
    taeki,
    kvardi,
  };
}
