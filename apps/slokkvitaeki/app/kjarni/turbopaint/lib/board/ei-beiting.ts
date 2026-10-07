// EI-greiningin á borðinu — beiting (hreint fall, prófanlegt): miðar → eldveggir á veggjum teikningarinnar
// (ei-festing). Vafraleiðin (sjálfvirk veggjagreining þegar teikningin á enga veggi) er í ei-greining.ts.
// Hver eldveggur er veggur með tegund ei60 / ei30 (Agnar 07.10.2026: „eins og veggi") — ekki yfirlag sem týnist.

import { festaEiVidVeggi, eiTegund, skiptaVeggEftirFestingum, type EiMidi, type FestiNidurstada, type FestiVeggur, type Rammi } from "./ei-festing";
import type { BoardObject, ImageObject, LineObject } from "./types";
import { skurdurIBord, vorpunMyndar } from "./uttekt";
import { erVeggur, stillaVeggTegund } from "./veggja-leidretting";
import { afstaedir, heimsPunktar, nyrVeggur } from "./veggja-ritill";

/** Veggir borðsins sem tilheyra teikningunni: festir við hana, eða lausir með miðju á henni. */
export function veggirTeikningar(objects: BoardObject[], plan: ImageObject): LineObject[] {
  return objects.filter((o): o is LineObject => {
    if (!erVeggur(o) || o.hidden) return false;
    if (o.parentId) return o.parentId === plan.id;
    const n = o.points.length;
    const cx = o.x + (o.points[0] + o.points[n - 2]) / 2, cy = o.y + (o.points[1] + o.points[n - 1]) / 2;
    return cx >= plan.x && cy >= plan.y && cx <= plan.x + plan.width && cy <= plan.y + plan.height;
  });
}

/** Húsið á borðinu: umgjörð veggjanna (+ svigrúm), innan skurðar hæðarinnar sé hann til. */
export function husRammi(plan: ImageObject, veggir: FestiVeggur[], svigrum: number): Rammi | null {
  let r: Rammi | null = null;
  for (const v of veggir) {
    for (let i = 0; i + 1 < v.p.length; i += 2) {
      const x = v.p[i], y = v.p[i + 1];
      r = r ? { x0: Math.min(r.x0, x), y0: Math.min(r.y0, y), x1: Math.max(r.x1, x), y1: Math.max(r.y1, y) } : { x0: x, y0: y, x1: x, y1: y };
    }
  }
  if (!r) return null;
  r = { x0: r.x0 - svigrum, y0: r.y0 - svigrum, x1: r.x1 + svigrum, y1: r.y1 + svigrum };
  const v = vorpunMyndar(plan);
  const sk = v && plan.uttekt ? skurdurIBord(plan.uttekt.skurdur, plan, v.frum, v.svaedi) : null;
  if (sk) {
    const s = { x0: Math.max(r.x0, sk.x), y0: Math.max(r.y0, sk.y), x1: Math.min(r.x1, sk.x + sk.width), y1: Math.min(r.y1, sk.y + sk.height) };
    if (s.x1 > s.x0 && s.y1 > s.y0) r = s;
  }
  return r;
}

export interface EiBeiting {
  /** Hlutir borðsins eftir beitingu (veggir klofnir / með nýja tegund, nýir eldveggir). */
  objects: BoardObject[];
  festing: FestiNidurstada;
  /** Eldveggjabútar (festingar). */
  eldveggir: number;
  /** Veggir borðsins sem fengu eldflokk (heilir eða klofnir). */
  breyttir: number;
  /** Nýir eldveggir (teikningin átti enga veggi — greindir sjálfkrafa). */
  nyir: number;
}

/** Festir miðana við veggina og beitir á hlutalista borðsins (hreint fall — kallarinn skrifar í borðið í einu skrefi).
 * `sjalf` = sjálfgreindir veggir (teikningin átti enga): þá bætast aðeins eldveggjabútarnir við. */
export function beitaEi(
  objects: BoardObject[],
  plan: ImageObject,
  midar: EiMidi[],
  st: { seiling: number; sjalf?: FestiVeggur[] | null; lota: string; nyttId: () => string }
): EiBeiting {
  const aBordi = veggirTeikningar(objects, plan).filter((o) => !o.locked);
  const akkeri: FestiVeggur[] = st.sjalf?.length
    ? st.sjalf
    : aBordi.map((o) => ({ id: o.id, p: heimsPunktar(o), t: o.strokeWidth, tegund: o.veggTegund ?? "veggur" }));
  const maxT = akkeri.reduce((m, v) => Math.max(m, v.t), 0);
  const hus = husRammi(plan, akkeri, maxT);
  const festing = festaEiVidVeggi(midar, akkeri, { seiling: st.seiling, hus, lagmark: maxT });
  let breyttir = 0, nyir = 0;
  let ut = objects;
  if (st.sjalf?.length) {
    const nyjir: LineObject[] = [];
    for (const f of festing.festingar) {
      const v = akkeri.find((a) => a.id === f.veggId)!;
      const i = f.butur * 2;
      const a = [v.p[i], v.p[i + 1]], b = [v.p[i + 2], v.p[i + 3]];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      nyjir.push(
        nyrVeggur([a[0] + d[0] * f.s0, a[1] + d[1] * f.s0, a[0] + d[0] * f.s1, a[1] + d[1] * f.s1], {
          id: st.nyttId(),
          thykkt: v.t,
          tegund: eiTegund(f.minutur),
          parentId: plan.id,
          greining: st.lota,
        })
      );
    }
    nyir = nyjir.length;
    ut = [...objects, ...nyjir];
  } else if (festing.festingar.length) {
    const eftirVegg = new Map<string, typeof festing.festingar>();
    for (const f of festing.festingar) {
      const l = eftirVegg.get(f.veggId);
      if (l) l.push(f);
      else eftirVegg.set(f.veggId, [f]);
    }
    ut = [];
    for (const o of objects) {
      const fs = eftirVegg.get(o.id);
      if (!fs || (o.type !== "polyline" && o.type !== "line")) {
        ut.push(o);
        continue;
      }
      const hlutar = skiptaVeggEftirFestingum(heimsPunktar(o), o.veggTegund ?? "veggur", fs);
      breyttir++;
      if (hlutar.length === 1) {
        ut.push(stillaVeggTegund(o, hlutar[0].tegund));
        continue;
      }
      hlutar.forEach((h, k) => {
        const n: LineObject = { ...o, id: k === 0 ? o.id : st.nyttId(), points: afstaedir(o, h.p) };
        ut.push(h.tegund === (o.veggTegund ?? "veggur") ? n : stillaVeggTegund(n, h.tegund));
      });
    }
  }
  return { objects: ut, festing, eldveggir: festing.festingar.length, breyttir, nyir };
}
