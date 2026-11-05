/** Tólaskrá Móta-ritilsins: flipar, tól og sleðar — hrein gögn + vörpun
 *  sleðagilda yfir í líkamsmótun/ljós og liti. Prófað í node. */

import type { LiquifyMode } from "../studio/adjust";
import { DEFAULT_TUNE, normalizeTune, type BodyTune } from "../likami/bodyWarp";
import { NEUTRAL_LOOKS, normalizeLooks, type Looks } from "./looks";
import type { RetouchMode } from "./retouch";

export type TabId = "likami" | "mota" | "lagfaera" | "stilla" | "snjallt";

export type BrushMode = LiquifyMode | RetouchMode | "restore";

/** Sleði: gildi á skjá -100..100 (eða 0..100), endamerki útskýra áttina. */
export type SliderSpec = { min: number; max: number; left: string; right: string };

export type BodyToolId = "auto" | "slim" | "waist" | "hips" | "bust" | "shoulders" | "legs" | "head";
export type LookToolId = keyof Looks;

export type ToolItem<Id extends string> = { id: Id; label: string; icon: string; hint: string };

export const TABS: Array<{ id: TabId; label: string; hint: string }> = [
  { id: "likami", label: "Líkami", hint: "Finnur líkamann og mótar mitti, mjaðmir, fótleggi o.fl. með sleða" },
  { id: "mota", label: "Móta", hint: "Bursti sem mjókkar, þenur eða færir línur" },
  { id: "lagfaera", label: "Lagfæra", hint: "Húð, blettir, afritun, ljós og skuggi með bursta" },
  { id: "stilla", label: "Litir", hint: "Ljós og litir: birta, kontrast, litir og skerpa á allri myndinni" },
  { id: "snjallt", label: "Snjallt", hint: "Gervigreind: viðgerð, Topaz, Clarity, Hraðbreyta, bakgrunnur, endurljós, andlit" },
];

/** Titill neðst meðan tól í flipanum er opið. */
export const TAB_TITLES: Record<TabId, string> = {
  likami: "Líkami",
  mota: "Móta",
  lagfaera: "Lagfæra",
  stilla: "Ljós og litir",
  snjallt: "Snjallt",
};

export const BODY_TOOLS: Array<ToolItem<BodyToolId> & { slider: SliderSpec }> = [
  { id: "auto", label: "Sjálfvirkt", icon: "✨", hint: "Grennir búk, mitti og mjaðmir og lengir fótleggi örlítið, allt í einu", slider: { min: 0, max: 100, left: "", right: "meira" } },
  { id: "slim", label: "Búkur", icon: "⧖", hint: "Allur búkurinn, frá öxlum niður á læri", slider: { min: -100, max: 100, left: "grennri", right: "fyllri" } },
  { id: "waist", label: "Mitti", icon: ")(", hint: "Mitti og magi", slider: { min: -100, max: 100, left: "mjórra", right: "breiðara" } },
  { id: "hips", label: "Mjaðmir", icon: "◖◗", hint: "Mjaðmir og rass", slider: { min: -100, max: 100, left: "mjórri", right: "breiðari" } },
  { id: "bust", label: "Brjóst", icon: "◡◡", hint: "Brjóstkassi", slider: { min: -100, max: 100, left: "minni", right: "stærri" } },
  { id: "shoulders", label: "Axlir", icon: "⌒", hint: "Axlabreidd", slider: { min: -100, max: 100, left: "mjórri", right: "breiðari" } },
  { id: "legs", label: "Fótleggir", icon: "⇕", hint: "Lengir fótleggina (hnén þurfa að sjást)", slider: { min: 0, max: 100, left: "", right: "lengri" } },
  { id: "head", label: "Höfuð", icon: "◯", hint: "Stærð höfuðs", slider: { min: -100, max: 100, left: "minna", right: "stærra" } },
];

