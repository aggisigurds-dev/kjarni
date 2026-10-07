import { getAssetBlob } from "./assets";
import { newId } from "./ids";
import type { EiMidi } from "./ei-festing";
import { collectFirewallHits, ratingColor, type FirewallHit, type FirewallRating, type OcrWord } from "./firewall-rating";
import { makeSymbol } from "./markup-kit";
import { getStampSize } from "./symbol-settings";
import type { BoardObject, ImageObject, RectObject, TextObject } from "./types";

export const FIREWALL_MARK_NAMES = ["Eldveggur", "Eldhurð", "Eldveggir"] as const;

const OCR_MAX = 5200;
const OCR_MIN = 3600;

const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Svart blek á hvítu fyrir OCR: rauð/bleik ský og lituð yfirstrikun sem
 * liggja yfir EI-merkingum á skönnuðum teikningum drekkja textanum annars.
 * Keyrt í bútum með yield svo aðalþráðurinn frjósi ekki (19M+ pixlar). */
async function binarizeForOcr(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const chunk = 2_000_000; // ~500k pixlar per bút
  for (let start = 0; start < data.length; start += chunk) {
    const end = Math.min(data.length, start + chunk);
    for (let i = start; i < end; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const max = Math.max(r, g, b);
      const sat = max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
      const ink = data[i + 3] > 60 && lum < 165 && sat < 0.45;
      const v = ink ? 0 : 255;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
    await yieldToUi();
  }
  ctx.putImageData(image, 0, 0);
}

/** Niðurskaluð kópía (litir halda sér). scale = dst/src. */
function fitCanvas(source: HTMLCanvasElement, maxLongest: number, minLongest = 0) {
  const longest = Math.max(source.width, source.height);
  let scale = 1;
  if (longest > maxLongest) scale = maxLongest / longest;
  else if (minLongest && longest < minLongest) scale = minLongest / longest;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Gat ekki stillt mynd fyrir greiningu");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return { canvas, scale };
}

type TesseractWorker = {
  setParameters: (params: Record<string, string>) => Promise<unknown>;
  recognize: (
    image: HTMLCanvasElement,
    options: Record<string, never>,
    output: { blocks: boolean; text: boolean }
  ) => Promise<{
    data: {
      blocks?: Array<{
        paragraphs: Array<{
          lines: Array<{
            words: Array<{
              text: string;
              confidence: number;
              bbox: { x0: number; y0: number; x1: number; y1: number };
            }>;
          }>;
        }>;
      }> | null;
      words?: Array<{
        text: string;
        confidence: number;
        bbox: { x0: number; y0: number; x1: number; y1: number };
      }>;
    };
  }>;
};

let workerPromise: Promise<TesseractWorker> | null = null;
let progressCb: ((message: string, percent: number) => void) | undefined;

async function getWorker(onProgress?: (message: string, percent: number) => void) {
  progressCb = onProgress;
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, PSM } = await import("tesseract.js");
      // SJÁLFHÝST í public/tesseract/ (afrit úr node_modules, sömu útgáfu):
      // new Worker(cross-origin CDN-slóð) er BANNAÐ í vöfrum, svo CDN-uppsetningin
      // gat aldrei ræst OCR í framleiðslu — það var "les ekkert"-veilan.
      // Uppfærist tesseract.js þarf að endurafrita worker.min.js + core-skrárnar.
      const worker = await createWorker("eng", 1, {
        workerPath: "/tesseract/worker.min.js",
        corePath: "/tesseract/tesseract-core-simd-lstm.wasm.js",
        langPath: "/tesseract/lang",
        workerBlobURL: false,
        logger: (m) => {
          if (!progressCb) return;
          if (m.status === "recognizing text") {
            progressCb("Les texta á teikningunni…", 55 + Math.round(m.progress * 30));
          } else if (m.status) {
            progressCb("Undirbý textalestur…", 40 + Math.round((m.progress || 0) * 12));
          }
        },
      });
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        user_defined_dpi: "220",
      });
      return worker as unknown as TesseractWorker;
    })();
  }
  return workerPromise;
}

function wordsFromResult(
  data: {
    blocks?: Awaited<ReturnType<TesseractWorker["recognize"]>>["data"]["blocks"];
    words?: Array<{
      text: string;
      confidence: number;
      bbox: { x0: number; y0: number; x1: number; y1: number };
    }>;
  },
  vertical: boolean
): OcrWord[] {
  const fromBlocks = wordsFromBlocks(data.blocks, vertical);
  if (fromBlocks.length) return fromBlocks;
  if (!data.words?.length) return [];
  return data.words.flatMap((word) => {
    const text = word.text?.trim();
    if (!text) return [];
    return [
      {
        text,
        x: word.bbox.x0,
        y: word.bbox.y0,
        width: Math.max(1, word.bbox.x1 - word.bbox.x0),
        height: Math.max(1, word.bbox.y1 - word.bbox.y0),
        confidence: word.confidence,
        vertical,
      },
    ];
  });
}

