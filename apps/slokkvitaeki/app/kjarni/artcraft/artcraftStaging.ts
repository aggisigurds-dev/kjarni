/** Artcraft staging — sameiginleg geymsla fyrir myndir/myndbönd sem notandi
 * vill flytja á milli tóla án þess að download/upload-a. Þetta er grunnurinn
 * að „Senda í..." mynstrinu.
 *
 * Hugmynd: Þegar notandi smellir „Senda í Upplyftingu" á útkomu-spjaldi
 * Hraðbreytu, blobinn (ekki URL) er vistaður í IndexedDB með einskonar id,
 * og notandinn er sendur á `/kjarni/artcraft/upplyfting?use=<id>`.
 * Target tólið les ?use= param, sækir blobinn úr staging, lætur það birtast
 * eins og notandi hefði bara uploadad það.
 *
 * Blobinn lifir refresh/navigation. Auto-cleanup: haldum að hámarki 50
 * nýjustu, og eyðum þeim sem eru > 7 daga gamlir á hverri add.
 *
 * Þetta er aðskilið frá savedResults.ts (sem geymir ÚTKOMUR hvers tóls fyrir
 * sitt í hvoru lagi) — staging er temp-mynd-í-vinnslu, savedResults er það
 * sem notandi vill geta komið til baka í.
 */

import { del, get, keys, set } from "idb-keyval";

export type StagingMediaType = "image" | "video";

export type StagingItem = {
  id: string;
  blob: Blob;
  mediaType: StagingMediaType;
  sourceTool: string;
  sourceToolName?: string;
  prompt?: string;
  name?: string;
  width?: number;
  height?: number;
  createdAt: number;
};

const PREFIX = "kjarni_staging_";
const MAX_ITEMS = 50;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function makeId(): string {
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 10)
  );
}

async function pruneOld(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const allKeys = await keys();
    const stagingKeys = allKeys.filter(
      (k): k is string => typeof k === "string" && k.startsWith(PREFIX),
    );
    if (stagingKeys.length === 0) return;

    const items: Array<{ key: string; createdAt: number }> = [];
    for (const k of stagingKeys) {
      try {
        const stored = (await get(k)) as StagingItem | undefined;
        if (stored && typeof stored.createdAt === "number") {
          items.push({ key: k, createdAt: stored.createdAt });
        } else {
          await del(k);
        }
      } catch {
        await del(k);
      }
    }

    const now = Date.now();
    items.sort((a, b) => b.createdAt - a.createdAt);
    const toDelete: string[] = [];
    for (let i = 0; i < items.length; i++) {
      if (i >= MAX_ITEMS || now - items[i].createdAt > MAX_AGE_MS) {
        toDelete.push(items[i].key);
      }
    }
    for (const k of toDelete) {
      try {
        await del(k);
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    console.warn("pruneOld failed", err);
  }
}

export async function addToStaging(
  blob: Blob,
  meta: Omit<StagingItem, "id" | "blob" | "createdAt">,
): Promise<string> {
  if (typeof window === "undefined") throw new Error("Staging aðeins í vafra");
  const id = makeId();
  const item: StagingItem = {
    id,
    blob,
    createdAt: Date.now(),
    ...meta,
  };
  await set(PREFIX + id, item);
  // Prune in background, don't await.
  void pruneOld();
  return id;
}

export async function getFromStaging(id: string): Promise<StagingItem | null> {
  if (typeof window === "undefined") return null;
  if (!/^[a-z0-9-]+$/i.test(id)) return null;
  try {
    const stored = (await get(PREFIX + id)) as StagingItem | undefined;
    if (!stored || !(stored.blob instanceof Blob) || stored.blob.size === 0) return null;
    return stored;
  } catch (err) {
    console.warn("getFromStaging failed", err);
    return null;
  }
}

export async function listStaging(limit = 20): Promise<StagingItem[]> {
  if (typeof window === "undefined") return [];
  try {
    const allKeys = await keys();
    const stagingKeys = allKeys.filter(
      (k): k is string => typeof k === "string" && k.startsWith(PREFIX),
    );
    const items: StagingItem[] = [];
    for (const k of stagingKeys) {
      try {
        const stored = (await get(k)) as StagingItem | undefined;
        if (stored && stored.blob instanceof Blob && stored.blob.size > 0) {
          items.push(stored);
        }
      } catch {
        /* skip */
      }
    }
    items.sort((a, b) => b.createdAt - a.createdAt);
    return items.slice(0, limit);
  } catch (err) {
    console.warn("listStaging failed", err);
    return [];
  }
}

export async function removeFromStaging(id: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await del(PREFIX + id);
  } catch (err) {
    console.warn("removeFromStaging failed", err);
  }
}

/** Hjálp fyrir client sem fær ?use=<id> param. Sækir blobinn, breytir í
 *  data-URL (sem Replicate-tólin okkar nota) og skilar. Eyðir ekki — notandi
 *  getur fliktað aftur ef hann vill. */
export async function stagingToDataUrl(id: string): Promise<{ dataUrl: string; item: StagingItem } | null> {
  const item = await getFromStaging(id);
  if (!item) return null;
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error || new Error("Gat ekki lesið blob"));
    reader.readAsDataURL(item.blob);
  });
  if (!dataUrl) return null;
  return { dataUrl, item };
}
