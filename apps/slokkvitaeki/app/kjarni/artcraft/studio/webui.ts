/** Automatic1111 / Forge / SD.Next compatible local API. Runs on the user's machine. */

export const DEFAULT_WEBUI_URL = "http://127.0.0.1:7860";
export const WEBUI_URL_KEY = "kjarni_private_studio_webui";
export const SETTINGS_KEY = "kjarni_private_studio_settings";

export const SIZE_PRESETS = [
  { id: "768", label: "768 × 768", width: 768, height: 768 },
  { id: "512", label: "512 × 512", width: 512, height: 512 },
  { id: "512x768", label: "512 × 768 (portrett)", width: 512, height: 768 },
  { id: "768x512", label: "768 × 512 (landslag)", width: 768, height: 512 },
  { id: "1024", label: "1024 × 1024", width: 1024, height: 1024 },
] as const;

export const SAMPLERS = [
  "Euler a",
  "Euler",
  "DPM++ 2M",
  "DPM++ 2M Karras",
  "DDIM",
  "LMS",
] as const;

export type StudioSettings = {
  steps: number;
  width: number;
  height: number;
  cfgScale: number;
  seed: number;
  samplerName: string;
  denoisingStrength: number;
  batchSize: number;
};

export const DEFAULT_SETTINGS: StudioSettings = {
  steps: 28,
  width: 768,
  height: 768,
  cfgScale: 5,
  seed: -1,
  samplerName: "Euler a",
  denoisingStrength: 0.35,
  batchSize: 1,
};

export type Txt2ImgInput = {
  prompt: string;
  negativePrompt?: string;
  steps?: number;
  width?: number;
  height?: number;
  cfgScale?: number;
  seed?: number;
  samplerName?: string;
  batchSize?: number;
};

export type Img2ImgInput = Txt2ImgInput & {
  initImage: string;
  denoisingStrength?: number;
  mask?: string;
  maskBlur?: number;
  inpaintingFill?: number;
};

export type StudioGenInput = Txt2ImgInput & {
  initImage?: string;
  denoisingStrength?: number;
  mask?: string;
  maskBlur?: number;
  inpaintingFill?: number;
};

export type LocalModel = { title: string; model_name: string };

export function clampSteps(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.steps;
  return Math.min(80, Math.max(1, Math.round(n)));
}

export function clampSize(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.width;
  return Math.min(1536, Math.max(256, Math.round(n / 8) * 8));
}

export function clampCfg(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.cfgScale;
  return Math.min(20, Math.max(1, Math.round(n * 10) / 10));
}

export function clampDenoising(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.denoisingStrength;
  return Math.min(1, Math.max(0.01, Math.round(n * 100) / 100));
}

export function clampSeed(n: number): number {
  if (!Number.isFinite(n)) return -1;
  return Math.trunc(n);
}

export function clampBatch(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(4, Math.max(1, Math.round(n)));
}

export function normalizeSettings(raw: Partial<StudioSettings> | null | undefined): StudioSettings {
  const src = raw || {};
  return {
    steps: clampSteps(src.steps ?? DEFAULT_SETTINGS.steps),
    width: clampSize(src.width ?? DEFAULT_SETTINGS.width),
    height: clampSize(src.height ?? DEFAULT_SETTINGS.height),
    cfgScale: clampCfg(src.cfgScale ?? DEFAULT_SETTINGS.cfgScale),
    seed: clampSeed(src.seed ?? DEFAULT_SETTINGS.seed),
    samplerName: SAMPLERS.includes(src.samplerName as (typeof SAMPLERS)[number])
      ? src.samplerName!
      : DEFAULT_SETTINGS.samplerName,
    denoisingStrength: clampDenoising(src.denoisingStrength ?? DEFAULT_SETTINGS.denoisingStrength),
    batchSize: clampBatch(src.batchSize ?? DEFAULT_SETTINGS.batchSize),
  };
}

export function readStoredSettings(): StudioSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return raw ? normalizeSettings(JSON.parse(raw) as Partial<StudioSettings>) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function sizePresetId(width: number, height: number): string {
  return SIZE_PRESETS.find((p) => p.width === width && p.height === height)?.id || "768";
}

export function denoisingHint(value: number): string {
  if (value < 0.35) return "Heldur ljósmyndinni — smá lagfæring";
  if (value < 0.55) return "Breyta fötum eða bakgrunni, manneskjan helst";
  return "Ný mynd — andlit og stelling geta tapast";
}

/** Strip a data URL prefix so the WebUI API gets raw base64. */
export function toApiImage(src: string): string {
  const trimmed = src.trim();
  const comma = trimmed.indexOf(",");
  if (trimmed.startsWith("data:") && comma >= 0) return trimmed.slice(comma + 1);
  return trimmed;
}

