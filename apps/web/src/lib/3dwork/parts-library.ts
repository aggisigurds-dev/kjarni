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
  /** Its category in the Partasafn: the AR-15 slot it takes on the board, if any. */
  category?: string;
}

/**
 * The AR-15 slots on a board, in the order a build is checked: each category
 * has a place relative to the main body (front = -X, as in his builds). The
 * user, 17.10.2026: the main body in the middle with its lowest point at 20 cm,
 * the grip receiver at the rear and the mag receiver in front under it, each
 * with its highest point at 20 cm — every sorted part roughly in its place, so
 * he sees what is still missing.
 */
export const AR_SLOTS: { category: string; label: string }[] = [
  { category: 'body', label: 'Main body' },
  { category: 'triggerbody', label: 'Grip receiver' },
  { category: 'magazine', label: 'Mag receiver' },
  { category: 'grip', label: 'Grip' },
  { category: 'handguard', label: 'Handguard' },
  { category: 'stalror', label: 'Hlaup / rör' },
  { category: 'stocksystem', label: 'Stock' },
  { category: 'accessories', label: 'Sigti / aukahlutir' },
];

/** Room between the assembled parts and the tray of loose parts in front of them, mm. */
export const TRAY_GAP_MM = 80;

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

type Box = { min: readonly number[]; max: readonly number[]; size: readonly number[]; center: readonly number[] };

/**
 * Where each pick goes on a board laid out as an AR-15 (front = -X): the main
 * body in the middle with its lowest point at BOARD_HEIGHT_MM; the grip
 * receiver under it at the rear and the mag receiver in front of that, both
 * topping out there; the grip under the grip receiver; the long steel tube
 * through the body; handguard (1) and then shorter barrels / tubes (2) out in
 * front; sights and accessories on top (3); stock
 * pieces behind, the smallest first (4, 5); further magazines under the mag
 * receiver. Everything else — internals, fittings, a second body, unsorted
 * parts — goes in a tidy tray on the table in front. Returns, per item, the
 * point to put the middle of its box at.
 */
export function assemblyLayout(
  items: readonly { bounds: Box; category?: string; name?: string }[]
): { x: number; y: number; z: number }[] {
  const out = items.map(() => ({ x: 0, y: 0, z: 0 }));
  const placed = new Set<number>();
  const of = (category: string) => items.map((item, index) => ({ item, index })).filter((entry) => entry.item.category === category);
  const put = (index: number, x: number, y: number, z = 0) => {
    out[index] = { x, y, z };
    placed.add(index);
  };
  const size = (index: number) => items[index].bounds.size;

  // The main body (the largest one marked so), or a stand-in of about its size so the rest still has a frame.
  const bodies = of('body').sort((a, b) => size(b.index)[0] - size(a.index)[0]);
  const bodyIndex = bodies[0]?.index;
  const body = bodyIndex === undefined ? [250, 60, 40] : size(bodyIndex);
  const floor = BOARD_HEIGHT_MM; // the body's lowest point, and the receivers' highest
  const front = -body[0] / 2;
  const rear = body[0] / 2;
  const top = floor + body[1];
  if (bodyIndex !== undefined) put(bodyIndex, 0, floor + body[1] / 2);

  const gripIndex = of('triggerbody')[0]?.index;
  const grip = gripIndex === undefined ? null : size(gripIndex);
  if (gripIndex !== undefined && grip) put(gripIndex, rear - grip[0] / 2, floor - grip[1] / 2);
  const gripFront = grip ? rear - grip[0] : 0;

  // The mag receiver: the magazine part named an adapter / receiver, else the first; further magazines hang under it.
  const mags = of('magazine');
  const receiver = mags.find((entry) => /adapter|receiver|magwell|mag well/i.test(entry.item.name ?? '')) ?? mags[0];
  let magBottom = floor;
  let magX = gripFront - 60;
  if (receiver) {
    const m = size(receiver.index);
    magX = gripFront - m[0] / 2;
    put(receiver.index, magX, floor - m[1] / 2);
    magBottom = floor - m[1];
  }
  for (const entry of mags) {
    if (entry === receiver) continue;
    const m = size(entry.index);
    // Only as long as it stays above the table; a magazine that would reach through it goes to the tray.
    if (magBottom - m[1] < 0) continue;
    put(entry.index, magX, magBottom - m[1] / 2);
    magBottom -= m[1];
  }

  const handle = of('grip')[0];
  if (handle) {
    // Into the grip receiver's pocket at the rear, hanging below it.
    const h = size(handle.index);
    const handleTop = grip ? floor - grip[1] * 0.55 : floor - 30;
    put(handle.index, grip ? rear - grip[0] * 0.3 : rear - h[0] / 2, handleTop - h[1] / 2);
  }

  // The steel tube that runs through the body (⌀28 on the Iron wolf, 17.10.2026): the longest tube
  // at least most of the body's length, on the body's axis. The internals ride inside it, in the tray.
  const tubes = of('stalror').sort((a, b) => size(b.index)[0] - size(a.index)[0]);
  const through = tubes[0] && size(tubes[0].index)[0] >= body[0] * 0.8 ? tubes[0] : undefined;
  if (through) put(through.index, 0, floor + body[1] / 2);

  // Out in front: the handguard against the body (1), then shorter barrels / tubes beyond it (2).
  let reach = front;
  const guard = of('handguard')[0];
  if (guard) {
    const g = size(guard.index);
    put(guard.index, reach - g[0] / 2, floor + body[1] * 0.5);
    reach -= g[0];
  }
  for (const entry of of('stalror')) {
    if (entry.index === through?.index) continue;
    const t = size(entry.index);
    put(entry.index, reach - t[0] / 2, floor + body[1] * 0.5);
    reach -= t[0];
  }

  // Sights and accessories on top (3), a little behind the middle, side by side if there are several.
  let along = body[0] * 0.1;
  for (const entry of of('accessories')) {
    const a = size(entry.index);
    put(entry.index, along, top + a[1] / 2);
    along -= a[0] + BOARD_GAP_MM;
  }

  // Stock pieces behind, the smallest against the body (4), the rest further back (5).
  let back = rear;
  for (const entry of of('stocksystem').sort((a, b) => size(a.index)[0] - size(b.index)[0])) {
    const k = size(entry.index);
    put(entry.index, back + k[0] / 2, floor + body[1] * 0.5);
    back += k[0];
  }

  // The rest on the table, in front of the assembled parts.
  const loose = items.map((_, index) => index).filter((index) => !placed.has(index));
  if (loose.length > 0) {
    let deepest = body[2] / 2;
    for (const index of placed) deepest = Math.max(deepest, out[index].z + size(index)[2] / 2);
    const centres = layoutAroundCentre(loose.map((index) => ({ width: size(index)[0], depth: size(index)[2] })));
    const nearest = Math.min(...loose.map((index, k) => centres[k].z - size(index)[2] / 2));
    const shift = deepest + TRAY_GAP_MM - nearest;
    loose.forEach((index, k) => {
      out[index] = { x: centres[k].x, y: size(index)[1] / 2, z: centres[k].z + shift };
    });
  }
  return out;
}

