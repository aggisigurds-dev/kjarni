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

export function mergeProjectLists(
  local: { id: string; name: string; parts: number; updatedAt: number }[],
  cloud: { id: string; name: string; parts: number; updatedAt: number }[]
): ProjectListEntry[] {
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
      updatedAt: Math.max(existing.updatedAt, entry.updatedAt),
      cloud: true,
      local: true,
    });
  }
  return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
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
