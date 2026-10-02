/** Úttektarteikning ↔ TurboPaint (Agnar 20.09.2026: „Edit í TurboPaint. Og save-að til baka").
 *
 * Slökkvitæki-appið geymir úttektarteikningu hvers staðar í public.teikning_bord:
 *   haedir = [{ id, nafn, image_url, markers:[{unitId,x,y,kind?,sign?}], frum:{b,h}, … }]  — hnit í PUNKTUM FRUMMYNDAR.
 * Hér er hæð opnuð sem TurboPaint-blað: teikningin flutt inn (vigur-PDF þegar safnið á það), tæki og stimplar settir
 * niður, og „Vista í úttekt" skrifar staðsetningarnar aftur í sömu röð. FloorPlan er sannleikurinn við opnun —
 * eldra TurboPaint-borð með sama nafni er yfirskrifað með núverandi blaði, ekki opnað sem eitthvað annað.
 *
 * Tengingin lifir á HLUTUNUM sjálfum (aukareitir sem fylgja borðinu í vistun og ský-samstillingu):
 *   mynd.uttekt = { companyId, haedId, frumB, frumH }
 *   tákn.uttektUnitId = uttaeki.id eða stimpils-id (s:…)
 *   tákn.uttektKind / uttektSign = kind/sign á stimplum
 *
 * Tákn sem notandinn bætir við í TurboPaint án tengingar vistast ekki til baka. */

import { getSupabase } from "./supabase";
import type { BoardObject, ImageObject, SymbolObject } from "./types";

export type UttektTenging = { companyId: number; haedId: string; frumB: number; frumH: number };
export type UttektMerki = { unitId: number | string; x: number; y: number; kind?: string; sign?: string; [k: string]: unknown };
export type UttektHaed = {
  id: string;
  nafn?: string;
  image_url?: string | null;
  markers?: UttektMerki[];
  frum?: { b: number; h: number } | null;
  [k: string]: unknown;
};
export type UttektTaeki = { id: number; serial: string | null; type: string | null; status: string | null };
export type UttektStada = { x: number; y: number; unitId: number | string; kind?: string; sign?: string };

type MyndMedTengingu = ImageObject & { uttekt?: UttektTenging };
type TaknMedTaeki = SymbolObject & { uttektUnitId?: number | string; uttektKind?: string; uttektSign?: string };

/** Tegund tækis í kerfinu → tákn TurboPaint. Óþekkt tegund fær almenna slökkvitækið. */
export function symbolFyrirTegund(tegund: string | null | undefined): string {
  const t = (tegund || "").toLowerCase().normalize("NFC");
  if (t.includes("slang") || t.includes("slöngu")) return "hose";
  if (t.includes("reykskynj") || t.includes("skynjar")) return "detector";
  if (t.includes("teppi")) return "blanket";
  if (t.includes("co2") || t.includes("co₂")) return "extinguisher-co2";
  if (t.includes("duft")) return "extinguisher-duft";
  if (t.includes("léttvatn") || t.includes("lettvatn")) return "extinguisher-lettvatn";
  return "extinguisher";
}

/** FloorPlan-stimpill (kind=sign) → tákn TurboPaint. */
export function symbolFyrirStimpil(sign: string | null | undefined): string {
  switch (String(sign || "").toLowerCase()) {
    case "neyðarútgangur":
    case "ut":
      return "exit";
    case "hose":
      return "hose";
    case "rafmagn":
      return "electric";
    case "skilti_slt":
      return "sign-extinguisher";
    case "skilti_slanga":
      return "sign-hose";
    default:
      return "exit";
  }
}

export function erStimpil(m: { kind?: string; unitId?: unknown; sign?: string } | null | undefined): boolean {
  if (!m) return false;
  return m.kind === "sign" || (typeof m.unitId === "string" && String(m.unitId).startsWith("s:"));
}

export function symbolFyrirMerki(m: UttektMerki, tegund?: string | null): string {
  if (erStimpil(m)) return symbolFyrirStimpil(m.sign);
  return symbolFyrirTegund(tegund);
}

export function merkiLykill(unitId: unknown): string {
  return String(unitId ?? "");
}

export function kodaUnitId(unitId: unknown): number | string {
  if (typeof unitId === "number" && Number.isFinite(unitId)) return unitId;
  const s = String(unitId ?? "");
  if (!s) return s;
  if (s.startsWith("s:")) return s;
  if (/^-?\d+$/.test(s)) return Number(s);
  return s;
}

/** FotoWeb-JPEG safnsins er alltaf 6006 px á lengri kant — varaleið þegar hæðin ber ekki frum-stærð (vistuð fyrir 20.09). */
export function giskaFrumStaerd(mynd: { width: number; height: number }): { b: number; h: number } {
  const lengri = Math.max(mynd.width, mynd.height, 1);
  return { b: Math.round((6006 * mynd.width) / lengri), h: Math.round((6006 * mynd.height) / lengri) };
}