/** A part of a collection as its picture lays it out: its box, its slot, and where the user put it, if anywhere. */
type Placed = { bounds: Box; category?: string; name?: string; place?: { x: number; y: number } };

/**
 * Where each part of a collection stands in its picture: where the user put it
 * when arranging (centred in depth), else its AR-15 slot or the tray.
 */
export function collectionLayout(items: readonly Placed[]): { x: number; y: number; z: number }[] {
  const auto = assemblyLayout(items);
  return items.map((item, index) => (item.place ? { x: item.place.x, y: item.place.y, z: 0 } : auto[index]));
}

/** How tall a column of loose parts grows in the side view before the next one starts, mm. */
const SIDE_COLUMN_MM = BOARD_HEIGHT_MM + 100;

/**
 * The side view to arrange a collection in, every part centred in depth: a
 * part put somewhere keeps its place, one in an AR-15 slot starts there, and
 * the loose ones — the tray, in 3D, which would all land on one spot seen from
 * the side — stand on the table to the right of the rest, in columns.
 */
export function sideLayout(items: readonly Placed[]): { x: number; y: number }[] {
  const auto = assemblyLayout(items);
  const out = items.map((item, index) => (item.place ? { ...item.place } : { x: auto[index].x, y: auto[index].y }));
  const loose = items.map((_, index) => index).filter((index) => !items[index].place && auto[index].z > 1);
  if (loose.length === 0) return out;
  let right = -Infinity;
  items.forEach((item, index) => {
    if (!loose.includes(index)) right = Math.max(right, out[index].x + item.bounds.size[0] / 2);
  });
  let x = (Number.isFinite(right) ? right : 0) + TRAY_GAP_MM;
  let y = 0;
  let column = 0;
  for (const index of loose) {
    const [w, h] = items[index].bounds.size;
    if (y > 0 && y + h > SIDE_COLUMN_MM) {
      x += column + BOARD_GAP_MM;
      y = 0;
      column = 0;
    }
    out[index] = { x: x + w / 2, y: y + h / 2 };
    y += h + BOARD_GAP_MM;
    column = Math.max(column, w);
  }
  return out;
}

/** The AR-15 slots a set of categories fills, and the ones still missing. */
export function slotCheck(categories: readonly (string | undefined)[]): { category: string; label: string; count: number }[] {
  return AR_SLOTS.map((slot) => ({ ...slot, count: categories.filter((category) => category === slot.category).length }));
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
  // Parts sorted into AR-15 categories go to their slots; otherwise a block around the middle at BOARD_HEIGHT_MM.
  const assembled = items.some((item) => AR_SLOTS.some((slot) => slot.category === item.category));
  const places = assembled
    ? assemblyLayout(items.map((item, index) => ({ bounds: allBounds[index], category: item.category, name: item.name })))
    : layoutAroundCentre(allBounds.map((bounds) => ({ width: bounds.size[0], depth: bounds.size[2] }))).map((centre) => ({
        x: centre.x,
        y: BOARD_HEIGHT_MM,
        z: centre.z,
      }));
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
        x: places[index].x - bounds.center[0],
        y: places[index].y - bounds.center[1],
        z: places[index].z - bounds.center[2],
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
