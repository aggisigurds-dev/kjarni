/** „SLT / BRSL af teikningu" — beiting á borðið (hrein aðgerð; kallarinn skrifar í borðið í EINU skrefi, ⌘Z tekur allt).
 *
 * Fyrir hverja teikningu: eldri hönnunarmerki lestursins (165.BR1: skilti, þekju-/drægishringir, yfirlitsmiði — líka
 * þau sem lentu utan blaðsins í eldri útgáfu) fara; tækin fara á staðina (slt-brsl.ts aetlaSltBrsl) — tengd við
 * óstaðsett tæki staðarins eða „ótengt" (verða Nýtt við „Vista í úttekt"); skilti við hvern stað. Tæki sem þegar stendur
 * við staðinn (handvirkt eða úr fyrri lestri) þjónar honum, svo endurkeyrsla tvítekur ekkert. */

import { teljaBunad, type BunadurStadur } from "./bunadur-lestur";
import { newId } from "./ids";
import { LAYER_ALMENNT } from "./layers";
import { makeSymbol } from "./markup-kit";
import { lykillTakns, STIMPIL_LYKILL, stimpillSigns, symbolIdLykils } from "./merkjasafn";
import { isMvsMark } from "./mvs165";
import { stadsettirLyklar, TaekjaSjodur, takaFraFyrirTegund, TEGUND_HEITI, type TaekjaTegund } from "./sjalftenging";
import { aetlaSltBrsl, DRAEGI_SLONGU_M, type SbStadur, type SbTaekiABord, type SkiltiStadur } from "./slt-brsl";
import type { BoardObject, EllipseObject, ImageObject, StickyObject, SymbolObject } from "./types";
import { OTENGT_MIDI, stuttNumer, symbolFyrirTegund, type UttektHaed, type UttektTaeki } from "./uttekt";

