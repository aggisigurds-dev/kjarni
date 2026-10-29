/** Clarity Pro Upscaler — philz1337x/clarity-pro-upscaler á Replicate.
 *
 * UPPFÆRT 2026-10-29: Replicate endurhannaði módelið og tók út prompt,
 * negative_prompt, resemblance og num_inference_steps. Nú tekur bara:
 *   image, creativity (-10 til +10), scale_factor (2|4|8|16), output_format.
 *
 * Diffusion-based creative upscaler sem heldur sjálfsmynd (face/subject)
 * en endurskapar smáatriði. „creativity" ræður hversu mikið módelið má
 * bæta við nýjum smáatriðum — jákvætt gildi bætir dramatískari áferð,
 * neikvætt heldur útkomunni nær upprunalegu.
 *
 * Gamla stillingarnar frá fyrri UI (prompt, resemblance, steps) voru
 * hunsaðar af Replicate hljóðlega og creativity-slíderinn okkar sendi
 * gildi á bilinu 0-1 sem er nánast núll á nýja -10..+10 skalanum →
 * útkoman leit næstum eins út og upprunalega myndin. normalizer færir
 * slík gömul stilligildi upp í safe default.
 */

export const CLARITY_SCALES = [2, 4, 8, 16] as const;
export type ClarityScale = (typeof CLARITY_SCALES)[number];

export const CLARITY_OUTPUT_FORMATS = ["png", "jpg"] as const;
export type ClarityOutputFormat = (typeof CLARITY_OUTPUT_FORMATS)[number];

export type ClaritySettings = {
  creativity: number;
  scaleFactor: ClarityScale;
  outputFormat: ClarityOutputFormat;
  seed: number;
};

export const DEFAULT_CLARITY_SETTINGS: ClaritySettings = {
  creativity: 3,
  scaleFactor: 2,
  outputFormat: "png",
  seed: -1,
};

function clampCreativity(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_CLARITY_SETTINGS.creativity;
  return Math.min(10, Math.max(-10, Math.round(n * 10) / 10));
}

function pickScale(n: unknown): ClarityScale {
  const v = Math.round(Number(n));
  return CLARITY_SCALES.includes(v as ClarityScale)
    ? (v as ClarityScale)
    : DEFAULT_CLARITY_SETTINGS.scaleFactor;
}

export function normalizeClaritySettings(raw: Partial<ClaritySettings> | null | undefined): ClaritySettings {
  const src = (raw || {}) as Record<string, unknown>;
  const hasLegacy =
    "resemblance" in src || "num_inference_steps" in src || "prompt" in src || "negativePrompt" in src || "steps" in src;
  const rawCreativity = typeof src.creativity === "number" ? src.creativity : DEFAULT_CLARITY_SETTINGS.creativity;
  const creativity =
    hasLegacy && Math.abs(rawCreativity) <= 1
      ? DEFAULT_CLARITY_SETTINGS.creativity
      : clampCreativity(rawCreativity);
  return {
    creativity,
    scaleFactor: pickScale(src.scaleFactor),
    outputFormat: CLARITY_OUTPUT_FORMATS.includes(src.outputFormat as ClarityOutputFormat)
      ? (src.outputFormat as ClarityOutputFormat)
      : DEFAULT_CLARITY_SETTINGS.outputFormat,
    seed: Number.isFinite(src.seed) ? Math.trunc(src.seed as number) : -1,
  };
}

export const CLARITY_SETTINGS_KEY = "kjarni_private_upplyfting_clarity_settings";

export function readStoredClaritySettings(): ClaritySettings {
  if (typeof window === "undefined") return DEFAULT_CLARITY_SETTINGS;
  try {
    const raw = window.localStorage.getItem(CLARITY_SETTINGS_KEY);
    return raw ? normalizeClaritySettings(JSON.parse(raw) as Partial<ClaritySettings>) : DEFAULT_CLARITY_SETTINGS;
  } catch {
    return DEFAULT_CLARITY_SETTINGS;
  }
}

