/** Margar hæðir á EINU blaði (Agnar 06.10.2026: Ægisgata 4 — „GRUNNMYND 1./2./3. HÆÐ" hlið við hlið; Hótel Klöpp —
 * kjallari og 1. hæð saman). „Croppa oft" sker blaðið í N hluta í einu (einn kassi á grunnmynd), raðar þeim hlið við
 * hlið á borðinu og hver hluti man hvaðan hann kom (`bladhluti`: svæðið í dílum frummyndar, stærð frummyndar og slóð
 * blaðsins). „Tengja við hæð" tengir hlutann hæð í teikning_bord (til eða nýrri), og „Vista í úttekt" skrifar þær allar.
 *
 * Hreinar aðgerðir — engin DOM, engin skrif. Myndvinnslan sjálf (skurður á nativum dílum) er í crop.ts. */

import { objectBounds, objectsOnDocument } from "./geometry";
import { newId } from "./ids";
import { LAYER_ALMENNT, LAYER_VEGGIR } from "./layers";
import { grunnStaerdHaedar } from "./merkjasafn";
import { veggirHaedar } from "./teikning-veggir";
import type { BladHluti, BoardObject, ImageObject, SymbolObject, UttektTenging } from "./types";
import {
  bladIBordi,
  giskaFrumStaerd,
  gilturSkurdur,
  innanSvaedis,
  merkiLykill,
  myndSlodBlads,
  samaBlad,
  svaediMyndar,
  taknFyrirMerki,
  veggirIBord,
  type Svaedi,
  type UttektHaed,
  type UttektTaeki,
} from "./uttekt";
import { erVeggur } from "./veggja-leidretting";

type Rammi = { x: number; y: number; width: number; height: number };

/** Blaðið sem mynd sýnir: stærð frummyndar, svæðið sem myndin nær yfir (dílar frummyndar), slóð blaðsins og staður. */
export type BladMyndar = {
  frum: { b: number; h: number };
  /** Svæði blaðsins sem myndin sýnir (null = allt blaðið). */
  svaedi: Svaedi | null;
  imageUrl: string | null;
  companyId: number | null;
};

/** Blað myndar fyrir „Croppa oft": tengd úttektarmynd (frum + skurður myndarinnar), hluti sem áður var skorinn, eða
 * teikning úr skjalasafni (FotoWeb-JPEG = 6006 px á lengri kant, sjá giskaFrumStaerd). `imageUrlHaedar` = image_url
 * hæðarinnar sem borðið var opnað úr (sama strengur og Teikning-glugginn geymir). */
export function bladMyndar(plan: ImageObject, imageUrlHaedar?: string | null, companyId?: number | null): BladMyndar {
  const t = plan.uttekt;
  if (t && t.frumB > 0 && t.frumH > 0) {
    return {
      frum: { b: t.frumB, h: t.frumH },
      svaedi: gilturSkurdur(t.myndSkurdur),
      imageUrl: imageUrlHaedar ?? plan.bladhluti?.imageUrl ?? myndSlodBlads(plan.heimild?.slod),
      companyId: t.companyId,
    };
  }
  const bh = plan.bladhluti;
  if (bh && bh.frumB > 0 && bh.frumH > 0) {
    return { frum: { b: bh.frumB, h: bh.frumH }, svaedi: gilturSkurdur(bh.svaedi), imageUrl: bh.imageUrl ?? null, companyId: bh.companyId ?? companyId ?? null };
  }
  // Ótengd teikning: allt blaðið eins og það kom inn (heimild = stærð blaðsins á borðinu við innflutning).
  const heilt = plan.heimild && Math.abs(plan.heimild.b - plan.width) < 1 && Math.abs(plan.heimild.h - plan.height) < 1;
  return {
    frum: giskaFrumStaerd(plan),
    svaedi: null,
    imageUrl: heilt ? myndSlodBlads(plan.heimild?.slod) : null,
    companyId: companyId ?? null,
  };
}

