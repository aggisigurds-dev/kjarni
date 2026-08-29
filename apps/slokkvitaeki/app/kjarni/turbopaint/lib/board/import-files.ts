import { getDocument, GlobalWorkerOptions, version as pdfjsVersion } from "pdfjs-dist";
import * as UTIF from "utif";
import { canvasToBlob, fitSize, putAsset } from "./assets";
import type { OcrWord } from "./firewall-rating";
import { newId } from "./ids";
import type { ImageObject, ImportQuality } from "./types";
import { IMPORT_MAX_PX } from "./types";

if (typeof window !== "undefined") {
  GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;
}

export type ImportResult = {
  objects: ImageObject[];
  warnings: string[];
  textByObjectId: Record<string, OcrWord[]>;
};

type ProgressFn = (percent: number, message: string) => void;

function makeImageObject(
  assetId: string,
  width: number,
  height: number,
  name: string,
  x: number,
  y: number,
  extra?: Partial<Pick<ImageObject, "pixelsPerPdfPoint">>
): ImageObject {
  return {
    id: newId(),
    type: "image",
    assetId,
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    name,
    ...extra,
  };
}

function rasterizeToLimit(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  maxPx: number
) {
  const fit = fitSize(srcW, srcH, maxPx);
  const canvas = document.createElement("canvas");
  canvas.width = fit.width;
  canvas.height = fit.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Gat ekki opnað canvas");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, fit.width, fit.height);
  ctx.drawImage(source, 0, 0, fit.width, fit.height);
  return { canvas, width: fit.width, height: fit.height };
}

/* PDF er VIGUR — hann má teikna í hvaða upplausn sem er. fitSize() MINNKAR hins
 * vegar bara (scale = 1 þegar síðan er minni en þakið), svo venjuleg A3-teikning
 * var teiknuð á scale 1 = hráum PDF-punktum ≈ 72 DPI ≈ 1191 px á lengri kant.
 * Þakið (7.200 px á „Staðli") kom aldrei við sögu. Myndin varð því óskýr um leið
 * og þysjað var inn — 2026-08-29, Agnar: „pdf import er að missa mikið af
 * gæðunum inn í turbopaint".
 *
 * Hér er miðað við RAUNVERULEGA upplausn (DPI) í staðinn. Tvö þök halda þessu í
 * skefjum: langhliðin (IMPORT_MAX_PX, óbreytt) og heildarflatarmál — vafrar hafa
 * efri mörk á striga (Chrome ~268 MP, MUN lægri í símum) og innflutningur á að
 * hægjast, ekki springa.
 *
 * ATH stærðin á borðinu breytist EKKI: Konva skalar myndina í obj.width/height,
 * svo hlutnum er áfram gefin gamla stærðin og aðeins strigann er teiknaður
 * stærri. Þess vegna helst pixelsPerPdfPoint líka óbreytt — mælitólið (Kvarða)
 * reiknar í heimshnitum og má ekki hliðrast. */
const PDF_DPI: Record<ImportQuality, number> = { fast: 150, standard: 300, print: 600 };
const PDF_MAX_AREA: Record<ImportQuality, number> = {
  fast: 24_000_000,
  standard: 40_000_000,
  print: 100_000_000,
};

function pdfRenderScale(baseW: number, baseH: number, quality: ImportQuality) {
  const longest = Math.max(baseW, baseH, 1);
  let scale = PDF_DPI[quality] / 72;
  const maxPx = IMPORT_MAX_PX[quality];
  if (longest * scale > maxPx) scale = maxPx / longest;
  const maxArea = PDF_MAX_AREA[quality];
  const area = baseW * baseH * scale * scale;
  if (area > maxArea) scale = Math.sqrt(maxArea / Math.max(1, baseW * baseH));
  // EKKI klemma upp í 1 hér: risastór síða (A0 og stærri) á áfram að MINNKA niður
  // í þökin, nákvæmlega eins og áður. DPI-markmiðið lyftir aðeins litlum síðum;
  // þökin lækka þær stóru. Neðri vörnin er bara til að scale verði aldrei 0.
  return Math.max(0.05, scale);
}

