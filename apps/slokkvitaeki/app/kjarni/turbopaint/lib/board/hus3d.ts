// Hús í þrívídd úr borðinu (Agnar 03.10.2026: „setja slökkvitækin á réttu staðina og geta 3d renderað betur sem sýna þá
// slökkvitækin á öllum hæðum"). Hrein gagnavinnsla — veit ekkert um three.js: hver teikning sem ber veggi eða tæki verður
// hæð; veggir (greindar miðlínur, handdregnir veggir, eldveggir) verða bútar með þykkt; tákn verða tæki. Hnit eru í
// borðseiningum MIÐAÐ VIÐ MIÐJU teikningarinnar, svo hæðir úr sama teikningasetti lenda hver ofan á annarri.

import { objectBounds, objectsOnDocument } from "./geometry";
import { getSymbol, symbolPaint } from "./symbols";
import type { BoardObject, ImageObject } from "./types";

export interface Veggbutur {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  thykkt: number;
  litur: string;
  /** Eldveggur (EI-…) — teiknaður í sínum lit. */
  eld: boolean;
}

export interface Taeki3D {
  x: number;
  y: number;
  litur: string;
  stutt: string;
  nafn: string;
}

export interface Haed3D {
  plan: ImageObject;
  nafn: string;
  breidd: number;
  haed: number;
  veggir: Veggbutur[];
  taeki: Taeki3D[];
}

const VEGG_NOFN = ["Veggur", "Veggir", "EI-veggur", "Eldveggur"];
const ELD_NOFN = ["EI-veggur", "Eldveggur"];

function erVeggur(o: BoardObject): boolean {
  if (o.type === "rect") return !!o.veggur;
  if (o.type !== "polyline" && o.type !== "line") return false;
  return !!o.veggur || VEGG_NOFN.some((n) => o.name.startsWith(n));
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

/** Byggir hæðir úr borðinu. Teikningar án veggja og tækja (skráningartöflur, afstöðumyndir) detta út — nema engin hafi neitt. */
export function husUrBordi(objects: BoardObject[]): Haed3D[] {
  const plon = objects.filter((o): o is ImageObject => o.type === "image");
  const notad = new Set<string>();
  const haedir: Haed3D[] = [];
  for (const plan of plon) {
    const a = plan.x + plan.width / 2, b = plan.y + plan.height / 2;
    const veggir: Veggbutur[] = [];
    const taeki: Taeki3D[] = [];
    for (const o of objectsOnDocument(plan, objects)) {
      if (notad.has(o.id) || o.hidden) continue;
      if (erVeggur(o)) {
        notad.add(o.id);
        if (o.type === "rect") {
          // eldri kassaútgáfa veggjalagsins: kassi = bútur eftir lengri hliðinni
          const lang = o.width >= o.height;
          const cx = o.x + o.width / 2 - a, cy = o.y + o.height / 2 - b;
          veggir.push(lang
            ? { ax: o.x - a, ay: cy, bx: o.x + o.width - a, by: cy, thykkt: o.height, litur: "#3f3a33", eld: false }
            : { ax: cx, ay: o.y - b, bx: cx, by: o.y + o.height - b, thykkt: o.width, litur: "#3f3a33", eld: false });
          continue;
        }
        if (o.type !== "polyline" && o.type !== "line") continue;
        const eld = ELD_NOFN.some((n) => o.name.startsWith(n));
        // eldveggir og leiðréttar tegundir (gler blátt, hurð brún) halda sínum lit
        const litur = eld || o.veggTegund === "gler" || o.veggTegund === "hurd" ? o.stroke : "#3f3a33";
        const p = o.points;
        for (let i = 2; i + 1 < p.length; i += 2) {
          const ax = o.x + p[i - 2] - a, ay = o.y + p[i - 1] - b, bx = o.x + p[i] - a, by = o.y + p[i + 1] - b;
          if (Math.hypot(bx - ax, by - ay) < 0.5) continue;
          veggir.push({ ax, ay, bx, by, thykkt: Math.max(1, o.strokeWidth), litur, eld });
        }
      } else if (o.type === "symbol") {
        notad.add(o.id);
        const s = getSymbol(o.symbolId);
        const r = objectBounds(o);
        taeki.push({
          x: r.x + r.width / 2 - a,
          y: r.y + r.height / 2 - b,
          litur: symbolPaint(s).bg,
          stutt: s.short,
          nafn: o.label || s.name,
        });
      }
    }
    haedir.push({ plan, nafn: plan.name, breidd: plan.width, haed: plan.height, veggir, taeki });
  }
  const medEfni = haedir.filter((h) => h.veggir.length || h.taeki.length);
  return (medEfni.length ? medEfni : haedir).sort(radaHaedum);
}