/** Einn hluti í „Croppa oft": svæðið á blaðinu (heiltölur, dílar frummyndar), ramminn á borðinu þar sem hann ER á
 * myndinni núna, og hvert hann fer (hlið við hlið). */
export type HlutiAetlun = {
  nr: number;
  svaedi: Svaedi;
  /** Svæðið á borðinu, á myndinni eins og hún stendur (nákvæmlega `svaedi` varpað). */
  rammi: Rammi;
  /** Ný staða hlutans á borðinu (efra vinstra horn). */
  til: { x: number; y: number };
};

/** Kassar notandans (heimshnit) → hlutar: klemmdir að myndinni, svæðin í HEILUM dílum frummyndar (eins og Teikning
 * geymir skurð) og ramminn reiknaður aftur úr þeim, svo mynd hlutans og vörpun hans eru nákvæmlega sama svæðið.
 * Hlutunum er raðað hlið við hlið frá vinstri brún myndarinnar, í röð kassanna, með bili á milli. Of litlir kassar
 * (eða utan myndar) detta út. */
export function aetlaHluta(plan: Rammi, blad: Pick<BladMyndar, "frum" | "svaedi">, kassar: Rammi[], bil?: number): HlutiAetlun[] {
  const { frum } = blad;
  const b = bladIBordi(plan, frum, blad.svaedi);
  const sv = svaediMyndar(frum, blad.svaedi);
  const kx = b.width / frum.b, ky = b.height / frum.h;
  const ut: HlutiAetlun[] = [];
  for (const k of kassar) {
    const x0 = Math.max(sv.x, Math.round((Math.min(k.x, k.x + k.width) - b.x) / kx));
    const y0 = Math.max(sv.y, Math.round((Math.min(k.y, k.y + k.height) - b.y) / ky));
    const x1 = Math.min(sv.x + sv.w, Math.round((Math.max(k.x, k.x + k.width) - b.x) / kx));
    const y1 = Math.min(sv.y + sv.h, Math.round((Math.max(k.y, k.y + k.height) - b.y) / ky));
    if (x1 - x0 < 16 || y1 - y0 < 16) continue;
    const svaedi = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    ut.push({
      nr: ut.length + 1,
      svaedi,
      rammi: { x: b.x + x0 * kx, y: b.y + y0 * ky, width: svaedi.w * kx, height: svaedi.h * ky },
      til: { x: 0, y: 0 },
    });
  }
  const millibil = bil ?? Math.max(40, Math.max(...ut.map((h) => h.rammi.width), 0) * 0.06);
  let x = plan.x;
  for (const h of ut) {
    h.til = { x, y: plan.y };
    x += h.rammi.width + millibil;
  }
  return ut;
}

