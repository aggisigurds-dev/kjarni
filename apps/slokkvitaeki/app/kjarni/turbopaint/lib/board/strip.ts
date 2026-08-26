import { canvasToBlob, getAssetBlob, putAsset } from "./assets";
import type { OcrWord } from "./firewall-rating";
import { newId } from "./ids";
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
