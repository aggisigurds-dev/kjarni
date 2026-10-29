/** Innblástur — black-forest-labs/flux-redux-dev á Replicate.
 *
 * Innblástursmynd → nýjar afbrigði með svipaðan stíl / lit / samsetningu án
 * þess að afrita myndina. Opið líkan (Flux Dev + Redux adapter) sem styður
 * disable_safety_checker. Hugmyndin er að þú notir eitt vel heppnað skot sem
 * stíl-tilvísun og látir módelið mota sömu stemmningu í fleiri myndum. */

export const ASPECT_RATIOS = [
  "match_input_image",
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "3:2",
  "2:3",
  "4:5",
  "5:4",
  "21:9",
  "9:21",
] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export const ASPECT_RATIO_LABELS: Record<AspectRatio, string> = {
  match_input_image: "Sama og innblástur",
  "1:1": "1:1 — ferhyrnd",
  "16:9": "16:9 — breið",
  "9:16": "9:16 — sími",
  "4:3": "4:3",
  "3:4": "3:4",
  "3:2": "3:2",
  "2:3": "2:3",
  "4:5": "4:5",
  "5:4": "5:4",
  "21:9": "21:9 — ultrawide",
  "9:21": "9:21",
};

export const MEGAPIXELS = ["0.25", "1"] as const;
export type Megapixels = (typeof MEGAPIXELS)[number];

export const MEGAPIXEL_LABELS: Record<Megapixels, string> = {
  "0.25": "0.25 MP — hraðara og ódýrara",
  "1": "1 MP — full upplausn",
};

export const OUTPUT_FORMATS = ["webp", "png", "jpg"] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export type InnblasturSettings = {
  aspectRatio: AspectRatio;
  numOutputs: number;
  numInferenceSteps: number;
  seed: number;
  megapixels: Megapixels;
  goFast: boolean;
  outputFormat: OutputFormat;
  outputQuality: number;
  disableSafetyChecker: boolean;
};

export const DEFAULT_INNBLASTUR_SETTINGS: InnblasturSettings = {
  aspectRatio: "match_input_image",
  numOutputs: 1,
  numInferenceSteps: 28,
  seed: -1,
  megapixels: "1",
  goFast: false,
  outputFormat: "webp",
  outputQuality: 80,
  disableSafetyChecker: false,
};

export const INNBLASTUR_SETTINGS_KEY = "kjarni_private_innblastur_settings";

export function normalizeInnblasturSettings(
  raw: Partial<InnblasturSettings> | null | undefined,
): InnblasturSettings {
  const src = raw ?? {};
  return {
    aspectRatio: ASPECT_RATIOS.includes(src.aspectRatio as AspectRatio)
      ? (src.aspectRatio as AspectRatio)
      : DEFAULT_INNBLASTUR_SETTINGS.aspectRatio,
    numOutputs: Math.min(4, Math.max(1, Math.round(Number(src.numOutputs) || 1))),
    numInferenceSteps: Math.min(50, Math.max(1, Math.round(Number(src.numInferenceSteps) || 28))),
    seed: Number.isFinite(src.seed) ? Math.trunc(src.seed as number) : -1,
    megapixels: MEGAPIXELS.includes(src.megapixels as Megapixels)
      ? (src.megapixels as Megapixels)
      : DEFAULT_INNBLASTUR_SETTINGS.megapixels,
    goFast: typeof src.goFast === "boolean" ? src.goFast : DEFAULT_INNBLASTUR_SETTINGS.goFast,
    outputFormat: OUTPUT_FORMATS.includes(src.outputFormat as OutputFormat)
      ? (src.outputFormat as OutputFormat)
      : DEFAULT_INNBLASTUR_SETTINGS.outputFormat,
    outputQuality: Math.min(100, Math.max(0, Math.round(Number(src.outputQuality) || 80))),
    disableSafetyChecker:
      typeof src.disableSafetyChecker === "boolean"
        ? src.disableSafetyChecker
        : DEFAULT_INNBLASTUR_SETTINGS.disableSafetyChecker,
  };
}

export function readStoredInnblasturSettings(): InnblasturSettings {
  if (typeof window === "undefined") return DEFAULT_INNBLASTUR_SETTINGS;
  try {
    const raw = window.localStorage.getItem(INNBLASTUR_SETTINGS_KEY);
    if (!raw) return DEFAULT_INNBLASTUR_SETTINGS;
    return normalizeInnblasturSettings(JSON.parse(raw) as Partial<InnblasturSettings>);
  } catch {
    return DEFAULT_INNBLASTUR_SETTINGS;
  }
}

async function fetchImageBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gat ekki sótt mynd af Replicate (${res.status})`);
  return res.blob();
}

export async function generateInnblastur(
  settings: InnblasturSettings,
  reduxImageDataUrl: string,
): Promise<Blob[]> {
  const res = await fetch("/api/innblastur", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      reduxImage: reduxImageDataUrl,
      aspectRatio: settings.aspectRatio,
      numOutputs: settings.numOutputs,
      numInferenceSteps: settings.numInferenceSteps,
      seed: settings.seed,
      megapixels: settings.megapixels,
      goFast: settings.goFast,
      outputFormat: settings.outputFormat,
      outputQuality: settings.outputQuality,
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
    throw new Error(message || `Innblástur mistókst (${res.status})`);
  }
  const data = JSON.parse(text) as { images: string[] };
  return Promise.all(data.images.map(fetchImageBlob));
}
