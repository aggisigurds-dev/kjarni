// Hús í þrívídd úr borðinu (Agnar 03.10.2026: „setja slökkvitækin á réttu staðina og geta 3d renderað betur sem sýna þá
// slökkvitækin á öllum hæðum"). Hrein gagnavinnsla — veit ekkert um three.js: hver teikning sem ber veggi eða tæki verður
// hæð; veggir (greindar miðlínur, handdregnir veggir, eldveggir) verða bútar með þykkt; tákn verða tæki. Hnit eru í
// borðseiningum MIÐAÐ VIÐ MIÐJU teikningarinnar, svo hæðir úr sama teikningasetti lenda hver ofan á annarri.
//
// 3. áfangi (Agnar 06.10.2026 — TurboPaint verður eina vinnuborð grunnmynda): sama þrívídd og Teikning-glugginn í
// Slökkvitæki-appinu (383 syna3d). Héðan koma: tegund veggjar (veggur / gler / hurð), eldflokkur (EI-60 / EI-30 úr
// eldveggjamerkingum borðsins), gerð tækjalíkans úr merkjasafninu (433/434), miðatexti og -litur eins og í Teikning,
// festing tækis á næsta vegg (383 festaAVegg) og RAUNHÆÐ veggja: dílar á metra úr kvarða borðsins, blaðstærð
// (teikn-blad / PDF-síðan í 1:100) eða A1-ágiskun — með sömu trúverðugleikamörkum og 383 (hús 4–300 m).

import { objectsOnDocument } from "./geometry";
import { lykillTakns, STIMPLAR, stimpillSigns } from "./merkjasafn";
import { getSymbol, symbolPaint } from "./symbols";
import { dilarAMetraGisk } from "./teikning-veggir";
import type { BoardObject, ImageObject, LineObject, SymbolObject } from "./types";
import { innflutningsSlod } from "./uttekt";

export type VeggTegund3D = "veggur" | "gler" | "hurd";
/** Eldflokkur veggjar í mínútum: 60 = EI-60, 30 = EI-30, 0 = ekki brunaveggur (eða óþekktur flokkur). */
export type Eldflokkur = 0 | 30 | 60;

export interface Veggbutur {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  thykkt: number;
  /** Litur merkingar sem stendur sjálf (eldveggjamerking án veggjar undir); annars ræður tegund/eldflokkur litnum. */
  litur: string;
  tegund: VeggTegund3D;
  /** Eldflokkur úr eldveggjamerkingu borðsins sem liggur eftir veggnum (eða merkingunni sjálfri). */
  eld: Eldflokkur;
  /** Litaður eftir eldveggjamerkingu (óflokkaðri: EI-CS, eigin litur) — `litur` gildir. */
  merking: boolean;
  /** Eldveggjamerking sem fann engan vegg undir sér — stendur sjálf sem veggur í sínum lit, klippt að gólfinu. */
  laus?: boolean;
}

/** Líkan tækis í 3D (383 gerdTaekis). null = aðeins stöng, kúla og miði. */
export type TaekjaGerd =
  | "slokkvitaeki"
  | "co2"
  | "slanga"
  | "reykskynjari"
  | "hitaskynjari"
  | "segull"
  | "bjalla"
  | "rafmagn"
  | "skilti"
  | "skilti-ut"
  | "teppi";

export interface Taeki3D {
  x: number;
  y: number;
  /** Litur miðans og skiltaplötunnar (383: tæki grænt / rautt ef komið fram yfir, merki í sínum lit). */
  litur: string;
  stutt: string;
  nafn: string;
  /** Textinn á miðanum (383: tegund tækisins, nafn merkisins). */
  texti: string;
  gerd: TaekjaGerd | null;
}

