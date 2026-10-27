/** ComfyUI-compatible local API — same "local server the user runs on
 * their own machine" pattern as studio/webui.ts and vidgerd/server.ts, but
 * talking to ComfyUI's node-graph API instead of Automatic1111's.
 *
 * Every endpoint, request/response shape and field name here is verified
 * against ComfyUI's own source (comfyanonymous/ComfyUI on GitHub) — not
 * guessed: server.py (routes), execution.py (history/status shape),
 * comfy/samplers.py (sampler/scheduler name lists), and
 * script_examples/websockets_api_example.py (the canonical minimal
 * txt2img "API format" workflow this builds). No websocket here — plain
 * HTTP polling of /history/{prompt_id}, same style already used for the
 * Replicate route and the FotoWeb background-task proxy in this app. */

export const DEFAULT_COMFY_URL = "http://127.0.0.1:8188";
export const COMFY_URL_KEY = "kjarni_private_comfy_url";
export const COMFY_SETTINGS_KEY = "kjarni_private_comfy_settings";
export const IMG2VID_SETTINGS_KEY = "kjarni_private_comfy_video_settings";

// Curated common subset of comfy/samplers.py's SAMPLER_NAMES / SCHEDULER_NAMES
// — the full lists run to 40+ obscure research samplers, same curation
// style as studio/webui.ts's SAMPLERS list for Automatic1111.
export const COMFY_SAMPLERS = [
  "euler",
  "euler_ancestral",
  "dpmpp_2m",
  "dpmpp_2m_sde",
  "dpmpp_sde",
  "ddim",
  "lcm",
  "uni_pc",
] as const;

export const COMFY_SCHEDULERS = ["normal", "karras", "exponential", "simple", "ddim_uniform"] as const;

export type ComfySampler = (typeof COMFY_SAMPLERS)[number];
export type ComfyScheduler = (typeof COMFY_SCHEDULERS)[number];

export type ComfySettings = {
  steps: number;
  width: number;
  height: number;
  cfg: number;
  seed: number;
  samplerName: ComfySampler;
  scheduler: ComfyScheduler;
  batchSize: number;
};

export const DEFAULT_COMFY_SETTINGS: ComfySettings = {
  steps: 20,
  width: 512,
  height: 512,
  cfg: 8,
  seed: -1,
  samplerName: "euler",
  scheduler: "normal",
  batchSize: 1,
};

export function clampSteps(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_COMFY_SETTINGS.steps;
  return Math.min(80, Math.max(1, Math.round(n)));
}

export function clampSize(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_COMFY_SETTINGS.width;
  return Math.min(1536, Math.max(64, Math.round(n / 8) * 8));
}

export function clampCfg(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_COMFY_SETTINGS.cfg;
  return Math.min(30, Math.max(0, Math.round(n * 10) / 10));
}

export function clampSeed(n: number): number {
  if (!Number.isFinite(n)) return -1;
  return Math.trunc(n);
}

export function clampBatch(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(4, Math.max(1, Math.round(n)));
}

export function normalizeComfySettings(raw: Partial<ComfySettings> | null | undefined): ComfySettings {
  const src = raw || {};
  return {
    steps: clampSteps(src.steps ?? DEFAULT_COMFY_SETTINGS.steps),
    width: clampSize(src.width ?? DEFAULT_COMFY_SETTINGS.width),
    height: clampSize(src.height ?? DEFAULT_COMFY_SETTINGS.height),
    cfg: clampCfg(src.cfg ?? DEFAULT_COMFY_SETTINGS.cfg),
    seed: clampSeed(src.seed ?? DEFAULT_COMFY_SETTINGS.seed),
    samplerName: COMFY_SAMPLERS.includes(src.samplerName as ComfySampler)
      ? (src.samplerName as ComfySampler)
      : DEFAULT_COMFY_SETTINGS.samplerName,
    scheduler: COMFY_SCHEDULERS.includes(src.scheduler as ComfyScheduler)
      ? (src.scheduler as ComfyScheduler)
      : DEFAULT_COMFY_SETTINGS.scheduler,
    batchSize: clampBatch(src.batchSize ?? DEFAULT_COMFY_SETTINGS.batchSize),
  };
}

