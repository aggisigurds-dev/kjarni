/** Skýjastúdíó — texti → mynd með Replicate's stability-ai/sdxl (Stability
 * AI's eigin opinbera SDXL-líkan), engin uppsetning (engin local netþjónn
 * eins og Einkastúdíó/ComfyUI þarf), en kostar smá upphæð per mynd og
 * myndin fer út af vélinni.
 *
 * Valið fram yfir önnur SDXL-afbrigði (t.d. asiryan/juggernaut-xl-v7) því
 * þetta er eina líkanið sem útsetur disable_safety_checker/apply_watermark
 * sem skjalfest API-breytu — sjá https://replicate.com/docs/how-does-replicate-work#safety.
 *
 * Input/output schema sótt beint af Replicate (GET /v1/models/stability-ai/
 * sdxl), ekki giskað — sjá líka app/api/skyjastudio/replicate/route.ts sem
 * talar við raunverulega Replicate API-ið. */

export const SDXL_SCHEDULERS = [
  "DDIM",
  "DPMSolverMultistep",
  "HeunDiscrete",
  "KarrasDPM",
  "K_EULER_ANCESTRAL",
  "K_EULER",
  "PNDM",
] as const;

export type SdxlScheduler = (typeof SDXL_SCHEDULERS)[number];

export type SdxlSettings = {
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  steps: number;
  guidanceScale: number;
  scheduler: SdxlScheduler;
  numOutputs: number;
  seed: number;
  disableSafetyChecker: boolean;
  applyWatermark: boolean;
  promptStrength: number;
};

export const DEFAULT_SDXL_PROMPT =
  "RAW photo, extreme sharpness, 8k resolution, cinematic studio lighting, highly detailed skin realism, visible skin pores, smooth lace patterns, masterfully color graded portrait";

export const DEFAULT_SDXL_NEGATIVE =
  "(worst quality, low quality:1.4), (airbrushed, cartoon, anime, semi-realistic, cgi, render, 3d, digital art:1.3), plastic skin, fake lighting, blurry, glowing eyes, deformed limbs";

export const DEFAULT_SDXL_SETTINGS: SdxlSettings = {
  prompt: DEFAULT_SDXL_PROMPT,
  negativePrompt: DEFAULT_SDXL_NEGATIVE,
  width: 1024,
  height: 1024,
  steps: 50,
  guidanceScale: 7.5,
  scheduler: "K_EULER",
  numOutputs: 1,
  seed: -1,
  disableSafetyChecker: false,
  applyWatermark: true,
  promptStrength: 0.8,
};

export function clampSdxlSize(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SDXL_SETTINGS.width;
  return Math.min(1536, Math.max(512, Math.round(n / 8) * 8));
}

/** Schema allows up to 500 steps, but that is an expensive, slow outlier —
 * clamp the UI to a sane practical band instead. */
export function clampSdxlSteps(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SDXL_SETTINGS.steps;
  return Math.min(100, Math.max(1, Math.round(n)));
}

export function clampSdxlGuidance(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SDXL_SETTINGS.guidanceScale;
  return Math.min(50, Math.max(1, Math.round(n * 10) / 10));
}

export function clampSdxlNumOutputs(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SDXL_SETTINGS.numOutputs;
  return Math.min(4, Math.max(1, Math.round(n)));
}

export function clampSdxlSeed(n: number): number {
  if (!Number.isFinite(n)) return -1;
  return Math.trunc(n);
}

/** prompt_strength for img2img/inpaint: 1.0 = full destruction of the
 * source image's information in the masked area. */
export function clampSdxlStrength(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SDXL_SETTINGS.promptStrength;
  return Math.min(1, Math.max(0, Math.round(n * 100) / 100));
}

export function normalizeSdxlSettings(raw: Partial<SdxlSettings> | null | undefined): SdxlSettings {
  const src = raw || {};
  return {
    prompt: typeof src.prompt === "string" ? src.prompt : DEFAULT_SDXL_SETTINGS.prompt,
    negativePrompt: typeof src.negativePrompt === "string" ? src.negativePrompt : DEFAULT_SDXL_SETTINGS.negativePrompt,
    width: clampSdxlSize(src.width ?? DEFAULT_SDXL_SETTINGS.width),
    height: clampSdxlSize(src.height ?? DEFAULT_SDXL_SETTINGS.height),
    steps: clampSdxlSteps(src.steps ?? DEFAULT_SDXL_SETTINGS.steps),
    guidanceScale: clampSdxlGuidance(src.guidanceScale ?? DEFAULT_SDXL_SETTINGS.guidanceScale),
    scheduler: SDXL_SCHEDULERS.includes(src.scheduler as SdxlScheduler)
      ? (src.scheduler as SdxlScheduler)
      : DEFAULT_SDXL_SETTINGS.scheduler,
    numOutputs: clampSdxlNumOutputs(src.numOutputs ?? DEFAULT_SDXL_SETTINGS.numOutputs),
    seed: clampSdxlSeed(src.seed ?? DEFAULT_SDXL_SETTINGS.seed),
    disableSafetyChecker:
      typeof src.disableSafetyChecker === "boolean" ? src.disableSafetyChecker : DEFAULT_SDXL_SETTINGS.disableSafetyChecker,
    applyWatermark: typeof src.applyWatermark === "boolean" ? src.applyWatermark : DEFAULT_SDXL_SETTINGS.applyWatermark,
    promptStrength: clampSdxlStrength(src.promptStrength ?? DEFAULT_SDXL_SETTINGS.promptStrength),
  };
}

export const SDXL_SETTINGS_KEY = "kjarni_private_skyjastudio_settings";

export function readStoredSdxlSettings(): SdxlSettings {
  if (typeof window === "undefined") return DEFAULT_SDXL_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SDXL_SETTINGS_KEY);
    return raw ? normalizeSdxlSettings(JSON.parse(raw) as Partial<SdxlSettings>) : DEFAULT_SDXL_SETTINGS;
  } catch {
    return DEFAULT_SDXL_SETTINGS;
  }
}

async function fetchImageBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gat ekki sótt mynd af Replicate (${res.status})`);
  return res.blob();
}

export type InpaintExtra = {
  imageDataUrl: string;
  /** Optional: ef sleppt, þá er þetta img2img (image uten mask). */
  maskDataUrl?: string;
};

export async function generateSdxlImage(settings: SdxlSettings, inpaint?: InpaintExtra): Promise<Blob[]> {
  if (!settings.prompt.trim()) throw new Error("Skrifaðu prompt fyrst.");
  const res = await fetch("/api/skyjastudio/replicate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...settings,
      ...(inpaint ? { image: inpaint.imageDataUrl, mask: inpaint.maskDataUrl } : {}),
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      message = (JSON.parse(text) as { error?: string }).error || text;
    } catch {
      // not JSON, use raw text
    }
    throw new Error(message || `Skýjastúdíó mistókst (${res.status})`);
  }
  const data = JSON.parse(text) as { images: string[] };
  // The server returns Replicate's own delivery URLs directly (they're
  // publicly fetchable, Access-Control-Allow-Origin: *) rather than
  // base64-encoding the images into its own JSON response — a multi-image
  // batch re-encoded that way could exceed Vercel's 4.5MB function
  // response limit and silently lose a successful, paid prediction.
  return Promise.all(data.images.map(fetchImageBlob));
}
