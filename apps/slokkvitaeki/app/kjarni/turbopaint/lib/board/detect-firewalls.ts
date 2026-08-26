import { getAssetBlob } from "./assets";
import { simplifyPoints } from "./geometry";
import { newId } from "./ids";
import {
  collectFirewallHits,
  ratingColor,
  ratingDash,
  type FirewallHit,
  type FirewallRating,
  type OcrWord,
} from "./firewall-rating";
import { makeSymbol } from "./markup-kit";
import type { BoardObject, ImageObject, LineObject, RectObject, TextObject } from "./types";

export const FIREWALL_MARK_NAMES = ["Eldveggur", "Eldhurð", "Eldveggir"] as const;

const OCR_MAX = 5200;
const OCR_MIN = 3600;

/** Svart blek á hvítu fyrir OCR: rauð/bleik ský og lituð yfirstrikun sem
 * liggja yfir EI-merkingum á skönnuðum teikningum drekkja textanum annars. */
function binarizeForOcr(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
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
  ctx.putImageData(image, 0, 0);
}

function fitOcrCanvas(source: HTMLCanvasElement) {
  const longest = Math.max(source.width, source.height);
  let scale = 1;
  if (longest > OCR_MAX) scale = OCR_MAX / longest;
  else if (longest < OCR_MIN) scale = OCR_MIN / longest;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Gat ekki stillt mynd fyrir OCR");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  binarizeForOcr(canvas);
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
      const worker = await createWorker("eng", 1, {
        workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js",
        corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@6.1.2/tesseract-core-simd-lstm.wasm.js",
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
  source: HTMLCanvasElement,
  extra: OcrWord[],
  onProgress?: (message: string, percent: number) => void
) {
  const { canvas, scale } = fitOcrCanvas(source);
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

  const words = [
    ...wordsFromResult(horiz.data, false),
    ...wordsFromResult(vertCw.data, true).map((w) => mapRotatedWord(w, canvas.height)),
    ...wordsFromResult(vertCcw.data, true).map((w) => mapCcwRotatedWord(w, canvas.width)),
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

function grayAt(data: Uint8ClampedArray, width: number, height: number, x: number, y: number) {
  if (x < 0 || y < 0 || x >= width || y >= height) return 255;
  const i = (y * width + x) * 4;
  return (data[i] + data[i + 1] + data[i + 2]) / 3;
}

function wallish(v: number) {
  return v > 70 && v < 195;
}

function findOffset(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
  vertical: boolean
) {
  let best = { score: -Infinity, dx: 0, dy: 0 };
  for (let d = -55; d <= 55; d++) {
    let count = 0;
    let dark = 0;
    if (vertical) {
      const x = Math.round(cx + d);
      if (x < 0 || x >= width) continue;
      for (let t = -140; t <= 140; t++) {
        const v = grayAt(data, width, height, x, Math.round(cy + t));
        if (wallish(v)) count++;
        if (Math.abs(t) <= 30 && v < 70) dark++;
      }
    } else {
      const y = Math.round(cy + d);
      if (y < 0 || y >= height) continue;
      for (let t = -140; t <= 140; t++) {
        const v = grayAt(data, width, height, Math.round(cx + t), y);
        if (wallish(v)) count++;
        if (Math.abs(t) <= 30 && v < 70) dark++;
      }
    }
    let score = count - dark * 8;
    if (Math.abs(d) < 8) score -= 30;
    if (score > best.score) {
      best = { score, dx: vertical ? d : 0, dy: vertical ? 0 : d };
    }
  }
  return best;
}

function walk(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x0: number,
  y0: number,
  ux: number,
  uy: number
) {
  const pts: number[] = [];
  let x = x0;
  let y = y0;
  let miss = 0;
  for (let i = 0; i < 1600; i++) {
    let best: { score: number; x: number; y: number } | null = null;
    for (let s = -5; s <= 5; s++) {
      const xx = Math.round(x + ux + (uy === 0 ? 0 : s));
      const yy = Math.round(y + uy + (ux === 0 ? 0 : s));
      const v = grayAt(data, width, height, xx, yy);
      let score = wallish(v) ? 195 - v : -50;
      if (ux !== 0) {
        if (wallish(grayAt(data, width, height, xx, yy - 1))) score += 8;
        if (wallish(grayAt(data, width, height, xx, yy + 1))) score += 8;
      } else {
        if (wallish(grayAt(data, width, height, xx - 1, yy))) score += 8;
        if (wallish(grayAt(data, width, height, xx + 1, yy))) score += 8;
      }
      if (!best || score > best.score) best = { score, x: xx, y: yy };
    }
    if (!best || best.score < 0) {
      miss++;
      if (miss > 18) break;
      x += ux;
      y += uy;
      continue;
    }
    miss = 0;
    x = best.x;
    y = best.y;
    if (i % 6 === 0) {
      pts.push(x, y);
    }
  }
  if (pts.length < 2 || pts[pts.length - 2] !== x) pts.push(x, y);
  return pts;
}

function traceWall(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  hit: FirewallHit
) {
  const cx = hit.x + hit.width / 2;
  const cy = hit.y + hit.height / 2;
  const off = findOffset(data, width, height, cx, cy, hit.vertical);
  const wx = cx + off.dx;
  const wy = cy + off.dy;
  let pts: number[];
  if (hit.vertical) {
    const a = walk(data, width, height, wx, wy, 0, -1);
    const b = walk(data, width, height, wx, wy, 0, 1);
    pts = [...reversePairs(a), wx, wy, ...b];
  } else {
    const a = walk(data, width, height, wx, wy, -1, 0);
    const b = walk(data, width, height, wx, wy, 1, 0);
    pts = [...reversePairs(a), wx, wy, ...b];
  }
  const simplified = simplifyPoints(pts, 10);
  if (simplified.length >= 4) return simplified;
  const stub = hit.vertical ? 90 : 110;
  return hit.vertical
    ? [wx, wy - stub, wx, wy + stub]
    : [wx - stub, wy, wx + stub, wy];
}

function reversePairs(pts: number[]) {
  const out: number[] = [];
  for (let i = pts.length - 2; i >= 0; i -= 2) {
    out.push(pts[i], pts[i + 1]);
  }
  return out;
}

function inTitleBlock(hit: FirewallHit, width: number, height: number) {
  const cx = hit.x + hit.width / 2;
  const cy = hit.y + hit.height / 2;
  return cx > width * 0.84 && cy > height * 0.45;
}

function polyline(
  points: number[],
  rating: FirewallRating,
  name: string
): LineObject {
  return {
    id: newId(),
    type: "polyline",
    x: 0,
    y: 0,
    points,
    stroke: ratingColor(rating),
    strokeWidth: rating.minutes === 60 ? 8 : 6,
    dash: ratingDash(rating),
    rotation: 0,
    opacity: 0.88,
    locked: false,
    hidden: false,
    name,
  };
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
): Promise<{ objects: BoardObject[]; hits: FirewallHit[]; words: OcrWord[] }> {
  const canvas = await loadPlanCanvas(plan);
  const sx = plan.width / canvas.width;
  const sy = plan.height / canvas.height;
  const extra = options?.extraWords ?? [];

  const { words, hits: rawHits } = await ocrPlan(canvas, extra, options?.onProgress);
  const hits = rawHits.filter((hit) => !inTitleBlock(hit, canvas.width, canvas.height));

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Gat ekki lesið pixla");
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const objects: BoardObject[] = [];
  const counts = new Map<string, number>();

  for (const hit of hits) {
    counts.set(hit.rating.label, (counts.get(hit.rating.label) ?? 0) + 1);
    const local = traceWall(image.data, canvas.width, canvas.height, hit);
    const world: number[] = [];
    for (let i = 0; i < local.length; i += 2) {
      world.push(plan.x + local[i] * sx, plan.y + local[i + 1] * sy);
    }
    const name = hit.rating.smoke
      ? `Eldhurð ${hit.rating.label}`
      : `Eldveggur ${hit.rating.label}`;
    objects.push(polyline(world, hit.rating, name));
    const bx = plan.x + (hit.x + hit.width / 2) * sx + 8;
    const by = plan.y + (hit.y + hit.height / 2) * sy - 28;
    objects.push(...badge(bx, by, hit.rating));
    if (hit.rating.smoke) {
      const door = makeSymbol(
        "firedoor",
        plan.x + (hit.x + hit.width / 2) * sx - 22,
        plan.y + (hit.y + hit.height / 2) * sy - 22,
        hit.rating.label,
        44
      );
      door.name = `Eldhurð ${hit.rating.label}`;
      objects.push(door);
    }
  }

  if (hits.length) {
    const lines = [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, n]) => `${n}× ${label}`)
      .join("\n");
    objects.push({
      id: newId(),
      type: "sticky",
      x: plan.x + plan.width + 48,
      y: plan.y + 180,
      width: 240,
      height: 170,
      text: `Sjálfvirk merking eldveggja\n${lines}\n\nRautt = EI-60, appelsínugult = EI-30, blátt = EI-CS hurð. Dragðu línurnar til ef þær þurfa lagfæringu.`,
      fill: "#fecaca",
      fontSize: 15,
      rotation: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      name: "Eldveggir — sjálfvirk merking",
    });
  }

  canvas.width = 0;
  canvas.height = 0;
  return {
    objects: objects.map((obj) => ({ ...obj, parentId: plan.id })),
    hits,
    words,
  };
}
