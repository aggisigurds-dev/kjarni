import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  classifyFile,
  PDFJS_WASM_URL,
  PDFJS_WORKER_SRC,
  pdfJsDocumentOptions,
} from "./pdfjs-setup";
import {
  IMPORT_FILE_WARN_BYTES,
  IMPORT_SIZE_HINT,
  PDF_SAFE_AREA,
  fileSizeWarning,
  planPdfRaster,
} from "./import-limits";

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "../../../../../public");

test("classifyFile treats .pdf name and application/pdf as pdf", () => {
  assert.equal(
    classifyFile(new File([], "teikning.pdf", { type: "application/pdf" })),
    "pdf"
  );
  assert.equal(classifyFile(new File([], "FS18-A-2.pdf", { type: "" })), "pdf");
});

test("classifyFile treats tiff and raster by name when type is empty", () => {
  assert.equal(classifyFile(new File([], "plan.tif", { type: "" })), "tiff");
  assert.equal(classifyFile(new File([], "mynd.png", { type: "" })), "raster");
  assert.equal(classifyFile(new File([], "notes.txt", { type: "text/plain" })), "unknown");
});

test("pdf.js load options point at same-origin worker and wasm (trailing slash)", () => {
  assert.equal(PDFJS_WORKER_SRC, "/pdfjs/pdf.worker.min.mjs");
  assert.ok(PDFJS_WASM_URL.endsWith("/"), "pdf.js getFactoryUrlProp requires a trailing slash");
  assert.equal(PDFJS_WASM_URL, "/pdfjs/wasm/");

  const opts = pdfJsDocumentOptions(new ArrayBuffer(0));
  assert.equal(opts.wasmUrl, PDFJS_WASM_URL);
  assert.equal(opts.disableRange, true);
  assert.ok(opts.data instanceof ArrayBuffer);
});

test("vendored pdf.js worker and CCITT wasm sit on the same-origin public path", () => {
  assert.ok(existsSync(join(publicDir, PDFJS_WORKER_SRC)), PDFJS_WORKER_SRC);
  assert.ok(existsSync(join(publicDir, PDFJS_WASM_URL, "jbig2.wasm")), "jbig2.wasm");
  assert.ok(
    existsSync(join(publicDir, PDFJS_WASM_URL, "jbig2_nowasm_fallback.js")),
    "jbig2 fallback"
  );
});

test("classifyFile does not reject a 50 MB PDF by size", () => {
  const fat = new File([new Uint8Array(4)], "plan.pdf", { type: "application/pdf" });
  Object.defineProperty(fat, "size", { value: 50 * 1024 * 1024 });
  assert.equal(classifyFile(fat), "pdf");
  assert.equal(fileSizeWarning(fat)?.includes("50 MB"), true);
  assert.equal(fileSizeWarning(fat)?.includes("ekki sendur á netþjón"), true);
});

test("files under 40 MB get no size warning", () => {
  const ok = new File([new Uint8Array(4)], "litið.pdf", { type: "application/pdf" });
  Object.defineProperty(ok, "size", { value: 19 * 1024 * 1024 });
  assert.equal(fileSizeWarning(ok), null);
  assert.equal(IMPORT_FILE_WARN_BYTES, 40 * 1024 * 1024);
});

test("A1 at 600 DPI is clamped to the 40 MP RAM budget with an Icelandic warning", () => {
  const a1w = (841 / 25.4) * 72;
  const a1h = (594 / 25.4) * 72;
  const plan = planPdfRaster(a1w, a1h, "print");
  assert.ok(plan.width * plan.height <= PDF_SAFE_AREA * 1.01);
  assert.ok(plan.dpi < 600);
  assert.ok(plan.warning?.includes("DPI"));
  assert.ok(plan.warning?.includes("minni"));
});

test("ordinary A3 at standard 300 DPI is not clamped below target", () => {
  const a3w = (420 / 25.4) * 72;
  const a3h = (297 / 25.4) * 72;
  const plan = planPdfRaster(a3w, a3h, "standard");
  assert.equal(plan.requestedDpi, 300);
  assert.ok(plan.dpi >= 290);
  assert.equal(plan.warning, undefined);
});

test("UI hint states there is no 20 MB file cap", () => {
  assert.ok(IMPORT_SIZE_HINT.includes("20 MB"));
  assert.ok(IMPORT_SIZE_HINT.includes("vafranum"));
});