export function readStoredComfySettings(): ComfySettings {
  if (typeof window === "undefined") return DEFAULT_COMFY_SETTINGS;
  try {
    const raw = window.localStorage.getItem(COMFY_SETTINGS_KEY);
    return raw ? normalizeComfySettings(JSON.parse(raw) as Partial<ComfySettings>) : DEFAULT_COMFY_SETTINGS;
  } catch {
    return DEFAULT_COMFY_SETTINGS;
  }
}

export function normalizeComfyUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return DEFAULT_COMFY_URL;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Aðeins http eða https");
    }
    return url.origin + url.pathname.replace(/\/+$/, "");
  } catch (err) {
    if (err instanceof Error && err.message === "Aðeins http eða https") throw err;
    throw new Error("Ógild slóð á staðbundna ComfyUI-þjóninn");
  }
}

export function readStoredComfyUrl(): string {
  if (typeof window === "undefined") return DEFAULT_COMFY_URL;
  return window.localStorage.getItem(COMFY_URL_KEY) || DEFAULT_COMFY_URL;
}

/** ComfyUI has no server-side "-1 means random" behaviour like
 * Automatic1111 — the seed that's sent is the seed that's used, so -1 is
 * resolved to a real random seed client-side before building the workflow. */
export function resolveSeed(seed: number): number {
  if (seed >= 0) return Math.trunc(seed);
  return Math.floor(Math.random() * 0xffffffff);
}

export type Txt2ImgInput = {
  checkpoint: string;
  prompt: string;
  negativePrompt?: string;
  steps?: number;
  width?: number;
  height?: number;
  cfg?: number;
  seed?: number;
  samplerName?: string;
  scheduler?: string;
  batchSize?: number;
};

/** Node IDs and field names match ComfyUI's own canonical minimal txt2img
 * example verbatim (script_examples/websockets_api_example.py): 3=KSampler,
 * 4=CheckpointLoaderSimple, 5=EmptyLatentImage, 6/7=CLIPTextEncode
 * positive/negative, 8=VAEDecode, 9=SaveImage. */
export function buildTxt2ImgWorkflow(input: Txt2ImgInput): Record<string, unknown> {
  return {
    "3": {
      class_type: "KSampler",
      inputs: {
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0],
        seed: resolveSeed(input.seed ?? DEFAULT_COMFY_SETTINGS.seed),
        steps: clampSteps(input.steps ?? DEFAULT_COMFY_SETTINGS.steps),
        cfg: clampCfg(input.cfg ?? DEFAULT_COMFY_SETTINGS.cfg),
        sampler_name: input.samplerName || DEFAULT_COMFY_SETTINGS.samplerName,
        scheduler: input.scheduler || DEFAULT_COMFY_SETTINGS.scheduler,
        denoise: 1,
      },
    },
    "4": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: input.checkpoint },
    },
    "5": {
      class_type: "EmptyLatentImage",
      inputs: {
        batch_size: clampBatch(input.batchSize ?? DEFAULT_COMFY_SETTINGS.batchSize),
        width: clampSize(input.width ?? DEFAULT_COMFY_SETTINGS.width),
        height: clampSize(input.height ?? DEFAULT_COMFY_SETTINGS.height),
      },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: { clip: ["4", 1], text: input.prompt },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: { clip: ["4", 1], text: input.negativePrompt || "" },
    },
    "8": {
      class_type: "VAEDecode",
      inputs: { samples: ["3", 0], vae: ["4", 2] },
    },
    "9": {
      class_type: "SaveImage",
      inputs: { images: ["8", 0], filename_prefix: "kjarni" },
    },
  };
}

export const SAVE_IMAGE_NODE_ID = "9";

