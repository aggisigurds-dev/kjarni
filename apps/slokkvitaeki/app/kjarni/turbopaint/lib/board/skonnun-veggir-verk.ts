// Vinnuþráður veggjagreiningar skönnunar (skonnun-veggir.ts): ~4 s á Álfaborg 2. hæð (1897 × 1975 vinnudílar) — utan
// aðalþráðarins svo TurboPaint frjósi ekki á meðan. Tekur við grátónamyndinni (flutt, ekki afrituð) og skilar bútunum.

import { graTonar, greiningarSvaedi, skonnunarVeggir } from "./skonnun-veggir";
import { bakgrunnsTonn, maelaHallaMyndar } from "./thunnir-veggir";

type Veggjabeidni = { verk?: "veggir"; id: number; gra: Uint8Array; W: number; H: number; kvardi: number; fb: number; fh: number; dilarAMetra?: number | null };
/** Halli blaðsins — sjá maelaHallaBlads. Mælt af Lisbeth 05.11.2026: 1,1 s á 1600×1067 og 2,4 s á 1600×1600, ein samfelld
 * samhverf blokk án `anda()`. Á ódýrum Android er það 5–12 s frosinn aðalþráður við það eitt að ýta á flettuna, þar sem
 * þakið við snertingu er 200 ms. Þess vegna hér. */
type Hallabeidni = { verk: "halli"; id: number; gra: Uint8Array; W: number; H: number; munur?: number };
/** Halli blaðsins úr blobinu sjálfu: afkóðun, minnkun í helmingsþrepum og grátónun fara líka fram hér (OffscreenCanvas) —
 * mælt 06.11.2026: 371 ms hiksti á aðalþræði þegar það var gert þar (þak 200 ms við snertingu). */
type Halliblad = {
  verk: "halliblad";
  id: number;
  blob: Blob;
  plan: { uttekt?: { frumB: number; frumH: number; skurdur?: { x: number; y: number; w: number; h: number } | null; myndSkurdur?: { x: number; y: number; w: number; h: number } | null } | null };
  munur?: number;
};
type Beidni = Veggjabeidni | Hallabeidni | Halliblad;

const svid = self as unknown as {
  onmessage: ((e: MessageEvent<Beidni>) => void) | null;
  postMessage: (m: unknown) => void;
};

async function halliUrBlobi(q: Halliblad) {
  try {
    const bmp = await createImageBitmap(q.blob);
    const g0 = greiningarSvaedi(q.plan, { w: bmp.width, h: bmp.height });
    const k = Math.min(1, 1600 / Math.max(g0.sk.w, g0.sk.h));
    const W = Math.max(1, Math.round(g0.sk.w * k)), H = Math.max(1, Math.round(g0.sk.h * k));
    const u = g0.uppspretta;
    let src: ImageBitmap | OffscreenCanvas = bmp;
    let sx = u.x, sy = u.y, sw = u.w, sh = u.h;
    const teikna = (nw: number, nh: number, lesa: boolean) => {
      const c = new OffscreenCanvas(nw, nh);
      const x = c.getContext("2d", lesa ? { willReadFrequently: true } : undefined);
      if (!x) throw new Error("Gat ekki opnað striga í þræði");
      x.fillStyle = "#fff";
      x.fillRect(0, 0, nw, nh);
      x.imageSmoothingEnabled = true;
      x.imageSmoothingQuality = "high";
      x.drawImage(src, sx, sy, sw, sh, 0, 0, nw, nh);
      if (src instanceof ImageBitmap) src.close();
      return { c, x };
    };
    // minnkað í helmingsþrepum eins og á aðalþræðinum (stór minnkun í einu skrefi tekur fáa díla — þunnar línur hverfa)
    while (sw > W * 2 || sh > H * 2) {
      const nw = Math.max(W, Math.ceil(sw / 2)), nh = Math.max(H, Math.ceil(sh / 2));
      src = teikna(nw, nh, false).c;
      sx = 0; sy = 0; sw = nw; sh = nh;
    }
    const { x } = teikna(W, H, true);
    const gra = graTonar(x.getImageData(0, 0, W, H).data, W, H);
    const thr = bakgrunnsTonn(gra) - (q.munur ?? 16);
    const m = new Uint8Array(W * H);
    for (let i = 0; i < m.length; i++) m[i] = gra[i] < thr ? 1 : 0;
    svid.postMessage({ id: q.id, halli: maelaHallaMyndar(m, W, H), sk: g0.sk });
  } catch (err) {
    svid.postMessage({ id: q.id, villa: err instanceof Error ? err.message : String(err) });
  }
}

svid.onmessage = (e) => {
  const q = e.data;
  try {
    if (q.verk === "halliblad") {
      void halliUrBlobi(q);
      return;
    }
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
