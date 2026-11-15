import { del, get, set } from "idb-keyval";
import { erAllarMyndirGeymdar, festaIGeymslu, getAssetBlob, hydrateAssets, putAsset, vistaAssetStadbundid } from "./assets";
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

// Eyðing milli tækja. Borði er mjúk-eytt (deleted=true) en pushBoard skrifar deleted=false — án varnar lifnaði eytt borð
// við í hvert sinn sem ANNAÐ tæki opnaði sitt eintak (t.d. síðasta opna borðið við ræsingu). `eyttISkyi` man að röð opna
// borðsins er eydd í skýinu og hvaða útgáfu hún bar þá; `ovisstUmSky` er borð sem var opnað án þess að skýið svaraði
// (án nets) — fyrsta ýtingin spyr þá fyrst. Hvort tveggja er lyklað á auðkenni, svo ný borð þurfa enga núllstillingu.
let eyttISkyi: { id: string; kl: string } | null = null;
let ovisstUmSky: string | null = null;

/** Er tímastimpill `a` ÖRUGGLEGA nýrri en `b`? Tölulegur samanburður: staðbundin skjöl bera `…Z` en skýið skilar
 * `…+00:00` með styttum sekúndubrotum, svo strengjasamanburður er ónothæfur þvert á þau. Vanti annan eða sé hann
 * óþáttanlegur er svarið nei. */
export function erNyrra(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = a ? Date.parse(a) : NaN;
  const tb = b ? Date.parse(b) : NaN;
  return Number.isFinite(ta) && Number.isFinite(tb) && ta > tb;
}

/** Er `a` ÖRUGGLEGA ekki nýrri en `b` (báðir þekktir og a ≤ b)? Ekki það sama og !erNyrra: óvissa er nei í báðum. */
function erEkkiNyrra(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = a ? Date.parse(a) : NaN;
  const tb = b ? Date.parse(b) : NaN;
  return Number.isFinite(ta) && Number.isFinite(tb) && ta <= tb;
}

function bita<T>(a: T[], n: number): T[][] {
  const ut: T[][] = [];
  for (let i = 0; i < a.length; i += n) ut.push(a.slice(i, i + n));
  return ut;
}

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

// ── „Sækja fyrir offline" ────────────────────────────────────────────────────────────────────────────────────────
// Hnappur í borðalistanum (TopBar) tryggir að tiltekið borð sé TIL FULLS í símanum: doc-ið í IndexedDB OG allar myndir
// þess — bæði teikningamyndin sem borðið sýnir OG þunga frumritið (TIF/PDF) sem greining notar, sem er annars aldrei sótt
// við opnun. Þannig opnast borðið og vinnst án nets, og AI-greining virkar líka ef Agnar nær í hana áður en hann fer.

/** Öll eigna-id borðsins (teikningamyndir + frumrit), án tvítaka. */
export function bordAssetIds(doc: BoardDocument): string[] {
  return [...new Set([...(doc.assetIds ?? []), ...(doc.frumAssetIds ?? [])])];
}

/** Tryggir að blob fyrir ÖLL uppgefin id séu staðbundin (IndexedDB) — sækir úr skýinu það sem vantar. Skrifar óháð
 *  skoðunarham (vistaAssetStadbundid). Skilar þeim id sem náðust ekki (t.d. án nets). */
async function ensureIdsLocal(ids: string[]): Promise<string[]> {
  await hydrateAssets(ids);
  const vantar: string[] = [];
  for (const id of ids) {
    if (getAssetBlob(id)) continue;
    try {
      const res = await fetch(assetPublicUrl(id));
      if (!res.ok) {
        vantar.push(id);
        continue;
      }
      await vistaAssetStadbundid(id, await res.blob());
    } catch {
      vantar.push(id);
    }
  }
  return vantar;
}

