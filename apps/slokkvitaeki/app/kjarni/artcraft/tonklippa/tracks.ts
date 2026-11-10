/** Lag sem er opið í Tónklippu: afkóðað hljóð, bylgjuform og taktgreining. */

import { analyzeTrack, buildPeaks, type Analysis, type Peaks } from "./analyze";
import { decodeToTrack } from "./audio";
import { trackDuration, type TrackAudio } from "./render";

export type TrackView = {
  id: string;
  name: string;
  duration: number;
  audio: TrackAudio;
  peaks: Peaks;
  analysis: Analysis;
};

/** Hleypir vafranum að (teikna stöðutexta) á milli þungra skrefa. */
export const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export const newId = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 8);

/** "01 - Lagið mitt.mp3" → "01 - Lagið mitt" */
export function trackNameFromFile(fileName: string): string {
  return fileName.replace(/\.[a-z0-9]{2,5}$/i, "").trim() || "Lag";
}

export async function buildTrackView(id: string, name: string, file: Blob): Promise<TrackView> {
  const audio = await decodeToTrack(file);
  await breathe();
  const peaks = buildPeaks(audio.channels, audio.scale, audio.sampleRate);
  await breathe();
  const analysis = analyzeTrack(audio.channels, audio.scale, audio.sampleRate);
  return { id, name, duration: trackDuration(audio), audio, peaks, analysis };
}
