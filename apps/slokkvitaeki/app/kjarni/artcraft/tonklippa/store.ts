/** Gögn Tónklippu í tækinu (IndexedDB): rútínur, safnið (lög, uppáhaldsbútar,
 *  iðkendur) og skrárnar sjálfar (lög og prófílmyndir). Tækið er alltaf
 *  heimildin sem unnið er á — skýið (sync.ts) er afrit sem fylgir á eftir, svo
 *  appið virkar líka án nets. */

import { createStore, del, get, keys, set, type UseStore } from "idb-keyval";
import type { Arrangement } from "./arrange";
import { emptyDoc, mergeDocs, normalizeDoc, type LibraryDoc } from "./library";

/** Lag í rútínu; `id` er auðkenni lagsins í safninu. */
export type TrackMeta = { id: string; name: string; duration: number };

export type ProjectRecord = {
  id: string;
  name: string;
  updatedAt: number;
  /** Lengd rútínunnar (sek) — bara til að sýna í listanum. */
  length: number;
  arrangement: Arrangement;
  tracks: TrackMeta[];
  /** Iðkandinn sem rútínan er fyrir. */
  skaterId?: string;
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
const songKey = (id: string) => `s:${id}`;
const photoKey = (id: string) => `ph:${id}`;
const deletedKey = (id: string) => `d:${id}`;
const DOC = "doc";
const UPLOADED = "up";

// Lesa-breyta-skrifa aðgerðir fara í röð, svo sjálfvirk vistun og samstilling
// skrifi ekki yfir hvor aðra.
let chain: Promise<unknown> = Promise.resolve();
function inOrder<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

// ------------------------------------------------------------------ rútínur

export function isSynced(rec: ProjectRecord): boolean {
  return rec.syncedAt === rec.updatedAt;
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

/** Vistar vinnu notandans; man hvaða útgáfa er þegar komin í skýið. */
export function saveProject(next: Omit<ProjectRecord, "syncedAt">): Promise<ProjectRecord> {
  return inOrder(async () => {
    const prev = await loadProject(next.id);
    const rec: ProjectRecord = { ...next, syncedAt: prev?.syncedAt };
    await set(projectKey(rec.id), rec, store());
    return rec;
  });
}

/** Merkir útgáfuna `version` sem komna í skýið (ef ekkert breyttist á meðan). */
export function markSynced(id: string, version: number): Promise<void> {
  return inOrder(async () => {
    const cur = await loadProject(id);
    if (!cur || cur.updatedAt !== version) return;
    await set(projectKey(id), { ...cur, syncedAt: version } satisfies ProjectRecord, store());
  });
}

/** Eyðir rútínunni úr tækinu. Með `remember` er eyðingin geymd þar til hún
 *  hefur líka náð í skýið (annars kæmi rútínan aftur við næstu samstillingu). */
export function deleteProject(id: string, remember = false): Promise<void> {
  return inOrder(async () => {
    const s = store();
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

// ------------------------------------------------------------------ safnið

export async function loadDoc(): Promise<LibraryDoc> {
  return normalizeDoc(await get(DOC, store()));
}

/** Sameinar `incoming` við það sem er í tækinu (atriði fyrir atriði, nýjasta
 *  vinnur) og skilar útkomunni. Öll skrif í safnið fara hér í gegn, svo
 *  breyting í appinu og samstilling við skýið skrifi aldrei yfir hvor aðra. */
export function mergeIntoDoc(incoming: LibraryDoc): Promise<LibraryDoc> {
  return inOrder(async () => {
    const s = store();
    const merged = mergeDocs(normalizeDoc(await get(DOC, s)) ?? emptyDoc(), incoming);
    await set(DOC, merged, s);
    return merged;
  });
}

export function saveSongBlob(songId: string, blob: Blob): Promise<void> {
  return set(songKey(songId), blob, store());
}

export function loadSongBlob(songId: string): Promise<Blob | undefined> {
  return get<Blob>(songKey(songId), store());
}

export function deleteSongBlob(songId: string): Promise<void> {
  return del(songKey(songId), store());
}

export type StoredPhoto = { blob: Blob; at: number };

export function savePhoto(skaterId: string, blob: Blob, at: number): Promise<void> {
  return set(photoKey(skaterId), { blob, at } satisfies StoredPhoto, store());
}

export function loadPhoto(skaterId: string): Promise<StoredPhoto | undefined> {
  return get<StoredPhoto>(photoKey(skaterId), store());
}

export function deletePhoto(skaterId: string): Promise<void> {
  return del(photoKey(skaterId), store());
}

/** Skrár sem þetta tæki veit að eru komnar í skýið (slóðir innan skúffunnar). */
export async function loadUploaded(): Promise<Set<string>> {
  return new Set((await get<string[]>(UPLOADED, store())) ?? []);
}

export function changeUploaded(add: string[], remove: string[] = []): Promise<void> {
  return inOrder(async () => {
    const s = store();
    const cur = new Set((await get<string[]>(UPLOADED, s)) ?? []);
    for (const p of add) cur.add(p);
    for (const p of remove) cur.delete(p);
    await set(UPLOADED, [...cur], s);
  });
}
