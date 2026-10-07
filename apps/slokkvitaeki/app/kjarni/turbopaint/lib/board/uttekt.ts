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
 *   veggur (lag „Veggir").veggTegund = veggur / gler / hurð → veggjaLinur[].tegund; eldveggur (ei60 / ei30) →
 *   veggjaLinur[] = { tegund: "veggur", eld: 60 | 30 } (sjá vistunarSnid í teikning-veggir.ts)
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
  erNyttLykill,
  erNyttMerki,
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
import { nyttMerkisId, stadsettirLyklar, TaekjaSjodur, TEGUND_HEITI, tegundTakns, type TaekjaTegund } from "./sjalftenging";
import { erVeggTegund, tegundUrVistun, vistunarSnid, type FrumVeggur } from "./teikning-veggir";
import type { BladHluti, BoardObject, ImageObject, LineObject, SymbolObject, UttektTenging } from "./types";
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
  /** „Nýtt": tæki sem á eftir að skrá (unitId `n:<lykill>:<id>`) — tillaga sem bíður samþykkis eiganda. */
  nytt?: boolean;
  /** Tegund Nýtt-tækis eins og tæki eru skráð (Léttvatn, ABC Duft, CO2, Brunaslanga). */
  tegund?: string;
  /** Staða Nýtt-tækis: „bid" = bíður samþykkis. */
  stada?: string;
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
  /** Nýtt-merki: tegundin (fylgir tákninu) — sjá UttektMerki.nytt. */
  nytt?: boolean;
  tegund?: string;
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

/** Svæði á blaðinu í dílum frummyndar (skurður hæðar eða skorinnar myndar). */
export type Svaedi = { x: number; y: number; w: number; h: number };
type Rammi = { x: number; y: number; width: number; height: number };

/** Nothæfur skurður skorinnar myndar, annars null (= myndin er allt blaðið). */
export function gilturSkurdur(s: Svaedi | null | undefined): Svaedi | null {
  if (!s) return null;
  if (![s.x, s.y, s.w, s.h].every((n) => Number.isFinite(n))) return null;
  return s.w > 0 && s.h > 0 ? s : null;
}

/** Svæðið sem myndin sýnir af blaðinu (dílar frummyndar): skurður skorinnar myndar, annars allt blaðið. */
export function svaediMyndar(frum: { b: number; h: number }, svaedi?: Svaedi | null): Svaedi {
  return gilturSkurdur(svaedi) ?? { x: 0, y: 0, w: frum.b, h: frum.h };
}

/** ALLT BLAÐIÐ í borðhnitum. Mynd sem var skorin úr blaðinu („Croppa oft") sýnir aðeins `svaedi` (dílar frummyndar);
 * sýndarblaðið nær þá út fyrir myndina í sama kvarða, svo hver vörpun er sú sama og áður:
 *   frum = svaedi.x + (borðX − mynd.x) / mynd.width · svaedi.w   (eins fyrir y).
 * Án svæðis er blaðið myndin sjálf — óbreytt hegðun. */
export function bladIBordi(mynd: Rammi, frum: { b: number; h: number }, svaedi?: Svaedi | null): Rammi {
  const s = gilturSkurdur(svaedi);
  if (!s || !(frum.b > 0) || !(frum.h > 0)) return { x: mynd.x, y: mynd.y, width: mynd.width, height: mynd.height };
  const kx = mynd.width / s.w, ky = mynd.height / s.h;
  return { x: mynd.x - s.x * kx, y: mynd.y - s.y * ky, width: frum.b * kx, height: frum.h * ky };
}

/** Er punkturinn (dílar frummyndar) innan svæðisins? */
export function innanSvaedis(p: { x: number; y: number }, s: Svaedi): boolean {
  return p.x >= s.x && p.y >= s.y && p.x <= s.x + s.w && p.y <= s.y + s.h;
}

/** Vörpun tengdrar myndar: stærð frummyndar, skurður myndarinnar (null = allt blaðið) og blaðið á borðinu. */
export function vorpunMyndar(mynd: ImageObject): { frum: { b: number; h: number }; svaedi: Svaedi | null; blad: Rammi } | null {
  const t = mynd.uttekt;
  if (!t || !(t.frumB > 0) || !(t.frumH > 0)) return null;
  const frum = { b: t.frumB, h: t.frumH };
  const svaedi = gilturSkurdur(t.myndSkurdur);
  return { frum, svaedi, blad: bladIBordi(mynd, frum, svaedi) };
}

/** Merki (punktar frummyndar) → upphafspunktur tákns á borðinu, miðjað á staðnum (líka snúið, eins og 433 `rot`).
 * `svaedi` = skurður myndarinnar þegar hún var skorin úr blaðinu (vantar = myndin er allt blaðið). */
export function merkiIBord(
  m: { x: number; y: number },
  mynd: Rammi,
  frum: { b: number; h: number },
  staerd: number,
  rot = 0,
  svaedi?: Svaedi | null
) {
  const h = midjuHlidrun(staerd, rot);
  const b = bladIBordi(mynd, frum, svaedi);
  return {
    x: b.x + (m.x / frum.b) * b.width - h.dx,
    y: b.y + (m.y / frum.h) * b.height - h.dy,
  };
}

/** Greindur veggur hæðar í punktum FRUMMYNDAR: p = [x0, y0, x1, y1, …] (miðlína), t = þykkt, tegund = veggur/gler/hurð.
 * TurboPaint er vélin sem greinir og leiðréttir veggina og skrifar þá í `haedir[].veggjaLinur`; Slökkvitæki-glugginn
 * (383) les þá og sýnir í 3D (Agnar 03.10.2026: „turboprint á að vera svona vinnuengine", „samnýta tæknina"). */
export type UttektVeggur = FrumVeggur;

/** Veggir tengdu myndarinnar → punktar frummyndar (heiltölur, svo röðin haldist lítil). Með fara veggir festir við
 * myndina og veggir teiknaðir ofan á hana án festingar (Veggja-tólið W); veggir annarra mynda ekki. Skorin mynd
 * (`svaedi`): hnitin fara um skurðinn og laus veggur fylgir aðeins ef miðja hans er á hlutanum sjálfum. */
export function veggirIFrum(
  objects: BoardObject[],
  mynd: { id: string; x: number; y: number; width: number; height: number },
  frum: { b: number; h: number },
  svaedi?: Svaedi | null
): UttektVeggur[] {
  const b = bladIBordi(mynd, frum, svaedi);
  const sv = svaediMyndar(frum, svaedi);
  const kx = frum.b / b.width, ky = frum.h / b.height;
  const ut: UttektVeggur[] = [];
  for (const o of objects) {
    if (!erVeggur(o) || o.hidden) continue;
    const p: number[] = [];
    for (let i = 0; i + 1 < o.points.length; i += 2) {
      p.push(Math.round((o.x + o.points[i] - b.x) * kx), Math.round((o.y + o.points[i + 1] - b.y) * ky));
    }
    if (o.parentId !== mynd.id) {
      if (o.parentId) continue;
      // án festingar: aðeins ef miðja veggjarins er á myndinni
      const n = p.length / 2;
      let sx = 0, sy = 0;
      for (let i = 0; i < p.length; i += 2) { sx += p[i]; sy += p[i + 1]; }
      if (!innanSvaedis({ x: sx / n, y: sy / n }, sv)) continue;
    }
    if (p.length >= 4) ut.push({ p, t: Math.max(1, Math.round(o.strokeWidth * kx)), ...vistunarSnid(o.veggTegund) });
  }
  return ut;
}

/** Veggjalínur hæðar → línur á borðinu, festar við myndina (sama útlit og „Veggir" gefur; gler blátt, hurð brún).
 * Skorin mynd (`svaedi`): hnitin fara um skurðinn. */
export function veggirIBord(
  veggir: UttektVeggur[],
  mynd: { id: string; x: number; y: number; width: number; height: number },
  frum: { b: number; h: number },
  svaedi?: Svaedi | null
): LineObject[] {
  const b = bladIBordi(mynd, frum, svaedi);
  const kx = b.width / frum.b, ky = b.height / frum.h;
  return veggir
    .filter((v) => Array.isArray(v.p) && v.p.length >= 4)
    .map((v) => {
      const tegund = erVeggTegund(v.tegund) || v.eld ? tegundUrVistun(v.tegund, v.eld) : "veggur";
      const lina: LineObject = {
        id: newId(),
        type: "polyline",
        x: 0,
        y: 0,
        points: v.p.map((n, i) => (i % 2 === 0 ? b.x + n * kx : b.y + n * ky)),
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
  frum: { b: number; h: number },
  svaedi?: Svaedi | null
): { x: number; y: number; width: number; height: number } | null {
  if (!sk || !(sk.w > 8) || !(sk.h > 8) || !(frum.b > 0) || !(frum.h > 0)) return null;
  const b = bladIBordi(mynd, frum, svaedi);
  const kx = b.width / frum.b, ky = b.height / frum.h;
  return { x: b.x + sk.x * kx, y: b.y + sk.y * ky, width: sk.w * kx, height: sk.h * ky };
}

/** Veggirnir skrifast í hæðina sem veggjaLinur og hún fær `leidrett` (Teikning veit þá að veggirnir voru leiðréttir í
 * TurboPaint). Aðrar hæðir og annað á hæðinni er ósnert. Engir veggir = ekkert breytist (þeir sem fyrir voru haldast). */
export function skrifaVeggiIHaed<T extends UttektHaed>(haedir: T[], haedId: string, veggir: UttektVeggur[], kl: string): T[] {
  if (!veggir.length) return haedir;
  const leidrett: UttektLeidrett = { af: "turbopaint", kl };
  return haedir.map((h) => (h.id === haedId ? { ...h, veggjaLinur: veggir, leidrett } : h));
}

/** Tákn á borðinu → punktar frummyndar (miðja táknsins, líka þegar því er snúið). Skorin mynd (`svaedi`): um skurðinn. */
export function taknIMerki(
  takn: { x: number; y: number; size: number; rotation?: number },
  mynd: Rammi,
  frum: { b: number; h: number },
  svaedi?: Svaedi | null
) {
  const h = midjuHlidrun(takn.size, takn.rotation || 0);
  const b = bladIBordi(mynd, frum, svaedi);
  return {
    x: Math.round(((takn.x + h.dx - b.x) / b.width) * frum.b),
    y: Math.round(((takn.y + h.dy - b.y) / b.height) * frum.h),
  };
}

/** Miðja tákns á borðinu (líka snúins). */
export function taknMidjaABordi(takn: { x: number; y: number; size: number; rotation?: number }) {
  const h = midjuHlidrun(takn.size, takn.rotation || 0);
  return { x: takn.x + h.dx, y: takn.y + h.dy };
}

/** Tákn með nýrri stærð og SÖMU miðju (líka snúið — upphafspunkturinn er efra vinstra horn fyrir snúning). */
export function medStaerdUmMidju<T extends { x: number; y: number; size: number; rotation?: number }>(takn: T, staerd: number): T {
  const c = taknMidjaABordi(takn);
  const h = midjuHlidrun(staerd, takn.rotation || 0);
  return { ...takn, size: staerd, x: c.x - h.dx, y: c.y - h.dy };
}

/** Viðmið stærðar við vistun: stærð nýs tákns á borðinu og sjálfgefin stærð hæðarinnar í Teikning-glugganum.
 * `alltaf` („Stærð allra merkja", tenging með `stimpilStaerd`): stærð hvers merkis er reiknuð beint úr stærð táknsins
 * (grunnPx = stimpilStaerd · taknEining) — ekki aðeins ef táknið var stækkað síðan við opnun. */
export type StaerdarVidmid = { grunnPx: number; grunnTeikning: number; alltaf?: boolean };

/** Á að reikna `staerd` merkis úr tákninu? Nýja reglan: alltaf; eldri: aðeins ef táknið var stækkað/minnkað. */
function reiknaStaerd(s: { size: number; uttektPx?: number }, vidmid?: StaerdarVidmid): vidmid is StaerdarVidmid {
  if (!vidmid) return false;
  if (vidmid.alltaf) return true;
  return !!s.uttektPx && Math.abs(s.size - s.uttektPx) > 0.5;
}

export function merkiFraTakni(s: TaknMedTaeki, p: { x: number; y: number }, vidmid?: StaerdarVidmid): UttektStada {
  const unitId = kodaUnitId(s.uttektUnitId);
  const stada: UttektStada = { x: p.x, y: p.y, unitId, rot: rotGradur(s.rotation) };
  if (reiknaStaerd(s, vidmid)) {
    stada.staerd = staerdUrBordi(s.size, vidmid.grunnPx, vidmid.grunnTeikning);
  }
  const sign = s.uttektSign || (typeof unitId === "string" && unitId.startsWith("s:") ? unitId.split(":")[1] : "");
  if (s.uttektKind === "sign" || s.uttektSign || (typeof unitId === "string" && unitId.startsWith("s:"))) {
    stada.kind = "sign";
    stada.sign = sign || undefined;
  }
  if (erNyttLykill(unitId)) {
    // Nýtt-tæki: tegundin fylgir tákninu (sé því breytt í annað tæki breytist tegundin líka)
    stada.nytt = true;
    stada.tegund = TEGUND_HEITI[tegundTakns(s.symbolId) ?? nyttTegundUrLykli(unitId)];
  }
  return stada;
}

/** Tegund úr Nýtt-lykli `n:<lykill>:<id>` (annað = „annad"). */
function nyttTegundUrLykli(unitId: unknown): TaekjaTegund {
  const l = String(unitId ?? "").split(":")[1] || "";
  return (["lettvatn", "duft", "co2", "slanga"] as string[]).includes(l) ? (l as TaekjaTegund) : "annad";
}

/** Færir staðsetningar táknanna inn í hæðina. Tæki sem fær stöðu hér er tekið af ÖÐRUM hæðum (tæki er aðeins á einni
 * hæð — sama regla og ritillinn í appinu). Merki hæðarinnar sem á enga stöðu heldur sér, NEMA lykill þess sé í
 * `fjarlaegja` (það var á borðinu og var tekið af teikningunni). Óhreyfð merki halda nákvæmum hnitum sínum (líka
 * brotatölum úr appinu) svo merki fari óbreytt fram og til baka. */
export function uppfaeraHaedir(
  haedir: UttektHaed[],
  haedId: string,
  stodur: Map<string, UttektStada> | Map<number, { x: number; y: number }>,
  opts: {
    fjarlaegja?: Iterable<string>;
    /** Sjálfgefin stærð hæðarinnar (Teikning-px) í nýju stærðarreglunni: `staerd` stöðu sem er jöfn virkri stærð merkisins
     * (eigin staerd, annars þessi) skrifast ekki — merki án eigin stærðar fylgja þá áfram stærð hæðarinnar. */
    grunnStaerd?: number;
  } = {}
) {
  const g = opts.grunnStaerd;
  const map = new Map<string, UttektStada>();
  stodur.forEach((s, k) => {
    const unitId = "unitId" in s && s.unitId != null ? kodaUnitId(s.unitId) : kodaUnitId(k);
    const stada: UttektStada = { x: s.x, y: s.y, unitId };
    if ("kind" in s && s.kind) stada.kind = s.kind;
    if ("sign" in s && s.sign) stada.sign = s.sign;
    if ("color" in s && s.color) stada.color = s.color;
    if ("rot" in s && s.rot != null) stada.rot = s.rot;
    if ("staerd" in s && s.staerd != null) stada.staerd = s.staerd;
    if ("nytt" in s && s.nytt) {
      stada.nytt = true;
      if (s.tegund) stada.tegund = s.tegund;
    }
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
      // Óhreyft = staða táknsins (heiltölur) er innan námundunar frá vistuðu hnitunum. Ekki `=== Math.round(m.x)`:
      // hnit á borð við 4000,5 námundast upp en vörpunin fram og til baka (líka um skurð) gefur 4000,4999… → 4000.
      const kyrrt = Math.abs(s.x - Number(m.x)) <= 0.5 + 1e-6 && Math.abs(s.y - Number(m.y)) <= 0.5 + 1e-6;
      const next: UttektMerki = { ...m, x: kyrrt ? m.x : s.x, y: kyrrt ? m.y : s.y, unitId: m.unitId };
      if (s.kind) next.kind = s.kind;
      if (s.sign) next.sign = s.sign;
      // Snúningur og eigin stærð (433 rot/staerd) breytast aðeins ef táknið var snúið eða stækkað á borðinu.
      const snuid = s.rot != null && s.rot !== rotGradur(m.rot);
      if (snuid) next.rot = s.rot;
      const virk = klemmaStaerd(m.staerd) || (g != null ? g : 0);
      const staerd = s.staerd != null && s.staerd !== virk;
      if (staerd) next.staerd = s.staerd;
      // Nýtt-tæki: tegundin fylgir tákninu; merkið heldur `nytt` og stöðunni (bíður samþykkis)
      const tegundBreytt = !!s.nytt && !!s.tegund && s.tegund !== m.tegund;
      if (s.nytt) {
        next.nytt = true;
        if (s.tegund) next.tegund = s.tegund;
        if (!next.stada) next.stada = "bid";
      }
      if (!kyrrt || snuid || staerd || tegundBreytt) breytt++;
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
      if (s.staerd != null && (g == null || s.staerd !== g)) merkiNy.staerd = s.staerd;
      if (s.nytt) {
        merkiNy.nytt = true;
        merkiNy.tegund = s.tegund;
        merkiNy.stada = "bid";
      }
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

/** Hönnunarmerki úr „SLT / BRSL af teikningu" (165.BR1: skilti, drægi, yfirlitsmiði) eru vinnugögn, ekki merki á staðnum
 * — þau vistast ekki og teljast ekki „án tengingar". (Tækin sem lesturinn setur eru venjuleg tækjatákn.) */
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
  /** Sýnileg tákn á teikningunni sem eiga hvorki tæki, stimpil né tækjategund — vistast ekki í úttekt. */
  otengd: number;
  /** Tengd tákn sem standa utan teikningar — staða þeirra er óbreytt. */
  utan: number;
  /** Afrit af tæki sem er þegar á borðinu (tæki er aðeins á einum stað) — fyrsta táknið gildir. */
  tvitekin: number;
  /** Sjálftenging: ótengt tækjatákn (eða Nýtt) sem fékk óstaðsett tæki af sömu tegund — borðið fær unitId eftir vistun. */
  sjalftengd: { objId: string; unitId: number; serial: string | null; type: string | null; varNytt: string | null }[];
  /** Tækjatákn sem fékk ekkert tæki og vistast sem NÝ Nýtt-merki — borðið fær n:-lykilinn eftir vistun. */
  nyttMerki: { objId: string; unitId: string; tegund: string }[];
  /** Öll Nýtt-merki hæðarinnar eftir vistun, eftir tegund (ný og eldri). */
  nytt: Partial<Record<TaekjaTegund, number>>;
};

/** Sjálftenging og Nýtt (Agnar 07.10.2026): tæki staðarins og FERSKAR hæðir úttektarinnar. Án hennar (eldri hegðun)
 * eru ótengd tækjatákn „án tengingar" og vistast ekki. */
export type SjalfTenging = { taeki: UttektTaeki[] | null; haedir: UttektHaed[]; nyttLykill?: (t: TaekjaTegund) => string };

/** Ein tengd mynd í vistun: myndin, stærð frummyndar, skurður hennar (null = allt blaðið) og stærðarviðmið. */
export type MyndILotu = {
  mynd: { id: string; x: number; y: number; width: number; height: number };
  frum: { b: number; h: number };
  svaedi?: Svaedi | null;
  vidmid?: StaerdarVidmid;
};

/** Hvaða tengdu mynd táknið tilheyrir þegar borðið ber margar hæðir („Croppa oft"): myndin sem miðja táknsins stendur
 * á (efsta), annars myndin sem það er fest við, annars sú fyrsta (þar telst það „utan teikningar"). */
function myndTakns(s: SymbolObject, lidir: MyndILotu[]): number {
  if (lidir.length < 2) return 0;
  const c = taknMidjaABordi(s);
  for (let i = lidir.length - 1; i >= 0; i--) {
    const m = lidir[i].mynd;
    if (c.x >= m.x && c.y >= m.y && c.x <= m.x + m.width && c.y <= m.y + m.height) return i;
  }
  const f = lidir.findIndex((l) => l.mynd.id === s.parentId);
  return f >= 0 ? f : 0;
}

/** Merki hverrar tengdrar myndar eins og borðið sýnir þau: tengd tæki + stimplar (tengdir eða samsvarandi tákn). Tákn
 * tilheyrir einni mynd (myndTakns) og vistast í hennar hæð; `aBordi` er sameiginlegt öllu borðinu (tæki er á einum
 * stað — afrit vistast ekki, og tákn sem stendur á annarri mynd telst ekki tekið af).
 *
 * Með `sjalf` (Vista í úttekt): hvert ótengt TÆKJAtákn — og hvert Nýtt-tákn — tengist óstaðsettu tæki af SÖMU tegund
 * (sjalftenging.ts: tæki á engri hæð og ekki tengt á borðinu, aldrei tvisvar, úrelt aldrei); fái það ekkert verður það
 * Nýtt-merki `{ unitId: "n:<lykill>:<id>", nytt: true, tegund, stada: "bid" }` — tæki eru aldrei búin til. */
export function byggjaStodurMargar(
  objects: BoardObject[],
  lidir: MyndILotu[],
  nyttId: (sign: string) => string = nyttStimpilId,
  sjalf?: SjalfTenging
): { hlutar: StodurBords[]; aBordi: Set<string> } {
  const aBordi = new Set<string>();
  const hlutar: StodurBords[] = lidir.map(() => ({
    stodur: new Map(),
    aBordi,
    nyirStimplar: [],
    otengd: 0,
    utan: 0,
    tvitekin: 0,
    sjalftengd: [],
    nyttMerki: [],
    nytt: {},
  }));
  if (!lidir.length) return { hlutar, aBordi };
  /** Tækjatákn sem fá tæki eða verða Nýtt — í röð borðsins, eftir að tengdu táknin eru talin. */
  const kostir: { s: TaknMedTaeki; i: number; p: { x: number; y: number }; nyttKey: string | null; tegund: TaekjaTegund }[] = [];
  for (const o of objects) {
    if (o.type !== "symbol") continue;
    const s = o as TaknMedTaeki;
    const i = myndTakns(s, lidir);
    const { mynd, frum, svaedi, vidmid } = lidir[i];
    const ut = hlutar[i];
    const p = taknIMerki(s, mynd, frum, svaedi);
    const inni = innanSvaedis(p, svaediMyndar(frum, svaedi));
    let afritNytts = false;
    if (s.uttektUnitId != null && s.uttektUnitId !== "") {
      const unitId = kodaUnitId(s.uttektUnitId);
      const key = merkiLykill(unitId);
      if (!aBordi.has(key)) {
        if (sjalf && erNyttLykill(key) && !s.hidden && inni) {
          // Nýtt-tákn: tengist skráðu tæki ef það er komið (sjálftenging), annars helst það Nýtt
          kostir.push({ s, i, p, nyttKey: key, tegund: tegundTakns(s.symbolId) ?? nyttTegundUrLykli(key) });
          continue;
        }
        aBordi.add(key);
        if (s.hidden) continue;
        if (!inni) {
          ut.utan++;
          continue;
        }
        ut.stodur.set(key, merkiFraTakni(s, p, vidmid));
        if (erNyttLykill(key)) {
          const t = tegundTakns(s.symbolId) ?? nyttTegundUrLykli(key);
          ut.nytt[t] = (ut.nytt[t] ?? 0) + 1;
        }
        continue;
      }
      // Sami lykill aftur = afrit. Afrit af stimpli verður nýr stimpill; afrit af Nýtt-tæki verður nýtt Nýtt-tæki;
      // afrit af tæki vistast ekki.
      afritNytts = erNyttLykill(key);
      if (!erStimpil({ unitId, kind: s.uttektKind }) && !afritNytts) {
        ut.tvitekin++;
        continue;
      }
    }
    if (s.hidden || !inni) continue;
    if (erHonnunarstadur(s)) continue;
    const tegund = tegundTakns(s.symbolId);
    if (sjalf && tegund && (afritNytts || !s.uttektSign)) {
      kostir.push({ s, i, p, nyttKey: null, tegund });
      continue;
    }
    const sign = stimpillFyrirTakn(s.symbolId, s.uttektSign || stimpillMerkis({ unitId: s.uttektUnitId }));
    if (!sign) {
      ut.otengd++;
      continue;
    }
    const unitId = nyttId(sign);
    const stada: UttektStada = { x: p.x, y: p.y, unitId, kind: "sign", sign, color: stimpilDef(sign)?.litur, rot: rotGradur(s.rotation) };
    if (reiknaStaerd(s, vidmid)) stada.staerd = staerdUrBordi(s.size, vidmid.grunnPx, vidmid.grunnTeikning);
    ut.stodur.set(unitId, stada);
    aBordi.add(unitId);
    ut.nyirStimplar.push({ objId: s.id, unitId, sign });
  }
  if (sjalf && kostir.length) {
    const sjodur = new TaekjaSjodur(sjalf.taeki ?? [], stadsettirLyklar(sjalf.haedir, objects));
    const nyLykill = sjalf.nyttLykill ?? nyttMerkisId;
    for (const k of kostir) {
      const { s, i, p } = k;
      const ut = hlutar[i];
      const vidmid = lidir[i].vidmid;
      const t = sjodur.taka([k.tegund]);
      if (t) {
        const key = merkiLykill(t.id);
        aBordi.add(key);
        ut.stodur.set(key, merkiFraTakni({ ...s, uttektUnitId: t.id, uttektKind: undefined, uttektSign: undefined }, p, vidmid));
        ut.sjalftengd.push({ objId: s.id, unitId: t.id, serial: t.serial, type: t.type, varNytt: k.nyttKey });
        continue;
      }
      const key = k.nyttKey ?? nyLykill(k.tegund);
      aBordi.add(key);
      ut.stodur.set(key, merkiFraTakni({ ...s, uttektUnitId: key, uttektKind: undefined, uttektSign: undefined }, p, vidmid));
      if (!k.nyttKey) ut.nyttMerki.push({ objId: s.id, unitId: key, tegund: TEGUND_HEITI[k.tegund] });
      ut.nytt[k.tegund] = (ut.nytt[k.tegund] ?? 0) + 1;
    }
  }
  return { hlutar, aBordi };
}

/** Merki hæðarinnar eins og borðið sýnir þau: tengd tæki + stimplar (tengdir eða samsvarandi tákn). Ein mynd — öll
 * tákn borðsins teljast til hennar. `svaedi` = skurður myndarinnar þegar hún var skorin úr blaðinu. */
export function byggjaStodur(
  objects: BoardObject[],
  mynd: { x: number; y: number; width: number; height: number },
  frum: { b: number; h: number },
  nyttId: (sign: string) => string = nyttStimpilId,
  vidmid?: StaerdarVidmid,
  svaedi?: Svaedi | null,
  sjalf?: SjalfTenging
): StodurBords {
  return byggjaStodurMargar(objects, [{ mynd: { id: "", ...mynd }, frum, svaedi, vidmid }], nyttId, sjalf).hlutar[0];
}

/** Merki hæðar → tákn á borðinu eins og Teikning-glugginn sýnir það: tákn úr merkjasafninu (434 lykillFyrir), plötulitur
 * merkisins (`color`), snúningur (`rot`) og eigin stærð (`staerd`, sama hlutfall við sjálfgefna stærð hæðarinnar og í
 * Teikning). Miðjað á staðnum og fest við myndina. Tæki fá síðustu sex stafi raðnúmers undir táknið. */
/** Miði Nýtt-tækis á borðinu (2D) — tillaga sem bíður samþykkis eiganda. */
export const NYTT_MIDI = "Nýtt";
/** Miði ótengds tækjatákns (enn hvorki tæki né Nýtt — ræðst við „Vista í úttekt"). */
export const OTENGT_MIDI = "ótengt";

export function taknFyrirMerki(
  m: UttektMerki,
  taeki: UttektTaeki[],
  mynd: { id: string; x: number; y: number; width: number; height: number },
  frum: { b: number; h: number },
  staerd: number,
  grunnTeikning = STAERD_SJALF,
  svaedi?: Svaedi | null
): SymbolObject {
  const stimpill = erStimpil(m);
  const nytt = !stimpill && erNyttMerki(m);
  const t = stimpill || nytt ? undefined : taeki.find((x) => merkiLykill(x.id) === merkiLykill(m.unitId));
  // Nýtt-merki: tákn tegundarinnar (434 lykillFyrir les `tegund`), miðinn „Nýtt"
  const lykill = lykillFyrir(m, t?.type);
  const symbolId = symbolIdLykils(lykill);
  const px = staerdABordi(m, staerd, grunnTeikning);
  const rot = rotGradur(m.rot);
  const stadur = merkiIBord(m, mynd, frum, px, rot, svaedi);
  const s: SymbolObject = {
    id: newId(),
    type: "symbol",
    symbolId,
    x: stadur.x,
    y: stadur.y,
    size: px,
    label: stimpill ? "" : nytt ? NYTT_MIDI : stuttNumer(t?.serial),
    rotation: rot,
    opacity: 1,
    locked: false,
    hidden: false,
    name: nytt ? `Nýtt · ${typeof m.tegund === "string" && m.tegund ? m.tegund : getSymbol(symbolId).name} (í bið)` : getSymbol(symbolId).name,
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
  const kv = (bound > 0 ? bound : 56) / 56;
  return Math.max(24, Math.round(husEining(mynd, skurdur, frum) * kv));
}

/** Borðstærð merkis sem er 56 px í Teikning-glugganum (STAERD_SJALF): lengri hlið skurðar hæðarinnar ÷ 28, án skurðar
 * lengri hlið blaðsins ÷ 40 (`mynd` = allt blaðið á borðinu). Línulegt — engin námundun né lágmark. */
export function husEining(
  mynd: { width: number; height: number },
  skurdur?: { w: number; h: number } | null,
  frum?: { b: number; h: number } | null
): number {
  const long = Math.max(mynd.width || 0, mynd.height || 0, 1);
  const k = frum && frum.b > 0 ? (mynd.width || 0) / frum.b : 0;
  return skurdur && skurdur.w > 8 && skurdur.h > 8 && k > 0 ? (Math.max(skurdur.w, skurdur.h) * k) / 28 : long / 40;
}

/** Borðdílar á hvern skjádíl Teikning-gluggans: tákn sem er `s` px í Teikning (stimpilStaerd hæðar eða eigin staerd) er
 * `s · taknEiningABladi(…)` borðdílar í TurboPaint — sama vörpun og stimpilStaerdABladi, línuleg í báðar áttir. */
export function taknEiningABladi(
  blad: { width: number; height: number },
  skurdur?: { w: number; h: number } | null,
  frum?: { b: number; h: number } | null
): number {
  return husEining(blad, skurdur, frum) / STAERD_SJALF;
}

/** „Stærð allra merkja" tengingarinnar (Teikning-px, 10–160), eða null ef tengingin er eldri en reglan. */
export function stimpilStaerdTengingar(t: UttektTenging | null | undefined): number | null {
  return (t && klemmaStaerd(t.stimpilStaerd)) || null;
}

/** Borðdílar á Teikning-díl fyrir tengda mynd: geymd eining tengingarinnar (sett við opnun), annars reiknuð. */
export function taknEiningMyndar(m: ImageObject): number | null {
  const t = m.uttekt;
  if (t?.taknEining && t.taknEining > 0) return t.taknEining;
  const v = vorpunMyndar(m);
  return v ? taknEiningABladi(v.blad, t?.skurdur, v.frum) : null;
}

/** Stimpilstærð nýs tákns á borðinu: á borði tengdu úttekt sama stærð og tæki/merki hæðarinnar (miðað við húsið), svo
 * tákn úr slánni verði ekki margfalt stærri en hin; annars stimpilstærð notandans óbreytt. Mörg hús á borðinu („Croppa
 * oft"): stærð hæðarinnar sem `vid` (heimspunktur) stendur á. */
export function stimpilStaerdBords(objects: BoardObject[], bound: number, vid?: { x: number; y: number }): number {
  const m = (vid && myndUndir(objects, vid)) || finnaTengduMynd(objects);
  return m ? stimpilStaerdMyndar(m, bound) : bound;
}

/** Stimpilstærð tengdrar myndar (miðað við húsið — skurð hæðarinnar), líka skorinnar. Tenging með „Stærð allra merkja"
 * (`stimpilStaerd`): sú stærð hæðarinnar · taknEining — óháð stimpilstærð TurboPaint (`bound`). */
export function stimpilStaerdMyndar(m: ImageObject, bound: number): number {
  const t = m.uttekt;
  if (t?.stimpilStaerd) {
    const e = taknEiningMyndar(m);
    if (e) return t.stimpilStaerd * e;
  }
  const v = vorpunMyndar(m);
  if (!v) return bound;
  return stimpilStaerdABladi(v.blad, bound, m.uttekt?.skurdur, v.frum);
}

/** Tengda myndin sem táknið tilheyrir (sama regla og vistunin: myndin sem miðjan stendur á, annars sú sem það er fest
 * við, annars fyrsta tengda myndin). null = borðið er ekki tengt úttekt. */
export function myndTaknsins(objects: BoardObject[], s: SymbolObject): ImageObject | null {
  const myndir = myndirTengdar(objects);
  if (!myndir.length) return null;
  const i = myndTakns(s, myndir.map((m) => ({ mynd: m, frum: { b: m.uttekt!.frumB, h: m.uttekt!.frumH } })));
  return myndir[i] ?? null;
}

/** Tengdar myndir borðsins (hver tengd sinni hæð), í röð borðsins. */
export function myndirTengdar(objects: BoardObject[]): ImageObject[] {
  return objects.filter((o): o is ImageObject => o.type === "image" && !!(o as ImageObject).uttekt);
}

/** Tengda myndin sem heimspunkturinn stendur á (efsta), eða null. */
export function myndUndir(objects: BoardObject[], p: { x: number; y: number }): ImageObject | null {
  const m = myndirTengdar(objects);
  for (let i = m.length - 1; i >= 0; i--) {
    const o = m[i];
    if (!o.hidden && p.x >= o.x && p.y >= o.y && p.x <= o.x + o.width && p.y <= o.y + o.height) return o;
  }
  return null;
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

/** Nýtt hæðar-id á sniði Teikning-gluggans (383 nyttId): `h<tími36><slembi3>`. */
export function nyttHaedId(): string {
  return "h" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

/** Sama blað? (sami permalink skjalasafnsins, eða nákvæmlega sama slóð) */
export function samaBlad(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const ia = innflutningsSlod(a);
  return !!ia && ia === innflutningsSlod(b);
}

/** image_url blaðs í teikning_bord út frá permalinki skjalasafnsins — sama snið og Teikning-glugginn (374/384). */
export function myndSlodBlads(slod: string | null | undefined): string | null {
  if (!slod || !/^https?:\/\//i.test(slod)) return null;
  // Hrein PDF utan Reykjavíkur (Hafnarfjörður) fara ekki um teikn-mynd í Teikning-glugganum — engin slóð þá.
  if (/\.pdf$/i.test(slod) && !/skjalasafn\.reykjavik\.is/i.test(slod)) return null;
  return "/.netlify/functions/teikn-mynd?url=" + encodeURIComponent(slod);
}

/** Númer hæðar úr nafni („2. hæð" → 2, „Kjallari" → null). */
export function haedNumer(nafn: string | null | undefined): number | null {
  const m = /^\s*(\d+)\s*\.\s*h[æa]/i.exec(String(nafn || ""));
  return m ? Number(m[1]) : null;
}

/** Tillaga að nafni nýrrar hæðar: næsta „N. hæð" á eftir hæstu tölusettu hæðinni (líka nýjum á borðinu). */
export function tillagaHaedarNafns(nofn: (string | null | undefined)[]): string {
  let mest = 0;
  for (const n of nofn) mest = Math.max(mest, haedNumer(n) ?? 0);
  return `${mest + 1}. hæð`;
}

/** Hæð sem fær SKORINN hluta blaðs („Croppa oft"): blaðið (image_url), stærð frummyndar og skurðurinn = hlutinn —
 * handvalinn skurður eins og í Teikning-glugganum (383: sjalf=false, ekki „þétt"), svo sjálfvirkur skurður skrifi ekki
 * yfir hann. Fari hæðin á ANNAÐ blað falla skurður og veggir gömlu teikningarinnar út, sama regla og 383 (merkin
 * haldast). Annað á hæðinni er ósnert. */
export function stillaBladHaedar(h: UttektHaed, bh: BladHluti, skurdur: Svaedi): UttektHaed {
  const sk = { x: Math.round(skurdur.x), y: Math.round(skurdur.y), w: Math.round(skurdur.w), h: Math.round(skurdur.h) };
  const n: UttektHaed = { ...h, frum: { b: bh.frumB, h: bh.frumH }, skurdur: sk, sjalf: false };
  delete n.thett;
  if (bh.imageUrl) {
    if (h.image_url && !samaBlad(h.image_url, bh.imageUrl)) {
      n.veggir = [];
      n.pdfVeggir = [];
      delete n.veggjaLinur;
      delete n.leidrett;
      delete n.eldVal;
      delete n.pdfFlokkar;
    }
    n.image_url = bh.imageUrl;
  }
  return n;
}

/** Ný hæð í teikning_bord á sniði Teikning-gluggans (383: { id, nafn, image_url, markers: [], skurdur, veggir: [] }). */
export function nyHaedFraHluta(id: string, nafn: string, bh: BladHluti, skurdur: Svaedi): UttektHaed {
  return stillaBladHaedar({ id, nafn, image_url: bh.imageUrl ?? null, markers: [], skurdur: null, veggir: [], pdfVeggir: [] }, bh, skurdur);
}

/** Hluti vistunar: ein tengd mynd og hæðin hennar. */
export type VistunarHluti = {
  myndId: string;
  haedId: string;
  nafn: string;
  /** Hæðin var ný (+ Ný hæð) og bættist við í þessari vistun. */
  ny: boolean;
  fjoldi: number;
  veggir: number;
  /** Merki hæðarinnar sem borðið sýnir ekki (bættust við í appinu eftir opnun, eða eldra borð án `merki`). */
  utanBords: UttektMerki[];
  /** Lyklar hæðarinnar sem borðið sýnir eftir vistun — verða `uttekt.merki` myndarinnar. */
  merkiABordi: string[];
  anThekkingar: boolean;
};

/** Hvað „Vista í úttekt" skrifar, reiknað úr borðinu og FERSKRI röð (án þess að skrifa): merki hæðarinnar = tengd tæki
 * + stimplar á borðinu; tæki sem var á borðinu (`uttekt.merki`) og er horfið fer úr hæðinni; tæki sem fær stöðu hér
 * fer af öðrum hæðum. Veggirnir fylgja (1. áfangi). Aðrar hæðir og annað á hæðinni er ósnert.
 *
 * Margar hæðir á einu borði („Croppa oft"): hver tengd mynd skrifar SÍNA hæð — tákn og veggir sem standa á henni,
 * varpað um skurð hennar. Skorin mynd (`bladhluti`) skrifar líka blaðið, frum og skurðinn (= hlutann) í hæðina; ný hæð
 * (`nyHaed`) bætist aftast. Aðeins hæðir sem eru tengdar á borðinu breytast — engri hæð er eytt.
 *
 * `sjalf` (tæki staðarins): ótengd tækjatákn tengjast óstaðsettum tækjum af sömu tegund, og það sem ekki fær tæki
 * vistast sem Nýtt-merki (byggjaStodurMargar). Án þess: eldri hegðun (ótengd tákn vistast ekki). */
export function utbuaVistun(
  objects: BoardObject[],
  haedir: UttektHaed[],
  kl: string,
  nyttId: (sign: string) => string = nyttStimpilId,
  stimpilBound = 56,
  sjalf?: { taeki: UttektTaeki[] | null; nyttLykill?: (t: TaekjaTegund) => string }
) {
  const myndir = myndirTengdar(objects);
  if (!myndir.length) throw new Error("Þetta borð er ekki tengt úttektarteikningu.");
  const nafnHaedar = (id: string, m?: ImageObject) =>
    haedir.find((h) => h.id === id)?.nafn || m?.uttekt?.nyHaed?.nafn || "hæð";
  const cid = myndir[0].uttekt!.companyId;
  const sed = new Set<string>();
  for (const m of myndir) {
    const t = m.uttekt!;
    if (t.companyId !== cid) throw new Error("Myndirnar á borðinu eru tengdar ólíkum stöðum — vistaðu hvern stað á sínu borði.");
    if (sed.has(t.haedId)) {
      throw new Error(`Tvær myndir á borðinu eru tengdar „${nafnHaedar(t.haedId, m)}“ — tengdu aðra þeirra við aðra hæð.`);
    }
    sed.add(t.haedId);
  }
  // Nýjar hæðir (+ Ný hæð) bætast aftast, í röð hæðanúmera; hæð sem var eytt í appinu stöðvar vistunina.
  const nyjar: { mynd: ImageObject; haed: UttektHaed }[] = [];
  for (const m of myndir) {
    const t = m.uttekt!;
    if (haedir.some((h) => h.id === t.haedId)) continue;
    if (!t.nyHaed || !m.bladhluti || !gilturSkurdur(t.myndSkurdur)) {
      throw new Error("Hæðin er ekki lengur til í úttektinni — henni var eytt í appinu.");
    }
    nyjar.push({ mynd: m, haed: nyHaedFraHluta(t.haedId, t.nyHaed.nafn, m.bladhluti, t.myndSkurdur!) });
  }
  nyjar.sort((a, b) => (haedNumer(a.haed.nafn) ?? 999) - (haedNumer(b.haed.nafn) ?? 999));
  let hs: UttektHaed[] = [...haedir, ...nyjar.map((n) => n.haed)];
  // Skornar myndir: blaðið, frum og skurðurinn (= hlutinn) í hæðina.
  for (const m of myndir) {
    const t = m.uttekt!;
    const sk = gilturSkurdur(t.myndSkurdur);
    if (!m.bladhluti || !sk) continue;
    hs = hs.map((h) => (h.id === t.haedId ? stillaBladHaedar(h, m.bladhluti!, sk) : h));
  }
  const lidir: MyndILotu[] = myndir.map((m) => {
    const t = m.uttekt!;
    const frum = { b: t.frumB, h: t.frumH };
    const svaedi = gilturSkurdur(t.myndSkurdur);
    const T = stimpilStaerdTengingar(t);
    const e = T ? taknEiningMyndar(m) : null;
    return {
      mynd: m,
      frum,
      svaedi,
      // „Stærð allra merkja": stærð hvers merkis = táknið ÷ taknEining (Teikning-px); annars eldri reglan.
      vidmid:
        T && e
          ? { grunnPx: T * e, grunnTeikning: T, alltaf: true }
          : {
              grunnPx: stimpilStaerdABladi(bladIBordi(m, frum, svaedi), stimpilBound, t.skurdur, frum),
              grunnTeikning: grunnStaerdHaedar(hs.find((h) => h.id === t.haedId)),
            },
    };
  });
  const b = byggjaStodurMargar(objects, lidir, nyttId, sjalf ? { taeki: sjalf.taeki, haedir: hs, nyttLykill: sjalf.nyttLykill } : undefined);
  // Nýtt-merki sem fengu skráð tæki (sjálftenging) fara úr hæðinni — tækið kemur í staðinn
  const nyttTengd = b.hlutar.flatMap((h) => h.sjalftengd.flatMap((x) => (x.varNytt ? [x.varNytt] : [])));
  let breytt = 0, ny = 0, tekin = 0, veggirAlls = 0;
  /** Hæðir sem fengu nýja stimpilStaerd („Stærð allra merkja"). */
  const stimpilBreytt: string[] = [];
  const veggjaFjoldi: number[] = [];
  const thekking: (string[] | null)[] = [];
  myndir.forEach((m, i) => {
    const t = m.uttekt!;
    const thekkt = Array.isArray(t.merki) ? t.merki : null;
    thekking.push(thekkt);
    const fjarlaegja = [...(thekkt ? thekkt.filter((k) => !b.aBordi.has(k)) : []), ...nyttTengd];
    const T = lidir[i].vidmid?.alltaf ? lidir[i].vidmid!.grunnTeikning : undefined;
    const u = uppfaeraHaedir(hs, t.haedId, b.hlutar[i].stodur, { fjarlaegja, grunnStaerd: T });
    hs = u.haedir;
    // „Stærð allra merkja" breytt á borðinu → stimpilStaerd hæðarinnar (Teikning sýnir þá sömu stærð); annars ósnert.
    if (T != null && T !== (t.stimpilStaerdVid ?? grunnStaerdHaedar(hs.find((h) => h.id === t.haedId)))) {
      hs = hs.map((h) => (h.id === t.haedId ? { ...h, stimpilStaerd: T } : h));
      stimpilBreytt.push(t.haedId);
    }
    breytt += u.breytt;
    ny += u.ny;
    tekin += u.tekin;
    // Veggirnir fylgja með, með tegund (veggur/gler/hurð), og hæðin merkist leiðrétt í TurboPaint — ef einhverjir eru
    // á myndinni; annars haldast þeir sem fyrir voru.
    const veggir = veggirIFrum(objects, m, lidir[i].frum, lidir[i].svaedi);
    hs = skrifaVeggiIHaed(hs, t.haedId, veggir, kl);
    veggjaFjoldi.push(veggir.length);
    veggirAlls += veggir.length;
  });
  const nyjarIds = new Set(nyjar.map((n) => n.haed.id));
  const hlutar: VistunarHluti[] = myndir.map((m, i) => {
    const t = m.uttekt!;
    const haed = hs.find((h) => h.id === t.haedId)!;
    return {
      myndId: m.id,
      haedId: t.haedId,
      nafn: haed.nafn || nafnHaedar(t.haedId, m),
      ny: nyjarIds.has(t.haedId),
      fjoldi: b.hlutar[i].stodur.size,
      veggir: veggjaFjoldi[i],
      utanBords: (haed.markers || []).filter((mk) => !b.aBordi.has(merkiLykill(mk.unitId))),
      merkiABordi: (haed.markers || []).map((mk) => merkiLykill(mk.unitId)).filter((k) => b.aBordi.has(k)),
      anThekkingar: !thekking[i],
    };
  });
  const summa = (f: (s: StodurBords) => number) => b.hlutar.reduce((s, h) => s + f(h), 0);
  return {
    tenging: myndir[0].uttekt!,
    haedir: hs,
    fjoldi: summa((h) => h.stodur.size),
    breytt,
    ny,
    tekin,
    otengd: summa((h) => h.otengd),
    utan: summa((h) => h.utan),
    tvitekin: summa((h) => h.tvitekin),
    veggir: veggirAlls,
    nyirStimplar: b.hlutar.flatMap((h) => h.nyirStimplar),
    /** Merki (fyrstu) hæðarinnar sem borðið sýnir ekki — sjá `hlutar` fyrir hverja hæð. */
    utanBords: hlutar[0].utanBords,
    /** Lyklar (fyrstu) hæðarinnar sem borðið sýnir eftir vistun. */
    merkiABordi: hlutar[0].merkiABordi,
    anThekkingar: hlutar[0].anThekkingar,
    /** Ein færsla á hverja tengda mynd/hæð. */
    hlutar,
    /** Hæðir sem bættust við (+ Ný hæð). */
    nyjarHaedir: nyjar.map((n) => n.haed.id),
    /** Hæðir sem fengu nýja `stimpilStaerd` (Stærð allra merkja breytt á borðinu). */
    stimpilBreytt,
    /** Sjálftengd tákn (fá unitId tækisins á borðinu eftir vistun). */
    sjalftengd: b.hlutar.flatMap((h) => h.sjalftengd),
    /** Ný Nýtt-merki (fá n:-lykilinn á borðinu eftir vistun). */
    nyttMerki: b.hlutar.flatMap((h) => h.nyttMerki),
    /** Öll Nýtt-tæki á vistuðu hæðunum eftir tegund — tillaga sem bíður samþykkis (upplýsingalína / tilboð). */
    nytt: b.hlutar.reduce<Partial<Record<TaekjaTegund, number>>>((s, h) => {
      for (const [k, n] of Object.entries(h.nytt) as [TaekjaTegund, number][]) s[k] = (s[k] ?? 0) + n;
      return s;
    }, {}),
  };
}

/** Skrifar staðsetningar tengdra tákna aftur í teikning_bord. Les röðina FERSKA fyrst svo breytingar úr appinu
 * (nýjar hæðir, skurður, veggir, merki sett eftir opnun) tapist ekki — aðeins `markers`/veggir tengdu hæðanna og
 * tækja sem fluttu breytast (og blað/skurður skorinna hluta, og nýjar hæðir aftast). */
export async function vistaIUttekt(objects: BoardObject[], stimpilBound = 56) {
  const mynd = finnaTengduMynd(objects);
  if (!mynd || !mynd.uttekt) throw new Error("Þetta borð er ekki tengt úttektarteikningu — tengdu hlutana við hæðir fyrst.");
  const t = mynd.uttekt;
  const sb = getSupabase();
  if (!sb) throw new Error("Engin tenging við gagnagrunn");
  const nu = await saekjaUttekt(t.companyId);
  // Sjálftenging við tæki staðarins (ferskur listi): ótengd tækjatákn → óstaðsett tæki af sömu tegund, afgangurinn Nýtt
  const u = utbuaVistun(objects, nu.haedir, new Date().toISOString(), nyttStimpilId, stimpilBound, { taeki: nu.taeki });
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
