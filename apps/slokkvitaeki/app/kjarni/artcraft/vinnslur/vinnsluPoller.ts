/** Background-pollari fyrir pending Replicate predictions.
 *
 * Verkbók notar þetta til að fylgjast með öllum ókláraðum vinnslum í einu —
 * óháð því hvort notandi er í samsvarandi tóli eða ekki. Þegar prediction
 * succeedar: sækir blob(a), vistar í savedResults, hreinsar pending. Þegar
 * failed/canceled: hreinsar pending. Annars pollar áfram í allt að 2 klst.
 *
 * Hvert tól hefur sinn eigin status-endpoint og output-field; map-ið hér
 * verður að haldast í sync við route-ana. */

import { clearPending, type PendingPrediction } from "../pendingPredictions";
import { parseReplicateLogs, type ParsedProgress } from "../replicateProgress";
import { saveResult, type SavedResultMediaType } from "../savedResults";

type JobKind = {
  statusUrl: (id: string) => string;
  outputField: "videos" | "images" | "audio";
  mediaType: SavedResultMediaType;
};

const KINDS: Record<string, JobKind> = {
  "skyjahreyfimynd:wan": {
    statusUrl: (id) => `/api/skyjahreyfimynd/status?id=${encodeURIComponent(id)}`,
    outputField: "videos",
    mediaType: "video",
  },
  "skyjahreyfimynd:kling": {
    statusUrl: (id) => `/api/skyjahreyfimynd/kling/status?id=${encodeURIComponent(id)}`,
    outputField: "videos",
    mediaType: "video",
  },
  "upplyfting:clarity": {
    statusUrl: (id) => `/api/upplyfting/clarity/status?id=${encodeURIComponent(id)}`,
    outputField: "images",
    mediaType: "image",
  },
  tonsmid: {
    statusUrl: (id) => `/api/tonsmid/status?id=${encodeURIComponent(id)}`,
    outputField: "audio",
    mediaType: "audio",
  },
};

function kindFor(pending: PendingPrediction): JobKind | null {
  if (pending.key === "skyjahreyfimynd") {
    return KINDS[`skyjahreyfimynd:${pending.mode || "wan"}`] || null;
  }
  if (pending.key === "upplyfting") {
    return KINDS[`upplyfting:${pending.mode || "clarity"}`] || null;
  }
  return KINDS[pending.key] || null;
}

export type PollState = ParsedProgress & { status: string; elapsedSeconds: number };

async function sleepOrAbort(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
    // Visibility-change: ef user kemur til baka í tabbið, polla strax
    function onVisible() {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        document.removeEventListener("visibilitychange", onVisible);
        resolve();
      }
    }
    document.addEventListener("visibilitychange", onVisible);
  });
}

/** Pollar eitt pending job í bakgrunni. Lýkur þegar Replicate confirmar
 *  terminal status (succeeded/failed/canceled) eða 2 klst eru liðnar. */
export async function pollJob(
  pending: PendingPrediction,
  onProgress: (state: PollState) => void,
  signal: AbortSignal,
): Promise<void> {
  const kind = kindFor(pending);
  if (!kind) return;
  const deadline = Date.now() + 2 * 60 * 60 * 1000;
  const startTime = pending.submittedAt;

  while (Date.now() < deadline) {
    if (signal.aborted) return;
    await sleepOrAbort(5000, signal);
    if (signal.aborted) return;

    let data: Record<string, unknown>;
    try {
      const res = await fetch(kind.statusUrl(pending.predictionId), { signal });
      if (!res.ok) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        onProgress({ status: "transient-error", elapsedSeconds: elapsed });
        continue;
      }
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      onProgress({ status: "transient-error", elapsedSeconds: elapsed });
      continue;
    }

    const status = typeof data.status === "string" ? data.status : "processing";
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const parsed = parseReplicateLogs(typeof data.logs === "string" ? data.logs : undefined);
    onProgress({ status, elapsedSeconds: elapsed, ...parsed });

    if (status === "succeeded") {
      const outputs = Array.isArray(data[kind.outputField]) ? (data[kind.outputField] as string[]) : [];
      if (outputs.length === 0) return;
      try {
        const blobs: Blob[] = [];
        for (const url of outputs) {
          const blobRes = await fetch(url, { signal });
          if (!blobRes.ok) throw new Error(`Niðurhal mistókst (${blobRes.status})`);
          blobs.push(await blobRes.blob());
        }
        await saveResult({
          key: pending.key,
          timestamp: Date.now(),
          mediaType: kind.mediaType,
          blobs,
          prompt: pending.prompt,
          mode: pending.mode,
          sourceName: pending.sourceName,
        });
        await clearPending(pending.key);
      } catch (err) {
        console.warn("background poll save failed", err);
      }
      return;
    }

    if (status === "failed" || status === "canceled") {
      await clearPending(pending.key);
      return;
    }
  }
}

export function canPollInBackground(pending: PendingPrediction): boolean {
  return kindFor(pending) !== null;
}