export interface Haed3D {
  plan: ImageObject;
  nafn: string;
  breidd: number;
  haed: number;
  veggir: Veggbutur[];
  taeki: Taeki3D[];
  /** Ytri mörk veggjanna (miðjuð hnit) — „stærð hússins" í trúverðugleikaprófi kvarðans. null ef engir veggir. */
  umfang: { x0: number; y0: number; x1: number; y1: number } | null;
  /** Gólfið í 3D (miðjuð hnit): húsið (skurður úttektarinnar, með smá spássíu) eins og í Teikning-glugganum — annars
   * allt blaðið. */
  golf: { x0: number; y0: number; x1: number; y1: number };
}

/** Gólfflötur hæðar: skurður úttektarmyndarinnar (svæði hússins á blaðinu) + 4 % spássía, klemmt við blaðið; án
 * skurðar allt blaðið. Hnit miðuð við miðju teikningarinnar. */
export function golfHaedar(plan: Pick<ImageObject, "width" | "height" | "uttekt">): Haed3D["golf"] {
  const w = plan.width, h = plan.height;
  const allt = { x0: -w / 2, y0: -h / 2, x1: w / 2, y1: h / 2 };
  const t = plan.uttekt, sk = t?.skurdur;
  if (!t || !sk || !(sk.w > 8) || !(sk.h > 8) || !(t.frumB > 0) || !(t.frumH > 0)) return allt;
  // Skorin mynd („Croppa oft") sýnir aðeins myndSkurdur af blaðinu — skurður hæðarinnar miðast þá við hann.
  const ms = t.myndSkurdur && t.myndSkurdur.w > 0 && t.myndSkurdur.h > 0 ? t.myndSkurdur : { x: 0, y: 0, w: t.frumB, h: t.frumH };
  const kx = w / ms.w, ky = h / ms.h;
  const sp = Math.max(sk.w * kx, sk.h * ky) * 0.04;
  return {
    x0: Math.max(-w / 2, (sk.x - ms.x) * kx - sp - w / 2),
    y0: Math.max(-h / 2, (sk.y - ms.y) * ky - sp - h / 2),
    x1: Math.min(w / 2, (sk.x - ms.x + sk.w) * kx + sp - w / 2),
    y1: Math.min(h / 2, (sk.y - ms.y + sk.h) * ky + sp - h / 2),
  };
}

/** Tæki staðarins (uttaeki) — tegund og staða ráða líkani, miðatexta og lit tengdra tákna. */
export interface Taekjaupplysingar {
  id: number | string;
  serial?: string | null;
  type?: string | null;
  status?: string | null;
}

const VEGG_NOFN = ["Veggur", "Veggir", "EI-veggur", "Eldveggur"];
const ELD_NOFN = ["EI-veggur", "Eldveggur"];

function erVeggur(o: BoardObject): boolean {
  if (o.type === "rect") return !!o.veggur;
  if (o.type !== "polyline" && o.type !== "line") return false;
  return !!o.veggur || VEGG_NOFN.some((n) => o.name.startsWith(n));
}

/** Eldflokkur úr nafni merkingar („EI-veggur EI-60", „Eldveggur EI-30", „Eldveggur E-60"). */
export function eldflokkurNafns(nafn: string): Eldflokkur {
  const n = String(nafn || "").toUpperCase();
  if (/(^|[^0-9])60([^0-9]|$)/.test(n)) return 60;
  if (/(^|[^0-9])30([^0-9]|$)/.test(n)) return 30;
  return 0;
}

/** Hæðarnúmer úr heiti („Kjallari" = 0, „2. hæð" = 2, „Ris" = 99); null ef heitið segir ekkert (t.d. skjalanúmer). */
export function haedarNumer(nafn: string): number | null {
  const n = nafn.toLowerCase();
  if (/kjallar/.test(n)) return 0;
  const m = n.match(/(\d+)\s*\.?\s*h(æ|ae)ð/);
  if (m) return Number(m[1]);
  if (/jarðhæð|jardhaed/.test(n)) return 1;
  if (/(^|\s)ris($|\s)|þakhæð/.test(n)) return 99;
  return null;
}

