// Staða veggjaritilsins (viðmótsstaða, ekki gögn borðsins): er hann virkur, hvaða tól, þykkt og tegund nýrra veggja,
// hornalás, og hvort „Greina veggi"-spjaldið er opið. Veggirnir sjálfir búa í borðinu (useBoardStore) — hver breyting
// þar er ⌘Z-færsla. Þykkt/tegund/hornalás munast í vafranum.

import { create } from "zustand";
import { LAYER_TEIKNING, LAYER_VEGGIR } from "./layers";
import { useBoardStore } from "./store";
import type { VeggTegund } from "./teikning-veggir";
import { erVeggur } from "./veggja-leidretting";

export type RitilTol = "velja" | "teikna" | "rettur" | "kljufa" | "lengja" | "eyda-kassi";

export const TOL_HEITI: Record<RitilTol, { texti: string; lykill: string; titill: string }> = {
  velja: { texti: "Velja", lykill: "V", titill: "Velja veggi: smellur, Shift+smellur bætir við, dragðu kassa (til hægri = allur inni, til vinstri = snertir)" },
  teikna: { texti: "Teikna", lykill: "W", titill: "Teikna veggi: smelltu horn af horni — Enter / tvísmellur / Esc lýkur keðjunni" },
  rettur: { texti: "Rétthyrningur", lykill: "R", titill: "Dragðu kassa → fjórir veggir (herbergi)" },
  kljufa: { texti: "Kljúfa", lykill: "S", titill: "Smelltu á vegg þar sem á að kljúfa hann í tvennt" },
  lengja: { texti: "Lengja að", lykill: "L", titill: "Smelltu á vegginn sem á að lengja/stytta, svo á vegginn sem hann á að mæta" },
  "eyda-kassi": { texti: "Eyða í kassa", lykill: "B", titill: "Dragðu kassa — veggir í honum eyðast (til hægri = allir inni, til vinstri = snerta)" },
};

const LYKILL = "tp_veggjaritill";

export interface Forskodun {
  linur: number[][];
  veggir: { p: number[]; t: number; tegund?: VeggTegund }[];
}

interface Vistad {
  thykktCm: number;
  tegund: VeggTegund;
  hornalas: boolean;
}

function lesa(): Vistad {
  try {
    const v = JSON.parse(window.localStorage.getItem(LYKILL) || "null") as Partial<Vistad> | null;
    if (v && typeof v === "object") {
      return {
        thykktCm: Number(v.thykktCm) > 0 && Number(v.thykktCm) <= 200 ? Number(v.thykktCm) : 15,
        tegund: v.tegund === "gler" || v.tegund === "hurd" ? v.tegund : "veggur",
        hornalas: v.hornalas !== false,
      };
    }
  } catch {
    /* einkagluggi */
  }
  return { thykktCm: 15, tegund: "veggur", hornalas: true };
}

interface RitilStada extends Vistad {
  virkur: boolean;
  tol: RitilTol;
  hjalp: boolean;
  /** Teikningin sem „Greina veggi"-spjaldið vinnur á (null = lokað). */
  greining: { planId: string } | null;
  /** Lagið „Teikning" var ólæst þegar ritillinn opnaðist — það opnast aftur þegar honum er lokað. */
  laestiTeikningu: boolean;
  /** „Sýna aðeins veggi": sýnileiki laganna áður (endurheimtur þegar slökkt er). */
  adeinsVeggir: Record<string, boolean> | null;
  /** Forskoðun greiningar á borðinu (heimshnit): línur valinna PDF-flokka og veggirnir sem yrðu til. */
  forskodun: Forskodun | null;
  setForskodun: (f: Forskodun | null) => void;
  kveikja: (tol?: RitilTol) => void;
  slokkva: () => void;
  setTol: (tol: RitilTol) => void;
  setThykkt: (cm: number) => void;
  setTegund: (t: VeggTegund) => void;
  setHornalas: (v: boolean) => void;
  setHjalp: (v: boolean) => void;
  opnaGreiningu: (planId: string) => void;
  lokaGreiningu: () => void;
  laesaTeikningu: (laest: boolean) => void;
  setAdeinsVeggir: (v: boolean) => void;
}

