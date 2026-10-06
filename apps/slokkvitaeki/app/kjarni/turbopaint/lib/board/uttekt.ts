/** Úttektarteikning ↔ TurboPaint (Agnar 20.09.2026: „Edit í TurboPaint. Og save-að til baka").
 *
 * Slökkvitæki-appið geymir úttektarteikningu hvers staðar í public.teikning_bord:
 *   haedir = [{ id, nafn, image_url, markers:[{unitId,x,y,kind?,sign?}], frum:{b,h}, … }]  — hnit í PUNKTUM FRUMMYNDAR.
 * Hér er hæð opnuð sem TurboPaint-blað: teikningin flutt inn (vigur-PDF þegar safnið á það), tæki og stimplar settir
 * niður, og „Vista í úttekt" skrifar staðsetningarnar aftur í sömu röð. FloorPlan er sannleikurinn við opnun —
 * eldra TurboPaint-borð með sama nafni er yfirskrifað með núverandi blaði, ekki opnað sem eitthvað annað.
 *
 * Tengingin lifir á HLUTUNUM sjálfum (aukareitir sem fylgja borðinu í vistun og ský-samstillingu):
 *   mynd.uttekt = { companyId, haedId, frumB, frumH, skurdur? }
 *   tákn.uttektUnitId = uttaeki.id eða stimpils-id (s:…)
 *   tákn.uttektKind / uttektSign = kind/sign á stimplum
 *   veggur (lag „Veggir").veggTegund = veggur / gler / hurð → veggjaLinur[].tegund
 *
 * Tákn sem notandinn bætir við í TurboPaint án tengingar vistast ekki til baka. Veggir gera það: TurboPaint er
 * leiðréttingarborð hæðarinnar (Agnar 06.10.2026) — veggir Teikning-gluggans (pdfVeggir/veggir) koma inn sem
 * ritanlegir veggir þegar hæðin á engar veggjaLinur, og „Vista í úttekt" skrifar þá sem veggjaLinur + `leidrett`. */

import { newId } from "./ids";
import { getSupabase } from "./supabase";
import { erVeggTegund, type FrumVeggur } from "./teikning-veggir";
import type { BoardObject, ImageObject, LineObject, SymbolObject, UttektTenging } from "./types";
import { erVeggur, VEGG_LITIR, VEGG_NOFN } from "./veggja-leidretting";

export type { UttektTenging };
export type UttektMerki = { unitId: number | string; x: number; y: number; kind?: string; sign?: string; [k: string]: unknown };
/** Merki um að veggir hæðarinnar voru leiðréttir annars staðar en í Teikning-glugganum. */
export type UttektLeidrett = { af: "turbopaint"; kl: string };
export type UttektHaed = {
  id: string;
  nafn?: string;
  image_url?: string | null;
  markers?: UttektMerki[];
  frum?: { b: number; h: number } | null;
  /** Svæði hússins á blaðinu (dílar frummyndar). */
  skurdur?: { x: number; y: number; w: number; h: number } | null;
  /** Veggjalínur sem TurboPaint vistaði (miðlína + þykkt + tegund). Ganga fyrir pdfVeggir/veggir í Teikning. */
  veggjaLinur?: UttektVeggur[];
  /** Veggflatir úr vigur-PDF (tvær línur per vegg), dílar frummyndar. */
  pdfVeggir?: number[][];
  /** Handdregnir veggir Teikning-gluggans, dílar frummyndar. */
  veggir?: number[][];
  leidrett?: UttektLeidrett;
  [k: string]: unknown;
};
export type UttektTaeki = { id: number; serial: string | null; type: string | null; status: string | null };
export type UttektStada = { x: number; y: number; unitId: number | string; kind?: string; sign?: string };

type MyndMedTengingu = ImageObject;
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

/** Greindur veggur hæðar í punktum FRUMMYNDAR: p = [x0, y0, x1, y1, …] (miðlína), t = þykkt, tegund = veggur/gler/hurð.
 * TurboPaint er vélin sem greinir og leiðréttir veggina og skrifar þá í `haedir[].veggjaLinur`; Slökkvitæki-glugginn
 * (383) les þá og sýnir í 3D (Agnar 03.10.2026: „turboprint á að vera svona vinnuengine", „samnýta tæknina"). */
export type UttektVeggur = FrumVeggur;

/** Veggir tengdu myndarinnar → punktar frummyndar (heiltölur, svo röðin haldist lítil). Með fara veggir festir við
 * myndina og veggir teiknaðir ofan á hana án festingar (Veggja-tólið W); veggir annarra mynda ekki. */
export function veggirIFrum(
  objects: BoardObject[],
  mynd: { id: string; x: number; y: number; width: number; height: number },
  frum: { b: number; h: number }
): UttektVeggur[] {
  const kx = frum.b / mynd.width, ky = frum.h / mynd.height;
  const ut: UttektVeggur[] = [];
  for (const o of objects) {
    if (!erVeggur(o) || o.hidden) continue;
    const p: number[] = [];
    for (let i = 0; i + 1 < o.points.length; i += 2) {
      p.push(Math.round((o.x + o.points[i] - mynd.x) * kx), Math.round((o.y + o.points[i + 1] - mynd.y) * ky));
    }
    if (o.parentId !== mynd.id) {
      if (o.parentId) continue;
      // án festingar: aðeins ef miðja veggjarins er á myndinni
      const n = p.length / 2;
      let sx = 0, sy = 0;
      for (let i = 0; i < p.length; i += 2) { sx += p[i]; sy += p[i + 1]; }
      const cx = sx / n, cy = sy / n;
      if (!(cx >= 0 && cy >= 0 && cx <= frum.b && cy <= frum.h)) continue;
    }
    if (p.length >= 4) ut.push({ p, t: Math.max(1, Math.round(o.strokeWidth * kx)), tegund: o.veggTegund ?? "veggur" });
  }
  return ut;
}

