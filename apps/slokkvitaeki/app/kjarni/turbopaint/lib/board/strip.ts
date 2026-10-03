import { canvasToBlob, getAssetBlob, putAsset } from "./assets";
import type { OcrWord } from "./firewall-rating";
import { newId } from "./ids";
import { midlinurUrMaska, type Midlina } from "./midlinur";
import { flokkaPdfLinur, paraVeggi, veljaVeggjaflokk, type PdfOps } from "./pdf-veggir";
import { PDFJS_WORKER_SRC, pdfJsDocumentOptions } from "./pdfjs-setup";
import { finnaVeggi, sjalfgefnarVeggjaStillingar, type VeggjaNidurstada } from "./veggir";
import { siaRgba, sjalfgefinVeggthykkt, teljaFlokka, type SiaFlokkur, type SiaUrGlugga } from "./siur";
import type { ImageObject } from "./types";

// „Strip": hreinsar skannaða teikningu niður í svart blek á hvítum grunni.
// Reglan per pixil: haldið ef hann er nógu dökkur OG nálægt gráskala —
// gulur/grár bakgrunnur, skygging og lituð yfirstrikun (rautt/bleikt) hverfa,
// veggir og svartur texti standa eftir.

export interface StripResult {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

const CHUNK_ROWS = 400;

/** Hleypir viðmótinu að (framvindustika) — setTimeout, ekki rAF: rAF stöðvast í földum flipa og síunin hengi. */
const andaUI = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

export async function stripToInk(
  plan: ImageObject,
  threshold: number,
  onProgress?: (percent: number) => void
): Promise<StripResult> {
  const blob = getAssetBlob(plan.assetId);
  if (!blob) throw new Error("Teikningin er ekki í minni — opnaðu borðið aftur");
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Gat ekki opnað canvas");
  ctx.drawImage(bmp, 0, 0);
  bmp.close();

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const cut = threshold * 255;
  const rowBytes = canvas.width * 4;

  for (let row = 0; row < canvas.height; row += CHUNK_ROWS) {
    const end = Math.min(canvas.height, row + CHUNK_ROWS);
    for (let i = row * rowBytes; i < end * rowBytes; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const max = Math.max(r, g, b);
      const sat = max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
      const ink = a > 60 && lum < cut && sat < 0.45;
      const v = ink ? 0 : 255;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
    onProgress?.(Math.round((end / canvas.height) * 100));
    await nextFrame();
  }

  ctx.putImageData(image, 0, 0);
  return { canvas, width: canvas.width, height: canvas.height };
}

/** Síur (veggir · þunnt blek · rautt · bleikt) á skjámynd teikningar. Skilar strigann og hversu margir dílar
 * lentu í hverjum flokki, svo hægt sé að segja „ekkert rautt fannst" í stað þess að skila hvítri síðu þegjandi. */
export async function siaTeikningu(
  plan: ImageObject,
  val: SiaUrGlugga,
  onProgress?: (percent: number) => void
): Promise<StripResult & { fjoldi: Record<SiaFlokkur, number>; veggthykkt: number }> {
  const blob = getAssetBlob(plan.assetId);
  if (!blob) throw new Error("Teikningin er ekki í minni — opnaðu borðið aftur");
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Gat ekki opnað canvas");
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  onProgress?.(15);
  await andaUI();
  const w = canvas.width, h = canvas.height;
  const image = ctx.getImageData(0, 0, w, h);
  const veggthykkt = Math.max(3, Math.round(sjalfgefinVeggthykkt(w) * val.veggStudull));
  const full = { ...val, veggthykkt };
  onProgress?.(30);
  await andaUI();
  const fjoldi = teljaFlokka(image.data, w, h, full);
  onProgress?.(60);
  await andaUI();
  image.data.set(siaRgba(image.data, w, h, full));
  ctx.putImageData(image, 0, 0);
  onProgress?.(100);
  return { canvas, width: w, height: h, fjoldi, veggthykkt };
}

/** Veggjagreining á skjámynd teikningar. `studull` > 1 leyfir þykkari veggi. Skilar kössunum í dílum myndarinnar
 * og stærð hennar, svo kallandinn geti varpað þeim á borðið. */
export async function greinaVeggiTeikningar(
  plan: ImageObject,
  studull = 1,
  onProgress?: (percent: number) => void
): Promise<Omit<VeggjaNidurstada, "maski"> & { midlinur: Midlina[]; breidd: number; haed: number }> {
  const blob = getAssetBlob(plan.assetId);
  if (!blob) throw new Error("Teikningin er ekki í minni — opnaðu borðið aftur");
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Gat ekki opnað canvas");
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  onProgress?.(20);
  await andaUI();
  const w = canvas.width, h = canvas.height;
  const data = ctx.getImageData(0, 0, w, h).data;
  canvas.width = 0;
  canvas.height = 0;
  onProgress?.(35);
  await andaUI();
  const st = sjalfgefnarVeggjaStillingar(w);
  st.hamarksThykkt = Math.round(st.hamarksThykkt * studull);
  st.fylltThykkt = Math.max(3, Math.round(st.fylltThykkt * studull));
  const { maski, ...nid } = finnaVeggi(data, w, h, st);
  onProgress?.(80);
  await andaUI();
  // Maskinn → miðlínur með þykkt (vektor). Blettir mun þykkari en veggur (stigaþrep, stimplar) detta út.
  const midlinur = midlinurUrMaska(maski, w, h, { lagmarksLengd: st.lagmarksLengd }).filter(
    (l) => l.thykkt <= st.hamarksThykkt * 1.6
  );
  onProgress?.(100);
  return { ...nid, midlinur, breidd: w, haed: h };
}

/** Veggir lesnir beint úr VIGUR-PDF teikningarinnar (frumskráin), þegar hún er til: veggjaflokkurinn (línuþykkt) valinn
 * og samsíða línur paraðar í veggi með þykkt. Skilar miðlínum í punktum síðunnar og stærð síðunnar — eða null ef
 * teikningin á ekkert vigur-PDF (skönnun, TIF, mynd) eða enginn línuflokkur líkist veggjum. */
export async function greinaVeggiUrPdf(
  plan: ImageObject,
  onProgress?: (percent: number) => void
): Promise<{ midlinur: Midlina[]; breidd: number; haed: number; flokkur: string } | null> {
  if (!plan.frumAssetId) return null;
  const { saekjaFrum } = await import("./persistence");
  const blob = await saekjaFrum(plan.frumAssetId);
  if (!blob) return null;
  const data = await blob.arrayBuffer();
  const haus = new Uint8Array(data, 0, Math.min(5, data.byteLength));
  if (String.fromCharCode(...haus) !== "%PDF-") return null;
  onProgress?.(15);
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
  const doc = await pdfjs.getDocument(pdfJsDocumentOptions(data)).promise;
  try {
    const sida = await doc.getPage((plan.frumSida ?? 0) + 1);
    const vp = sida.getViewport({ scale: 1 });
    // Skorin teikning (önnur hlutföll en síðan) passar ekki lengur við síðuhnitin — þá myndgreining.
    if (Math.abs(plan.width / plan.height / (vp.width / vp.height) - 1) > 0.01) return null;
    onProgress?.(35);
    const ol = await sida.getOperatorList();
    onProgress?.(70);
    await andaUI();
    const flokkar = flokkaPdfLinur(pdfjs.OPS as unknown as PdfOps, ol.fnArray, ol.argsArray, vp.transform);
    const val = veljaVeggjaflokk(flokkar, vp.width, vp.height);
    if (!val.valinn) return null;
    const veggir = paraVeggi(flokkar[val.valinn]);
    if (!veggir.length) return null;
    const midlinur: Midlina[] = veggir.map((v) => ({
      punktar: [v.a[0], v.a[1], v.b[0], v.b[1]],
      thykkt: v.thykkt,
      lengd: Math.hypot(v.b[0] - v.a[0], v.b[1] - v.a[1]),
    }));
    onProgress?.(100);
    return { midlinur, breidd: vp.width, haed: vp.height, flokkur: val.valinn };
  } finally {
    void doc.destroy();
  }
}

/** White-out OCR word boxes (raster px of the same canvas), small padding. */
export function whiteOutWords(canvas: HTMLCanvasElement, words: OcrWord[]) {
  if (!words.length) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#ffffff";
  for (const w of words) {
    ctx.fillRect(w.x - 2, w.y - 2, w.width + 4, w.height + 4);
  }
}

export async function canvasToAsset(canvas: HTMLCanvasElement) {
  const blob = await canvasToBlob(canvas);
  const assetId = newId();
  await putAsset(assetId, blob);
  return assetId;
}

/** E-30 / EI-60 / EI-CS style labels — the firewall vocabulary on drawings. */
export function isFirewallLabelWord(text: string) {
  return /^(ei|e)[\s._-]?(cs|\d{2,3})/i.test(text.trim());
}

/** Room-name-ish word: mostly letters, long enough to be a label. */
export function isNameWord(text: string) {
  const t = text.trim();
  if (t.length < 3) return false;
  const letters = (t.match(/[a-záðéíóúýþæö]/gi) ?? []).length;
  return letters >= Math.max(2, Math.ceil(t.length / 2));
}
