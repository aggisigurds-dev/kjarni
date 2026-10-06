/** Tækjalisti staðarins í TurboPaint (2. áfangi, Agnar 06.10.2026: TurboPaint verður eina vinnuborð grunnmyndanna).
 *
 * Tækin koma úr uttaeki (saekjaUttekt). Staða hvers tækis er lesin af BORÐINU fyrir þessa hæð (tengt tákn = „á
 * teikningu") og af úttektinni fyrir hinar hæðirnar („á 2. hæð"); annars „ekki staðsett". Tæki er aðeins á einni hæð
 * (uppfaeraHaedir tekur það af öðrum hæðum við vistun). Hreinar aðgerðir — engin skrif, engin DOM. */

import {
  erStimpil,
  merkiLykill,
  stuttNumer,
  symbolFyrirTegund,
  type UttektHaed,
  type UttektTaeki,
} from "./uttekt";
import type { BoardObject } from "./types";

export type TaekjaStada = "her" | "onnur" | "ekki";

export interface TaekiILista {
  taeki: UttektTaeki;
  /** unitId sem strengur (sami lykill og í teikning_bord). */
  key: string;
  symbolId: string;
  flokkur: string;
  stuttNr: string;
  stada: TaekjaStada;
  /** Nafn hæðarinnar þar sem tækið er, sé það á annarri hæð. */
  haedNafn?: string;
  /** Tákn tækisins á borðinu, sé það á teikningunni. */
  taknId?: string;
  urelt: boolean;
}

/** Flokkar listans í röð — tegund tækis ræður tákninu (symbolFyrirTegund) og táknið flokknum. */
export const TAEKJAFLOKKAR: { symbolId: string; heiti: string }[] = [
  { symbolId: "extinguisher-lettvatn", heiti: "Slökkvitæki · Léttvatn" },
  { symbolId: "extinguisher-duft", heiti: "Slökkvitæki · Duft" },
  { symbolId: "extinguisher-co2", heiti: "Slökkvitæki · CO₂" },
  { symbolId: "extinguisher", heiti: "Slökkvitæki · annað" },
  { symbolId: "hose", heiti: "Brunaslanga" },
  { symbolId: "detector", heiti: "Reykskynjari" },
  { symbolId: "blanket", heiti: "Eldvarnarteppi" },
];

function flokkurTakns(symbolId: string): string {
  return TAEKJAFLOKKAR.find((f) => f.symbolId === symbolId)?.heiti ?? "Annað";
}

/** Tengt TÆKI (ekki stimpill) á borðinu: lykill → id táknsins (fyrsta táknið gildir). */
export function taekiABordi(objects: BoardObject[]): Map<string, string> {
  const ut = new Map<string, string>();
  for (const o of objects) {
    if (o.type !== "symbol" || o.uttektUnitId == null || o.uttektUnitId === "") continue;
    if (erStimpil({ unitId: o.uttektUnitId, kind: o.uttektKind })) continue;
    const key = merkiLykill(o.uttektUnitId);
    if (!ut.has(key)) ut.set(key, o.id);
  }
  return ut;
}

export function taekjaListi(
  taeki: UttektTaeki[],
  objects: BoardObject[],
  haedir: UttektHaed[],
  haedId: string
): TaekiILista[] {
  const aBordi = taekiABordi(objects);
  const annars = new Map<string, string>();
  haedir.forEach((h, i) => {
    if (h.id === haedId) return;
    for (const m of h.markers || []) {
      if (erStimpil(m)) continue;
      const key = merkiLykill(m.unitId);
      if (!annars.has(key)) annars.set(key, h.nafn || `${i + 1}. hæð`);
    }
  });
  return taeki.map((t) => {
    const key = merkiLykill(t.id);
    const symbolId = symbolFyrirTegund(t.type);
    const taknId = aBordi.get(key);
    const haedNafn = taknId ? undefined : annars.get(key);
    return {
      taeki: t,
      key,
      symbolId,
      flokkur: flokkurTakns(symbolId),
      stuttNr: stuttNumer(t.serial) || "#" + t.id,
      stada: taknId ? "her" : haedNafn ? "onnur" : "ekki",
      haedNafn,
      taknId,
      urelt: String(t.status || "").toLowerCase() === "urelt",
    };
  });
}

