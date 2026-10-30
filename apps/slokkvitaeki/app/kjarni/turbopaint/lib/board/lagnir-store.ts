// Staða Lagna-hamsins (aðeins í minni — blöðin eru stór og vistast ekki; niðurstaðan fer í CSV / afritast).

import { create } from "zustand";
import {
  andhverfLiking,
  beitaLikingu,
  BRUNAVEGGUR_LITUR,
  giskaARasalitum,
  litirFlata,
  talaGegnumtok,
  type Gegnumtak,
  type Liking,
  type Strik,
} from "./lagnir";
import type { LagnaBlad } from "./lagnir-pdf";

export interface LagnaBladStada {
  id: string;
  /** Heiti sem notandinn gefur („5H S1 hluti 1"). */
  heiti: string;
  blad: LagnaBlad;
  /** Fletir í þessum litum eru rásir. */
  rasalitir: string[];
  liking: Liking | null;
  gegnumtok: Gegnumtak[] | null;
}

interface LagnirStada {
  yfirlit: LagnaBlad | null;
  /** Strik í þessum litum á yfirlitsblaðinu eru brunaveggir. */
  vegglitir: string[];
  blod: LagnaBladStada[];
  /** Blaðið sem er opið í stillingarglugganum. */
  stillir: string | null;
  setYfirlit: (b: LagnaBlad | null) => void;
  setVegglitir: (l: string[]) => void;
  baetaBladi: (b: LagnaBlad) => void;
  uppfaera: (id: string, p: Partial<LagnaBladStada>) => void;
  fjarlaegja: (id: string) => void;
  setStillir: (id: string | null) => void;
}

let teljari = 0;

export const useLagnir = create<LagnirStada>((set) => ({
  yfirlit: null,
  vegglitir: [BRUNAVEGGUR_LITUR],
  blod: [],
  stillir: null,
  // Nýtt yfirlitsblað ógildir fyrri stillingar — þær eru í hnitum hins gamla.
  setYfirlit: (yfirlit) => set((s) => ({ yfirlit, blod: s.blod.map((b) => ({ ...b, liking: null, gegnumtok: null })) })),
  setVegglitir: (vegglitir) => set((s) => ({ vegglitir, blod: s.blod.map((b) => ({ ...b, gegnumtok: null })) })),
  baetaBladi: (blad) =>
    set((s) => ({
      blod: [
        ...s.blod,
        { id: `lb${++teljari}`, heiti: blad.nafn, blad, rasalitir: giskaARasalitum(litirFlata(blad.log.flatir)), liking: null, gegnumtok: null },
      ],
    })),
  uppfaera: (id, p) => set((s) => ({ blod: s.blod.map((b) => (b.id === id ? { ...b, ...p } : b)) })),
  fjarlaegja: (id) => set((s) => ({ blod: s.blod.filter((b) => b.id !== id), stillir: s.stillir === id ? null : s.stillir })),
  setStillir: (stillir) => set({ stillir }),
}));

/** Telur gegnumtök lagnablaðs: brunaveggir yfirlitsins varpast í blaðhnit með andhverfu líkingarinnar. */
export function teljaBlad(yfirlit: LagnaBlad, vegglitir: string[], b: LagnaBladStada, liking: Liking): Gegnumtak[] {
  const inv = andhverfLiking(liking);
  const lit = new Set(vegglitir);
  const veggir: Strik[] = [];
  const spassia = 40;
  for (const x of yfirlit.log.strik) {
    if (!lit.has(x.lit)) continue;
    const a = beitaLikingu(inv, [x.s[0], x.s[1]]);
    const c = beitaLikingu(inv, [x.s[2], x.s[3]]);
    if ((a[0] < -spassia && c[0] < -spassia) || (a[1] < -spassia && c[1] < -spassia)) continue;
    if ((a[0] > b.blad.w + spassia && c[0] > b.blad.w + spassia) || (a[1] > b.blad.h + spassia && c[1] > b.blad.h + spassia)) continue;
    veggir.push([a[0], a[1], c[0], c[1]]);
  }
  const ras = new Set(b.rasalitir);
  const flatir = b.blad.log.flatir.filter((f) => ras.has(f.lit)).map((f) => f.p);
  return talaGegnumtok(veggir, flatir, b.blad.texti);
}
