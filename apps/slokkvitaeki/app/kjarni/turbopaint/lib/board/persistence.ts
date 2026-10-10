import { del, get, set } from "idb-keyval";
import { festaIGeymslu, getAssetBlob, hydrateAssets, putAsset } from "./assets";
import { createDemoBoard } from "./demo-board";
import { newId } from "./ids";
import { erSkodun, useSkodun, type ThjalfunMerki } from "./skodun";
import { isDuplicateStorageError } from "./storage-errors";
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

// Last-write-wins má ALDREI stimplast á ýtingar-tíma: gömul flipi sem ýtir
// GÖMLU efni fengi þá nýjasta tímastimpilinn og myndi éta nýja vinnu á hinu
// tækinu við næsta pull. updatedAt fylgir því síðustu EFNISbreytingu — og
// ýting gerist bara þegar efnið breyttist í alvöru.
let lastContentJson = "";
let lastUpdatedAt = "";
let dirtySincePush = false;

/** Ský-lestur má ALDREI halda hydration í gíslingu: fetch hefur ekkert
 * sjálfgefið tímamark, svo hangandi net (símkerfi á flakki) myndi annars
 * frysta persist-áskriftina — og allt sem gert er á meðan vistast hvergi. */
function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(ms) : undefined;
}

function contentSnapshot() {
  const state = useBoardStore.getState();
  return JSON.stringify({
    name: state.name,
    objects: state.objects,
    pixelsPerMeter: state.pixelsPerMeter,
    grid: state.grid,
    snap: state.snap,
    layers: state.layers,
    activeLayerId: state.activeLayerId,
  });
}

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
  const frumAssetIds = state.objects
    .filter((o) => o.type === "image")
    .map((o) => (o as Extract<BoardObject, { type: "image" }>).frumAssetId)
    .filter((x): x is string => !!x);
  return {
    version: 2,
    name: state.name,
    objects: state.objects,
    camera: state.camera,
    pixelsPerMeter: state.pixelsPerMeter,
    grid: state.grid,
    snap: state.snap,
    layers: state.layers,
    activeLayerId: state.activeLayerId,
    assetIds: [...new Set(assetIds)],
    frumAssetIds: [...new Set(frumAssetIds)],
    boardId: currentBoardId ?? undefined,
    updatedAt: lastUpdatedAt || new Date().toISOString(),
    syncRev: 2,
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
    layers: doc.layers,
    activeLayerId: doc.activeLayerId,
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

/** Frumskrá teikningar (TIF/PDF í fullri upplausn) — sótt ÞEGAR greining þarf hana, aldrei við opnun borðs.
 * Röð: minni → IndexedDB → skýið. Skilar null ef hún næst hvergi (t.d. án nets). */
export async function saekjaFrum(id: string): Promise<Blob | null> {
  const iMinni = getAssetBlob(id);
  if (iMinni) return iMinni;
  await hydrateAssets([id]);
  const stad = getAssetBlob(id);
  if (stad) return stad;
  try {
    const res = await fetch(assetPublicUrl(id));
    if (!res.ok) return null;
    const blob = await res.blob();
    await putAsset(id, blob);
    return blob;
  } catch {
    return null;
  }
}

async function loadUploadedSet() {
  if (!uploadedAssets) {
    uploadedAssets = new Set((await get<string[]>(UPLOADED_KEY)) ?? []);
  }
  return uploadedAssets;
}

/** Er eignin þegar í fötunni? HEAD á opinberu slóðina (engin bæti sótt). Föst auðkenni (eignalykill.ts) — sama teikning
 * opnuð aftur, á öðru tæki eða í öðrum vafra — eru þar þegar; borð sem kom úr skýinu líka. Óvissa (net) = nei, þá er
 * hlaðið upp eins og áður (upsert á sömu slóð bætir engri skrá við). */
async function erIFotu(id: string): Promise<boolean> {
  try {
    const sig = timeoutSignal(6000);
    const res = await fetch(assetPublicUrl(id), { method: "HEAD", cache: "no-store", ...(sig ? { signal: sig } : {}) });
    return res.ok;
  } catch {
    return false;
  }
}

async function pushAssets(doc: BoardDocument) {
  const sb = getSupabase();
  if (!sb) return;
  const uploaded = await loadUploadedSet();
  for (const id of new Set([...(doc.assetIds ?? []), ...(doc.frumAssetIds ?? [])])) {
    if (uploaded.has(id)) continue;
    const blob = getAssetBlob(id);
    if (!blob) continue;
    // Lifandi prófun 07.10.2026: hver opnun úttektarborðs hlóð teikningunni upp aftur (~17 MB). Nú: sé skráin þegar
    // í fötunni er hún aðeins skráð sem upphlaðin.
    if (await erIFotu(id)) {
      uploaded.add(id);
      await set(UPLOADED_KEY, [...uploaded]);
      continue;
    }
    const { error } = await sb.storage.from("turbopaint").upload(`${id}.png`, blob, {
      contentType: blob.type || "image/png",
      upsert: true,
    });
    // Duplicate (HTTP 400 + body 409 KeyAlreadyExists) er ekki villa — myndin
    // er þegar í bucketinu. Innflutningurinn er þá þegar á borðinu; ský-villa
    // má ekki líta út eins og PDF hafi mistekist.
    if (!error || isDuplicateStorageError(error)) {
      uploaded.add(id);
      await set(UPLOADED_KEY, [...uploaded]);
    } else {
      throw error;
    }
  }
}

async function pushBoard() {
  // Skoðun: ekkert fer í skýið (hvorki borð né mynd) — fyrr en „Vista sem borð".
  if (erSkodun()) return;
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
    const upsert = sb.from("turbopaint_boards").upsert({
      id: currentBoardId,
      name: doc.name,
      doc,
      deleted: false,
      updated_at: doc.updatedAt,
    });
    const sig = timeoutSignal(15000);
    const { error } = await (sig ? upsert.abortSignal(sig) : upsert);
    if (error) throw error;
    dirtySincePush = false;
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
  if (typeof window === "undefined" || erSkodun()) return;
  window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => void pushBoard(), 2500);
}

