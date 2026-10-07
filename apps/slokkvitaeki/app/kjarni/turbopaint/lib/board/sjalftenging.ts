/** Sjálftenging tækjatákna við skráð tæki staðarins (Agnar 07.10.2026, Álfaborg 661: „ég var búinn að raða öllum
 * tækjunum inn í TurboPaint.. en þau koma ekki á Teikningar … erum ekkert byrjaðir að setja nein raðnúmer,, svo þau
 * mega bara tengjast við hvað sem er. og koma bara með viðvörun um að það vanti fleiri skráð tæki á félagið").
 *
 * Reglurnar (TÆKI ERU FJÖLDI — tvítalning er versta villan):
 *   • ótengt TÆKJAtákn tengist ÓSTAÐSETTU tæki af SÖMU tegund (fjold, eins og 434): Léttvatn → Léttvatn,
 *     Slanga → Brunaslanga, CO₂ → CO2, Duft → ABC Duft. Raðnúmer skipta engu.
 *   • óstaðsett = ekki merki á NEINNI hæð úttektarinnar og ekki tengt tákn á borðinu; úrelt tæki eru aldrei tekin
 *   • hvert tæki er tekið EINU sinni (sjóðurinn tæmist)
 *   • tákn sem fær ekkert tæki verður „Nýtt" (vistast sem nytt-merki með tegund, `stada: "bid"`) — tillaga sem bíður
 *     samþykkis eiganda; tæki eru ALDREI búin til í uttaeki. Þegar tækin hafa verið skráð tengjast Nýtt-táknin þeim
 *     sjálfkrafa við næstu vistun (sama regla).
 * Hreinar aðgerðir — engin skrif. */

import { erNyttLykill, erStimpilMerki, fjold, lykillTakns, type TaekjaLykill } from "./merkjasafn";
import type { BoardObject, SymbolObject } from "./types";

export type TaekjaTegund = TaekjaLykill;

type Tki = { id: number; serial: string | null; type: string | null; status: string | null };
type Haed = { id: string; markers?: { unitId?: unknown; kind?: string }[] | null };

/** Heiti tegundar eins og tækin eru skráð (uttaeki.type) — `tegund` á nytt-merki og í viðvöruninni. */
export const TEGUND_HEITI: Record<TaekjaTegund, string> = {
  lettvatn: "Léttvatn",
  duft: "ABC Duft",
  co2: "CO2",
  slanga: "Brunaslanga",
  annad: "Annað tæki",
};

/** Eldri tákn TurboPaint sem eru tæki af ákveðinni tegund (almenna „extinguisher" á sér enga tegund). */
const ELDRI_TEGUND: Record<string, TaekjaTegund> = {
  "extinguisher-lettvatn": "lettvatn",
  "extinguisher-duft": "duft",
  "extinguisher-co2": "co2",
  hose: "slanga",
};

const TAEKJA_LYKLAR = new Set<string>(["lettvatn", "duft", "co2", "slanga", "annad"]);

/** Tegund tækjatákns út frá TÁKNINU (teikn:<lykill> eða eldra jafngilt), óháð tengingu. null = ekki tækjatákn. */
export function tegundTakns(symbolId: string | null | undefined): TaekjaTegund | null {
  const l = lykillTakns(symbolId);
  if (l) return TAEKJA_LYKLAR.has(l) ? (l as TaekjaTegund) : null;
  return ELDRI_TEGUND[String(symbolId || "")] ?? null;
}

/** Tengt TÆKI (uttaeki.id) — ekki stimpill og ekki „Nýtt" (n:…, á sér ekkert skráð tæki). */
export function erTengtTaekiTakn(o: Pick<SymbolObject, "uttektUnitId" | "uttektKind">): boolean {
  const u = o.uttektUnitId;
  if (u == null || u === "") return false;
  if (erNyttLykill(u)) return false;
  return !erStimpilMerki({ unitId: u, kind: o.uttektKind });
}

/** „Nýtt"-tákn: tækjatákn vistað sem nytt-merki (bíður skráningar / samþykkis). */
export function erNyttTakn(o: BoardObject): boolean {
  return o.type === "symbol" && erNyttLykill(o.uttektUnitId);
}

/** Ótengt tækjatákn: tákn af tækjategund sem á hvorki tæki né stimpil (getur verið „Nýtt"). */
export function erOtengtTaekjaTakn(o: BoardObject): boolean {
  if (o.type !== "symbol") return false;
  if (erTengtTaekiTakn(o) || erNyttLykill(o.uttektUnitId)) return false;
  if (o.uttektSign || o.uttektKind === "sign") return false;
  const u = o.uttektUnitId;
  if (typeof u === "string" && u.startsWith("s:")) return false;
  return tegundTakns(o.symbolId) != null;
}

/** Tegund TÆKIS á borðinu (tengt: skráða tegundin; ótengt / Nýtt: táknið). */
export function tegundABordi(o: SymbolObject, taekiEftirId?: Map<string, Tki>): TaekjaTegund | null {
  if (erTengtTaekiTakn(o)) {
    const t = taekiEftirId?.get(String(o.uttektUnitId));
    if (t?.type) return fjold(t.type);
    return tegundTakns(o.symbolId) ?? "annad";
  }
  if (erNyttTakn(o)) return tegundTakns(o.symbolId) ?? "annad";
  return erOtengtTaekjaTakn(o) ? tegundTakns(o.symbolId) : null;
}

const lykill = (u: unknown) => String(u ?? "");

