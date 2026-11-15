/** Sync-staða TurboPaint-borðs gagnvart úttektarteikningunni (Agnar 15.11.2026: „Geturðu fundið út hvort allar
 * teikningarnar inn á turbo séu gamlar útgáfur eða í sync. Setja rautt eða grænt ljós á hver").
 *
 * Úttektarteikningin (public.teikning_bord) er sannleikurinn: hæð sem er opnuð úr Slökkvitæki-appinu er ENDURBYGGÐ úr
 * henni. Borð sem er opnað beint í TurboPaint (Verkefni-forsíðan, án nets) sýnir hins vegar GEYMDU útgáfuna — og hún
 * getur verið úrelt: tæki sett á teikninguna í appinu eða af greiningu, veggir endurgerðir, blaðinu skipt út.
 *
 * Matið er ÞURRKEYRSLA á „Vista í úttekt" (utbuaVistun skrifar ekkert): hvað myndi vistun breyta, og hvað er í
 * úttektinni sem borðið sýnir ekki? `uttekt.merki` á myndinni (staða hæðarinnar þegar borðið var byggt/vistað) segir í
 * hvora áttina munurinn er:
 *   rautt  = úttektin er nýrri/önnur en borðið (eða borðið er munaðarlaust eða eldra afrit) → óhætt að eyða / endurbyggja
 *   gult   = á borðinu er vinna sem hefur ekki verið vistuð í úttekt → skoða áður en eytt er
 *   grænt  = vistun væri núll-aðgerð
 *   grátt  = borðið er ekki tengt úttekt (sjálfstætt borð — ekkert til að bera saman við)
 * Aðeins lestur: hér er engu breytt, hvorki á borði né í úttekt. */

import { merkiLykill, myndirTengdar, utbuaVistun, type UttektHaed, type UttektMerki, type UttektTaeki } from "./uttekt";
import type { BoardObject, SymbolObject } from "./types";

export type SyncLjos = "graent" | "rautt" | "gult" | "gratt";

/** Úttekt eins staðar eins og appið les hana (saekjaUttekt): hæðir + tæki staðarins. */
export interface SyncUttekt {
  haedir: UttektHaed[];
  taeki: UttektTaeki[];
  /** teikning_bord.updated_at */
  uppfaert: string | null;
}

export interface SyncMat {
  /** Staðurinn sem borðið er tengt (null = ótengt úttekt). */
  cid: number | null;
  /** Hæðirnar sem myndir borðsins eru tengdar. */
  haedIds: string[];
  /** Ástæður þess að úttektin er nýrri/önnur en borðið. */
  raud: string[];
  /** Ástæður þess að á borðinu er óvistuð vinna. */
  gul: string[];
  /** Vísbendingar um ótengd borð (tómt, sýniborð, ónefnt …) — breyta ekki ljósinu. */
  visb: string[];
  /** Ein tengd hæð sem er enn til í úttektinni → hægt að endurbyggja borðið úr henni (`?uttekt=&haed=`). */
  maEndurbyggja: boolean;
  /** Skráð (virk) tæki staðarins og hve mörg þeirra eru komin á úttektarteikninguna. */
  taeki?: { virk: number; aTeikningu: number };
}

type Veggur = { p: number[]; t?: number; tegund?: string; eld?: number };

const ms = (s: string | null | undefined) => (s ? Date.parse(s) || 0 : 0);
/** Klukkur borðs og úttektar eru ekki samstilltar upp á sekúndu — munur undir mínútu telst sami tími. */
const SLAKI_MS = 60_000;
/** Veggir teljast eins innan 2 díla frummyndar (vörpunin fram og til baka námundar). */
const VEGG_THOL = 2;
const SJALFGEFIN_NOFN = new Set(["Nýtt borð", "Nýtt TurboPaint borð", "TurboPaint borð", "TurboPaint", "Ónefnt borð"]);
export const SYNIBORD_NAFN = "Helluhraun 10 · 2. hæð";

function samiVeggur(x: Veggur, y: Veggur): boolean {
  if ((x.tegund || "veggur") !== (y.tegund || "veggur")) return false;
  if ((x.eld || 0) !== (y.eld || 0)) return false;
  if (!Array.isArray(x.p) || !Array.isArray(y.p) || x.p.length !== y.p.length) return false;
  if (x.p.every((v, i) => Math.abs(v - y.p[i]) <= VEGG_THOL)) return true;
  // sami veggur teiknaður í hina áttina
  const n = x.p.length / 2;
  for (let i = 0; i < n; i++) {
    const j = n - 1 - i;
    if (Math.abs(x.p[2 * i] - y.p[2 * j]) > VEGG_THOL || Math.abs(x.p[2 * i + 1] - y.p[2 * j + 1]) > VEGG_THOL) return false;
  }
  return true;
}

