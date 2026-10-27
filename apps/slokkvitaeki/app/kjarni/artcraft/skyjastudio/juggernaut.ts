/** Skýjastúdíó — texti → mynd með Replicate's asiryan/juggernaut-xl-v7, engin
 * uppsetning (engin local netþjónn eins og Einkastúdíó/ComfyUI þarf), en
 * kostar smá upphæð per mynd og myndin fer út af vélinni.
 *
 * Input/output schema sótt beint af Replicate (GET /v1/models/asiryan/
 * juggernaut-xl-v7), ekki giskað — sjá líka app/api/skyjastudio/replicate/
 * route.ts sem talar við raunverulega Replicate API-ið. */

export const JUGGERNAUT_SCHEDULERS = [
  "DDIM",
  "DPMSolverMultistep",
  "HeunDiscrete",
  "KarrasDPM",
  "K_EULER_ANCESTRAL",
  "K_EULER",
  "PNDM",
] as const;

export type JuggernautScheduler = (typeof JUGGERNAUT_SCHEDULERS)[number];

export type JuggernautSettings = {
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  steps: number;
  guidanceScale: number;
  scheduler: JuggernautScheduler;
  numOutputs: number;
  seed: number;
};

export const DEFAULT_JUGGERNAUT_PROMPT =
  "abstract beauty, centered, looking at the camera, approaching perfection, dynamic, moonlight, highly detailed, digital painting, artstation, concept art, smooth, sharp focus, illustration, art by Carne Griffiths and Wadim Kashin";

export const DEFAULT_JUGGERNAUT_NEGATIVE =
  "(worst quality, low quality, normal quality, lowres, low details, oversaturated, undersaturated, overexposed, underexposed, grayscale, bw, bad photo, bad photography, bad art:1.4), (watermark, signature, text font, username, error, logo, words, letters, digits, autograph, trademark, name:1.2), (blur, blurry, grainy), morbid, ugly, asymmetrical, mutated malformed, mutilated, poorly lit, bad shadow, draft, cropped, out of frame, cut off, censored, jpeg artifacts, out of focus, glitch, duplicate, (airbrushed, cartoon, anime, semi-realistic, cgi, render, blender, digital art, manga, amateur:1.3), (3D ,3D Game, 3D Game Scene, 3D Character:1.1), (bad hands, bad anatomy, bad body, bad face, bad teeth, bad arms, bad legs, deformities:1.3)";

export const DEFAULT_JUGGERNAUT_SETTINGS: JuggernautSettings = {
  prompt: DEFAULT_JUGGERNAUT_PROMPT,
  negativePrompt: DEFAULT_JUGGERNAUT_NEGATIVE,
  width: 1024,
  height: 1024,
  steps: 40,
  guidanceScale: 7,
  scheduler: "K_EULER_ANCESTRAL",
  numOutputs: 1,
  seed: -1,
};

export function clampJugSize(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_JUGGERNAUT_SETTINGS.width;
  return Math.min(1536, Math.max(512, Math.round(n / 8) * 8));
}

/** Schema allows up to 500 steps, but that is an expensive, slow outlier —
 * clamp the UI to a sane practical band instead. */
export function clampJugSteps(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_JUGGERNAUT_SETTINGS.steps;
  return Math.min(100, Math.max(1, Math.round(n)));
}

export function clampJugGuidance(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_JUGGERNAUT_SETTINGS.guidanceScale;
  return Math.min(50, Math.max(1, Math.round(n * 10) / 10));
}

export function clampJugNumOutputs(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_JUGGERNAUT_SETTINGS.numOutputs;
  return Math.min(4, Math.max(1, Math.round(n)));
}

export function clampJugSeed(n: number): number {
  if (!Number.isFinite(n)) return -1;
  return Math.trunc(n);
}

export function normalizeJuggernautSettings(
  raw: Partial<JuggernautSettings> | null | undefined,
): JuggernautSettings {
  const src = raw || {};
  return {
    prompt: typeof src.prompt === "string" ? src.prompt : DEFAULT_JUGGERNAUT_SETTINGS.prompt,
    negativePrompt:
      typeof src.negativePrompt === "string" ? src.negativePrompt : DEFAULT_JUGGERNAUT_SETTINGS.negativePrompt,
    width: clampJugSize(src.width ?? DEFAULT_JUGGERNAUT_SETTINGS.width),
    height: clampJugSize(src.height ?? DEFAULT_JUGGERNAUT_SETTINGS.height),
    steps: clampJugSteps(src.steps ?? DEFAULT_JUGGERNAUT_SETTINGS.steps),
    guidanceScale: clampJugGuidance(src.guidanceScale ?? DEFAULT_JUGGERNAUT_SETTINGS.guidanceScale),
    scheduler: JUGGERNAUT_SCHEDULERS.includes(src.scheduler as JuggernautScheduler)
      ? (src.scheduler as JuggernautScheduler)
      : DEFAULT_JUGGERNAUT_SETTINGS.scheduler,
    numOutputs: clampJugNumOutputs(src.numOutputs ?? DEFAULT_JUGGERNAUT_SETTINGS.numOutputs),
    seed: clampJugSeed(src.seed ?? DEFAULT_JUGGERNAUT_SETTINGS.seed),
  };
}

export const JUGGERNAUT_SETTINGS_KEY = "kjarni_private_skyjastudio_settings";

export function readStoredJuggernautSettings(): JuggernautSettings {
  if (typeof window === "undefined") return DEFAULT_JUGGERNAUT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(JUGGERNAUT_SETTINGS_KEY);
    return raw ? normalizeJuggernautSettings(JSON.parse(raw) as Partial<JuggernautSettings>) : DEFAULT_JUGGERNAUT_SETTINGS;
  } catch {
    return DEFAULT_JUGGERNAUT_SETTINGS;
  }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const mime = /data:(.*?);base64/.exec(header)?.[1] || "image/png";
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export async function generateJuggernaut(settings: JuggernautSettings): Promise<Blob[]> {
  if (!settings.prompt.trim()) throw new Error("Skrifaðu prompt fyrst.");
  const res = await fetch("/api/skyjastudio/replicate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
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
  return data.images.map(dataUrlToBlob);
}