/** Lyklar tækja sem eru staðsett: merki á einhverri hæð úttektarinnar + tengd tákn á borðinu. */
export function stadsettirLyklar(haedir: Haed[], objects: BoardObject[]): Set<string> {
  const s = new Set<string>();
  for (const h of haedir) {
    for (const m of h.markers || []) {
      if (m == null || m.unitId == null || m.unitId === "") continue;
      if (erStimpilMerki({ unitId: m.unitId, kind: m.kind }) || erNyttLykill(m.unitId)) continue;
      s.add(lykill(m.unitId));
    }
  }
  for (const o of objects) if (o.type === "symbol" && erTengtTaekiTakn(o)) s.add(lykill(o.uttektUnitId));
  return s;
}

/** Sjóður óstaðsettra tækja: hvert tæki fæst einu sinni, í fastri röð (raðnúmer, svo id). */
export class TaekjaSjodur {
  private eftir: Map<TaekjaTegund, Tki[]> = new Map();
  readonly tekin: Tki[] = [];
  constructor(taeki: Tki[], stadsett: Set<string>) {
    const laus = taeki
      .filter((t) => t && t.id != null && !stadsett.has(lykill(t.id)) && String(t.status || "").toLowerCase() !== "urelt")
      .sort((a, b) => String(a.serial || "").localeCompare(String(b.serial || ""), "is") || a.id - b.id);
    for (const t of laus) {
      const k = fjold(t.type);
      const l = this.eftir.get(k);
      if (l) l.push(t);
      else this.eftir.set(k, [t]);
    }
  }
  /** Fyrsta lausa tækið af fyrstu tegundinni sem á eitthvað (í röð `tegundir`), eða null. */
  taka(tegundir: TaekjaTegund[]): Tki | null {
    for (const k of tegundir) {
      const l = this.eftir.get(k);
      if (l && l.length) {
        const t = l.shift()!;
        this.tekin.push(t);
        return t;
      }
    }
    return null;
  }
  fjoldi(k: TaekjaTegund): number {
    return this.eftir.get(k)?.length ?? 0;
  }
}

/** Talning Nýtt-tækja eftir tegund, í fastri röð (Léttvatn, ABC Duft, CO2, Brunaslanga, Annað) — fyrir upplýsingalínuna
 * og tilboð. */
export function nyttEftirTegund(nytt: Partial<Record<TaekjaTegund, number>>): { tegund: TaekjaTegund; heiti: string; fjoldi: number }[] {
  return (Object.keys(TEGUND_HEITI) as TaekjaTegund[])
    .filter((k) => (nytt[k] ?? 0) > 0)
    .map((k) => ({ tegund: k, heiti: TEGUND_HEITI[k], fjoldi: nytt[k] ?? 0 }));
}

/** „N ný tæki í biðstöðu — bíða samþykkis: Léttvatn 3, Brunaslanga 2" (tómt ef engin). Nýtt-tæki eru TILLAGA sem bíður
 * samþykkis eiganda (Agnar 07.10.2026: „bara eftir að fá samþykki frá honum hvað hann vill fá mörg") — ekki villa. */
export function nyttTexti(nytt: Partial<Record<TaekjaTegund, number>>): string {
  const lidir = nyttEftirTegund(nytt);
  const n = lidir.reduce((s, l) => s + l.fjoldi, 0);
  if (!n) return "";
  return `${n} ný tæki í biðstöðu — bíða samþykkis: ${lidir.map((l) => `${l.heiti} ${l.fjoldi}`).join(", ")}`;
}

/** Nýtt-merki: tæki sem á eftir að skrá. `n:<lykill>:<tími36><slembi4>` — sama snið og stimplar (`s:…`). */
export function nyttMerkisId(tegund: TaekjaTegund): string {
  return "n:" + tegund + ":" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/* ── Miðar: tengt / Nýtt / ótengt (Agnar 07.10.2026: „stundum rautt léttvatn og stundum grænt" í 3D) ─────────────── */

/** Tengt tæki: grænt; RAUTT er aðeins tengt tæki sem er komið fram yfir skoðun. */
export const MIDI_TENGT = "#2f9e55";
export const MIDI_YFIR = "#c93c1d";
/** Nýtt-tæki (tillaga sem bíður samþykkis): hlutlaust indígó — hvorki rautt né grænt. */
export const MIDI_NYTT = "#4f46e5";
/** Ótengt tækjatákn (ræðst við vistun): grátt. */
export const MIDI_OTENGT = "#6b7280";

export type MidiStada = "tengt" | "nytt" | "otengt" | null;

/** Staða tækjatákns fyrir miðann: tengt tæki, Nýtt (n:…) eða ótengt tækjatákn; null = ekki tækjatákn (stimpill o.fl.). */
export function midiStada(o: BoardObject): MidiStada {
  if (o.type !== "symbol") return null;
  if (erTengtTaekiTakn(o)) return "tengt";
  if (erNyttLykill(o.uttektUnitId)) return "nytt";
  if (erOtengtTaekjaTakn(o)) return "otengt";
  return null;
}

/** Litur merkimiðans á 2D-borðinu (undir tákninu): Nýtt indígó, ótengt grátt; annars sjálfgefinn (dökkur). */
export function liturMerkimida(o: BoardObject): string | undefined {
  const s = midiStada(o);
  return s === "nytt" ? MIDI_NYTT : s === "otengt" ? MIDI_OTENGT : undefined;
}
