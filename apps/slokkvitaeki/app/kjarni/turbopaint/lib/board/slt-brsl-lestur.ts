// „SLT / BRSL af teikningu" — lestur einnar teikningar (vafri): texti teikningarinnar (lesaTextaTeikningar) → SLT/BRSL-orð
// innan hússins → staðir (tákn slöngukeflis, textinn) → endurlestur við slöngukefli sem fengu ekkert SLT → staðir í
// borðhnitum með stærð tækjatákns og kvarða. Notað af takkanum (WhiteboardApp merkjaSltBrsl) og sjálfvirka verkferlinu
// (sjalfvirkt.ts), sem les textann EINU sinni fyrir bæði EI og SLT / BRSL.

import { lesaSvaedi, type BlekGrima } from "./detect-firewalls";
import type { OcrWord } from "./firewall-rating";
import { endurlestrarRammar, husSvaediIMynd, sltBrslOrd, sltBrslStadir, stadirABord } from "./slt-brsl";
import type { SltBrslTeikning } from "./slt-brsl-bord";
import { useBoardStore } from "./store";
import { getStampSize } from "./symbol-settings";
import { dilarAMetraGisk } from "./teikning-veggir";
import type { ImageObject } from "./types";
import { stimpilStaerdBords, stimpilStaerdMyndar, vorpunMyndar } from "./uttekt";
import { ritillDilarAMetra } from "./veggja-ritill-adgerdir";

export type TextiTeikningar = { words: OcrWord[]; srcW: number; srcH: number; blek: BlekGrima | null };

/** SLT / BRSL-staðir teikningarinnar úr lesnum texta. `log` = það sem stjórnborðið skráir (prófanir lesa það). */
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
  const hMid = ord.length ? [...ord].sort((a, b) => a.h - b.h)[Math.floor(ord.length / 2)].h : 20;
  const rammar = r.blek ? endurlestrarRammar(stadir, hMid) : [];
  let endurlesid = 0;
  let aukaOrd: string[] = [];
  if (rammar.length && r.blek) {
    framvinda?.(`Les aftur við ${rammar.length} slöngukefli…`, 90);
    const auka = await lesaSvaedi(r.blek, rammar);
    aukaOrd = auka.filter((w) => w.text.length <= 8).map((w) => `${w.text}@${Math.round(w.x)},${Math.round(w.y)}:${Math.round(w.confidence)}`);
    const ord2 = sltBrslOrd([...r.words, ...auka], src, hus);
    if (ord2.length > ord.length) {
      endurlesid = ord2.length - ord.length;
      ord = ord2;
      stadir = sltBrslStadir(ord, r.blek);
    }
  }
  const log = {
    teikning: plan.name,
    mynd: [r.srcW, r.srcH],
    bord: [Math.round(plan.x), Math.round(plan.y), Math.round(plan.width), Math.round(plan.height)],
    hus: hus && [Math.round(hus.x0), Math.round(hus.y0), Math.round(hus.x1), Math.round(hus.y1)],
    ord: ord.map((o) => [o.tegund, Math.round(o.x), Math.round(o.y), Math.round(o.vissa), o.texti]),
    stadir: stadir.map((s) => [Math.round(s.x), Math.round(s.y), s.brsl ? 1 : 0, s.slt ? 1 : 0, s.takn ? 1 : 0]),
    endurlesid,
    aukaOrd,
  };
  const bord = useBoardStore.getState();
  const metri = ritillDilarAMetra(bord.objects, bord.pixelsPerMeter) ?? dilarAMetraGisk({ b: plan.width, h: plan.height });
  const staerd = plan.uttekt
    ? stimpilStaerdMyndar(plan, getStampSize())
    : stimpilStaerdBords(bord.objects, getStampSize(), { x: plan.x + plan.width / 2, y: plan.y + plan.height / 2 });
  return { teikning: { plan, stadir: stadirABord(stadir, plan, src), staerd, metri }, log };
}
