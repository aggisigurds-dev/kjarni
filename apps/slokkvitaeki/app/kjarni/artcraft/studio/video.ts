/** Short clip from a still: seed-walk img2img, identity locked by the profile. */

export const VIDEO_KEY = "kjarni_private_studio_video";
export const ACTIONS_KEY = "kjarni_private_studio_actions";
export const MAX_CUSTOM_ACTIONS = 24;

export type ActionLoop = "pingpong" | "forward";

export type ActionCommand = {
  id: string;
  label: string;
  prompt: string;
  custom?: boolean;
  loop: ActionLoop;
  motion: number;
};

export const BUILTIN_ACTIONS: ActionCommand[] = [
  {
    id: "breathe",
    label: "Öndun",
    prompt: "subtle breathing, tiny chest movement, same pose, same face",
    loop: "pingpong",
    motion: 3,
  },
  {
    id: "head",
    label: "Höfuð",
    prompt: "slight head turn, eyes shift softly, same adult person, same clothes",
    loop: "pingpong",
    motion: 4,
  },
  {
    id: "look",
    label: "Horfa",
    prompt: "looking slightly left then right, same identity, same studio pose",
    loop: "pingpong",
    motion: 4,
  },
  {
    id: "turn",
    label: "Snúa sér",
    prompt: "slow body turn in place, same adult person, same clothes, studio still",
    loop: "forward",
    motion: 6,
  },
  {
    id: "spin",
    label: "Snúa í hring",
    prompt: "full 360 degree turn in place, same adult person, same clothes, keep face identity",
    loop: "forward",
    motion: 7,
  },
  {
    id: "stand",
    label: "Standa upp",
    prompt: "standing up from a seated pose to standing, same adult person, same clothes, keep face",
    loop: "forward",
    motion: 7,
  },
  {
    id: "poses",
    label: "Nokkrar pósur",
    prompt: "changing through a few fashion studio poses, same adult person, same clothes, keep face identity",
    loop: "forward",
    motion: 6,
  },
  {
    id: "dance",
    label: "Dansa",
    prompt: "dancing in place, a few dance moves, same adult person, same clothes, keep face identity",
    loop: "forward",
    motion: 8,
  },
  {
    id: "walk",
    label: "Ganga á stað",
    prompt: "subtle walk cycle in place, same adult person, same clothes, locked identity",
    loop: "pingpong",
    motion: 5,
  },
];

/** @deprecated use BUILTIN_ACTIONS — kept so older tests/imports still resolve kinds. */
export const MOTION_KINDS = BUILTIN_ACTIONS;

export type MotionKind = string;

export type VideoSettings = {
  frames: number;
  fps: number;
  motion: number;
  kind: string;
};

export const DEFAULT_VIDEO: VideoSettings = {
  frames: 8,
  fps: 8,
  motion: 4,
  kind: "breathe",
};

export function clampFrames(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_VIDEO.frames;
  return Math.min(16, Math.max(4, Math.round(n)));
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
  const kind = typeof src.kind === "string" && src.kind.trim() ? src.kind.trim() : DEFAULT_VIDEO.kind;
  return {
    frames: clampFrames(src.frames ?? DEFAULT_VIDEO.frames),
    fps: clampFps(src.fps ?? DEFAULT_VIDEO.fps),
    motion: clampMotion(src.motion ?? DEFAULT_VIDEO.motion),
    kind,
  };
}

export function newActionId(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function commandFromPrompt(label: string, prompt: string): ActionCommand | null {
  const text = prompt.trim();
  if (!text) return null;
  return {
    id: newActionId(),
    label: label.trim() || text.slice(0, 32),
    prompt: text,
    custom: true,
    loop: "forward",
    motion: 6,
  };
}

export function catalogOf(custom: ActionCommand[] = []): ActionCommand[] {
  const extras = custom.filter((a) => a?.id && a.prompt && !BUILTIN_ACTIONS.some((b) => b.id === a.id));
  return [...BUILTIN_ACTIONS, ...extras];
}

export function findAction(kind: string, custom: ActionCommand[] = []): ActionCommand {
  return catalogOf(custom).find((a) => a.id === kind) || BUILTIN_ACTIONS[0];
}

export function motionLine(kind: string, custom: ActionCommand[] = []): string {
  return findAction(kind, custom).prompt;
}

export function mergeMotion(user: string, kind: string, custom: ActionCommand[] = []): string {
  const motion = motionLine(kind, custom);
  const base = user.trim();
  if (!base) return motion;
  if (base.includes(motion)) return base;
  return `${base}, ${motion}`;
}

export function loopFrames(frames: string[], kind: string, custom: ActionCommand[] = []): string[] {
  return findAction(kind, custom).loop === "pingpong" ? pingPong(frames) : frames.slice();
}

/** Low denoising keeps the avatar; higher motion = more movement. */
export function videoDenoising(motion: number): number {
  const n = clampMotion(motion);
  return Math.round((0.1 + (n / 10) * 0.28) * 100) / 100;
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

function parseCustom(raw: unknown): ActionCommand[] {
  if (!Array.isArray(raw)) return [];
  const rows: ActionCommand[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<ActionCommand>;
    if (typeof row.id !== "string" || typeof row.prompt !== "string" || !row.prompt.trim()) continue;
    rows.push({
      id: row.id,
      label: (row.label || "Skipun").trim() || "Skipun",
      prompt: row.prompt.trim(),
      custom: true,
      loop: row.loop === "pingpong" ? "pingpong" : "forward",
      motion: clampMotion(row.motion ?? 6),
    });
  }
  return rows.slice(0, MAX_CUSTOM_ACTIONS);
}

export function readCustomActions(): ActionCommand[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ACTIONS_KEY);
    return raw ? parseCustom(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function writeCustomActions(rows: ActionCommand[]): ActionCommand[] {
  const next = parseCustom(rows);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ACTIONS_KEY, JSON.stringify(next));
  }
  return next;
}

export function saveCustomAction(current: ActionCommand[], next: ActionCommand): ActionCommand[] {
  const rows = [next, ...current.filter((a) => a.id !== next.id)].slice(0, MAX_CUSTOM_ACTIONS);
  return writeCustomActions(rows);
}

export function deleteCustomAction(current: ActionCommand[], id: string): ActionCommand[] {
  return writeCustomActions(current.filter((a) => a.id !== id));
}