async function comfyFetch(base: string, path: string, init?: RequestInit): Promise<Response> {
  const url = `${normalizeComfyUrl(base)}${path}`;
  return fetch(url, { ...init, headers: { Accept: "application/json", ...(init?.headers || {}) } });
}

export async function pingComfy(base: string): Promise<{ ok: true; version?: string } | { ok: false; error: string }> {
  try {
    const res = await comfyFetch(base, "/system_stats");
    if (!res.ok) return { ok: false, error: `Staðbundna ComfyUI-þjónninn svaraði ${res.status}` };
    const data = (await res.json()) as { system?: { comfyui_version?: string } };
    return { ok: true, version: data.system?.comfyui_version };
  } catch {
    return {
      ok: false,
      error:
        "Náði ekki í staðbundið ComfyUI. Ræstu það með --enable-cors-header, svo reyndu aftur (sjá README í tools/comfy).",
    };
  }
}

export type CheckpointInfo = { name: string };

export async function listCheckpoints(base: string): Promise<string[]> {
  const res = await comfyFetch(base, "/object_info/CheckpointLoaderSimple");
  if (!res.ok) return [];
  const data = (await res.json()) as Record<
    string,
    { input?: { required?: { ckpt_name?: [string[], unknown] } } }
  >;
  return data.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];
}

async function queuePrompt(base: string, workflow: Record<string, unknown>): Promise<string> {
  const res = await comfyFetch(base, "/prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow }),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string }; node_errors?: Record<string, unknown> };
      const nodeErrors = parsed.node_errors && Object.keys(parsed.node_errors).length ? JSON.stringify(parsed.node_errors) : "";
      message = parsed.error?.message || nodeErrors || text;
    } catch {
      // not JSON, use raw text
    }
    throw new Error(message || `ComfyUI hafnaði verkefninu (${res.status})`);
  }
  const data = JSON.parse(text) as { prompt_id: string };
  return data.prompt_id;
}

type ComfyImageRef = { filename: string; subfolder: string; type: string };

