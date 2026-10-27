import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildTxt2ImgWorkflow,
  clampBatch,
  clampCfg,
  clampSeed,
  clampSize,
  clampSteps,
  DEFAULT_COMFY_SETTINGS,
  normalizeComfySettings,
  normalizeComfyUrl,
  resolveSeed,
  SAVE_IMAGE_NODE_ID,
} from "./comfy.ts";

test("clamp helpers keep values in ComfyUI's accepted ranges", () => {
  assert.equal(clampSteps(0), 1);
  assert.equal(clampSteps(200), 80);
  assert.equal(clampSteps(NaN), DEFAULT_COMFY_SETTINGS.steps);
  assert.equal(clampSize(10000), 1536);
  assert.equal(clampSize(1), 64);
  assert.equal(clampSize(513), 512); // rounds to nearest multiple of 8
  assert.equal(clampCfg(-5), 0);
  assert.equal(clampCfg(100), 30);
  assert.equal(clampSeed(3.7), 3);
  assert.equal(clampSeed(NaN), -1);
  assert.equal(clampBatch(0), 1);
  assert.equal(clampBatch(10), 4);
});

test("normalizeComfySettings falls back to defaults for unknown sampler/scheduler", () => {
  const out = normalizeComfySettings({ samplerName: "not-a-real-sampler" as never, scheduler: "not-real" as never });
  assert.equal(out.samplerName, DEFAULT_COMFY_SETTINGS.samplerName);
  assert.equal(out.scheduler, DEFAULT_COMFY_SETTINGS.scheduler);
});

test("normalizeComfySettings accepts a real sampler/scheduler pair unchanged", () => {
  const out = normalizeComfySettings({ samplerName: "dpmpp_2m", scheduler: "karras" });
  assert.equal(out.samplerName, "dpmpp_2m");
  assert.equal(out.scheduler, "karras");
});

test("resolveSeed passes non-negative seeds through unchanged, truncated", () => {
  assert.equal(resolveSeed(42.9), 42);
  assert.equal(resolveSeed(0), 0);
});

test("resolveSeed turns -1 into a real random non-negative integer — ComfyUI has no server-side randomize", () => {
  const seed = resolveSeed(-1);
  assert.ok(Number.isInteger(seed));
  assert.ok(seed >= 0 && seed <= 0xffffffff);
});

test("normalizeComfyUrl mirrors the other local-server tools: trims, validates scheme, defaults", () => {
  assert.equal(normalizeComfyUrl(""), "http://127.0.0.1:8188");
  assert.equal(normalizeComfyUrl("http://127.0.0.1:8188/"), "http://127.0.0.1:8188");
  assert.throws(() => normalizeComfyUrl("ftp://x"), /http eða https/);
});

test("buildTxt2ImgWorkflow matches ComfyUI's own canonical example: node IDs, class_type, field names", () => {
  const workflow = buildTxt2ImgWorkflow({
    checkpoint: "v1-5-pruned-emaonly.safetensors",
    prompt: "a cat",
    negativePrompt: "blurry",
    steps: 20,
    width: 512,
    height: 512,
    cfg: 8,
    seed: 5,
    samplerName: "euler",
    scheduler: "normal",
    batchSize: 1,
  }) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;

  assert.equal(workflow["4"].class_type, "CheckpointLoaderSimple");
  assert.equal(workflow["4"].inputs.ckpt_name, "v1-5-pruned-emaonly.safetensors");

  assert.equal(workflow["5"].class_type, "EmptyLatentImage");
  assert.deepEqual(workflow["5"].inputs, { batch_size: 1, width: 512, height: 512 });

  assert.equal(workflow["6"].class_type, "CLIPTextEncode");
  assert.deepEqual(workflow["6"].inputs, { clip: ["4", 1], text: "a cat" });
  assert.equal(workflow["7"].class_type, "CLIPTextEncode");
  assert.deepEqual(workflow["7"].inputs, { clip: ["4", 1], text: "blurry" });

  assert.equal(workflow["3"].class_type, "KSampler");
  assert.deepEqual(workflow["3"].inputs, {
    model: ["4", 0],
    positive: ["6", 0],
    negative: ["7", 0],
    latent_image: ["5", 0],
    seed: 5,
    steps: 20,
    cfg: 8,
    sampler_name: "euler",
    scheduler: "normal",
    denoise: 1,
  });

  assert.equal(workflow["8"].class_type, "VAEDecode");
  assert.deepEqual(workflow["8"].inputs, { samples: ["3", 0], vae: ["4", 2] });

  assert.equal(workflow[SAVE_IMAGE_NODE_ID].class_type, "SaveImage");
  assert.deepEqual(workflow[SAVE_IMAGE_NODE_ID].inputs, { images: ["8", 0], filename_prefix: "kjarni" });
});

test("buildTxt2ImgWorkflow fills in defaults and resolves a random seed when the caller omits them", () => {
  const workflow = buildTxt2ImgWorkflow({ checkpoint: "model.safetensors", prompt: "x" }) as Record<
    string,
    { inputs: Record<string, unknown> }
  >;
  assert.equal(workflow["3"].inputs.steps, DEFAULT_COMFY_SETTINGS.steps);
  assert.equal(workflow["3"].inputs.sampler_name, DEFAULT_COMFY_SETTINGS.samplerName);
  assert.ok(Number.isInteger(workflow["3"].inputs.seed));
  assert.notEqual(workflow["3"].inputs.seed, -1);
});
