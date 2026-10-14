import assert from "node:assert/strict";
import { test } from "node:test";
import { finnaRymisMerkingar } from "./rymis-lestur";
import type { OcrWord } from "./firewall-rating";

const word = (text: string, confidence = 90): OcrWord => ({
  text, confidence, x: 100, y: 200, width: 50, height: 20, vertical: false,
});

test("OCR room names become positioned, unconfirmed hints", () => {
  const hits = finnaRymisMerkingar([word("WC"), word("Baðherbergi"), word("Herbergi"), word("geymsla")]);
  assert.deepEqual(hits.map((x) => x.tegund), ["wc", "badherbergi", "herbergi", "geymsla"]);
  assert.deepEqual([hits[0].x, hits[0].y, hits[0].stada], [125, 210, "otadfest"]);
});
test("low confidence and ordinary dimensions must not create room hints", () => {
  assert.deepEqual(finnaRymisMerkingar([word("EI-60"), word("1200"), word("WC", 10)]), []);
});
test("Icelandic accents and punctuation are normalized", () => {
  assert.deepEqual(finnaRymisMerkingar([word("BAÐHERBERGI."), word("Skrifstofa")]).map((x) => x.tegund), ["badherbergi", "skrifstofa"]);
});
