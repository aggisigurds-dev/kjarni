/** Breyta mynd — þrjú mynd→mynd líkön á Replicate undir sameiginlegri UI:
 *   headshot   flux-kontext-apps/professional-headshot — hvaða mynd sem er
 *              → faglegt headshot (hárgreiðsla, stúdíó-ljós, bakgrunnur).
 *   bakgrunnur bria/generate-background — skiptir út bakgrunni með texta.
 *   pruna      prunaai/p-image-edit — hraðvirkt (<1s), ódýrt ($0.01) multi-image
 *              edit; passar vel í ítrun og tilraunir.
 *
 * Hvert líkan á sinn eigin API-endapunkt (/api/breyta/<mode>/route.ts) og
 * sínar eigin stillingar; þetta skjal pakkar þeim saman í sameiginlegan
 * aðferða-radio og sameiginlega settings-geymslu í localStorage. */

export const BREYTA_MODES = ["headshot", "bakgrunnur", "pruna"] as const;
export type BreytaMode = (typeof BREYTA_MODES)[number];

export const BREYTA_MODE_LABELS: Record<BreytaMode, { label: string; hint: string; costHint: string }> = {
  headshot: {
    label: "Pro headshot",
    hint: "Hvaða portrett sem er → faglegt headshot í stúdíó-ljósi (flux-kontext-apps/professional-headshot).",
    costHint: "~$0.05/mynd, 20–30s.",
  },
  bakgrunnur: {
    label: "Breyta bakgrunni",
    hint: "Lýstu nýjum bakgrunni í texta — líkanið heldur persónunni/vörunni (bria/generate-background).",
    costHint: "~$0.04/mynd, 10–15s.",
  },
  pruna: {
    label: "Hraðbreyta",
    hint: "Multi-image edit undir sekúndu, 45M+ keyrslur — segðu bara hvað á að breyta (prunaai/p-image-edit).",
    costHint: "~$0.01/mynd, <1s.",
  },
};

// Headshot — flux-kontext-apps/professional-headshot
// background er enum (staðfest 2026-10-28: 422 „background must be one of
// the following: 'white', 'black', 'neutral', 'gray', 'office'"), ekki
// frjáls texti.
export const HEADSHOT_BACKGROUNDS = ["neutral", "white", "black", "gray", "office"] as const;
export type HeadshotBackground = (typeof HEADSHOT_BACKGROUNDS)[number];

export type HeadshotSettings = {
  gender: "none" | "male" | "female";
  background: HeadshotBackground;
  disableSafetyChecker: boolean;
};
export const DEFAULT_HEADSHOT_SETTINGS: HeadshotSettings = {
  gender: "none",
  background: "neutral",
  disableSafetyChecker: false,
};
export const HEADSHOT_SETTINGS_KEY = "kjarni_private_breyta_headshot_settings";

// Bakgrunnur
export type BackgroundSettings = {
  prompt: string;
  negativePrompt: string;
  numResults: number;
  seed: number;
};
export const DEFAULT_BACKGROUND_SETTINGS: BackgroundSettings = {
  prompt: "clean modern office interior with natural daylight, soft bokeh",
  negativePrompt: "cluttered, people in background, distracting elements",
  numResults: 1,
  seed: -1,
};
export const BACKGROUND_SETTINGS_KEY = "kjarni_private_breyta_background_settings";

// Pruna
export type PrunaSettings = {
  prompt: string;
  disableSafetyChecker: boolean;
  seed: number;
};
export const DEFAULT_PRUNA_SETTINGS: PrunaSettings = {
  prompt: "remove the background and put the subject on a clean white background",
  disableSafetyChecker: false,
  seed: -1,
};
export const PRUNA_SETTINGS_KEY = "kjarni_private_breyta_pruna_settings";

export const BREYTA_MODE_KEY = "kjarni_private_breyta_mode";

export function readStoredBreytaMode(): BreytaMode {
  if (typeof window === "undefined") return "headshot";
  const raw = window.localStorage.getItem(BREYTA_MODE_KEY);
  return BREYTA_MODES.includes(raw as BreytaMode) ? (raw as BreytaMode) : "headshot";
}

