/** Skýjahreyfimynd — mynd → myndband með Wan 2.2 i2v á Replicate (skýja-mótvægi
 * við existing Hreyfimynd-tólið sem keyrir Wan 2.1 á þínu eigin ComfyUI).
 *
 * Replicate collection „Open source video is back" vísar á wan-video/wan-2.2
 * fjölskylduna; wan-video/wan-2.2-i2v-fast er sú ódýrasta sem passar við
 * notkunarsviðið okkar (~$0.05 per myndband, ~30s í generation).
 *
 * Hljóð er EKKI tekið inn — ef þig vantar lipsync eða söng, þarftu annað
 * líkan (wan-2.2-s2v) og það er ekki á boðstólum hér. */

export const WAN_RESOLUTIONS = ["480p", "720p"] as const;
export type WanResolution = (typeof WAN_RESOLUTIONS)[number];

export const WAN_ASPECT_RATIOS = ["16:9", "9:16", "1:1"] as const;
export type WanAspectRatio = (typeof WAN_ASPECT_RATIOS)[number];

export type WanSettings = {
  prompt: string;
  negativePrompt: string;
  numFrames: number;
  framesPerSecond: number;
  seed: number;
  resolution: WanResolution;
  aspectRatio: WanAspectRatio;
  disableSafetyChecker: boolean;
};

export const DEFAULT_WAN_PROMPT =
  "cinematic motion, subtle camera push-in, natural lighting, smooth movement, high quality";

export const DEFAULT_WAN_SETTINGS: WanSettings = {
  prompt: DEFAULT_WAN_PROMPT,
  negativePrompt: "static, no motion, blurry, distorted, text overlay, watermark",
  numFrames: 81, // ~5 sek á 16fps — lágmark samkvæmt Replicate schema
  framesPerSecond: 16,
  seed: -1,
  resolution: "480p",
  aspectRatio: "16:9",
  disableSafetyChecker: false,
};

export function clampFrames(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_WAN_SETTINGS.numFrames;
  // wan-video/wan-2.2-i2v-fast krefst num_frames ≥ 81 (schema validation).
  // Haldum 4N+1 mynstrinu (81, 97, 113, 129) sem er algengt í Wan fjölskyldu.
  return Math.min(129, Math.max(81, Math.round((n - 1) / 4) * 4 + 1));
}

export function clampFps(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_WAN_SETTINGS.framesPerSecond;
  return Math.min(30, Math.max(8, Math.round(n)));
}

export function clampSeed(n: number): number {
  if (!Number.isFinite(n)) return -1;
  return Math.trunc(n);
}

export function normalizeWanSettings(raw: Partial<WanSettings> | null | undefined): WanSettings {
  const src = raw || {};
  return {
    prompt: typeof src.prompt === "string" ? src.prompt : DEFAULT_WAN_SETTINGS.prompt,
    negativePrompt:
      typeof src.negativePrompt === "string" ? src.negativePrompt : DEFAULT_WAN_SETTINGS.negativePrompt,
    numFrames: clampFrames(src.numFrames ?? DEFAULT_WAN_SETTINGS.numFrames),
    framesPerSecond: clampFps(src.framesPerSecond ?? DEFAULT_WAN_SETTINGS.framesPerSecond),
    seed: clampSeed(src.seed ?? DEFAULT_WAN_SETTINGS.seed),
    resolution: WAN_RESOLUTIONS.includes(src.resolution as WanResolution)
      ? (src.resolution as WanResolution)
      : DEFAULT_WAN_SETTINGS.resolution,
    aspectRatio: WAN_ASPECT_RATIOS.includes(src.aspectRatio as WanAspectRatio)
      ? (src.aspectRatio as WanAspectRatio)
      : DEFAULT_WAN_SETTINGS.aspectRatio,
    disableSafetyChecker:
      typeof src.disableSafetyChecker === "boolean"
        ? src.disableSafetyChecker
        : DEFAULT_WAN_SETTINGS.disableSafetyChecker,
  };
}

export const WAN_SETTINGS_KEY = "kjarni_private_skyjahreyfimynd_wan_settings";

