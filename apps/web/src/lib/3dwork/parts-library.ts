/**
 * The Partasafn's working parts: every part of every build, as one list to pick
 * from; the names a part is saved under; and a new board made of the picks.
 *
 * Pure — the meshes are loaded by the caller, so this runs the same in the
 * bench and in the unit tests.
 */

import { computeBounds } from './mesh';
import { createProject, identityTransform, newProjectId, type Part, type Project } from './project';

/** A part found in a build. */
export interface BuildPart {
  /** `projectId/partId`. */
  key: string;
  projectId: string;
  projectName: string;
  updatedAt: number;
  /** This computer has a copy of the build, so likely the mesh too. */
  local: boolean;
  partId: string;
  name: string;
  color: string;
  finishId?: string;
  materialId: string;
  triangles: number;
  /** The version on the bench: the mesh this part is. */
  versionId: string;
  thumbnail?: string;
  /** Other builds the very same part is in. */
  alsoIn: string[];
}

/** A build as the list is made from it: the parts it holds, and when it last changed. */
export interface BuildWithParts {
  id: string;
  name: string;
  updatedAt: number;
  parts: Part[];
}

/**
 * Every part of every build, newest build first. A build on this computer and
 * on Supabase counts once — its newer copy, with the pictures this computer
 * drew. The same part in several builds — same name, same triangle count —
 * shows once, from the newest, with the others listed; parts that are nearly
 * the same but not quite are all kept.
 */
export function partsOfBuilds(local: BuildWithParts[], cloud: BuildWithParts[]): BuildPart[] {
  const builds = new Map<string, { build: BuildWithParts; local: boolean; pictures: Map<string, string> }>();
  const picturesOf = (build: BuildWithParts) => {
    const pictures = new Map<string, string>();
    for (const part of build.parts) {
      if (part.thumbnail) pictures.set(part.activeVersionId, part.thumbnail);
    }
    return pictures;
  };
  for (const build of local) builds.set(build.id, { build, local: true, pictures: picturesOf(build) });
  for (const build of cloud) {
    const here = builds.get(build.id);
    if (!here) builds.set(build.id, { build, local: false, pictures: new Map() });
    else if (build.updatedAt > here.build.updatedAt) builds.set(build.id, { ...here, build });
  }

  const ordered = [...builds.values()].sort((a, b) => b.build.updatedAt - a.build.updatedAt);
  const byIdentity = new Map<string, BuildPart>();
  const list: BuildPart[] = [];
  for (const { build, local: isLocal, pictures } of ordered) {
    for (const part of build.parts) {
      if (!part.activeVersionId) continue;
      const identity = `${part.name}\u0000${part.triangles}`;
      const seen = byIdentity.get(identity);
      if (seen) {
        if (seen.projectId !== build.id && !seen.alsoIn.includes(build.name)) seen.alsoIn.push(build.name);
        continue;
      }
      const entry: BuildPart = {
        key: `${build.id}/${part.id}`,
        projectId: build.id,
        projectName: build.name,
        updatedAt: build.updatedAt,
        local: isLocal,
        partId: part.id,
        name: part.name,
        color: part.color,
        finishId: part.finishId,
        materialId: part.materialId,
        triangles: part.triangles,
        versionId: part.activeVersionId,
        thumbnail: part.thumbnail ?? pictures.get(part.activeVersionId),
        alsoIn: [],
      };
      byIdentity.set(identity, entry);
      list.push(entry);
    }
  }
  return list;
}

const VERSION_SUFFIX = /\s+v(\d+)$/i;

/** The next name in a line of versions: "Neðri" → "Neðri v2", "Neðri v2" → "Neðri v3". */
export function bumpVersionName(name: string): string {
  const trimmed = name.trim();
  const match = VERSION_SUFFIX.exec(trimmed);
  if (!match) return `${trimmed} v2`;
  return `${trimmed.slice(0, match.index)} v${Number(match[1]) + 1}`;
}

/** Where a part on the bench came from when it was taken out of the Partasafn. */
/**
 * What to tell the user when saving or loading failed: the error itself, or —
 * when the browser could not reach Supabase at all — what did not happen and why,
 * instead of a bare "Failed to fetch".
 */
