/* Táknastillingar sem gilda á ÖLLUM borðum.
 *
 * Agnar 2026-08-29, spurður beint hvort stillingarnar ættu að fylgja hverju
 * borði: „látum það bara vera sameiginlegt á öllum borðum." Borðin sjálf berast
 * milli tækja gegnum turbopaint_boards, svo stillingarnar gera það líka — annars
 * væru þær ólíkar eftir vél og það kæmi á óvart.
 *
 * Geymsla: idb-keyval fyrir strax-lestur (svo slá og borð teiknist rétt í fyrstu
 * umferð, án netbiðar) + turbopaint_settings í Supabase fyrir samstillingu.
 * Last-write-wins á updated_at, sama og borðin. Eigin myndir fara í sama public
 * bucket og planmyndirnar (`turbopaint`), svo þær sjáist á öllum tækjum — data-URL
 * í jsonb hefði bólgnað skjalið og aldrei skalast.
 */

import { get, set } from "idb-keyval";
import { getSupabase } from "./supabase";

export type SymbolFit = "contain" | "cover";

export interface SymbolOverride {
  /** Falið úr táknaslánni. Tákn sem þegar eru á borði hverfa EKKI. */
  hidden?: boolean;
  /** Slóð á eigin mynd í `turbopaint` bucketinu. Vantar → innbyggða teikningin. */
  imageUrl?: string;
  /** Hvernig eigin mynd fyllir reitinn. contain = öll myndin sést (sjálfgefið). */
  fit?: SymbolFit;
}

export interface SymbolSettings {
  overrides: Record<string, SymbolOverride>;
  updatedAt?: string;
}

const IDB_KEY = "turbopaint:symbol-settings";
const ROW_ID = "global";

const EMPTY: SymbolSettings = { overrides: {} };

let cache: SymbolSettings = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* einn hlustandi má ekki fella hina */
    }
  });
}

export function subscribeSymbolSettings(fn: () => void): () => void {
  listeners.add(fn);
  // Skilar VOID viljandi: React useEffect tekur ekki við hreinsifalli sem skilar
  // gildi, og Set.delete skilar boolean.
  return () => {
    listeners.delete(fn);
  };
}

/** Núverandi stillingar — alltaf samstundis, aldrei loforð. */
export function getSymbolSettings(): SymbolSettings {
  return cache;
}

export function symbolOverride(id: string): SymbolOverride {
  return cache.overrides[id] ?? {};
}

export function isSymbolHidden(id: string): boolean {
  return symbolOverride(id).hidden === true;
}

function sanitize(doc: unknown): SymbolSettings {
  if (!doc || typeof doc !== "object") return EMPTY;
  const raw = (doc as { symbols?: unknown }).symbols ?? doc;
  const overrides: Record<string, SymbolOverride> = {};
  const src = (raw as { overrides?: unknown })?.overrides;
  if (src && typeof src === "object") {
    for (const [id, v] of Object.entries(src as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const o = v as SymbolOverride;
      const next: SymbolOverride = {};
      if (o.hidden === true) next.hidden = true;
      if (typeof o.imageUrl === "string" && o.imageUrl) next.imageUrl = o.imageUrl;
      if (o.fit === "cover" || o.fit === "contain") next.fit = o.fit;
      if (Object.keys(next).length) overrides[id] = next;
    }
  }
  const updatedAt = (raw as { updatedAt?: unknown })?.updatedAt;
  return { overrides, updatedAt: typeof updatedAt === "string" ? updatedAt : undefined };
}

/** Les úr idb strax, sækir svo úr Supabase og uppfærir ef nýrra. */
export async function loadSymbolSettings(): Promise<SymbolSettings> {
  if (typeof window === "undefined") return EMPTY;
  if (!loaded) {
    loaded = true;
    try {
      const local = await get<SymbolSettings>(IDB_KEY);
      if (local) {
        cache = sanitize(local);
        emit();
      }
    } catch {
      /* idb getur verið lokað (privat gluggi) — höldum áfram á sjálfgefnu */
    }
  }
  try {
    const sb = getSupabase();
    if (!sb) return cache;
    const { data, error } = await sb
      .from("turbopaint_settings")
      .select("doc, updated_at")
      .eq("id", ROW_ID)
      .maybeSingle();
    if (error || !data) return cache;
    const remote = sanitize({ ...(data.doc as object), updatedAt: data.updated_at });
    // Last-write-wins, sama regla og borðin. Jafnt telst ekki nýrra.
    if (!cache.updatedAt || (remote.updatedAt ?? "") > cache.updatedAt) {
      cache = remote;
      try {
        await set(IDB_KEY, cache);
      } catch {
        /* sama og að ofan */
      }
      emit();
    }
  } catch {
    /* offline — staðbundnu stillingarnar duga */
  }
  return cache;
}

async function persist(next: SymbolSettings) {
  cache = next;
  emit();
  try {
    await set(IDB_KEY, next);
  } catch {
    /* idb lokað — höldum samt áfram í Supabase */
  }
  try {
    const sb = getSupabase();
    if (!sb) return;
    await sb.from("turbopaint_settings").upsert({
      id: ROW_ID,
      doc: { overrides: next.overrides },
      updated_at: next.updatedAt,
    });
  } catch {
    /* offline — idb heldur breytingunni og hún fer upp næst */
  }
}

export async function setSymbolOverride(id: string, patch: SymbolOverride) {
  const cur = cache.overrides[id] ?? {};
  const merged: SymbolOverride = { ...cur, ...patch };
  // Hreinsum sjálfgefin gildi burt svo skjalið safni ekki rusli.
  if (merged.hidden !== true) delete merged.hidden;
  if (!merged.imageUrl) delete merged.imageUrl;
  if (merged.fit === "contain" || !merged.imageUrl) delete merged.fit;
  const overrides = { ...cache.overrides };
  if (Object.keys(merged).length) overrides[id] = merged;
  else delete overrides[id];
  await persist({ overrides, updatedAt: new Date().toISOString() });
}

export async function resetSymbolOverride(id: string) {
  if (!cache.overrides[id]) return;
  const overrides = { ...cache.overrides };
  delete overrides[id];
  await persist({ overrides, updatedAt: new Date().toISOString() });
}

/** Setur allar tákn-myndir og felur/sýnir í upprunalegt horf. */
export async function resetAllSymbolOverrides() {
  if (!Object.keys(cache.overrides).length) return;
  await persist({ overrides: {}, updatedAt: new Date().toISOString() });
}

/** Hleður eigin mynd upp í `turbopaint` bucketið og skilar opinberri slóð. */
export async function uploadSymbolImage(id: string, file: File): Promise<string> {
  const sb = getSupabase();
  if (!sb) throw new Error("Enginn Supabase-tengill — myndin verður ekki vistuð");
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  // Tímastimpill í nafninu: bucketið er public og cache-að, svo sama slóð með nýju
  // innihaldi hefði skilað GÖMLU myndinni úr skyndiminni vafrans.
  const path = `symbols/${id}-${Date.now()}.${ext || "png"}`;
  const { error } = await sb.storage.from("turbopaint").upload(path, file, {
    contentType: file.type || "image/png",
    upsert: true,
  });
  if (error) throw new Error(error.message);
  // ATH: EKKI assetPublicUrl() — hún bætir sjálfkrafa „.png" aftan á og gerir
  // ráð fyrir hráu assetId. Hér er slóðin þegar með sína eigin endingu.
  return sb.storage.from("turbopaint").getPublicUrl(path).data.publicUrl;
}