async function importPdf(
  file: File,
  quality: ImportQuality,
  onProgress: ProgressFn,
  origin: { x: number; y: number }
): Promise<ImportResult> {
  const maxPx = IMPORT_MAX_PX[quality];
  const data = await file.arrayBuffer();
  const pdf = await getDocument({ data, disableRange: true }).promise;
  const objects: ImageObject[] = [];
  const textByObjectId: Record<string, OcrWord[]> = {};
  let cursorX = origin.x;

  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress(
      Math.round(((i - 1) / pdf.numPages) * 100),
      `Teikni síðu ${i} af ${pdf.numPages}…`
    );
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    // Stærðin á BORÐINU — óbreytt frá því sem var (PDF-punktar, klemmt við þakið).
    const target = fitSize(base.width, base.height, maxPx);
    // Upplausnin sem teiknað er í — ný, miðuð við DPI.
    const viewport = page.getViewport({ scale: pdfRenderScale(base.width, base.height, quality) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Gat ekki teiknað PDF");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    // Textareitirnir verða að vera í HEIMSHNITUM hlutarins, ekki í upplausn
    // strigans — annars hliðrast þeir um sama hlutfall og upplausnin hækkaði
    // (OCR/EI-greiningin les þessa reiti og myndi þá benda á rangan stað).
    const worldViewport = page.getViewport({ scale: target.scale });
    const words = await extractPdfWords(page, worldViewport);
    const blob = await canvasToBlob(canvas);
    const assetId = newId();
    await putAsset(assetId, blob);
    const name =
      pdf.numPages > 1 ? `${file.name} · síða ${i}` : file.name.replace(/\.[^.]+$/, "");
    // Stærðin á borðinu er ÓBREYTT (target), aðeins myndin á bak við er skarpari.
    const obj = makeImageObject(assetId, target.width, target.height, name, cursorX, origin.y, {
      pixelsPerPdfPoint: target.scale,
    });
    objects.push(obj);
    if (words.length) textByObjectId[obj.id] = words;
    cursorX += target.width + 96;
    canvas.width = 0;
    canvas.height = 0;
  }

  onProgress(100, "PDF tilbúið");
  return { objects, warnings: [], textByObjectId };
}

async function extractPdfWords(
  page: { getTextContent: () => Promise<{ items: unknown[] }> },
  viewport: { convertToViewportPoint: (x: number, y: number) => number[]; scale: number }
): Promise<OcrWord[]> {
  const content = await page.getTextContent();
  const words: OcrWord[] = [];
  for (const raw of content.items) {
    if (!raw || typeof raw !== "object" || !("str" in raw)) continue;
    const item = raw as {
      str: string;
      width: number;
      height: number;
      transform: number[];
    };
    const text = item.str.trim();
    if (!text) continue;
    const tr = item.transform;
    const [vx, vy] = viewport.convertToViewportPoint(tr[4], tr[5]);
    const height = Math.max(8, Math.hypot(tr[2], tr[3]) || item.height || 10);
    const vertical = Math.abs(tr[1]) > Math.abs(tr[0]);
    words.push({
      text,
      x: vx,
      y: vertical ? vy : vy - height,
      width: Math.max(8, item.width * viewport.scale),
      height,
      confidence: 99,
      vertical,
    });
  }
  return words;
}

async function importTiff(
  file: File,
  quality: ImportQuality,
  onProgress: ProgressFn,
  origin: { x: number; y: number }
): Promise<ImportResult> {
  const maxPx = IMPORT_MAX_PX[quality];
  onProgress(8, "Les TIF…");
  const buffer = await file.arrayBuffer();
  const ifds = UTIF.decode(buffer);
  if (!ifds.length) throw new Error("TIF skráin inniheldur engar myndir");

  const sizes = ifds.map((ifd) => {
    const rec = ifd as UTIF.IFD & { t256?: number[]; t257?: number[] };
    const w = Number(rec.width || rec.t256?.[0] || 0);
    const h = Number(rec.height || rec.t257?.[0] || 0);
    return w * h;
  });
  const maxArea = Math.max(...sizes, 1);
  const pages = ifds.filter((_, i) => sizes[i] >= maxArea * 0.35);
  const objects: ImageObject[] = [];
  const warnings: string[] = [];
  let cursorX = origin.x;

  for (let i = 0; i < pages.length; i++) {
    onProgress(
      Math.round(((i + 0.2) / pages.length) * 100),
      `Afþjappa TIF ${i + 1} af ${pages.length}…`
    );
    const ifd = pages[i];
    try {
      UTIF.decodeImage(buffer, ifd);
      const rgba = UTIF.toRGBA8(ifd);
      const width = Number(ifd.width);
      const height = Number(ifd.height);
      if (!width || !height) throw new Error("Ógild stærð");
      const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height);
      const src = document.createElement("canvas");
      src.width = width;
      src.height = height;
      const sctx = src.getContext("2d");
      if (!sctx) throw new Error("Gat ekki opnað canvas");
      sctx.putImageData(imageData, 0, 0);
      const { canvas, width: w, height: h } = rasterizeToLimit(src, width, height, maxPx);
      const blob = await canvasToBlob(canvas);
        const assetId = newId();
      await putAsset(assetId, blob);
      const name =
        pages.length > 1 ? `${file.name} · síða ${i + 1}` : file.name.replace(/\.[^.]+$/, "");
      objects.push(makeImageObject(assetId, w, h, name, cursorX, origin.y));
      cursorX += w + 96;
      src.width = 0;
      src.height = 0;
      canvas.width = 0;
      canvas.height = 0;
    } catch {
      warnings.push(`Gat ekki lesið síðu ${i + 1} í ${file.name}`);
    }
  }

  if (!objects.length) {
    throw new Error("Gat ekki lesið TIF skrána. Prófaðu að vista hana sem PDF eða PNG.");
  }
  onProgress(100, "TIF tilbúið");
  return { objects, warnings, textByObjectId: {} };
}

