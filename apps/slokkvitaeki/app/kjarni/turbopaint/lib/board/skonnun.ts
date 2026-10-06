// Skörp skönnun á borðið (3. áfangi, Agnar 06.10.2026 — TurboPaint verður eina vinnuborð grunnmynda; myndgæðin úr
// Teikning-glugganum, 438-teikning-skarpt.js, koma hingað).
//
// Skönnuð teikning skjalasafnsins (…/<skrá>.tif.info) kemur á borðið úr TAPLAUSA TIF-frumritinu í stað 6006 px
// JPEG-sins (suð og loðnir stafir). Úttektarmerkin eru þó vistuð í dílum JPEG-sins, svo JPEG-ið er sótt líka og notað
// sem viðmið:
//   1. JPEG (fetch-plan prefer=image — sama mynd og Teikning-glugginn sýnir og merkin miðast við) → frum b × h
//   2. TIF (teikn-pdf, sem skilar image/tiff fyrir .tif.info; til vara fetch-plan prefer=tif)
//   3. vinnuþráður: afkóðun, val snúnings (TIFF Orientation + fylgni við JPEG-ið, allir átta snúningarnir)
//   4. hliðrun TIF → JPEG mæld á níu reitum með ⅓ díls nákvæmni (438 hlidrun), miðgildið notað
//   5. TIF-ið endursýnt í ramma JPEG-sins, í upplausn frumritsins (Staðall ≤ 7,2k, Há gæði ≤ 12,5k, ≤ 40 MP)
// Borðmyndin fær stærð JPEG-sins (borðeiningar = JPEG-dílar), svo merki og veggir lenda nákvæmlega þar sem þau lentu
// á JPEG-inu. Mistakist eitthvað (TIF næst ekki, passar ekki) er JPEG-ið notað eins og áður.

import { canvasToBlob } from "./assets";
import { PDF_SAFE_AREA } from "./import-limits";
import { boostSheetCanvas } from "./sheet-contrast";
import { fylgni, midgildi, rammaStaerd, snuningsKostir, type SnuningsKostur } from "./skonnun-kjarni";
import { SLOKKVITAEKI_ROT } from "./teikn-thjonusta";
import { IMPORT_MAX_PX, type ImportQuality } from "./types";

/** Skönnuð teikning skjalasafns Reykjavíkur: FotoWeb-permalinkur á TIF. */
export function erSkonnunarSlod(slod: string): boolean {
  try {
    const u = new URL(slod);
    return u.hostname === "skjalasafn.reykjavik.is" && /\.tiff?\.info$/i.test(u.pathname);
  } catch {
    return false;
  }
}

/** Langhlið cache-JPEG safnsins — TIF borgar sig aðeins ef gæðastigið leyfir stærri mynd en það. */
export const JPEG_LANGHLID = 6006;
export function tifBorgarSig(quality: ImportQuality): boolean {
  return IMPORT_MAX_PX[quality] > JPEG_LANGHLID;
}

export function teiknPdfSlod(permalink: string): string {
  return `${SLOKKVITAEKI_ROT}/.netlify/functions/teikn-pdf?url=${encodeURIComponent(permalink)}`;
}

type Framvinda = (prosent: number, skilabod: string) => void;
type Svar = Record<string, unknown> & { id: number; villa?: string; framvinda?: number };

export interface SkarpSkonnun {
  ok: true;
  /** Borðmyndin (JPEG 0,9) í ramma JPEG-sins. */
  blob: Blob;
  nafn: string;
  /** Stærð JPEG-sins = stærð myndarinnar á borðinu (borðeiningar). */
  frum: { b: number; h: number };
  /** Dílar borðmyndarinnar. */
  upplausn: { w: number; h: number };
  tif: {
    W: number;
    H: number;
    /** TIFF Orientation-merkið í skránni. */
    merki: number;
    /** Snúningurinn sem fylgnin valdi. */
    o: number;
    fylgni: number;
    kp: number;
    fx: number;
    fy: number;
    reitir: { x: number; y: number; dx: number; dy: number; c: number }[];
  };
}
export interface JpegVaraleid {
  ok: false;
  villa: string;
  /** JPEG skjalasafnsins (ef það náðist) — sett á borðið í stað TIF-sins. */
  jpeg: Blob | null;
  nafn: string;
}

