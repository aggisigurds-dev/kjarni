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

async function pollMusicStatus(
  predictionId: string,
  onStatus: (status: string, elapsedSeconds: number) => void,
  signal?: AbortSignal,
): Promise<string[]> {
  const start = Date.now();
  const deadline = start + 10 * 60 * 1000;
  for (;;) {
    if (signal?.aborted) throw new Error("Hætt við");
    await new Promise((r) => setTimeout(r, 4000));
    if (signal?.aborted) throw new Error("Hætt við");
    const res = await fetch(`/api/tonsmid/status?id=${encodeURIComponent(predictionId)}`, { signal });
    const data = await parseJsonResponse(res);
    const status = typeof data.status === "string" ? data.status : "processing";
    const elapsed = Math.round((Date.now() - start) / 1000);
    onStatus(status, elapsed);
    if (status === "succeeded") {
      const audio = Array.isArray(data.audio) ? (data.audio as string[]) : [];
      if (!audio[0]) throw new Error("Tónsmíð skilaði engu hljóði");
      return audio;
    }
    if (status === "failed" || status === "canceled") {
      throw new Error((typeof data.error === "string" && data.error) || "Tónsmíð mistókst");
    }
    if (Date.now() > deadline) throw new Error("Tónsmíð var ekki tilbúin innan 10 mínútna");
  }
}

export async function composeMusic(
  settings: MusicSettings,
  opts?: { onStatus?: (status: string, elapsedSeconds: number) => void; signal?: AbortSignal },
): Promise<Blob> {
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
  onStatus(typeof data.status === "string" ? data.status : "starting", 0);
  const audio = await pollMusicStatus(data.predictionId, onStatus, opts?.signal);
  return fetchBlob(audio[0]);
}