/** Röð hæða: eftir hæðarnúmeri í heiti; annars eftir stöðu á borðinu (ofan → niður, vinstri → hægri) — teikningar
 * úr skjalasafni heita eftir skjalanúmeri, og innflutningur raðar þeim niður borðið í réttri röð. */
function radaHaedum(a: Haed3D, b: Haed3D) {
  const na = haedarNumer(a.nafn), nb = haedarNumer(b.nafn);
  if (na != null && nb != null && na !== nb) return na - nb;
  if (Math.abs(a.plan.y - b.plan.y) > Math.min(a.haed, b.haed) * 0.5) return a.plan.y - b.plan.y;
  return a.plan.x - b.plan.x;
}

/* ── Tæki: líkan, miðatexti og litur — sama regla og Teikning-glugginn (383 gerdTaekis / undirbua) ─────────────── */

/** 383 gerdTaekis: tegund tækis (uttaeki.type) eða auðkenni stimpils → hvaða líkan er teiknað. */
export function gerdTaekis(tegund: string | null | undefined, stimpill?: string | null): TaekjaGerd {
  if (stimpill) {
    if (stimpill === "rafmagn") return "rafmagn";
    if (stimpill === "hose" || stimpill === "slanga") return "slanga";
    if (/segul|magnet/.test(stimpill)) return "segull";
    if (/hita|heat/.test(stimpill)) return "hitaskynjari";
    if (/bjall|alarm/.test(stimpill)) return "bjalla";
    if (/reyk|detector/.test(stimpill)) return "reykskynjari";
    if (stimpill === "ut" || /tgang/.test(stimpill)) return "skilti-ut";
    if (stimpill.startsWith("skilti")) return "skilti";
    if (stimpill === "lettvatn" || stimpill === "duft") return "slokkvitaeki";
    return "skilti";
  }
  const t = String(tegund || "").toLowerCase();
  if (/segul/.test(t)) return "segull";
  if (/hitaskynj|hitanem/.test(t)) return "hitaskynjari";
  if (/bjall|viðvörun|vidvorun|brunabo|sírenu|sirenu/.test(t)) return "bjalla";
  if (/reyk/.test(t)) return "reykskynjari";
  if (/slang|slöngu/.test(t)) return "slanga";
  if (/teppi/.test(t)) return "teppi";
  if (/co2|co₂|kols/.test(t)) return "co2";
  return "slokkvitaeki";
}

/** Lykill merkjasafnsins (`teikn:<lykill>`) → líkan. */
const GERD_LYKILS: Record<string, TaekjaGerd> = {
  lettvatn: "slokkvitaeki",
  duft: "slokkvitaeki",
  annad: "slokkvitaeki",
  co2: "co2",
  slanga: "slanga",
  hose: "slanga",
  neydarutgangur: "skilti-ut",
  ut: "skilti-ut",
  rafmagn: "rafmagn",
  skilti_slt: "skilti",
  skilti_slanga: "skilti",
  reykskynjari: "reykskynjari",
  hitaskynjari: "hitaskynjari",
  bjalla: "bjalla",
  segull: "segull",
};

/** Eldri tákn TurboPaint (fyrir merkjasafnið) → líkan. Tákn sem eru ekki búnaður á vegg (flóttaleið, stigi, lyfta …)
 * fá ekkert líkan — aðeins stöng og miða. */
const GERD_ELDRI: Record<string, TaekjaGerd> = {
  extinguisher: "slokkvitaeki",
  "extinguisher-duft": "slokkvitaeki",
  "extinguisher-lettvatn": "slokkvitaeki",
  "extinguisher-co2": "co2",
  hose: "slanga",
  "sign-extinguisher": "skilti",
  "sign-hose": "skilti",
  exit: "skilti-ut",
  electric: "rafmagn",
  detector: "reykskynjari",
  alarm: "skilti",
  blanket: "teppi",
};

/** Gerð líkans fyrir tákn á borðinu: tengt tæki eftir tegund sinni (eins og Teikning), stimpill eftir merkinu, annars
 * eftir tákninu sjálfu. */
