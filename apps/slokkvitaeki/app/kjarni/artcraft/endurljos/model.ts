/** Endurljós — zsxkib/ic-light á Replicate
 *
 * Image-conditional relighting með depth-aware ljósadreifingu. Lýst með texta
 * (sunset, soft studio, moody rim light o.s.frv.) og ljósastefnu (vinstri/
 * hægri/efst/neðst/engin). Myndin breytir ekki formi — bara ljósinu. */

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

export type EndurljosSettings = {
  prompt: string;
  lightSource: LightSource;
  negativePrompt: string;
  numResults: number;
  seed: number;
  disableSafetyChecker: boolean;
};

export const DEFAULT_ENDURLJOS_SETTINGS: EndurljosSettings = {
  prompt: "soft studio key light, warm rim, deep shadows, cinematic",
  lightSource: "Left Light",
  negativePrompt: "lowres, bad anatomy, bad hands, cropped, worst quality, blurry",
  numResults: 1,
  seed: -1,
  disableSafetyChecker: false,
};

export const ENDURLJOS_SETTINGS_KEY = "kjarni_private_endurljos_settings";

export function normalizeEndurljosSettings(
  raw: Partial<EndurljosSettings> | null | undefined,
): EndurljosSettings {
  const src = raw ?? {};
  return {
    prompt: typeof src.prompt === "string" ? src.prompt : DEFAULT_ENDURLJOS_SETTINGS.prompt,
    lightSource: LIGHT_SOURCES.includes(src.lightSource as LightSource)
      ? (src.lightSource as LightSource)
      : DEFAULT_ENDURLJOS_SETTINGS.lightSource,
    negativePrompt:
      typeof src.negativePrompt === "string"
        ? src.negativePrompt
        : DEFAULT_ENDURLJOS_SETTINGS.negativePrompt,
    numResults: Math.min(4, Math.max(1, Math.round(Number(src.numResults) || 1))),
    seed: Number.isFinite(src.seed) ? Math.trunc(src.seed as number) : -1,
    disableSafetyChecker:
      typeof src.disableSafetyChecker === "boolean" ? src.disableSafetyChecker : false,
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
      prompt: activePrompt,
      lightSource: settings.lightSource,
      negativePrompt: settings.negativePrompt,
      numResults: settings.numResults,
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
    throw new Error(message || `Endurljós mistókst (${res.status})`);
  }
  const data = JSON.parse(text) as { images: string[] };
  return Promise.all(data.images.map(fetchImageBlob));
}
