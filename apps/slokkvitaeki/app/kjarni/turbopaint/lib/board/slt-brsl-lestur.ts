// „Búnaður af teikningu" (áður „SLT / BRSL af teikningu") — lestur einnar teikningar (vafri): texti teikningarinnar
// (lesaTextaTeikningar) → SLT/BRSL-orð innan hússins → staðir (tákn slöngukeflis, textinn) → endurlestur við slöngukefli
// sem fengu ekkert SLT → staðir í borðhnitum með stærð tækjatákns og kvarða. Notað af takkanum (WhiteboardApp
// merkjaSltBrsl) og sjálfvirka verkferlinu (sjalfvirkt.ts), sem les textann EINU sinni fyrir bæði EI og SLT / BRSL.
//
// 15.10.2026 (Agnar, Trönuhraun 10 / Lindaberg): líka BÚNAÐUR í römmum — R í kassa (reykskynjari), S í hring (segulloki),
// H (hitaskynjari), B (bjalla) — og skiltin BO (björgunarop) og ÚT (flóttaleið). Rammarnir eru fundnir í blekgrímunni
// (bunadur-lestur.ts) og stafirnir lesnir einn og sér (detect-firewalls.ts lesaStafi), því OCR á fullri síðu les þá ekki.
// Slöngukefli sem er merkt með lengdinni einni („30 m") telst BRSL þegar spírallinn finnst við orðið.

import { bunadurUrRommum, finnaRammaMerki, type BunadurStadur } from "./bunadur-lestur";
import { lesaStafi, lesaSvaedi, type BlekGrima } from "./detect-firewalls";
import type { OcrWord } from "./firewall-rating";
import { endurlestrarRammar, hnitABord, husSvaediIMynd, skiltiUrOrdum, sltBrslOrd, sltBrslStadir, stadirABord } from "./slt-brsl";
import type { SltBrslTeikning } from "./slt-brsl-bord";
import { useBoardStore } from "./store";
import { getStampSize } from "./symbol-settings";
import { dilarAMetraGisk } from "./teikning-veggir";
import type { ImageObject } from "./types";
import { stimpilStaerdBords, stimpilStaerdMyndar, vorpunMyndar } from "./uttekt";
import { ritillDilarAMetra } from "./veggja-ritill-adgerdir";

export type TextiTeikningar = { words: OcrWord[]; srcW: number; srcH: number; blek: BlekGrima | null };

/** Dæmigerð stafahæð teikningarinnar (myndardílar): miðgildi lesinna orða með 2–8 stöfum og vissu ≥ 50 — kvarði
 * rammaleitarinnar þegar engin SLT/BRSL-orð eru til að miða við. */
export function stafahaed(words: OcrWord[], sjalfgefid = 20): number {
  const h = words
    .filter((w) => w.confidence >= 50 && w.text.trim().length >= 2 && w.text.trim().length <= 8)
    .map((w) => (w.vertical ? w.width : w.height))
    .filter((v) => v >= 6 && v <= 80)
    .sort((a, b) => a - b);
  return h.length ? h[Math.floor(h.length / 2)] : sjalfgefid;
}

/** SLT / BRSL-staðir, búnaður í römmum og skilti teikningarinnar úr lesnum texta. `log` = það sem stjórnborðið skráir
 * (prófanir lesa það). */
