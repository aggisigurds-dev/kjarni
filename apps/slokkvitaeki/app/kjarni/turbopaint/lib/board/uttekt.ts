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
 * Veggir: TurboPaint er leiðréttingarborð hæðarinnar (Agnar 06.10.2026) — veggir Teikning-gluggans (pdfVeggir/veggir)
 * koma inn sem ritanlegir veggir þegar hæðin á engar veggjaLinur, og „Vista í úttekt" skrifar þá sem veggjaLinur +
 * `leidrett`.
 *
 * Tæki og merki (2. áfangi, Agnar 06.10.2026): tækjalisti staðarins (uttaeki) er í hliðarspjaldinu og tæki er sett á
 * teikninguna, fært eða tekið af. Merki hæðarinnar við vistun = öll tengd tæki á borðinu + stimplar Teikning-gluggans
 * (neyðarútgangur, ÚT, slöngumerki, rafmagnstafla, skilti …). Tákn TurboPaint sem samsvarar stimpli (TEIKNING_STIMPLAR)
 * vistast sem stimpill (`kind:'sign'`, `unitId:'s:<merki>:<id>'`) svo Teikning-glugginn sýnir það; tákn án samsvörunar
 * vistast ekki. Tæki/merki sem var á borðinu (`uttekt.merki`) en er horfið af því fer úr hæðinni. */

import { newId } from "./ids";
import { getSupabase } from "./supabase";
import {
  erStimpilMerki,
  faerslaLykils,
  faerslaTakns,
  fjold,
  grunnStaerdHaedar,
  klemmaStaerd,
  liturLykils,
  lykillFyrir,
  rotGradur,
  STAERD_SJALF,
  staerdABordi,
  staerdUrBordi,
  STIMPIL_LYKILL,
  STIMPLAR,
  stimpillSigns,
  symbolIdLykils,
  type Stimpill,
} from "./merkjasafn";
import { getSymbol } from "./symbols";
import { erVeggTegund, type FrumVeggur } from "./teikning-veggir";
import type { BoardObject, ImageObject, LineObject, SymbolObject, UttektTenging } from "./types";
import { erVeggur, VEGG_LITIR, VEGG_NOFN } from "./veggja-leidretting";

export type { UttektTenging };
export type UttektMerki = {
  unitId: number | string;
  x: number;
  y: number;
  kind?: string;
  sign?: string;
  color?: string;
  rot?: number;
  /** Eigin stærð merkis í Teikning-glugganum (skjápunktar, 24–160). */
  staerd?: number;
  /** Tákn sem notandinn valdi á tækið í Teikning-glugganum (434 lykill/stimpill). */
  takn?: string;
  [k: string]: unknown;
};
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
  /** Sjálfgefin stimpilstærð hæðarinnar í Teikning-glugganum (skjápunktar). */
  stimpilStaerd?: number;
  [k: string]: unknown;
};
export type UttektTaeki = { id: number; serial: string | null; type: string | null; status: string | null };
export type UttektStada = {
  x: number;
  y: number;
  unitId: number | string;
  kind?: string;
  sign?: string;
  /** Aðeins á NÝJUM stimplum (litur Teikning-gluggans); eldri merki halda sínum lit. */
  color?: string;
  /** Snúningur í gráðum (433 `rot`) — skrifast ef hann er annar en merkið hafði. */
  rot?: number;
  /** Eigin stærð merkis (433 `staerd`, skjápunktar Teikning-gluggans) — aðeins þegar táknið var stækkað/minnkað. */
  staerd?: number;
};

type MyndMedTengingu = ImageObject;
type TaknMedTaeki = SymbolObject;

/** Stimpill Teikning-gluggans (433 STIMPLAR) + táknið sem sýnir hann í TurboPaint (`teikn:<lykill>`, merkjasafn.ts).
 * Hvert merki á sitt eigið tákn — vörpunin er 1:1 í báðar áttir, segulloki meðtalinn. */
export interface TeikningStimpill extends Stimpill {
  symbolId: string;
}

export const TEIKNING_STIMPLAR: TeikningStimpill[] = STIMPLAR.map((st) => ({
  ...st,
  symbolId: symbolIdLykils(STIMPIL_LYKILL[st.id]),
}));

