/** Vakna — Wan 2.2 TI2V (text+image to video) á OKKAR EIGIN RunPod Serverless
 * endpoint (averystormknight-hue/Wan22-t2v-runpod v0.1.4). Þetta er mótvægi
 * við Skýjahreyfimynd sem keyrir á Replicate: Vakna kostar minna per video
 * (við eigum GPU-ið) og hefur engar NSFW-takmarkanir frá Replicate — en
 * fyrsti cold-start tekur 10-15 mín meðan módelið sótt sig niður.
 *
 * API: POST /api/vakna → {jobId, status}; GET /api/vakna/status?id=X →
 * {status, video?} þar sem video er data:video/mp4;base64,... strengur.
 *
 * Output stærðir: Wan 2.2 5B skilar 480p (480x832 portrait, 832x480 landscape,
 * 640x640 square) með 25-129 frames á ~16fps = 1.5s - 8s video. */

export const VAKNA_ASPECT_RATIOS = ["9:16", "16:9", "1:1"] as const;
export type VaknaAspectRatio = (typeof VAKNA_ASPECT_RATIOS)[number];

export const VAKNA_ASPECT_LABELS: Record<VaknaAspectRatio, string> = {
  "9:16": "Lóðrétt (sími)",
  "16:9": "Lárétt (video)",
  "1:1": "Kassi",
};

export const VAKNA_ASPECT_DIMS: Record<VaknaAspectRatio, { width: number; height: number }> = {
  "9:16": { width: 480, height: 832 },
  "16:9": { width: 832, height: 480 },
  "1:1": { width: 640, height: 640 },
};

export type VaknaSettings = {
  prompt: string;
  negativePrompt: string;
  aspectRatio: VaknaAspectRatio;
  length: number; // frames; 81 = ~5s @ 16fps
  steps: number;
  cfg: number;
  seed: number;
};

export const DEFAULT_VAKNA_PROMPT =
  "cinematic motion, subtle camera push-in, natural lighting, smooth movement, high quality";

export const DEFAULT_VAKNA_SETTINGS: VaknaSettings = {
  prompt: DEFAULT_VAKNA_PROMPT,
  negativePrompt: "blurry, low quality, distorted, text overlay, watermark, static, no motion",
  aspectRatio: "9:16",
  length: 81,
  steps: 10,
  cfg: 2.0,
  seed: -1,
};

export const VAKNA_SETTINGS_KEY = "kjarni_private_vakna_settings";

