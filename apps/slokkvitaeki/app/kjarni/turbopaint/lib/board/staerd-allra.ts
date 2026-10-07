// „Stærð allra merkja" (Agnar 07.10.2026: „ég get heldur ekki breytt stærðunum á öllum merkingunum í einu, þarf að gera
// hvert fyrir sig"). Stillingin „Stærð nýrra tákna" breytti aðeins NÝJUM táknum. Hér:
//   • hæð (tengd mynd) á sína sjálfgefnu stærð í skjápunktum Teikning-gluggans — sama tala og „Stærð tákna" þar
//     (`stimpilStaerd` hæðarinnar, 10–160) — og hvert úttektartákn hæðarinnar er `Teikning-px · taknEining` borðdílar;
//   • að breyta stærðinni skalar ÖLL úttektartákn hæðarinnar í einu um sama hlutfall, hvert um sína MIÐJU (staðan sem
//     vistast er miðjan), og eigin stærðir einstakra merkja (433 `staerd`) haldast í sama hlutfalli;
//   • „Vista í úttekt" skrifar `stimpilStaerd` hæðarinnar og `staerd` merkja sem víkja frá henni (uttekt.ts).
// Allt hér er hreint (engin store) — viðmótið (StaerdAllra.tsx) setur saman sögu og stöðu.

import { faerslaTakns, klemmaStaerd, STAERD_MAX, STAERD_MIN, STAERD_SJALF } from "./merkjasafn";
import type { BoardObject, ImageObject, SymbolObject } from "./types";
import {
  medStaerdUmMidju,
  myndirTengdar,
  myndTaknsins,
  stimpilStaerdTengingar,
  stimpillFyrirTakn,
  taknEiningMyndar,
} from "./uttekt";

/** Teikning-px klemmt í 10–160 án námundunar (stærð á milli heilla px helst nákvæm meðan dregið er). */
export function klemmaTeiknPx(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return STAERD_MIN;
  return Math.max(STAERD_MIN, Math.min(STAERD_MAX, n));
}

/** Úttektartákn: tengt tæki/merki úr úttektinni, eða tákn úr merkjasafni Teikning-gluggans (tæki + merki), eða eldra
 * tákn sem vistast sem stimpill. Hönnunarstaðir „165.BR1" (vinnugögn) og önnur tákn TurboPaint teljast ekki. */
export function erUttektarTakn(o: BoardObject): o is SymbolObject {
  if (o.type !== "symbol") return false;
  if (String(o.name || "").startsWith("165.BR1")) return false;
  if (o.uttektUnitId != null && o.uttektUnitId !== "") return true;
  if (faerslaTakns(o.symbolId)) return true;
  return !!stimpillFyrirTakn(o.symbolId, o.uttektSign);
}

/** Úttektartákn sem tilheyra tengdu myndinni (hæðinni) — öll úttektartákn borðsins þegar ein hæð er á því. */
export function taknHaedar(objects: BoardObject[], myndId: string): SymbolObject[] {
  const einMynd = myndirTengdar(objects).length <= 1;
  return objects.filter((o): o is SymbolObject => erUttektarTakn(o) && (einMynd || myndTaknsins(objects, o)?.id === myndId));
}

/** Teikning-px tákns (stærð á borðinu ÷ taknEining). */
export function teiknPxTakns(s: { size: number }, eining: number): number {
  return s.size / eining;
}

/** „Stærð allra merkja" hæðarinnar (Teikning-px): `stimpilStaerd` tengingarinnar; eldri tenging: stærð hæðarinnar í
 * úttektinni (`haedT`), annars sjálfgefin stærð Teikning-gluggans (56). */
export function staerdHaedar(mynd: ImageObject, haedT?: number | null): number {
  return stimpilStaerdTengingar(mynd.uttekt) || klemmaStaerd(haedT) || STAERD_SJALF;
}

/** Upphafsstaða dráttar: táknin eins og þau voru þegar byrjað var (svo hlutföll safnist ekki upp í námundun). */
export type StaerdarUpphaf = {
  myndId: string;
  T0: number;
  eining: number;
  takn: SymbolObject[];
};

/** Upphafsstaða fyrir hæðina. Eldri tenging (án `stimpilStaerd`, t.d. borð opnað úr listanum en ekki úr úttektinni):
 * táknin voru sett með eldri reglunni — sjálfgefin tákn hæðarinnar eru öll jafnstór og samsvara stærð hæðarinnar
 * (`haedT`), svo einingin er leidd af þeim (miðgildi tengdra tákna ÷ T0) og vörpunin helst nákvæm. */
export function upphafStaerdar(objects: BoardObject[], mynd: ImageObject, haedT?: number | null): StaerdarUpphaf | null {
  const takn = taknHaedar(objects, mynd.id);
  const T0 = staerdHaedar(mynd, haedT);
  if (stimpilStaerdTengingar(mynd.uttekt)) {
    const eining = taknEiningMyndar(mynd);
    return eining ? { myndId: mynd.id, T0, eining, takn } : null;
  }
  const tengd = takn
    .filter((s) => s.uttektUnitId != null && s.uttektUnitId !== "")
    .map((s) => s.size)
    .sort((a, b) => a - b);
  const eining = tengd.length ? tengd[tengd.length >> 1] / T0 : taknEiningMyndar(mynd);
  return eining && eining > 0 ? { myndId: mynd.id, T0, eining, takn } : null;
}

/** Eldri tenging → ný regla (stimpilStaerd + eining) án þess að hreyfa nokkurt tákn; null ef hún er þegar ný. */
export function uppfaerdTenging(objects: BoardObject[], mynd: ImageObject, haedT?: number | null): ImageObject | null {
  if (!mynd.uttekt || stimpilStaerdTengingar(mynd.uttekt)) return null;
  const u = upphafStaerdar(objects, mynd, haedT);
  return u ? { ...mynd, uttekt: tengingMedStaerd(mynd, u.T0, u.eining) } : null;
}

