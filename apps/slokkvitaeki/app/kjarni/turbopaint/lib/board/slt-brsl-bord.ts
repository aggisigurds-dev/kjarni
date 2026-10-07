/** „SLT / BRSL af teikningu" — beiting á borðið (hrein aðgerð; kallarinn skrifar í borðið í EINU skrefi, ⌘Z tekur allt).
 *
 * Fyrir hverja teikningu: eldri hönnunarmerki lestursins (165.BR1: skilti, þekju-/drægishringir, yfirlitsmiði — líka
 * þau sem lentu utan blaðsins í eldri útgáfu) fara; tækin fara á staðina (slt-brsl.ts aetlaSltBrsl) — tengd við
 * óstaðsett tæki staðarins eða „ótengt" (verða Nýtt við „Vista í úttekt"); skilti við hvern stað. Tæki sem þegar stendur
 * við staðinn (handvirkt eða úr fyrri lestri) þjónar honum, svo endurkeyrsla tvítekur ekkert. */

import { newId } from "./ids";
import { LAYER_ALMENNT } from "./layers";
import { makeSymbol } from "./markup-kit";
import { symbolIdLykils } from "./merkjasafn";
import { isMvsMark } from "./mvs165";
import { stadsettirLyklar, TaekjaSjodur, TEGUND_HEITI, type TaekjaTegund } from "./sjalftenging";
import { aetlaSltBrsl, DRAEGI_SLONGU_M, type SbStadur, type SbTaekiABord } from "./slt-brsl";
import type { BoardObject, EllipseObject, ImageObject, StickyObject, SymbolObject } from "./types";
import { OTENGT_MIDI, stuttNumer, symbolFyrirTegund, type UttektHaed, type UttektTaeki } from "./uttekt";

export interface SltBrslTeikning {
  plan: ImageObject;
  /** Staðirnir í BORÐHNITUM (slt-brsl.ts stadirABord). */
  stadir: SbStadur[];
  /** Stærð tækjatákns á þessari teikningu (borðeiningar) og borðeiningar á metra. */
  staerd: number;
  metri: number;
}

export interface SltBrslSamantekt {
  plan: ImageObject;
  brsl: number;
  slt: number;
  tengd: { hvad: "brsl" | "slt"; unitId: number; serial: string | null; type: string | null }[];
  otengd: { brsl: number; slt: number };
  fyrir: number;
  /** Tegundir ótengdra (verða Nýtt við vistun ef engin tæki bætast við). */
  otengdTegundir: Partial<Record<TaekjaTegund, number>>;
}

function draegiHringur(cx: number, cy: number, r: number, nafn: string, parentId: string): EllipseObject {
  return {
    id: newId(),
    type: "ellipse",
    x: cx - r,
    y: cy - r,
    width: r * 2,
    height: r * 2,
    fill: "#dc26260f",
    stroke: "#dc2626",
    strokeWidth: 1.5,
    rotation: 0,
    opacity: 0.6,
    locked: true,
    hidden: false,
    name: nafn,
    parentId,
    layerId: LAYER_ALMENNT,
  };
}

/** Tækjatákn á staðnum: tengt (unitId, raðnúmer undir) eða ótengt („ótengt" undir, grátt). Venjulegt tækjatákn — ekki
 * 165.BR1-hönnunarmerki — svo það vistast (tengt eða sem Nýtt) og endurkeyrsla hendir því ekki. */
function taeknTakn(t: SbTaekiABord, plan: ImageObject, s: number): SymbolObject {
  const symbolId = t.taeki ? symbolFyrirTegund(t.taeki.type) : symbolIdLykils(t.tegund);
  const o = makeSymbol(symbolId, t.x - s / 2, t.y - s / 2, t.taeki ? stuttNumer(t.taeki.serial) : OTENGT_MIDI, s);
  const ut: SymbolObject = { ...o, parentId: plan.id, layerId: LAYER_ALMENNT, uttektPx: s };
  if (t.taeki) ut.uttektUnitId = t.taeki.id;
  return ut;
}

/** Beitir lestrinum á hlutalista borðsins. `taeki` = tæki staðarins (null = borðið er ekki tengt úttekt → allt ótengt),
 * `haedir` = hæðir úttektarinnar (tæki sem eru merki á einhverri hæð eru staðsett og ekki tekin). Einn sjóður fyrir allar
 * teikningarnar: sama tæki fer aldrei á tvo staði. */
