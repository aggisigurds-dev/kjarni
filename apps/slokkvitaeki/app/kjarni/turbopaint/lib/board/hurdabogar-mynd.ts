// Hurðagreining á teikningunni á borðinu (vafrinn): myndin lesin úr eignasafninu, minnkuð niður í ≤ 64 dílar á metra
// (mest 7.000 dílar á hlið, lágmarks-samþjöppun svo daufir bogar lifi), bogar fundnir (hurdabogar.ts) og færðir í
// borðhnit. Svo hurðir úr bilum veggjanna (hurdagreining.ts, bogi staðfestur af greindum bogum) + hurðir úr bogum þar
// sem veggurinn brúar gatið. Sama ferli í „Finna hurðir" (Veggir-hamur) og sjálfvirka verkferlinu.

import { getAssetBlob } from "./assets";
import { finnaHurdir } from "./hurdagreining";
import { bogaProf, finnaHurdaboga, hurdirUrBogum, minnka, nyjarBogahurdir, type Bogi, type Gratona } from "./hurdabogar";
import type { ImageObject } from "./types";
import { SJALFGEFIN_VIKMORK, type HLina, type Vikmork } from "./veggja-hreinsun";

export type Rammi = { x0: number; y0: number; x1: number; y1: number };

const MARK_DPM = 64;
const MARK_HLID = 7000;

/** Bogar teikningarinnar `plan` (borðhnit) innan `kassi` (borðhnit; vantar = öll myndin). `dpmBord` = borðdílar á metra. */
export async function bogarTeikningar(plan: ImageObject, dpmBord: number, kassi?: Rammi | null): Promise<{ bogar: Bogi[]; ms: number }> {
  const t0 = performance.now();
  const blob = getAssetBlob(plan.assetId);
  if (!blob) throw new Error("Teikningin er ekki í minni — opnaðu borðið aftur");
  const heil = await createImageBitmap(blob);
  const iw = heil.width, ih = heil.height;
  heil.close();
  const kx = iw / plan.width, ky = ih / plan.height;
  const ix0 = kassi ? Math.max(0, Math.floor((kassi.x0 - plan.x) * kx)) : 0;
  const iy0 = kassi ? Math.max(0, Math.floor((kassi.y0 - plan.y) * ky)) : 0;
  const ix1 = kassi ? Math.min(iw, Math.ceil((kassi.x1 - plan.x) * kx)) : iw;
  const iy1 = kassi ? Math.min(ih, Math.ceil((kassi.y1 - plan.y) * ky)) : ih;
  const rw = ix1 - ix0, rh = iy1 - iy0;
  if (rw < 32 || rh < 32) return { bogar: [], ms: 0 };
  const dpmMynd = dpmBord * kx;
  const s = Math.min(1, MARK_DPM / dpmMynd, MARK_HLID / Math.max(rw, rh));
  // Stór minnkun: teiknað í 2× og svo lágmarks-samþjappað (mjúk minnkun í einu skrefi lýsir mjóar línur út).
  const tvo = s < 0.5;
  const W = Math.max(1, Math.round(rw * s * (tvo ? 2 : 1))), H = Math.max(1, Math.round(rh * s * (tvo ? 2 : 1)));
  const bmp = await createImageBitmap(blob, ix0, iy0, rw, rh, { resizeWidth: W, resizeHeight: H, resizeQuality: "high" });
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d", { willReadFrequently: true });
  if (!x) throw new Error("Gat ekki opnað striga");
  x.fillStyle = "#fff";
  x.fillRect(0, 0, W, H);
  x.drawImage(bmp, 0, 0);
  bmp.close();
  const d = x.getImageData(0, 0, W, H).data;
  c.width = 0;
  c.height = 0;
  let g: Gratona = { w: W, h: H, d: new Uint8Array(W * H) };
  for (let i = 0, j = 0; i < W * H; i++, j += 4) g.d[i] = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
  if (tvo) g = minnka(g, 2);
  const sx = g.w / rw, sy = g.h / rh;
  const bogar = finnaHurdaboga(g, dpmMynd * (sx + sy) / 2);
  // myndhnit vinnumyndar → borðhnit
  const bord = bogar.map((b) => ({
    ...b,
    c: [plan.x + (ix0 + b.c[0] / sx) / kx, plan.y + (iy0 + b.c[1] / sy) / ky] as [number, number],
    r: b.r / ((sx * kx + sy * ky) / 2),
  }));
  return { bogar: bord, ms: Math.round(performance.now() - t0) };
}

export interface HurdaLeit {
  hurdir: HLina[];
  bogar: number;
  urBilum: number;
  urBogum: number;
  ms: number;
}

/** Hurðir á teikningunni: úr bilum `veggir` (bogi staðfestur af greindum bogum) + úr bogum þar sem veggurinn brúar gatið.
 * `adrar` = hurðir og gler sem fyrir eru (þar kemur engin ný hurð). Allt í borðhnitum. */
export async function hurdirTeikningar(
  plan: ImageObject,
  veggir: HLina[],
  adrar: HLina[],
  dpmBord: number,
  st: { kassi?: Rammi | null; vik?: Vikmork["hurd"] } = {}
): Promise<HurdaLeit> {
  const { bogar, ms } = await bogarTeikningar(plan, dpmBord, st.kassi);
  const bil = veggir.length ? finnaHurdir(veggir, adrar, dpmBord, { vik: st.vik ?? SJALFGEFIN_VIKMORK.hurd, bogi: bogaProf(bogar, dpmBord) }) : null;
  const urBilum: HLina[] = bil ? bil.hurdir.map((h) => ({ p: h.p, t: h.t, tegund: "hurd" })) : [];
  const urBogum = nyjarBogahurdir(hurdirUrBogum(bogar, veggir, dpmBord, { krefjastVeggjar: true }), [...urBilum, ...adrar], dpmBord).map(
    (h): HLina => ({ p: h.p, t: h.t, tegund: "hurd" })
  );
  return { hurdir: [...urBilum, ...urBogum], bogar: bogar.length, urBilum: urBilum.length, urBogum: urBogum.length, ms };
}
