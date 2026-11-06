// Vinnuþráður veggjagreiningar skönnunar (skonnun-veggir.ts): ~4 s á Álfaborg 2. hæð (1897 × 1975 vinnudílar) — utan
// aðalþráðarins svo TurboPaint frjósi ekki á meðan. Tekur við grátónamyndinni (flutt, ekki afrituð) og skilar bútunum.

import { skonnunarVeggir } from "./skonnun-veggir";
import { bakgrunnsTonn, maelaHallaMyndar } from "./thunnir-veggir";

type Veggjabeidni = { verk?: "veggir"; id: number; gra: Uint8Array; W: number; H: number; kvardi: number; fb: number; fh: number; dilarAMetra?: number | null };
/** Halli blaðsins — sjá maelaHallaBlads. Mælt af Lisbeth 05.11.2026: 1,1 s á 1600×1067 og 2,4 s á 1600×1600, ein samfelld
 * samhverf blokk án `anda()`. Á ódýrum Android er það 5–12 s frosinn aðalþráður við það eitt að ýta á flettuna, þar sem
 * þakið við snertingu er 200 ms. Þess vegna hér. */
type Hallabeidni = { verk: "halli"; id: number; gra: Uint8Array; W: number; H: number; munur?: number };
type Beidni = Veggjabeidni | Hallabeidni;

const svid = self as unknown as {
  onmessage: ((e: MessageEvent<Beidni>) => void) | null;
  postMessage: (m: unknown) => void;
};

svid.onmessage = (e) => {
  const q = e.data;
  try {
    if (q.verk === "halli") {
      const thr = bakgrunnsTonn(q.gra) - (q.munur ?? 16);
      const m = new Uint8Array(q.W * q.H);
      for (let i = 0; i < m.length; i++) m[i] = q.gra[i] < thr ? 1 : 0;
      svid.postMessage({ id: q.id, halli: maelaHallaMyndar(m, q.W, q.H) });
      return;
    }
    const r = skonnunarVeggir(q.gra, q.W, q.H, q.kvardi, q.fb, q.fh, { dilarAMetra: q.dilarAMetra });
    svid.postMessage({ id: q.id, ...r });
  } catch (err) {
    svid.postMessage({ id: q.id, villa: err instanceof Error ? err.message : String(err) });
  }
};
