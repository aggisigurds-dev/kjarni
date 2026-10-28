/** Skýjastúdíó — inpaint-valkostur með Replicate's black-forest-labs/
 * flux-fill-dev, sérsmíðað Flux-líkan fyrir nákvæmlega þetta: taka inn
 * mynd + svart-hvíta grímu og endurgera bara hvíta svæðið. Flux's T5
 * texta-encoder skilur prómt mun betur en SDXL's CLIP-encoder — gott fyrir
 * t.d. að fjarlægja hlut (gardínu, efni) sem hylur eitthvað og endurgera
 * það sem er undir, þar sem SDXL á það til að misskilja lýsinguna.
 *
 * Input/output schema sótt beint af Replicate (GET /v1/models/
 * black-forest-labs/flux-fill-dev), ekki giskað — sama agi og sdxl.ts. */

export type FluxFillSettings = {
  prompt: string;
  guidance: number;
  steps: number;
  numOutputs: number;
  seed: number;
  disableSafetyChecker: boolean;
};

export const DEFAULT_FLUX_FILL_SETTINGS: FluxFillSettings = {
  prompt: "",
  guidance: 30,
  steps: 28,
  numOutputs: 1,
  seed: -1,
  disableSafetyChecker: false,
};

export function clampFluxGuidance(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_FLUX_FILL_SETTINGS.guidance;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function clampFluxSteps(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_FLUX_FILL_SETTINGS.steps;
  return Math.min(50, Math.max(1, Math.round(n)));
}

export function clampFluxNumOutputs(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_FLUX_FILL_SETTINGS.numOutputs;
  return Math.min(4, Math.max(1, Math.round(n)));
}

export function clampFluxSeed(n: number): number {
  if (!Number.isFinite(n)) return -1;
  return Math.trunc(n);
}

export function normalizeFluxFillSettings(
  raw: Partial<FluxFillSettings> | null | undefined,
): FluxFillSettings {
  const src = raw || {};
  return {
    prompt: typeof src.prompt === "string" ? src.prompt : DEFAULT_FLUX_FILL_SETTINGS.prompt,
    guidance: clampFluxGuidance(src.guidance ?? DEFAULT_FLUX_FILL_SETTINGS.guidance),
    steps: clampFluxSteps(src.steps ?? DEFAULT_FLUX_FILL_SETTINGS.steps),
    numOutputs: clampFluxNumOutputs(src.numOutputs ?? DEFAULT_FLUX_FILL_SETTINGS.numOutputs),
    seed: clampFluxSeed(src.seed ?? DEFAULT_FLUX_FILL_SETTINGS.seed),
    disableSafetyChecker:
      typeof src.disableSafetyChecker === "boolean"
        ? src.disableSafetyChecker
        : DEFAULT_FLUX_FILL_SETTINGS.disableSafetyChecker,
  };
}

export const FLUX_FILL_SETTINGS_KEY = "kjarni_private_skyjastudio_flux_settings";

export function readStoredFluxFillSettings(): FluxFillSettings {
  if (typeof window === "undefined") return DEFAULT_FLUX_FILL_SETTINGS;
  try {
    const raw = window.localStorage.getItem(FLUX_FILL_SETTINGS_KEY);
    return raw
      ? normalizeFluxFillSettings(JSON.parse(raw) as Partial<FluxFillSettings>)
      : DEFAULT_FLUX_FILL_SETTINGS;
  } catch {
    return DEFAULT_FLUX_FILL_SETTINGS;
  }
}

async function fetchImageBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gat ekki sótt mynd af Replicate (${res.status})`);
  return res.blob();
}

export type FluxFillInpaintExtra = {
  imageDataUrl: string;
  maskDataUrl: string;
};

export async function generateFluxFillImage(
  settings: FluxFillSettings,
  inpaint: FluxFillInpaintExtra,
): Promise<Blob[]> {
  if (!settings.prompt.trim()) throw new Error("Skrifaðu prompt fyrst.");
  const res = await fetch("/api/skyjastudio/flux-fill", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...settings, image: inpaint.imageDataUrl, mask: inpaint.maskDataUrl }),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      message = (JSON.parse(text) as { error?: string }).error || text;
    } catch {
      // not JSON, use raw text
    }
    throw new Error(message || `Flux Fill mistókst (${res.status})`);
  }
  const data = JSON.parse(text) as { images: string[] };
  // Same pattern as sdxl.ts: the route returns Replicate's own delivery
  // URLs directly (publicly fetchable, Access-Control-Allow-Origin: *)
  // rather than base64-encoding into its own JSON response.
  return Promise.all(data.images.map(fetchImageBlob));
}