/** Eldri tákn TurboPaint (fyrir merkjasafnið) sem eru NÁKVÆMLEGA sama merki og stimpill Teikning-gluggans — sama nafn,
 * sama merking. Önnur eldri tákn (brunahnappur, brunaslanga sem tæki, neyðarljós …) eru aukatákn TurboPaint og vistast
 * ekki í úttektina; engin nálgun (brunahnappur ≠ viðvörunarbjalla). */
const ELDRI_JAFNGILD: Record<string, string> = {
  exit: "neyðarútgangur",
  electric: "rafmagn",
  "sign-extinguisher": "skilti_slt",
  "sign-hose": "skilti_slanga",
  detector: "reykskynjari",
};

export function stimpilDef(sign: string | null | undefined): TeikningStimpill | null {
  const st = stimpillSigns(sign);
  return st ? TEIKNING_STIMPLAR.find((x) => x.id === st.id) ?? null : null;
}

/** Ótengt tákn → stimpill Teikning-gluggans (eða null = vistast ekki). `uttektSign` ræður sé hann settur; annars
 * merki úr safninu (`teikn:<merki>`) 1:1, eða eldra jafngilt tákn. Tækjategundir safnsins eru ekki merki. */
export function stimpillFyrirTakn(symbolId: string, uttektSign?: string | null): string | null {
  if (uttektSign) return stimpilDef(uttektSign)?.id ?? uttektSign;
  const f = faerslaTakns(symbolId);
  if (f) return f.sign ?? null;
  return ELDRI_JAFNGILD[symbolId] ?? null;
}

/** Síðustu sex stafir raðnúmers (TMP-N5VABN → N5VABN) — merkimiði tækis á teikningunni og í listanum. */
export function stuttNumer(serial: string | null | undefined): string {
  return serial ? String(serial).slice(-6) : "";
}

/** Tegund tækis í kerfinu → tákn TurboPaint úr merkjasafninu, með SÖMU reglu og Teikning-glugginn (434 fjold):
 * léttvatn / duft / CO₂ / slanga, annars „annað tæki". */
export function symbolFyrirTegund(tegund: string | null | undefined): string {
  return symbolIdLykils(fjold(tegund));
}

/** FloorPlan-stimpill (kind=sign) → tákn TurboPaint (`teikn:<lykill>`). Óþekktur stimpill teiknast eins og í Teikning-
 * glugganum (lykill „annad"); stimpillinn sjálfur fylgir tákninu í `uttektSign` og vistast óbreyttur. */
export function symbolFyrirStimpil(sign: string | null | undefined): string {
  return symbolIdLykils(STIMPIL_LYKILL[String(sign || "")] || "annad");
}

export function erStimpil(m: { kind?: string; unitId?: unknown; sign?: string } | null | undefined): boolean {
  return erStimpilMerki(m);
}

/** Stimpill merkis: `sign`, annars miðhluti unitId (`s:<merki>:<id>`). */
export function stimpillMerkis(m: { sign?: string; unitId?: unknown }): string {
  if (m.sign) return m.sign;
  const s = String(m.unitId ?? "");
  return s.startsWith("s:") ? s.split(":")[1] || "" : "";
}

