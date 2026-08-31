import { getDocument, GlobalWorkerOptions, type PDFPageProxy } from "pdfjs-dist";
import * as UTIF from "utif";
import { canvasToBlob, fitSize, putAsset } from "./assets";
import type { OcrWord } from "./firewall-rating";
import { newId } from "./ids";
import { fileSizeWarning, planPdfRaster, PDF_SAFE_AREA } from "./import-limits";
import { PDFJS_WORKER_SRC, classifyFile, pdfJsDocumentOptions } from "./pdfjs-setup";
import { downsampleTiffData } from "./tiff-raster";
import type { ImageObject, ImportQuality } from "./types";
import { IMPORT_MAX_PX } from "./types";

export { classifyFile, PDFJS_WASM_URL, PDFJS_WORKER_SRC, pdfJsDocumentOptions } from "./pdfjs-setup";

if (typeof window !== "undefined") {
  GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
}

export type ImportResult = {
  objects: ImageObject[];
  warnings: string[];
  textByObjectId: Record<string, OcrWord[]>;
};

type ProgressFn = (percent: number, message: string) => void;

const yieldUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

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
 * skefjum: langhliðin (IMPORT_MAX_PX, óbreytt) og PDF_SAFE_AREA (40 MP ≈ 160 MB
 * RGBA). Print miðaði áður við 100 MP (~400 MB) og gat sprungið á 30 MB A1 á
 * 600 DPI. Allar gæðaútgáfur deila nú 40 MP-þakinu; lægri DPI fær íslenska
 * viðvörun í stað hljóðlauss falls.
 *
 * ATH stærðin á borðinu breytist EKKI: Konva skalar myndina í obj.width/height,
 * svo hlutnum er áfram gefin gamla stærðin og aðeins strigann er teiknaður
 * stærri. Þess vegna helst pixelsPerPdfPoint líka óbreytt — mælitólið (Kvarða)
 * reiknar í heimshnitum og má ekki hliðrast. */

async function importPdf(
  file: File,
  quality: ImportQuality,
  onProgress: ProgressFn,
  origin: { x: number; y: number }
): Promise<ImportResult> {
  const maxPx = IMPORT_MAX_PX[quality];
  const data = await file.arrayBuffer();
  const pdf = await getDocument(pdfJsDocumentOptions(data)).promise;
  const objects: ImageObject[] = [];
  const warnings: string[] = [];
  const textByObjectId: Record<string, OcrWord[]> = {};
  let cursorX = origin.x;

  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress(
      Math.round(((i - 1) / pdf.numPages) * 100),
      `Teikni síðu ${i} af ${pdf.numPages}…`
    );
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const target = fitSize(base.width, base.height, maxPx);
    const { canvas, warnings: rasterWarnings } = await rasterizePdfPage(
      page,
      base.width,
      base.height,
      quality
    );
    warnings.push(...rasterWarnings);
    const worldViewport = page.getViewport({ scale: target.scale });
    const words = await extractPdfWords(page, worldViewport);
    const blob = await canvasToBlob(canvas);
    const assetId = newId();
    await putAsset(assetId, blob);
    const name =
      pdf.numPages > 1 ? `${file.name} · síða ${i}` : file.name.replace(/\.[^.]+$/, "");
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
  return { objects, warnings, textByObjectId };
}

function openRasterCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext("2d");
  if (!ctx || canvas.width < width * 0.9 || canvas.height < height * 0.9) {
    canvas.width = 0;
    canvas.height = 0;
    throw new Error("canvas-too-large");
  }
  return { canvas, ctx };
}

async function rasterizePdfPage(
  page: PDFPageProxy,
  baseW: number,
  baseH: number,
  quality: ImportQuality
) {
  const warnings: string[] = [];
  const attempts: { quality: ImportQuality; maxArea: number }[] = [
    { quality, maxArea: PDF_SAFE_AREA },
    { quality: "fast", maxArea: Math.floor(PDF_SAFE_AREA / 2) },
  ];
  let lastErr: unknown;
  for (const attempt of attempts) {
    const plan = planPdfRaster(baseW, baseH, attempt.quality, attempt.maxArea);
    if (plan.warning) warnings.push(plan.warning);
    try {
      const { canvas, ctx } = openRasterCanvas(plan.width, plan.height);
      const viewport = page.getViewport({ scale: plan.scale });
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      return { canvas, warnings: [...new Set(warnings)] };
    } catch (err) {
      lastErr = err;
      warnings.push(
        "Gat ekki teiknað PDF í fullri upplausn — prófaði lægri DPI svo vafrinn færi ekki úr minni."
      );
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Gat ekki teiknað PDF");
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
      await yieldUi();
      UTIF.decodeImage(buffer, ifd);
      const data = ifd.data as Uint8Array | undefined;
      const width = Number(ifd.width);
      const height = Number(ifd.height);
      if (!width || !height || !data?.length) throw new Error("Ógild stærð");
      onProgress(
        Math.round(((i + 0.55) / pages.length) * 100),
        `Minnka TIF ${i + 1} af ${pages.length}…`
      );
      await yieldUi();
      let sampled;
      try {
        sampled = downsampleTiffData(data, width, height, maxPx);
      } catch {
        const rgba = UTIF.toRGBA8(ifd);
        sampled = downsampleTiffData(rgba, width, height, maxPx);
      }
      if (sampled.warning) warnings.push(sampled.warning);
      const imageData = new ImageData(sampled.width, sampled.height);
      imageData.data.set(sampled.rgba);
      const canvas = document.createElement("canvas");
      canvas.width = sampled.width;
      canvas.height = sampled.height;
      const sctx = canvas.getContext("2d");
      if (!sctx) throw new Error("Gat ekki opnað canvas");
      sctx.putImageData(imageData, 0, 0);
      const blob = await canvasToBlob(canvas);
        const assetId = newId();
      await putAsset(assetId, blob);
      const name =
        pages.length > 1 ? `${file.name} · síða ${i + 1}` : file.name.replace(/\.[^.]+$/, "");
      objects.push(makeImageObject(assetId, sampled.width, sampled.height, name, cursorX, origin.y));
      cursorX += sampled.width + 96;
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
    const sizeNote = fileSizeWarning(file);
    if (sizeNote) warnings.push(sizeNote);
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
