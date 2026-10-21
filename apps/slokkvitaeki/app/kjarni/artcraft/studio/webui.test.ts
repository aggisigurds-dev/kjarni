import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canEmbedLocalWebui,
  clampDenoising,
  clampSize,
  DEFAULT_WEBUI_URL,
  denoisingHint,
  generateLocal,
  img2img,
  normalizeSettings,
  normalizeWebuiUrl,
  pingWebui,
  sizePresetId,
  studioPayload,
  toApiImage,
  txt2img,
} from "./webui.ts";

test("embeds the local WebUI only on http Kjarni", () => {
  assert.equal(canEmbedLocalWebui("http:"), true);
  assert.equal(canEmbedLocalWebui("https:"), false);
});

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

test("studioPayload clamps size to multiples of 8 and keeps sampler", () => {
  const body = studioPayload({
    prompt: "adult woman",
    steps: 40,
    width: 770,
    height: 511,
    cfgScale: 7.25,
    seed: 12,
    samplerName: "DPM++ 2M Karras",
    batchSize: 3,
  });
  assert.equal(body.width, 768);
  assert.equal(body.height, 512);
  assert.equal(body.steps, 40);
  assert.equal(body.cfg_scale, 7.3);
  assert.equal(body.seed, 12);
  assert.equal(body.sampler_name, "DPM++ 2M Karras");
  assert.equal(body.batch_size, 3);
});

test("toApiImage strips a data URL prefix", () => {
  assert.equal(toApiImage("data:image/png;base64,abc"), "abc");
  assert.equal(toApiImage("abc"), "abc");
});

test("img2img posts a mask when the user painted a region", async () => {
  const prev = globalThis.fetch;
  let sent: Record<string, unknown> = {};
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
    return new Response(JSON.stringify({ images: ["zzz"] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  try {
    await img2img("http://127.0.0.1:7860", {
      prompt: "red dress",
      initImage: "data:image/png;base64,SRC",
      mask: "data:image/png;base64,MASK",
      maskBlur: 8,
      denoisingStrength: 0.6,
    });
    assert.equal(sent.mask, "MASK");
    assert.equal(sent.mask_blur, 8);
    assert.equal(sent.inpaint_full_res, true);
    assert.equal(sent.inpainting_fill, 1);
  } finally {
    globalThis.fetch = prev;
  }
});

test("img2img posts init_images and denoising_strength", async () => {
  const prev = globalThis.fetch;
  let sent: { url?: string; body?: Record<string, unknown> } = {};
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    sent = {
      url: String(input),
      body: JSON.parse(String(init?.body || "{}")) as Record<string, unknown>,
    };
    return new Response(JSON.stringify({ images: ["data:image/png;base64,zzz"] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  try {
    const images = await img2img("http://127.0.0.1:7860/", {
      prompt: "red dress, same adult woman",
      initImage: "data:image/png;base64,SRC",
      denoisingStrength: 0.32,
      steps: 20,
    });
    assert.deepEqual(images, ["data:image/png;base64,zzz"]);
    assert.match(sent.url || "", /\/sdapi\/v1\/img2img$/);
    assert.deepEqual(sent.body?.init_images, ["SRC"]);
    assert.equal(sent.body?.denoising_strength, 0.32);
    assert.equal(sent.body?.steps, 20);
  } finally {
    globalThis.fetch = prev;
  }
});

test("generateLocal uses img2img when a source image is present", async () => {
  const prev = globalThis.fetch;
  let path = "";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    path = String(input);
    return new Response(JSON.stringify({ images: ["bbb"] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  try {
    await generateLocal("http://127.0.0.1:7860", {
      prompt: "change outfit",
      initImage: "data:image/jpeg;base64,xx",
    });
    assert.match(path, /img2img/);
    await generateLocal("http://127.0.0.1:7860", { prompt: "adult woman" });
    assert.match(path, /txt2img/);
  } finally {
    globalThis.fetch = prev;
  }
});

test("generateLocal requires a prompt when there is no source image", async () => {
  await assert.rejects(() => generateLocal("http://127.0.0.1:7860", { prompt: "  " }), /prompt/);
});

test("settings helpers", () => {
  assert.equal(clampSize(770), 768);
  assert.equal(clampDenoising(1.4), 1);
  assert.equal(sizePresetId(512, 768), "512x768");
  assert.match(denoisingHint(0.25), /ljósmynd/);
  assert.match(denoisingHint(0.45), /fötum/);
  assert.match(denoisingHint(0.8), /Ný mynd/);
  const normalized = normalizeSettings({ steps: 999, samplerName: "nope", batchSize: 0 });
  assert.equal(normalized.steps, 80);
  assert.equal(normalized.samplerName, "Euler a");
  assert.equal(normalized.batchSize, 1);
});
