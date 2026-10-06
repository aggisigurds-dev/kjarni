// Aðgerðir veggjaritilsins á borðinu sjálfu: hver aðgerð er EIN ⌘Z-færsla (sögufærsla fyrst, svo ein breyting á
// hlutunum). Rúmfræðin er í veggja-ritill.ts (hrein föll); hér er hún sett í borðið. Notað af VeggjaRitill (yfirlagið)
// og VeggjaStika (aðgerðir á völdum veggjum).

import { replaceCrossingMarks } from "./crossings";
import { isDrawnLocked, isDrawnVisible } from "./layers";
import { newId, useBoardStore } from "./store";
import type { VeggTegund } from "./teikning-veggir";
import type { BoardObject, ImageObject, LineObject } from "./types";
import { bordDilarAMetra, erVeggur, stillaVeggTegund } from "./veggja-leidretting";
import {
  bilMilli,
  kljufaVegg,
  lengjaAd,
  nyrVeggur,
  sameinaVeggi,
  type P,
} from "./veggja-ritill";

/** 1 pt á blaði í 1:100 = 0,03528 m. */
const PT_I_METRUM = (0.0254 / 72) * 100;

/** Borðdílar á metra fyrir ritilinn: kvarðinn (K), annars tengda úttektarmyndin (A1 í 1:100), annars PDF-mynd
 * (dílar á pt í 1:100). null = óþekktur kvarði. */
export function ritillDilarAMetra(objects: BoardObject[], pixelsPerMeter: number | null): number | null {
  const b = bordDilarAMetra(objects, pixelsPerMeter);
  if (b) return b;
  for (const o of objects) {
    if (o.type === "image" && o.pixelsPerPdfPoint && o.pixelsPerPdfPoint > 0) return o.pixelsPerPdfPoint / PT_I_METRUM;
  }
  return null;
}

/** Þykkt í cm → borðdílar (óþekktur kvarði: 1 díll = 1 cm). */
export function cmIDila(cm: number, dilarAMetra: number | null): number {
  return Math.max(1, (cm / 100) * (dilarAMetra && dilarAMetra > 0 ? dilarAMetra : 100));
}

/** Teikningin sem nýr veggur á P festist við: tengda úttektarmyndin ef P er á henni, annars efsta sýnilega mynd. */
export function foreldriFyrir(P: P, objects: BoardObject[]): string | undefined {
  const myndir = objects.filter((o): o is ImageObject => o.type === "image" && !o.hidden);
  const a = (m: ImageObject) => P[0] >= m.x && P[1] >= m.y && P[0] <= m.x + m.width && P[1] <= m.y + m.height;
  const tengd = myndir.find((m) => m.uttekt && a(m));
  if (tengd) return tengd.id;
  for (let i = myndir.length - 1; i >= 0; i--) if (a(myndir[i])) return myndir[i].id;
  return undefined;
}

/** Breytanlegir veggir borðsins (sýnilegir, ólæstir). */
export function ritillVeggir(): LineObject[] {
  const s = useBoardStore.getState();
  return s.objects.filter((o): o is LineObject => erVeggur(o) && isDrawnVisible(o, s.layers) && !isDrawnLocked(o, s.layers));
}

export function valdirVeggir(): LineObject[] {
  const s = useBoardStore.getState();
  const sel = new Set(s.selectedIds);
  return ritillVeggir().filter((o) => sel.has(o.id));
}

/** Eitt skref: eyða `eyda`, bæta `baeta` við (á stað þess fyrsta sem eyddist svo röðin haldist), velja `velja`. */
export function skiptaUt(eyda: string[], baeta: BoardObject[], velja?: string[]) {
  const st = useBoardStore.getState();
  if (!eyda.length && !baeta.length) return;
  st.commitHistory();
  const burt = new Set(eyda);
  const objs: BoardObject[] = [];
  let sett = false;
  for (const o of st.objects) {
    if (burt.has(o.id)) {
      if (!sett) {
        objs.push(...baeta);
        sett = true;
      }
      continue;
    }
    objs.push(o);
  }
  if (!sett) objs.push(...baeta);
  useBoardStore.setState({
    objects: replaceCrossingMarks(objs),
    selectedIds: velja ?? st.selectedIds.filter((id) => !burt.has(id)),
  });
}

export function nyirVeggir(heims: number[][], tegund: VeggTegund, thykkt: number): LineObject[] {
  const objs = useBoardStore.getState().objects;
  return heims.map((p) => {
    const mid: P = [(p[0] + p[p.length - 2]) / 2, (p[1] + p[p.length - 1]) / 2];
    return nyrVeggur(p, { id: newId(), thykkt, tegund, parentId: foreldriFyrir(mid, objs) });
  });
}

export function eydaVeggjum(ids: string[]): number {
  const v = new Set(ritillVeggir().map((o) => o.id));
  const burt = ids.filter((id) => v.has(id));
  if (burt.length) useBoardStore.getState().deleteIds(burt);
  return burt.length;
}

export function kljufa(id: string, X: P): boolean {
  const o = ritillVeggir().find((v) => v.id === id);
  if (!o) return false;
  const r = kljufaVegg(o, X, newId, 1 / Math.max(0.05, useBoardStore.getState().camera.scale));
  if (!r) return false;
  skiptaUt([o.id], r, r.map((v) => v.id));
  return true;
}

export function sameina(ids: string[]): string | null {
  const V = ritillVeggir().filter((o) => ids.includes(o.id));
  const r = sameinaVeggi(V, newId);
  if ("villa" in r) return r.villa;
  skiptaUt(r.eyda, [r.nyr], [r.nyr.id]);
  return null;
}

export function lengja(id: string, markId: string): boolean {
  const V = ritillVeggir();
  const o = V.find((v) => v.id === id), m = V.find((v) => v.id === markId);
  if (!o || !m) return false;
  const r = lengjaAd(o, m);
  if (!r) return false;
  useBoardStore.getState().updateObjects([o.id], () => r);
  return true;
}

/** Hurð (eða önnur tegund) í bilið milli tveggja samlínu veggja. */
export function fyllaBil(aId: string, bId: string, tegund: VeggTegund): boolean {
  const V = ritillVeggir();
  const a = V.find((v) => v.id === aId), b = V.find((v) => v.id === bId);
  if (!a || !b) return false;
  const bil = bilMilli(a, b);
  if (!bil) return false;
  const [ny] = nyirVeggir([bil.heims], tegund, bil.thykkt);
  if (a.parentId) ny.parentId = a.parentId;
  skiptaUt([], [ny], [ny.id]);
  return true;
}

export function setjaThykkt(ids: string[], thykkt: number) {
  const v = new Set(ritillVeggir().map((o) => o.id));
  const t = ids.filter((id) => v.has(id));
  if (t.length) useBoardStore.getState().updateObjects(t, (o) => (erVeggur(o) ? { ...o, strokeWidth: Math.max(1, thykkt) } : o));
}

export function setjaTegund(ids: string[], tegund: VeggTegund) {
  const v = new Set(ritillVeggir().map((o) => o.id));
  const t = ids.filter((id) => v.has(id));
  if (t.length) useBoardStore.getState().updateObjects(t, (o) => (erVeggur(o) ? stillaVeggTegund(o, tegund) : o));
}