function clampInt(v: unknown, def: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function clampFloat(v: unknown, def: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

export function normalizeVaknaSettings(raw: Partial<VaknaSettings> | null | undefined): VaknaSettings {
  const src = raw ?? {};
  return {
    prompt: typeof src.prompt === "string" ? src.prompt : DEFAULT_VAKNA_SETTINGS.prompt,
    negativePrompt:
      typeof src.negativePrompt === "string" ? src.negativePrompt : DEFAULT_VAKNA_SETTINGS.negativePrompt,
    aspectRatio: VAKNA_ASPECT_RATIOS.includes(src.aspectRatio as VaknaAspectRatio)
      ? (src.aspectRatio as VaknaAspectRatio)
      : DEFAULT_VAKNA_SETTINGS.aspectRatio,
    length: clampInt(src.length, DEFAULT_VAKNA_SETTINGS.length, 25, 129),
    steps: clampInt(src.steps, DEFAULT_VAKNA_SETTINGS.steps, 4, 50),
    cfg: clampFloat(src.cfg, DEFAULT_VAKNA_SETTINGS.cfg, 1, 10),
    seed: Number.isFinite(src.seed) ? Math.trunc(src.seed as number) : -1,
  };
}

export function readStoredVaknaSettings(): VaknaSettings {
  if (typeof window === "undefined") return DEFAULT_VAKNA_SETTINGS;
  try {
    const raw = window.localStorage.getItem(VAKNA_SETTINGS_KEY);
    if (!raw) return DEFAULT_VAKNA_SETTINGS;
    return normalizeVaknaSettings(JSON.parse(raw) as Partial<VaknaSettings>);
  } catch {
    return DEFAULT_VAKNA_SETTINGS;
  }
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
    throw new Error(message || `Vakna mistókst (${res.status})`);
  }
  return JSON.parse(text) as Record<string, unknown>;
}

/** Decode-ar data:video/mp4;base64,... streng (eða venjulegan https URL) í Blob. */
async function videoStringToBlob(video: string): Promise<Blob> {
  if (video.startsWith("data:")) {
    const commaIdx = video.indexOf(",");
    if (commaIdx < 0) throw new Error("Óskiljanlegt data-URL frá Vakna");
    const header = video.slice(5, commaIdx); // "video/mp4;base64"
    const mime = header.split(";")[0] || "video/mp4";
    const base64 = video.slice(commaIdx + 1);
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  const res = await fetch(video);
  if (!res.ok) throw new Error(`Gat ekki sótt myndband (${res.status})`);
  return res.blob();
}

export type VaknaProgress = {
  status: string;
  elapsedSeconds: number;
  delayTime?: number;
  executionTime?: number;
};

async function pollVaknaStatus(
  jobId: string,
  onStatus: (p: VaknaProgress) => void,
  startTime: number,
  signal?: AbortSignal,
): Promise<string> {
  // 2 klst deadline — nóg fyrir fyrsta cold-start (10-15 mín) + nokkra retries.
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
      const res = await fetch(`/api/vakna/status?id=${encodeURIComponent(jobId)}`, { signal });
      data = await parseJsonResponse(res);
    } catch (err) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      onStatus({ status: "transient-error", elapsedSeconds: elapsed });
      // transient — próf aftur í næsta cycle
      if (signal?.aborted) throw err;
      continue;
    }
    const status = typeof data.status === "string" ? data.status : "processing";
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    onStatus({
      status,
      elapsedSeconds: elapsed,
      delayTime: typeof data.delayTime === "number" ? data.delayTime : undefined,
      executionTime: typeof data.executionTime === "number" ? data.executionTime : undefined,
    });
    if (status === "succeeded") {
      if (typeof data.video !== "string") throw new Error("Vakna skilaði engu myndbandi");
      return data.video;
    }
    if (status === "failed" || status === "canceled") {
      throw new Error((typeof data.error === "string" && data.error) || "Vakna mistókst");
    }
  }
  throw new Error("LOCAL_TIMEOUT: Vakna svaraði ekki í 2 klst — líklega tapaðist jobið á RunPod. Prófaðu nýtt myndband.");
}

export type GenerateVaknaOpts = {
  onStatus?: (p: VaknaProgress) => void;
  onJobId?: (id: string) => void;
  signal?: AbortSignal;
};

export async function generateVaknaVideo(
  settings: VaknaSettings,
  imageDataUrl: string,
  opts?: GenerateVaknaOpts,
): Promise<Blob> {
  if (!settings.prompt.trim()) throw new Error("Skrifaðu lýsingu á hreyfingu fyrst.");
  const dims = VAKNA_ASPECT_DIMS[settings.aspectRatio];
  const onStatus = opts?.onStatus ?? (() => {});
  const res = await fetch("/api/vakna", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: settings.prompt,
      negativePrompt: settings.negativePrompt,
      image: imageDataUrl,
      width: dims.width,
      height: dims.height,
      length: settings.length,
      steps: settings.steps,
      cfg: settings.cfg,
      seed: settings.seed,
    }),
    signal: opts?.signal,
  });
  const data = await parseJsonResponse(res);
  if (typeof data.jobId !== "string") throw new Error("Vakna skilaði engu jobId");
  opts?.onJobId?.(data.jobId);
  onStatus({ status: typeof data.status === "string" ? data.status : "starting", elapsedSeconds: 0 });
  const video = await pollVaknaStatus(data.jobId, onStatus, Date.now(), opts?.signal);
  return videoStringToBlob(video);
}
