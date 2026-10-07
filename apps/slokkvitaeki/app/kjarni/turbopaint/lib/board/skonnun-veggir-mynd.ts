// Vafraleið veggjagreiningar skönnunar: teikningin á borðinu → grátóna vinnumynd af húsinu (skurði hæðarinnar) í föstum
// kvarða blaðsins → skonnunarVeggir (í vinnuþræði) → veggir í borðhnitum. Sama greining og Teikning-glugginn (383).

import { getAssetBlob } from "./assets";
import {
  butarIBord,
  graTonar,
  greiningarSvaedi,
  skonnunarVeggir,
  type SkonnunarVeggir,
  type Talning,
} from "./skonnun-veggir";
import type { VeggTegund } from "./teikning-veggir";
import type { ImageObject } from "./types";

export interface VeggirSkonnunar {
  /** Veggir og gler í borðhnitum (miðlína + þykkt + tegund). */
  veggir: { p: number[]; t: number; tegund?: VeggTegund }[];
  talning: Talning;
  ms: number;
}

const andaUI = () => new Promise<void>((r) => setTimeout(r, 0));

/** Grátónamynd svæðisins: minnkað í helmingsþrepum (stór minnkun í einu skrefi tekur fáa díla — sbr. skonnun.ts). */
async function vinnumynd(bmp: ImageBitmap, g: ReturnType<typeof greiningarSvaedi>): Promise<Uint8Array> {
  {
    const u = g.uppspretta;
    let src: CanvasImageSource = bmp;
    let sx = u.x, sy = u.y, sw = u.w, sh = u.h;
    while (sw > g.W * 2 || sh > g.H * 2) {
      const nw = Math.max(g.W, Math.ceil(sw / 2)), nh = Math.max(g.H, Math.ceil(sh / 2));
      const c = document.createElement("canvas");
      c.width = nw;
      c.height = nh;
      const x = c.getContext("2d");
      if (!x) throw new Error("Gat ekki opnað striga");
      x.fillStyle = "#fff";
      x.fillRect(0, 0, nw, nh);
      x.imageSmoothingEnabled = true;
      x.imageSmoothingQuality = "high";
      x.drawImage(src, sx, sy, sw, sh, 0, 0, nw, nh);
      if (src instanceof HTMLCanvasElement) {
        src.width = 0;
        src.height = 0;
      }
      src = c;
      sx = 0;
      sy = 0;
      sw = nw;
      sh = nh;
      await andaUI();
    }
    const c = document.createElement("canvas");
    c.width = g.W;
    c.height = g.H;
    const x = c.getContext("2d", { willReadFrequently: true });
    if (!x) throw new Error("Gat ekki opnað striga");
    x.fillStyle = "#fff";
    x.fillRect(0, 0, g.W, g.H);
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = "high";
    x.drawImage(src, sx, sy, sw, sh, 0, 0, g.W, g.H);
    if (src instanceof HTMLCanvasElement) {
      src.width = 0;
      src.height = 0;
    }
    const gra = graTonar(x.getImageData(0, 0, g.W, g.H).data, g.W, g.H);
    c.width = 0;
    c.height = 0;
    return gra;
  }
}

/** Keyrir greininguna í vinnuþræði; á aðalþræðinum ef þráðurinn fæst ekki. */
function keyra(gra: Uint8Array, W: number, H: number, kvardi: number, fb: number, fh: number): Promise<SkonnunarVeggir> {
  let w: Worker | null = null;
  try {
    w = new Worker(new URL("./skonnun-veggir-verk.ts", import.meta.url));
  } catch {
    w = null;
  }
  if (!w) return Promise.resolve(skonnunarVeggir(gra, W, H, kvardi, fb, fh));
  const verk = w;
  return new Promise<SkonnunarVeggir>((res, rej) => {
    verk.onmessage = (e: MessageEvent<SkonnunarVeggir & { villa?: string }>) => {
      verk.terminate();
      if (e.data.villa) rej(new Error(e.data.villa));
      else res(e.data);
    };
    verk.onerror = (e) => {
      verk.terminate();
      // vinnuþráðurinn ræstist ekki (t.d. gamall vafri) — reikna hér í staðinn
      try {
        res(skonnunarVeggir(gra, W, H, kvardi, fb, fh));
      } catch (err) {
        rej(err instanceof Error ? err : new Error(e.message || "Veggjagreining mistókst"));
      }
    };
    verk.postMessage({ id: 1, gra, W, H, kvardi, fb, fh });
  });
}

/** Veggir skannaðrar teikningar (sama greining og Teikning-glugginn) í borðhnitum. Gler fylgir sem tegundin „gler";
 * hurðargötin ekki — Teikning finnur þau sjálf úr bilunum. */
export async function greinaVeggiSkonnunar(plan: ImageObject, onProgress?: (percent: number) => void): Promise<VeggirSkonnunar> {
  const t0 = performance.now();
  const blob = getAssetBlob(plan.assetId);
  if (!blob) throw new Error("Teikningin er ekki í minni — opnaðu borðið aftur");
  onProgress?.(10);
  const bmp = await createImageBitmap(blob);
  const g = greiningarSvaedi(plan, { w: bmp.width, h: bmp.height });
  onProgress?.(20);
  let gra: Uint8Array;
  try {
    gra = await vinnumynd(bmp, g);
  } finally {
    bmp.close();
  }
  onProgress?.(40);
  const r = await keyra(gra, g.W, g.H, g.kvardi, g.frum.b, g.frum.h);
  onProgress?.(95);
  const veggir = [
    ...butarIBord(r.veggir, g, plan),
    ...butarIBord(r.gler, g, plan).map((v) => ({ ...v, tegund: "gler" as VeggTegund })),
  ];
  const ms = Math.round(performance.now() - t0);
  return { veggir, talning: { ...r.talning, ms }, ms };
}