function readStored<T>(key: string, fallback: T, normalize: (raw: Partial<T>) => T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? normalize(JSON.parse(raw) as Partial<T>) : fallback;
  } catch {
    return fallback;
  }
}

export function normalizeHeadshotSettings(raw: Partial<HeadshotSettings>): HeadshotSettings {
  const src = raw || {};
  const gender: HeadshotSettings["gender"] =
    src.gender === "male" || src.gender === "female" ? src.gender : "none";
  return {
    gender,
    background: HEADSHOT_BACKGROUNDS.includes(src.background as HeadshotBackground)
      ? (src.background as HeadshotBackground)
      : DEFAULT_HEADSHOT_SETTINGS.background,
    disableSafetyChecker:
      typeof src.disableSafetyChecker === "boolean"
        ? src.disableSafetyChecker
        : DEFAULT_HEADSHOT_SETTINGS.disableSafetyChecker,
  };
}

export function normalizeBackgroundSettings(raw: Partial<BackgroundSettings>): BackgroundSettings {
  const src = raw || {};
  return {
    prompt: typeof src.prompt === "string" ? src.prompt : DEFAULT_BACKGROUND_SETTINGS.prompt,
    negativePrompt:
      typeof src.negativePrompt === "string" ? src.negativePrompt : DEFAULT_BACKGROUND_SETTINGS.negativePrompt,
    numResults: Math.min(4, Math.max(1, Math.round(Number(src.numResults) || DEFAULT_BACKGROUND_SETTINGS.numResults))),
    seed: Number.isFinite(src.seed) ? Math.trunc(src.seed as number) : -1,
  };
}

export function normalizePrunaSettings(raw: Partial<PrunaSettings>): PrunaSettings {
  const src = raw || {};
  return {
    prompt: typeof src.prompt === "string" ? src.prompt : DEFAULT_PRUNA_SETTINGS.prompt,
    disableSafetyChecker:
      typeof src.disableSafetyChecker === "boolean"
        ? src.disableSafetyChecker
        : DEFAULT_PRUNA_SETTINGS.disableSafetyChecker,
    seed: Number.isFinite(src.seed) ? Math.trunc(src.seed as number) : -1,
  };
}

export function readStoredHeadshotSettings(): HeadshotSettings {
  return readStored(HEADSHOT_SETTINGS_KEY, DEFAULT_HEADSHOT_SETTINGS, normalizeHeadshotSettings);
}
export function readStoredBackgroundSettings(): BackgroundSettings {
  return readStored(BACKGROUND_SETTINGS_KEY, DEFAULT_BACKGROUND_SETTINGS, normalizeBackgroundSettings);
}
export function readStoredPrunaSettings(): PrunaSettings {
  return readStored(PRUNA_SETTINGS_KEY, DEFAULT_PRUNA_SETTINGS, normalizePrunaSettings);
}

async function fetchImageBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gat ekki sótt mynd af Replicate (${res.status})`);
  return res.blob();
}

async function postAndParse(endpoint: string, body: unknown): Promise<Blob[]> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      message = (JSON.parse(text) as { error?: string }).error || text;
    } catch {
      // not JSON
    }
    throw new Error(message || `Breyta mistókst (${res.status})`);
  }
  const data = JSON.parse(text) as { images: string[] };
  return Promise.all(data.images.map(fetchImageBlob));
}

export function runHeadshot(settings: HeadshotSettings, imageDataUrl: string): Promise<Blob[]> {
  return postAndParse("/api/breyta/headshot", { ...settings, image: imageDataUrl });
}

export function runBackground(settings: BackgroundSettings, imageDataUrl: string): Promise<Blob[]> {
  if (!settings.prompt.trim()) throw new Error("Lýstu bakgrunninum fyrst.");
  return postAndParse("/api/breyta/background", { ...settings, image: imageDataUrl });
}

export function runPruna(settings: PrunaSettings, imageDataUrl: string): Promise<Blob[]> {
  if (!settings.prompt.trim()) throw new Error("Segðu hvað á að breyta fyrst.");
  return postAndParse("/api/breyta/pruna", { ...settings, image: imageDataUrl });
}
