/** Endurljós — zsxkib/ic-light á Replicate
 *
 * Image-conditional relighting með depth-aware ljósadreifingu. Lýst með texta
 * (sunset, soft studio, moody rim light o.s.frv.) og ljósastefnu (vinstri/
 * hægri/efst/neðst/engin). Myndin breytir ekki formi — bara ljósinu.
 *
 * `lowres_denoise` og `highres_denoise` ráða hversu mikið módelið má
 * endurteikna: lágt gildi = meira trú upprunalegu andliti/formi en flatara
 * ljós; hátt gildi = meira drama en meiri breyting. `output_quality` hækkar
 * webp-gæðin (default 80 gefur oft 30-50kb skrá, 95 gefur mun stærri). */

export const LIGHT_SOURCES = [
  "Left Light",
  "Right Light",
  "Top Light",
  "Bottom Light",
  "None",
] as const;
export type LightSource = (typeof LIGHT_SOURCES)[number];

export const LIGHT_SOURCE_LABELS: Record<LightSource, string> = {
  "Left Light": "Vinstri",
  "Right Light": "Hægri",
  "Top Light": "Að ofan",
  "Bottom Light": "Að neðan",
  None: "Engin stefna",
};

export const ENDURLJOS_OUTPUT_FORMATS = ["webp", "png", "jpg"] as const;
export type EndurljosOutputFormat = (typeof ENDURLJOS_OUTPUT_FORMATS)[number];

export type EndurljosSettings = {
  prompt: string;
  lightSource: LightSource;
  preserveBackground: boolean;
  negativePrompt: string;
  numResults: number;
  seed: number;
  disableSafetyChecker: boolean;
  lowresDenoise: number;
  highresDenoise: number;
  highresScale: number;
  cfg: number;
  steps: number;
  outputFormat: EndurljosOutputFormat;
  outputQuality: number;
};

export const DEFAULT_ENDURLJOS_SETTINGS: EndurljosSettings = {
  prompt: "soft studio key light, warm rim, deep shadows, cinematic",
  lightSource: "Left Light",
  // Default: NÝR bakgrunnur (foreground-only ic-light). Notandi togglar ON ef
  // hann vill halda bakgrunninum (ic-light-background variant).
  preserveBackground: false,
  negativePrompt: "lowres, bad anatomy, bad hands, cropped, worst quality, blurry",
  numResults: 1,
  seed: -1,
  disableSafetyChecker: false,
  // Varanákvæmara en Replicate-default: lowres 0.7 (frá 0.9), highres 0.3 (frá 0.5).
  // Þetta heldur andlitinu nær upprunalegri mynd — hækkaðu ef þú vilt meira drama.
  lowresDenoise: 0.7,
  highresDenoise: 0.3,
  highresScale: 1.5,
  cfg: 2,
  steps: 25,
  outputFormat: "png",
  outputQuality: 95,
};

export const ENDURLJOS_SETTINGS_KEY = "kjarni_private_endurljos_settings";

function clampFloat(v: unknown, def: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function clampInt(v: unknown, def: number, min: number, max: number): number {
  return Math.round(clampFloat(v, def, min, max));
}

export function normalizeEndurljosSettings(
  raw: Partial<EndurljosSettings> | null | undefined,
): EndurljosSettings {
  const src = raw ?? {};
  return {
    prompt: typeof src.prompt === "string" ? src.prompt : DEFAULT_ENDURLJOS_SETTINGS.prompt,
    lightSource: LIGHT_SOURCES.includes(src.lightSource as LightSource)
      ? (src.lightSource as LightSource)
      : DEFAULT_ENDURLJOS_SETTINGS.lightSource,
    preserveBackground:
      typeof src.preserveBackground === "boolean"
        ? src.preserveBackground
        : DEFAULT_ENDURLJOS_SETTINGS.preserveBackground,
    negativePrompt:
      typeof src.negativePrompt === "string"
        ? src.negativePrompt
        : DEFAULT_ENDURLJOS_SETTINGS.negativePrompt,
    numResults: clampInt(src.numResults, 1, 1, 4),
    seed: Number.isFinite(src.seed) ? Math.trunc(src.seed as number) : -1,
    disableSafetyChecker:
      typeof src.disableSafetyChecker === "boolean" ? src.disableSafetyChecker : false,
    lowresDenoise: clampFloat(src.lowresDenoise, DEFAULT_ENDURLJOS_SETTINGS.lowresDenoise, 0, 1),
    highresDenoise: clampFloat(src.highresDenoise, DEFAULT_ENDURLJOS_SETTINGS.highresDenoise, 0, 1),
    highresScale: clampFloat(src.highresScale, DEFAULT_ENDURLJOS_SETTINGS.highresScale, 1, 1.5),
    cfg: clampFloat(src.cfg, DEFAULT_ENDURLJOS_SETTINGS.cfg, 1, 10),
    steps: clampInt(src.steps, DEFAULT_ENDURLJOS_SETTINGS.steps, 10, 50),
    outputFormat: ENDURLJOS_OUTPUT_FORMATS.includes(src.outputFormat as EndurljosOutputFormat)
      ? (src.outputFormat as EndurljosOutputFormat)
      : DEFAULT_ENDURLJOS_SETTINGS.outputFormat,
    outputQuality: clampInt(src.outputQuality, DEFAULT_ENDURLJOS_SETTINGS.outputQuality, 1, 100),
  };
}

export function readStoredEndurljosSettings(): EndurljosSettings {
  if (typeof window === "undefined") return DEFAULT_ENDURLJOS_SETTINGS;
  try {
    const raw = window.localStorage.getItem(ENDURLJOS_SETTINGS_KEY);
    if (!raw) return DEFAULT_ENDURLJOS_SETTINGS;
    return normalizeEndurljosSettings(JSON.parse(raw) as Partial<EndurljosSettings>);
  } catch {
    return DEFAULT_ENDURLJOS_SETTINGS;
  }
}

async function fetchImageBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gat ekki sótt mynd af Replicate (${res.status})`);
  return res.blob();
}

export async function relightImage(
  settings: EndurljosSettings,
  imageDataUrl: string,
  activePrompt: string,
): Promise<Blob[]> {
  if (!activePrompt.trim()) throw new Error("Virka prompt-ið er tómt.");
  const res = await fetch("/api/endurljos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image: imageDataUrl,
      preserveBackground: settings.preserveBackground,
      prompt: activePrompt,
      lightSource: settings.lightSource,
      negativePrompt: settings.negativePrompt,
      numResults: settings.numResults,
      seed: settings.seed,
      disableSafetyChecker: settings.disableSafetyChecker,
      lowresDenoise: settings.lowresDenoise,
      highresDenoise: settings.highresDenoise,
      highresScale: settings.highresScale,
      cfg: settings.cfg,
      steps: settings.steps,
      outputFormat: settings.outputFormat,
      outputQuality: settings.outputQuality,
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
    throw new Error(message || `Endurljós mistókst (${res.status})`);
  }
  const data = JSON.parse(text) as { images: string[] };
  return Promise.all(data.images.map(fetchImageBlob));
}
