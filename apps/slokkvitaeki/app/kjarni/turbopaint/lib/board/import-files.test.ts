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