function wordsFromBlocks(
  blocks: Awaited<ReturnType<TesseractWorker["recognize"]>>["data"]["blocks"],
  vertical: boolean
): OcrWord[] {
  if (!blocks) return [];
  const words: OcrWord[] = [];
  for (const block of blocks) {
    for (const para of block.paragraphs) {
      for (const line of para.lines) {
        for (const word of line.words) {
          const text = word.text?.trim();
          if (!text) continue;
          words.push({
            text,
            x: word.bbox.x0,
            y: word.bbox.y0,
            width: Math.max(1, word.bbox.x1 - word.bbox.x0),
            height: Math.max(1, word.bbox.y1 - word.bbox.y0),
            confidence: word.confidence,
            vertical,
          });
        }
      }
    }
  }
  return words;
}

function rotate90cw(src: HTMLCanvasElement) {
  const dst = document.createElement("canvas");
  dst.width = src.height;
  dst.height = src.width;
  const ctx = dst.getContext("2d");
  if (!ctx) throw new Error("Gat ekki snúið mynd");
  ctx.translate(dst.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(src, 0, 0);
  return dst;
}

function rotate90ccw(src: HTMLCanvasElement) {
  const dst = document.createElement("canvas");
  dst.width = src.height;
  dst.height = src.width;
  const ctx = dst.getContext("2d");
  if (!ctx) throw new Error("Gat ekki snúið mynd");
  ctx.translate(0, dst.height);
  ctx.rotate(-Math.PI / 2);
  ctx.drawImage(src, 0, 0);
  return dst;
}

/** Orð úr mynd sem var snúið réttsælis (les texta sem snýr neðan-upp). */
function mapRotatedWord(word: OcrWord, srcHeight: number): OcrWord {
  const x0 = word.y;
  const y0 = srcHeight - (word.x + word.width);
  return {
    ...word,
    vertical: true,
    x: x0,
    y: y0,
    width: word.height,
    height: word.width,
  };
}

/** Orð úr mynd sem var snúið rangsælis (les texta sem snýr ofan-niður). */
function mapCcwRotatedWord(word: OcrWord, srcWidth: number): OcrWord {
  const x0 = srcWidth - (word.y + word.height);
  const y0 = word.x;
  return {
    ...word,
    vertical: true,
    x: x0,
    y: y0,
    width: word.height,
    height: word.width,
  };
}

async function ocrPlan(
  prepared: { canvas: HTMLCanvasElement; scale: number },
  extra: OcrWord[],
  onProgress?: (message: string, percent: number) => void
) {
  const { canvas, scale } = prepared;
  const worker = await getWorker(onProgress);
  await worker.setParameters({
    tessedit_pageseg_mode: "11",
    user_defined_dpi: "220",
  });
  onProgress?.("Les láréttar merkingar…", 48);
  const horiz = await worker.recognize(canvas, {}, { blocks: true, text: true });
  onProgress?.("Les lóðréttar merkingar (neðan-upp)…", 66);
  const rotatedCw = rotate90cw(canvas);
  const vertCw = await worker.recognize(rotatedCw, {}, { blocks: true, text: true });
  rotatedCw.width = 0;
  rotatedCw.height = 0;
  onProgress?.("Les lóðréttar merkingar (ofan-niður)…", 80);
  const rotatedCcw = rotate90ccw(canvas);
  const vertCcw = await worker.recognize(rotatedCcw, {}, { blocks: true, text: true });
  rotatedCcw.width = 0;
  rotatedCcw.height = 0;
  const srcW = canvas.width;
  const srcH = canvas.height;
  canvas.width = 0;
  canvas.height = 0;

  const words = [
    ...wordsFromResult(horiz.data, false),
    ...wordsFromResult(vertCw.data, true).map((w) => mapRotatedWord(w, srcH)),
    ...wordsFromResult(vertCcw.data, true).map((w) => mapCcwRotatedWord(w, srcW)),
  ].map((w) => ({
    ...w,
    x: w.x / scale,
    y: w.y / scale,
    width: w.width / scale,
    height: w.height / scale,
  }));

  const allWords = [...words, ...extra];
  return { words: allWords, hits: collectFirewallHits(allWords) };
}

// (Áður: traceWall/walk/findOffset — lína rakin á myndinni frá miðanum þar til hún endaði. Hún elti ásalínur /
// hnitalínur blaðsins þvert yfir blaðið, út fyrir húsið — Agnar 07.10.2026, Álfaborg 2. hæð. Nú festist miðinn við
// raunverulegan vegg: ei-festing.ts / ei-beiting.ts.)

function inTitleBlock(hit: FirewallHit, width: number, height: number) {
  const cx = hit.x + hit.width / 2;
  const cy = hit.y + hit.height / 2;
  return cx > width * 0.84 && cy > height * 0.45;
}

function badge(x: number, y: number, rating: FirewallRating): BoardObject[] {
  const color = ratingColor(rating);
  const label = rating.label;
  const width = label.length > 7 ? 86 : 64;
  const rect: RectObject = {
    id: newId(),
    type: "rect",
    x,
    y,
    width,
    height: 22,
    fill: color,
    stroke: color,
    strokeWidth: 0,
    cornerRadius: 4,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    name: `Eldveggur ${label}`,
  };
  const text: TextObject = {
    id: newId(),
    type: "text",
    x: x + 6,
    y: y + 3,
    text: label,
    fontSize: 13,
    fill: "#ffffff",
    width: width - 8,
    fontStyle: "bold",
    align: "left",
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    name: `Eldveggur ${label}`,
  };
  return [rect, text];
}

export function isFirewallMark(obj: BoardObject) {
  return FIREWALL_MARK_NAMES.some((prefix) => obj.name.startsWith(prefix));
}

export async function loadPlanCanvas(plan: ImageObject) {
  const blob = getAssetBlob(plan.assetId);
  if (!blob) throw new Error("Gólfplönið er ekki í minni");
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Gat ekki lesið gólfplön");
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return canvas;
}

export async function detectFirewallsOnPlan(
  plan: ImageObject,
  options?: {
    extraWords?: OcrWord[];
    onProgress?: (message: string, percent: number) => void;
  }
): Promise<{ objects: BoardObject[]; hits: FirewallHit[]; words: OcrWord[]; midar: EiMidi[] }> {
  const canvas = await loadPlanCanvas(plan);
  const srcW = canvas.width;
  const srcH = canvas.height;
  const sx = plan.width / srcW;
  const sy = plan.height / srcH;
  const extra = options?.extraWords ?? [];

  // OCR-afritið STRAX og risastóra frumritið losað — full upplausn (permalink-TIF 9933×7016 ≈ 280 MB per getImageData)
  // er það sem frysti vafrann/símann.
  options?.onProgress?.("Undirbý greiningu…", 20);
  const ocrFit = fitCanvas(canvas, OCR_MAX, OCR_MIN);
  canvas.width = 0;
  canvas.height = 0;
  await binarizeForOcr(ocrFit.canvas);

  const { words, hits: rawHits } = await ocrPlan(ocrFit, extra, options?.onProgress);
  const hits = rawHits.filter((hit) => !inTitleBlock(hit, srcW, srcH));

  const objects: BoardObject[] = [];
  const midar: EiMidi[] = [];

  for (const hit of hits) {
    const cx = plan.x + (hit.x + hit.width / 2) * sx;
    const cy = plan.y + (hit.y + hit.height / 2) * sy;
    // Miðinn: hvar á borðinu, hvernig hann snýr og hvaða flokkur. Veggurinn sem hann á við er fundinn síðar (ei-beiting).
    midar.push({ x: cx, y: cy, lodrett: hit.vertical, minutur: hit.rating.minutes, reyk: hit.rating.smoke });
    objects.push(...badge(cx + 8, cy - 28, hit.rating));
    if (hit.rating.smoke) {
      // Sama regla og í 165.BR1-merkingunni: eldhurðin fylgir stimpilstærðinni
      // í stað fastrar 44, svo öll sjálfgerð merki komi út í valinni stærð.
      const doorPx = Math.round((44 * getStampSize()) / 56);
      const door = makeSymbol("firedoor", cx - doorPx / 2, cy - doorPx / 2, hit.rating.label, doorPx);
      door.name = `Eldhurð ${hit.rating.label}`;
      objects.push(door);
    }
    await yieldToUi();
  }

  return {
    objects: objects.map((obj) => ({ ...obj, parentId: plan.id })),
    hits,
    words,
    midar,
  };
}

/** Yfirlitsmiði EI-greiningarinnar: fjöldi merkja og hve mörg festust við vegg. */
export function eiYfirlitsmidi(
  plan: ImageObject,
  hits: FirewallHit[],
  festir: number,
  lausir: number
): BoardObject | null {
  if (!hits.length) return null;
  const counts = new Map<string, number>();
  for (const h of hits) counts.set(h.rating.label, (counts.get(h.rating.label) ?? 0) + 1);
  const lines = [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, n]) => `${n}× ${label}`)
    .join("\n");
  return {
    id: newId(),
    type: "sticky",
    x: plan.x + plan.width + 48,
    y: plan.y + 180,
    width: 260,
    height: 200,
    text:
      `Sjálfvirk merking eldveggja\n${lines}\n\n${festir} eldveggjabútar á veggjum` +
      (lausir ? ` · ${lausir} miðar fundu engan vegg (engin lína)` : "") +
      `\n\nRautt = EI-60, ljósrautt = EI-30 — eldveggur er veggur með tegund: veldu hann og breyttu í veggjastikunni.`,
    fill: "#fecaca",
    fontSize: 15,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    name: "Eldveggir — sjálfvirk merking",
    parentId: plan.id,
  };
}
