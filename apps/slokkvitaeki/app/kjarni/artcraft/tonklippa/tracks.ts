/** Lag sem er opið í Tónklippu: afkóðað hljóð, bylgjuform og taktgreining. */

import { STEADY_ENOUGH, analyzeTrack, buildPeaks, type Analysis, type Highlight, type Peaks } from "./analyze";
import { waveSummary } from "./library";
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

/** "04.Kickstart_My_Heart.mp3" → "Kickstart My Heart": ending, undirstrik og
 *  lagnúmer fremst (með punkti eða bandstriki) fara. "99 Luftballons" helst. */
export function trackNameFromFile(fileName: string): string {
  const name = fileName
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/_+/g, " ")
    .replace(/^\d{1,3}\s*[.\-–]\s*(?=\S)/, "")
    .replace(/\s+/g, " ")
    .trim();
  return name || "Lag";
}

export async function buildTrackView(id: string, name: string, file: Blob): Promise<TrackView> {
  const audio = await decodeToTrack(file);
  await breathe();
  const peaks = buildPeaks(audio.channels, audio.scale, audio.sampleRate);
  await breathe();
  const analysis = analyzeTrack(audio.channels, audio.scale, audio.sampleRate);
  return { id, name, duration: trackDuration(audio), audio, peaks, analysis };
}

/** Það sem safnið geymir um lagið svo listar geti sýnt það án þess að afkóða. */
export function songSummary(tv: TrackView): { duration: number; bpm?: number; wave: number[]; highlights: Highlight[] } {
  return {
    duration: Math.round(tv.duration * 100) / 100,
    ...(tv.analysis.steady >= STEADY_ENOUGH && tv.analysis.bpm > 0 ? { bpm: Math.round(tv.analysis.bpm) } : {}),
    wave: waveSummary(tv.peaks.peak),
    highlights: tv.analysis.highlights.map((h) => ({ t: Math.round(h.t * 100) / 100, score: Math.round(h.score * 100) / 100 })),
  };
}
