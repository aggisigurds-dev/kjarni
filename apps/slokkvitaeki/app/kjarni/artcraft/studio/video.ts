/** Short clip from a still: seed-walk img2img, identity locked by the profile. */

export const VIDEO_KEY = "kjarni_private_studio_video";

export const MOTION_KINDS = [
  { id: "breathe", label: "Öndun", prompt: "subtle breathing, tiny chest movement, same pose, same face" },
  { id: "head", label: "Höfuð", prompt: "slight head turn, eyes shift softly, same adult person, same clothes" },
  { id: "look", label: "Horfa", prompt: "looking slightly left then right, same identity, same studio pose" },
  { id: "turn", label: "Snúningur", prompt: "slow body turn in place, same adult person, same clothes, studio still" },
  { id: "walk", label: "Ganga á stað", prompt: "subtle walk cycle in place, same adult person, same clothes, locked identity" },
] as const;

export type MotionKind = (typeof MOTION_KINDS)[number]["id"];

export type VideoSettings = {
  frames: number;
  fps: number;
  motion: number;
  kind: MotionKind;
};

export const DEFAULT_VIDEO: VideoSettings = {
  frames: 8,
  fps: 8,
  motion: 4,
  kind: "breathe",
};

export function clampFrames(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_VIDEO.frames;
  return Math.min(12, Math.max(4, Math.round(n)));
}

export function clampFps(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_VIDEO.fps;
  return Math.min(16, Math.max(4, Math.round(n)));
}

export function clampMotion(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_VIDEO.motion;
  return Math.min(10, Math.max(1, Math.round(n)));
}

export function normalizeVideo(raw: Partial<VideoSettings> | null | undefined): VideoSettings {
  const src = raw || {};
  const kind = MOTION_KINDS.some((k) => k.id === src.kind) ? (src.kind as MotionKind) : DEFAULT_VIDEO.kind;
  return {
    frames: clampFrames(src.frames ?? DEFAULT_VIDEO.frames),
    fps: clampFps(src.fps ?? DEFAULT_VIDEO.fps),
    motion: clampMotion(src.motion ?? DEFAULT_VIDEO.motion),
    kind,
  };
}

export function motionLine(kind: MotionKind): string {
  return MOTION_KINDS.find((k) => k.id === kind)?.prompt || MOTION_KINDS[0].prompt;
}

export function mergeMotion(user: string, kind: MotionKind): string {
  const motion = motionLine(kind);
  const base = user.trim();
  if (!base) return motion;
  if (base.includes(motion)) return base;
  return `${base}, ${motion}`;
}

/** Low denoising keeps the avatar; higher motion = more movement. */
export function videoDenoising(motion: number): number {
  const n = clampMotion(motion);
  return Math.round((0.1 + (n / 10) * 0.22) * 100) / 100;
}

export function clipSeconds(frames: number, fps: number): number {
  return clampFrames(frames) / clampFps(fps);
}

/** Forward then reverse without doubling the turnaround frames — loops cleanly. */
export function pingPong(frames: string[]): string[] {
  if (frames.length < 2) return frames.slice();
  return [...frames, ...frames.slice(1, -1).reverse()];
}

export function readStoredVideo(): VideoSettings {
  if (typeof window === "undefined") return DEFAULT_VIDEO;
  try {
    const raw = window.localStorage.getItem(VIDEO_KEY);
    return raw ? normalizeVideo(JSON.parse(raw) as Partial<VideoSettings>) : DEFAULT_VIDEO;
  } catch {
    return DEFAULT_VIDEO;
  }
}