export interface SltBrslTeikning {
  plan: ImageObject;
  /** Staðirnir í BORÐHNITUM (slt-brsl.ts stadirABord). */
  stadir: SbStadur[];
  /** Búnaður í römmum (R / S / H / B) í BORÐHNITUM — 15.10.2026. */
  bunadur?: BunadurStadur[];
  /** Skilti úr orðum (BO, ÚT) í BORÐHNITUM — 15.10.2026. */
  skilti?: SkiltiStadur[];
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
  /** Búnaður úr römmum sem var settur (eftir tegund) og hve margir staðir áttu tákn fyrir. */
  bunadur: Partial<Record<TaekjaTegund, number>>;
  bunadurFyrir: number;
  /** Skilti úr orðum sem voru sett (bjorgunarop / ut) og hve mörg áttu skilti fyrir. */
  skilti: Partial<Record<"bjorgunarop" | "ut", number>>;
  skiltiFyrir: number;
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
 * 165.BR1-hönnunarmerki — svo það vistast (tengt eða sem Nýtt) og endurkeyrsla hendir því ekki. Merkt `sltLestur`:
 * tengingin er BRÁÐABIRGÐA — „Vista í úttekt" úthlutar upp á nýtt, tákn með tegund fyrst (sjalftenging.ts). */
function taeknTakn(t: SbTaekiABord, plan: ImageObject, s: number): SymbolObject {
  const symbolId = t.taeki ? symbolFyrirTegund(t.taeki.type) : symbolIdLykils(t.tegund);
  const o = makeSymbol(symbolId, t.x - s / 2, t.y - s / 2, t.taeki ? stuttNumer(t.taeki.serial) : OTENGT_MIDI, s);
  const ut: SymbolObject = { ...o, parentId: plan.id, layerId: LAYER_ALMENNT, uttektPx: s, sltLestur: t.hvad };
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
  // (a) á undan (b)/(c): laus tæki sem tákn með tegund á borðinu eiga tilkall til eru tekin frá — lesturinn tekur ekki
  // Duft/CO2 sem Agnar setti sjálfur tákn fyrir (lifandi prófun 1404, 07.10.2026). Vistunin reiknar það sama upp á nýtt.
  if (sjodur) takaFraFyrirTegund(eftir, sjodur);
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
    // stimplar úr orðum (BO / ÚT) eru í stærð tækjatákns — eins og stimpill sem er settur af slánni
    const sk2 = s;
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
    // Búnaður í römmum (R / S / H / B): tákn AF TEGUND (ekki stimpill — engin uttektSign), svo „Vista í úttekt“ tengi það
    // skráðu tæki sömu tegundar (reykskynjarar eru tæki í uttaeki) eða geri það Nýtt. Tákn með sama lykli innan seilingar
    // (búnaður ÚR fyrri lestri, eða skilti sem Agnar setti) þjónar staðnum — endurkeyrsla tvítekur ekkert.
    const seiling = 2 * metri;
    const naerTakn = (p: { x: number; y: number }, lykill: string, sign?: string) =>
      [...eftir, ...ny].some((o) => {
        if (o.type !== "symbol" || o.hidden || !innan(o)) return false;
        const sami = lykillTakns(o.symbolId) === lykill || (!!sign && o.uttektSign === sign);
        return sami && Math.hypot(o.x + o.size / 2 - p.x, o.y + o.size / 2 - p.y) <= seiling;
      });
    const settBunadur: BunadurStadur[] = [];
    let bunadurFyrir = 0;
    for (const b of tk.bunadur ?? []) {
      if (naerTakn(b, b.tegund)) {
        bunadurFyrir++;
        continue;
      }
      const o = makeSymbol(symbolIdLykils(b.tegund), b.x - s / 2, b.y - s / 2, OTENGT_MIDI, s);
      ny.push({ ...o, parentId: plan.id, layerId: LAYER_ALMENNT, uttektPx: s });
      settBunadur.push(b);
    }
    // Skilti úr orðum (BO, ÚT): stimplar Teikning-gluggans — vistast sem merki (kind: sign)
    const skiltiTalning: Partial<Record<"bjorgunarop" | "ut", number>> = {};
    let skiltiFyrir = 0;
    for (const sk of tk.skilti ?? []) {
      const lykill = STIMPIL_LYKILL[sk.sign] ?? sk.sign;
      if (naerTakn(sk, lykill, sk.sign)) {
        skiltiFyrir++;
        continue;
      }
      const o = makeSymbol(symbolIdLykils(lykill), sk.x - sk2 / 2, sk.y - sk2 / 2, "", sk2);
      ny.push({ ...o, parentId: plan.id, layerId: LAYER_ALMENNT, uttektKind: "sign", uttektSign: stimpillSigns(sk.sign)?.id ?? sk.sign, uttektPx: sk2 });
      skiltiTalning[sk.sign] = (skiltiTalning[sk.sign] ?? 0) + 1;
    }
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
      bunadur: teljaBunad(settBunadur),
      bunadurFyrir,
      skilti: skiltiTalning,
      skiltiFyrir,
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
  const bunTexti = (Object.keys(s.bunadur) as TaekjaTegund[]).map((k) => `${s.bunadur[k]} ${TEGUND_HEITI[k].toLowerCase()}`).join(", ");
  const bunFj = Object.values(s.bunadur).reduce((a, n) => a + (n ?? 0), 0);
  const skiltiFj = (s.skilti.bjorgunarop ?? 0) + (s.skilti.ut ?? 0);
  const lines = [
    "Búnaður af teikningu",
    `${s.brsl} brunaslöngur (BRSL) · ${s.slt} slökkvitæki (SLT)`,
    `Tengd við tæki staðarins: ${tSlongur} slöngur, ${tSlt} slökkvitæki (bráðabirgða — tákn með tegund ganga fyrir við vistun)`,
    s.otengd.brsl + s.otengd.slt
      ? `Ótengt: ${s.otengd.brsl + s.otengd.slt} (${otengdTexti}) — verða „Nýtt" (í bið) við „Vista í úttekt" nema tæki bætist við`
      : "Öll tækin tengd skráðum tækjum.",
    s.fyrir ? `${s.fyrir} staðir áttu tæki fyrir — ekkert tvítekið.` : "",
    bunFj ? `Búnaður í römmum: ${bunTexti} — tengist skráðum tækjum við vistun, annars Nýtt.` : "",
    s.bunadurFyrir ? `${s.bunadurFyrir} rammar áttu tákn fyrir.` : "",
    skiltiFj ? `Skilti: ${s.skilti.bjorgunarop ? `${s.skilti.bjorgunarop} björgunarop` : ""}${s.skilti.bjorgunarop && s.skilti.ut ? ", " : ""}${s.skilti.ut ? `${s.skilti.ut} ÚT` : ""}.` : "",
    "SLT/BRSL-skilti eru hönnunarmerki (165.BR1) og vistast ekki. ⌘Z afturkallar allt.",
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
