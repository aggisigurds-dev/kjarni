/** „Croppa oft" (Agnar 06.10.2026): kassarnir sem notandinn dregur yfir hverja grunnmynd blaðsins áður en skorið er.
 * Útlitsstaða tólsins (heimshnit, númeraðir 1, 2, 3 … í röðinni sem þeir voru dregnir) — ekkert vistast. Kassarnir
 * hverfa um leið og annað tól er valið (Esc, V …). */

import { create } from "zustand";
import { useBoardStore } from "./store";

export type FjolKassi = { x: number; y: number; width: number; height: number };

export const useFjolcrop = create<{
  kassar: FjolKassi[];
  /** Valinn kassi (vísir) — Delete eyðir honum, hann fær handföng. */
  valinn: number | null;
  baeta: (k: FjolKassi) => void;
  setja: (i: number, k: FjolKassi) => void;
  eyda: (i: number) => void;
  velja: (i: number | null) => void;
  setjaAlla: (k: FjolKassi[]) => void;
  hreinsa: () => void;
}>((set) => ({
  kassar: [],
  valinn: null,
  baeta: (k) => set((s) => ({ kassar: [...s.kassar, k], valinn: s.kassar.length })),
  setja: (i, k) => set((s) => ({ kassar: s.kassar.map((x, j) => (j === i ? k : x)) })),
  eyda: (i) => set((s) => ({ kassar: s.kassar.filter((_, j) => j !== i), valinn: null })),
  velja: (valinn) => set({ valinn }),
  setjaAlla: (kassar) => set({ kassar, valinn: null }),
  hreinsa: () => set({ kassar: [], valinn: null }),
}));

/** Ræsir tólið: kassarnir byrja tómir og ekkert er valið á borðinu. */
export function raesaFjolcrop() {
  useFjolcrop.getState().hreinsa();
  const st = useBoardStore.getState();
  st.setSelected([]);
  st.setTool("fjolcrop");
}

// Annað tól hreinsar kassana (Esc, V, tækjastikan).
if (typeof window !== "undefined") {
  useBoardStore.subscribe((s, p) => {
    if (p.tool === "fjolcrop" && s.tool !== "fjolcrop" && useFjolcrop.getState().kassar.length) useFjolcrop.getState().hreinsa();
  });
}