async function fetchImageBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gat ekki sótt mynd af Replicate (${res.status})`);
  return res.blob();
}

async function parseJsonResponse(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      message = (JSON.parse(text) as { error?: string }).error || text;
    } catch {
      // not JSON
    }
    throw new Error(message || `Clarity mistókst (${res.status})`);
  }
  return JSON.parse(text) as Record<string, unknown>;
}

import { parseReplicateLogs, type ParsedProgress } from "../replicateProgress";

export type ClarityProgress = ParsedProgress & { status: string; elapsedSeconds: number };

async function pollClarityStatus(
  predictionId: string,
  onStatus: (progress: ClarityProgress) => void,
  startTime: number,
  signal?: AbortSignal,
): Promise<string[]> {
  const deadline = Date.now() + 60 * 60 * 1000;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error("Hætt við");
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 4000);
      function onVisible() {
        if (document.visibilityState === "visible") {
          clearTimeout(timer);
          document.removeEventListener("visibilitychange", onVisible);
          resolve();
        }
      }
      document.addEventListener("visibilitychange", onVisible);
    });
    if (signal?.aborted) throw new Error("Hætt við");
    let data: Record<string, unknown>;
    try {
      const res = await fetch(`/api/upplyfting/clarity/status?id=${encodeURIComponent(predictionId)}`, { signal });
      data = await parseJsonResponse(res);
    } catch (err) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      onStatus({ status: "transient-error", elapsedSeconds: elapsed, logTail: err instanceof Error ? err.message : "" });
      continue;
    }
    const status = typeof data.status === "string" ? data.status : "processing";
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const parsed = parseReplicateLogs(typeof data.logs === "string" ? data.logs : undefined);
    onStatus({ status, elapsedSeconds: elapsed, ...parsed });
    if (status === "succeeded") {
      const images = Array.isArray(data.images) ? (data.images as string[]) : [];
      if (!images[0]) throw new Error("Clarity skilaði engri mynd");
      return images;
    }
    if (status === "failed" || status === "canceled") {
      throw new Error((typeof data.error === "string" && data.error) || "Clarity mistókst");
    }
  }
  throw new Error("LOCAL_TIMEOUT: Clarity svaraði ekki í 1 klst — líklegast tapaðist predictionið. Prófaðu nýtt.");
}

export type UpscaleWithClarityOpts = {
  onStatus?: (progress: ClarityProgress) => void;
  onPredictionId?: (id: string) => void;
  signal?: AbortSignal;
};

export async function upscaleWithClarity(
  settings: ClaritySettings,
  imageDataUrl: string,
  opts?: UpscaleWithClarityOpts,
): Promise<Blob> {
  const onStatus = opts?.onStatus ?? (() => {});
  const res = await fetch("/api/upplyfting/clarity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...settings, image: imageDataUrl }),
    signal: opts?.signal,
  });
  const data = await parseJsonResponse(res);
  if (Array.isArray(data.images) && typeof data.images[0] === "string") {
    return fetchImageBlob(data.images[0] as string);
  }
  if (typeof data.predictionId !== "string") {
    throw new Error("Clarity skilaði hvorki mynd né prediction id");
  }
  opts?.onPredictionId?.(data.predictionId);
  onStatus({ status: typeof data.status === "string" ? data.status : "starting", elapsedSeconds: 0 });
  const images = await pollClarityStatus(data.predictionId, onStatus, Date.now(), opts?.signal);
  return fetchImageBlob(images[0]);
}

export async function resumeClarity(
  predictionId: string,
  startedAt: number,
  opts?: { onStatus?: (progress: ClarityProgress) => void; signal?: AbortSignal },
): Promise<Blob> {
  const onStatus = opts?.onStatus ?? (() => {});
  const images = await pollClarityStatus(predictionId, onStatus, startedAt, opts?.signal);
  return fetchImageBlob(images[0]);
}