export function gerdTakns(o: Pick<SymbolObject, "symbolId" | "uttektSign" | "uttektKind" | "uttektUnitId">, tegund?: string | null): TaekjaGerd | null {
  const sign = stimpillTakns(o);
  if (sign) return gerdTaekis(null, sign);
  if (erTengtTaeki(o) && tegund) return gerdTaekis(tegund);
  const lykill = lykillTakns(o.symbolId);
  if (lykill) return GERD_LYKILS[lykill] ?? "slokkvitaeki";
  return GERD_ELDRI[o.symbolId] ?? null;
}

function erTengtTaeki(o: Pick<SymbolObject, "uttektUnitId" | "uttektKind">): boolean {
  const u = o.uttektUnitId;
  if (u == null || u === "") return false;
  if (o.uttektKind === "sign") return false;
  return !(typeof u === "string" && u.startsWith("s:"));
}

/** Stimpill táknsins (433 `sign`): `uttektSign`, annars miðhluti `s:<merki>:<id>`. */
function stimpillTakns(o: Pick<SymbolObject, "uttektSign" | "uttektUnitId" | "uttektKind">): string {
  if (o.uttektSign) return o.uttektSign;
  const u = o.uttektUnitId;
  if (typeof u === "string" && u.startsWith("s:")) return u.split(":")[1] || "";
  return "";
}

/** Miðjupunktur tákns (Konva snýr hópnum um upphafspunktinn og umbreytingin heldur miðjunni kyrri). */
export function taknMidja(o: Pick<SymbolObject, "x" | "y" | "size" | "rotation">): { x: number; y: number } {
  const a = ((Number(o.rotation) || 0) * Math.PI) / 180, h = o.size / 2;
  return { x: o.x + h * Math.cos(a) - h * Math.sin(a), y: o.y + h * Math.sin(a) + h * Math.cos(a) };
}

/** Miðatexti og litur eins og Teikning-glugginn (383 undirbua): tæki → tegundin (raðnúmer ef tegund vantar), grænt
 * eða rautt ef komið fram yfir; stimpill → nafn merkisins í sínum lit; laust tákn → merkimiði eða nafn táknsins. */
export function midiTakns(o: SymbolObject, taeki?: Taekjaupplysingar | null): { texti: string; litur: string } {
  const sign = stimpillTakns(o);
  if (sign || o.uttektKind === "sign") {
    const def = stimpillSigns(sign) ?? STIMPLAR.find((s) => s.id === sign) ?? null;
    return { texti: def?.nafn || getSymbol(o.symbolId).name || "Merki", litur: o.uttektLitur || def?.litur || "#c93c1d" };
  }
  if (erTengtTaeki(o)) {
    const radnr = taeki ? String(taeki.serial || "") : "";
    const texti = taeki?.type ? String(taeki.type) : radnr.slice(-6) || o.label || getSymbol(o.symbolId).name;
    return { texti, litur: taeki?.status === "overdue" ? "#c93c1d" : "#2f9e55" };
  }
  const s = getSymbol(o.symbolId);
  return { texti: o.label || s.name, litur: symbolPaint(s).bg };
}

/* ── Veggir ─────────────────────────────────────────────────────────────────────────────────────────────────────── */

/** Hve mikið línubútur o liggur eftir vegg v (sama stefna, á miðlínu hans innan `vik`): skörun í lengdareiningum,
 * 0 ef ekki samsíða eða of langt frá. (383 veggurVid, en fyrir einn vegg.) */
export function skorunEftirVegg(
  v: { ax: number; ay: number; bx: number; by: number },
  o: { ax: number; ay: number; bx: number; by: number },
  vik: number
): number {
  const ox = o.bx - o.ax, oy = o.by - o.ay, oL = Math.hypot(ox, oy) || 1, c = ox / oL, sn = oy / oL;
  const vx = v.bx - v.ax, vy = v.by - v.ay, vL = Math.hypot(vx, vy) || 1;
  if (Math.abs((vx * sn - vy * c) / vL) > 0.1) return 0;
  const mx = (v.ax + v.bx) / 2 - o.ax, my = (v.ay + v.by) / 2 - o.ay;
  if (Math.abs(mx * sn - my * c) > vik) return 0;
  const t0 = (v.ax - o.ax) * c + (v.ay - o.ay) * sn, t1 = (v.bx - o.ax) * c + (v.by - o.ay) * sn;
  return Math.max(0, Math.min(oL, Math.max(t0, t1)) - Math.max(0, Math.min(t0, t1)));
}