class Verk {
  private w: Worker;
  private n = 0;
  private bid = new Map<number, { res: (d: Svar) => void; rej: (e: Error) => void; framvinda?: (h: number) => void }>();
  constructor() {
    this.w = new Worker(new URL("./skonnun-verk.ts", import.meta.url));
    this.w.onmessage = (e: MessageEvent<Svar>) => {
      const b = this.bid.get(e.data.id);
      if (!b) return;
      if (typeof e.data.framvinda === "number" && !("px" in e.data)) {
        b.framvinda?.(e.data.framvinda);
        return;
      }
      this.bid.delete(e.data.id);
      if (e.data.villa) b.rej(new Error(e.data.villa));
      else b.res(e.data);
    };
    this.w.onerror = (e) => {
      for (const [, b] of this.bid) b.rej(new Error(e.message || "vinnuþráður"));
      this.bid.clear();
    };
  }
  senda(sk: Record<string, unknown>, flutt: Transferable[] = [], framvinda?: (h: number) => void): Promise<Svar> {
    const id = ++this.n;
    return new Promise((res, rej) => {
      this.bid.set(id, { res, rej, framvinda });
      this.w.postMessage({ id, ...sk }, flutt);
    });
  }
  loka() {
    this.w.terminate();
    for (const [, b] of this.bid) b.rej(new Error("hætt"));
    this.bid.clear();
  }
}

async function saekjaMedThaki(slod: string, ms: number): Promise<Response | null> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(slod, { signal: ac.signal });
    return r.ok ? r : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** JPEG-ið (ImageBitmap) sem n × n grátónanet. Minnkað í helmingsþrepum — annars tekur skjákortið fáa díla úr ~100×
 * minnkun og fylgnin fellur (438 synishorn, mælt í vafra Agnars 05.10.2026). */
function synishornJpeg(mynd: ImageBitmap, n: number): Float32Array {
  let src: CanvasImageSource = mynd;
  let w = mynd.width, h = mynd.height;
  while (w > n * 2 || h > n * 2) {
    const nw = Math.max(n, Math.ceil(w / 2)), nh = Math.max(n, Math.ceil(h / 2));
    const t = document.createElement("canvas");
    t.width = nw;
    t.height = nh;
    const tx = t.getContext("2d")!;
    tx.fillStyle = "#fff";
    tx.fillRect(0, 0, nw, nh);
    tx.imageSmoothingEnabled = true;
    tx.imageSmoothingQuality = "high";
    tx.drawImage(src, 0, 0, nw, nh);
    src = t;
    w = nw;
    h = nh;
  }
  const c = document.createElement("canvas");
  c.width = n;
  c.height = n;
  const x = c.getContext("2d", { willReadFrequently: true })!;
  x.fillStyle = "#fff";
  x.fillRect(0, 0, n, n);
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = "high";
  x.drawImage(src, 0, 0, n, n);
  const d = x.getImageData(0, 0, n, n).data, a = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) a[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
  return a;
}

function gra(cv: HTMLCanvasElement): Float32Array {
  const d = cv.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, cv.width, cv.height).data;
  const a = new Float32Array(cv.width * cv.height);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2];
  return a;
}

/** HLIÐRUN TIF → JPEG (438 hlidrun; mælt 05.10.2026 á Þingholti: JPEG-ið situr 3,4 díla neðar og 0,75 til vinstri,
 * jafnt yfir allt blaðið). N × N JPEG-reitir á níu stöðum innan `fokus`, TIF-svæðið sama staðar teiknað í JPEG-kvarða,
 * hvort tveggja þrefaldað (SUB) og besta hliðrun hvers reits fundin (gróf leit, svo fín). Auðir reitir sleppa. */