/** Merki → tákn, nákvæmlega eins og Teikning-glugginn velur það (434 lykillFyrir: `takn`, stimpill, tegund). */
export function symbolFyrirMerki(m: UttektMerki, tegund?: string | null): string {
  return symbolIdLykils(lykillFyrir(m, tegund));
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

/** Hliðrun frá upphafspunkti tákns (x, y) að miðju þess þegar það er snúið um `rot` gráður. Konva snýr hópnum um
 * upphafspunktinn og umbreytingarramminn heldur miðjunni kyrri, svo miðjan er (x, y) + R(rot)·(s/2, s/2). */
function midjuHlidrun(staerd: number, rot: number) {
  const a = ((Number(rot) || 0) * Math.PI) / 180;
  const h = staerd / 2;
  return { dx: h * Math.cos(a) - h * Math.sin(a), dy: h * Math.sin(a) + h * Math.cos(a) };
}

/** Merki (punktar frummyndar) → upphafspunktur tákns á borðinu, miðjað á staðnum (líka snúið, eins og 433 `rot`). */
export function merkiIBord(
  m: { x: number; y: number },
  mynd: { x: number; y: number; width: number; height: number },
  frum: { b: number; h: number },
  staerd: number,
  rot = 0
) {
  const h = midjuHlidrun(staerd, rot);
  return {
    x: mynd.x + (m.x / frum.b) * mynd.width - h.dx,
    y: mynd.y + (m.y / frum.h) * mynd.height - h.dy,
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

/** Tákn á borðinu → punktar frummyndar (miðja táknsins, líka þegar því er snúið). */
export function taknIMerki(
  takn: { x: number; y: number; size: number; rotation?: number },
  mynd: { x: number; y: number; width: number; height: number },
  frum: { b: number; h: number }
) {
  const h = midjuHlidrun(takn.size, takn.rotation || 0);
  return {
    x: Math.round(((takn.x + h.dx - mynd.x) / mynd.width) * frum.b),
    y: Math.round(((takn.y + h.dy - mynd.y) / mynd.height) * frum.h),
  };
}

/** Viðmið stærðar við vistun: stærð nýs tákns á borðinu og sjálfgefin stærð hæðarinnar í Teikning-glugganum. */
export type StaerdarVidmid = { grunnPx: number; grunnTeikning: number };

export function merkiFraTakni(s: TaknMedTaeki, p: { x: number; y: number }, vidmid?: StaerdarVidmid): UttektStada {
  const unitId = kodaUnitId(s.uttektUnitId);
  const stada: UttektStada = { x: p.x, y: p.y, unitId, rot: rotGradur(s.rotation) };
  if (vidmid && s.uttektPx && Math.abs(s.size - s.uttektPx) > 0.5) {
    stada.staerd = staerdUrBordi(s.size, vidmid.grunnPx, vidmid.grunnTeikning);
  }
  const sign = s.uttektSign || (typeof unitId === "string" && unitId.startsWith("s:") ? unitId.split(":")[1] : "");
  if (s.uttektKind === "sign" || s.uttektSign || (typeof unitId === "string" && unitId.startsWith("s:"))) {
    stada.kind = "sign";
    stada.sign = sign || undefined;
  }
  return stada;
}

/** Færir staðsetningar táknanna inn í hæðina. Tæki sem fær stöðu hér er tekið af ÖÐRUM hæðum (tæki er aðeins á einni
 * hæð — sama regla og ritillinn í appinu). Merki hæðarinnar sem á enga stöðu heldur sér, NEMA lykill þess sé í
 * `fjarlaegja` (það var á borðinu og var tekið af teikningunni). Óhreyfð merki halda nákvæmum hnitum sínum (líka
 * brotatölum úr appinu) svo merki fari óbreytt fram og til baka. */
export function uppfaeraHaedir(
  haedir: UttektHaed[],
  haedId: string,
  stodur: Map<string, UttektStada> | Map<number, { x: number; y: number }>,
  opts: { fjarlaegja?: Iterable<string> } = {}
) {
  const map = new Map<string, UttektStada>();
  stodur.forEach((s, k) => {
    const unitId = "unitId" in s && s.unitId != null ? kodaUnitId(s.unitId) : kodaUnitId(k);
    const stada: UttektStada = { x: s.x, y: s.y, unitId };
    if ("kind" in s && s.kind) stada.kind = s.kind;
    if ("sign" in s && s.sign) stada.sign = s.sign;
    if ("color" in s && s.color) stada.color = s.color;
    if ("rot" in s && s.rot != null) stada.rot = s.rot;
    if ("staerd" in s && s.staerd != null) stada.staerd = s.staerd;
    map.set(merkiLykill(unitId), stada);
  });
  const burt = new Set<string>();
  for (const k of opts.fjarlaegja ?? []) if (!map.has(k)) burt.add(k);
  let breytt = 0;
  let ny = 0;
  let tekin = 0;
  const ut = haedir.map((h) => {
    const merki = Array.isArray(h.markers) ? h.markers : [];
    if (h.id !== haedId) {
      const eftir = merki.filter((m) => !map.has(merkiLykill(m.unitId)));
      return eftir.length === merki.length ? h : { ...h, markers: eftir };
    }
    const sed = new Set<string>();
    const uppf: UttektMerki[] = [];
    for (const m of merki) {
      const key = merkiLykill(m.unitId);
      const s = map.get(key);
      sed.add(key);
      if (!s) {
        if (burt.has(key)) tekin++;
        else uppf.push(m);
        continue;
      }
      const kyrrt = s.x === Math.round(Number(m.x)) && s.y === Math.round(Number(m.y));
      const next: UttektMerki = { ...m, x: kyrrt ? m.x : s.x, y: kyrrt ? m.y : s.y, unitId: m.unitId };
      if (s.kind) next.kind = s.kind;
      if (s.sign) next.sign = s.sign;
      // Snúningur og eigin stærð (433 rot/staerd) breytast aðeins ef táknið var snúið eða stækkað á borðinu.
      const snuid = s.rot != null && s.rot !== rotGradur(m.rot);
      if (snuid) next.rot = s.rot;
      const staerd = s.staerd != null && s.staerd !== klemmaStaerd(m.staerd);
      if (staerd) next.staerd = s.staerd;
      if (!kyrrt || snuid || staerd) breytt++;
      uppf.push(next);
    }
    map.forEach((s, key) => {
      if (sed.has(key)) return;
      const merkiNy: UttektMerki = { unitId: s.unitId, x: s.x, y: s.y };
      if (s.kind) merkiNy.kind = s.kind;
      if (s.sign) merkiNy.sign = s.sign;
      if (s.color) merkiNy.color = s.color;
      // 433 skrifar rot á hvern stimpil (0 líka); á tæki aðeins ef því er snúið
      if (s.rot != null && (s.rot !== 0 || s.kind === "sign")) merkiNy.rot = s.rot;
      if (s.staerd != null) merkiNy.staerd = s.staerd;
      uppf.push(merkiNy);
      ny++;
    });
    return { ...h, markers: uppf };
  });
  return { haedir: ut, breytt, ny, tekin };
}

/** Nýtt stimpils-id á sniði Teikning-gluggans (433 setjaStimpil): `s:<merki>:<tími36><slembi4>`. */
export function nyttStimpilId(sign: string): string {
  return "s:" + sign + ":" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Hönnunarstaðir úr „SLT/BRSL af teikningunni" (165.BR1) eru vinnugögn, ekki merki á staðnum — þeir vistast ekki. */
function erHonnunarstadur(o: { name?: string }): boolean {
  return String(o.name || "").startsWith("165.BR1");
}

export type StodurBords = {
  /** Staðsetningar sem skrifast í hæðina (lykill = unitId sem strengur). */
  stodur: Map<string, UttektStada>;
  /** Allir tengdir lyklar á borðinu — líka falin tákn og tákn utan teikningar, sem halda fyrri stöðu og teljast EKKI
   * tekin af teikningunni. */
  aBordi: Set<string>;
  /** Ótengd tákn sem vistast sem nýir stimplar; borðið fær unitId þeirra eftir vistun (svo næsta vistun tvöfaldi ekki). */
  nyirStimplar: { objId: string; unitId: string; sign: string }[];
  /** Sýnileg tákn á teikningunni sem eiga hvorki tæki né stimpil — vistast ekki í úttekt. */
  otengd: number;
  /** Tengd tákn sem standa utan teikningar — staða þeirra er óbreytt. */
  utan: number;
  /** Afrit af tæki sem er þegar á borðinu (tæki er aðeins á einum stað) — fyrsta táknið gildir. */
  tvitekin: number;
};

/** Merki hæðarinnar eins og borðið sýnir þau: tengd tæki + stimplar (tengdir eða samsvarandi tákn). */
export function byggjaStodur(
  objects: BoardObject[],
  mynd: { x: number; y: number; width: number; height: number },
  frum: { b: number; h: number },
  nyttId: (sign: string) => string = nyttStimpilId,
  vidmid?: StaerdarVidmid
): StodurBords {
  const ut: StodurBords = { stodur: new Map(), aBordi: new Set(), nyirStimplar: [], otengd: 0, utan: 0, tvitekin: 0 };
  for (const o of objects) {
    if (o.type !== "symbol") continue;
    const s = o as TaknMedTaeki;
    const p = taknIMerki(s, mynd, frum);
    const inni = p.x >= 0 && p.y >= 0 && p.x <= frum.b && p.y <= frum.h;
    if (s.uttektUnitId != null && s.uttektUnitId !== "") {
      const unitId = kodaUnitId(s.uttektUnitId);
      const key = merkiLykill(unitId);
      if (!ut.aBordi.has(key)) {
        ut.aBordi.add(key);
        if (s.hidden) continue;
        if (!inni) {
          ut.utan++;
          continue;
        }
        ut.stodur.set(key, merkiFraTakni(s, p, vidmid));
        continue;
      }
      // Sami lykill aftur = afrit. Afrit af stimpli verður nýr stimpill; afrit af tæki vistast ekki.
      if (!erStimpil({ unitId, kind: s.uttektKind })) {
        ut.tvitekin++;
        continue;
      }
    }
    if (s.hidden || !inni) continue;
    const sign = erHonnunarstadur(s) ? null : stimpillFyrirTakn(s.symbolId, s.uttektSign || stimpillMerkis({ unitId: s.uttektUnitId }));
    if (!sign) {
      ut.otengd++;
      continue;
    }
    const unitId = nyttId(sign);
    const stada: UttektStada = { x: p.x, y: p.y, unitId, kind: "sign", sign, color: stimpilDef(sign)?.litur, rot: rotGradur(s.rotation) };
    if (vidmid && s.uttektPx && Math.abs(s.size - s.uttektPx) > 0.5) stada.staerd = staerdUrBordi(s.size, vidmid.grunnPx, vidmid.grunnTeikning);
    ut.stodur.set(unitId, stada);
    ut.aBordi.add(unitId);
    ut.nyirStimplar.push({ objId: s.id, unitId, sign });
  }
  return ut;
}

/** Merki hæðar → tákn á borðinu eins og Teikning-glugginn sýnir það: tákn úr merkjasafninu (434 lykillFyrir), plötulitur
 * merkisins (`color`), snúningur (`rot`) og eigin stærð (`staerd`, sama hlutfall við sjálfgefna stærð hæðarinnar og í
 * Teikning). Miðjað á staðnum og fest við myndina. Tæki fá síðustu sex stafi raðnúmers undir táknið. */
export function taknFyrirMerki(
  m: UttektMerki,
  taeki: UttektTaeki[],
  mynd: { id: string; x: number; y: number; width: number; height: number },
  frum: { b: number; h: number },
  staerd: number,
  grunnTeikning = STAERD_SJALF
): SymbolObject {
  const stimpill = erStimpil(m);
  const t = stimpill ? undefined : taeki.find((x) => merkiLykill(x.id) === merkiLykill(m.unitId));
  const lykill = lykillFyrir(m, t?.type);
  const symbolId = symbolIdLykils(lykill);
  const px = staerdABordi(m, staerd, grunnTeikning);
  const rot = rotGradur(m.rot);
  const stadur = merkiIBord(m, mynd, frum, px, rot);
  const s: SymbolObject = {
    id: newId(),
    type: "symbol",
    symbolId,
    x: stadur.x,
    y: stadur.y,
    size: px,
    label: stimpill ? "" : stuttNumer(t?.serial),
    rotation: rot,
    opacity: 1,
    locked: false,
    hidden: false,
    name: getSymbol(symbolId).name,
    parentId: mynd.id,
    uttektUnitId: m.unitId,
    uttektPx: px,
  };
  if (m.kind) s.uttektKind = m.kind;
  if (m.sign) s.uttektSign = m.sign;
  // Plötuliturinn eins og Teikning teiknar hann (434 teiknaMerki: `color`, annars litur lykilsins) — aðeins geymdur ef
  // hann víkur frá lit safnsins.
  const virkur = liturLykils(lykill, typeof m.color === "string" ? m.color : null).bg;
  const sjalf = faerslaLykils(lykill)?.litur.bg;
  if (virkur && virkur !== sjalf) s.uttektLitur = virkur;
  return s;
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

/** Stimpilstærð nýs tákns á borðinu: á borði tengdu úttekt sama stærð og tæki/merki hæðarinnar (miðað við húsið), svo
 * tákn úr slánni verði ekki margfalt stærri en hin; annars stimpilstærð notandans óbreytt. */
export function stimpilStaerdBords(objects: BoardObject[], bound: number): number {
  const m = finnaTengduMynd(objects);
  if (!m?.uttekt || !(m.uttekt.frumB > 0)) return bound;
  return stimpilStaerdABladi(m, bound, m.uttekt.skurdur, { b: m.uttekt.frumB, h: m.uttekt.frumH });
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

/** Hvað „Vista í úttekt" skrifar, reiknað úr borðinu og FERSKRI röð (án þess að skrifa): merki hæðarinnar = tengd tæki
 * + stimplar á borðinu; tæki sem var á borðinu (`uttekt.merki`) og er horfið fer úr hæðinni; tæki sem fær stöðu hér
 * fer af öðrum hæðum. Veggirnir fylgja (1. áfangi). Aðrar hæðir og annað á hæðinni er ósnert. */
export function utbuaVistun(
  objects: BoardObject[],
  haedir: UttektHaed[],
  kl: string,
  nyttId: (sign: string) => string = nyttStimpilId,
  stimpilBound = 56
) {
  const mynd = finnaTengduMynd(objects);
  if (!mynd || !mynd.uttekt) throw new Error("Þetta borð er ekki tengt úttektarteikningu.");
  const t = mynd.uttekt;
  if (!haedir.some((h) => h.id === t.haedId)) throw new Error("Hæðin er ekki lengur til í úttektinni — henni var eytt í appinu.");
  const frum = { b: t.frumB, h: t.frumH };
  const vidmid: StaerdarVidmid = {
    grunnPx: stimpilStaerdABladi(mynd, stimpilBound, t.skurdur, frum),
    grunnTeikning: grunnStaerdHaedar(haedir.find((h) => h.id === t.haedId)),
  };
  const b = byggjaStodur(objects, mynd, frum, nyttId, vidmid);
  const thekkt = Array.isArray(t.merki) ? t.merki : null;
  const fjarlaegja = thekkt ? thekkt.filter((k) => !b.aBordi.has(k)) : [];
  const u = uppfaeraHaedir(haedir, t.haedId, b.stodur, { fjarlaegja });
  // Veggirnir fylgja með, með tegund (veggur/gler/hurð), og hæðin merkist leiðrétt í TurboPaint — ef einhverjir eru á
  // borðinu; annars haldast þeir sem fyrir voru.
  const veggir = veggirIFrum(objects, mynd, frum);
  u.haedir = skrifaVeggiIHaed(u.haedir, t.haedId, veggir, kl);
  const haed = u.haedir.find((h) => h.id === t.haedId)!;
  return {
    tenging: t,
    haedir: u.haedir,
    fjoldi: b.stodur.size,
    breytt: u.breytt,
    ny: u.ny,
    tekin: u.tekin,
    otengd: b.otengd,
    utan: b.utan,
    tvitekin: b.tvitekin,
    veggir: veggir.length,
    nyirStimplar: b.nyirStimplar,
    /** Merki hæðarinnar sem borðið sýnir ekki (bættust við í appinu eftir opnun, eða eldra borð án `merki`). */
    utanBords: (haed.markers || []).filter((m) => !b.aBordi.has(merkiLykill(m.unitId))),
    /** Lyklar hæðarinnar sem borðið sýnir eftir vistun — verða `uttekt.merki`. */
    merkiABordi: (haed.markers || []).map((m) => merkiLykill(m.unitId)).filter((k) => b.aBordi.has(k)),
    anThekkingar: !thekkt,
  };
}

/** Skrifar staðsetningar tengdra tákna aftur í teikning_bord. Les röðina FERSKA fyrst svo breytingar úr appinu
 * (nýjar hæðir, skurður, veggir, merki sett eftir opnun) tapist ekki — aðeins `markers`/veggir tengdu hæðarinnar og
 * tækja sem fluttu breytast. */
export async function vistaIUttekt(objects: BoardObject[], stimpilBound = 56) {
  const mynd = finnaTengduMynd(objects);
  if (!mynd || !mynd.uttekt) throw new Error("Þetta borð er ekki tengt úttektarteikningu.");
  const t = mynd.uttekt;
  const sb = getSupabase();
  if (!sb) throw new Error("Engin tenging við gagnagrunn");
  const nu = await saekjaUttekt(t.companyId);
  const u = utbuaVistun(objects, nu.haedir, new Date().toISOString(), nyttStimpilId, stimpilBound);
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
  return { ...u, nafn: nu.nafn, taeki: nu.taeki };
}