/** Eldveggjamerkingar borðsins lita veggina sem þær liggja eftir (EI-60 / EI-30), og hurðir í þeim verða brunahurðir.
 * Merking sem finnur engan vegg stendur sjálf sem veggur í sínum lit (eins og áður en tegundir veggja komu). */
export function merkjaEldveggi(veggir: Veggbutur[], merkingar: Veggbutur[]): Veggbutur[] {
  const ut = veggir.map((v) => ({ ...v }));
  const lausar: Veggbutur[] = [];
  for (const m of merkingar) {
    const mL = Math.hypot(m.bx - m.ax, m.by - m.ay);
    let fann = false;
    for (const v of ut) {
      const vik = v.thykkt / 2 + m.thykkt / 2 + 2;
      const skor = skorunEftirVegg(v, m, vik);
      const vL = Math.hypot(v.bx - v.ax, v.by - v.ay);
      // helmingur veggjarins (eða merkingarinnar, sé hún styttri) innan merkingarinnar
      if (skor > 0 && skor >= Math.min(vL, mL) * 0.5) {
        fann = true;
        if (m.eld > v.eld) v.eld = m.eld;
        else if (v.eld === 0 && m.eld === 0) {
          // óflokkuð merking (EI-CS, eigin litur): veggurinn tekur lit hennar
          v.litur = m.litur;
          v.merking = true;
        }
      }
    }
    if (!fann) lausar.push({ ...m, merking: true, laus: true });
  }
  return [...ut, ...lausar];
}

/** Klippir bút að rétthyrningi (Liang–Barsky); null ef ekkert af honum er innan hans. */
export function klippaBut<T extends { ax: number; ay: number; bx: number; by: number }>(
  v: T,
  r: { x0: number; y0: number; x1: number; y1: number }
): T | null {
  const dx = v.bx - v.ax, dy = v.by - v.ay;
  let t0 = 0, t1 = 1;
  const p = [-dx, dx, -dy, dy], q = [v.ax - r.x0, r.x1 - v.ax, v.ay - r.y0, r.y1 - v.ay];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
      continue;
    }
    const t = q[i] / p[i];
    if (p[i] < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return { ...v, ax: v.ax + dx * t0, ay: v.ay + dy * t0, bx: v.ax + dx * t1, by: v.ay + dy * t1 };
}

type Rammi = { x0: number; y0: number; x1: number; y1: number };
function sameinaRamma(a: Rammi | null, b: Rammi | null): Rammi | null {
  if (!a) return b;
  if (!b) return a;
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}
function rammiButa(butar: Veggbutur[]): Rammi | null {
  let r: Rammi | null = null;
  for (const v of butar) {
    r = sameinaRamma(r, { x0: Math.min(v.ax, v.bx), y0: Math.min(v.ay, v.by), x1: Math.max(v.ax, v.bx), y1: Math.max(v.ay, v.by) });
  }
  return r;
}

/** Byggir hæðir úr borðinu. Teikningar án veggja og tækja (skráningartöflur, afstöðumyndir) detta út — nema engin hafi neitt.
 * `taeki` = tækjalisti staðarins (tegund og staða tengdra tákna). */