/** Nær í doc borðsins til að geyma það án nets — og tryggir að staðbundna eintakið sé NÝJASTA útgáfan. Áður var
 * staðbundna eintakinu skilað óséðu ef það var til, svo „smelltu til að uppfæra" uppfærði aldrei skjalið: tæki sem átti
 * eldra eintak sýndi ✓ en opnaði gömlu útgáfuna án nets. Reglan er sú sama og í openBoardId (LWW): skýið vinnur aðeins
 * ef það er nýrra, svo óýtt vinna á þessu tæki tapast aldrei. Án nets: staðbundna eintakið eins og það er.
 * `uppfaert` = eldra eintaki var skipt út fyrir nýrri útgáfu úr skýinu. */
async function naBordDoc(id: string): Promise<{ doc: BoardDocument | null; uppfaert: boolean }> {
  if (id === currentBoardId) {
    // Opna borðið: minnið er sannleikurinn hér. pullIfNewer dregur nýrri útgáfu úr skýinu (nema óýtt vinna bíði).
    const fyrir = lastUpdatedAt;
    await pullIfNewer();
    let doc = (await get<BoardDocument>(boardKey(id))) ?? null;
    if (!doc) {
      await persistBoard();
      doc = (await get<BoardDocument>(boardKey(id))) ?? null;
    }
    return { doc, uppfaert: lastUpdatedAt !== fyrir };
  }
  const local = (await get<BoardDocument>(boardKey(id))) ?? null;
  const sb = getSupabase();
  if (!sb) return { doc: local, uppfaert: false };
  try {
    if (local?.updatedAt) {
      // Ódýrt fyrst — aðeins tímastimpill raðarinnar; skjalið sjálft er aðeins sótt ef skýið á nýrri útgáfu
      const stutt = sb.from("turbopaint_boards").select("updated_at, deleted").eq("id", id);
      const sig = timeoutSignal(6000);
      const { data } = await (sig ? stutt.abortSignal(sig) : stutt).maybeSingle();
      if (!data || data.deleted || !erNyrra(data.updated_at as string, local.updatedAt)) return { doc: local, uppfaert: false };
    }
    const query = sb.from("turbopaint_boards").select("doc, updated_at, deleted").eq("id", id);
    const sig = timeoutSignal(10000);
    const { data } = await (sig ? query.abortSignal(sig) : query).maybeSingle();
    if (!data || data.deleted) return { doc: local, uppfaert: false };
    const doc = data.doc as BoardDocument;
    const skyKl = doc.updatedAt ?? (data.updated_at as string | undefined) ?? "";
    if (local?.updatedAt && !erNyrra(skyKl, local.updatedAt)) return { doc: local, uppfaert: false };
    await set(boardKey(id), doc);
    return { doc, uppfaert: !!local };
  } catch {
    return { doc: local, uppfaert: false };
  }
}

/** Gerir borð aðgengilegt án nets: sækir doc + allar myndir (líka frumritið) í IndexedDB og man borðið í staðbundna
 *  listanum. `ok` er satt þegar ALLT náðist; `vantar` er fjöldi mynda sem náðust ekki (-1 ef borðið sjálft náðist ekki);
 *  `uppfaert` er satt ef tækið átti eldra eintak sem var skipt út fyrir nýrri útgáfu úr skýinu. */
export async function g_oraBordOfflineTilbuid(id: string): Promise<{ ok: boolean; vantar: number; uppfaert: boolean }> {
  const { doc, uppfaert } = await naBordDoc(id);
  if (!doc) return { ok: false, vantar: -1, uppfaert: false };
  await rememberBoard(
    { id, name: doc.name || "TurboPaint", updatedAt: doc.updatedAt ?? new Date().toISOString() },
    false
  );
  const vantar = await ensureIdsLocal(bordAssetIds(doc));
  return { ok: vantar.length === 0, vantar: vantar.length, uppfaert };
}

/** Staða borðs án nets — hreint staðbundið (ekkert net):
 *  "ja"    = doc og allar myndir geymdar OG eintakið er nýjasta útgáfan sem kallarinn veit um (`nyjastaKl`: updatedAt
 *            borðsins í borðalistanum, sem er sameinaður við skýið);
 *  "eldri" = allt geymt, en skýið á nýrri útgáfu — án nets opnaðist sú eldri (✓ væri þá ósatt);
 *  "nei"   = doc eða myndir vantar. */
