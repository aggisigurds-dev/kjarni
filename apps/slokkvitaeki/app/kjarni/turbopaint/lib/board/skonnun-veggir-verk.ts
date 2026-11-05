// Vinnuþráður veggjagreiningar skönnunar (skonnun-veggir.ts): ~4 s á Álfaborg 2. hæð (1897 × 1975 vinnudílar) — utan
// aðalþráðarins svo TurboPaint frjósi ekki á meðan. Tekur við grátónamyndinni (flutt, ekki afrituð) og skilar bútunum.

import { skonnunarVeggir } from "./skonnun-veggir";

type Beidni = { id: number; gra: Uint8Array; W: number; H: number; kvardi: number; fb: number; fh: number; dilarAMetra?: number | null };

const svid = self as unknown as {
  onmessage: ((e: MessageEvent<Beidni>) => void) | null;
  postMessage: (m: unknown) => void;
};

svid.onmessage = (e) => {
  const q = e.data;
  try {
    const r = skonnunarVeggir(q.gra, q.W, q.H, q.kvardi, q.fb, q.fh, { dilarAMetra: q.dilarAMetra });
    svid.postMessage({ id: q.id, ...r });
  } catch (err) {
    svid.postMessage({ id: q.id, villa: err instanceof Error ? err.message : String(err) });
  }
};
