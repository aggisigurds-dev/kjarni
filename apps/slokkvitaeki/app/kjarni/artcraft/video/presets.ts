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