export async function offlineStadaBords(id: string, nyjastaKl?: string): Promise<"nei" | "ja" | "eldri"> {
  const doc = await get<BoardDocument>(boardKey(id));
  if (!doc) return "nei";
  if (!(await erAllarMyndirGeymdar(bordAssetIds(doc)))) return "nei";
  return erNyrra(nyjastaKl, doc.updatedAt) ? "eldri" : "ja";
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
    const id = currentBoardId;
    const doc = docFromState();
    // Upsert skrifar deleted=false — borð sem var eytt á öðru tæki myndi lifna við á ÖLLUM tækjum. Var borðið opnað án
    // svars frá skýinu (án nets) er spurt fyrst; sé því eytt þar er aðeins ýtt ef hér er vinna NÝRRI en eydda röðin.
    if (ovisstUmSky === id) {
      const q = sb.from("turbopaint_boards").select("deleted, updated_at").eq("id", id);
      const sig0 = timeoutSignal(6000);
      const { data: rod, error: villa } = await (sig0 ? q.abortSignal(sig0) : q).maybeSingle();
      if (villa) throw villa;
      if (rod?.deleted) eyttISkyi = { id, kl: (rod.updated_at as string) ?? "" };
      ovisstUmSky = null;
    }
    if (eyttISkyi?.id === id) {
      if (!erNyrra(doc.updatedAt, eyttISkyi.kl)) {
        dirtySincePush = false;
        useBoardStore.getState().setSyncState("idle");
        return;
      }
      eyttISkyi = null; // ný vinna eftir eyðinguna: borðið lifnar við MEÐ henni — engin vinna glatast
    }
    await pushAssets(doc);
    const upsert = sb.from("turbopaint_boards").upsert({
      id,
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
      const { data, error } = await (sig ? query.abortSignal(sig) : query).maybeSingle();
      if (error) throw error;
      // Staða raðarinnar í skýinu — pushBoard les hana svo eytt borð lifni ekki við (sjá eyttISkyi)
      if (ovisstUmSky === id) ovisstUmSky = null;
      if (data?.deleted) eyttISkyi = { id, kl: (data.updated_at as string) ?? "" };
      else if (eyttISkyi?.id === id) eyttISkyi = null;
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
      ovisstUmSky = id; // skýið svaraði ekki — fyrsta ýtingin spyr hvort borðinu hafi verið eytt
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
    if (eyttAnnarsStadar(index.currentId)) {
      // Síðasta borðið á þessu tæki var eytt á öðru tæki (og hér er ekkert nýrra) — opna næsta í stað þess að sýna það
      await fjarlaegjaOgOpnaNaesta(index.currentId);
      useBoardStore.getState().setHydrated(true);
      return;
    }
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

/** All boards: local index merged with the cloud list, newest first. Borð sem var eytt á ÖÐRU tæki hverfur líka héðan
 * (hreinsaEyddStadbundid) — annars sæist það áfram í listunum og lifnaði við á öllum tækjum ef það væri opnað. */
export async function listBoards(): Promise<BoardListEntry[]> {
  const index = await readIndex();
  const remote = await fetchRemoteBoards();
  const merged = new Map<string, BoardListEntry>();
  for (const b of index.boards) merged.set(b.id, b);
  for (const entry of remote.rows) {
    const existing = merged.get(entry.id);
    if (!existing || entry.updatedAt > existing.updatedAt) merged.set(entry.id, entry);
    else merged.set(entry.id, { ...existing, remote: true });
  }
  if (remote.ok) {
    const iSkyi = new Set(remote.rows.map((r) => r.id));
    for (const id of await hreinsaEyddStadbundid(index.boards.filter((b) => !iSkyi.has(b.id)))) merged.delete(id);
  }
  return [...merged.values()].sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));
}

/** Staðbundin borð sem eru EYDD í skýinu (deleted=true, eytt á öðru tæki): eintakið og listafærslan eru fjarlægð ef þau
 * geyma ekkert nýrra en eydda röðin. Opna borðið er látið vera (pushBoard ver það) og borð með óýttri vinnu líka.
 * Svari skýið ekki er engu breytt. Skilar auðkennum þess sem var fjarlægt. */
async function hreinsaEyddStadbundid(stadbundin: BoardListEntry[]): Promise<string[]> {
  const sb = getSupabase();
  const kandidatar = stadbundin.filter((b) => b.id !== currentBoardId);
  if (!sb || !kandidatar.length) return [];
  const eydd = new Map<string, string>();
  try {
    for (const hluti of bita(kandidatar.map((b) => b.id), 50)) {
      const q = sb.from("turbopaint_boards").select("id, updated_at").eq("deleted", true).in("id", hluti);
      const sig = timeoutSignal(4000);
      const { data, error } = await (sig ? q.abortSignal(sig) : q);
      if (error) return [];
      for (const r of data ?? []) eydd.set(String(r.id), (r.updated_at as string) ?? "");
    }
  } catch {
    return [];
  }
  const burt: string[] = [];
  for (const b of kandidatar) {
    const kl = eydd.get(b.id);
    if (kl === undefined || !erEkkiNyrra(b.updatedAt, kl)) continue;
    const doc = await get<BoardDocument>(boardKey(b.id));
    if (doc && !erEkkiNyrra(doc.updatedAt, kl)) continue; // óýtt vinna í skjalinu sjálfu → halda
    burt.push(b.id);
  }
  if (!burt.length) return [];
  for (const id of burt) await del(boardKey(id));
  const ids = new Set(burt);
  const index = await readIndex();
  await writeIndex({ ...index, boards: index.boards.filter((b) => !ids.has(b.id)) });
  return burt;
}

export async function switchBoard(id: string) {
  if (id === currentBoardId) return;
  await persistBoard();
  // Úr skoðun yfir í vistað borð: skoðuninni er hent (hún var aldrei skrifuð neitt).
  haettaSkodun();
  useBoardStore.getState().setSyncState("idle");
  await openBoardId(id);
}

/** Tekur við borði ÁN þess að hlaða efni þess eða myndum — fyrir kallara sem endurbyggir borðið strax (úttektaropnun:
 * FloorPlan er sannleikurinn, WhiteboardApp kallar replaceBoard + innflutning beint á eftir). `switchBoard` sótti áður allt
 * gamla efnið og myndir þess til þess eins að henda því. Staðbundið efni telst rétthærra (dirtySincePush) svo pullIfNewer
 * dragi ekki gamla skýjaeintakið yfir borðið á meðan það er byggt upp. */
export async function takaVidBordi(id: string, nafn: string) {
  if (id === currentBoardId) return;
  await persistBoard();
  haettaSkodun();
  installSyncListeners();
  useBoardStore.getState().setSyncState("idle");
  currentBoardId = id;
  lastContentJson = "";
  lastUpdatedAt = "";
  dirtySincePush = true;
  await rememberBoard({ id, name: nafn, updatedAt: new Date().toISOString() }, true);
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

/** Soft-delete the current board (cloud keeps the row with deleted=true). Viðmótið notar eydaBordi (ský fyrst — ekkert
 * breytist ef skýið svarar ekki); þetta fall er eldri leiðin sem eyðir staðbundið þótt skýið náist ekki. */
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
      // offline — skýjaröðin stendur; eydaBordi er leiðin sem tryggir eyðingu á öllum tækjum
    }
  }
  await fjarlaegjaOgOpnaNaesta(id);
}