export function failureNote(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : '';
  if (!message) return fallback;
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
    return `${fallback} Ekkert samband við Supabase.`;
  }
  return message;
}

export const FROM_LIBRARY = 'From the Partasafn';

/**
 * The name to offer when a part is saved into the Partasafn: as it is, unless
 * it came out of the library or already carries a version number — then the
 * next version, so saving work again does not overwrite the first.
 */
export function suggestLibraryName(part: Pick<Part, 'name' | 'notes'>): string {
  const fromLibrary = part.notes === FROM_LIBRARY || part.notes === 'From favorites';
  return fromLibrary || VERSION_SUFFIX.test(part.name.trim()) ? bumpVersionName(part.name) : part.name.trim();
}

/** A pick for a new board: what the part looks like, and its mesh. */
export interface BoardItem {
  name: string;
  color: string;
  finishId?: string;
  materialId: string;
  thumbnail?: string;
  soup: Float32Array;
}

/** Room left between parts laid out on a new board, mm. */
export const BOARD_GAP_MM = 20;

const freshId = (prefix: string, salt: number) =>
  `${prefix}_${Date.now().toString(36)}_${salt.toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * A new board holding the picks: each a part of its own with a fresh id and
 * one version, laid out in a row along X with a gap between them, standing on
 * the table and centred across it. Plain bench, no blaster slots.
 */
export function buildBoard(
  name: string,
  items: BoardItem[],
  now = Date.now()
): { project: Project; geometries: Map<string, Float32Array> } {
  const project: Project = {
    ...createProject(name.trim() || 'Nýtt board', newProjectId()),
    assembly: false,
    updatedAt: now,
  };
  const geometries = new Map<string, Float32Array>();
  let cursor = 0;
  items.forEach((item, index) => {
    const bounds = computeBounds(item.soup);
    const triangles = Math.floor(item.soup.length / 9);
    const versionId = freshId('ver', index);
    geometries.set(versionId, item.soup);
    project.parts.push({
      id: freshId('part', index),
      name: item.name,
      fileName: '',
      slotId: '',
      color: item.color,
      finishId: item.finishId,
      visible: true,
      transform: identityTransform(),
      triangles,
      materialId: item.materialId,
      notes: FROM_LIBRARY,
      versions: [{ id: versionId, label: 'v1 partasafn', note: `Úr Partasafni: ${item.name}`, triangles, createdAt: now }],
      activeVersionId: versionId,
      thumbnail: item.thumbnail,
      freePos: {
        x: cursor - bounds.min[0],
        y: 0 - bounds.min[1],
        z: 0 - bounds.center[2],
      },
      addedAt: now + index,
    });
    cursor += bounds.size[0] + BOARD_GAP_MM;
  });
  return { project, geometries };
}

/**
 * A copy of a build under a new name — "Vista sem…" — to go on working in,
 * with the build it was copied from left as it stood, to go back to.
 *
 * The copy gets its own id and every mesh its own version id, so neither
 * build can take a mesh from the other: removing a part from one never
 * empties the other. Part ids stay — they only have to be unique in a build.
 */
export function copyBuild(
  build: Project,
  name: string,
  geometries: Map<string, Float32Array>,
  now = Date.now()
): { project: Project; geometries: Map<string, Float32Array> } {
  const copied = new Map<string, Float32Array>();
  let salt = 0;
  const renamed = new Map<string, string>();
  const newVersionOf = (id: string) => {
    let fresh = renamed.get(id);
    if (!fresh) {
      fresh = freshId('ver', salt++);
      renamed.set(id, fresh);
      const soup = geometries.get(id);
      if (soup) copied.set(fresh, soup);
    }
    return fresh;
  };
  const copyPart = (part: Part): Part => ({
    ...part,
    versions: part.versions.map((version) => ({ ...version, id: newVersionOf(version.id) })),
    activeVersionId: newVersionOf(part.activeVersionId),
    ...(part.group ? { group: { ...part.group, members: part.group.members.map(copyPart) } } : {}),
  });
  return {
    project: {
      ...build,
      id: newProjectId(),
      name: name.trim() || `${build.name} afrit`,
      slots: build.slots.map((slot) => ({ ...slot })),
      parts: build.parts.map(copyPart),
      updatedAt: now,
    },
    geometries: copied,
  };
}
