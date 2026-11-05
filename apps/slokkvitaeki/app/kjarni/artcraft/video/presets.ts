/** Val í myndbandsham Móta — hrein gögn, prófuð í node. */

export type VideoModelId = "wan" | "kling";

export const MOTION_PRESETS: Array<{ label: string; prompt: string }> = [
  { label: "Myndavél inn", prompt: "slow cinematic camera push-in, subtle natural motion, smooth" },
  { label: "Gengur áfram", prompt: "the person walks forward naturally toward the camera, smooth motion" },
  { label: "Snýr sér", prompt: "the person slowly turns around, natural body movement" },
  { label: "Brosir og veifar", prompt: "the person smiles warmly and waves at the camera" },
  { label: "Vindur í hári", prompt: "gentle wind moves the hair and clothes, natural motion, calm" },
  { label: "Dansar", prompt: "the person dances gracefully with smooth flowing movement" },
  { label: "Hringur um", prompt: "the camera slowly orbits around the subject, cinematic" },
];

// ---------------------------------------------------------------- eigin prompt

/** Fimm hólf fyrir hreyfiprompt sem notandinn breytir og geymast í vafranum. */
export type VideoPromptSlot = { label: string; prompt: string };
export const VIDEO_PROMPT_SLOTS = 5;
export const VIDEO_PROMPTS_KEY = "kjarni_mota_video_prompts_v1";

export function defaultVideoPromptSlots(): VideoPromptSlot[] {
  return MOTION_PRESETS.slice(0, VIDEO_PROMPT_SLOTS).map((m) => ({ label: m.label, prompt: m.prompt }));
}

/** Les vistuð hólf; ógild eða vantandi hólf fá sjálfgefið efni. Alltaf 5. */
export function normalizeVideoPromptSlots(raw: unknown): VideoPromptSlot[] {
  const defs = defaultVideoPromptSlots();
  const list = Array.isArray(raw) ? raw : [];
  return defs.map((d, i) => {
    const v = list[i] as Partial<VideoPromptSlot> | undefined;
    const label = typeof v?.label === "string" && v.label.trim() ? v.label.trim().slice(0, 24) : d.label;
    const prompt = typeof v?.prompt === "string" ? v.prompt.slice(0, 600) : d.prompt;
    return { label, prompt };
  });
}

export type LengthChoice = {
  id: string;
  label: string;
  model: VideoModelId;
  /** Wan: rammar, rammar/sek, brúun upp í 30 fps. */
  numFrames?: number;
  fps?: number;
  interpolate?: boolean;
  /** Kling: sekúndur. */
  duration?: 5 | 10;
};

/** Wan 2.2 leyfir mest 121 ramma (schema). „10 s mjúkt“ = 121 rammi spilaður
 *  á 12 fps og brúaður upp í 30 fps — lengra, hreyfing aðeins hægari. */
export const LENGTHS: LengthChoice[] = [
  { id: "wan5", label: "5 s", model: "wan", numFrames: 81, fps: 16 },
  { id: "wan7", label: "7,5 s", model: "wan", numFrames: 121, fps: 16 },
  { id: "wan10", label: "10 s mjúkt", model: "wan", numFrames: 121, fps: 12, interpolate: true },
  { id: "kling5", label: "5 s", model: "kling", duration: 5 },
  { id: "kling10", label: "10 s", model: "kling", duration: 10 },
];

export function lengthsFor(model: VideoModelId): LengthChoice[] {
  return LENGTHS.filter((l) => l.model === model);
}

/** Áætluð lengd bútsins í sekúndum. */
export function expectedSeconds(l: LengthChoice): number {
  if (l.model === "kling") return l.duration ?? 5;
  return (l.numFrames ?? 81) / (l.fps ?? 16);
}

/** Rammar á sekúndu í útkomunni (til að sleppa einum ramma við samskeyti). */
export function outputFps(l: LengthChoice): number {
  if (l.model === "kling") return 24;
  return l.interpolate ? 30 : (l.fps ?? 16);
}

/** Myndhlutfall sem næst stærð myndar — Wan og Kling taka 16:9, 9:16 eða 1:1. */
export function nearestAspect(width: number, height: number): "16:9" | "9:16" | "1:1" {
  const r = width / Math.max(1, height);
  if (r > 1.2) return "16:9";
  if (r < 0.83) return "9:16";
  return "1:1";
}

// ---------------------------------------------------------------- hlutföll

export type AspectId = "orig" | "9:16" | "4:5" | "1:1" | "16:9";
export type FitMode = "cover" | "contain";

export const ASPECT_CHOICES: Array<{ id: AspectId; label: string; ratio: number | null }> = [
  { id: "orig", label: "Eins og myndin", ratio: null },
  { id: "9:16", label: "9:16 sími", ratio: 9 / 16 },
  { id: "4:5", label: "4:5", ratio: 4 / 5 },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "16:9", label: "16:9 breitt", ratio: 16 / 9 },
];

type Rect = { x: number; y: number; w: number; h: number };

/** Hvernig mynd srcW×srcH er sett í ramma með hlutfallinu `ratio`.
 *  cover = klippt (enginn auður flötur; lóðrétt staða `focusY`, sjálfgefið
 *  aðeins ofan við miðju svo höfuð haldist inni), contain = öll myndin með
 *  óskýrri fyllingu í kring. Myndin er aldrei stækkuð umfram upprunastærð. */
export function reframePlan(
  srcW: number,
  srcH: number,
  ratio: number | null,
  fit: FitMode,
  maxSide = 1920,
  focusY = 0.4,
): { width: number; height: number; src: Rect; dst: Rect } {
  const r = ratio && ratio > 0 ? ratio : srcW / srcH;
  if (fit === "cover" || !ratio) {
    let w = srcW;
    let h = srcH;
    if (srcW / srcH > r) w = srcH * r;
    else h = srcW / r;
    const x = (srcW - w) / 2;
    const y = (srcH - h) * Math.min(1, Math.max(0, focusY));
    const k = Math.min(1, maxSide / Math.max(w, h));
    const width = Math.max(2, Math.round(w * k));
    const height = Math.max(2, Math.round(h * k));
    return { width, height, src: { x, y, w, h }, dst: { x: 0, y: 0, w: width, h: height } };
  }
  // contain: rammi sem rúmar alla myndina
  let fw = srcW;
  let fh = srcH;
  if (srcW / srcH > r) fh = srcW / r;
  else fw = srcH * r;
  const k = Math.min(1, maxSide / Math.max(fw, fh));
  const width = Math.max(2, Math.round(fw * k));
  const height = Math.max(2, Math.round(fh * k));
  const dw = srcW * k;
  const dh = srcH * k;
  return {
    width,
    height,
    src: { x: 0, y: 0, w: srcW, h: srcH },
    dst: { x: (width - dw) / 2, y: (height - dh) / 2, w: dw, h: dh },
  };
}