/** Pull the current board from the cloud if a newer copy exists there. */
export async function pullIfNewer() {
  const sb = getSupabase();
  if (!sb || !currentBoardId || pushInFlight || erSkodun()) return;
  // Óstaðfestar breytingar á þessu tæki eru rétthærri — aldrei draga skýið
  // yfir vinnu sem hefur ekki náð að ýtast ("datt allt út"-veilan).
  if (dirtySincePush) return;
  try {
    const query = sb
      .from("turbopaint_boards")
      .select("doc, updated_at, deleted")
      .eq("id", currentBoardId);
    const sig = timeoutSignal(6000);
    const { data } = await (sig ? query.abortSignal(sig) : query).maybeSingle();
    if (!data || data.deleted) return;
    const remoteDoc = data.doc as BoardDocument;
    // Ýting frá GÖMLUM klient (ekkert syncRev = stimplar á ýtingar-tíma og
    // vinnur LWW ranglega) fær aldrei að draga sig yfir borð sem þetta tæki
    // heldur þegar á — t.d. sími með óendurhlaðinn flipa.
    if (!remoteDoc.syncRev) return;
    const local = await get<BoardDocument>(boardKey(currentBoardId));
    const localTime = local?.updatedAt ?? "";
    const remoteTime = remoteDoc.updatedAt ?? (data.updated_at as string) ?? "";
    if (remoteTime && remoteTime > localTime) {
      await ensureAssetsLocal(remoteDoc);
      applyDoc(remoteDoc);
      await set(boardKey(currentBoardId), remoteDoc);
      lastContentJson = contentSnapshot();
      lastUpdatedAt = remoteTime;
      dirtySincePush = false;
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
  let applied = local;
  const sb = getSupabase();
  if (sb) {
    try {
      const query = sb
        .from("turbopaint_boards")
        .select("doc, updated_at, deleted")
        .eq("id", id);
      const sig = timeoutSignal(6000);
      const { data } = await (sig ? query.abortSignal(sig) : query).maybeSingle();
      const remoteDoc = (data && !data.deleted ? (data.doc as BoardDocument) : null) ?? null;
      const remoteTime = remoteDoc?.updatedAt ?? (data?.updated_at as string | undefined) ?? "";
      if (remoteDoc && (!local || remoteTime > (local.updatedAt ?? ""))) {
        await ensureAssetsLocal(remoteDoc);
        applyDoc(remoteDoc);
        await set(boardKey(id), remoteDoc);
        applied = remoteDoc;
        useBoardStore.getState().setSyncState("synced");
      }
    } catch {
      useBoardStore.getState().setSyncState("error");
    }
  }
  // Grunnlína fyrir efnis-samanburðinn: það sem var opnað. Ef local var nýrra
  // en skýið heldur það SÍNUM updatedAt og ýtist með honum.
  lastContentJson = contentSnapshot();
  lastUpdatedAt = applied?.updatedAt ?? new Date().toISOString();
  dirtySincePush = false;
  if (sb && applied === local && local) {
    dirtySincePush = true;
    schedulePush();
  }
  const state = useBoardStore.getState();
  await rememberBoard({ id, name: state.name, updatedAt: lastUpdatedAt }, true);
}

export async function loadBoard() {
  // Skoðun opnar ekkert borð — síðasta borðið (og borðalistinn) er látið ósnert.
  if (erSkodun()) return;
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

  // Ekkert borð til staðar — reyna borð úr skýinu.
  const remote = await fetchRemoteBoards();
  if (remote.rows[0]) {
    await openBoardId(remote.rows[0].id);
    useBoardStore.getState().setHydrated(true);
    return;
  }
  if (!remote.ok) {
    // Skýið næst ekki í augnablikinu — ALDREI sá demo-borðið yfir (borðin
    // hans gætu verið þar); tómt borð þar til tenging næst.
    currentBoardId = newId();
    lastContentJson = "";
    lastUpdatedAt = "";
    dirtySincePush = false;
    useBoardStore.getState().replaceBoard({
      name: "Nýtt borð",
      objects: [],
      camera: { x: 80, y: 80, scale: 1 },
      pixelsPerMeter: null,
      grid: true,
      snap: true,
    });
    await persistBoard();
    useBoardStore.getState().setSyncState("error");
    useBoardStore.getState().setHydrated(true);
    return;
  }
  const objects = await createDemoBoard();
  currentBoardId = newId();
  lastContentJson = "";
  lastUpdatedAt = "";
  dirtySincePush = false;
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
  // Skoðun: borðið er AÐEINS í minni — engin IndexedDB-færsla, enginn borðalisti, engin ský-ýting.
  if (erSkodun()) return;
  if (!currentBoardId) currentBoardId = newId();
  const content = contentSnapshot();
  const changed = content !== lastContentJson;
  if (changed) {
    lastContentJson = content;
    lastUpdatedAt = new Date().toISOString();
    dirtySincePush = true;
  }
  const doc = docFromState();
  await set(boardKey(currentBoardId), doc);
  await rememberBoard(
    { id: currentBoardId, name: doc.name, updatedAt: doc.updatedAt ?? "" },
    true
  );
  // Camera-hreyfing ein og sér ýtir ekki í skýið og bumpar ekki updatedAt —
  // annars myndi iðjulaus flipi vinna LWW-kapphlaupið með gömlu efni.
  if (changed) schedulePush();
}

async function fetchRemoteBoards(): Promise<{ rows: BoardListEntry[]; ok: boolean }> {
  const sb = getSupabase();
  if (!sb) return { rows: [], ok: true };
  try {
    const query = sb
      .from("turbopaint_boards")
      .select("id, name, updated_at")
      .eq("deleted", false)
      .order("updated_at", { ascending: false })
      .limit(100);
    const sig = timeoutSignal(4000);
    const { data, error } = await (sig ? query.abortSignal(sig) : query);
    if (error) throw error;
    return {
      ok: true,
      rows: (data ?? []).map((row) => ({
        id: row.id as string,
        name: row.name as string,
        updatedAt: (row.updated_at as string) ?? "",
        remote: true,
      })),
    };
  } catch {
    return { rows: [], ok: false };
  }
}

/** Borðin á ÞESSU tæki, samstundis — engin ský-bið. Borðavalið birtir þetta
 * strax og skiptir svo yfir í sameinaða listann þegar skýið svarar. */
export async function listBoardsLocal(): Promise<BoardListEntry[]> {
  const index = await readIndex();
  return [...index.boards].sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));
}