export async function sltBrslUrTexta(
  plan: ImageObject,
  r: TextiTeikningar,
  framvinda?: (message: string, percent: number) => void
): Promise<{ teikning: SltBrslTeikning; log: Record<string, unknown> }> {
  const src = { b: r.srcW, h: r.srcH };
  const v = vorpunMyndar(plan);
  const hus = v ? husSvaediIMynd(plan.uttekt?.skurdur, v.frum, v.svaedi, src) : null;
  let ord = sltBrslOrd(r.words, src, hus);
  let stadir = sltBrslStadir(ord, r.blek);
  // Slöngukefli sem fékk ekkert SLT: reiturinn kringum það lesinn aftur (OCR missir stök orð á fullri síðu)
  const hMid = ord.length ? [...ord].sort((a, b) => a.h - b.h)[Math.floor(ord.length / 2)].h : stafahaed(r.words);
  const rammar = r.blek ? endurlestrarRammar(stadir, hMid) : [];
  let endurlesid = 0;
  let aukaOrd: string[] = [];
  if (rammar.length && r.blek) {
    framvinda?.(`Les aftur við ${rammar.length} slöngukefli…`, 88);
    const auka = await lesaSvaedi(r.blek, rammar);
    aukaOrd = auka.filter((w) => w.text.length <= 8).map((w) => `${w.text}@${Math.round(w.x)},${Math.round(w.y)}:${Math.round(w.confidence)}`);
    const ord2 = sltBrslOrd([...r.words, ...auka], src, hus);
    if (ord2.length > ord.length) {
      endurlesid = ord2.length - ord.length;
      ord = ord2;
      stadir = sltBrslStadir(ord, r.blek);
    }
  }
  // Búnaður í römmum (R / S / H / B) — ramminn fundinn í blekgrímunni, stafurinn lesinn einn og sér
  let bunadur: BunadurStadur[] = [];
  const rammaLog: string[] = [];
  let lesnir: string[] = [];
  if (r.blek) {
    framvinda?.("Leita að R / S / H / B í römmum…", 92);
    const rm = finnaRammaMerki(r.blek, hus, hMid, (l) => rammaLog.push(l));
    if (rm.length) {
      framvinda?.(`Les ${rm.length} stafi í römmum…`, 94);
      const lesid = await lesaStafi(r.blek, rm.map((x) => x.stafur));
      lesnir = lesid.map((l, i) => `${rm[i].form}@${Math.round(rm[i].x)},${Math.round(rm[i].y)}=${l ? `${l.text}:${Math.round(l.confidence)}` : "—"}`);
      bunadur = bunadurUrRommum(rm, lesid);
    }
  }
  const skilti = skiltiUrOrdum(ord);
  const log = {
    teikning: plan.name,
    mynd: [r.srcW, r.srcH],
    bord: [Math.round(plan.x), Math.round(plan.y), Math.round(plan.width), Math.round(plan.height)],
    hus: hus && [Math.round(hus.x0), Math.round(hus.y0), Math.round(hus.x1), Math.round(hus.y1)],
    ord: ord.map((o) => [o.tegund, Math.round(o.x), Math.round(o.y), Math.round(o.vissa), o.texti]),
    stadir: stadir.map((s) => [Math.round(s.x), Math.round(s.y), s.brsl ? 1 : 0, s.slt ? 1 : 0, s.takn ? 1 : 0]),
    endurlesid,
    aukaOrd,
    rammar: rammaLog,
    stafir: lesnir,
    bunadur: bunadur.map((b) => [b.tegund, Math.round(b.x), Math.round(b.y), b.stafur, Math.round(b.vissa)]),
    skilti: skilti.map((s) => [s.sign, Math.round(s.x), Math.round(s.y)]),
  };
  const bord = useBoardStore.getState();
  const metri = ritillDilarAMetra(bord.objects, bord.pixelsPerMeter) ?? dilarAMetraGisk({ b: plan.width, h: plan.height });
  const staerd = plan.uttekt
    ? stimpilStaerdMyndar(plan, getStampSize())
    : stimpilStaerdBords(bord.objects, getStampSize(), { x: plan.x + plan.width / 2, y: plan.y + plan.height / 2 });
  return {
    teikning: {
      plan,
      stadir: stadirABord(stadir, plan, src),
      bunadur: bunadur.map((b) => hnitABord(b, plan, src)),
      skilti: skilti.map((s) => hnitABord(s, plan, src)),
      staerd,
      metri,
    },
    log,
  };
}