export function husUrBordi(objects: BoardObject[], taeki: Taekjaupplysingar[] = []): Haed3D[] {
  const plon = objects.filter((o): o is ImageObject => o.type === "image");
  const notad = new Set<string>();
  const haedir: Haed3D[] = [];
  const taekiEftirId = new Map(taeki.map((t) => [String(t.id), t]));
  for (const plan of plon) {
    const a = plan.x + plan.width / 2, b = plan.y + plan.height / 2;
    const veggir: Veggbutur[] = [];
    const merkingar: Veggbutur[] = [];
    const taekiH: Taeki3D[] = [];
    for (const o of objectsOnDocument(plan, objects)) {
      if (notad.has(o.id) || o.hidden) continue;
      if (erVeggur(o)) {
        notad.add(o.id);
        if (o.type === "rect") {
          // eldri kassaútgáfa veggjalagsins: kassi = bútur eftir lengri hliðinni
          const lang = o.width >= o.height;
          const cx = o.x + o.width / 2 - a, cy = o.y + o.height / 2 - b;
          const grunnur = { litur: "#3f3a33", tegund: "veggur" as const, eld: 0 as const, merking: false };
          veggir.push(lang
            ? { ax: o.x - a, ay: cy, bx: o.x + o.width - a, by: cy, thykkt: o.height, ...grunnur }
            : { ax: cx, ay: o.y - b, bx: cx, by: o.y + o.height - b, thykkt: o.width, ...grunnur });
          continue;
        }
        if (o.type !== "polyline" && o.type !== "line") continue;
        const lina = o as LineObject;
        const erMerking = ELD_NOFN.some((n) => lina.name.startsWith(n));
        // Eldveggur (tegund ei60/ei30) er veggur með eldflokk — ekki merking sem leitar að vegg undir sér.
        const vt = lina.veggTegund;
        const tegund: VeggTegund3D = erMerking || vt === "ei60" || vt === "ei30" ? "veggur" : vt ?? "veggur";
        const eld: Eldflokkur = erMerking ? eldflokkurNafns(lina.name) : vt === "ei60" ? 60 : vt === "ei30" ? 30 : 0;
        const p = lina.points;
        for (let i = 2; i + 1 < p.length; i += 2) {
          const ax = lina.x + p[i - 2] - a, ay = lina.y + p[i - 1] - b, bx = lina.x + p[i] - a, by = lina.y + p[i + 1] - b;
          if (Math.hypot(bx - ax, by - ay) < 0.5) continue;
          const butur: Veggbutur = { ax, ay, bx, by, thykkt: Math.max(1, lina.strokeWidth), litur: erMerking ? lina.stroke : "#3f3a33", tegund, eld, merking: erMerking };
          (erMerking ? merkingar : veggir).push(butur);
        }
      } else if (o.type === "symbol") {
        notad.add(o.id);
        const s = getSymbol(o.symbolId);
        const m = taknMidja(o);
        const t = erTengtTaeki(o) ? taekiEftirId.get(String(o.uttektUnitId)) ?? null : null;
        const midi = midiTakns(o, t);
        taekiH.push({
          x: m.x - a,
          y: m.y - b,
          litur: midi.litur,
          stutt: s.short,
          nafn: o.label || s.name,
          texti: midi.texti,
          gerd: gerdTakns(o, t?.type),
        });
      }
    }
    const merkt = merkingar.length ? merkjaEldveggi(veggir, merkingar) : veggir;
    const fastir = merkt.filter((v) => !v.laus);
    // Gólfið: húsið (skurður úttektarinnar) og allt sem stendur á því — veggir og tæki — innan blaðsins. Án skurðar er
    // það allt blaðið.
    const blad: Rammi = { x0: -plan.width / 2, y0: -plan.height / 2, x1: plan.width / 2, y1: plan.height / 2 };
    let golf = golfHaedar(plan);
    if (plan.uttekt?.skurdur) {
      const sp = Math.max(plan.width, plan.height) * 0.015;
      const ut = (r: Rammi | null) => (r ? { x0: r.x0 - sp, y0: r.y0 - sp, x1: r.x1 + sp, y1: r.y1 + sp } : null);
      let tk: Rammi | null = null;
      for (const t of taekiH) tk = sameinaRamma(tk, { x0: t.x, y0: t.y, x1: t.x, y1: t.y });
      const s = sameinaRamma(sameinaRamma(golf, ut(rammiButa(fastir))), ut(tk)) as Rammi;
      golf = { x0: Math.max(blad.x0, s.x0), y0: Math.max(blad.y0, s.y0), x1: Math.min(blad.x1, s.x1), y1: Math.min(blad.y1, s.y1) };
    }
    // Lausar eldveggjamerkingar (engin veggur undir) eru klipptar að gólfinu — sjálfvirk rakning EI-merkja getur hlaupið
    // langt út af húsinu og stæði þá sem veggur úti í loftinu.
    const lausar: Veggbutur[] = [];
    for (const v of merkt) {
      if (!v.laus) continue;
      const k = klippaBut(v, golf);
      if (k && Math.hypot(k.bx - k.ax, k.by - k.ay) >= 0.5) lausar.push(k);
    }
    const allir = [...fastir, ...lausar];
    // „Stærð hússins" (kvarðapróf, römmun): raunverulegir veggir; lausar merkingar aðeins ef engir veggir eru
    const umfang = rammiButa(fastir) ?? rammiButa(lausar);
    haedir.push({ plan, nafn: plan.name, breidd: plan.width, haed: plan.height, veggir: allir, taeki: taekiH, umfang, golf });
  }
  const medEfni = haedir.filter((h) => h.veggir.length || h.taeki.length);
  return (medEfni.length ? medEfni : haedir).sort(radaHaedum);
}

