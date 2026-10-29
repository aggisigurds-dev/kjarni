/** Andlit — zsxkib/instant-id á Replicate
 *
 * Learn-free face identity: ein andlitsmynd + lýsing → nýjar myndir þar sem
 * SAMA ANDLITIÐ birtist í nýju umhverfi/stellingu/stíl. Byggt á SDXL +
 * ControlNet með InsightFace embedding. Enginn „train" dagur, allt gerist í
 * einni inference-keyrslu á ~20-40s. */

export const SDXL_WEIGHTS = [
  "stable-diffusion-xl-base-1.0",
  "juggernaut-xl-v8",
  "realvis-xl-v3-love",
  "protovision-xl-high-fidel",
  "dreamshaper-xl",
  "afrodite-xl-v2",
  "albedobase-xl-v13",
] as const;
export type SdxlWeights = (typeof SDXL_WEIGHTS)[number];

export const SDXL_WEIGHTS_LABELS: Record<SdxlWeights, string> = {
  "stable-diffusion-xl-base-1.0": "SDXL grunnur (hlutlaust)",
  "juggernaut-xl-v8": "Juggernaut XL v8 (ljósraunsætt)",
  "realvis-xl-v3-love": "RealVis XL v3 (fólk/portrett)",
  "protovision-xl-high-fidel": "ProtoVision XL (fjölhæf)",
  "dreamshaper-xl": "DreamShaper XL (listræn)",
  "afrodite-xl-v2": "Afrodite XL (kvenmyndir)",
  "albedobase-xl-v13": "AlbedoBase XL (náttúruleg)",
};

export const ASPECT_PRESETS = ["square", "portrait", "landscape"] as const;
export type AspectPreset = (typeof ASPECT_PRESETS)[number];

export const ASPECT_LABELS: Record<AspectPreset, string> = {
  square: "Kassalaga (1024×1024)",
  portrait: "Portrait (768×1024)",
  landscape: "Landscape (1024×768)",
};

export const ASPECT_DIMS: Record<AspectPreset, { width: number; height: number }> = {
  square: { width: 1024, height: 1024 },
  portrait: { width: 768, height: 1024 },
  landscape: { width: 1024, height: 768 },
};

export type AndlitSettings = {
  prompt: string;
  negativePrompt: string;
  aspect: AspectPreset;
  numOutputs: number;
  numInferenceSteps: number;
  guidanceScale: number;
  ipAdapterScale: number;
  controlnetConditioningScale: number;
  sdxlWeights: SdxlWeights;
  seed: number;
  disableSafetyChecker: boolean;
};

export const DEFAULT_ANDLIT_SETTINGS: AndlitSettings = {
  prompt: "cinematic studio portrait, warm lighting, professional, sharp focus",
  negativePrompt:
    "lowres, bad anatomy, bad hands, cropped, worst quality, blurry, deformed face, extra fingers",
  aspect: "portrait",
  numOutputs: 1,
  numInferenceSteps: 30,
  guidanceScale: 5,
  ipAdapterScale: 0.8,
  controlnetConditioningScale: 0.8,
  sdxlWeights: "realvis-xl-v3-love",
  seed: -1,
  disableSafetyChecker: false,
};

export const ANDLIT_SETTINGS_KEY = "kjarni_private_andlit_settings";

export function normalizeAndlitSettings(
  raw: Partial<AndlitSettings> | null | undefined,
): AndlitSettings {
  const src = raw ?? {};
  const clamp = (v: unknown, def: number, min: number, max: number) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return def;
    return Math.min(max, Math.max(min, n));
  };
  return {
    prompt: typeof src.prompt === "string" ? src.prompt : DEFAULT_ANDLIT_SETTINGS.prompt,
    negativePrompt:
      typeof src.negativePrompt === "string"
        ? src.negativePrompt
        : DEFAULT_ANDLIT_SETTINGS.negativePrompt,
    aspect: ASPECT_PRESETS.includes(src.aspect as AspectPreset)
      ? (src.aspect as AspectPreset)
      : DEFAULT_ANDLIT_SETTINGS.aspect,
    numOutputs: Math.round(clamp(src.numOutputs, 1, 1, 4)),
    numInferenceSteps: Math.round(clamp(src.numInferenceSteps, 30, 10, 60)),
    guidanceScale: clamp(src.guidanceScale, 5, 1, 15),
    ipAdapterScale: clamp(src.ipAdapterScale, 0.8, 0, 1.5),
    controlnetConditioningScale: clamp(src.controlnetConditioningScale, 0.8, 0, 1.5),
    sdxlWeights: SDXL_WEIGHTS.includes(src.sdxlWeights as SdxlWeights)
      ? (src.sdxlWeights as SdxlWeights)
      : DEFAULT_ANDLIT_SETTINGS.sdxlWeights,
    seed: Number.isFinite(src.seed) ? Math.trunc(src.seed as number) : -1,
    disableSafetyChecker:
      typeof src.disableSafetyChecker === "boolean" ? src.disableSafetyChecker : false,
  };
}

export function readStoredAndlitSettings(): AndlitSettings {
  if (typeof window === "undefined") return DEFAULT_ANDLIT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(ANDLIT_SETTINGS_KEY);
    if (!raw) return DEFAULT_ANDLIT_SETTINGS;
    return normalizeAndlitSettings(JSON.parse(raw) as Partial<AndlitSettings>);
  } catch {
    return DEFAULT_ANDLIT_SETTINGS;
  }
}

async function fetchImageBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gat ekki sótt mynd af Replicate (${res.status})`);
  return res.blob();
}

export async function generateAndlit(
  settings: AndlitSettings,
  faceImageDataUrl: string,
  activePrompt: string,
  poseImageDataUrl?: string,
): Promise<Blob[]> {
  if (!activePrompt.trim()) throw new Error("Virka prompt-ið er tómt.");
  const dims = ASPECT_DIMS[settings.aspect];
  const res = await fetch("/api/andlit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      faceImage: faceImageDataUrl,
      poseImage: poseImageDataUrl || undefined,
      prompt: activePrompt,
      negativePrompt: settings.negativePrompt,
      width: dims.width,
      height: dims.height,
      numOutputs: settings.numOutputs,
      numInferenceSteps: settings.numInferenceSteps,
      guidanceScale: settings.guidanceScale,
      ipAdapterScale: settings.ipAdapterScale,
      controlnetConditioningScale: settings.controlnetConditioningScale,
      sdxlWeights: settings.sdxlWeights,
      seed: settings.seed,
      disableSafetyChecker: settings.disableSafetyChecker,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      message = (JSON.parse(text) as { error?: string }).error || text;
    } catch {
      /* not JSON */
    }
    throw new Error(message || `Andlit mistókst (${res.status})`);
  }
  const data = JSON.parse(text) as { images: string[] };
  return Promise.all(data.images.map(fetchImageBlob));
}
