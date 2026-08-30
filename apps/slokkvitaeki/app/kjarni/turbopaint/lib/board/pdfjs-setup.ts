// SJÁLFHÝST í public/pdfjs/ (afrit úr pdfjs-dist, sömu útgáfu).
// pdf.js 5 afkóðar CCITT / JBIG2 / JPEG2000 í WASM — skannaðar teikningar
// (RICOH o.fl.) eru nánast alltaf CCITT Group 4. Án wasmUrl reynir workerinn
// að sækja "nulljbig2.wasm" og síðan "nulljbig2_nowasm_fallback.js", fellur
// á "JBig2 failed to initialize" og síðan kemur inn TÓM (hvít).
// Workerinn er líka sóttur héðan: new Worker(cross-origin CDN) er bannað,
// sama ástæða og public/tesseract/.
// Uppfærist pdfjs-dist þarf að endurafrita worker + wasm-skrárnar.
export const PDFJS_WORKER_SRC = "/pdfjs/pdf.worker.min.mjs";
export const PDFJS_WASM_URL = "/pdfjs/wasm/";

/** Valkostir sem getDocument þarf svo skannaðar síður afkóðist. */
export function pdfJsDocumentOptions(data: ArrayBuffer) {
  return {
    data,
    disableRange: true,
    wasmUrl: PDFJS_WASM_URL,
  };
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
  if (type.startsWith("image/") || /\.(png|jpe?g|webp|gif|svg|bmp)$/.test(name)) {
    return "raster";
  }
  return "unknown";
}