type HistoryEntry = {
  outputs?: Record<string, { images?: ComfyImageRef[] }>;
  status?: { status_str: "success" | "error"; completed: boolean; messages?: unknown[] };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function pollHistory(base: string, promptId: string, deadline: number): Promise<HistoryEntry> {
  for (;;) {
    const res = await comfyFetch(base, `/history/${promptId}`);
    if (res.ok) {
      const data = (await res.json()) as Record<string, HistoryEntry>;
      const entry = data[promptId];
      if (entry) return entry;
    }
    if (Date.now() > deadline) throw new Error("ComfyUI svaraði ekki í tæka tíð — athugaðu biðröðina.");
    await sleep(1200);
  }
}

function viewUrl(base: string, ref: ComfyImageRef): string {
  const params = new URLSearchParams({ filename: ref.filename, subfolder: ref.subfolder, type: ref.type });
  return `${normalizeComfyUrl(base)}/view?${params.toString()}`;
}

async function fetchImageBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gat ekki sótt mynd af ComfyUI (${res.status})`);
  return res.blob();
}

export async function txt2img(
  base: string,
  input: Txt2ImgInput,
  onProgress?: (text: string) => void,
): Promise<Blob[]> {
  if (!input.checkpoint?.trim()) throw new Error("Veldu checkpoint-líkan fyrst.");
  const workflow = buildTxt2ImgWorkflow(input);
  onProgress?.("Sendi verkefni í biðröð…");
  const promptId = await queuePrompt(base, workflow);
  onProgress?.("ComfyUI vinnur…");
  const entry = await pollHistory(base, promptId, Date.now() + 180_000);
  if (entry.status?.status_str === "error") {
    throw new Error(`ComfyUI villa: ${JSON.stringify(entry.status.messages || "óþekkt villa")}`);
  }
  const images = entry.outputs?.[SAVE_IMAGE_NODE_ID]?.images || [];
  if (images.length === 0) throw new Error("ComfyUI skilaði engri mynd — athugaðu workflow-villur.");
  onProgress?.("Sæki mynd…");
  return Promise.all(images.map((ref) => fetchImageBlob(viewUrl(base, ref))));
}

// ---------------------------------------------------------------------------
// Mynd → myndband (Wan 2.1 Image-to-Video)
//
// Node graph verified against Comfy-Org's official template
// (Comfy-Org/workflow_templates/templates/image_to_video_wan.json) and
// cross-checked node-by-node against the real classes in
// comfyanonymous/ComfyUI: comfy_extras/nodes_wan.py (WanImageToVideo's
// exact input names), nodes_video.py (CreateVideo/SaveVideo — SaveVideo's
// history output nests under "images", same shape as SaveImage, which is
// why HistoryEntry needs no new type), and nodes_model_advanced.py
// (ModelSamplingSD3's "shift" float). The upload step (POST /upload/image)
// is verified against server.py's upload_image handler.

export const DEFAULT_WAN_UNET = "wan2.1_i2v_480p_14B_fp16.safetensors";
export const DEFAULT_WAN_CLIP = "umt5_xxl_fp8_e4m3fn_scaled.safetensors";
export const DEFAULT_WAN_VAE = "wan_2.1_vae.safetensors";
export const DEFAULT_WAN_CLIP_VISION = "clip_vision_h.safetensors";

export type Img2VidSettings = {
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  length: number;
  fps: number;
  steps: number;
  cfg: number;
  shift: number;
  samplerName: ComfySampler;
  scheduler: ComfyScheduler;
  seed: number;
};

export const DEFAULT_IMG2VID_SETTINGS: Img2VidSettings = {
  prompt: "",
  negativePrompt: "",
  width: 832,
  height: 480,
  length: 81,
  fps: 16,
  steps: 20,
  cfg: 6,
  shift: 8,
  samplerName: "uni_pc",
  scheduler: "simple",
  seed: -1,
};

export function clampVideoSize(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_IMG2VID_SETTINGS.width;
  return Math.min(1280, Math.max(256, Math.round(n / 16) * 16));
}

/** WanImageToVideo wants frame counts of the form 4k+1 (81 = 4·20+1) for
 * clean temporal VAE compression — round into that shape after clamping. */
export function clampVideoLength(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_IMG2VID_SETTINGS.length;
  const clamped = Math.min(81, Math.max(17, Math.round(n)));
  return Math.round((clamped - 1) / 4) * 4 + 1;
}

export function clampFps(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_IMG2VID_SETTINGS.fps;
  return Math.min(30, Math.max(4, Math.round(n)));
}

export function clampShift(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_IMG2VID_SETTINGS.shift;
  return Math.min(20, Math.max(0, Math.round(n * 10) / 10));
}

export function readStoredImg2VidSettings(): Img2VidSettings {
  if (typeof window === "undefined") return DEFAULT_IMG2VID_SETTINGS;
  try {
    const raw = window.localStorage.getItem(IMG2VID_SETTINGS_KEY);
    return raw ? normalizeImg2VidSettings(JSON.parse(raw) as Partial<Img2VidSettings>) : DEFAULT_IMG2VID_SETTINGS;
  } catch {
    return DEFAULT_IMG2VID_SETTINGS;
  }
}

export function normalizeImg2VidSettings(raw: Partial<Img2VidSettings> | null | undefined): Img2VidSettings {
  const src = raw || {};
  return {
    prompt: typeof src.prompt === "string" ? src.prompt : DEFAULT_IMG2VID_SETTINGS.prompt,
    negativePrompt: typeof src.negativePrompt === "string" ? src.negativePrompt : DEFAULT_IMG2VID_SETTINGS.negativePrompt,
    width: clampVideoSize(src.width ?? DEFAULT_IMG2VID_SETTINGS.width),
    height: clampVideoSize(src.height ?? DEFAULT_IMG2VID_SETTINGS.height),
    length: clampVideoLength(src.length ?? DEFAULT_IMG2VID_SETTINGS.length),
    fps: clampFps(src.fps ?? DEFAULT_IMG2VID_SETTINGS.fps),
    steps: clampSteps(src.steps ?? DEFAULT_IMG2VID_SETTINGS.steps),
    cfg: clampCfg(src.cfg ?? DEFAULT_IMG2VID_SETTINGS.cfg),
    shift: clampShift(src.shift ?? DEFAULT_IMG2VID_SETTINGS.shift),
    samplerName: COMFY_SAMPLERS.includes(src.samplerName as ComfySampler)
      ? (src.samplerName as ComfySampler)
      : DEFAULT_IMG2VID_SETTINGS.samplerName,
    scheduler: COMFY_SCHEDULERS.includes(src.scheduler as ComfyScheduler)
      ? (src.scheduler as ComfyScheduler)
      : DEFAULT_IMG2VID_SETTINGS.scheduler,
    seed: clampSeed(src.seed ?? DEFAULT_IMG2VID_SETTINGS.seed),
  };
}

export type Img2VidInput = {
  unetName: string;
  clipName: string;
  vaeName: string;
  clipVisionName: string;
  imageFilename: string;
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  length?: number;
  fps?: number;
  steps?: number;
  cfg?: number;
  shift?: number;
  samplerName?: string;
  scheduler?: string;
  seed?: number;
};

/** Node IDs match Comfy-Org's official image_to_video_wan.json template
 * verbatim: 37=UNETLoader, 38=CLIPLoader, 39=VAELoader, 49=CLIPVisionLoader,
 * 52=LoadImage, 51=CLIPVisionEncode, 6/7=CLIPTextEncode positive/negative,
 * 54=ModelSamplingSD3, 50=WanImageToVideo, 3=KSampler, 8=VAEDecode,
 * 55=CreateVideo, 56=SaveVideo. */
export function buildImg2VidWorkflow(input: Img2VidInput): Record<string, unknown> {
  return {
    "37": { class_type: "UNETLoader", inputs: { unet_name: input.unetName, weight_dtype: "default" } },
    "38": { class_type: "CLIPLoader", inputs: { clip_name: input.clipName, type: "wan", device: "default" } },
    "39": { class_type: "VAELoader", inputs: { vae_name: input.vaeName } },
    "49": { class_type: "CLIPVisionLoader", inputs: { clip_name: input.clipVisionName } },
    "52": { class_type: "LoadImage", inputs: { image: input.imageFilename } },
    "51": {
      class_type: "CLIPVisionEncode",
      inputs: { clip_vision: ["49", 0], image: ["52", 0], crop: "none" },
    },
    "6": { class_type: "CLIPTextEncode", inputs: { clip: ["38", 0], text: input.prompt } },
    "7": { class_type: "CLIPTextEncode", inputs: { clip: ["38", 0], text: input.negativePrompt || "" } },
    "54": {
      class_type: "ModelSamplingSD3",
      inputs: { model: ["37", 0], shift: clampShift(input.shift ?? DEFAULT_IMG2VID_SETTINGS.shift) },
    },
    "50": {
      class_type: "WanImageToVideo",
      inputs: {
        positive: ["6", 0],
        negative: ["7", 0],
        vae: ["39", 0],
        clip_vision_output: ["51", 0],
        start_image: ["52", 0],
        width: clampVideoSize(input.width ?? DEFAULT_IMG2VID_SETTINGS.width),
        height: clampVideoSize(input.height ?? DEFAULT_IMG2VID_SETTINGS.height),
        length: clampVideoLength(input.length ?? DEFAULT_IMG2VID_SETTINGS.length),
        batch_size: 1,
      },
    },
    "3": {
      class_type: "KSampler",
      inputs: {
        model: ["54", 0],
        positive: ["50", 0],
        negative: ["50", 1],
        latent_image: ["50", 2],
        seed: resolveSeed(input.seed ?? DEFAULT_IMG2VID_SETTINGS.seed),
        steps: clampSteps(input.steps ?? DEFAULT_IMG2VID_SETTINGS.steps),
        cfg: clampCfg(input.cfg ?? DEFAULT_IMG2VID_SETTINGS.cfg),
        sampler_name: input.samplerName || DEFAULT_IMG2VID_SETTINGS.samplerName,
        scheduler: input.scheduler || DEFAULT_IMG2VID_SETTINGS.scheduler,
        denoise: 1,
      },
    },
    "8": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["39", 0] } },
    "55": {
      class_type: "CreateVideo",
      inputs: { images: ["8", 0], fps: clampFps(input.fps ?? DEFAULT_IMG2VID_SETTINGS.fps) },
    },
    "56": {
      class_type: "SaveVideo",
      inputs: { video: ["55", 0], filename_prefix: "kjarni_vid", format: "auto" },
    },
  };
}

export const SAVE_VIDEO_NODE_ID = "56";

async function listObjectInfoNames(base: string, nodeClass: string, inputName: string): Promise<string[]> {
  const res = await comfyFetch(base, `/object_info/${nodeClass}`);
  if (!res.ok) return [];
  const data = (await res.json()) as Record<
    string,
    { input?: { required?: Record<string, [string[], unknown]> } }
  >;
  return data[nodeClass]?.input?.required?.[inputName]?.[0] || [];
}

export async function listUnetModels(base: string): Promise<string[]> {
  return listObjectInfoNames(base, "UNETLoader", "unet_name");
}
export async function listClipModels(base: string): Promise<string[]> {
  return listObjectInfoNames(base, "CLIPLoader", "clip_name");
}
export async function listVaeModels(base: string): Promise<string[]> {
  return listObjectInfoNames(base, "VAELoader", "vae_name");
}
export async function listClipVisionModels(base: string): Promise<string[]> {
  return listObjectInfoNames(base, "CLIPVisionLoader", "clip_name");
}

async function uploadImageToComfy(base: string, file: Blob, filename: string): Promise<string> {
  const form = new FormData();
  form.append("image", file, filename);
  form.append("type", "input");
  const res = await comfyFetch(base, "/upload/image", { method: "POST", body: form });
  if (!res.ok) throw new Error(`ComfyUI hafnaði myndinni (${res.status})`);
  const data = (await res.json()) as { name: string };
  return data.name;
}

async function fetchVideoBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gat ekki sótt myndband af ComfyUI (${res.status})`);
  return res.blob();
}