export function beitaSltBrsl(
  objects: BoardObject[],
  teikningar: SltBrslTeikning[],
  st: { taeki: UttektTaeki[] | null; haedir: UttektHaed[]; draegi?: boolean }
): { objects: BoardObject[]; samantekt: SltBrslSamantekt[]; fjarlaegd: number } {
  const planIds = new Set(teikningar.map((t) => t.plan.id));
  // eldri hönnunarmerki lestursins á þessum teikningum (líka lausu, án foreldris) fara — hreinsun, ekki tvítekning
  const eftir = objects.filter((o) => !(isMvsMark(o) && (!o.parentId || planIds.has(o.parentId))));
  const fjarlaegd = objects.length - eftir.length;
  const taekiEftirId = new Map((st.taeki ?? []).map((t) => [String(t.id), t]));
  const sjodur = st.taeki ? new TaekjaSjodur(st.taeki, stadsettirLyklar(st.haedir, eftir)) : null;
  const ny: BoardObject[] = [];
  const samantekt: SltBrslSamantekt[] = [];
  for (const tk of teikningar) {
    const { plan, stadir, staerd, metri } = tk;
    const innan = (o: SymbolObject) => {
      if (o.parentId) return o.parentId === plan.id;
      const cx = o.x + o.size / 2, cy = o.y + o.size / 2;
      return cx >= plan.x && cy >= plan.y && cx <= plan.x + plan.width && cy <= plan.y + plan.height;
    };
    const aetlun = aetlaSltBrsl(stadir, [...eftir, ...ny], {
      staerd,
      // tæki af réttri tegund innan 2 m frá staðnum þjónar honum (Agnar setur tækin oft við textann, ~1 m frá keflinu)
      seiling: 2 * metri,
      sjodur,
      taekiEftirId,
      fyrirMynd: innan,
    });
    const s = staerd;
    for (const t of aetlun.taeki) ny.push(taeknTakn(t, plan, s));
    // skilti (hönnunarmerki 165.BR1 — vistast ekki): yfir slöngunni / slökkvitækinu
    const sk = Math.max(8, Math.round(s * 0.62));
    stadir.forEach((stadur, i) => {
      const n = i + 1;
      if (stadur.brsl) {
        const o = makeSymbol("sign-hose", stadur.x - sk / 2, stadur.y - s / 2 - sk - 2, "", sk);
        ny.push({ ...o, name: `165.BR1 skilti BRSL-${n}`, parentId: plan.id, layerId: LAYER_ALMENNT });
        if (st.draegi) ny.push(draegiHringur(stadur.x, stadur.y, DRAEGI_SLONGU_M * metri, `165.BR1 drægi ${DRAEGI_SLONGU_M} m · BRSL-${n}`, plan.id));
      }
      if (stadur.slt) {
        const t = aetlun.taeki.find((x) => x.stadur === i && x.hvad === "slt");
        const cx = t ? t.x : stadur.brsl ? stadur.x + s : stadur.x;
        const cy = t ? t.y : stadur.y;
        const o = makeSymbol("sign-extinguisher", cx - sk / 2, cy - s / 2 - sk - 2, "", sk);
        ny.push({ ...o, name: `165.BR1 skilti SLT-${n}`, parentId: plan.id, layerId: LAYER_ALMENNT });
      }
    });
    const tengd = aetlun.taeki.flatMap((t) => (t.taeki ? [{ hvad: t.hvad, unitId: t.taeki.id, serial: t.taeki.serial, type: t.taeki.type }] : []));
    const otengdTegundir: Partial<Record<TaekjaTegund, number>> = {};
    for (const t of aetlun.taeki) if (!t.taeki) otengdTegundir[t.tegund] = (otengdTegundir[t.tegund] ?? 0) + 1;
    const sam: SltBrslSamantekt = {
      plan,
      brsl: stadir.filter((x) => x.brsl).length,
      slt: stadir.filter((x) => x.slt).length,
      tengd,
      otengd: {
        brsl: aetlun.taeki.filter((t) => t.hvad === "brsl" && !t.taeki).length,
        slt: aetlun.taeki.filter((t) => t.hvad === "slt" && !t.taeki).length,
      },
      fyrir: aetlun.fyrir.length,
      otengdTegundir,
    };
    samantekt.push(sam);
    ny.push(yfirlitsmidi(sam));
  }
  return { objects: [...eftir, ...ny], samantekt, fjarlaegd };
}

/** Yfirlitsmiði lestursins hægra megin við teikninguna (165.BR1 — endurnýjast við hverja keyrslu). */
function yfirlitsmidi(s: SltBrslSamantekt): StickyObject {
  const tSlongur = s.tengd.filter((t) => t.hvad === "brsl").length;
  const tSlt = s.tengd.filter((t) => t.hvad === "slt").length;
  const otengdTexti = (Object.keys(s.otengdTegundir) as TaekjaTegund[])
    .map((k) => `${TEGUND_HEITI[k]} ${s.otengdTegundir[k]}`)
    .join(", ");
  const lines = [
    "SLT / BRSL af teikningu",
    `${s.brsl} brunaslöngur (BRSL) · ${s.slt} slökkvitæki (SLT)`,
    `Tengd við tæki staðarins: ${tSlongur} slöngur, ${tSlt} slökkvitæki`,
    s.otengd.brsl + s.otengd.slt
      ? `Ótengt: ${s.otengd.brsl + s.otengd.slt} (${otengdTexti}) — verða „Nýtt" (í bið) við „Vista í úttekt" nema tæki bætist við`
      : "Öll tækin tengd skráðum tækjum.",
    s.fyrir ? `${s.fyrir} staðir áttu tæki fyrir — ekkert tvítekið.` : "",
    "Skilti eru hönnunarmerki (165.BR1) og vistast ekki. ⌘Z afturkallar allt.",
  ].filter(Boolean);
  return {
    id: newId(),
    type: "sticky",
    x: s.plan.x + s.plan.width + 48,
    y: s.plan.y + 370,
    width: 280,
    height: 240,
    text: lines.join("\n"),
    fill: "#fed7aa",
    fontSize: 14,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    name: "165.BR1 staðsetning",
    parentId: s.plan.id,
    layerId: LAYER_ALMENNT,
  };
}
