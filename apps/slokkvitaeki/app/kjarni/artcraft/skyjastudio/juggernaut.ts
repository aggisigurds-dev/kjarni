/** Skýjastúdíó — texti → mynd / img2img / inpaint með asiryan/juggernaut-xl-v7
 * á Replicate. Þriðja líkanið við hliðina á sdxl.ts (Stability SDXL) og
 * fluxFill.ts (Flux Fill inpaint).
 *
 * Juggernaut XL v7 er fín-tjúnuð SDXL afbrigði frá RunDiffusion, þekkt fyrir
 * sterk portrett og raunsæislega áferð — gott val þegar SDXL skilar of
 * „plastic"-líti á fólki. Styður sömu þrjár aðferðir og Stability SDXL
 * (txt2img, img2img, inpaint) en með öðrum stíl og aðeins öðrum
 * sjálfgefnum skrefafjölda.
 *
 * Input/output: schema sótt beint af Replicate og pass-ast gegnum
 * app/api/skyjastudio/juggernaut/route.ts (sama agi og sdxl.ts). */

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
  strength: number;
  useKarrasSigmas: boolean;
  disableSafetyChecker: boolean;
};

export const DEFAULT_JUGGERNAUT_PROMPT =
  "RAW photo of a confident person, 85mm portrait, cinematic rim light, detailed skin texture with visible pores, shallow depth of field, color graded, masterpiece";

export const DEFAULT_JUGGERNAUT_NEGATIVE =
  "(worst quality, low quality:1.4), (plastic skin, airbrushed:1.3), cartoon, anime, cgi, render, 3d, deformed, glowing eyes, extra fingers";

export const DEFAULT_JUGGERNAUT_SETTINGS: JuggernautSettings = {
  prompt: DEFAULT_JUGGERNAUT_PROMPT,
  negativePrompt: DEFAULT_JUGGERNAUT_NEGATIVE,
  width: 1024,
  height: 1024,
  steps: 40,
  guidanceScale: 7.5,
  scheduler: "K_EULER",
  numOutputs: 1,
  seed: -1,
  strength: 0.5,
  useKarrasSigmas: false,
  disableSafetyChecker: false,
};

export function clampJuggernautSize(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_JUGGERNAUT_SETTINGS.width;
  return Math.min(1536, Math.max(512, Math.round(n / 8) * 8));
}

export function clampJuggernautSteps(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_JUGGERNAUT_SETTINGS.steps;
  return Math.min(100, Math.max(1, Math.round(n)));
}

export function clampJuggernautGuidance(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_JUGGERNAUT_SETTINGS.guidanceScale;
  return Math.min(50, Math.max(1, Math.round(n * 10) / 10));
}

export function clampJuggernautNumOutputs(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_JUGGERNAUT_SETTINGS.numOutputs;
  return Math.min(4, Math.max(1, Math.round(n)));
}

export function clampJuggernautSeed(n: number): number {
  if (!Number.isFinite(n)) return -1;
  return Math.trunc(n);
}

export function clampJuggernautStrength(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_JUGGERNAUT_SETTINGS.strength;
  return Math.min(1, Math.max(0, Math.round(n * 100) / 100));
}

export function normalizeJuggernautSettings(
  raw: Partial<JuggernautSettings> | null | undefined,
): JuggernautSettings {
  const src = raw || {};
  return {
    prompt: typeof src.prompt === "string" ? src.prompt : DEFAULT_JUGGERNAUT_SETTINGS.prompt,
    negativePrompt:
      typeof src.negativePrompt === "string" ? src.negativePrompt : DEFAULT_JUGGERNAUT_SETTINGS.negativePrompt,
    width: clampJuggernautSize(src.width ?? DEFAULT_JUGGERNAUT_SETTINGS.width),
    height: clampJuggernautSize(src.height ?? DEFAULT_JUGGERNAUT_SETTINGS.height),
    steps: clampJuggernautSteps(src.steps ?? DEFAULT_JUGGERNAUT_SETTINGS.steps),
    guidanceScale: clampJuggernautGuidance(src.guidanceScale ?? DEFAULT_JUGGERNAUT_SETTINGS.guidanceScale),
    scheduler: JUGGERNAUT_SCHEDULERS.includes(src.scheduler as JuggernautScheduler)
      ? (src.scheduler as JuggernautScheduler)
      : DEFAULT_JUGGERNAUT_SETTINGS.scheduler,
    numOutputs: clampJuggernautNumOutputs(src.numOutputs ?? DEFAULT_JUGGERNAUT_SETTINGS.numOutputs),
    seed: clampJuggernautSeed(src.seed ?? DEFAULT_JUGGERNAUT_SETTINGS.seed),
    strength: clampJuggernautStrength(src.strength ?? DEFAULT_JUGGERNAUT_SETTINGS.strength),
    useKarrasSigmas:
      typeof src.useKarrasSigmas === "boolean"
        ? src.useKarrasSigmas
        : DEFAULT_JUGGERNAUT_SETTINGS.useKarrasSigmas,
    disableSafetyChecker:
      typeof src.disableSafetyChecker === "boolean"
        ? src.disableSafetyChecker
        : DEFAULT_JUGGERNAUT_SETTINGS.disableSafetyChecker,
  };
}

export const JUGGERNAUT_SETTINGS_KEY = "kjarni_private_skyjastudio_juggernaut_settings";

export function readStoredJuggernautSettings(): JuggernautSettings {
  if (typeof window === "undefined") return DEFAULT_JUGGERNAUT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(JUGGERNAUT_SETTINGS_KEY);
    return raw
      ? normalizeJuggernautSettings(JSON.parse(raw) as Partial<JuggernautSettings>)
      : DEFAULT_JUGGERNAUT_SETTINGS;
  } catch {
    return DEFAULT_JUGGERNAUT_SETTINGS;
  }
}

async function fetchImageBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gat ekki sótt mynd af Replicate (${res.status})`);
  return res.blob();
}

export type JuggernautInpaintExtra = {
  imageDataUrl: string;
  maskDataUrl?: string;
};

export async function generateJuggernautImage(
  settings: JuggernautSettings,
  inpaint?: JuggernautInpaintExtra,
): Promise<Blob[]> {
  if (!settings.prompt.trim()) throw new Error("Skrifaðu prompt fyrst.");
  const res = await fetch("/api/skyjastudio/juggernaut", {
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
    throw new Error(message || `Juggernaut mistókst (${res.status})`);
  }
  const data = JSON.parse(text) as { images: string[] };
  return Promise.all(data.images.map(fetchImageBlob));
}
