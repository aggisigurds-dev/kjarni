import { del, get, set } from "idb-keyval";
import { getAssetBlob, hydrateAssets, putAsset } from "./assets";
import { createDemoBoard } from "./demo-board";
import { newId } from "./ids";
import { assetPublicUrl, getSupabase } from "./supabase";
import { useBoardStore } from "./store";
import type { BoardDocument, BoardObject } from "./types";

// Per-board local persistence + last-write-wins cloud sync (turbopaint_boards).
// Local IndexedDB is the source of truth while editing; the cloud copy is a
// mirror so the same boards open on every device.

const LEGACY_DOC_KEY = "kjarni-board-v1";
const INDEX_KEY = "tp-index-v1";
const UPLOADED_KEY = "tp-uploaded-v1";

const boardKey = (id: string) => `tp-board-v1:${id}`;

export interface BoardListEntry {
  id: string;
  name: string;
  updatedAt: string;
  remote?: boolean;
}

interface BoardIndex {
  currentId: string | null;
  boards: BoardListEntry[];
}

let currentBoardId: string | null = null;
let uploadedAssets: Set<string> | null = null;
let pushTimer: number | undefined;
let pushInFlight = false;
let pushAgain = false;
let listenersInstalled = false;

export function getCurrentBoardId() {
  return currentBoardId;
}

/** v1 boards locked imported pages; unlock them once so they can be dragged. */
export function migrateBoardObjects(objects: BoardObject[]): BoardObject[] {
  return objects.map((obj) => (obj.type === "image" && obj.locked ? { ...obj, locked: false } : obj));
}

async function readIndex(): Promise<BoardIndex> {
  return (await get<BoardIndex>(INDEX_KEY)) ?? { currentId: null, boards: [] };
}

async function writeIndex(index: BoardIndex) {
  await set(INDEX_KEY, index);
}

async function rememberBoard(entry: BoardListEntry, makeCurrent: boolean) {
  const index = await readIndex();
  const rest = index.boards.filter((b) => b.id !== entry.id);
  await writeIndex({
    currentId: makeCurrent ? entry.id : index.currentId,
    boards: [entry, ...rest],
  });
}

function docFromState(): BoardDocument {
  const state = useBoardStore.getState();
  const assetIds = state.objects
    .filter((o) => o.type === "image")
    .map((o) => (o as Extract<BoardObject, { type: "image" }>).assetId);
  return {
    version: 2,
    name: state.name,
    objects: state.objects,
    camera: state.camera,
    pixelsPerMeter: state.pixelsPerMeter,
    grid: state.grid,
    snap: state.snap,
    assetIds: [...new Set(assetIds)],
    boardId: currentBoardId ?? undefined,
    updatedAt: new Date().toISOString(),
  };
}

function applyDoc(doc: BoardDocument) {
  useBoardStore.getState().replaceBoard({
    name: doc.name || "TurboPaint",
    objects: (doc.version ?? 1) < 2 ? migrateBoardObjects(doc.objects) : doc.objects,
    camera: doc.camera,
    pixelsPerMeter: doc.pixelsPerMeter,
    grid: doc.grid ?? true,
    snap: doc.snap ?? true,
  });
}

async function ensureAssetsLocal(doc: BoardDocument) {
  const ids = doc.assetIds ?? [];
  await hydrateAssets(ids);
  const missing = ids.filter((id) => !getAssetBlob(id));
  for (const id of missing) {
    try {
      const res = await fetch(assetPublicUrl(id));
      if (!res.ok) continue;
      await putAsset(id, await res.blob());
    } catch {
      // offline — the plan renders when the asset next syncs
    }
  }
}

async function loadUploadedSet() {
  if (!uploadedAssets) {
    uploadedAssets = new Set((await get<string[]>(UPLOADED_KEY)) ?? []);
  }
  return uploadedAssets;
}

async function pushAssets(doc: BoardDocument) {
  const sb = getSupabase();
  if (!sb) return;
  const uploaded = await loadUploadedSet();
  for (const id of doc.assetIds ?? []) {
    if (uploaded.has(id)) continue;
    const blob = getAssetBlob(id);
    if (!blob) continue;
    const { error } = await sb.storage
      .from("turbopaint")
      .upload(`${id}.png`, blob, { contentType: blob.type || "image/png", upsert: false });
    // "already exists" telst upphlaðið — asset eru ódauðanleg per id.
    if (!error || `${error.message}`.toLowerCase().includes("exist")) {
      uploaded.add(id);
      await set(UPLOADED_KEY, [...uploaded]);
    } else {
      throw error;
    }
  }
}

