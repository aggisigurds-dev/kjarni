/** Pose, style and motion references so the avatar can copy a still, a clip, or an item. */

import { MAX_FACE_UNITS, ORBIT_SLOTS, controlNetFaceArgs, type OrbitId, type PersonProfile } from "./profile.ts";

export const POSE_DENOISING = 0.44;
export const POSE_DENOISING_PROMPT = 0.52;
export const STYLE_DENOISING = 0.38;
export const FIX_DENOISING = 0.46;
export const TURN_DENOISING = 0.4;
export const MAX_MOTION_FRAMES = 8;
export const MAX_CONTROL_UNITS = MAX_FACE_UNITS;

export type ControlAdapter = { model: string; module: string };

export type StyleKind = "clothes" | "jewelry" | "prop";

export const STYLE_KINDS: Array<{ id: StyleKind; label: string; prompt: string }> = [
  {
    id: "clothes",
    label: "Fatnaður",
    prompt: "wearing the same clothes and outfit as the reference photo, same adult person, keep face and pose",
  },
  {
    id: "jewelry",
    label: "Skartgripur",
    prompt: "wearing the same jewelry as the reference photo, same adult person, keep face and pose",
  },
  {
    id: "prop",
    label: "Hlutur",
    prompt: "holding or wearing the same object as the reference photo, same adult person, keep face and pose",
  },
];

export function styleOf(id: string): (typeof STYLE_KINDS)[number] {
  return STYLE_KINDS.find((s) => s.id === id) || STYLE_KINDS[0];
}

export function mergeStyle(user: string, kind: StyleKind): string {
  const line = styleOf(kind).prompt;
  const base = user.trim();
  if (!base) return line;
  if (base.includes(line)) return base;
  return `${base}, ${line}`;
}

export function posePrompt(name = ""): string {
  const who = name.trim() || "the same adult person";
  return `same pose as the reference image, match body stance and limb positions of ${who}, keep face identity and clothes, photorealistic studio photograph`;
}

export function mergePose(user: string, name = ""): string {
  const line = posePrompt(name);
  const base = user.trim();
  if (!base) return line;
  if (base.includes("same pose as the reference")) return base;
  return `${base}, ${line}`;
}

export function fixPrompt(user: string): string {
  const base = user.trim();
  const line =
    "fix only the painted region, keep the rest of the person identical, photorealistic, no extra people";
  if (!base) return line;
  if (base.includes("painted region")) return base;
  return `${base}, ${line}`;
}

export function motionRecreatePrompt(name = ""): string {
  const who = name.trim() || "the same adult person";
  return `recreate the motion and pose of the reference clip on ${who}, same identity, same clothes, photorealistic`;
}

/** Latest avatar/result first so pose and motion do not rewrite the original upload. */
export function studioStill(working: string, images: string[], source: string): string {
  return (working || images[0] || source || "").trim();
}

export function poseDenoising(hasPoseAdapter: boolean): number {
  return hasPoseAdapter ? POSE_DENOISING : POSE_DENOISING_PROMPT;
}

export function pickPoseModel(models: string[]): string | null {
  const list = models.filter((m) => typeof m === "string");
  return (
    list.find((m) => /dw_openpose|openpose/i.test(m)) ||
    list.find((m) => /pose/i.test(m) && !/ip-adapter/i.test(m)) ||
    null
  );
}

export function pickPoseModule(modules: string[]): string {
  const list = modules.filter((m) => typeof m === "string");
  return (
    list.find((m) => /dw_openpose/i.test(m)) ||
    list.find((m) => /openpose_full/i.test(m)) ||
    list.find((m) => /openpose/i.test(m)) ||
    "openpose"
  );
}

export function pickStyleModel(models: string[]): string | null {
  const list = models.filter((m) => typeof m === "string");
  return (
    list.find((m) => /ip-adapter/i.test(m) && !/face|faceid/i.test(m)) ||
    list.find((m) => /t2ia.*style|reference.?only/i.test(m)) ||
    null
  );
}

export function pickStyleModule(modules: string[]): string {
  const list = modules.filter((m) => typeof m === "string");
  return (
    list.find((m) => /ip-adapter-auto/i.test(m)) ||
    list.find((m) => /ip-adapter/i.test(m) && !/face/i.test(m)) ||
    list.find((m) => /ip-adapter/i.test(m)) ||
    "ip-adapter"
  );
}

export function controlUnit(
  image: string,
  toApi: (src: string) => string,
  adapter: ControlAdapter,
  opts?: { weight?: number; processorRes?: number; mode?: string },
): Record<string, unknown> {
  return {
    enabled: true,
    image: toApi(image),
    module: adapter.module,
    model: adapter.model,
    weight: opts?.weight ?? 0.75,
    resize_mode: "Crop and Resize",
    low_vram: false,
    processor_res: opts?.processorRes ?? 512,
    threshold_a: 0.5,
    threshold_b: 0.5,
    guidance_start: 0.0,
    guidance_end: 1.0,
    control_mode: opts?.mode || "Balanced",
    pixel_perfect: true,
  };
}

