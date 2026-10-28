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

/** Poll status-route-ið á 5s fresti þangað til succeeded/failed. Vegna
 *  cold-start getur Wan tekið 5+ mínútur í fyrsta kalli; við bíðum í allt
 *  að 15 mínútur áður en við gefumst upp (user getur alltaf hætt).
 *
 *  onStatus kallbakkar með „starting" | „processing" svo UI geti sýnt
 *  framvindu í stað þess að hanga á „Teikna..." án nokkurs. */
async function pollWanStatus(
  predictionId: string,
  onStatus: (status: string, elapsedSeconds: number) => void,
  signal?: AbortSignal,
): Promise<string[]> {
  const start = Date.now();
  const deadline = start + 15 * 60 * 1000;
  for (;;) {
    if (signal?.aborted) throw new Error("Hætt við");
    await new Promise((r) => setTimeout(r, 5000));
    if (signal?.aborted) throw new Error("Hætt við");
    const res = await fetch(`/api/skyjahreyfimynd/status?id=${encodeURIComponent(predictionId)}`, { signal });
    const data = await parseJsonResponse(res);
    const status = typeof data.status === "string" ? data.status : "processing";
    const elapsed = Math.round((Date.now() - start) / 1000);
    onStatus(status, elapsed);
    if (status === "succeeded") {
      const videos = Array.isArray(data.videos) ? (data.videos as string[]) : [];
      if (!videos[0]) throw new Error("Wan 2.2 skilaði engu myndbandi");
      return videos;
    }
    if (status === "failed" || status === "canceled") {
      throw new Error((typeof data.error === "string" && data.error) || "Wan 2.2 mistókst");
    }
    if (Date.now() > deadline) throw new Error("Wan 2.2 var ekki tilbúið innan 15 mínútna — reyndu aftur");
  }
}

export async function generateWanVideo(
  settings: WanSettings,
  imageDataUrl: string,
  opts?: { onStatus?: (status: string, elapsedSeconds: number) => void; signal?: AbortSignal },
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
  // Fljótleg leið: líkanið var warm og klárað innan Prefer: wait=5.
  if (Array.isArray(data.videos) && typeof data.videos[0] === "string") {
    return fetchVideoBlob(data.videos[0] as string);
  }
  // Annars pollum við þangað til status er succeeded.
  if (typeof data.predictionId !== "string") {
    throw new Error("Wan 2.2 skilaði hvorki myndbandi né prediction id");
  }
  onStatus(typeof data.status === "string" ? data.status : "starting", 0);
  const videos = await pollWanStatus(data.predictionId, onStatus, opts?.signal);
  return fetchVideoBlob(videos[0]);
}
