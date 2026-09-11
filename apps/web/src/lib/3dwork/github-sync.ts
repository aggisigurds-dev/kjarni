/**
 * Packing helpers for 3dwork's GitHub cloud save.
 *
 * Geometry stays binary (Float32 triangle soups). A cheap fingerprint lets the
 * client skip re-uploading a mesh that GitHub already has.
 */

import type { Project } from './project';

export interface CloudProjectIndexEntry {
  id: string;
  name: string;
  parts: number;
  updatedAt: number;
}

export interface CloudManifest {
  [versionId: string]: string;
}

export function soupFingerprint(soup: Float32Array): string {
  let hash = soup.length >>> 0;
  const step = Math.max(1, Math.floor(soup.length / 96));
  for (let i = 0; i < soup.length; i += step) {
    hash = Math.imul(hash, 33) ^ (Math.round(soup[i] * 1000) | 0);
  }
  if (soup.length > 0) {
    hash ^= Math.round(soup[0] * 1000) | 0;
    hash ^= Math.round(soup[soup.length - 1] * 1000) | 0;
  }
  return `${soup.length.toString(16)}-${(hash >>> 0).toString(16)}`;
}

export function buildManifest(geometries: Iterable<[string, Float32Array]>): CloudManifest {
  const manifest: CloudManifest = {};
  for (const [id, soup] of geometries) {
    manifest[id] = soupFingerprint(soup);
  }
  return manifest;
}

/**
 * The manifest to store after a push.
 *
 * Meshes this computer holds take their fresh fingerprints. A mesh the project
 * still uses but this computer never loaded keeps the entry it already had —
 * so a push from a tab that is still loading, or that lost a mesh to a race,
 * can never make every other computer lose that part.
 */
export function mergeManifest(
  next: CloudManifest,
  previous: CloudManifest | null,
  referenced: Iterable<string>
): CloudManifest {
  const merged: CloudManifest = { ...next };
  if (!previous) return merged;
  for (const id of referenced) {
    if (!(id in merged) && previous[id]) merged[id] = previous[id];
  }
  return merged;
}

export function geometryUploads(
  next: CloudManifest,
  previous: CloudManifest | null
): string[] {
  const ids: string[] = [];
  for (const id of Object.keys(next)) {
    if (!previous || previous[id] !== next[id]) ids.push(id);
  }
  return ids;
}

export function upsertIndex(
  index: CloudProjectIndexEntry[],
  entry: CloudProjectIndexEntry
): CloudProjectIndexEntry[] {
  const without = index.filter((item) => item.id !== entry.id);
  return [entry, ...without].sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * The meshes a project needs in memory to be worked on: each part's live
 * version, and the live versions of group members (joining a group into one
 * piece works member by member).
 */
export function activeVersionIds(project: Project): string[] {
  const ids: string[] = [];
  const walk = (parts: Project['parts']) => {
    for (const part of parts) {
      if (part.activeVersionId) ids.push(part.activeVersionId);
      if (part.group?.members) walk(part.group.members);
    }
  };
  walk(project.parts);
  return ids;
}

export function projectVersionIds(project: Project): string[] {
  const ids: string[] = [];
  const walk = (parts: Project['parts']) => {
    for (const part of parts) {
      for (const version of part.versions ?? []) ids.push(version.id);
      if (part.group?.members) walk(part.group.members);
    }
  };
  walk(project.parts);
  return ids;
}
