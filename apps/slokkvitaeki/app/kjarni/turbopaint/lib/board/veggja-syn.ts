// „Lita veggi" (Agnar 07.10.2026): „ég sé ekki nægilega hvað hann veit hvað eru veggir og hvað ekki. væri kanski fínt
// að geta látið veggi verða Fjólubláa svona tímabundið svo maður sjái það almennilega, síðan hakar maður bara aftur í
// þá sem svarta". Svartir veggjahlutir ofan á svartri skönnun hverfa inn í hana.
//
// AÐEINS SÝN: á meðan hakað er teiknast hver veggur í skærum lit eftir tegund (venjulegur veggur fjólublár). Liturinn
// sem er geymdur á hlutnum (stroke), borðið og teikning_bord breytast ALDREI. Valið er útlitsval vafrans (localStorage).
// Flýtilykill: F („Fjólublátt") — hvorki borðið (v h r o l a w p t n m s k e b g d x) né veggjaritillinn
// (v w r s l b j t d 1–5 [ ] ?) nota hann.

import { create } from "zustand";
import type { VeggTegund } from "./teikning-veggir";

export const SKAERIR_VEGGLITIR: Record<VeggTegund, string> = {
  veggur: "#8b2cff",
  gler: "#00a3ff",
  hurd: "#ff8a00",
  ei60: "#ff1744",
  ei30: "#ff6e9c",
  svalir: "#00c9a7",
};

export const LITA_VEGGI_LYKILL = "tp_lita_veggi";
export const LITA_VEGGI_FLYTILYKILL = "f";

function lesa(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(LITA_VEGGI_LYKILL) === "1";
  } catch {
    return false;
  }
}

export const useVeggjaSyn = create<{
  lita: boolean;
  setLita: (v: boolean) => void;
  vixla: () => void;
  hlada: () => void;
  /** Veggir-hamur: allt annað en veggir dempað (teikningin hálfgagnsæ, tákn og annað nær ósýnilegt). Aðeins sýn. */
  dempa: boolean;
  setDempa: (v: boolean) => void;
}>((set, get) => ({
  lita: false,
  dempa: false,
  setDempa: (dempa) => set({ dempa }),
  setLita: (lita) => {
    try {
      window.localStorage.setItem(LITA_VEGGI_LYKILL, lita ? "1" : "0");
    } catch {
      /* einkagluggi */
    }
    set({ lita });
  },
  vixla: () => get().setLita(!get().lita),
  /** Les vistað val eftir hydration (forðast misræmi milli þjóns og vafra). */
  hlada: () => set({ lita: lesa() }),
}));

/** Ógagnsæi hlutar sem ekki er veggur í Veggir-ham: teikningin sést (til að rekja veggina), annað víkur. */
export function dempadOgagnsaei(opacity: number, erMynd: boolean): number {
  return opacity * (erMynd ? 0.6 : 0.25);
}

/** Liturinn sem veggurinn er TEIKNAÐUR í: skær litur tegundarinnar þegar „Lita veggi" er á, annars geymdi liturinn. */
export function synilegurVegglitur(geymdur: string, tegund: VeggTegund | undefined, lita: boolean): string {
  return lita ? SKAERIR_VEGGLITIR[tegund ?? "veggur"] : geymdur;
}