/** Var opna borðinu eytt á öðru tæki, og geymir þetta tæki ekkert nýrra? (eyttISkyi er sett í openBoardId.) */
function eyttAnnarsStadar(id: string): boolean {
  return eyttISkyi?.id === id && !erNyrra(lastUpdatedAt, eyttISkyi.kl);
}

/** Opna borðið hverfur af ÞESSU tæki (skjal + listafærsla) og næsta borð opnast — skýið er ekki snert hér. Ekkert annað
 * borð: nýtt autt borð. (createBoard vistar fyrst það sem er í minni, og þá yrði eydda borðið til aftur undir nýju
 * auðkenni — sú draugafærsla birtist áður þegar síðasta borðinu var eytt.) */
async function fjarlaegjaOgOpnaNaesta(id: string) {
  if (typeof window !== "undefined") window.clearTimeout(pushTimer);
  await del(boardKey(id));
  const index = await readIndex();
  const rest = index.boards.filter((b) => b.id !== id);
  await writeIndex({ currentId: null, boards: rest });
  currentBoardId = null;
  if (eyttISkyi?.id === id) eyttISkyi = null;
  const next = rest[0];
  if (next) {
    await openBoardId(next.id);
    return;
  }
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
  useBoardStore.getState().setSyncState("idle");
  await persistBoard();
}

