/** Upplyfting — faglegt myndupplyfting með topazlabs/image-upscale á Replicate
 * (https://replicate.com/topazlabs/image-upscale). Priced per output megapixel
 * ($0.05 per 12 MP unit); gæði-upscale sem þekkt er úr Topaz Photo AI.
 *
 * Ólíkt almennum SDXL/Flux myndgerðar-líkönum er þetta eitt input: mynd og
 * output: ein stærri mynd. Engin „disable_safety_checker" — líkanið býr ekki
 * til nýtt myndefni, aðeins stækkar.
 *
 * Enhance-líkönin eru fimm (eftir Replicate README):
 *   Standard V2        — almennur, besti fyrsti valkostur
 *   Low Resolution V2  — fyrir mjög lágar myndir (<500px kant)
 *   CGI                — digital art / 3d render
 *   High Fidelity V2   — passar vel fyrir myndir sem þegar eru skarpar
 *   Text Refine        — fyrir myndir með mikilvægum texta
 *
 * Facial enhancement vinnur sérstaklega með andlit (bætir skerpu og eyes/mouth).
 */

export const TOPAZ_ENHANCE_MODELS = [
  "Standard V2",
  "Low Resolution V2",
  "CGI",
  "High Fidelity V2",
  "Text Refine",
] as const;

export type TopazEnhanceModel = (typeof TOPAZ_ENHANCE_MODELS)[number];

export const TOPAZ_SUBJECT_DETECTIONS = ["None", "Foreground", "Background", "All"] as const;
export type TopazSubjectDetection = (typeof TOPAZ_SUBJECT_DETECTIONS)[number];

export const TOPAZ_OUTPUT_FORMATS = ["jpg", "png", "webp"] as const;
export type TopazOutputFormat = (typeof TOPAZ_OUTPUT_FORMATS)[number];

export type TopazSettings = {
  enhanceModel: TopazEnhanceModel;
  upscaleFactor: number; // 1 – 6
  faceEnhancement: boolean;
  faceEnhancementCreativity: number; // 0 – 1
  faceEnhancementStrength: number; // 0 – 1
  subjectDetection: TopazSubjectDetection;
  outputFormat: TopazOutputFormat;
};

export const DEFAULT_TOPAZ_SETTINGS: TopazSettings = {
  enhanceModel: "Standard V2",
  upscaleFactor: 2,
  faceEnhancement: false,
  faceEnhancementCreativity: 0,
  faceEnhancementStrength: 0.8,
  subjectDetection: "None",
  outputFormat: "jpg",
};

export function clampUpscaleFactor(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_TOPAZ_SETTINGS.upscaleFactor;
  return Math.min(6, Math.max(1, Math.round(n * 10) / 10));
}

function clampUnit(n: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, Math.round(n * 100) / 100));
}

export function normalizeTopazSettings(raw: Partial<TopazSettings> | null | undefined): TopazSettings {
  const src = raw || {};
  return {
    enhanceModel: TOPAZ_ENHANCE_MODELS.includes(src.enhanceModel as TopazEnhanceModel)
      ? (src.enhanceModel as TopazEnhanceModel)
      : DEFAULT_TOPAZ_SETTINGS.enhanceModel,
    upscaleFactor: clampUpscaleFactor(src.upscaleFactor ?? DEFAULT_TOPAZ_SETTINGS.upscaleFactor),
    faceEnhancement:
      typeof src.faceEnhancement === "boolean" ? src.faceEnhancement : DEFAULT_TOPAZ_SETTINGS.faceEnhancement,
    faceEnhancementCreativity: clampUnit(
      src.faceEnhancementCreativity ?? DEFAULT_TOPAZ_SETTINGS.faceEnhancementCreativity,
      DEFAULT_TOPAZ_SETTINGS.faceEnhancementCreativity,
    ),
    faceEnhancementStrength: clampUnit(
      src.faceEnhancementStrength ?? DEFAULT_TOPAZ_SETTINGS.faceEnhancementStrength,
      DEFAULT_TOPAZ_SETTINGS.faceEnhancementStrength,
    ),
    subjectDetection: TOPAZ_SUBJECT_DETECTIONS.includes(src.subjectDetection as TopazSubjectDetection)
      ? (src.subjectDetection as TopazSubjectDetection)
      : DEFAULT_TOPAZ_SETTINGS.subjectDetection,
    outputFormat: TOPAZ_OUTPUT_FORMATS.includes(src.outputFormat as TopazOutputFormat)
      ? (src.outputFormat as TopazOutputFormat)
      : DEFAULT_TOPAZ_SETTINGS.outputFormat,
  };
}

export const TOPAZ_SETTINGS_KEY = "kjarni_private_upplyfting_topaz_settings";

export function readStoredTopazSettings(): TopazSettings {
  if (typeof window === "undefined") return DEFAULT_TOPAZ_SETTINGS;
  try {
    const raw = window.localStorage.getItem(TOPAZ_SETTINGS_KEY);
    return raw ? normalizeTopazSettings(JSON.parse(raw) as Partial<TopazSettings>) : DEFAULT_TOPAZ_SETTINGS;
  } catch {
    return DEFAULT_TOPAZ_SETTINGS;
  }
}

async function fetchImageBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gat ekki sótt mynd af Replicate (${res.status})`);
  return res.blob();
}

export async function upscaleWithTopaz(settings: TopazSettings, imageDataUrl: string): Promise<Blob> {
  const res = await fetch("/api/upplyfting", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...settings, image: imageDataUrl }),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      message = (JSON.parse(text) as { error?: string }).error || text;
    } catch {
      // not JSON
    }
    throw new Error(message || `Topaz upscale mistókst (${res.status})`);
  }
  const data = JSON.parse(text) as { images: string[] };
  if (!data.images?.[0]) throw new Error("Topaz skilaði engri mynd");
  return fetchImageBlob(data.images[0]);
}