async function hlidrun(
  verk: Verk,
  mynd: ImageBitmap,
  k: SnuningsKostur,
  fokus: { x: number; y: number; w: number; h: number }
): Promise<{ fx: number; fy: number; reitir: { x: number; y: number; dx: number; dy: number; c: number }[] }> {
  const N = 160, D = 8, SUB = 3, G = N * SUB, M = (N + 2 * D) * SUB, kp = k.kp;
  const reitir: { x: number; y: number; dx: number; dy: number; c: number }[] = [];
  for (const b of [0.25, 0.5, 0.75]) {
    for (const a of [0.25, 0.5, 0.75]) {
      const fx0 = Math.round(fokus.x + a * fokus.w - N / 2), fy0 = Math.round(fokus.y + b * fokus.h - N / 2);
      if (fx0 < D || fy0 < D || fx0 + N + D > mynd.width || fy0 + N + D > mynd.height) continue;
      const j = document.createElement("canvas");
      j.width = G;
      j.height = G;
      const jx = j.getContext("2d", { willReadFrequently: true })!;
      jx.fillStyle = "#fff";
      jx.fillRect(0, 0, G, G);
      jx.imageSmoothingQuality = "high";
      jx.drawImage(mynd, fx0, fy0, N, N, 0, 0, G, G);
      const A = gra(j);
      let ma = 0;
      for (let i = 0; i < A.length; i++) ma += A[i];
      ma /= A.length;
      let va = 0;
      for (let i = 0; i < A.length; i += 7) va += (A[i] - ma) ** 2;
      if (va / (A.length / 7) < 400) continue; // auður reitur — segir ekkert um hliðrun
      const tx0 = Math.max(0, Math.floor((fx0 - D) / kp) - 1), ty0 = Math.max(0, Math.floor((fy0 - D) / kp) - 1);
      const tw = Math.min(k.dW - tx0, Math.ceil((N + 2 * D) / kp) + 3), th = Math.min(k.dH - ty0, Math.ceil((N + 2 * D) / kp) + 3);
      if (tw < 8 || th < 8) continue;
      const r = await verk.senda({ cmd: "skera", o: k.o, x: tx0, y: ty0, w: tw, h: th });
      const tcv = document.createElement("canvas");
      tcv.width = tw;
      tcv.height = th;
      tcv.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(r.px as ArrayBuffer), tw, th), 0, 0);
      const t = document.createElement("canvas");
      t.width = M;
      t.height = M;
      const tc = t.getContext("2d", { willReadFrequently: true })!;
      tc.fillStyle = "#fff";
      tc.fillRect(0, 0, M, M);
      tc.imageSmoothingQuality = "high";
      tc.setTransform(SUB * kp, 0, 0, SUB * kp, (tx0 * kp - (fx0 - D)) * SUB, (ty0 * kp - (fy0 - D)) * SUB);
      tc.drawImage(tcv, 0, 0);
      const B = gra(t);
      const fyl = (dx: number, dy: number, sk2: number) => {
        let sa = 0, sb = 0, sab = 0, saa = 0, sbb = 0, n = 0;
        for (let y = 0; y < G; y += sk2) {
          const ra = y * G, rb = (y + D * SUB + dy) * M + D * SUB + dx;
          for (let x = 0; x < G; x += sk2) {
            const p = A[ra + x], q2 = B[rb + x];
            sa += p;
            sb += q2;
            sab += p * q2;
            saa += p * p;
            sbb += q2 * q2;
            n++;
          }
        }
        const v = (saa / n - (sa / n) ** 2) * (sbb / n - (sb / n) ** 2);
        return v > 0 ? (sab / n - (sa / n) * (sb / n)) / Math.sqrt(v) : 0;
      };
      let best = { dx: 0, dy: 0, c: -2 };
      for (let dy = -D * SUB; dy <= D * SUB; dy += SUB) {
        for (let dx = -D * SUB; dx <= D * SUB; dx += SUB) {
          const c = fyl(dx, dy, 3);
          if (c > best.c) best = { dx, dy, c };
        }
      }
      const g = best;
      for (let dy = g.dy - SUB + 1; dy <= g.dy + SUB - 1; dy++) {
        for (let dx = g.dx - SUB + 1; dx <= g.dx + SUB - 1; dx++) {
          if (Math.abs(dx) > D * SUB || Math.abs(dy) > D * SUB) continue;
          const c = fyl(dx, dy, 2);
          if (c > best.c) best = { dx, dy, c };
        }
      }
      if (best.c > 0.75) reitir.push({ x: fx0 + N / 2, y: fy0 + N / 2, dx: -best.dx / SUB, dy: -best.dy / SUB, c: +best.c.toFixed(3) });
    }
  }
  if (reitir.length < 2) throw new Error(`TIF passar ekki við JPEG-ið (${reitir.length} af 9 reitum)`);
  return { fx: midgildi(reitir.map((r) => r.dx)), fy: midgildi(reitir.map((r) => r.dy)), reitir };
}