export function studioPayload(input: Txt2ImgInput): Record<string, unknown> {
  return {
    prompt: input.prompt,
    negative_prompt: input.negativePrompt || "",
    steps: clampSteps(input.steps ?? DEFAULT_SETTINGS.steps),
    width: clampSize(input.width ?? DEFAULT_SETTINGS.width),
    height: clampSize(input.height ?? DEFAULT_SETTINGS.height),
    cfg_scale: clampCfg(input.cfgScale ?? DEFAULT_SETTINGS.cfgScale),
    seed: clampSeed(input.seed ?? DEFAULT_SETTINGS.seed),
    sampler_name: input.samplerName || DEFAULT_SETTINGS.samplerName,
    batch_size: clampBatch(input.batchSize ?? DEFAULT_SETTINGS.batchSize),
    n_iter: 1,
    send_images: true,
    save_images: false,
  };
}

export function normalizeWebuiUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return DEFAULT_WEBUI_URL;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Aðeins http eða https");
    }
    return url.origin + url.pathname.replace(/\/+$/, "");
  } catch (err) {
    if (err instanceof Error && err.message === "Aðeins http eða https") throw err;
    throw new Error("Ógild slóð á staðbundna vefviðmótið");
  }
}

export function readStoredWebuiUrl(): string {
  if (typeof window === "undefined") return DEFAULT_WEBUI_URL;
  return window.localStorage.getItem(WEBUI_URL_KEY) || DEFAULT_WEBUI_URL;
}

/** HTTPS Kjarni cannot iframe an HTTP localhost WebUI (mixed content). */
export function canEmbedLocalWebui(protocol?: string): boolean {
  const value = protocol ?? (typeof window === "undefined" ? "https:" : window.location.protocol);
  return value === "http:";
}

async function webuiFetch(base: string, path: string, init?: RequestInit): Promise<Response> {
  const url = `${normalizeWebuiUrl(base)}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...(init?.headers || {}) },
  });
  return res;
}

export async function pingWebui(base: string): Promise<{ ok: true; models: LocalModel[] } | { ok: false; error: string }> {
  try {
    const res = await webuiFetch(base, "/sdapi/v1/sd-models");
    if (!res.ok) return { ok: false, error: `Staðbundið API svaraði ${res.status}` };
    const models = (await res.json()) as LocalModel[];
    return { ok: true, models: Array.isArray(models) ? models : [] };
  } catch {
    return {
      ok: false,
      error:
        "Náði ekki í staðbundna líkanið. Keyrðu Automatic1111 / Forge / SD.Next með --api og CORS, svo reyndu aftur.",
    };
  }
}

function mapImages(data: { images?: string[] }): string[] {
  const images = (data.images || []).filter((x) => typeof x === "string" && x.length > 0);
  if (images.length === 0) throw new Error("Líkanið skilaði engri mynd");
  return images.map((b64) => (b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}`));
}

export async function txt2img(base: string, input: Txt2ImgInput): Promise<string[]> {
  const res = await webuiFetch(base, "/sdapi/v1/txt2img", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(studioPayload(input)),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `txt2img féll (${res.status})`);
  }
  return mapImages((await res.json()) as { images?: string[] });
}

export function clampMaskBlur(n: number): number {
  if (!Number.isFinite(n)) return 4;
  return Math.min(64, Math.max(0, Math.round(n)));
}

export async function img2img(base: string, input: Img2ImgInput): Promise<string[]> {
  if (!input.initImage?.trim()) throw new Error("Vantar mynd til að breyta");
  const hasMask = Boolean(input.mask?.trim());
  const res = await webuiFetch(base, "/sdapi/v1/img2img", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...studioPayload(input),
      init_images: [toApiImage(input.initImage)],
      denoising_strength: clampDenoising(input.denoisingStrength ?? DEFAULT_SETTINGS.denoisingStrength),
      resize_mode: 0,
      ...(hasMask
        ? {
            mask: toApiImage(input.mask!),
            mask_blur: clampMaskBlur(input.maskBlur ?? 4),
            inpainting_fill: input.inpaintingFill ?? 1,
            inpaint_full_res: true,
            inpaint_full_res_padding: 32,
            inpainting_mask_invert: 0,
          }
        : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `img2img féll (${res.status})`);
  }
  return mapImages((await res.json()) as { images?: string[] });
}

export async function generateLocal(base: string, input: StudioGenInput): Promise<string[]> {
  if (input.initImage?.trim()) {
    return img2img(base, { ...input, initImage: input.initImage });
  }
  if (!input.prompt.trim()) throw new Error("Skrifaðu prompt.");
  return txt2img(base, input);
}
