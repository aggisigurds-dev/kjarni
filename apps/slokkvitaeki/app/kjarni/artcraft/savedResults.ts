/** Vista síðustu Replicate-niðurstöðu í IndexedDB svo hún lifir refresh/navigation.
 *
 * Hvert tól hefur sinn eigin lykil (t.d. "skyjastudio", "tonsmid"). Við
 * vistum Blob(a) + metadata (prompt, timestamp, tool-specific mode) svo
 * tólið geti endurteiknað niðurstöðuna um leið og það hleðist upp.
 *
 * Notum idb-keyval sem er þegar í dependencies — einfaldari API en að
 * handskrifa IDB opnun. Blob-ar farast beint í IDB; URL.createObjectURL
 * verður að kalla aftur eftir restore (object URLs lifa ekki page reload).
 *
 * Skrifum YFIR síðustu niðurstöðu (ekki historíu) — eitt tól = eitt
 * útkomuslot. Ef user vill fulla sögu, bætist það við síðar. */

import { del, get, set } from "idb-keyval";

export type SavedResultMediaType = "image" | "video" | "audio";

export type SavedResult = {
  key: string;
  timestamp: number;
  mediaType: SavedResultMediaType;
  blobs: Blob[];
  prompt?: string;
  mode?: string;
  sourceName?: string;
};

const PREFIX = "kjarni_result_";

export async function saveResult(result: SavedResult): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await set(PREFIX + result.key, result);
  } catch (err) {
    // Kvótaþörf eða IDB bilun — ekki stöðva flæðið, user sér samt
    // útkomuna í þessu session.
    console.warn("saveResult failed", err);
  }
}

export async function loadResult(key: string): Promise<SavedResult | null> {
  if (typeof window === "undefined") return null;
  try {
    const stored = (await get(PREFIX + key)) as SavedResult | undefined;
    if (!stored || !Array.isArray(stored.blobs) || stored.blobs.length === 0) return null;
    // Staðfestum að blobs eru enn gildir — IDB getur skilað „detached" blobs
    // eftir langt uptime; athugum stærð.
    for (const blob of stored.blobs) {
      if (!(blob instanceof Blob) || blob.size === 0) return null;
    }
    return stored;
  } catch (err) {
    console.warn("loadResult failed", err);
    return null;
  }
}

export async function clearResult(key: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await del(PREFIX + key);
  } catch (err) {
    console.warn("clearResult failed", err);
  }
}

export function formatSavedTime(timestamp: number): string {
  const d = new Date(timestamp);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (sameDay) return `kl. ${hh}:${mm}`;
  const dd = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mo}. kl. ${hh}:${mm}`;
}