/** Sækir skörpu skönnunina. `fokus` = svæði hússins í JPEG-dílum (skurður úttektar) — hliðrunin er mæld þar. */
export async function saekjaSkarpaSkonnun(
  permalink: string,
  quality: ImportQuality,
  opts: { fokus?: { x: number; y: number; w: number; h: number } | null; framvinda?: Framvinda } = {}
): Promise<SkarpSkonnun | JpegVaraleid> {
  const fv: Framvinda = opts.framvinda ?? (() => {});
  const grunnnafn = decodeURIComponent(new URL(permalink).pathname.split("/").pop() || "teikning").replace(/\.info$/i, "").replace(/\.tiff?$/i, "");
  fv(5, "Sæki teikningu skjalasafnsins (viðmið)…");
  const jr = await saekjaMedThaki(`/api/turbopaint/fetch-plan?prefer=image&url=${encodeURIComponent(permalink)}`, 90000);
  const jpeg = jr ? await jr.blob() : null;
  if (!jpeg || !/^image\/(jpe?g|png)/i.test(jpeg.type)) return { ok: false, villa: "Náði ekki í JPEG skjalasafnsins", jpeg: null, nafn: grunnnafn };
  const vara = (villa: string): JpegVaraleid => ({ ok: false, villa, jpeg, nafn: grunnnafn });
  let mynd: ImageBitmap | null = null;
  let verk: Verk | null = null;
  try {
    mynd = await createImageBitmap(jpeg);
    const frum = { b: mynd.width, h: mynd.height };
    fv(15, "Sæki TIF-frumritið (taplaust)…");
    let tr = await saekjaMedThaki(teiknPdfSlod(permalink), 60000);
    if (!tr || !/tiff/i.test(tr.headers.get("content-type") || "")) {
      tr = await saekjaMedThaki(`/api/turbopaint/fetch-plan?prefer=tif&url=${encodeURIComponent(permalink)}`, 90000);
    }
    if (!tr || !/tiff/i.test(tr.headers.get("content-type") || "")) return vara("TIF-frumritið náðist ekki — JPEG skjalasafnsins notað");
    const buf = await tr.arrayBuffer();
    fv(35, "Afþjappa TIF…");
    try {
      verk = new Verk();
    } catch {
      return vara("Vafrinn leyfði ekki vinnuþráð — JPEG skjalasafnsins notað");
    }
    const tif = await verk.senda({ cmd: "saekja", buf }, [buf]);
    const W = tif.W as number, H = tif.H as number, merki = (tif.o as number) || 1;
    const kostir = snuningsKostir(W, H, frum);
    if (!kostir.length) return vara(`TIF ${W}×${H} passar ekki við JPEG ${frum.b}×${frum.h} — JPEG notað`);
    fv(45, "Finn snúning TIF-sins…");
    const n = 40;
    const a = synishornJpeg(mynd, n);
    const s = await verk.senda({ cmd: "syni", n, c: kostir.map((k) => ({ o: k.o })) });
    const ut = s.ut as Float32Array[];
    let best: (SnuningsKostur & { r: number }) | null = null;
    const fylgnir = kostir.map((k, i) => {
      const r = fylgni(a, ut[i]);
      if (!best || r > best.r) best = { ...k, r };
      return `${k.o}:${r.toFixed(2)}`;
    });
    const b = best as (SnuningsKostur & { r: number }) | null;
    console.info(`[skonnun] TIF ${W}×${H} merki ${merki} → snúningur ${b?.o} (fylgni ${fylgnir.join(" ")})`);
    if (!b || b.r < 0.3) return vara(`TIF passar ekki við JPEG-ið (fylgni ${b ? b.r.toFixed(2) : "–"}) — JPEG notað`);
    fv(55, "Stilli TIF-ið við teikninguna…");
    const fokus = opts.fokus && opts.fokus.w > 200 && opts.fokus.h > 200 ? opts.fokus : { x: 0, y: 0, w: frum.b, h: frum.h };
    let hl;
    try {
      hl = await hlidrun(verk, mynd, b, fokus);
    } catch (e) {
      return vara((e instanceof Error ? e.message : "Hliðrun mistókst") + " — JPEG notað");
    }
    console.info(
      `[skonnun] hliðrun TIF → JPEG ${hl.fx.toFixed(2)}, ${hl.fy.toFixed(2)} díll (${hl.reitir.length} reitir: ` +
        hl.reitir.map((r) => `${r.dx.toFixed(2)},${r.dy.toFixed(2)}@${r.c}`).join(" ") + ")"
    );
    const stofn = rammaStaerd(b.dW, frum, IMPORT_MAX_PX[quality], PDF_SAFE_AREA);
    fv(65, `Teikna skarpa mynd ${stofn.w}×${stofn.h}…`);
    const t = await verk.senda(
      { cmd: "teikna", o: b.o, w: stofn.w, h: stofn.h, frum, vorpun: { kpx: b.kp, kpy: b.kp, fx: hl.fx, fy: hl.fy } },
      [],
      (h) => fv(65 + Math.round(h * 25), `Teikna skarpa mynd ${stofn.w}×${stofn.h}…`)
    );
    verk.loka();
    verk = null;
    fv(92, "Vista mynd…");
    const c = document.createElement("canvas");
    c.width = stofn.w;
    c.height = stofn.h;
    const cx = c.getContext("2d");
    if (!cx) return vara("Gat ekki opnað canvas — JPEG notað");
    cx.putImageData(new ImageData(new Uint8ClampedArray(t.px as ArrayBuffer), stofn.w, stofn.h), 0, 0);
    boostSheetCanvas(c);
    const blob = await canvasToBlob(c, "image/jpeg", 0.9);
    c.width = 0;
    c.height = 0;
    return {
      ok: true,
      blob,
      nafn: grunnnafn,
      frum,
      upplausn: stofn,
      tif: { W, H, merki, o: b.o, fylgni: +b.r.toFixed(3), kp: b.kp, fx: hl.fx, fy: hl.fy, reitir: hl.reitir },
    };
  } catch (e) {
    return vara((e instanceof Error ? e.message : "Skörp skönnun mistókst") + " — JPEG notað");
  } finally {
    verk?.loka();
    mynd?.close();
  }
}