async function pushBoard() {
  const sb = getSupabase();
  if (!sb || !currentBoardId) return;
  if (pushInFlight) {
    pushAgain = true;
    return;
  }
  pushInFlight = true;
  useBoardStore.getState().setSyncState("saving");
  try {
    const doc = docFromState();
    await pushAssets(doc);
    const { error } = await sb.from("turbopaint_boards").upsert({
      id: currentBoardId,
      name: doc.name,
      doc,
      deleted: false,
      updated_at: doc.updatedAt,
    });
    if (error) throw error;
    useBoardStore.getState().setSyncState("synced");
  } catch {
    useBoardStore.getState().setSyncState("error");
  } finally {
    pushInFlight = false;
    if (pushAgain) {
      pushAgain = false;
      schedulePush();
    }
  }
}

function schedulePush() {
  if (typeof window === "undefined") return;
  window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => void pushBoard(), 2500);
}

/** Pull the current board from the cloud if a newer copy exists there. */
export async function pullIfNewer() {
  const sb = getSupabase();
  if (!sb || !currentBoardId || pushInFlight) return;
  try {
    const { data } = await sb
      .from("turbopaint_boards")
      .select("doc, updated_at, deleted")
      .eq("id", currentBoardId)
      .maybeSingle();
    if (!data || data.deleted) return;
    const remoteDoc = data.doc as BoardDocument;
    const local = await get<BoardDocument>(boardKey(currentBoardId));
    const localTime = local?.updatedAt ?? "";
    const remoteTime = remoteDoc.updatedAt ?? (data.updated_at as string) ?? "";
    if (remoteTime && remoteTime > localTime) {
      await ensureAssetsLocal(remoteDoc);
      applyDoc(remoteDoc);
      await set(boardKey(currentBoardId), remoteDoc);
      useBoardStore.getState().setSyncState("synced");
    }
  } catch {
    // quiet — next focus/persist retries
  }
}

function installSyncListeners() {
  if (listenersInstalled || typeof window === "undefined") return;
  listenersInstalled = true;
  window.addEventListener("online", () => {
    void pushBoard();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void pullIfNewer();
  });
}

async function openBoardId(id: string, fallbackDoc?: BoardDocument) {
  currentBoardId = id;
  const local = (await get<BoardDocument>(boardKey(id))) ?? fallbackDoc ?? null;
  if (local) {
    await ensureAssetsLocal(local);
    applyDoc(local);
  }
  const sb = getSupabase();
  if (sb) {
    try {
      const { data } = await sb
        .from("turbopaint_boards")
        .select("doc, updated_at, deleted")
        .eq("id", id)
        .maybeSingle();
      const remoteDoc = (data && !data.deleted ? (data.doc as BoardDocument) : null) ?? null;
      const remoteTime = remoteDoc?.updatedAt ?? (data?.updated_at as string | undefined) ?? "";
      if (remoteDoc && (!local || remoteTime > (local.updatedAt ?? ""))) {
        await ensureAssetsLocal(remoteDoc);
        applyDoc(remoteDoc);
        await set(boardKey(id), remoteDoc);
        useBoardStore.getState().setSyncState("synced");
      } else if (local) {
        schedulePush();
      }
    } catch {
      useBoardStore.getState().setSyncState("error");
    }
  }
  const state = useBoardStore.getState();
  await rememberBoard(
    { id, name: state.name, updatedAt: new Date().toISOString() },
    true
  );
}

