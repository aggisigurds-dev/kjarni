import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canEmbedLocalWebui,
  clampDenoising,
  clampSize,
  DEFAULT_WEBUI_URL,
  denoisingHint,
  findFaceAdapter,
  findStudioAdapters,
  generateLocal,
  img2img,
  resolveInitImage,
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
  } finally {
    globalThis.fetch = prev;
  }
});

test("generateLocal refuses prompt-only so Forge cannot invent a new face", async () => {
  await assert.rejects(
    () => generateLocal("http://127.0.0.1:7860", { prompt: "adult woman" }),
    /ljósmynd/,
  );
});

test("generateLocal uses a face ref as the start image when init is missing", async () => {
  const prev = globalThis.fetch;
  let sent: Record<string, unknown> = {};
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    sent = { url: String(input), ...(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>) };
    return new Response(JSON.stringify({ images: ["bbb"] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  try {
    assert.equal(resolveInitImage({ prompt: "x", faceRefs: ["data:image/png;base64,FACE"] }), "data:image/png;base64,FACE");
    await generateLocal("http://127.0.0.1:7860", {
      prompt: "same clothes",
      faceRefs: ["data:image/png;base64,FACE"],
    });
    assert.match(String(sent.url), /img2img/);
    assert.deepEqual(sent.init_images, ["FACE"]);
  } finally {
    globalThis.fetch = prev;
  }
});

test("txt2img sends restore_faces and ControlNet face refs", async () => {
  const prev = globalThis.fetch;
  let sent: Record<string, unknown> = {};
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
    return new Response(JSON.stringify({ images: ["aaa"] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  try {
    await txt2img("http://127.0.0.1:7860", {
      prompt: "adult woman",
      restoreFaces: true,
      faceRefs: ["data:image/png;base64,AAA"],
      faceAdapter: { model: "ip-adapter-plus-face_sd15", module: "ip-adapter-auto" },
    });
    assert.equal(sent.restore_faces, true);
    const args = (sent.alwayson_scripts as { controlnet: { args: Array<{ image: string; model: string }> } })
      .controlnet.args;
    assert.equal(args[0].image, "AAA");
    assert.equal(args[0].model, "ip-adapter-plus-face_sd15");
  } finally {
    globalThis.fetch = prev;
  }
});

test("txt2img without a profile keeps the payload clean", async () => {
  const prev = globalThis.fetch;
  let sent: Record<string, unknown> = {};
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
    return new Response(JSON.stringify({ images: ["aaa"] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  try {
    await txt2img("http://127.0.0.1:7860", { prompt: "adult woman" });
    assert.equal(sent.restore_faces, undefined);
    assert.equal(sent.alwayson_scripts, undefined);
  } finally {
    globalThis.fetch = prev;
  }
});

test("findStudioAdapters splits face, pose and style models", async () => {
  const prev = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/controlnet/model_list")) {
      return new Response(
        JSON.stringify({
          model_list: ["control_v11p_sd15_openpose", "ip-adapter-plus-face_sd15", "ip-adapter_sd15"],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ module_list: ["canny", "openpose", "ip-adapter-auto"] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  try {
    const adapters = await findStudioAdapters("http://127.0.0.1:7860");
    assert.equal(adapters.face?.model, "ip-adapter-plus-face_sd15");
    assert.match(adapters.pose?.model || "", /openpose/);
    assert.equal(adapters.style?.model, "ip-adapter_sd15");
    assert.deepEqual(await findFaceAdapter("http://127.0.0.1:7860"), adapters.face);
  } finally {
    globalThis.fetch = prev;
  }
});

test("txt2img sends pose and style ControlNet units ahead of face refs", async () => {
  const prev = globalThis.fetch;
  let sent: Record<string, unknown> = {};
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
    return new Response(JSON.stringify({ images: ["aaa"] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  try {
    await txt2img("http://127.0.0.1:7860", {
      prompt: "adult woman",
      restoreFaces: true,
      faceRefs: ["data:image/png;base64,FACE"],
      faceAdapter: { model: "ip-adapter-plus-face_sd15", module: "ip-adapter-auto" },
      poseRef: "data:image/png;base64,POSE",
      poseAdapter: { model: "control_v11p_sd15_openpose", module: "openpose" },
      styleRef: "data:image/png;base64,STYLE",
      styleAdapter: { model: "ip-adapter_sd15", module: "ip-adapter" },
    });
    const args = (sent.alwayson_scripts as { controlnet: { args: Array<{ image: string }> } }).controlnet.args;
    assert.equal(args[0].image, "POSE");
    assert.equal(args[1].image, "STYLE");
    assert.equal(args[2].image, "FACE");
  } finally {
    globalThis.fetch = prev;
  }
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