/** Merki (punktar frummyndar) → efra-vinstra horn tákns á borðinu, miðjað á staðnum. */
export function merkiIBord(
  m: { x: number; y: number },
  mynd: { x: number; y: number; width: number; height: number },
  frum: { b: number; h: number },
  staerd: number
) {
  return {
    x: mynd.x + (m.x / frum.b) * mynd.width - staerd / 2,
    y: mynd.y + (m.y / frum.h) * mynd.height - staerd / 2,
  };
}

/** Tákn á borðinu → punktar frummyndar (miðja táknsins). */
export function taknIMerki(
  takn: { x: number; y: number; size: number },
  mynd: { x: number; y: number; width: number; height: number },
  frum: { b: number; h: number }
) {
  return {
    x: Math.round(((takn.x + takn.size / 2 - mynd.x) / mynd.width) * frum.b),
    y: Math.round(((takn.y + takn.size / 2 - mynd.y) / mynd.height) * frum.h),
  };
}

export function merkiFraTakni(s: TaknMedTaeki, p: { x: number; y: number }): UttektStada {
  const unitId = kodaUnitId(s.uttektUnitId);
  const stada: UttektStada = { x: p.x, y: p.y, unitId };
  const sign = s.uttektSign || (typeof unitId === "string" && unitId.startsWith("s:") ? unitId.split(":")[1] : "");
  if (s.uttektKind === "sign" || s.uttektSign || (typeof unitId === "string" && unitId.startsWith("s:"))) {
    stada.kind = "sign";
    stada.sign = sign || undefined;
  }
  return stada;
}

/** Færir staðsetningar táknanna inn í hæðina. Tæki sem eiga ekkert tákn á borðinu halda sinni stöðu; tæki sem fær
 * stöðu hér er tekið af ÖÐRUM hæðum (tæki er aðeins á einni hæð — sama regla og ritillinn í appinu). */
export function uppfaeraHaedir(haedir: UttektHaed[], haedId: string, stodur: Map<string, UttektStada> | Map<number, { x: number; y: number }>) {
  const map = new Map<string, UttektStada>();
  stodur.forEach((s, k) => {
    const unitId = "unitId" in s && s.unitId != null ? kodaUnitId(s.unitId) : kodaUnitId(k);
    const stada: UttektStada = { x: s.x, y: s.y, unitId };
    if ("kind" in s && s.kind) stada.kind = s.kind;
    if ("sign" in s && s.sign) stada.sign = s.sign;
    map.set(merkiLykill(unitId), stada);
  });
  let breytt = 0;
  let ny = 0;
  const ut = haedir.map((h) => {
    const merki = Array.isArray(h.markers) ? h.markers : [];
    if (h.id !== haedId) return { ...h, markers: merki.filter((m) => !map.has(merkiLykill(m.unitId))) };
    const sed = new Set<string>();
    const uppf = merki.map((m) => {
      const key = merkiLykill(m.unitId);
      const s = map.get(key);
      sed.add(key);
      if (!s) return m;
      if (s.x !== Math.round(Number(m.x)) || s.y !== Math.round(Number(m.y))) breytt++;
      const next: UttektMerki = { ...m, x: s.x, y: s.y, unitId: m.unitId };
      if (s.kind) next.kind = s.kind;
      if (s.sign) next.sign = s.sign;
      return next;
    });
    map.forEach((s, key) => {
      if (!sed.has(key)) {
        const merkiNy: UttektMerki = { unitId: s.unitId, x: s.x, y: s.y };
        if (s.kind) merkiNy.kind = s.kind;
        if (s.sign) merkiNy.sign = s.sign;
        uppf.push(merkiNy);
        ny++;
      }
    });
    return { ...h, markers: uppf };
  });
  return { haedir: ut, breytt, ny };
}

/** '/.netlify/functions/teikn-mynd?url=<permalink>' → permalinkurinn (þá sækir fetch-plan vigur-PDF). Annars slóðin sjálf. */
export function innflutningsSlod(imageUrl: string | null | undefined): string {
  if (!imageUrl) return "";
  try {
    const u = new URL(imageUrl, "https://slokkvitaeki.netlify.app");
    const inn = u.searchParams.get("url");
    if (u.pathname.endsWith("/teikn-mynd") && inn) return inn;
    return /^https?:/i.test(imageUrl) ? imageUrl : "";
  } catch {
    return "";
  }
}

