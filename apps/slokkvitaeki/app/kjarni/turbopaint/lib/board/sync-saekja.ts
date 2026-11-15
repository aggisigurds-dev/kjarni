/** Sync-athugun borðanna gagnvart úttekt — sókn og skyndiminni (flokkunin sjálf er í sync-stada.ts).
 *
 * AÐEINS LESTUR: select á turbopaint_boards, teikning_bord og uttaeki — sömu töflur og appið les hvort eð er.
 *
 * Gagnamagn (mælt 15.11.2026, 54 borð / 17 staðir): full athugun ≈ 600 KB þjappað. Því er niðurstaðan geymd í vafranum
 * (localStorage) með tímastimpli borðsins og úttektarinnar sem hún var reiknuð úr, og næsta athugun sækir aðeins
 * tímastimpla úttektanna (nokkur hundruð bæti) og endurmetur þau borð þar sem annað hvort hefur breyst. Staðbundið
 * eintak borðsins (IndexedDB) er notað í stað niðurhals þegar það er sama útgáfa og í listanum. */

import type { SupabaseClient } from "@supabase/supabase-js";
import { lesaBordDocStadbundid, type BoardListEntry } from "./persistence";
import { getSupabase } from "./supabase";
import { ljosBorda, metaBord, type SyncBord, type SyncMat, type SyncNidurstada, type SyncUttekt } from "./sync-stada";
import type { BoardDocument, BoardObject } from "./types";
import { myndirTengdar, type UttektHaed, type UttektMerki, type UttektTaeki } from "./uttekt";

const LYKILL = "tp_sync_v1";
const UTGAFA = 1;

interface GeymtBord {
  /** updatedAt borðsins sem matið var reiknað úr. */
  bordKl: string;
  /** teikning_bord.updated_at staðarins sem matið var reiknað úr (null = ótengt / engin úttekt). */
  uttektKl: string | null;
  mat: SyncMat;
}
interface Geymt {
  v: number;
  kl: string;
  bord: Record<string, GeymtBord>;
}

export type SyncKort = SyncNidurstada & { mat: SyncMat };
export interface SyncSyn {
  /** Hvenær síðast var athugað (ISO); null = aldrei. */
  kl: string | null;
  /** Aðeins borð sem eiga gilt mat (borðið óbreytt síðan það var metið). */
  bord: Map<string, SyncKort>;
}

function lesaGeymt(): Geymt | null {
  try {
    const g = JSON.parse(window.localStorage.getItem(LYKILL) || "null") as Geymt | null;
    return g && g.v === UTGAFA && g.bord && typeof g.bord === "object" ? g : null;
  } catch {
    return null; // einkagluggi eða skemmd færsla
  }
}

function vistaGeymt(g: Geymt) {
  try {
    window.localStorage.setItem(LYKILL, JSON.stringify(g));
  } catch {
    /* einkagluggi / fullt — niðurstaðan gildir þá aðeins þessa heimsókn */
  }
}

function syn(listi: BoardListEntry[], g: Geymt): SyncSyn {
  const bord: SyncBord[] = [];
  for (const b of listi) {
    const m = g.bord[b.id];
    // Borð sem hefur breyst síðan það var metið fær ekkert ljós fyrr en það hefur verið metið aftur
    if (m && m.bordKl === b.updatedAt) bord.push({ id: b.id, name: b.name, updatedAt: b.updatedAt, mat: m.mat });
  }
  const ljos = ljosBorda(bord);
  const ut = new Map<string, SyncKort>();
  for (const b of bord) ut.set(b.id, { ...ljos.get(b.id)!, mat: b.mat });
  return { kl: g.kl || null, bord: ut };
}

/** Síðasta þekkta staða — samstundis og án nets. */
export function synUrGeymdu(listi: BoardListEntry[]): SyncSyn {
  const g = lesaGeymt();
  return g ? syn(listi, g) : { kl: null, bord: new Map() };
}

function bita<T>(a: T[], n: number): T[][] {
  const ut: T[][] = [];
  for (let i = 0; i < a.length; i += n) ut.push(a.slice(i, i + n));
  return ut;
}

type TeikningRod = {
  company_id: number;
  markers: UttektMerki[] | null;
  image_url: string | null;
  haedir: UttektHaed[] | null;
  updated_at: string | null;
};