/** Hvar á veggnum hangir tækið? Næsti veggur (ekki gler eða hurð) innan `seiling` frá merkinu: tækið fer á yfirborð
 * hans, þeim megin sem merkið stendur, og snýr út frá veggnum (nx, ny = normall út). Án veggjar stendur það þar sem
 * merkið er (aVegg = false). Sama regla og 383 festaAVegg. */
export function festaAVegg(veggir: Veggbutur[], x: number, y: number, seiling: number) {
  let best: { d: number; x: number; y: number; nx: number; ny: number; aVegg: boolean } | null = null;
  for (const v of veggir) {
    if (v.tegund !== "veggur") continue;
    const dx = v.bx - v.ax, dy = v.by - v.ay, L2 = dx * dx + dy * dy || 1, L = Math.sqrt(L2);
    const t = Math.max(0, Math.min(1, ((x - v.ax) * dx + (y - v.ay) * dy) / L2));
    const px = v.ax + dx * t, py = v.ay + dy * t, d = Math.hypot(x - px, y - py);
    if (d - v.thykkt / 2 > seiling || (best && d >= best.d)) continue;
    let nx = -dy / L, ny = dx / L;
    if ((x - px) * nx + (y - py) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    best = { d, x: px + (nx * v.thykkt) / 2, y: py + (ny * v.thykkt) / 2, nx, ny, aVegg: true };
  }
  return best ?? { d: 0, x, y, nx: 0, ny: 1, aVegg: false };
}

/* ── Raunhæð veggja: dílar á metra ─────────────────────────────────────────────────────────────────────────────── */

/** Lofthæð hæðar í metrum (383: 3,0 m). */
export const VEGGHAED_M = 3.0;
/** 1 pt á blaði í kvarða 1:100 = 0,03528 m í raun. */
const PT_I_METRUM = (0.0254 / 72) * 100;

export type KvardaHeimild = "kvardi" | "pdf" | "blad" | "gisk";
export interface KvardaKostur {
  /** Borðdílar á metra. */
  gildi: number | null | undefined;
  heimild: KvardaHeimild;
}

/** Blaðstærð (teikn-blad: b_mm × h_mm) + stærð blaðsins á borðinu við innflutning → borðdílar á metra í 1:100. */
export function bladDilarAMetra(blad: { b_mm?: number; h_mm?: number } | null | undefined, heimild: { b: number; h: number }): number | null {
  if (!blad || !((blad.b_mm ?? 0) > 50) || !((blad.h_mm ?? 0) > 50)) return null;
  const langBord = Math.max(heimild.b || 0, heimild.h || 0);
  if (!(langBord > 0)) return null;
  return (langBord / Math.max(blad.b_mm as number, blad.h_mm as number)) * 10;
}

/** PDF-síða teiknuð inn: borðdílar á pt (pixelsPerPdfPoint) → borðdílar á metra í 1:100. */
export function pdfDilarAMetra(plan: Pick<ImageObject, "pixelsPerPdfPoint">): number | null {
  const k = plan.pixelsPerPdfPoint;
  return k && k > 0 ? k / PT_I_METRUM : null;
}

/** A1 í 1:100 (sama forsenda og 1. áfangi): úttektarmynd eftir frummyndinni, annars eftir blaðinu á borðinu. */
export function giskDilarAMetra(plan: Pick<ImageObject, "width" | "height" | "uttekt" | "heimild">): number | null {
  const t = plan.uttekt;
  if (t && t.frumB > 0 && t.frumH > 0 && plan.width > 0) {
    // skorin mynd sýnir aðeins myndSkurdur.w dílar frummyndar á breidd sinni
    const frumBreidd = t.myndSkurdur && t.myndSkurdur.w > 0 ? t.myndSkurdur.w : t.frumB;
    return (plan.width / frumBreidd) * dilarAMetraGisk({ b: t.frumB, h: t.frumH });
  }
  const b = plan.heimild?.b || plan.width, h = plan.heimild?.h || plan.height;
  return b > 0 && h > 0 ? dilarAMetraGisk({ b, h }) : null;
}

/** Fyrsti trúverðugi kvarðinn: húsið (langhlið veggjanna, annars teikningarinnar) verður að vera 4–300 m — annars
 * næsti kostur (383 vegghaed). null = enginn trúverðugur; kallari notar hlutfall af stærð teikningar. */
export function veljaDilarAMetra(kostir: KvardaKostur[], husLengd: number): { dilar: number; heimild: KvardaHeimild } | null {
  for (const k of kostir) {
    const g = Number(k.gildi);
    if (!(g > 0) || !Number.isFinite(g)) continue;
    const m = husLengd / g;
    if (m < 4 || m > 300) continue;
    return { dilar: g, heimild: k.heimild };
  }
  return null;
}

/** Langhlið hússins á hæðinni (borðdílar): veggirnir ef þeir eru til, annars teikningin öll. */
export function husLengd(hd: Pick<Haed3D, "umfang" | "breidd" | "haed"> & { golf?: Haed3D["golf"] }): number {
  if (hd.umfang) return Math.max(hd.umfang.x1 - hd.umfang.x0, hd.umfang.y1 - hd.umfang.y0);
  if (hd.golf) return Math.max(hd.golf.x1 - hd.golf.x0, hd.golf.y1 - hd.golf.y0);
  return Math.max(hd.breidd, hd.haed);
}

/** Skjalasafnsslóð teikningar fyrir teikn-blad: það sem innflutningurinn geymdi (`heimild.slod`), annars slóð hæðarinnar
 * í úttektinni (teikn-mynd?url=<permalink>). Aðeins óskorin teikning — annars passar blaðstærðin ekki við myndina. */
export function bladSlod(
  plan: Pick<ImageObject, "heimild" | "uttekt" | "width" | "height">,
  haedir: { id: string; image_url?: string | null }[] = []
): { slod: string; b: number; h: number } | null {
  if (plan.heimild?.slod && plan.heimild.b > 0 && plan.heimild.h > 0) return { slod: plan.heimild.slod, b: plan.heimild.b, h: plan.heimild.h };
  const t = plan.uttekt;
  if (!t || !(t.frumB > 0) || !(t.frumH > 0)) return null;
  if (Math.abs(plan.width / plan.height / (t.frumB / t.frumH) - 1) > 0.01) return null;
  const h = haedir.find((x) => x.id === t.haedId);
  const inn = innflutningsSlod(h?.image_url);
  return inn ? { slod: inn, b: plan.width, h: plan.height } : null;
}