export function veljaUttektHaed(haedir: UttektHaed[], haedId?: string | null, planUrl?: string | null): UttektHaed | null {
  if (!haedir.length) return null;
  if (haedId) {
    const exact = haedir.find((x) => x.id === haedId);
    if (exact) return exact;
  }
  if (planUrl) {
    const match = haedir.find((x) => {
      const inn = innflutningsSlod(x.image_url);
      if (inn && inn === planUrl) return true;
      const raw = String(x.image_url || "");
      return raw.includes(planUrl) || raw.includes(encodeURIComponent(planUrl));
    });
    if (match) return match;
  }
  return haedir.length === 1 ? haedir[0] : haedir[0];
}

export function uttektBordNafn(stadur: string, haed: UttektHaed): string {
  return `${stadur} — ${haed.nafn || "hæð"}`.slice(0, 80);
}

export function finnaTengduMynd(objects: BoardObject[]): MyndMedTengingu | null {
  const m = objects.find((o) => o.type === "image" && (o as MyndMedTengingu).uttekt);
  return (m as MyndMedTengingu) || null;
}

export async function saekjaUttekt(companyId: number) {
  const sb = getSupabase();
  if (!sb) throw new Error("Engin tenging við gagnagrunn");
  const [rod, fyr, taeki] = await Promise.all([
    sb.from("teikning_bord").select("company_id,markers,image_url,haedir,updated_at").eq("company_id", companyId).maybeSingle(),
    sb.from("fyrirtaeki").select("id,nafn").eq("id", companyId).maybeSingle(),
    sb.from("uttaeki").select("id,serial,type,status").eq("fyrirtaeki_id", companyId),
  ]);
  if (rod.error) throw new Error(rod.error.message);
  if (!rod.data) throw new Error("Þessi staður á enga vistaða úttektarteikningu — vistaðu hana fyrst í Slökkvitæki-appinu.");
  const r = rod.data as { markers: UttektMerki[]; image_url: string | null; haedir: UttektHaed[] | null };
  // Eldri raðir (fyrir hæðir): ein hæð í markers/image_url.
  const haedir: UttektHaed[] =
    Array.isArray(r.haedir) && r.haedir.length
      ? r.haedir
      : [{ id: "h1", nafn: "1. hæð", image_url: r.image_url, markers: r.markers || [] }];
  return {
    nafn: (fyr.data as { nafn?: string } | null)?.nafn || "Staður " + companyId,
    haedir,
    taeki: ((taeki.data as UttektTaeki[] | null) || []).filter(Boolean),
  };
}

/** Skrifar staðsetningar tengdra tákna aftur í teikning_bord. Les röðina FERSKA fyrst svo breytingar úr appinu
 * (nýjar hæðir, skurður, veggir) tapist ekki — aðeins `markers` tengdu hæðarinnar og tækja sem fluttu breytast. */
export async function vistaIUttekt(objects: BoardObject[]) {
  const mynd = finnaTengduMynd(objects);
  if (!mynd || !mynd.uttekt) throw new Error("Þetta borð er ekki tengt úttektarteikningu.");
  const t = mynd.uttekt;
  const frum = { b: t.frumB, h: t.frumH };
  const stodur = new Map<string, UttektStada>();
  let otengd = 0;
  let utan = 0;
  objects.forEach((o) => {
    if (o.type !== "symbol" || o.hidden) return;
    const s = o as TaknMedTaeki;
    const p = taknIMerki(s, mynd, frum);
    const inni = p.x >= 0 && p.y >= 0 && p.x <= frum.b && p.y <= frum.h;
    if (s.uttektUnitId == null || s.uttektUnitId === "") {
      if (inni) otengd++;
      return;
    }
    if (!inni) {
      utan++;
      return;
    }
    const stada = merkiFraTakni(s, p);
    stodur.set(merkiLykill(stada.unitId), stada);
  });
  const sb = getSupabase();
  if (!sb) throw new Error("Engin tenging við gagnagrunn");
  const nu = await saekjaUttekt(t.companyId);
  if (!nu.haedir.some((h) => h.id === t.haedId)) throw new Error("Hæðin er ekki lengur til í úttektinni — henni var eytt í appinu.");
  const u = uppfaeraHaedir(nu.haedir, t.haedId, stodur);
  const fyrsta = u.haedir[0];
  const { error, data } = await sb
    .from("teikning_bord")
    .update({
      haedir: u.haedir,
      markers: fyrsta.markers || [],
      updated_at: new Date().toISOString(),
      updated_by: "TurboPaint",
    })
    .eq("company_id", t.companyId)
    .select("company_id");
  if (error) throw new Error(error.message);
  if (!data || !data.length) throw new Error("Ekkert var skrifað — röðin fannst ekki eða aðgangi var hafnað.");
  return { fjoldi: stodur.size, breytt: u.breytt, ny: u.ny, otengd, utan, nafn: nu.nafn };
}