export async function loadBoard() {
  installSyncListeners();
  const index = await readIndex();

  // Eldri uppsetning: eitt borð undir gamla lyklinum → verður fyrsta borðið.
  if (!index.boards.length) {
    const legacy = await get<BoardDocument>(LEGACY_DOC_KEY);
    if (legacy?.objects?.length) {
      const id = newId();
      legacy.boardId = id;
      legacy.updatedAt = legacy.updatedAt ?? new Date().toISOString();
      await set(boardKey(id), legacy);
      await rememberBoard({ id, name: legacy.name, updatedAt: legacy.updatedAt }, true);
      await del(LEGACY_DOC_KEY);
      await openBoardId(id, legacy);
      useBoardStore.getState().setHydrated(true);
      return;
    }
  }

  if (index.currentId) {
    await openBoardId(index.currentId);
    if (useBoardStore.getState().objects.length || (await get(boardKey(index.currentId)))) {
      useBoardStore.getState().setHydrated(true);
      return;
    }
  }

  // Ekkert borð til staðar (fyrsta ræsing) — reyna borð úr skýinu, annars demo.
  const remote = await listBoards();
  const newest = remote.find((b) => b.remote);
  if (newest) {
    await openBoardId(newest.id);
    useBoardStore.getState().setHydrated(true);
    return;
  }
  const objects = await createDemoBoard();
  currentBoardId = newId();
  useBoardStore.getState().replaceBoard({
    name: "Helluhraun 10 · 2. hæð",
    objects,
    camera: { x: 40, y: 48, scale: 0.55 },
    pixelsPerMeter: null,
    grid: true,
    snap: true,
  });
  await persistBoard();
  await rememberBoard(
    { id: currentBoardId, name: "Helluhraun 10 · 2. hæð", updatedAt: new Date().toISOString() },
    true
  );
  useBoardStore.getState().setHydrated(true);
}

export async function persistBoard() {
  if (!currentBoardId) currentBoardId = newId();
  const doc = docFromState();
  await set(boardKey(currentBoardId), doc);
  await rememberBoard(
    { id: currentBoardId, name: doc.name, updatedAt: doc.updatedAt ?? "" },
    true
  );
  schedulePush();
}

/** All boards: local index merged with the cloud list, newest first. */
export async function listBoards(): Promise<BoardListEntry[]> {
  const index = await readIndex();
  const merged = new Map<string, BoardListEntry>();
  for (const b of index.boards) merged.set(b.id, b);
  const sb = getSupabase();
  if (sb) {
    try {
      const { data } = await sb
        .from("turbopaint_boards")
        .select("id, name, updated_at")
        .eq("deleted", false)
        .order("updated_at", { ascending: false })
        .limit(100);
      for (const row of data ?? []) {
        const existing = merged.get(row.id);
        const entry: BoardListEntry = {
          id: row.id,
          name: row.name,
          updatedAt: (row.updated_at as string) ?? "",
          remote: true,
        };
        if (!existing || entry.updatedAt > existing.updatedAt) merged.set(row.id, entry);
        else merged.set(row.id, { ...existing, remote: true });
      }
    } catch {
      // offline — local list only
    }
  }
  return [...merged.values()].sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));
}

export async function switchBoard(id: string) {
  if (id === currentBoardId) return;
  await persistBoard();
  useBoardStore.getState().setSyncState("idle");
  await openBoardId(id);
}

export async function createBoard(name = "Nýtt borð") {
  await persistBoard();
  currentBoardId = newId();
  useBoardStore.getState().replaceBoard({
    name,
    objects: [],
    camera: { x: 80, y: 80, scale: 1 },
    pixelsPerMeter: null,
    grid: true,
    snap: true,
  });
  useBoardStore.getState().setSyncState("idle");
  await persistBoard();
}

/** Soft-delete the current board (cloud keeps the row with deleted=true). */
export async function deleteCurrentBoard() {
  const id = currentBoardId;
  if (!id) return;
  const sb = getSupabase();
  if (sb) {
    try {
      await sb.from("turbopaint_boards").update({ deleted: true }).eq("id", id);
    } catch {
      // offline — row hverfur úr listanum næst þegar eyðingin nær í gegn
    }
  }
  await del(boardKey(id));
  const index = await readIndex();
  const rest = index.boards.filter((b) => b.id !== id);
  await writeIndex({ currentId: null, boards: rest });
  currentBoardId = null;
  const next = rest[0];
  if (next) {
    await openBoardId(next.id);
  } else {
    await createBoard();
  }
}

export async function resetBoard() {
  const objects = await createDemoBoard();
  useBoardStore.getState().replaceBoard({
    name: "Nýtt TurboPaint borð",
    objects,
    camera: { x: 40, y: 48, scale: 0.55 },
    pixelsPerMeter: null,
    grid: true,
    snap: true,
  });
  await persistBoard();
}

export async function clearBoard() {
  useBoardStore.getState().replaceBoard({
    name: "Nýtt borð",
    objects: [],
    camera: { x: 80, y: 80, scale: 1 },
    pixelsPerMeter: null,
    grid: true,
    snap: true,
  });
  await persistBoard();
}

let saveTimer: number | undefined;

export function schedulePersist() {
  if (typeof window === "undefined") return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    void persistBoard();
  }, 700);
}
