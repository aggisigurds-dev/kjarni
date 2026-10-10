// „Smella á línu" (Veggir-hamur, Agnar 10.10.2026): dreginn veggur festist á línur teikningarinnar UNDIR honum. Myndin
// (eignin á borðinu) er lesin einu sinni í grátóna vinnumynd (≤ 3000 dílar á langhlið) og geymd í minni á meðan; sjálf
// mælingin er hrein (veggja-linur.ts smellaALinu). Engin skrif: aðeins lesið úr eigninni sem þegar er í vafranum.

import { getAssetBlob } from "./assets";
import { graTonar } from "./skonnun-veggir";
import { useBoardStore } from "./store";
import type { ImageObject } from "./types";
import { smellaALinu, type Pt } from "./veggja-linur";

interface GraMynd {
  gra: Uint8Array;
  W: number;
  H: number;
}

const minni = new Map<string, GraMynd | "hled" | "villa">();
const LANGHLID = 3000;

async function lesa(assetId: string): Promise<void> {
  const blob = getAssetBlob(assetId);
  if (!blob) {
    minni.delete(assetId);
    return;
  }
  try {
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, LANGHLID / Math.max(bmp.width, bmp.height));
    const W = Math.max(1, Math.round(bmp.width * k)), H = Math.max(1, Math.round(bmp.height * k));
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const x = c.getContext("2d", { willReadFrequently: true });
    if (!x) throw new Error("enginn strigi");
    x.fillStyle = "#fff";
    x.fillRect(0, 0, W, H);
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = "high";
    x.drawImage(bmp, 0, 0, W, H);
    bmp.close();
    minni.set(assetId, { gra: graTonar(x.getImageData(0, 0, W, H).data, W, H), W, H });
    c.width = 0;
    c.height = 0;
  } catch (err) {
    console.warn("[smella á línu] myndin las ekki", err);
    minni.set(assetId, "villa");
  }
}

/** Les myndir teikninganna á borðinu í minni (kallað þegar Veggir-hamur opnast) — svo fyrsti veggurinn smelli strax. */
export function forhladaTeikningar() {
  for (const o of useBoardStore.getState().objects) {
    if (o.type !== "image" || o.hidden || minni.has(o.assetId)) continue;
    minni.set(o.assetId, "hled");
    void lesa(o.assetId);
  }
}

/** Teikningin undir punktinum (efsta, ósnúin). */
function teikningUndir(x: number, y: number): ImageObject | null {
  const myndir = useBoardStore.getState().objects.filter((o): o is ImageObject => o.type === "image" && !o.hidden && !o.rotation);
  for (let i = myndir.length - 1; i >= 0; i--) {
    const m = myndir[i];
    if (x >= m.x && y >= m.y && x <= m.x + m.width && y <= m.y + m.height) return m;
  }
  return null;
}

/** Dreginn veggur A→B (heimshnit) festur á línur teikningarinnar undir. `vik` = leitarradíus (heimseiningar), `dpm` =
 * borðdílar á metra. Skilar null ef engin teikning / mynd ekki lesin enn / engin lína nálægt — þá gildir dreginn veggur. */
export function smellaVeggAMynd(
  A: Pt,
  B: Pt,
  st: { vik: number; dpm: number | null; fastir?: [boolean, boolean] }
): { A: Pt; B: Pt; thykkt: number | null } | null {
  const m = teikningUndir((A[0] + B[0]) / 2, (A[1] + B[1]) / 2);
  if (!m || m.width <= 0 || m.height <= 0) return null;
  const g = minni.get(m.assetId);
  if (!g) {
    minni.set(m.assetId, "hled");
    void lesa(m.assetId);
    return null;
  }
  if (g === "hled" || g === "villa") return null;
  const kx = g.W / m.width, ky = g.H / m.height;
  const iMynd = (p: Pt): Pt => [(p[0] - m.x) * kx, (p[1] - m.y) * ky];
  const aBord = (p: Pt): Pt => [m.x + p[0] / kx, m.y + p[1] / ky];
  const r = smellaALinu(g.gra, g.W, g.H, iMynd(A), iMynd(B), {
    dpm: st.dpm && st.dpm > 0 ? st.dpm * kx : null,
    radius: Math.max(3, st.vik * kx),
    fastir: st.fastir,
  });
  if (!r) return null;
  return { A: aBord(r.A), B: aBord(r.B), thykkt: r.thykkt != null ? r.thykkt / kx : null };
}
