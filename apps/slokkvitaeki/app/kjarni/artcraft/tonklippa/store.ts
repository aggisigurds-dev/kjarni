/** Rútínur Tónklippu í tækinu (IndexedDB): lýsingin (bútar, hápunktar, lengd)
 *  og upprunalegu lagaskrárnar. Tækið er alltaf heimildin sem unnið er á —
 *  skýið (sync.ts) er afrit sem fylgir á eftir, svo appið virkar líka án nets. */

import { createStore, del, get, keys, set, type UseStore } from "idb-keyval";
import type { Arrangement } from "./arrange";

export type TrackMeta = {
  id: string;
  name: string;
  duration: number;
  /** Lagaskráin er komin í skýið. */
  cloud?: boolean;
};

export type ProjectRecord = {
  id: string;
  name: string;
  updatedAt: number;
  /** Lengd rútínunnar (sek) — bara til að sýna í listanum. */
  length: number;
  arrangement: Arrangement;
  tracks: TrackMeta[];
  /** `updatedAt` þeirrar útgáfu sem er komin í skýið (vantar = aldrei). */
  syncedAt?: number;
};

let cached: UseStore | null = null;
function store(): UseStore {
  if (typeof indexedDB === "undefined") throw new Error("Vafrinn leyfir ekki vistun (IndexedDB vantar)");
  if (!cached) cached = createStore("kjarni-tonklippa", "kv");
  return cached;
}

const projectKey = (id: string) => `p:${id}`;
const trackKey = (projectId: string, trackId: string) => `t:${projectId}:${trackId}`;
const deletedKey = (id: string) => `d:${id}`;

// Lesa-breyta-skrifa aðgerðir fara í röð, svo sjálfvirk vistun og samstilling
// skrifi ekki yfir hvor aðra.
let chain: Promise<unknown> = Promise.resolve();
function inOrder<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

export function isSynced(rec: ProjectRecord): boolean {
  return rec.syncedAt === rec.updatedAt && rec.tracks.every((t) => t.cloud);
}

export async function listProjects(): Promise<ProjectRecord[]> {
  const s = store();
  const all = (await keys(s)).filter((k): k is string => typeof k === "string" && k.startsWith("p:"));
  const recs = await Promise.all(all.map((k) => get<ProjectRecord>(k, s)));
  return recs.filter((r): r is ProjectRecord => !!r && typeof r.id === "string").sort((a, b) => b.updatedAt - a.updatedAt);
}

export function loadProject(id: string): Promise<ProjectRecord | undefined> {
  return get<ProjectRecord>(projectKey(id), store());
}

/** Skrifar færsluna eins og hún er (notað þegar útgáfa kemur úr skýinu). */
export function putProject(rec: ProjectRecord): Promise<void> {
  return inOrder(() => set(projectKey(rec.id), rec, store()));
}

/** Vistar vinnu notandans; heldur utan um hvað er þegar komið í skýið. */
export function saveProject(next: Omit<ProjectRecord, "syncedAt">): Promise<ProjectRecord> {
  return inOrder(async () => {
    const prev = await loadProject(next.id);
    const inCloud = new Set((prev?.tracks ?? []).filter((t) => t.cloud).map((t) => t.id));
    const rec: ProjectRecord = {
      ...next,
      tracks: next.tracks.map((t) => (inCloud.has(t.id) || t.cloud ? { ...t, cloud: true } : { id: t.id, name: t.name, duration: t.duration })),
      syncedAt: prev?.syncedAt,
    };
    await set(projectKey(rec.id), rec, store());
    return rec;
  });
}

/** Merkir hvað tókst að senda: lögin `uploaded` og (ef ekkert breyttist á meðan) útgáfuna `version`. */
export function markSynced(id: string, version: number, uploaded: string[]): Promise<void> {
  return inOrder(async () => {
    const cur = await loadProject(id);
    if (!cur) return;
    const up = new Set(uploaded);
    await set(
      projectKey(id),
      {
        ...cur,
        tracks: cur.tracks.map((t) => (up.has(t.id) ? { ...t, cloud: true } : t)),
        syncedAt: cur.updatedAt === version ? version : cur.syncedAt,
      } satisfies ProjectRecord,
      store(),
    );
  });
}

export function saveTrackBlob(projectId: string, trackId: string, blob: Blob): Promise<void> {
  return set(trackKey(projectId, trackId), blob, store());
}

export function loadTrackBlob(projectId: string, trackId: string): Promise<Blob | undefined> {
  return get<Blob>(trackKey(projectId, trackId), store());
}

export function deleteTrackBlob(projectId: string, trackId: string): Promise<void> {
  return del(trackKey(projectId, trackId), store());
}

/** Eyðir rútínunni úr tækinu. Með `remember` er eyðingin geymd þar til hún
 *  hefur líka náð í skýið (annars kæmi rútínan aftur við næstu samstillingu). */
export function deleteProject(id: string, remember = false): Promise<void> {
  return inOrder(async () => {
    const s = store();
    const prefix = `t:${id}:`;
    const mine = (await keys(s)).filter((k) => typeof k === "string" && k.startsWith(prefix));
    await Promise.all(mine.map((k) => del(k, s)));
    await del(projectKey(id), s);
    if (remember) await set(deletedKey(id), Date.now(), s);
  });
}

export async function pendingDeletes(): Promise<Array<{ id: string; at: number }>> {
  const s = store();
  const all = (await keys(s)).filter((k): k is string => typeof k === "string" && k.startsWith("d:"));
  const out: Array<{ id: string; at: number }> = [];
  for (const k of all) out.push({ id: k.slice(2), at: (await get<number>(k, s)) ?? Date.now() });
  return out;
}

export function forgetDelete(id: string): Promise<void> {
  return del(deletedKey(id), store());
}
