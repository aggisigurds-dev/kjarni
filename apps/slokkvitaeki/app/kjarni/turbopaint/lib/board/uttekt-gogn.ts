/** Gögn úttektarinnar sem borðið er tengt (tækjalisti staðarins + hæðirnar) og valið í tækjalistanum („vopnið"): tæki
 * eða stimpill sem næsti smellur á teikninguna setur niður. Útlitsstaða vafrans — skrifast aldrei; úttektin sjálf
 * skrifast aðeins með „Vista í úttekt". */

import { create } from "zustand";
import { useBoardStore } from "./store";
import { saekjaUttekt, type UttektHaed, type UttektTaeki } from "./uttekt";

export type UttektGogn = { companyId: number; nafn: string; haedir: UttektHaed[]; taeki: UttektTaeki[] };

export const useUttektGogn = create<{
  gogn: UttektGogn | null;
  hledur: number | null;
  villa: string | null;
  setGogn: (g: UttektGogn) => void;
  hlada: (companyId: number) => Promise<void>;
}>((set, get) => ({
  gogn: null,
  hledur: null,
  villa: null,
  setGogn: (gogn) => set({ gogn, villa: null }),
  hlada: async (companyId) => {
    if (get().hledur === companyId) return;
    set({ hledur: companyId, villa: null });
    try {
      const u = await saekjaUttekt(companyId);
      set({ gogn: { companyId, nafn: u.nafn, haedir: u.haedir, taeki: u.taeki }, hledur: null });
    } catch (err) {
      set({ hledur: null, villa: err instanceof Error ? err.message : "Gat ekki sótt tækjalistann" });
    }
  },
}));

/** Tæki (unitId) eða Teikning-stimpill sem næsti smellur á teikninguna setur. `symbolId` = táknið sem tólið sýnir. */
export type TaekjaVal =
  | { teg: "taeki"; unitId: number | string; symbolId: string }
  | { teg: "stimpill"; sign: string; symbolId: string };

export const useTaekjaVal = create<{ val: TaekjaVal | null; setVal: (v: TaekjaVal | null) => void }>((set) => ({
  val: null,
  setVal: (val) => set({ val }),
}));

/** Vopnar valið: stimpiltólið með tákni tækisins (krosshár), svo smellur á teikninguna fer í setjaVal. */
export function vopna(val: TaekjaVal) {
  const st = useBoardStore.getState();
  // tólið fyrst: vaktin hér að neðan tekur vopnið um leið og tól/tákn passa ekki
  st.setStyle({ symbolId: val.symbolId });
  st.setTool("symbol");
  useTaekjaVal.setState({ val });
}

export function afvopna() {
  if (useTaekjaVal.getState().val) useTaekjaVal.setState({ val: null });
}

// Annað tól (Esc, V, tækjastikan) eða annað tákn úr slánni tekur vopnið — annars gæti næsti stimpill orðið tæki.
if (typeof window !== "undefined") {
  useBoardStore.subscribe((s) => {
    const v = useTaekjaVal.getState().val;
    if (v && (s.tool !== "symbol" || s.style.symbolId !== v.symbolId)) useTaekjaVal.setState({ val: null });
  });
}