async function importRaster(
  file: File,
  quality: ImportQuality,
  onProgress: ProgressFn,
  origin: { x: number; y: number }
): Promise<ImportResult> {
  onProgress(15, "Les mynd…");
  const url = URL.createObjectURL(file);
  try {
    const img = await loadHtmlImage(url);
    const { canvas, width, height } = rasterizeToLimit(
      img,
      img.naturalWidth,
      img.naturalHeight,
      IMPORT_MAX_PX[quality]
    );
    const blob = await canvasToBlob(canvas);
        const assetId = newId();
    await putAsset(assetId, blob);
    onProgress(100, "Mynd tilbúin");
    return {
      objects: [
        makeImageObject(
          assetId,
          width,
          height,
          file.name.replace(/\.[^.]+$/, ""),
          origin.x,
          origin.y
        ),
      ],
      warnings: [],
      textByObjectId: {},
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadHtmlImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Gat ekki opnað myndina"));
    img.src = url;
  });
}

export function classifyFile(file: File): "pdf" | "tiff" | "raster" | "unknown" {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (
    type.includes("tiff") ||
    type.includes("tif") ||
    name.endsWith(".tif") ||
    name.endsWith(".tiff")
  ) {
    return "tiff";
  }
  if (
    type.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|svg|bmp)$/.test(name)
  ) {
    return "raster";
  }
  return "unknown";
}

export async function importFiles(
  files: File[],
  quality: ImportQuality,
  origin: { x: number; y: number },
  onProgress: (fileName: string, percent: number, message: string) => void
): Promise<ImportResult> {
  const all: ImageObject[] = [];
  const warnings: string[] = [];
  const textByObjectId: Record<string, OcrWord[]> = {};
  let x = origin.x;

  for (const file of files) {
    const kind = classifyFile(file);
    if (kind === "unknown") {
      warnings.push(`Óþekkt skráarsnið: ${file.name}`);
      continue;
    }
    const report: ProgressFn = (percent, message) =>
      onProgress(file.name, percent, message);
    let result: ImportResult;
    if (kind === "pdf") result = await importPdf(file, quality, report, { x, y: origin.y });
    else if (kind === "tiff") result = await importTiff(file, quality, report, { x, y: origin.y });
    else result = await importRaster(file, quality, report, { x, y: origin.y });

    all.push(...result.objects);
    warnings.push(...result.warnings);
    Object.assign(textByObjectId, result.textByObjectId);
    if (result.objects.length) {
      const last = result.objects[result.objects.length - 1];
      x = last.x + last.width + 96;
    }
  }

  return { objects: all, warnings, textByObjectId };
}
