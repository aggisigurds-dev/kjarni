/** Pending Replicate predictions — vista predictionId í IndexedDB svo
 * löng keyrsla (Wan 2.2 video, Tónsmíð, Clarity) lifir browser-tab-switch
 * og page-refresh.
 *
 * Browser suspendar bakgrunnstab (sérstaklega farsímavafrar) sem drepur
 * setTimeout-poll-loopuna okkar. En Replicate-keyrslan sjálf lifir áfram á
 * þeirra GPU, svo við þurfum bara að muna predictionId-ið til að tengjast
 * aftur og sækja útkomuna þegar hún er tilbúin.
 *
 * Mynstur í hverju tóli:
 *   onSubmit:           savePending(key, {predictionId, submittedAt, meta})
 *   onMount:            loadPending(key) → ef til, resumeFromPredictionId()
 *   onSuccess:          saveResult(...) + clearPending(key)
 *   onFailure:          clearPending(key)
 *
 * Við hreinsum líka pending sem er orðið eldra en 1 klst — Replicate drepur
 * predictions sjálf á þeim tíma, ekkert gagn að reyna. */

import { del, get, keys, set } from "idb-keyval";

export type PendingPrediction = {
  key: string;
  predictionId: string;
  submittedAt: number;
  prompt?: string;
  mode?: string;
  sourceName?: string;
};

const PREFIX = "kjarni_pending_";
const MAX_AGE_MS = 60 * 60 * 1000; // 1 klst

export async function savePending(pending: PendingPrediction): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await set(PREFIX + pending.key, pending);
  } catch (err) {
    console.warn("savePending failed", err);
  }
}

export async function loadPending(key: string): Promise<PendingPrediction | null> {
  if (typeof window === "undefined") return null;
  try {
    const stored = (await get(PREFIX + key)) as PendingPrediction | undefined;
    if (!stored || typeof stored.predictionId !== "string") return null;
    if (Date.now() - stored.submittedAt > MAX_AGE_MS) {
      await del(PREFIX + key);
      return null;
    }
    return stored;
  } catch (err) {
    console.warn("loadPending failed", err);
    return null;
  }
}

export async function clearPending(key: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await del(PREFIX + key);
  } catch (err) {
    console.warn("clearPending failed", err);
  }
}

/** Lista allar pending predictions — notað í Verkbók. */
export async function listAllPending(): Promise<PendingPrediction[]> {
  if (typeof window === "undefined") return [];
  try {
    const allKeys = await keys();
    const pendingKeys = allKeys.filter((k) => typeof k === "string" && k.startsWith(PREFIX));
    const now = Date.now();
    const list: PendingPrediction[] = [];
    for (const k of pendingKeys) {
      const stored = (await get(k)) as PendingPrediction | undefined;
      if (stored && typeof stored.predictionId === "string") {
        if (now - stored.submittedAt > MAX_AGE_MS) {
          await del(k);
          continue;
        }
        list.push(stored);
      }
    }
    return list.sort((a, b) => b.submittedAt - a.submittedAt);
  } catch (err) {
    console.warn("listAllPending failed", err);
    return [];
  }
}