export async function img2vid(
  base: string,
  file: Blob,
  input: Omit<Img2VidInput, "imageFilename">,
  onProgress?: (text: string) => void,
): Promise<Blob> {
  if (!input.unetName?.trim()) throw new Error("Veldu Wan díffusion-líkan fyrst.");
  if (!input.clipName?.trim()) throw new Error("Veldu CLIP-líkan fyrst.");
  if (!input.vaeName?.trim()) throw new Error("Veldu VAE-líkan fyrst.");
  if (!input.clipVisionName?.trim()) throw new Error("Veldu CLIP Vision-líkan fyrst.");
  onProgress?.("Sendi mynd til ComfyUI…");
  const imageFilename = await uploadImageToComfy(base, file, "kjarni_start.png");
  const workflow = buildImg2VidWorkflow({ ...input, imageFilename });
  onProgress?.("Sendi verkefni í biðröð…");
  const promptId = await queuePrompt(base, workflow);
  onProgress?.("ComfyUI vinnur myndbandið — þetta getur tekið nokkrar mínútur…");
  const entry = await pollHistory(base, promptId, Date.now() + 600_000);
  if (entry.status?.status_str === "error") {
    throw new Error(`ComfyUI villa: ${JSON.stringify(entry.status.messages || "óþekkt villa")}`);
  }
  const videos = entry.outputs?.[SAVE_VIDEO_NODE_ID]?.images || [];
  if (videos.length === 0) throw new Error("ComfyUI skilaði engu myndbandi — athugaðu workflow-villur.");
  onProgress?.("Sæki myndband…");
  return fetchVideoBlob(viewUrl(base, videos[0]));
}