/** Fjölmengjasamanburður veggja: hve margir eru aðeins í úttekt og hve margir aðeins á borði. */
export function veggjaMunur(uttekt: Veggur[], bord: Veggur[]): { adeinsUttekt: number; adeinsBord: number } {
  const notad = Array.from({ length: bord.length }, () => false);
  let adeinsUttekt = 0;
  for (const u of uttekt) {
    const i = bord.findIndex((b, k) => !notad[k] && samiVeggur(u, b));
    if (i >= 0) notad[i] = true;
    else adeinsUttekt++;
  }
  return { adeinsUttekt, adeinsBord: notad.filter((x) => !x).length };
}

/** Skráð tæki staðarins (ekki úrelt) og hve mörg þeirra eiga merki á einhverri hæð úttektarteikningarinnar. */
export function taekiATeikningu(u: SyncUttekt): { virk: number; aTeikningu: number } {
  const lyklar = new Set<string>();
  for (const h of u.haedir) for (const m of h.markers || []) lyklar.add(merkiLykill(m.unitId));
  const virk = u.taeki.filter((t) => String(t.status || "").toLowerCase() !== "urelt");
  return { virk: virk.length, aTeikningu: virk.filter((t) => lyklar.has(String(t.id))).length };
}

/** Mat eins borðs. `uttekt`: úttekt staðarins sem borðið er tengt, eða null ef staðurinn á enga úttektarteikningu.
 * Fyrir ótengd borð skiptir `uttekt` ekki máli. */