/** Ný „Stærð allra merkja" T1: hvert tákn hæðarinnar skalast um T1/T0 um miðju sína (Teikning-stærð hvers klemmd í
 * 10–160), og tengingin fær `stimpilStaerd` = T1 (og einingu + viðmið ef hún var eldri). Skilar uppfærðum hlutum
 * (tákn + mynd) eftir id — kallandinn setur þá á borðið. */
export function skalaAllaHaed(objects: BoardObject[], u: StaerdarUpphaf, T1: number): Map<string, BoardObject> {
  const T = klemmaTeiknPx(T1);
  const f = T / u.T0;
  const ut = new Map<string, BoardObject>();
  for (const s of u.takn) {
    const px = klemmaTeiknPx(teiknPxTakns(s, u.eining) * f);
    ut.set(s.id, medStaerdUmMidju(s, px * u.eining));
  }
  const mynd = objects.find((o): o is ImageObject => o.id === u.myndId && o.type === "image");
  if (mynd?.uttekt) ut.set(mynd.id, { ...mynd, uttekt: tengingMedStaerd(mynd, T, u.eining) });
  return ut;
}

/** „Jafna": öll úttektartákn hæðarinnar í sjálfgefnu stærðina (eigin stærðir einstakra merkja hverfa). */
export function jafnaHaed(objects: BoardObject[], u: StaerdarUpphaf): Map<string, BoardObject> {
  const ut = new Map<string, BoardObject>();
  for (const s of u.takn) ut.set(s.id, medStaerdUmMidju(s, u.T0 * u.eining));
  const mynd = objects.find((o): o is ImageObject => o.id === u.myndId && o.type === "image");
  if (mynd?.uttekt) ut.set(mynd.id, { ...mynd, uttekt: tengingMedStaerd(mynd, u.T0, u.eining) });
  return ut;
}

/** Tengingin með nýrri stærð. Eldri tenging (án stimpilStaerd) fær líka einingu og viðmið svo vistunin beri rétt saman. */
function tengingMedStaerd(mynd: ImageObject, T: number, eining: number) {
  const t = mynd.uttekt!;
  // stimpilStaerdVid fylgir óbreytt: vanti það (eldri tenging) ber vistunin saman við stærð hæðarinnar í úttektinni.
  return { ...t, stimpilStaerd: Math.round(T), taknEining: t.taknEining && t.taknEining > 0 ? t.taknEining : eining };
}

/** Minni / Stærri (±15 %, minnst 1 px) — klemmt í 10–160. */
export function skrefStaerdar(T: number, att: -1 | 1): number {
  const n = att < 0 ? Math.min(T - 1, Math.round(T * 0.85)) : Math.max(T + 1, Math.round(T * 1.15));
  return Math.round(klemmaTeiknPx(n));
}

/** Stærð valinna tákna (eiginleikaspjaldið): öll valin tákn fá stærðina `gildi` — Teikning-px á tengdri hæð (hvert
 * tákn með einingu sinnar hæðar), borðdílar annars — hvert um sína miðju. */
export function setjaStaerdValinna(objects: BoardObject[], ids: Iterable<string>, gildi: number): Map<string, BoardObject> {
  const ut = new Map<string, BoardObject>();
  const sel = new Set(ids);
  for (const o of objects) {
    if (!sel.has(o.id) || o.type !== "symbol") continue;
    const e = einingTakns(objects, o);
    const size = e ? klemmaTeiknPx(gildi) * e : Math.max(4, gildi);
    ut.set(o.id, medStaerdUmMidju(o, size));
  }
  return ut;
}

/** Skalar valin tákn um hlutfall (Minni / Stærri í eiginleikaspjaldinu), hvert um sína miðju. */
export function skalaValin(objects: BoardObject[], ids: Iterable<string>, f: number): Map<string, BoardObject> {
  const ut = new Map<string, BoardObject>();
  const sel = new Set(ids);
  for (const o of objects) {
    if (!sel.has(o.id) || o.type !== "symbol") continue;
    const e = einingTakns(objects, o);
    const size = e ? klemmaTeiknPx(teiknPxTakns(o, e) * f) * e : Math.max(4, o.size * f);
    ut.set(o.id, medStaerdUmMidju(o, size));
  }
  return ut;
}

/** Borðdílar á Teikning-px fyrir úttektartákn á tengdri hæð, annars null (laust tákn → borðdílar). */
export function einingTakns(objects: BoardObject[], s: SymbolObject): number | null {
  if (!erUttektarTakn(s)) return null;
  const m = myndTaknsins(objects, s);
  return m ? taknEiningMyndar(m) : null;
}

/** Eldri tengingar (án stimpilStaerd) myndanna sem valin tákn standa á, uppfærðar í nýju regluna — svo stærð sem er
 * stillt í eiginleikaspjaldinu vistist eins og hún er sýnd. `haedT(haedId)` = stimpilStaerd hæðarinnar í úttektinni. */
export function eldriTengingarValinna(
  objects: BoardObject[],
  ids: Iterable<string>,
  haedT: (haedId: string) => number | null | undefined
): Map<string, BoardObject> {
  const ut = new Map<string, BoardObject>();
  const sel = new Set(ids);
  for (const o of objects) {
    if (!sel.has(o.id) || !erUttektarTakn(o)) continue;
    const m = myndTaknsins(objects, o);
    if (!m || ut.has(m.id)) continue;
    const ny = uppfaerdTenging(objects, m, haedT(m.uttekt!.haedId));
    if (ny) ut.set(m.id, ny);
  }
  return ut;
}
