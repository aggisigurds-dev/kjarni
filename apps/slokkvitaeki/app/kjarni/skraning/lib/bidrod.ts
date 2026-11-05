/* Biðröð (outbox) fyrir nýja punkta þegar síminn er sambandslaus á verkstað.
 * Punkturinn + myndirnar (blob) fara í IndexedDB; sendast þegar netið kemur aftur (online-atburður,
 * síðuopnun eða „Senda núna"). Aðeins NÝIR punktar — breytingar á eldri punktum krefjast nets. */

export type BidPunktur = {
  id: string;                 // staðbundið auðkenni
  verk_id: number;
  teikning_id: number;
  x_px: number;
  y_px: number;
  flokkur_id: number;
  efni: number[];
  lysing: string | null;
  starfsm: string;            // númer starfsmanns (localStorage)
  myndir: { blob: Blob; name: string; lastModified: number }[];
  stofnad: string;            // ISO
  villa?: string;             // síðasta villa við sendingu
};

const DB = "skr_bidrod", STORE = "punktar";

function opna(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE, { keyPath: "id" }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return opna().then((db) => new Promise<T>((res, rej) => {
    const t = db.transaction(STORE, mode); const rq = fn(t.objectStore(STORE));
    rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
    t.oncomplete = () => db.close();
  }));
}

export const bidrod = {
  async oll(): Promise<BidPunktur[]> { try { return (await tx<BidPunktur[]>("readonly", (s) => s.getAll())) || []; } catch { return []; } },
  async setja(p: BidPunktur) { await tx("readwrite", (s) => s.put(p)); },
  async eyda(id: string) { await tx("readwrite", (s) => s.delete(id)); },
  async fjoldi(): Promise<number> { try { return await tx<number>("readonly", (s) => s.count()); } catch { return 0; } },
  studd(): boolean { return typeof indexedDB !== "undefined"; },
};

/** Er villan net-tengd (frekar en t.d. gagnavilla)? Þá á punkturinn heima í biðröðinni. */
export function erNetvilla(e: unknown): boolean {
  const m = String((e as Error)?.message || e || "").toLowerCase();
  return !navigator.onLine || m.includes("failed to fetch") || m.includes("networkerror") || m.includes("network request failed") || m.includes("load failed") || m.includes("timeout");
}
