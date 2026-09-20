/** Úttektarteikning ↔ TurboPaint (Agnar 20.09.2026: „Edit í TurboPaint. Og save-að til baka").
 *
 * Slökkvitæki-appið geymir úttektarteikningu hvers staðar í public.teikning_bord:
 *   haedir = [{ id, nafn, image_url, markers:[{unitId,x,y}], frum:{b,h}, … }]  — hnit í PUNKTUM FRUMMYNDAR hæðarinnar.
 * Hér er hæð opnuð sem TurboPaint-borð: teikningin flutt inn (vigur-PDF þegar safnið á það), tækin sett niður sem
 * tákn á sínum stöðum, og „Vista í úttekt" skrifar staðsetningar táknanna aftur í sömu röð.
 *
 * Tengingin lifir á HLUTUNUM sjálfum (aukareitir sem fylgja borðinu í vistun og ský-samstillingu):
 *   mynd.uttekt = { companyId, haedId, frumB, frumH }   ·   tákn.uttektUnitId = uttaeki.id
 * Þannig þarf hvorki nýja töflu né breytingu á BoardDocument, og afritað borð ber tenginguna með sér.
 *
 * Tákn sem notandinn bætir við í TurboPaint eru EKKI tæki í kerfinu — þau vistast ekki til baka (merki í úttekt
 * verður að vísa á skráð tæki). vistaIUttekt() segir hve mörg slík voru, svo það komi ekki á óvart. */

import { getSupabase } from "./supabase";
import type { BoardObject, ImageObject, SymbolObject } from "./types";

export type UttektTenging = { companyId: number; haedId: string; frumB: number; frumH: number };
export type UttektMerki = { unitId: number; x: number; y: number; [k: string]: unknown };
export type UttektHaed = {
  id: string;
  nafn?: string;
  image_url?: string | null;
  markers?: UttektMerki[];
  frum?: { b: number; h: number } | null;
  [k: string]: unknown;
};
export type UttektTaeki = { id: number; serial: string | null; type: string | null; status: string | null };

type MyndMedTengingu = ImageObject & { uttekt?: UttektTenging };
type TaknMedTaeki = SymbolObject & { uttektUnitId?: number };

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

/** Færir staðsetningar táknanna inn í hæðina. Tæki sem eiga ekkert tákn á borðinu halda sinni stöðu; tæki sem fær
 * stöðu hér er tekið af ÖÐRUM hæðum (tæki er aðeins á einni hæð — sama regla og ritillinn í appinu). */
export function uppfaeraHaedir(haedir: UttektHaed[], haedId: string, stodur: Map<number, { x: number; y: number }>) {
  let breytt = 0;
  let ny = 0;
  const ut = haedir.map((h) => {
    const merki = Array.isArray(h.markers) ? h.markers : [];
    if (h.id !== haedId) return { ...h, markers: merki.filter((m) => !stodur.has(m.unitId)) };
    const sed = new Set<number>();
    const uppf = merki.map((m) => {
      const s = stodur.get(m.unitId);
      sed.add(m.unitId);
      if (!s) return m;
      if (s.x !== Math.round(m.x) || s.y !== Math.round(m.y)) breytt++;
      return { ...m, x: s.x, y: s.y };
    });
    stodur.forEach((s, unitId) => {
      if (!sed.has(unitId)) {
        uppf.push({ unitId, x: s.x, y: s.y });
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
  const stodur = new Map<number, { x: number; y: number }>();
  let otengd = 0;
  let utan = 0;
  objects.forEach((o) => {
    if (o.type !== "symbol" || o.hidden) return;
    const s = o as TaknMedTaeki;
    const p = taknIMerki(s, mynd, frum);
    const inni = p.x >= 0 && p.y >= 0 && p.x <= frum.b && p.y <= frum.h;
    if (s.uttektUnitId == null) {
      if (inni) otengd++;
      return;
    }
    if (!inni) {
      utan++;
      return;
    }
    stodur.set(s.uttektUnitId, p);
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