const STADA_TAEKIS: Record<string, string> = {
  active: "virkt",
  ok: "í lagi",
  "í lagi": "í lagi",
  urelt: "úrelt",
  loaned: "í láni",
};

export function stadaTaekisTexti(status: string | null | undefined): string {
  const s = String(status || "").trim();
  return STADA_TAEKIS[s.toLowerCase()] ?? s;
}

export function merkiTexti(t: Pick<TaekiILista, "stada" | "haedNafn">): string {
  if (t.stada === "her") return "á teikningu";
  if (t.stada === "onnur") return "á " + (t.haedNafn || "annarri hæð");
  return "ekki staðsett";
}

function lagstafir(s: string) {
  return s.toLowerCase().normalize("NFC");
}

/** Leit í raðnúmeri, tegund, id og stöðu; „aðeins óstaðsett" = ekki á neinni hæð. */
export function siaTaekjalista(listi: TaekiILista[], leit: string, adeinsOstadsett: boolean): TaekiILista[] {
  const q = lagstafir(leit.trim());
  return listi.filter((t) => {
    if (adeinsOstadsett && t.stada !== "ekki") return false;
    if (!q) return true;
    const hay = lagstafir(
      [t.taeki.serial, t.taeki.type, String(t.taeki.id), stadaTaekisTexti(t.taeki.status), t.flokkur, merkiTexti(t)].join(" ")
    );
    return hay.includes(q);
  });
}

/** Flokkað í röð TAEKJAFLOKKAR; innan flokks í fastri röð raðnúmera svo röð hoppi ekki þegar tæki er staðsett. */
export function flokkaTaekjalista(listi: TaekiILista[]): { heiti: string; symbolId: string; taeki: TaekiILista[] }[] {
  const hopar = new Map<string, TaekiILista[]>();
  for (const t of listi) {
    const h = hopar.get(t.flokkur);
    if (h) h.push(t);
    else hopar.set(t.flokkur, [t]);
  }
  const rod = (heiti: string) => {
    const i = TAEKJAFLOKKAR.findIndex((f) => f.heiti === heiti);
    return i < 0 ? TAEKJAFLOKKAR.length : i;
  };
  return [...hopar.entries()]
    .sort((a, b) => rod(a[0]) - rod(b[0]))
    .map(([heiti, taeki]) => ({
      heiti,
      symbolId: taeki[0].symbolId,
      taeki: [...taeki].sort(
        (a, b) => String(a.taeki.serial || "").localeCompare(String(b.taeki.serial || ""), "is") || a.taeki.id - b.taeki.id
      ),
    }));
}

/** Hvað smellur á teikninguna gerir við valið tæki: færa táknið sem er þegar á þessari hæð (aldrei tvítekið), eða
 * setja nýtt — og spyrja fyrst sé tækið á annarri hæð. */
export function adgerdVidSetningu(
  objects: BoardObject[],
  haedir: UttektHaed[],
  haedId: string,
  unitId: number | string
): { teg: "faera"; objId: string } | { teg: "nytt"; annarriHaed?: string } {
  const key = merkiLykill(unitId);
  const objId = taekiABordi(objects).get(key);
  if (objId) return { teg: "faera", objId };
  let annarriHaed: string | undefined;
  haedir.forEach((h, i) => {
    if (annarriHaed || h.id === haedId) return;
    if ((h.markers || []).some((m) => !erStimpil(m) && merkiLykill(m.unitId) === key)) annarriHaed = h.nafn || `${i + 1}. hæð`;
  });
  return { teg: "nytt", annarriHaed };
}