/** Veggjalínur hæðar → línur á borðinu, festar við myndina (sama útlit og „Veggir" gefur; gler blátt, hurð brún). */
export function veggirIBord(
  veggir: UttektVeggur[],
  mynd: { id: string; x: number; y: number; width: number; height: number },
  frum: { b: number; h: number }
): LineObject[] {
  const kx = mynd.width / frum.b, ky = mynd.height / frum.h;
  return veggir
    .filter((v) => Array.isArray(v.p) && v.p.length >= 4)
    .map((v) => {
      const tegund = erVeggTegund(v.tegund) ? v.tegund : "veggur";
      const lina: LineObject = {
        id: newId(),
        type: "polyline",
        x: 0,
        y: 0,
        points: v.p.map((n, i) => (i % 2 === 0 ? mynd.x + n * kx : mynd.y + n * ky)),
        stroke: VEGG_LITIR[tegund],
        strokeWidth: Math.max(1, (v.t || 1) * kx),
        dash: "solid",
        rotation: 0,
        opacity: 0.9,
        locked: false,
        hidden: false,
        name: VEGG_NOFN[tegund],
        parentId: mynd.id,
        veggur: true,
      };
      if (tegund !== "veggur") lina.veggTegund = tegund;
      return lina;
    });
}

/** Skurður hæðarinnar (dílar frummyndar) → rammi á borðinu. null ef enginn nothæfur skurður. */
export function skurdurIBord(
  sk: { x: number; y: number; w: number; h: number } | null | undefined,
  mynd: { x: number; y: number; width: number; height: number },
  frum: { b: number; h: number }
): { x: number; y: number; width: number; height: number } | null {
  if (!sk || !(sk.w > 8) || !(sk.h > 8) || !(frum.b > 0) || !(frum.h > 0)) return null;
  const kx = mynd.width / frum.b, ky = mynd.height / frum.h;
  return { x: mynd.x + sk.x * kx, y: mynd.y + sk.y * ky, width: sk.w * kx, height: sk.h * ky };
}

/** Veggirnir skrifast í hæðina sem veggjaLinur og hún fær `leidrett` (Teikning veit þá að veggirnir voru leiðréttir í
 * TurboPaint). Aðrar hæðir og annað á hæðinni er ósnert. Engir veggir = ekkert breytist (þeir sem fyrir voru haldast). */
export function skrifaVeggiIHaed<T extends UttektHaed>(haedir: T[], haedId: string, veggir: UttektVeggur[], kl: string): T[] {
  if (!veggir.length) return haedir;
  const leidrett: UttektLeidrett = { af: "turbopaint", kl };
  return haedir.map((h) => (h.id === haedId ? { ...h, veggjaLinur: veggir, leidrett } : h));
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

/** Stærð tákns á borðinu (borðdílar).
 * Agnar 06.10.2026 (Fiskislóð 41 opnuð í TurboPaint: „merkin allt of stór"): áður 1/14 af lengri hlið BLAÐSINS — á
 * A1-blaði ≈ 6 m í raunstærð — og stimpilstærð notandans var aðeins lágmark, svo ekki var hægt að minnka. Nú miðað
 * við HÚSIÐ, eins og Teikning-glugginn í Slökkvitæki-appinu: lengri hlið skurðar hæðarinnar ÷ 28 (Fiskislóð ≈ 1,5 m);
 * án skurðar lengri hlið blaðsins ÷ 40. Stimpilstærð notandans (sjálfgefið 56) kvarðar hlutfallslega í báðar áttir. */
export function stimpilStaerdABladi(
  mynd: { width: number; height: number },
  bound = 56,
  skurdur?: { w: number; h: number } | null,
  frum?: { b: number; h: number } | null
): number {
  const long = Math.max(mynd.width || 0, mynd.height || 0, 1);
  const kv = (bound > 0 ? bound : 56) / 56;
  const k = frum && frum.b > 0 ? (mynd.width || 0) / frum.b : 0;
  const grunnur =
    skurdur && skurdur.w > 8 && skurdur.h > 8 && k > 0 ? (Math.max(skurdur.w, skurdur.h) * k) / 28 : long / 40;
  return Math.max(24, Math.round(grunnur * kv));
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
  // Veggirnir fylgja með, með tegund (veggur/gler/hurð), og hæðin merkist leiðrétt í TurboPaint — ef einhverjir eru á
  // borðinu; annars haldast þeir sem fyrir voru.
  const veggir = veggirIFrum(objects, mynd, frum);
  u.haedir = skrifaVeggiIHaed(u.haedir, t.haedId, veggir, new Date().toISOString());
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
  return { fjoldi: stodur.size, breytt: u.breytt, ny: u.ny, otengd, utan, nafn: nu.nafn, veggir: veggir.length };
}