export function readStoredWanSettings(): WanSettings {
  if (typeof window === "undefined") return DEFAULT_WAN_SETTINGS;
  try {
    const raw = window.localStorage.getItem(WAN_SETTINGS_KEY);
    return raw ? normalizeWanSettings(JSON.parse(raw) as Partial<WanSettings>) : DEFAULT_WAN_SETTINGS;
  } catch {
    return DEFAULT_WAN_SETTINGS;
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
    throw new Error(message || `Wan 2.2 mistókst (${res.status})`);
  }
  return JSON.parse(text) as Record<string, unknown>;
}

/** Poll status-route-ið þangað til succeeded/failed. Vegna cold-start getur
 *  Wan tekið 5+ mínútur í fyrsta kalli; við bíðum í allt að 15 mínútur
 *  áður en við gefumst upp.
 *
 *  Browser suspendar bakgrunnstab sem drepur setTimeout — en Replicate-
 *  keyrslan lifir áfram á þeirra GPU, og þegar tab verður sýnilegt aftur
 *  tökum við strax upp þráðinn með visibilitychange event. */
import { parseReplicateLogs, type ParsedProgress } from "../replicateProgress";

export type WanProgress = ParsedProgress & { status: string; elapsedSeconds: number };

async function pollWanStatus(
  predictionId: string,
  onStatus: (progress: WanProgress) => void,
  startTime: number,
  signal?: AbortSignal,
): Promise<string[]> {
  // Deadline er mældur frá NÚNA — ekki frá submittedAt. Annars hefur resume
  // eftir refresh bara stuttan tíma eftir og lendir strax í LOCAL_TIMEOUT loop.
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
    // Network-villur eru TRANSIENT — reyna aftur í næsta cycle.
    let data: Record<string, unknown>;
    try {
      const res = await fetch(`/api/skyjahreyfimynd/status?id=${encodeURIComponent(predictionId)}`, { signal });
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
      if (!videos[0]) throw new Error("Wan 2.2 skilaði engu myndbandi");
      return videos;
    }
    if (status === "failed" || status === "canceled") {
      throw new Error((typeof data.error === "string" && data.error) || "Wan 2.2 mistókst");
    }
  }
  throw new Error("LOCAL_TIMEOUT: Wan 2.2 svaraði ekki í 2 klst — líklegast tapaðist predictionið á Replicate. Prófaðu nýtt myndband.");
}

export type GenerateWanOpts = {
  onStatus?: (progress: WanProgress) => void;
  onPredictionId?: (id: string) => void;
  signal?: AbortSignal;
};

export async function generateWanVideo(
  settings: WanSettings,
  imageDataUrl: string,
  opts?: GenerateWanOpts,
): Promise<Blob> {
  if (!settings.prompt.trim()) throw new Error("Skrifaðu lýsingu á hreyfingu fyrst.");
  const onStatus = opts?.onStatus ?? (() => {});
  const res = await fetch("/api/skyjahreyfimynd", {
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
    throw new Error("Wan 2.2 skilaði hvorki myndbandi né prediction id");
  }
  opts?.onPredictionId?.(data.predictionId);
  onStatus({ status: typeof data.status === "string" ? data.status : "starting", elapsedSeconds: 0 });
  const videos = await pollWanStatus(data.predictionId, onStatus, Date.now(), opts?.signal);
  return fetchVideoBlob(videos[0]);
}

/** Resuma pollun á prediction sem var þegar sent inn (t.d. eftir tab-switch
 *  eða page-reload). startedAt skal vera upphaflegi tíminn úr IndexedDB svo
 *  elapsed-mælir hald áfram. */
export async function resumeWanVideo(
  predictionId: string,
  startedAt: number,
  opts?: { onStatus?: (progress: WanProgress) => void; signal?: AbortSignal },
): Promise<Blob> {
  const onStatus = opts?.onStatus ?? (() => {});
  const videos = await pollWanStatus(predictionId, onStatus, startedAt, opts?.signal);
  return fetchVideoBlob(videos[0]);
}
