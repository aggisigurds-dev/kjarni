/** Person profile: up to 10 sharp face refs so a soft photo can be rebuilt. */

export const PROFILE_ACTIVE_KEY = "kjarni_private_studio_profile";
export const MAX_FACES = 10;
export const SHARPEN_DENOISING = 0.4;
export const AVATAR_DENOISING = 0.48;
export const MAX_FACE_UNITS = 4;

export const ORBIT_SLOTS = [
  { id: "front", label: "Framan", deg: 0 },
  { id: "frontRight", label: "Hægri ¾", deg: 45 },
  { id: "right", label: "Hægri", deg: 90 },
  { id: "backRight", label: "Hægri bak", deg: 135 },
  { id: "back", label: "Aftan", deg: 180 },
  { id: "backLeft", label: "Vinstri bak", deg: 225 },
  { id: "left", label: "Vinstri", deg: 270 },
  { id: "frontLeft", label: "Vinstri ¾", deg: 315 },
] as const;

export type OrbitId = (typeof ORBIT_SLOTS)[number]["id"];
export type OrbitMap = Partial<Record<OrbitId, string>>;

export type PersonProfile = {
  id: string;
  name: string;
  faces: string[];
  orbit: OrbitMap;
  updatedAt: number;
};

export function emptyOrbit(): OrbitMap {
  return {};
}

export function orbitImages(profile: PersonProfile | null | undefined): string[] {
  if (!profile?.orbit) return [];
  return ORBIT_SLOTS.map((slot) => profile.orbit[slot.id]).filter((src): src is string => Boolean(src));
}

export function orbitCount(profile: PersonProfile | null | undefined): number {
  return orbitImages(profile).length;
}

export function hasIdentity(profile: PersonProfile | null | undefined): boolean {
  return Boolean(profile && (profile.faces.length > 0 || orbitCount(profile) > 0));
}

export function canBuildAvatar(profile: PersonProfile | null | undefined): boolean {
  return (profile?.faces.length || 0) + orbitCount(profile) >= 4;
}

export function missingOrbitSlots(orbit: OrbitMap | undefined): Array<(typeof ORBIT_SLOTS)[number]> {
  return ORBIT_SLOTS.filter((slot) => !orbit?.[slot.id]);
}

export function canGuessOrbit(profile: PersonProfile | null | undefined): boolean {
  return missingOrbitSlots(profile?.orbit).length > 0;
}

export function avatarPrompt(name: string): string {
  const who = name.trim() || "the same adult person";
  return `photorealistic adult avatar of ${who}, consistent identity from every angle, full-body character turnaround sheet, eight views around the person (front, three-quarter, left, right, back), same clothes and body, studio lighting, sharp focus, no extra people`;
}

export function newProfileId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function identityPrompt(name: string): string {
  const who = name.trim() || "the same adult person";
  return `sharp in-focus face of ${who}, same identity, detailed eyes and skin, no motion blur, no soft focus`;
}

export function mergeIdentity(user: string, name: string, useProfile: boolean): string {
  if (!useProfile) return user.trim();
  const id = identityPrompt(name);
  const base = user.trim();
  if (!base) return id;
  if (base.includes("sharp in-focus face")) return base;
  return `${base}, ${id}`;
}

export function sheetLayout(count: number): { cols: number; rows: number } {
  const n = Math.min(MAX_FACES, Math.max(0, Math.round(count)));
  if (n <= 1) return { cols: 1, rows: 1 };
  if (n <= 4) return { cols: 2, rows: Math.ceil(n / 2) };
  if (n <= 6) return { cols: 3, rows: 2 };
  if (n <= 9) return { cols: 3, rows: 3 };
  return { cols: 5, rows: 2 };
}

export function pickFaceModel(models: string[]): string | null {
  const list = models.filter((m) => typeof m === "string");
  return (
    list.find((m) => /ip-adapter.*face|faceid|plus-face/i.test(m)) ||
    list.find((m) => /ip-adapter/i.test(m)) ||
    null
  );
}

export function pickFaceModule(modules: string[]): string {
  const list = modules.filter((m) => typeof m === "string");
  return (
    list.find((m) => /ip-adapter.*face|ip-adapter-auto/i.test(m)) ||
    list.find((m) => /ip-adapter/i.test(m)) ||
    "ip-adapter-auto"
  );
}

/** Face sheet, orbit sheet, then individual faces — capped at Forge ControlNet units. */
export function identityRefs(faces: string[], sheet?: string | null, orbitSheet?: string | null): string[] {
  const out: string[] = [];
  if (sheet) out.push(sheet);
  if (orbitSheet && out.length < MAX_FACE_UNITS) out.push(orbitSheet);
  for (const face of faces) {
    if (!face || out.length >= MAX_FACE_UNITS) break;
    out.push(face);
  }
  return out;
}

export function controlNetFaceArgs(
  refs: string[],
  toApi: (src: string) => string,
  model: string,
  module: string,
  weight = 0.7,
): unknown[] {
  return refs.slice(0, MAX_FACE_UNITS).filter(Boolean).map((img) => ({
    enabled: true,
    image: toApi(img),
    module,
    model,
    weight,
    resize_mode: "Crop and Resize",
    low_vram: false,
    processor_res: 224,
    threshold_a: 0.5,
    threshold_b: 0.5,
    guidance_start: 0.0,
    guidance_end: 1.0,
    control_mode: "Balanced",
    pixel_perfect: true,
  }));
}

export function identityScripts(
  refs: string[],
  toApi: (src: string) => string,
  adapter: { model: string; module: string } | null,
): Record<string, unknown> {
  const extra: Record<string, unknown> = { restore_faces: true };
  if (!adapter || refs.length === 0) return extra;
  const args = controlNetFaceArgs(refs, toApi, adapter.model, adapter.module);
  if (args.length === 0) return extra;
  extra.alwayson_scripts = { controlnet: { args } };
  return extra;
}

const STORE_PREFIX = "kjarni-studio-profile:";

export async function listProfiles(): Promise<PersonProfile[]> {
  const { keys, get } = await import("idb-keyval");
  const all = (await keys()) as string[];
  const ids = all.filter((k) => typeof k === "string" && k.startsWith(STORE_PREFIX));
  const rows: PersonProfile[] = [];
  for (const key of ids) {
    const row = (await get(key)) as PersonProfile | undefined;
    if (row?.id && Array.isArray(row.faces)) {
      rows.push({
        ...row,
        faces: row.faces,
        orbit: row.orbit && typeof row.orbit === "object" ? row.orbit : {},
      });
    }
  }
  return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveProfile(profile: PersonProfile): Promise<void> {
  const { set } = await import("idb-keyval");
  const next: PersonProfile = {
    ...profile,
    name: profile.name.trim() || "Án nafns",
    faces: profile.faces.slice(0, MAX_FACES),
    orbit: profile.orbit || {},
    updatedAt: Date.now(),
  };
  await set(`${STORE_PREFIX}${next.id}`, next);
}

export async function deleteProfile(id: string): Promise<void> {
  const { del } = await import("idb-keyval");
  await del(`${STORE_PREFIX}${id}`);
}

export function readActiveProfileId(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(PROFILE_ACTIVE_KEY) || "";
}

export function writeActiveProfileId(id: string): void {
  if (typeof window === "undefined") return;
  if (id) window.localStorage.setItem(PROFILE_ACTIVE_KEY, id);
  else window.localStorage.removeItem(PROFILE_ACTIVE_KEY);
}
