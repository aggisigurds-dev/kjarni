/** Tónsmíð — ElevenLabs Music á Replicate (elevenlabs/music).
 *
 * Semur heilt lag úr texta-prompt-i á 30–60 sek. Góð notkun fyrir Kjarna:
 * útvarpsauglýsingar, jinglar, bakgrunnstónlist fyrir myndbönd.
 *
 * Lengd má vera 10 sek – 5 mín (10000–300000 ms); kostnaður skalast með
 * lengd. force_instrumental skilur sönginn eftir utan — gott fyrir bakgrunn
 * sem þú vilt tala yfir. */

export type MusicSettings = {
  prompt: string;
  lengthSeconds: number; // 10 – 300
  forceInstrumental: boolean;
};

export const DEFAULT_MUSIC_PROMPT =
  "upbeat acoustic jingle, 30 seconds, cheerful, light percussion, soft piano, warm major key";

export const DEFAULT_MUSIC_SETTINGS: MusicSettings = {
  prompt: DEFAULT_MUSIC_PROMPT,
  lengthSeconds: 30,
  forceInstrumental: false,
};

export function clampLength(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_MUSIC_SETTINGS.lengthSeconds;
  return Math.min(300, Math.max(10, Math.round(n)));
}

export function normalizeMusicSettings(raw: Partial<MusicSettings> | null | undefined): MusicSettings {
  const src = raw || {};
  return {
    prompt: typeof src.prompt === "string" ? src.prompt : DEFAULT_MUSIC_SETTINGS.prompt,
    lengthSeconds: clampLength(src.lengthSeconds ?? DEFAULT_MUSIC_SETTINGS.lengthSeconds),
    forceInstrumental:
      typeof src.forceInstrumental === "boolean"
        ? src.forceInstrumental
        : DEFAULT_MUSIC_SETTINGS.forceInstrumental,
  };
}

export const MUSIC_SETTINGS_KEY = "kjarni_private_tonsmid_settings";

export function readStoredMusicSettings(): MusicSettings {
  if (typeof window === "undefined") return DEFAULT_MUSIC_SETTINGS;
  try {
    const raw = window.localStorage.getItem(MUSIC_SETTINGS_KEY);
    return raw ? normalizeMusicSettings(JSON.parse(raw) as Partial<MusicSettings>) : DEFAULT_MUSIC_SETTINGS;
  } catch {
    return DEFAULT_MUSIC_SETTINGS;
  }
}

async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gat ekki sótt hljóð af Replicate (${res.status})`);
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
    throw new Error(message || `Tónsmíð mistókst (${res.status})`);
  }
  return JSON.parse(text) as Record<string, unknown>;
}

import { parseReplicateLogs, type ParsedProgress } from "../replicateProgress";

export type MusicProgress = ParsedProgress & { status: string; elapsedSeconds: number };

async function pollMusicStatus(
  predictionId: string,
  onStatus: (progress: MusicProgress) => void,
  startTime: number,
  signal?: AbortSignal,
): Promise<string[]> {
  const deadline = startTime + 10 * 60 * 1000;
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
      const res = await fetch(`/api/tonsmid/status?id=${encodeURIComponent(predictionId)}`, { signal });
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
      const audio = Array.isArray(data.audio) ? (data.audio as string[]) : [];
      if (!audio[0]) throw new Error("Tónsmíð skilaði engu hljóði");
      return audio;
    }
    if (status === "failed" || status === "canceled") {
      throw new Error((typeof data.error === "string" && data.error) || "Tónsmíð mistókst");
    }
  }
  throw new Error("LOCAL_TIMEOUT: Tónsmíð var ekki tilbúin innan 10 mínútna — Replicate getur enn verið að vinna, endurhlað síðuna til að tengjast aftur");
}

export type ComposeMusicOpts = {
  onStatus?: (progress: MusicProgress) => void;
  onPredictionId?: (id: string) => void;
  signal?: AbortSignal;
};

export async function composeMusic(settings: MusicSettings, opts?: ComposeMusicOpts): Promise<Blob> {
  if (!settings.prompt.trim()) throw new Error("Skrifaðu lýsingu á laginu fyrst.");
  const onStatus = opts?.onStatus ?? (() => {});
  const res = await fetch("/api/tonsmid", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
    signal: opts?.signal,
  });
  const data = await parseJsonResponse(res);
  if (Array.isArray(data.audio) && typeof data.audio[0] === "string") {
    return fetchBlob(data.audio[0] as string);
  }
  if (typeof data.predictionId !== "string") {
    throw new Error("Tónsmíð skilaði hvorki hljóði né prediction id");
  }
  opts?.onPredictionId?.(data.predictionId);
  onStatus({ status: typeof data.status === "string" ? data.status : "starting", elapsedSeconds: 0 });
  const audio = await pollMusicStatus(data.predictionId, onStatus, Date.now(), opts?.signal);
  return fetchBlob(audio[0]);
}

export async function resumeMusic(
  predictionId: string,
  startedAt: number,
  opts?: { onStatus?: (progress: MusicProgress) => void; signal?: AbortSignal },
): Promise<Blob> {
  const onStatus = opts?.onStatus ?? (() => {});
  const audio = await pollMusicStatus(predictionId, onStatus, startedAt, opts?.signal);
  return fetchBlob(audio[0]);
}