/** All boards: local index merged with the cloud list, newest first. */
export async function listBoards(): Promise<BoardListEntry[]> {
  const index = await readIndex();
  const merged = new Map<string, BoardListEntry>();
  for (const b of index.boards) merged.set(b.id, b);
  for (const entry of (await fetchRemoteBoards()).rows) {
    const existing = merged.get(entry.id);
    if (!existing || entry.updatedAt > existing.updatedAt) merged.set(entry.id, entry);
    else merged.set(entry.id, { ...existing, remote: true });
  }
  return [...merged.values()].sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));
}

export async function switchBoard(id: string) {
  if (id === currentBoardId) return;
  await persistBoard();
  // Úr skoðun yfir í vistað borð: skoðuninni er hent (hún var aldrei skrifuð neitt).
  haettaSkodun();
  useBoardStore.getState().setSyncState("idle");
  await openBoardId(id);
}

export async function createBoard(name = "Nýtt borð") {
  await persistBoard();
  haettaSkodun();
  currentBoardId = newId();
  lastContentJson = "";
  lastUpdatedAt = "";
  dirtySincePush = false;
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
  if (!id || erSkodun()) return;
  const sb = getSupabase();
  if (sb) {
    try {
      const query = sb.from("turbopaint_boards").update({ deleted: true }).eq("id", id);
      const sig = timeoutSignal(6000);
      await (sig ? query.abortSignal(sig) : query);
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

// ── Skoðunarhamur (skodun.ts) ─────────────────────────────────────────────────────────────────────────────────────
// Teikning opnuð til skoðunar (`?skoda=`): ekkert borð er opnað eða búið til, ekkert fer í IndexedDB né skýið. Allir
// skrif-staðir hér að ofan (persistBoard, schedulePush, pushBoard, loadBoard, deleteCurrentBoard) og putAsset/deleteAsset
// í assets.ts lesa erSkodun() og gera ekkert. Lokun/endurhleðsla = ekkert eftir.

/** Opnar tómt skoðunarborð í minni. Síðasta borðið, borðalistinn og samstillingin eru ósnert. */
export function opnaSkodun(titill: string, slod: string) {
  useSkodun.setState({ virk: true, titill, slod, grunnur: null, vistar: false, drog: null });
  if (typeof window !== "undefined") window.clearTimeout(pushTimer);
  currentBoardId = null;
  lastContentJson = "";
  lastUpdatedAt = "";
  dirtySincePush = false;
  useBoardStore.getState().replaceBoard({
    name: titill,
    objects: [],
    camera: { x: 80, y: 80, scale: 1 },
    pixelsPerMeter: null,
    grid: true,
    snap: true,
  });
  useBoardStore.getState().setSyncState("idle");
  useBoardStore.getState().setHydrated(true);
}

/** Skoðun lýkur (vistuð, eða skipt yfir á annað borð) — venjuleg vistun tekur við. */
function haettaSkodun() {
  if (!erSkodun()) return;
  useSkodun.setState({ virk: false, grunnur: null, vistar: false, drog: null });
  installSyncListeners();
}

/** „Vista sem borð": skoðunin verður venjulegt borð — SAMA leið og nýtt borð + innflutningur: myndirnar í IndexedDB,
 * borðið í IndexedDB og borðalistann (persistBoard), svo upphleðsla mynda í geymsluna og upsert í turbopaint_boards
 * (pushBoard). Ýtt strax (ekki eftir 2,5 s) svo „Vistað" þýði vistað. Skilar auðkenni nýja borðsins. */
export async function vistaSkodunSemBord(): Promise<{ id: string; sky: "synced" | "error" | "idle" | "saving" }> {
  if (!erSkodun()) throw new Error("Ekki í skoðun");
  useSkodun.setState({ vistar: true });
  try {
    const myndir = useBoardStore
      .getState()
      .objects.filter((o): o is Extract<BoardObject, { type: "image" }> => o.type === "image");
    await festaIGeymslu([
      ...myndir.map((o) => o.assetId),
      ...myndir.map((o) => o.frumAssetId).filter((x): x is string => !!x),
    ]);
    // Opnað með drögum (#drog=): teikningin fær merkið `thjalfun` — yfirfarin drög = þjálfunargögn veggjavélarinnar
    // (raun_saekja.js les það). Án draga er ekkert merkt.
    const drog = useSkodun.getState().drog;
    if (drog && myndir.some((o) => o.id === drog.planId)) {
      const merki: ThjalfunMerki = { drog: drog.fingur, yfirfarid: true, kl: new Date().toISOString() };
      useBoardStore.getState().patchObject(drog.planId, { thjalfun: merki } as Partial<BoardObject>, false);
    }
    haettaSkodun();
    const id = newId();
    currentBoardId = id;
    lastContentJson = "";
    lastUpdatedAt = "";
    dirtySincePush = false;
    await persistBoard();
    if (typeof window !== "undefined") window.clearTimeout(pushTimer);
    await pushBoard();
    return { id, sky: useBoardStore.getState().syncState };
  } finally {
    useSkodun.setState({ vistar: false });
  }
}

let saveTimer: number | undefined;

export function schedulePersist() {
  if (typeof window === "undefined" || erSkodun()) return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    void persistBoard();
  }, 700);
}