export function studioScripts(opts: {
  faceRefs?: string[];
  faceAdapter?: ControlAdapter | null;
  poseRef?: string | null;
  poseAdapter?: ControlAdapter | null;
  styleRef?: string | null;
  styleAdapter?: ControlAdapter | null;
  restoreFaces?: boolean;
  toApi: (src: string) => string;
}): Record<string, unknown> {
  const refs = (opts.faceRefs || []).filter(Boolean);
  const extra: Record<string, unknown> = {};
  const wantRestore = opts.restoreFaces === true || (opts.restoreFaces !== false && refs.length > 0);
  if (wantRestore) extra.restore_faces = true;

  const args: Record<string, unknown>[] = [];
  if (opts.poseRef?.trim() && opts.poseAdapter) {
    args.push(
      controlUnit(opts.poseRef, opts.toApi, opts.poseAdapter, {
        weight: 0.85,
        processorRes: 512,
        mode: "ControlNet is more important",
      }),
    );
  }
  if (opts.styleRef?.trim() && opts.styleAdapter) {
    args.push(
      controlUnit(opts.styleRef, opts.toApi, opts.styleAdapter, {
        weight: 0.62,
        processorRes: 224,
      }),
    );
  }
  const budget = MAX_CONTROL_UNITS - args.length;
  if (opts.faceAdapter && refs.length > 0 && budget > 0) {
    args.push(
      ...(controlNetFaceArgs(
        refs.slice(0, budget),
        opts.toApi,
        opts.faceAdapter.model,
        opts.faceAdapter.module,
      ) as Record<string, unknown>[]),
    );
  }
  if (args.length) extra.alwayson_scripts = { controlnet: { args } };
  return extra;
}

export function yawToSlot(deg: number): OrbitId {
  const n = ((deg % 360) + 360) % 360;
  let best = ORBIT_SLOTS[0];
  let bestDist = 999;
  for (const slot of ORBIT_SLOTS) {
    const d = Math.min(Math.abs(slot.deg - n), 360 - Math.abs(slot.deg - n));
    if (d < bestDist) {
      bestDist = d;
      best = slot;
    }
  }
  return best.id;
}

export const YAW_PROMPTS: Record<OrbitId, string> = {
  front: "front view, facing camera",
  frontRight: "three-quarter view from the right",
  right: "right side profile",
  backRight: "three-quarter view from the back right",
  back: "back view, facing away",
  backLeft: "three-quarter view from the back left",
  left: "left side profile",
  frontLeft: "three-quarter view from the left",
};

export function yawSlot(deg: number): (typeof ORBIT_SLOTS)[number] {
  const id = yawToSlot(deg);
  return ORBIT_SLOTS.find((s) => s.id === id) || ORBIT_SLOTS[0];
}

export function yawPrompt(deg: number, name = ""): string {
  const slot = yawSlot(deg);
  const who = name.trim() || "the same adult person";
  return `photorealistic full-body view of ${who} from ${slot.label} (${slot.deg} degrees), ${YAW_PROMPTS[slot.id]}, same clothes, same identity, studio photograph, sharp focus, single person`;
}

export type OrbitView = { id: OrbitId; label: string; deg: number; src: string };

export type TurnPreview = { src: string; label: string; kind: "avatar" | "orbit" | "still" };

export function turnPreview(
  deg: number,
  cached: Partial<Record<OrbitId, string>>,
  profile: PersonProfile | null | undefined,
  still: string,
): TurnPreview | null {
  const slot = yawSlot(deg);
  if (cached[slot.id]) return { src: cached[slot.id]!, label: slot.label, kind: "avatar" };
  const orbit = nearestOrbitView(profile, deg);
  if (orbit) return { src: orbit.src, label: slot.label, kind: "orbit" };
  if (still) return { src: still, label: slot.label, kind: "still" };
  return null;
}

export function nearestOrbitView(profile: PersonProfile | null | undefined, deg: number): OrbitView | null {
  const wanted = yawToSlot(deg);
  const wantedSlot = ORBIT_SLOTS.find((s) => s.id === wanted) || ORBIT_SLOTS[0];
  const exact = profile?.orbit?.[wanted];
  if (exact) return { id: wanted, label: wantedSlot.label, deg: wantedSlot.deg, src: exact };

  let best: OrbitView | null = null;
  let bestDist = 999;
  for (const slot of ORBIT_SLOTS) {
    const src = profile?.orbit?.[slot.id];
    if (!src) continue;
    const d = Math.min(Math.abs(slot.deg - wantedSlot.deg), 360 - Math.abs(slot.deg - wantedSlot.deg));
    if (d < bestDist) {
      bestDist = d;
      best = { id: slot.id, label: slot.label, deg: slot.deg, src };
    }
  }
  return best;
}

export function clampYaw(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(((n % 360) + 360) % 360);
}

export function clampMotionFrames(n: number): number {
  if (!Number.isFinite(n)) return 6;
  return Math.min(MAX_MOTION_FRAMES, Math.max(4, Math.round(n)));
}

export function motionFrameCount(durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 6;
  if (durationSec < 2) return 4;
  if (durationSec < 5) return 6;
  return MAX_MOTION_FRAMES;
}
