/** Clarity Pro Upscaler — philz1337x/clarity-pro-upscaler á Replicate.
 *
 * Ólíkt Topaz (sem er klassískur „pixel-based" upscaler) er Clarity creative
 * upscaler: notar diffusion-líkan til að endurskapa smáatriði á meðan hann
 * heldur sjálfsmynd (face/subject). Gott val þegar þú vilt skarpari HEILA
 * mynd með meiri áferð, en sættir þig við aðeins meira „listræna túlkun".
 *
 * Þrír aðalstillingar:
 *   creativity — hversu mikið líkanið má bæta við nýjum smáatriðum (0 = engin,
 *                1 = frjáls túlkun). 0.3 er góður start.
 *   resemblance — hversu nálægt upprunalegu myndinni (0 = frjálst, 3 = næstum
 *                 eins). 0.6 jafnvægir.
 *   num_inference_steps — fleiri skref = meiri gæði + tími. 18 fyrir hraða,
 *                         28 fyrir jafnvægi, 50 fyrir hámark. */

export type ClaritySettings = {
  prompt: string;
  negativePrompt: string;
  creativity: number;
  resemblance: number;
  steps: number;
  scaleFactor: number; // 1 – 4
  seed: number;
};

export const DEFAULT_CLARITY_SETTINGS: ClaritySettings = {
  prompt: "masterpiece, best quality, highres, detailed",
  negativePrompt: "(worst quality, low quality, normal quality:2)",
  creativity: 0.3,
  resemblance: 0.6,
  steps: 18,
  scaleFactor: 2,
  seed: -1,
};

function clampUnit(n: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, Math.round(n * 100) / 100));
}

function clampResemblance(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_CLARITY_SETTINGS.resemblance;
  return Math.min(3, Math.max(0, Math.round(n * 100) / 100));
}

function clampSteps(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_CLARITY_SETTINGS.steps;
  return Math.min(50, Math.max(1, Math.round(n)));
}

function clampScale(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_CLARITY_SETTINGS.scaleFactor;
  return Math.min(4, Math.max(1, Math.round(n * 10) / 10));
}

export function normalizeClaritySettings(raw: Partial<ClaritySettings> | null | undefined): ClaritySettings {
  const src = raw || {};
  return {
    prompt: typeof src.prompt === "string" ? src.prompt : DEFAULT_CLARITY_SETTINGS.prompt,
    negativePrompt:
      typeof src.negativePrompt === "string" ? src.negativePrompt : DEFAULT_CLARITY_SETTINGS.negativePrompt,
    creativity: clampUnit(src.creativity ?? DEFAULT_CLARITY_SETTINGS.creativity, DEFAULT_CLARITY_SETTINGS.creativity),
    resemblance: clampResemblance(src.resemblance ?? DEFAULT_CLARITY_SETTINGS.resemblance),
    steps: clampSteps(src.steps ?? DEFAULT_CLARITY_SETTINGS.steps),
    scaleFactor: clampScale(src.scaleFactor ?? DEFAULT_CLARITY_SETTINGS.scaleFactor),
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
  // Deadline er mældur frá NÚNA — ekki frá submittedAt. Annars hefur resume
  // eftir refresh bara stuttan tíma eftir og lendir strax í LOCAL_TIMEOUT.
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
