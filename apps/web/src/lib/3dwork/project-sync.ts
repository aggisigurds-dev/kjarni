/**
 * Pure helpers for keeping one 3dwork project in step across computers.
 *
 * The bench is local-first (IndexedDB) and every project with parts is pushed
 * to Supabase. These functions decide, without touching either store, whether
 * the cloud copy should replace what a computer has, how the project list is
 * merged, and how two edits of the same project are folded together.
 */

import type { Part, Project } from './project';

/** One row in the Projects switcher: local, cloud, or both. */
export interface ProjectListEntry {
  id: string;
  name: string;
  parts: number;
  updatedAt: number;
  /** Names of the parts on the bench, so builds with the same name can be told apart. */
  partNames?: string[];
  /** Saved on Supabase, so it opens on other computers too. */
  cloud: boolean;
  /** Present in this browser's IndexedDB. */
  local: boolean;
}

/**
 * Clock skew and the debounce between an edit and its push mean two stamps
 * within a couple of seconds are the same save, not a newer one.
 */
export const STAMP_SLACK_MS = 2000;

export function cloudIsNewer(localUpdatedAt: number | undefined, cloudUpdatedAt: number | undefined): boolean {
  const cloud = cloudUpdatedAt ?? 0;
  const local = localUpdatedAt ?? 0;
  return cloud > local + STAMP_SLACK_MS;
}

/**
 * The stamp a local save should carry. The copy that came from disk or
 * Supabase, or was just pushed, keeps the stamp it already has. Stamping it
 * "now" on every autosave made an untouched build look edited here, and the
 * next start pushed it over whatever another computer had saved since.
 * Anything else is an edit made here: undefined, so the save stamps now.
 */
export function localSaveStamp(
  project: Project,
  clean: { project: Project | null; stamp?: number }
): number | undefined {
  return project === clean.project ? clean.stamp : undefined;
}

type ListedProject = { id: string; name: string; parts: number; updatedAt: number; partNames?: string[] };

export function mergeProjectLists(local: ListedProject[], cloud: ListedProject[]): ProjectListEntry[] {
  const byId = new Map<string, ProjectListEntry>();
  for (const entry of local) {
    byId.set(entry.id, { ...entry, cloud: false, local: true });
  }
  for (const entry of cloud) {
    const existing = byId.get(entry.id);
    if (!existing) {
      byId.set(entry.id, { ...entry, cloud: true, local: false });
      continue;
    }
    const takeCloud = cloudIsNewer(existing.updatedAt, entry.updatedAt);
    byId.set(entry.id, {
      id: entry.id,
      name: takeCloud ? entry.name : existing.name,
      parts: takeCloud ? entry.parts : existing.parts,
      partNames: takeCloud ? (entry.partNames ?? existing.partNames) : (existing.partNames ?? entry.partNames),
      updatedAt: Math.max(existing.updatedAt, entry.updatedAt),
      cloud: true,
      local: true,
    });
  }
  return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Names a build keeps until someone names it. */
const PLACEHOLDER_NAMES = new Set(['Untitled blaster', 'New build']);

/**
 * A part's name as a person would say it: without the dash exports put in
 * front, the file extension, or a trailing date stamp.
 */
export function cleanPartName(name: string): string {
  const cleaned = name
    .replace(/^[\s\-–—]+/, '')
    .replace(/\.(stl|3mf|obj)\d*$/i, '')
    .replace(/[_\s]\d{6}_\d{6}$/, '')
    .trim();
  return cleaned || name;
}

/**
 * What to call a build in a list. One still wearing a placeholder name is
 * called by its parts, so three "New build"s can be told apart.
 */
export function buildLabel(name: string, partNames: string[] = []): string {
  if (!PLACEHOLDER_NAMES.has(name.trim()) || partNames.length === 0) return name;
  const named = partNames.slice(0, 2).map(cleanPartName).join(' + ');
  return partNames.length > 2 ? `${named} +${partNames.length - 2}` : named;
}

/** The parts a build holds, for the line under its name. */
export function partsLine(partNames: string[] = [], limit = 3): string {
  const named = partNames.slice(0, limit).map(cleanPartName).join(' · ');
  return partNames.length > limit ? `${named} · +${partNames.length - limit} more` : named;
}

/** The name for a build that just got its first parts: its first part's, unless someone named it. */
export function nameFromFirstParts(name: string, partNames: string[]): string {
  return PLACEHOLDER_NAMES.has(name.trim()) && partNames.length > 0 ? cleanPartName(partNames[0]) : name;
}

function walkParts(parts: Part[], visit: (part: Part) => void) {
  for (const part of parts) {
    visit(part);
    if (part.group?.members?.length) walkParts(part.group.members, visit);
  }
}

/**
 * Fold a newer cloud copy into a project this computer has edited meanwhile.
 * Parts are unioned by id — a part uploaded on the other computer appears, a
 * part edited here keeps this computer's version. Nothing is dropped: losing
 * a mesh someone just uploaded is worse than showing one they deleted.
 */
export function mergeProjects(
  local: Project,
  cloud: Project
): { project: Project; addedFromCloud: Part[] } {
  const localIds = new Set<string>();
  walkParts(local.parts, (part) => localIds.add(part.id));
  const addedFromCloud = cloud.parts.filter((part) => !localIds.has(part.id));
  if (addedFromCloud.length === 0) {
    return { project: local, addedFromCloud };
  }
  const slots = local.slots.map((slot) => {
    if (slot.activePartId) return slot;
    const cloudSlot = cloud.slots.find((entry) => entry.id === slot.id);
    const candidate = cloudSlot?.activePartId;
    return candidate && addedFromCloud.some((part) => part.id === candidate)
      ? { ...slot, activePartId: candidate }
      : slot;
  });
  return {
    project: {
      ...local,
      slots,
      parts: [...local.parts, ...addedFromCloud],
      updatedAt: Math.max(local.updatedAt ?? 0, cloud.updatedAt ?? 0),
    },
    addedFromCloud,
  };
}

/** Geometry the merged project needs that this computer does not have yet. */
export function mergeGeometries(
  local: Map<string, Float32Array>,
  cloud: Map<string, Float32Array>
): Map<string, Float32Array> {
  const out = new Map(local);
  for (const [id, soup] of cloud) {
    if (!out.has(id)) out.set(id, soup);
  }
  return out;
}

/** Short "how long ago" for the Projects switcher: now · 5 min · 3 h · 2 d · 28.8. */
export function sinceLabel(updatedAt: number, now = Date.now()): string {
  if (!updatedAt) return '';
  const minutes = Math.round(Math.max(0, now - updatedAt) / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days} d`;
  const date = new Date(updatedAt);
  return `${date.getDate()}.${date.getMonth() + 1}.`;
}
