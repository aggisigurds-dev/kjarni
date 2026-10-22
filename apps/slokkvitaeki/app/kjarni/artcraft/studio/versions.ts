/** Named avatar outfits stored per person profile. */

export const MAX_VERSIONS = 12;
export const VERSION_DENOISING = 0.4;
const STORE_PREFIX = "kjarni-studio-versions:";

export type AvatarVersion = {
  id: string;
  label: string;
  image: string;
  prompt: string;
  updatedAt: number;
};

export const VERSION_PRESETS = [
  {
    id: "summer",
    label: "Sumarútgáfa",
    prompt:
      "summer outfit, light airy clothes, warm daylight, same adult person, keep face and body",
  },
  {
    id: "elegant",
    label: "Elegant",
    prompt: "elegant evening dress and fine jewelry, same adult person, keep face and body",
  },
  {
    id: "christmas",
    label: "Jólafatnaður",
    prompt: "festive Christmas outfit, same adult person, keep face and body",
  },
  {
    id: "disco",
    label: "Diskó",
    prompt: "disco party outfit, sequins, nightlife, same adult person, keep face and body",
  },
] as const;

export function versionPreset(id: string): (typeof VERSION_PRESETS)[number] | undefined {
  return VERSION_PRESETS.find((p) => p.id === id);
}

export function newVersionId(): string {
  return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function versionPrompt(label: string): string {
  const name = label.trim() || "outfit";
  return `${name} look, same adult person, keep face and body, photorealistic studio photograph`;
}

export function mergeVersion(user: string, line: string): string {
  const look = line.trim();
  const base = user.trim();
  if (!look) return base;
  if (!base) return look;
  if (base.includes(look)) return base;
  return `${base}, ${look}`;
}

export function parseVersions(raw: unknown): AvatarVersion[] {
  if (!Array.isArray(raw)) return [];
  const rows: AvatarVersion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<AvatarVersion>;
    if (typeof row.id !== "string" || typeof row.image !== "string" || !row.image) continue;
    rows.push({
      id: row.id,
      label: (row.label || "Útgáfa").trim() || "Útgáfa",
      image: row.image,
      prompt: typeof row.prompt === "string" ? row.prompt : "",
      updatedAt: typeof row.updatedAt === "number" ? row.updatedAt : 0,
    });
  }
  return rows.slice(0, MAX_VERSIONS);
}

export function upsertVersion(list: AvatarVersion[], next: AvatarVersion): AvatarVersion[] {
  const label = next.label.trim().toLowerCase();
  const without = list.filter((v) => v.id !== next.id && v.label.trim().toLowerCase() !== label);
  return [next, ...without].slice(0, MAX_VERSIONS);
}

export function dropVersion(list: AvatarVersion[], id: string): AvatarVersion[] {
  return list.filter((v) => v.id !== id);
}

export async function loadVersions(profileId: string): Promise<AvatarVersion[]> {
  if (!profileId) return [];
  const { get } = await import("idb-keyval");
  return parseVersions(await get(`${STORE_PREFIX}${profileId}`));
}

export async function saveVersions(profileId: string, rows: AvatarVersion[]): Promise<AvatarVersion[]> {
  const next = parseVersions(rows);
  if (!profileId) return next;
  const { set } = await import("idb-keyval");
  await set(`${STORE_PREFIX}${profileId}`, next);
  return next;
}
