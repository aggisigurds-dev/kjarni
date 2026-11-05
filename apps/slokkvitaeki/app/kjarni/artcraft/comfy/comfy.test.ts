import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildImg2VidWorkflow,
  buildTxt2ImgWorkflow,
  clampBatch,
  clampCfg,
  clampFps,
  clampSeed,
  clampShift,
  clampSize,
  clampSteps,
  clampVideoLength,
  clampVideoSize,
  DEFAULT_COMFY_SETTINGS,
  DEFAULT_IMG2VID_SETTINGS,
  normalizeComfySettings,
  normalizeComfyUrl,
  normalizeImg2VidSettings,
  resolveSeed,
  SAVE_IMAGE_NODE_ID,
  SAVE_VIDEO_NODE_ID,
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

test("video clamp helpers keep values in Wan's accepted ranges", () => {
  assert.equal(clampVideoSize(10000), 1280);
  assert.equal(clampVideoSize(1), 256);
  assert.equal(clampVideoSize(830), 832); // rounds to nearest multiple of 16
  assert.equal(clampVideoLength(81), 81);
  assert.equal(clampVideoLength(1), 17); // clamped up, then snapped to 4k+1
  assert.equal(clampVideoLength(200), 81);
  assert.equal(clampVideoLength(50), 49); // snapped to nearest 4k+1
  assert.equal(clampFps(0), 4);
  assert.equal(clampFps(60), 30);
  assert.equal(clampShift(-1), 0);
  assert.equal(clampShift(100), 20);
  assert.equal(clampVideoSize(NaN), DEFAULT_IMG2VID_SETTINGS.width);
  assert.equal(clampVideoLength(NaN), DEFAULT_IMG2VID_SETTINGS.length);
});

test("normalizeImg2VidSettings falls back to defaults for unknown sampler/scheduler and keeps a valid pair", () => {
  const fallback = normalizeImg2VidSettings({ samplerName: "nope" as never, scheduler: "nope" as never });
  assert.equal(fallback.samplerName, DEFAULT_IMG2VID_SETTINGS.samplerName);
  assert.equal(fallback.scheduler, DEFAULT_IMG2VID_SETTINGS.scheduler);

  const kept = normalizeImg2VidSettings({ samplerName: "dpmpp_2m", scheduler: "karras" });
  assert.equal(kept.samplerName, "dpmpp_2m");
  assert.equal(kept.scheduler, "karras");
});

test("buildImg2VidWorkflow matches the verified Wan 2.1 I2V node graph: node IDs, class_type, field names", () => {
  const workflow = buildImg2VidWorkflow({
    unetName: "wan2.1_i2v_480p_14B_fp16.safetensors",
    clipName: "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
    vaeName: "wan_2.1_vae.safetensors",
    clipVisionName: "clip_vision_h.safetensors",
    imageFilename: "kjarni_start.png",
    prompt: "the woman dances happily",
    negativePrompt: "blurry, static",
    width: 832,
    height: 480,
    length: 81,
    fps: 16,
    steps: 20,
    cfg: 6,
    shift: 8,
    samplerName: "uni_pc",
    scheduler: "simple",
    seed: 42,
  }) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;

  assert.equal(workflow["37"].class_type, "UNETLoader");
  assert.deepEqual(workflow["37"].inputs, { unet_name: "wan2.1_i2v_480p_14B_fp16.safetensors", weight_dtype: "default" });

  assert.equal(workflow["38"].class_type, "CLIPLoader");
  assert.deepEqual(workflow["38"].inputs, {
    clip_name: "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
    type: "wan",
    device: "default",
  });

  assert.equal(workflow["39"].class_type, "VAELoader");
  assert.deepEqual(workflow["39"].inputs, { vae_name: "wan_2.1_vae.safetensors" });

  assert.equal(workflow["49"].class_type, "CLIPVisionLoader");
  assert.deepEqual(workflow["49"].inputs, { clip_name: "clip_vision_h.safetensors" });

  assert.equal(workflow["52"].class_type, "LoadImage");
  assert.deepEqual(workflow["52"].inputs, { image: "kjarni_start.png" });

  assert.equal(workflow["51"].class_type, "CLIPVisionEncode");
  assert.deepEqual(workflow["51"].inputs, { clip_vision: ["49", 0], image: ["52", 0], crop: "none" });

  assert.equal(workflow["6"].class_type, "CLIPTextEncode");
  assert.deepEqual(workflow["6"].inputs, { clip: ["38", 0], text: "the woman dances happily" });
  assert.equal(workflow["7"].class_type, "CLIPTextEncode");
  assert.deepEqual(workflow["7"].inputs, { clip: ["38", 0], text: "blurry, static" });

  assert.equal(workflow["54"].class_type, "ModelSamplingSD3");
  assert.deepEqual(workflow["54"].inputs, { model: ["37", 0], shift: 8 });

  assert.equal(workflow["50"].class_type, "WanImageToVideo");
  assert.deepEqual(workflow["50"].inputs, {
    positive: ["6", 0],
    negative: ["7", 0],
    vae: ["39", 0],
    clip_vision_output: ["51", 0],
    start_image: ["52", 0],
    width: 832,
    height: 480,
    length: 81,
    batch_size: 1,
  });

  assert.equal(workflow["3"].class_type, "KSampler");
  assert.deepEqual(workflow["3"].inputs, {
    model: ["54", 0],
    positive: ["50", 0],
    negative: ["50", 1],
    latent_image: ["50", 2],
    seed: 42,
    steps: 20,
    cfg: 6,
    sampler_name: "uni_pc",
    scheduler: "simple",
    denoise: 1,
  });

  assert.equal(workflow["8"].class_type, "VAEDecode");
  assert.deepEqual(workflow["8"].inputs, { samples: ["3", 0], vae: ["39", 0] });

  assert.equal(workflow["55"].class_type, "CreateVideo");
  assert.deepEqual(workflow["55"].inputs, { images: ["8", 0], fps: 16 });

  assert.equal(workflow[SAVE_VIDEO_NODE_ID].class_type, "SaveVideo");
  assert.deepEqual(workflow[SAVE_VIDEO_NODE_ID].inputs, { video: ["55", 0], filename_prefix: "kjarni_vid", format: "auto" });
});

test("buildImg2VidWorkflow fills in defaults and resolves a random seed when the caller omits them", () => {
  const workflow = buildImg2VidWorkflow({
    unetName: "wan.safetensors",
    clipName: "clip.safetensors",
    vaeName: "vae.safetensors",
    clipVisionName: "cv.safetensors",
    imageFilename: "start.png",
    prompt: "x",
  }) as Record<string, { inputs: Record<string, unknown> }>;
  assert.equal(workflow["50"].inputs.width, DEFAULT_IMG2VID_SETTINGS.width);
  assert.equal(workflow["50"].inputs.length, DEFAULT_IMG2VID_SETTINGS.length);
  assert.equal(workflow["55"].inputs.fps, DEFAULT_IMG2VID_SETTINGS.fps);
  assert.equal(workflow["54"].inputs.shift, DEFAULT_IMG2VID_SETTINGS.shift);
  assert.ok(Number.isInteger(workflow["3"].inputs.seed));
  assert.notEqual(workflow["3"].inputs.seed, -1);
});
