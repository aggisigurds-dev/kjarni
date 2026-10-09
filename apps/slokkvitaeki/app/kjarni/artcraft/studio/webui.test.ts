import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_WEBUI_URL, normalizeWebuiUrl, pingWebui, txt2img } from "./webui.ts";

test("normalizes local WebUI URLs", () => {
  assert.equal(normalizeWebuiUrl(""), DEFAULT_WEBUI_URL);
  assert.equal(normalizeWebuiUrl("http://127.0.0.1:7860/"), "http://127.0.0.1:7860");
  assert.equal(normalizeWebuiUrl("http://localhost:7861"), "http://localhost:7861");
  assert.throws(() => normalizeWebuiUrl("ftp://x"), /http/);
});

test("ping reports a down local server", async () => {
  const prev = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("connection refused");
  }) as typeof fetch;
  try {
    const result = await pingWebui("http://127.0.0.1:7860");
    assert.equal(result.ok, false);
  } finally {
    globalThis.fetch = prev;
  }
});

test("txt2img maps base64 images to data URLs", async () => {
  const prev = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ images: ["aaa"] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
  try {
    const images = await txt2img("http://127.0.0.1:7860", { prompt: "nude adult woman" });
    assert.deepEqual(images, ["data:image/png;base64,aaa"]);
  } finally {
    globalThis.fetch = prev;
  }
});
