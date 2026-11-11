// Takkinum „Sjálfvirkt" við hlið Greining-flipans: eitt smellur keyrir allt sjálfvirka verkferlið
// (lib/board/sjalfvirkt.ts) án hópavals. Combo í flipanum stendur óbreytt — þetta er aukaleið til samanburðar.

import { teikningTilGreiningar } from "./greining-teikning";
import type { BoardObject, ImageObject } from "./types";

export const SJALFVIRKT_SKREF_LYSING =
  "Sjálfvirkt fjölþrepa greiningarferli: hæstu gæði → skera að húsi → veggir → hreinsun → hurðir → EI → tæki → vista. Sama vél og „Sjálfvirkt“ í Teikningu. Allt er eitt Afturkalla-skref.";

/** Teikningin sem sjálfvirka verkferlið vinnur á — sama valregla og Greining, en úttektartenging er skylda (vistun). */
export function planTilSjalfvirks(
  objects: BoardObject[],
  selectedIds: string[]
): { ok: true; plan: ImageObject } | { ok: false; villa: string } {
  const plan = teikningTilGreiningar(objects, selectedIds);
  if (!plan) return { ok: false, villa: "Engin teikning fannst — veldu teikninguna fyrst" };
  if (!plan.uttekt) {
    return {
      ok: false,
      villa: "Tengdu teikninguna við hæð fyrst (Tengja við hæð) — sjálfvirka ferlið vistar til baka á hæðina",
    };
  }
  return { ok: true, plan };
}
