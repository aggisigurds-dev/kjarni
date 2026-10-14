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
  /** What the bench knows about the part — for sorting it into a category. */
  notes: string;
  fileName: string;
  slotId: string;
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
        notes: part.notes ?? '',
        fileName: part.fileName ?? '',
        slotId: part.slotId ?? '',
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

/**
 * Height of the parts' centres on a new board, mm. The user (14.10.2026): the
 * picks should appear in the middle of the board at about 20 cm and be laid out
 * around it — before, they stood on the table in one row that ran almost 2 m
 * out past the edge of the 1.6 m plate.
 */
export const BOARD_HEIGHT_MM = 200;

/**
 * The picks once each: the same part ticked in two tabs (in "Allir partar" and
 * again in the collection it was saved to) would otherwise land on the board
 * twice. The first tick wins.
 */
export function dropRepeats<T>(items: readonly T[], identity: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = identity(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Footprints laid out in rows around the centre of the table: each row is
 * centred along X, the rows are stacked along Z and the whole block is
 * centred on the origin, so it comes out roughly square. Rows are a little
 * wider than the square root of the area, never narrower than the widest part.
 * Returns the centre of each footprint, in the order given.
 */
export function layoutAroundCentre(
  footprints: readonly { width: number; depth: number }[],
  gap = BOARD_GAP_MM
): { x: number; z: number }[] {
  if (footprints.length === 0) return [];
  const area = footprints.reduce((sum, entry) => sum + (entry.width + gap) * (entry.depth + gap), 0);
  const rowLimit = Math.max(...footprints.map((entry) => entry.width), Math.sqrt(area) * 1.15);
  const rows: { members: number[]; width: number; depth: number }[] = [];
  let row = { members: [] as number[], width: 0, depth: 0 };
  footprints.forEach((entry, index) => {
    const extra = (row.members.length > 0 ? gap : 0) + entry.width;
    if (row.members.length > 0 && row.width + extra > rowLimit) {
      rows.push(row);
      row = { members: [], width: 0, depth: 0 };
    }
    row.width += (row.members.length > 0 ? gap : 0) + entry.width;
    row.depth = Math.max(row.depth, entry.depth);
    row.members.push(index);
  });
  rows.push(row);
  const depth = rows.reduce((sum, entry) => sum + entry.depth, 0) + gap * (rows.length - 1);
  const centres = Array.from({ length: footprints.length }, () => ({ x: 0, z: 0 }));
  let z = -depth / 2;
  for (const line of rows) {
    let x = -line.width / 2;
    for (const index of line.members) {
      const entry = footprints[index];
      centres[index] = { x: x + entry.width / 2, z: z + line.depth / 2 };
      x += entry.width + gap;
    }
    z += line.depth + gap;
  }
  return centres;
}

const freshId = (prefix: string, salt: number) =>
  `${prefix}_${Date.now().toString(36)}_${salt.toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * A new board holding the picks: each a part of its own with a fresh id and
 * one version, laid out around the middle of the table (layoutAroundCentre)
 * with their centres at BOARD_HEIGHT_MM. Plain bench, no blaster slots.
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
  const allBounds = items.map((item) => computeBounds(item.soup));
  const centres = layoutAroundCentre(allBounds.map((bounds) => ({ width: bounds.size[0], depth: bounds.size[2] })));
  items.forEach((item, index) => {
    const bounds = allBounds[index];
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
        x: centres[index].x - bounds.center[0],
        y: BOARD_HEIGHT_MM - bounds.center[1],
        z: centres[index].z - bounds.center[2],
      },
      addedAt: now + index,
    });
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