export function metaBord(
  bord: { name: string; updatedAt: string; objects: BoardObject[] },
  uttekt: SyncUttekt | null
): SyncMat {
  const objs = bord.objects || [];
  const myndir = myndirTengdar(objs);
  const mat: SyncMat = { cid: null, haedIds: [], raud: [], gul: [], visb: [], maEndurbyggja: false };

  if (!myndir.length) {
    if (!objs.length) mat.visb.push("Tómt borð");
    if (bord.name === SYNIBORD_NAFN) mat.visb.push("Sýniborð appsins");
    if (SJALFGEFIN_NOFN.has(bord.name)) mat.visb.push("Ónefnt borð");
    if (/pr[oó]fun|^test/i.test(bord.name)) mat.visb.push("Prófunarborð");
    return mat;
  }

  mat.cid = Number(myndir[0].uttekt!.companyId);
  mat.haedIds = myndir.map((m) => m.uttekt!.haedId);
  if (!uttekt) {
    mat.raud.push("Staðurinn á enga úttektarteikningu lengur");
    return mat;
  }
  mat.taeki = taekiATeikningu(uttekt);
  const haedir = uttekt.haedir;
  const tBord = ms(bord.updatedAt);
  const tUttekt = ms(uttekt.uppfaert);

  let u: ReturnType<typeof utbuaVistun>;
  try {
    // Afrit hæðanna: sama úttekt er metin fyrir mörg borð staðarins og þurrkeyrslan má aldrei hrófla við henni.
    u = utbuaVistun(objs, structuredClone(haedir), new Date().toISOString(), undefined, 56, { taeki: uttekt.taeki });
  } catch (e) {
    const villa = e instanceof Error ? e.message : String(e);
    mat.raud.push(/ekki lengur til/.test(villa) ? "Hæðin er ekki lengur til í úttektinni (endurgerð eða eytt)" : `Vistun myndi mistakast: ${villa}`);
    return mat;
  }
  mat.maEndurbyggja = myndir.length === 1 && haedir.some((h) => h.id === mat.haedIds[0]);

  const iUttekt = new Set<string>();
  const thekkt = new Set<string>();
  let utanBords = 0;
  let uttektVeggirEnBordEngir = 0;
  let veggjaKlukka = 0;
  let annadBlad = false;
  const faerslur: { dx: number; dy: number }[] = [];
  const veggjaPor: { vU: Veggur[]; vB: Veggur[] }[] = [];

  u.hlutar.forEach((hl, i) => {
    const t = myndir[i].uttekt!;
    const fyrir = haedir.find((h) => h.id === hl.haedId);
    const eftir = u.haedir.find((h) => h.id === hl.haedId);
    const merkiFyrir: UttektMerki[] = fyrir?.markers || [];
    for (const mk of merkiFyrir) iUttekt.add(merkiLykill(mk.unitId));
    if (Array.isArray(t.merki)) for (const k of t.merki) thekkt.add(String(k));
    utanBords += hl.utanBords.length;
    const leidrett = fyrir?.leidrett as ({ kl?: string; lagfaert?: { kl?: string } } & object) | undefined;
    veggjaKlukka = Math.max(veggjaKlukka, ms(leidrett?.kl), ms(leidrett?.lagfaert?.kl));

    // Annað blað eða önnur upplausn í úttektinni en borðið var byggt á → hnitakerfin eru ekki sambærileg
    const fB = Number(fyrir?.frum?.b || 0);
    const fH = Number(fyrir?.frum?.h || 0);
    if (fB > 0 && fH > 0 && (fB !== Number(t.frumB) || fH !== Number(t.frumH))) {
      annadBlad = true;
      return;
    }
    const fyrirMap = new Map(merkiFyrir.map((mk) => [merkiLykill(mk.unitId), mk]));
    for (const mk of eftir?.markers || []) {
      const f = fyrirMap.get(merkiLykill(mk.unitId));
      if (!f) continue;
      const dx = Number(mk.x) - Number(f.x);
      const dy = Number(mk.y) - Number(f.y);
      if (dx !== 0 || dy !== 0) faerslur.push({ dx, dy });
    }
    const vU = (Array.isArray(fyrir?.veggjaLinur) ? fyrir.veggjaLinur : []) as Veggur[];
    if (hl.veggir === 0) {
      if (vU.length > 0) uttektVeggirEnBordEngir += vU.length;
    } else {
      veggjaPor.push({ vU, vB: (Array.isArray(eftir?.veggjaLinur) ? eftir.veggjaLinur : []) as Veggur[] });
    }
  });

  // Kerfisbundin hliðrun: öll færð merki færð um SAMA vigur (±1 díll) → blaðið var endurskráð, ekki handfært
  let hlidrun: { dx: number; dy: number } | null = null;
  if (faerslur.length >= 2) {
    const d0 = faerslur[0];
    if (faerslur.every((d) => Math.abs(d.dx - d0.dx) <= 1 && Math.abs(d.dy - d0.dy) <= 1)) {
      hlidrun = { dx: Math.round(d0.dx), dy: Math.round(d0.dy) };
    }
  }
  let veggirAdeinsUttekt = 0;
  let veggirAdeinsBord = 0;
  for (const { vU, vB } of veggjaPor) {
    // Hliðrað blað: veggir borðsins bornir saman eftir að hliðrunin er dregin frá, annars teljast þeir allir ólíkir
    const h = hlidrun;
    const vB2 = h ? vB.map((v) => ({ ...v, p: v.p.map((c, i) => c - (i % 2 === 0 ? h.dx : h.dy)) })) : vB;
    const d = veggjaMunur(vU, vB2);
    veggirAdeinsUttekt += d.adeinsUttekt;
    veggirAdeinsBord += d.adeinsBord;
  }

  // Tengd tákn á borðinu sem eru ekki í úttektinni: þekkti borðið merkið (uttekt.merki)? Þá var það tekið af í appinu
  // eftir á (úttekt nýrri); annars var því bætt við á borðinu og aldrei vistað.
  let tekidIAppi = 0;
  let baettABordi = 0;
  for (const o of objs) {
    if (o.type !== "symbol") continue;
    const id = (o as SymbolObject).uttektUnitId;
    if (id == null || id === "") continue;
    const k = merkiLykill(id);
    if (iUttekt.has(k)) continue;
    if (thekkt.has(k)) tekidIAppi++;
    else baettABordi++;
  }
  // Ótengd tækja-/merkjatákn sem vistun myndi bæta í úttektina (sjálftenging, Nýtt-merki, nýir stimplar)
  const ovistudTakn = u.sjalftengd.length + u.nyttMerki.length + u.nyirStimplar.length;
  const uttektNyrri = tUttekt > tBord + SLAKI_MS;
  const fj = (n: number, eint: string, flt: string) => `${n} ${n === 1 ? eint : flt}`;

  // ── Úttektin er nýrri / önnur ──
  if (annadBlad) mat.raud.push("Úttektin notar nú aðra teikningu en borðið var byggt á");
  if (utanBords > 0) mat.raud.push(`${fj(utanBords, "merki", "merki")} á úttektarteikningunni vantar á borðið`);
  if (tekidIAppi > 0) mat.raud.push(`${fj(tekidIAppi, "tæki", "tæki")} á borðinu ${tekidIAppi === 1 ? "var tekið" : "voru tekin"} af úttektarteikningunni`);
  if (hlidrun) {
    const txt = `Allt á borðinu er hliðrað um (${hlidrun.dx}, ${hlidrun.dy}) díla frá úttektinni`;
    if (uttektNyrri) mat.raud.push(txt);
    else mat.gul.push(`${txt} — óvistað`);
  } else if (faerslur.length > 0) {
    if (uttektNyrri) mat.raud.push(`${fj(faerslur.length, "merki er", "merki eru")} á öðrum stað í úttektinni`);
    else mat.gul.push(`${fj(faerslur.length, "merki fært", "merki færð")} á borðinu, óvistað`);
  }
  if (uttektVeggirEnBordEngir > 0) mat.raud.push(`Úttektin hefur ${fj(uttektVeggirEnBordEngir, "vegg", "veggi")} en borðið enga`);
  if (veggirAdeinsUttekt + veggirAdeinsBord > 0) {
    if (veggirAdeinsBord === 0) mat.raud.push(`Úttektin hefur ${fj(veggirAdeinsUttekt, "vegg", "veggi")} umfram borðið`);
    else if (veggirAdeinsUttekt === 0) mat.gul.push(`Borðið hefur ${fj(veggirAdeinsBord, "vegg", "veggi")} sem vantar í úttekt`);
    else if ((veggjaKlukka || tUttekt) > tBord + SLAKI_MS) mat.raud.push("Veggir voru endurgerðir í úttektinni eftir á");
    else mat.gul.push(`Veggjum breytt á borðinu (${veggirAdeinsBord}), óvistað`);
  }
  // ── Óvistað á borðinu ──
  if (u.tekin > 0) mat.gul.push(`${fj(u.tekin, "merki tekið", "merki tekin")} af borðinu, óvistað`);
  if (baettABordi > 0) mat.gul.push(`${fj(baettABordi, "tæki", "tæki")} á borðinu vantar í úttektina`);
  if (ovistudTakn > 0) mat.gul.push(`${fj(ovistudTakn, "tákn", "tákn")} á borðinu aldrei ${ovistudTakn === 1 ? "vistað" : "vistuð"} í úttekt`);
  return mat;
}