/** Staðbundið eintak borðs (IndexedDB) án þess að opna það. Sync-athugunin (sync-saekja.ts) notar það í stað þess að
 * sækja sama skjal úr skýinu þegar útgáfan er sú sama. */
export async function lesaBordDocStadbundid(id: string): Promise<BoardDocument | null> {
  return (await get<BoardDocument>(boardKey(id))) ?? null;
}

/** Eyðir borði eftir auðkenni (Verkefni-forsíðan og „Eyða þessu borði", Agnar 15.11.2026: „ég eyði þá líklegast þeim
 * úreltu"). Mjúk eyðing: röðin stendur í skýinu með deleted=true (og fyrri útgáfur í turbopaint_boards_history).
 * SKÝ FYRST, líka fyrir opna borðið: mistakist ský-eyðingin er ENGU breytt staðbundið — annars kæmi borðið aftur úr
 * skýinu við næstu hleðslu og liti út fyrir að hafa „lifnað við". Opna borðið: ýting sem bíður eða er í gangi (upsert
 * skrifar deleted=false) má ekki lenda á eftir eyðingunni, svo hún er stöðvuð/beðið eftir henni og eyttISkyi lokar á
 * frekari ýtingar á meðan. Á eftir opnast næsta borð. */
export async function eydaBordi(id: string): Promise<void> {
  const opid = id === currentBoardId;
  if (opid && erSkodun()) return;
  const sb = getSupabase();
  if (sb) {
    const fyrri = eyttISkyi;
    if (opid) {
      eyttISkyi = { id, kl: lastUpdatedAt || new Date().toISOString() };
      if (typeof window !== "undefined") window.clearTimeout(pushTimer);
      for (let i = 0; pushInFlight && i < 160; i++) await new Promise((r) => setTimeout(r, 100));
    }
    let villa: unknown = null;
    try {
      const query = sb.from("turbopaint_boards").update({ deleted: true }).eq("id", id);
      const sig = timeoutSignal(8000);
      villa = (await (sig ? query.abortSignal(sig) : query)).error;
    } catch (e) {
      villa = e;
    }
    if (villa) {
      if (opid) {
        eyttISkyi = fyrri;
        if (dirtySincePush) schedulePush(); // óýtt vinna á opna borðinu fer áfram í skýið
      }
      throw new Error("Náði ekki að eyða borðinu í skýinu — reyndu aftur með neti.");
    }
  }
  if (opid) {
    await fjarlaegjaOgOpnaNaesta(id);
    return;
  }
  await del(boardKey(id));
  const index = await readIndex();
  await writeIndex({ ...index, boards: index.boards.filter((b) => b.id !== id) });
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
  useSkodun.setState({ virk: true, titill, slod, grunnur: null, vistar: false, drog: null, uttekt: false });
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

/** Úttektaropnunin (`?uttekt=`) brást áður en hæðin kom á borðið: biðstaðan er lögð niður og síðasta borðið hlaðið eins og
 * við venjulega ræsingu — notandinn situr ekki eftir á tómu „Opna teikningu…“-borði. */
export async function haettaBidOgHlada() {
  if (!erSkodun()) return;
  useBoardStore.getState().setHydrated(false);
  haettaSkodun();
  await loadBoard();
}

/** Skoðun lýkur (vistuð, eða skipt yfir á annað borð) — venjuleg vistun tekur við. */
function haettaSkodun() {
  if (!erSkodun()) return;
  useSkodun.setState({ virk: false, grunnur: null, vistar: false, drog: null, uttekt: false });
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