function vista(s: Vistad) {
  try {
    window.localStorage.setItem(LYKILL, JSON.stringify({ thykktCm: s.thykktCm, tegund: s.tegund, hornalas: s.hornalas }));
  } catch {
    /* ekkert */
  }
}

export const useVeggjaRitill = create<RitilStada>((set, get) => ({
  virkur: false,
  tol: "velja",
  hjalp: false,
  greining: null,
  laestiTeikningu: false,
  adeinsVeggir: null,
  forskodun: null,
  setForskodun: (forskodun) => set({ forskodun }),
  thykktCm: 15,
  tegund: "veggur",
  hornalas: true,
  kveikja: (tol = "velja") => {
    const b = useBoardStore.getState();
    const vistad = typeof window !== "undefined" ? lesa() : null;
    // Teikningin læst meðan veggjum er breytt — smellur getur þá aldrei fært eða valið myndina.
    const teikning = b.layers.find((l) => l.id === LAYER_TEIKNING);
    let laesti = get().virkur ? get().laestiTeikningu : false;
    if (teikning && !teikning.locked) {
      b.toggleLayerLocked(LAYER_TEIKNING);
      laesti = true;
    }
    // Veggjalagið verður að sjást og vera ólæst til að breyta því
    const veggir = useBoardStore.getState().layers.find((l) => l.id === LAYER_VEGGIR);
    if (veggir && !veggir.visible) useBoardStore.getState().toggleLayerVisible(LAYER_VEGGIR);
    if (veggir?.locked) useBoardStore.getState().toggleLayerLocked(LAYER_VEGGIR);
    const st = useBoardStore.getState();
    if (st.tool !== "select") st.setTool("select");
    // aðeins veggir haldast valdir
    const vegg = new Set(st.objects.filter(erVeggur).map((o) => o.id));
    st.setSelected(st.selectedIds.filter((id) => vegg.has(id)));
    set({ virkur: true, tol, laestiTeikningu: laesti, ...(get().virkur ? {} : vistad ?? {}) });
  },
  slokkva: () => {
    const s = get();
    if (!s.virkur) return;
    if (s.adeinsVeggir) get().setAdeinsVeggir(false);
    if (s.laestiTeikningu) {
      const t = useBoardStore.getState().layers.find((l) => l.id === LAYER_TEIKNING);
      if (t?.locked) useBoardStore.getState().toggleLayerLocked(LAYER_TEIKNING);
    }
    set({ virkur: false, tol: "velja", hjalp: false, laestiTeikningu: false });
  },
  setTol: (tol) => set({ tol }),
  setThykkt: (cm) => {
    if (!(cm > 0)) return;
    set({ thykktCm: cm });
    vista(get());
  },
  setTegund: (tegund) => {
    set({ tegund });
    vista(get());
  },
  setHornalas: (hornalas) => {
    set({ hornalas });
    vista(get());
  },
  setHjalp: (hjalp) => set({ hjalp }),
  opnaGreiningu: (planId) => set({ greining: { planId } }),
  lokaGreiningu: () => set({ greining: null, forskodun: null }),
  laesaTeikningu: (laest) => {
    const t = useBoardStore.getState().layers.find((l) => l.id === LAYER_TEIKNING);
    if (t && t.locked !== laest) useBoardStore.getState().toggleLayerLocked(LAYER_TEIKNING);
    // notandinn ræður héðan í frá — ekki opnað sjálfkrafa við lokun
    set({ laestiTeikningu: false });
  },
  setAdeinsVeggir: (v) => {
    const b = useBoardStore.getState();
    if (v) {
      if (get().adeinsVeggir) return;
      const adur: Record<string, boolean> = {};
      for (const l of b.layers) adur[l.id] = l.visible;
      for (const l of b.layers) {
        const eiga = l.id === LAYER_VEGGIR;
        if (l.visible !== eiga) useBoardStore.getState().toggleLayerVisible(l.id);
      }
      set({ adeinsVeggir: adur });
    } else {
      const adur = get().adeinsVeggir;
      if (!adur) return;
      for (const l of useBoardStore.getState().layers) {
        if (l.id in adur && l.visible !== adur[l.id]) useBoardStore.getState().toggleLayerVisible(l.id);
      }
      set({ adeinsVeggir: null });
    }
  },
}));
