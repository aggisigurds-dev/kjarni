/** Skýjahreyfimynd → Kling 2.1 — kwaivgi/kling-v2.1 á Replicate.
 *
 * Premium i2v líkan frá Kuaishou — cinematic gæði umfram Wan 2.2 fast.
 * Dýrara (~$0.28/myndband vs $0.05) og hægara (1–3 mín vs ~30s) en skilar
 * mun professionaleri útkomu. Hugsað fyrir „lykilsenur" í Facebook-
 * auglýsingum þar sem gæði skipta máli; Wan er fyrir dagleg tilraun.
 *
 * ATH: Kling exposar EKKI `disable_safety_checker` í schema — Kuaishou
 * er með sinn eigin content-filter sem keyrir á þeirra server-side og
 * við getum ekki slökkt á. Ef þú vilt engan filter er Wan 2.2 (sem hefur
 * togglinn) eða local ComfyUI-leiðin eina leiðin.
 *
 * Schema (staðfest frá Replicate):
 *   prompt           string, required
 *   start_image      uri, image fyrir i2v
 *   end_image        uri, optional (keyframe-stýring)
 *   duration         int, 5 eða 10 (sek)
 *   aspect_ratio     "16:9" | "9:16" | "1:1"
 *   negative_prompt  string, optional
 *   cfg_scale        float 0–1, hversu nálægt prompt-i (default 0.5)
 */

import { parseReplicateLogs, type ParsedProgress } from "../replicateProgress";

export const KLING_DURATIONS = [5, 10] as const;
export type KlingDuration = (typeof KLING_DURATIONS)[number];

export const KLING_ASPECT_RATIOS = ["16:9", "9:16", "1:1"] as const;
export type KlingAspectRatio = (typeof KLING_ASPECT_RATIOS)[number];

export type KlingSettings = {
  prompt: string;
  negativePrompt: string;
  duration: KlingDuration;
  aspectRatio: KlingAspectRatio;
  cfgScale: number;
};

export const DEFAULT_KLING_PROMPT =
  "cinematic motion, smooth camera push-in, natural lighting, high detail, professional cinematography";

export const DEFAULT_KLING_SETTINGS: KlingSettings = {
  prompt: DEFAULT_KLING_PROMPT,
  negativePrompt: "blurry, distorted, low quality, watermark, text overlay",
  duration: 5,
  aspectRatio: "16:9",
  cfgScale: 0.5,
};

function clampUnit(n: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, Math.round(n * 100) / 100));
}

export function normalizeKlingSettings(raw: Partial<KlingSettings> | null | undefined): KlingSettings {
  const src = raw || {};
  return {
    prompt: typeof src.prompt === "string" ? src.prompt : DEFAULT_KLING_SETTINGS.prompt,
    negativePrompt:
      typeof src.negativePrompt === "string" ? src.negativePrompt : DEFAULT_KLING_SETTINGS.negativePrompt,
    duration: KLING_DURATIONS.includes(src.duration as KlingDuration)
      ? (src.duration as KlingDuration)
      : DEFAULT_KLING_SETTINGS.duration,
    aspectRatio: KLING_ASPECT_RATIOS.includes(src.aspectRatio as KlingAspectRatio)
      ? (src.aspectRatio as KlingAspectRatio)
      : DEFAULT_KLING_SETTINGS.aspectRatio,
    cfgScale: clampUnit(src.cfgScale ?? DEFAULT_KLING_SETTINGS.cfgScale, DEFAULT_KLING_SETTINGS.cfgScale),
  };
}

export const KLING_SETTINGS_KEY = "kjarni_private_skyjahreyfimynd_kling_settings";

export function readStoredKlingSettings(): KlingSettings {
  if (typeof window === "undefined") return DEFAULT_KLING_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KLING_SETTINGS_KEY);
    return raw ? normalizeKlingSettings(JSON.parse(raw) as Partial<KlingSettings>) : DEFAULT_KLING_SETTINGS;
  } catch {
    return DEFAULT_KLING_SETTINGS;
  }
}

async function fetchVideoBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gat ekki sótt myndband af Replicate (${res.status})`);
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
    throw new Error(message || `Kling mistókst (${res.status})`);
  }
  return JSON.parse(text) as Record<string, unknown>;
}

export type KlingProgress = ParsedProgress & { status: string; elapsedSeconds: number };

async function pollKlingStatus(
  predictionId: string,
  onStatus: (progress: KlingProgress) => void,
  startTime: number,
  signal?: AbortSignal,
): Promise<string[]> {
  // Deadline er mældur frá NÚNA — ekki frá submittedAt. Resume eftir refresh
  // má ekki hafa minna svigrúm en upphafskallið.
  const deadline = Date.now() + 2 * 60 * 60 * 1000;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error("Hætt við");
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 5000);
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
      const res = await fetch(`/api/skyjahreyfimynd/kling/status?id=${encodeURIComponent(predictionId)}`, { signal });
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
      const videos = Array.isArray(data.videos) ? (data.videos as string[]) : [];
      if (!videos[0]) throw new Error("Kling skilaði engu myndbandi");
      return videos;
    }
    if (status === "failed" || status === "canceled") {
      throw new Error((typeof data.error === "string" && data.error) || "Kling mistókst");
    }
  }
  throw new Error("LOCAL_TIMEOUT: Kling svaraði ekki í 2 klst — líklegast tapaðist predictionið. Prófaðu nýtt myndband.");
}

export type GenerateKlingOpts = {
  onStatus?: (progress: KlingProgress) => void;
  onPredictionId?: (id: string) => void;
  signal?: AbortSignal;
};

export async function generateKlingVideo(
  settings: KlingSettings,
  imageDataUrl: string,
  opts?: GenerateKlingOpts,
): Promise<Blob> {
  if (!settings.prompt.trim()) throw new Error("Skrifaðu lýsingu á hreyfingu fyrst.");
  const onStatus = opts?.onStatus ?? (() => {});
  const res = await fetch("/api/skyjahreyfimynd/kling", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...settings, image: imageDataUrl }),
    signal: opts?.signal,
  });
  const data = await parseJsonResponse(res);
  if (Array.isArray(data.videos) && typeof data.videos[0] === "string") {
    return fetchVideoBlob(data.videos[0] as string);
  }
  if (typeof data.predictionId !== "string") {
    throw new Error("Kling skilaði hvorki myndbandi né prediction id");
  }
  opts?.onPredictionId?.(data.predictionId);
  onStatus({ status: typeof data.status === "string" ? data.status : "starting", elapsedSeconds: 0 });
  const videos = await pollKlingStatus(data.predictionId, onStatus, Date.now(), opts?.signal);
  return fetchVideoBlob(videos[0]);
}

export async function resumeKling(
  predictionId: string,
  startedAt: number,
  opts?: { onStatus?: (progress: KlingProgress) => void; signal?: AbortSignal },
): Promise<Blob> {
  const onStatus = opts?.onStatus ?? (() => {});
  const videos = await pollKlingStatus(predictionId, onStatus, startedAt, opts?.signal);
  return fetchVideoBlob(videos[0]);
}
