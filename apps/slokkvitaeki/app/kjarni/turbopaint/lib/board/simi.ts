// TurboPaint í síma (Agnar 09.10.2026: „Svolítið erfitt að gera í símanum. Margt fyrir."). Eitt svar við „er þetta
// sími?" svo verkfærasúlan, veggjaritillinn og „Vista í úttekt" séu samtaka: mjór skjár, eða snertiskjár upp að
// spjaldtölvustærð (líka Chrome „Tölvusíða" á síma, þar sem útsýnisglugginn er ~980 px). Tölvan er óbreytt.

import { useSyncExternalStore } from "react";

export const SIMI_FYRIRSPURN = "(max-width: 639px), (pointer: coarse) and (max-width: 1100px)";

export function erSimi(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(SIMI_FYRIRSPURN).matches;
}

function hlusta(breytt: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(SIMI_FYRIRSPURN);
  mq.addEventListener("change", breytt);
  return () => mq.removeEventListener("change", breytt);
}

/** Fylgist með (snúningur, gluggastærð) — endurteiknar þegar tækið skiptir um flokk. */
export function useErSimi(): boolean {
  return useSyncExternalStore(hlusta, erSimi, () => false);
}

/** Verkfærasúlan: vistað val vafrans ræður („1" samanbrotin, „0" opin); annars samanbrotin í síma, opin í tölvu. */
export const SULA_LYKILL = "tp_verkfaerasula_samanbrotin";

export function sulaSamanbrotin(vistad: string | null | undefined, simi: boolean): boolean {
  if (vistad === "1") return true;
  if (vistad === "0") return false;
  return simi;
}

export function lesaSulu(): boolean {
  const simi = erSimi();
  try {
    return sulaSamanbrotin(window.localStorage.getItem(SULA_LYKILL), simi);
  } catch {
    return simi; // einkagluggi
  }
}

export function vistaSulu(samanbrotin: boolean) {
  try {
    window.localStorage.setItem(SULA_LYKILL, samanbrotin ? "1" : "0");
  } catch {
    /* einkagluggi — gildir þá aðeins þessa heimsókn */
  }
}
