/** Stilling: birtuskerpa á innfluttar myndir (Agnar 17.11.2026: „hafa samt kannski hak, einhvers staðar í settings-flipa
 * — svona það sem maður þarf sjaldan að nota").
 *
 *   sjalfvirkt — sjálfgefið: teikningar (línur á pappír) fá skerpu, litmyndir halda litunum (sheet-contrast.ts metaBlad)
 *   alltaf     — gamla hegðunin: hver mynd fær skerpu
 *   aldrei     — engin mynd fær skerpu, líka skannanir skjalasafnsins
 *
 * Eins á öllum vélum (regla Agnars 15.10.2026): röðin `innflutningur` í turbopaint_settings (sama tafla og táknastillingarnar,
 * röðin `global`), afrit í IndexedDB svo hún gildi án nets; nýjasta valið ræður. Skrifast aðeins við smell. */

import { get, set } from "idb-keyval";
import { create } from "zustand";
import { getSupabase } from "./supabase";

export type Birtuskerpa = "sjalfvirkt" | "alltaf" | "aldrei";
export const BIRTUSKERPA_KOSTIR: { id: Birtuskerpa; heiti: string; skyring: string }[] = [
  { id: "sjalfvirkt", heiti: "Sjálfvirkt", skyring: "Teikningar fá skerpu, litmyndir halda litunum" },
  { id: "alltaf", heiti: "Alltaf", skyring: "Hver innflutt mynd fær skerpu (eldri hegðun)" },
  { id: "aldrei", heiti: "Aldrei", skyring: "Engin mynd fær skerpu, líka skannanir skjalasafnsins" },
];

const IDB_KEY = "turbopaint:innflutningur";
const ROW_ID = "innflutningur";

type Stada = { ham: Birtuskerpa; updatedAt: string | null };
export const useBirtuskerpa = create<Stada>(() => ({ ham: "sjalfvirkt", updatedAt: null }));

export function gildBirtuskerpa(v: unknown): Birtuskerpa | null {
  return v === "sjalfvirkt" || v === "alltaf" || v === "aldrei" ? v : null;
}

/** Núverandi stilling (samstundis — sjálfgefið „sjalfvirkt" þar til hún hefur hlaðist). */
export function lesaBirtuskerpu(): Birtuskerpa {
  return useBirtuskerpa.getState().ham;
}

/** Nýrra vinnur; jafnt telst ekki nýrra (sama regla og táknastillingarnar). */
export function nyrri(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && (!b || a > b);
}

let hladid: Promise<void> | null = null;
export function hladaBirtuskerpu(): Promise<void> {
  if (hladid) return hladid;
  hladid = (async () => {
    try {
      const l = (await get<Stada>(IDB_KEY)) ?? null;
      const ham = gildBirtuskerpa(l?.ham);
      if (ham && nyrri(l?.updatedAt, useBirtuskerpa.getState().updatedAt)) useBirtuskerpa.setState({ ham, updatedAt: l!.updatedAt });
    } catch {
      /* idb lokað (privat gluggi) */
    }
    try {
      const sb = getSupabase();
      if (!sb) return;
      const { data, error } = await sb.from("turbopaint_settings").select("doc, updated_at").eq("id", ROW_ID).maybeSingle();
      if (error || !data) return;
      const ham = gildBirtuskerpa((data.doc as { birtuskerpa?: unknown } | null)?.birtuskerpa);
      if (ham && nyrri(data.updated_at, useBirtuskerpa.getState().updatedAt)) {
        useBirtuskerpa.setState({ ham, updatedAt: data.updated_at });
        try {
          await set(IDB_KEY, useBirtuskerpa.getState());
        } catch {
          /* sama */
        }
      }
    } catch {
      /* án nets — staðbundna stillingin dugar */
    }
  })();
  return hladid;
}

/** Vistar valið (smellur í ⋯-valmyndinni): strax í vafranum, svo á þjóninn. Skilar villu ef þjónninn tók ekki við. */
export async function setjaBirtuskerpu(ham: Birtuskerpa): Promise<string | null> {
  const updatedAt = new Date().toISOString();
  useBirtuskerpa.setState({ ham, updatedAt });
  try {
    await set(IDB_KEY, { ham, updatedAt });
  } catch {
    /* idb lokað — þjónninn heldur valinu */
  }
  try {
    const sb = getSupabase();
    if (!sb) return "Engin tenging við gagnagrunn — valið gildir aðeins á þessari vél";
    const { error } = await sb.from("turbopaint_settings").upsert({ id: ROW_ID, doc: { birtuskerpa: ham }, updated_at: updatedAt });
    return error ? error.message : null;
  } catch (e) {
    return e instanceof Error ? e.message : "Vistaðist ekki á þjóninum";
  }
}

if (typeof window !== "undefined") void hladaBirtuskerpu();
