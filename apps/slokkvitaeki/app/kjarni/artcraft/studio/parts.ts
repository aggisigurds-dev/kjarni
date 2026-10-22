/** Body-part drop zones so photos are stamped onto an avatar piece by piece. */

export const IMPRINT_DENOISING = 0.38;

export type BodyPart = {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

/** Normalized boxes on a full-body A-pose / portrait. */
export const BODY_PARTS: BodyPart[] = [
  { id: "head", label: "Andlit", x: 0.32, y: 0.03, w: 0.36, h: 0.18 },
  { id: "torso", label: "Bolur", x: 0.3, y: 0.18, w: 0.4, h: 0.26 },
  { id: "armL", label: "Vinstri hönd", x: 0.02, y: 0.16, w: 0.3, h: 0.34 },
  { id: "armR", label: "Hægri hönd", x: 0.68, y: 0.16, w: 0.3, h: 0.34 },
  { id: "legL", label: "Vinstri fótleggur", x: 0.2, y: 0.42, w: 0.3, h: 0.54 },
  { id: "legR", label: "Hægri fótleggur", x: 0.5, y: 0.42, w: 0.3, h: 0.54 },
];

export const FULL_STAMP: BodyPart = { id: "full", label: "Allur", x: 0.16, y: 0.02, w: 0.68, h: 0.96 };

export function bodyPart(id: string): BodyPart | undefined {
  return BODY_PARTS.find((p) => p.id === id);
}

export function hitPart(nx: number, ny: number): BodyPart | null {
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
  const x = Math.min(1, Math.max(0, nx));
  const y = Math.min(1, Math.max(0, ny));
  return (
    BODY_PARTS.find((p) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) || null
  );
}

export function partBox(width: number, height: number, part: BodyPart): { x: number; y: number; w: number; h: number } {
  return {
    x: Math.round(part.x * width),
    y: Math.round(part.y * height),
    w: Math.max(1, Math.round(part.w * width)),
    h: Math.max(1, Math.round(part.h * height)),
  };
}

export function partCoverage(done: string[]): number {
  const ids = new Set(done.filter((id) => bodyPart(id)));
  return ids.size / BODY_PARTS.length;
}

export function imprintPrompt(part: BodyPart, name = ""): string {
  const who = name.trim() || "the same adult person";
  return `imprint the reference photo onto the ${part.label} of ${who}, keep the rest of the body identical, photorealistic, no extra people`;
}

export function coverageLabel(done: string[]): string {
  const n = new Set(done.filter((id) => bodyPart(id))).size;
  return `${n} af ${BODY_PARTS.length} pörtum`;
}

export type PartStamp = {
  image: string;
  frames?: string[];
  name?: string;
};

export function pickKeyFrame(frames: string[]): string {
  if (frames.length === 0) return "";
  return frames[Math.floor((frames.length - 1) / 2)] || frames[0];
}

export function clipFrameCount(stamp: PartStamp | undefined): number {
  return stamp?.frames?.length || 0;
}

export function isClipStamp(stamp: PartStamp | undefined): boolean {
  return clipFrameCount(stamp) > 1;
}

export function stampIds(stamps: Partial<Record<string, PartStamp | string>>): string[] {
  return Object.keys(stamps).filter((id) => {
    const row = stamps[id];
    return Boolean(row && (typeof row === "string" ? row : row.image));
  });
}