export interface SyncBord {
  id: string;
  name: string;
  updatedAt: string;
  mat: SyncMat;
}

export interface SyncNidurstada {
  ljos: SyncLjos;
  /** Ástæður í birtingarröð: rauðar fyrst, svo gular, svo vísbendingar. Tómt = „í sync" / „ótengt". */
  astaedur: string[];
  /** Borðið er eldra afrit annars borðs (sama hæð eða sama nafn). */
  eldraAfrit: boolean;
}

export const SYNC_HEITI: Record<SyncLjos, string> = {
  graent: "Í sync",
  rautt: "Úrelt",
  gult: "Óvistað á borði",
  gratt: "Ótengt úttekt",
};

/** Ljós allra borða. Bætir við því sem sést aðeins þvert á borð: eldri afrit. Appið finnur úttektarborð eftir NAFNI og
 * tekur það nýjasta — eldra borð tengt sömu hæð (eða samnefnt úttektarborð) opnast því aldrei þaðan. */
export function ljosBorda(bord: SyncBord[]): Map<string, SyncNidurstada> {
  const nyjastFyrst = [...bord].sort((a, b) => ms(b.updatedAt) - ms(a.updatedAt));
  const tengd = nyjastFyrst.filter((b) => b.mat.cid != null);
  const eldri = new Map<string, string>();
  const sedHaed = new Set<string>();
  const sedNafn = new Set<string>();
  for (const b of tengd) {
    const lyklar = b.mat.haedIds.map((h) => `${b.mat.cid}:${h}`);
    if (lyklar.some((k) => sedHaed.has(k))) eldri.set(b.id, "Eldra afrit — nýrra borð er tengt sömu hæð");
    else if (sedNafn.has(b.name)) eldri.set(b.id, "Eldra afrit — nýrra borð með sama nafni er til");
    for (const k of lyklar) sedHaed.add(k);
    sedNafn.add(b.name);
  }
  const ut = new Map<string, SyncNidurstada>();
  for (const b of bord) {
    const afrit = eldri.get(b.id);
    const raud = afrit ? [afrit, ...b.mat.raud] : b.mat.raud;
    const ljos: SyncLjos =
      b.mat.cid == null ? "gratt" : b.mat.gul.length ? "gult" : raud.length ? "rautt" : "graent";
    ut.set(b.id, { ljos, astaedur: [...raud, ...b.mat.gul, ...b.mat.visb], eldraAfrit: !!afrit });
  }
  return ut;
}