function midja(o: BoardObject) {
  const r = objectBounds(o);
  if (o.type === "symbol") return { x: o.x + o.size / 2, y: o.y + o.size / 2 };
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

function innan(p: { x: number; y: number }, r: Rammi) {
  return p.x >= r.x && p.y >= r.y && p.x <= r.x + r.width && p.y <= r.y + r.height;
}

/** Hvaða hluti erfir úttektartengingu blaðsins: sá sem ber flest tengd tæki/merki hæðarinnar, annars sá sem skarast
 * mest við skurð hæðarinnar. Engin vísbending = enginn (notandinn tengir sjálfur). */
export function erfingiTengingar(plan: ImageObject, objects: BoardObject[], hlutar: HlutiAetlun[]): number | null {
  const t = plan.uttekt;
  if (!t || !hlutar.length) return null;
  const fylgjendur = objectsOnDocument(plan, objects);
  const taln = hlutar.map(() => 0);
  for (const o of fylgjendur) {
    if (o.type !== "symbol" || o.uttektUnitId == null || o.uttektUnitId === "") continue;
    const c = midja(o);
    const i = hlutar.findIndex((h) => innan(c, h.rammi));
    if (i >= 0) taln[i]++;
  }
  const mest = Math.max(...taln);
  if (mest > 0) return taln.indexOf(mest);
  const sk = gilturSkurdur(t.skurdur);
  if (!sk) return null;
  let besti = -1, bestaSkorun = 0;
  hlutar.forEach((h, i) => {
    const w = Math.min(sk.x + sk.w, h.svaedi.x + h.svaedi.w) - Math.max(sk.x, h.svaedi.x);
    const hh = Math.min(sk.y + sk.h, h.svaedi.y + h.svaedi.h) - Math.max(sk.y, h.svaedi.y);
    const skorun = w > 0 && hh > 0 ? (w * hh) / Math.min(sk.w * sk.h, h.svaedi.w * h.svaedi.h) : 0;
    if (skorun > bestaSkorun) {
      bestaSkorun = skorun;
      besti = i;
    }
  });
  return besti >= 0 && bestaSkorun >= 0.3 ? besti : null;
}

function skarast(a: Rammi, b: Rammi) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** Það sem situr eftir þegar blaðið víkur: allt nema blaðið sjálft og fylgjendur þess sem standa á hluta. */
function eftirAfBladi(objects: BoardObject[], plan: ImageObject, hlutar: HlutiAetlun[]): BoardObject[] {
  const fara = new Set(
    objectsOnDocument(plan, objects)
      .filter((o) => hlutar.some((h) => innan(midja(o), h.rammi)))
      .map((o) => o.id)
  );
  return objects.filter((o) => o.id !== plan.id && !fara.has(o.id));
}

/** Röð hlutanna má ekki lenda ofan á því sem situr eftir (tákn utan kassanna, minnismiðar, aðrar teikningar) — þá
 * vistaðist tæki sem stóð utan kassanna í hæð hlutans sem lenti undir því. Skarist röðin við eitthvað færist hún niður
 * fyrir allt borðið. */
export function rodAnSkorunar(objects: BoardObject[], plan: ImageObject, hlutar: HlutiAetlun[], bil?: number): HlutiAetlun[] {
  if (!hlutar.length) return hlutar;
  const rammar = eftirAfBladi(objects, plan, hlutar).filter((o) => !o.hidden).map(objectBounds);
  const til = (h: HlutiAetlun): Rammi => ({ x: h.til.x, y: h.til.y, width: h.rammi.width, height: h.rammi.height });
  if (!hlutar.some((h) => rammar.some((r) => skarast(til(h), r)))) return hlutar;
  const millibil = bil ?? Math.max(40, Math.max(...hlutar.map((h) => h.rammi.height)) * 0.15);
  const nedst = Math.max(plan.y + plan.height, ...rammar.map((r) => r.y + r.height));
  const dy = nedst + millibil - Math.min(...hlutar.map((h) => h.til.y));
  return hlutar.map((h) => ({ ...h, til: { x: h.til.x, y: h.til.y + dy } }));
}

/** Fært um (dx, dy) — punktar lína eru afstæðir við x/y hlutarins og færast með honum. */
function faera<T extends BoardObject>(o: T, dx: number, dy: number): T {
  return { ...o, x: o.x + dx, y: o.y + dy };
}

/** Hvíttuð svæði (hlutföll heillar myndar) → hlutföll hlutans; þau sem snerta hann ekki detta út. */
function hvittadIHluta(plan: ImageObject, rammi: Rammi) {
  const ut: { x: number; y: number; w: number; h: number }[] = [];
  for (const h of plan.hvittad ?? []) {
    const x0 = plan.x + h.x * plan.width, y0 = plan.y + h.y * plan.height;
    const x1 = x0 + h.w * plan.width, y1 = y0 + h.h * plan.height;
    const a = Math.max(x0, rammi.x), b = Math.max(y0, rammi.y);
    const c = Math.min(x1, rammi.x + rammi.width), d = Math.min(y1, rammi.y + rammi.height);
    if (c <= a || d <= b) continue;
    ut.push({ x: (a - rammi.x) / rammi.width, y: (b - rammi.y) / rammi.height, w: (c - a) / rammi.width, h: (d - b) / rammi.height });
  }
  return ut;
}

/** Borðið eftir „Croppa oft": blaðið víkur fyrir hlutunum (í sæti þess í röðinni), hvert tákn/veggur/merking sem stóð
 * á hluta fer með honum (sama hliðrun, fest við hlutann), annað situr kyrrt. Hluti erfir úttektartengingu blaðsins ef
 * vísbending er um hvaða hæð hann er (erfingiTengingar) — skurður hæðarinnar verður þá hlutinn. `eignir[i]` = mynd
 * hlutans (assetId) úr crop.ts. */
export function beitaFjolcrop(
  objects: BoardObject[],
  plan: ImageObject,
  blad: BladMyndar,
  hlutar: HlutiAetlun[],
  eignir: string[]
): { objects: BoardObject[]; myndir: ImageObject[]; erfingi: number | null; eftir: number; taekiEftir: number } {
  const erfingi = erfingiTengingar(plan, objects, hlutar);
  let eftir = 0, taekiEftir = 0;
  const myndir: ImageObject[] = hlutar.map((h, i) => {
    const bladhluti: BladHluti = {
      nr: h.nr,
      svaedi: h.svaedi,
      frumB: blad.frum.b,
      frumH: blad.frum.h,
      imageUrl: blad.imageUrl,
      ...(blad.companyId ? { companyId: blad.companyId } : {}),
    };
    const m: ImageObject = {
      ...plan,
      id: newId(),
      assetId: eignir[i],
      x: h.til.x,
      y: h.til.y,
      width: h.rammi.width,
      height: h.rammi.height,
      rotation: 0,
      locked: false,
      name: `${plan.name || "Teikning"} · hluti ${h.nr}`,
      bladhluti,
    };
    delete m.uttekt;
    delete m.groupId;
    const hv = hvittadIHluta(plan, h.rammi);
    if (hv.length) m.hvittad = hv;
    else delete m.hvittad;
    if (i === erfingi && plan.uttekt) {
      const t: UttektTenging = { ...plan.uttekt, skurdur: h.svaedi, myndSkurdur: h.svaedi };
      m.uttekt = t;
    }
    return m;
  });
  const fylgja = new Set(objectsOnDocument(plan, objects).map((o) => o.id));
  const rest: BoardObject[] = [];
  for (const o of objects) {
    if (o.id === plan.id || o.type === "image") continue;
    if (!fylgja.has(o.id)) {
      rest.push(o);
      continue;
    }
    const c = midja(o);
    const i = hlutar.findIndex((h) => innan(c, h.rammi));
    if (i < 0) {
      // utan allra hluta: situr kyrrt og losnar frá blaðinu sem er horfið
      eftir++;
      if (o.type === "symbol" && o.uttektUnitId != null && o.uttektUnitId !== "") taekiEftir++;
      if (o.parentId === plan.id) {
        const n = { ...o };
        delete n.parentId;
        rest.push(n);
      } else rest.push(o);
      continue;
    }
    const h = hlutar[i];
    rest.push({ ...faera(o, h.til.x - h.rammi.x, h.til.y - h.rammi.y), parentId: myndir[i].id });
  }
  const myndirAdur = objects.filter((o) => o.type === "image");
  const stadur = myndirAdur.findIndex((o) => o.id === plan.id);
  const nyjarMyndir = [...myndirAdur.slice(0, stadur), ...myndir, ...myndirAdur.slice(stadur + 1)];
  return { objects: [...nyjarMyndir, ...rest], myndir, erfingi, eftir, taekiEftir };
}

/** „Croppa teikningu" (einn rammi) á tengdri mynd eða hluta: myndin sýnir eftir það aðeins `nytt` (borðhnit) af
 * blaðinu, svo skurður myndarinnar (myndSkurdur / bladhluti.svaedi) fylgir — annars varpaðist hvert merki rangt. Hluti
 * fær líka skurð hæðarinnar = hlutann. Ótengd mynd: ekkert breytist. */
export function skurdurEftirCrop(plan: ImageObject, nytt: Rammi): Partial<ImageObject> {
  const t = plan.uttekt, bh = plan.bladhluti;
  const frum = t && t.frumB > 0 && t.frumH > 0 ? { b: t.frumB, h: t.frumH } : bh ? { b: bh.frumB, h: bh.frumH } : null;
  if (!frum) return {};
  const svaedi = t && t.frumB > 0 ? gilturSkurdur(t.myndSkurdur) : gilturSkurdur(bh?.svaedi);
  const b = bladIBordi(plan, frum, svaedi);
  const sv: Svaedi = {
    x: ((nytt.x - b.x) / b.width) * frum.b,
    y: ((nytt.y - b.y) / b.height) * frum.h,
    w: (nytt.width / b.width) * frum.b,
    h: (nytt.height / b.height) * frum.h,
  };
  const ut: Partial<ImageObject> = {};
  if (t) ut.uttekt = { ...t, myndSkurdur: sv, ...(bh ? { skurdur: sv } : {}) };
  if (bh) ut.bladhluti = { ...bh, svaedi: sv };
  return ut;
}

/** Hæð sem hægt er að tengja: til í úttektinni, eða ný sem bíður vistunar á borðinu. */
export type HaedKostur = { id: string; nafn: string; ny: boolean; image_url?: string | null; markers: number; myndId: string | null };

/** Hæðir staðarins fyrir „Tengja við hæð": úr úttektinni (í röð hennar) + nýjar sem eru tengdar á borðinu, og hvaða
 * mynd á borðinu ber hverja. */
export function haedirTilTengingar(objects: BoardObject[], haedir: UttektHaed[], companyId: number): HaedKostur[] {
  const tengdar = objects.filter((o): o is ImageObject => o.type === "image" && !!o.uttekt && o.uttekt.companyId === companyId);
  const myndAf = (id: string) => tengdar.find((m) => m.uttekt!.haedId === id)?.id ?? null;
  const ut: HaedKostur[] = haedir.map((h, i) => ({
    id: h.id,
    nafn: h.nafn || `${i + 1}. hæð`,
    ny: false,
    image_url: h.image_url ?? null,
    markers: (h.markers || []).length,
    myndId: myndAf(h.id),
  }));
  for (const m of tengdar) {
    const t = m.uttekt!;
    if (ut.some((k) => k.id === t.haedId) || !t.nyHaed) continue;
    ut.push({ id: t.haedId, nafn: t.nyHaed.nafn, ny: true, image_url: m.bladhluti?.imageUrl ?? null, markers: 0, myndId: m.id });
  }
  return ut;
}

/** Merkið á mynd á borðinu: nafn hæðarinnar (tengd), „Hluti 2 · ótengdur" (skorinn hluti án hæðar), annars ekkert. */
export function merkiMyndar(mynd: ImageObject, haedir: UttektHaed[] | null | undefined): string | null {
  const t = mynd.uttekt;
  if (t) {
    const h = (haedir || []).find((x) => x.id === t.haedId);
    const nafn = h?.nafn || t.nyHaed?.nafn || "hæð";
    return t.nyHaed && !h ? `${nafn} (ný)` : nafn;
  }
  if (mynd.bladhluti) return `Hluti ${mynd.bladhluti.nr} · ótengdur`;
  return null;
}

/** Hvað tenging hlutans við hæðina hefur í för með sér — fyrir staðfestingu í viðmótinu. */
export function afleidingTengingar(
  objects: BoardObject[],
  mynd: ImageObject,
  haedId: string,
  haedir: UttektHaed[]
): { onnurMynd: ImageObject | null; annadBlad: boolean; merkiAnnarsBlads: number } {
  const onnurMynd =
    objects.find((o): o is ImageObject => o.type === "image" && o.id !== mynd.id && !!o.uttekt && o.uttekt.haedId === haedId) ?? null;
  const h = haedir.find((x) => x.id === haedId);
  const annadBlad = !!(h?.image_url && mynd.bladhluti?.imageUrl && !samaBlad(h.image_url, mynd.bladhluti.imageUrl));
  return { onnurMynd, annadBlad, merkiAnnarsBlads: annadBlad ? (h?.markers || []).length : 0 };
}

/** „Tengja við hæð": hlutinn fær úttektartengingu hæðarinnar (til eða nýrrar). Sé önnur mynd tengd sömu hæð (kallari
 * hefur staðfest skipti) missir hún tenginguna og þessi tekur við lista hennar yfir merkin sem borðið sýnir. Eigi hæðin
 * merki/veggi á SAMA blaði sem borðið sýnir ekki, eru þau sett á hlutann (þau sem standa innan hans) svo vistun sýni og
 * skrifi rétta hæð. */
export function tengjaVidHaed(
  objects: BoardObject[],
  myndId: string,
  val: { haedId: string; nyttNafn?: string },
  haedir: UttektHaed[],
  opts: { taeki?: UttektTaeki[]; staerd?: number } = {}
): { objects: BoardObject[]; vikid: string | null; sett: number; veggir: number } {
  const mynd = objects.find((o): o is ImageObject => o.type === "image" && o.id === myndId);
  if (!mynd) throw new Error("Myndin fannst ekki á borðinu.");
  const bh = mynd.bladhluti;
  if (!bh) throw new Error("Aðeins hlutar úr „Croppa oft“ eru tengdir hæðum hér — opnaðu hæðina úr úttektinni.");
  const companyId = mynd.uttekt?.companyId ?? bh.companyId;
  if (!companyId) throw new Error("Staðurinn er óþekktur — opnaðu teikninguna úr úttekt staðarins fyrst.");
  const til = haedir.find((h) => h.id === val.haedId);
  if (!til && !val.nyttNafn) throw new Error("Hæðin fannst ekki í úttektinni.");
  // Án slóðar blaðsins gæti hæð fengið skurð í hnitum annars blaðs — ekki tengt.
  if (!bh.imageUrl) throw new Error("Slóð blaðsins er óþekkt (ekki úr skjalasafninu) — opnaðu hæðina úr úttektinni og croppaðu þar.");
  if (mynd.uttekt?.haedId === val.haedId) return { objects, vikid: null, sett: 0, veggir: 0 };
  const svaedi = bh.svaedi;
  const frum = { b: bh.frumB, h: bh.frumH };
  const onnur = objects.find(
    (o): o is ImageObject => o.type === "image" && o.id !== myndId && !!o.uttekt && o.uttekt.haedId === val.haedId
  );
  const takn = objects.filter((o): o is SymbolObject => o.type === "symbol" && o.uttektUnitId != null && o.uttektUnitId !== "");
  const aBordi = new Set(takn.map((s) => merkiLykill(s.uttektUnitId)));
  let merki: string[] | undefined;
  const nyTakn: BoardObject[] = [];
  let veggirSett = 0;
  if (onnur) {
    merki = onnur.uttekt!.merki;
  } else if (til) {
    const markers = til.markers || [];
    merki = markers.map((m) => merkiLykill(m.unitId)).filter((k) => aBordi.has(k));
    // Merki hæðarinnar á SAMA blaði sem borðið sýnir ekki enn: sett á hlutann ef þau standa innan hans.
    if (samaBlad(til.image_url, bh.imageUrl) && opts.staerd) {
      for (const m of markers) {
        const k = merkiLykill(m.unitId);
        if (aBordi.has(k) || !innanSvaedis(m, svaedi)) continue;
        nyTakn.push(taknFyrirMerki(m, opts.taeki ?? [], mynd, frum, opts.staerd, grunnStaerdHaedar(til), svaedi));
        merki.push(k);
      }
      const veggirAMynd = objects.some((o) => erVeggur(o) && o.parentId === mynd.id);
      if (!veggirAMynd) {
        const vh = veggirHaedar(til, frum).veggir.filter((v) => {
          let sx = 0, sy = 0;
          for (let i = 0; i < v.p.length; i += 2) { sx += v.p[i]; sy += v.p[i + 1]; }
          const n = v.p.length / 2;
          return n > 0 && innanSvaedis({ x: sx / n, y: sy / n }, svaedi);
        });
        const lin = veggirIBord(vh, mynd, frum, svaedi);
        veggirSett = lin.length;
        nyTakn.push(...lin);
      }
    }
  } else merki = [];
  const t: UttektTenging = {
    companyId,
    haedId: val.haedId,
    frumB: bh.frumB,
    frumH: bh.frumH,
    skurdur: svaedi,
    myndSkurdur: svaedi,
    ...(merki ? { merki } : {}),
    ...(!til && val.nyttNafn ? { nyHaed: { nafn: val.nyttNafn } } : {}),
  };
  const ut = objects.map((o) => {
    if (o.id === myndId) return { ...mynd, uttekt: t };
    if (onnur && o.id === onnur.id) {
      const n = { ...onnur };
      delete n.uttekt;
      return n;
    }
    return o;
  });
  // Tákn á lagið „Almennt" og veggir á „Veggir", eins og við opnun úttektar.
  const nyir = nyTakn.map((o) => (o.layerId ? o : { ...o, layerId: o.type === "symbol" ? LAYER_ALMENNT : LAYER_VEGGIR }));
  return { objects: [...ut, ...nyir], vikid: onnur?.id ?? null, sett: nyTakn.length - veggirSett, veggir: veggirSett };
}

/** „Finna sjálfkrafa": kassar utan um aðskildar blekþyrpingar á blaðinu (grunnmyndir), úr smækkaðri grámynd (0–255,
 * w×h). Blekið er víkkað svo málsetningar og texti grunnmyndar renni saman í eina þyrpingu; rammi blaðsins, nafnreitur
 * og smáatriði detta út. Skilar kössum í hlutföllum myndarinnar (0–1), stærstu fyrst … raðað ofan frá og frá vinstri. */
export function finnaGrunnmyndir(gra: Uint8Array, w: number, h: number, opts: { troskuldur?: number; vikkun?: number } = {}): { x: number; y: number; w: number; h: number }[] {
  const tr = opts.troskuldur ?? 150;
  const r = Math.max(2, Math.round(opts.vikkun ?? Math.max(w, h) * 0.012));
  const blek = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) blek[i] = gra[i] < tr ? 1 : 0;
  // Langar beinar línur yfir hálft blaðið (rammi, skurðarlínur) tengja allt saman — þær eru teknar út fyrst.
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      if (!blek[y * w + x]) { x++; continue; }
      let e = x;
      while (e < w && blek[y * w + e]) e++;
      if (e - x > w * 0.5) for (let k = x; k < e; k++) blek[y * w + k] = 0;
      x = e;
    }
  }
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h) {
      if (!blek[y * w + x]) { y++; continue; }
      let e = y;
      while (e < h && blek[e * w + x]) e++;
      if (e - y > h * 0.5) for (let k = y; k < e; k++) blek[k * w + x] = 0;
      y = e;
    }
  }
  // víkkun (aðskiljanleg): lárétt, svo lóðrétt
  const a = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let sidast = -1e9;
    for (let x = 0; x < w; x++) if (blek[y * w + x]) sidast = x; else if (x - sidast <= r) a[y * w + x] = 1;
    for (let x = 0; x < w; x++) if (blek[y * w + x]) a[y * w + x] = 1;
    let naest = 1e9;
    for (let x = w - 1; x >= 0; x--) { if (blek[y * w + x]) naest = x; else if (naest - x <= r) a[y * w + x] = 1; }
  }
  const v = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    let sidast = -1e9;
    for (let y = 0; y < h; y++) { if (a[y * w + x]) { sidast = y; v[y * w + x] = 1; } else if (y - sidast <= r) v[y * w + x] = 1; }
    let naest = 1e9;
    for (let y = h - 1; y >= 0; y--) { if (a[y * w + x]) naest = y; else if (naest - y <= r) v[y * w + x] = 1; }
  }
  // samhangandi svæði (4-nágrannar)
  const merki = new Int32Array(w * h).fill(-1);
  const kassar: { x0: number; y0: number; x1: number; y1: number; blek: number; langar: number }[] = [];
  const stafli: number[] = [];
  for (let i0 = 0; i0 < w * h; i0++) {
    if (!v[i0] || merki[i0] >= 0) continue;
    const id = kassar.length;
    const k = { x0: w, y0: h, x1: 0, y1: 0, blek: 0, langar: 0 };
    kassar.push(k);
    merki[i0] = id;
    stafli.push(i0);
    while (stafli.length) {
      const i = stafli.pop()!;
      const x = i % w, y = (i - x) / w;
      if (x < k.x0) k.x0 = x;
      if (y < k.y0) k.y0 = y;
      if (x > k.x1) k.x1 = x;
      if (y > k.y1) k.y1 = y;
      if (blek[i]) k.blek++;
      if (x > 0 && v[i - 1] && merki[i - 1] < 0) { merki[i - 1] = id; stafli.push(i - 1); }
      if (x < w - 1 && v[i + 1] && merki[i + 1] < 0) { merki[i + 1] = id; stafli.push(i + 1); }
      if (y > 0 && v[i - w] && merki[i - w] < 0) { merki[i - w] = id; stafli.push(i - w); }
      if (y < h - 1 && v[i + w] && merki[i + w] < 0) { merki[i + w] = id; stafli.push(i + w); }
    }
  }
  // Grunnmynd = stór þyrping með löngum beinum línum (veggjum); textablokkir hafa stuttar línur.
  const minLina = Math.max(6, Math.round(Math.max(w, h) * 0.03));
  for (let id = 0; id < kassar.length; id++) {
    const k = kassar[id];
    if ((k.x1 - k.x0) * (k.y1 - k.y0) < w * h * 0.01) continue;
    let langar = 0;
    for (let y = k.y0; y <= k.y1; y++) {
      let run = 0;
      for (let x = k.x0; x <= k.x1; x++) {
        const i = y * w + x;
        if (blek[i] && merki[i] === id) run++;
        else { if (run >= minLina) langar += run; run = 0; }
      }
      if (run >= minLina) langar += run;
    }
    for (let x = k.x0; x <= k.x1; x++) {
      let run = 0;
      for (let y = k.y0; y <= k.y1; y++) {
        const i = y * w + x;
        if (blek[i] && merki[i] === id) run++;
        else { if (run >= minLina) langar += run; run = 0; }
      }
      if (run >= minLina) langar += run;
    }
    k.langar = langar;
  }
  const flatarmal = (k: (typeof kassar)[number]) => (k.x1 - k.x0) * (k.y1 - k.y0);
  const valdir = kassar.filter((k) => {
    const bw = k.x1 - k.x0, bh = k.y1 - k.y0;
    if (bw * bh < w * h * 0.01) return false; // smáatriði
    if (bw > w * 0.85 || bh > h * 0.85) return false; // nánast allt blaðið
    if (Math.min(bw, bh) < Math.max(w, h) * 0.05) return false; // mjó rönd (nafnreitur, texti)
    // Veggjalínur bera grunnmyndina: á Ægisgötu 4 eru 35–65 % bleksins í löngum línum (skörp skönnun þéttari en
    // JPEG-ið), textablokkir og afstöðumynd 0 %.
    return k.langar >= k.blek * 0.15 && k.langar > minLina * 8;
  });
  valdir.sort((p, q) => flatarmal(q) - flatarmal(p));
  const ut = valdir.slice(0, 8).map((k) => ({ x: k.x0 / w, y: k.y0 / h, w: (k.x1 - k.x0 + 1) / w, h: (k.y1 - k.y0 + 1) / h }));
  ut.sort((p, q) => (Math.abs(p.y - q.y) < 0.1 ? p.x - q.x : p.y - q.y));
  return ut;
}