export const BRUSH_TABS: Record<"mota" | "lagfaera", Array<ToolItem<BrushMode>>> = {
  mota: [
    { id: "shrink", label: "Minnka", icon: "⇥⇤", hint: "Dregur inn þar sem þú strýkur — mjókkar" },
    { id: "expand", label: "Stækka", icon: "⇤⇥", hint: "Þenur út — gerir fyllra" },
    { id: "drag", label: "Færa", icon: "☝", hint: "Ýtir línu í áttina sem þú dregur" },
    { id: "restore", label: "Endurheimta", icon: "↺", hint: "Málar upprunalegu myndina aftur inn" },
  ],
  lagfaera: [
    { id: "smooth", label: "Slétta húð", icon: "≈", hint: "Mýkir húð og hrukkur" },
    { id: "heal", label: "Fjarlægja", icon: "✚", hint: "Tekur burt bletti, ör og hár — blandar úr umhverfinu" },
    { id: "clone", label: "Afrita", icon: "⧉", hint: "Afritar frá völdum upptökustað yfir þar sem þú strýkur" },
    { id: "lighten", label: "Lýsa", icon: "☀", hint: "Lýsir smám saman" },
    { id: "darken", label: "Skyggja", icon: "☾", hint: "Dekkir smám saman" },
    { id: "sharpen", label: "Skerpa", icon: "◇", hint: "Skerpir augu, hár og smáatriði" },
    { id: "contrast", label: "Kontrast", icon: "◐", hint: "Eykur kontrast staðbundið" },
    { id: "restore", label: "Endurheimta", icon: "↺", hint: "Málar upprunalegu myndina aftur inn" },
  ],
};

export const LOOK_TOOLS: Array<ToolItem<LookToolId> & { slider: SliderSpec }> = [
  { id: "brightness", label: "Birta", icon: "☀", hint: "Lýsir eða dekkir alla myndina", slider: { min: -100, max: 100, left: "dekkra", right: "bjartara" } },
  { id: "contrast", label: "Kontrast", icon: "◐", hint: "Munur ljóss og skugga", slider: { min: -100, max: 100, left: "flatara", right: "meiri" } },
  { id: "highlights", label: "Ljósir tónar", icon: "◑", hint: "Bjartustu svæðin — dragðu niður til að ná aftur útbrenndum himni og húð", slider: { min: -100, max: 100, left: "minna", right: "meira" } },
  { id: "shadows", label: "Skuggar", icon: "◒", hint: "Dekkstu svæðin — dragðu upp til að sjá inn í skugga", slider: { min: -100, max: 100, left: "dekkri", right: "ljósari" } },
  { id: "warmth", label: "Hlýja", icon: "🌡", hint: "Kaldari (blárri) eða hlýrri (gulari) birta", slider: { min: -100, max: 100, left: "kaldara", right: "hlýrra" } },
  { id: "saturation", label: "Mettun", icon: "🎨", hint: "Litastyrkur", slider: { min: -100, max: 100, left: "grárra", right: "litríkara" } },
  { id: "sharpen", label: "Skerpa", icon: "◇", hint: "Skerpir alla myndina", slider: { min: 0, max: 100, left: "", right: "skarpara" } },
  { id: "skinEven", label: "Jafna húð", icon: "≈", hint: "Minnkar roða og misliti í húð", slider: { min: 0, max: 100, left: "", right: "jafnara" } },
  { id: "skinTone", label: "Húðlitur", icon: "✋", hint: "Aðeins húðin: kaldari eða hlýrri", slider: { min: -100, max: 100, left: "kaldari", right: "hlýrri" } },
  { id: "skinLight", label: "Húðbirta", icon: "✦", hint: "Aðeins húðin: dekkri eða bjartari", slider: { min: -100, max: 100, left: "dekkri", right: "bjartari" } },
];

export type BodyValues = Record<BodyToolId, number>;
export const ZERO_BODY: BodyValues = { auto: 0, slim: 0, waist: 0, hips: 0, bust: 0, shoulders: 0, legs: 0, head: 0 };

/** „Sjálfvirkt“ á 100: hófleg grennkun + aðeins lengri fótleggir. */
const AUTO_PRESET: Partial<BodyTune> = { slim: -0.35, waist: -0.4, hips: -0.25, legs: 0.3 };

/** Sleðagildi (-100..100) → líkamsmótun. Sjálfvirkt leggst ofan á hin. */
export function bodyTuneFromValues(values: BodyValues): BodyTune {
  const a = values.auto / 100;
  const tune: BodyTune = { ...DEFAULT_TUNE };
  for (const key of Object.keys(DEFAULT_TUNE) as Array<keyof BodyTune>) {
    tune[key] = (values[key as BodyToolId] ?? 0) / 100 + (AUTO_PRESET[key] ?? 0) * a;
  }
  return normalizeTune(tune);
}

export type LookValues = Record<LookToolId, number>;
export const ZERO_LOOKS: LookValues = { ...NEUTRAL_LOOKS };

export function looksFromValues(values: LookValues): Looks {
  const out = { ...NEUTRAL_LOOKS };
  for (const key of Object.keys(NEUTRAL_LOOKS) as LookToolId[]) out[key] = (values[key] ?? 0) / 100;
  return normalizeLooks(out);
}

export function isLiquify(mode: BrushMode): mode is LiquifyMode {
  return mode === "shrink" || mode === "expand" || mode === "drag";
}