/** Úttekt staðanna eins og saekjaUttekt les hana (hæðir + tæki), margir staðir í einu. */
async function saekjaUttektir(sb: SupabaseClient, cids: number[]): Promise<Map<number, SyncUttekt>> {
  const ut = new Map<number, SyncUttekt>();
  for (const hluti of bita(cids, 8)) {
    const rod = await sb.from("teikning_bord").select("company_id,markers,image_url,haedir,updated_at").in("company_id", hluti);
    if (rod.error) throw new Error(rod.error.message);
    // Tæki staðanna, síðuskipt: þjónninn skilar mest 1000 röðum í einu
    const taeki = new Map<number, UttektTaeki[]>();
    for (let fra = 0; ; fra += 1000) {
      const tk = await sb
        .from("uttaeki")
        .select("id,serial,type,status,fyrirtaeki_id")
        .in("fyrirtaeki_id", hluti)
        .order("id")
        .range(fra, fra + 999);
      if (tk.error) throw new Error(tk.error.message);
      const radir = (tk.data ?? []) as (UttektTaeki & { fyrirtaeki_id: number })[];
      for (const t of radir) {
        const c = Number(t.fyrirtaeki_id);
        if (!taeki.has(c)) taeki.set(c, []);
        taeki.get(c)!.push({ id: t.id, serial: t.serial, type: t.type, status: t.status });
      }
      if (radir.length < 1000) break;
    }
    for (const r of (rod.data ?? []) as TeikningRod[]) {
      const cid = Number(r.company_id);
      // Eldri raðir (fyrir hæðir): ein hæð í markers/image_url — sama regla og saekjaUttekt
      const haedir: UttektHaed[] =
        Array.isArray(r.haedir) && r.haedir.length
          ? r.haedir
          : [{ id: "h1", nafn: "1. hæð", image_url: r.image_url, markers: r.markers || [] }];
      ut.set(cid, { haedir, taeki: taeki.get(cid) || [], uppfaert: r.updated_at });
    }
  }
  return ut;
}

/** Athugar sync-stöðu allra borða í listanum. Kastar ef gagnagrunnurinn næst ekki (t.d. án nets) — kallarinn sýnir þá
 * síðustu þekktu stöðu (synUrGeymdu). */
export async function athugaSync(listi: BoardListEntry[]): Promise<SyncSyn> {
  const sb = getSupabase();
  if (!sb) throw new Error("Engin tenging við gagnagrunn");
  const g: Geymt = lesaGeymt() ?? { v: UTGAFA, kl: "", bord: {} };

  // 1) Hefur úttekt staðanna sem þegar eru þekktir breyst? Aðeins tímastimplar — örlítil fyrirspurn.
  const thekktir = [...new Set(Object.values(g.bord).map((b) => b.mat.cid).filter((c): c is number => c != null))];
  const uttektKl = new Map<number, string | null>();
  for (const hluti of bita(thekktir, 60)) {
    const { data, error } = await sb.from("teikning_bord").select("company_id,updated_at").in("company_id", hluti);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as { company_id: number; updated_at: string | null }[]) uttektKl.set(Number(r.company_id), r.updated_at);
  }

  // 2) Borð sem þarf að meta: ný, breytt, eða úttekt staðarins breytt síðan síðast
  const tharf = listi.filter((b) => {
    const m = g.bord[b.id];
    if (!m || m.bordKl !== b.updatedAt) return true;
    return m.mat.cid != null && (uttektKl.get(m.mat.cid) ?? null) !== m.uttektKl;
  });

  // 3) Hlutir þeirra: staðbundna eintakið ef það er sama útgáfa og í listanum, annars úr skýinu
  const hlutir = new Map<string, BoardObject[]>();
  const urSkyi: string[] = [];
  for (const b of tharf) {
    const stad = await lesaBordDocStadbundid(b.id);
    if (stad && (stad.updatedAt ?? "") === b.updatedAt) hlutir.set(b.id, stad.objects || []);
    else urSkyi.push(b.id);
  }
  for (const hluti of bita(urSkyi, 20)) {
    const { data, error } = await sb.from("turbopaint_boards").select("id,doc").in("id", hluti);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as { id: string; doc: BoardDocument | null }[]) hlutir.set(String(r.id), r.doc?.objects || []);
  }
  for (const id of urSkyi) {
    // Hvorki í skýinu né sama útgáfa staðbundið (borð sem hefur ekki náð að ýtast): staðbundna eintakið sem til er
    if (hlutir.has(id)) continue;
    const stad = await lesaBordDocStadbundid(id);
    if (stad) hlutir.set(id, stad.objects || []);
  }

  // 4) Úttekt staðanna sem þessi borð eru tengd
  const cidBords = new Map<string, number | null>();
  for (const [id, objs] of hlutir) {
    const m = myndirTengdar(objs);
    cidBords.set(id, m.length ? Number(m[0].uttekt!.companyId) : null);
  }
  const uttekt = await saekjaUttektir(sb, [...new Set([...cidBords.values()].filter((c): c is number => c != null))]);

  // 5) Meta og geyma
  for (const b of tharf) {
    const objs = hlutir.get(b.id);
    if (!objs) continue; // skjalið náðist ekki — ljósið bíður næstu athugunar
    const cid = cidBords.get(b.id) ?? null;
    const u = cid != null ? (uttekt.get(cid) ?? null) : null;
    g.bord[b.id] = {
      bordKl: b.updatedAt,
      uttektKl: u?.uppfaert ?? null,
      mat: metaBord({ name: b.name, updatedAt: b.updatedAt, objects: objs }, u),
    };
  }
  const til = new Set(listi.map((b) => b.id));
  for (const id of Object.keys(g.bord)) if (!til.has(id)) delete g.bord[id]; // eydd borð fara úr skyndiminninu
  g.kl = new Date().toISOString();
  vistaGeymt(g);
  return syn(listi, g);
}
