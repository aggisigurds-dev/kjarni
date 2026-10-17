/**
 * The Partasafn — the parts library, which began as the favourites shelf:
 * parts kept on Supabase outside any build, each under a name of its own, so
 * a part saved from one build can be dropped into another, on any computer.
 * Starred ones show under Uppáhalds as well; everything saved before there
 * was a library was a favourite, and stays one.
 *
 * The shelf is one row of the projects table, `prj_favorites`, holding a
 * project document whose parts are the favourites — no table of its own, the
 * same geometry bucket, the same manifest of fingerprints. Unlike a build it
 * keeps each part's thumbnail in the document, because a favourite is looked
 * at far more often than it is loaded. A favourite taken off the shelf is only
 * hidden, so a slip loses nothing.
 *
 * The same document holds the user's collections (söfn) — every saved part is
 * in one — and the category of every part in every build. Those are kept here,
 * in the library's own row, rather than in the builds: the bench writes a
 * build whole on every save, and would wipe a category set from the library
 * in the meantime. A shelf saved before there were collections is read as one
 * collection, „Safnið mitt", holding everything, and stored that way on the
 * next write.
 */

import { readMark, type CategoryMark } from './categories';
import { buildManifest, type CloudManifest } from './github-sync';
import { createProject, identityTransform, type Part, type Project } from './project';
import {
  FAVORITES_ID,
  getWork3dSupabase,
  loadCloudGeometry,
  WORK3D_BUCKET,
  WORK3D_TABLE,
} from './supabase-sync';

export const FAVORITES_NAME = '★ Favorites';

/** The collection everything saved before there were collections is in. */
export const DEFAULT_COLLECTION_ID = 'col_safnid';
export const DEFAULT_COLLECTION_NAME = 'Safnið mitt';

/** A collection of saved parts, under a name of the user's. */
export interface LibraryCollection {
  id: string;
  name: string;
  createdAt: number;
  /** Its own sub-categories, named by the user (e.g. Innvols, Bodyparts, Íhlutir). */
  sections?: LibrarySection[];
}

/** Where a real part stands: printed, made (machined, cut, turned) or bought. */
export type PartStatus = 'printed' | 'made' | 'bought';

export const PART_STATUSES: { id: PartStatus; label: string }[] = [
  { id: 'printed', label: 'Prentað' },
  { id: 'made', label: 'Smíðað' },
  { id: 'bought', label: 'Keypt' },
];

export function isPartStatus(value: unknown): value is PartStatus {
  return value === 'printed' || value === 'made' || value === 'bought';
}

/**
 * A sub-category inside a collection: parts sorted under it, or a board — a
 * planning wall of pasted pictures (fittings to buy, references) and notes.
 */
export interface LibrarySection {
  id: string;
  name: string;
  kind: 'parts' | 'board';
  createdAt: number;
}

/** Something pinned on a board: a picture (its bytes in the bucket) or a note, where it was put. */
export interface BoardPin {
  id: string;
  kind: 'image' | 'note';
  /** Picture: the bucket file (`ver_…`, stored as octet-stream like the meshes), its type and size. */
  image?: string;
  mime?: string;
  naturalWidth?: number;
  naturalHeight?: number;
  /** A picture's caption, or a note's text. */
  text: string;
  /** Top-left corner and width on the board, in board pixels. */
  x: number;
  y: number;
  width: number;
  color?: string;
  /** For a fitting or part pictured: printed, made or bought. */
  status?: PartStatus;
  /** Taken off the board: kept, like a part taken off the shelf. */
  hidden?: boolean;
  createdAt: number;
}

/** The category of a part in a build, kept in the library; name and size find it again in another build. */
export interface BuildCategoryRecord extends CategoryMark {
  name: string;
  triangles: number;
}

/** The library's document: a project whose parts are the saved parts, plus the collections and build categories. */
export interface Shelf extends Project {
  collections?: LibraryCollection[];
  /** Board pins by board section id. */
  boards?: Record<string, BoardPin[]>;
  /** By `projectId/partId`. */
  buildCategories?: Record<string, BuildCategoryRecord>;
}

/** A shelf card: what the gallery shows, and enough to put the part on a bench. */
export interface Favorite {
  id: string;
  name: string;
  color: string;
  triangles: number;
  thumbnail?: string;
  versionId: string;
  materialId: string;
  finishId?: string;
  /** Shown under Uppáhalds. */
  starred: boolean;
  collectionId: string;
  /** Its sub-category in the collection, if sorted under one. */
  sectionId?: string;
  status?: PartStatus;
  category?: CategoryMark;
  addedAt: number;
}

/** Everything the Partasafn window shows from the library's document. */
export interface LibrarySnapshot {
  favorites: Favorite[];
  collections: LibraryCollection[];
  /** Visible pins by board section id. */
  boards: Record<string, BoardPin[]>;
  buildCategories: Record<string, BuildCategoryRecord>;
}

/** What a part brings to the shelf, besides its mesh. */
export interface FavoriteCard {
  name: string;
  color: string;
  materialId: string;
  finishId?: string;
  thumbnail?: string;
  starred?: boolean;
  /** The collection to save into; the default one when neither this nor a new name is given. */
  collectionId?: string;
  /** Make a new collection under this name and save into it. */
  newCollectionName?: string;
  /** Sort it under this sub-category of the collection. */
  sectionId?: string;
  category?: CategoryMark;
}

/** The table keeps a document under 1 MB; the shelf refuses a card past this. */
const SHELF_LIMIT = 1_000_000;

/** Ids of the shape the bucket policy allows: `ver_<base36>`. */
const shelfId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export function emptyShelf(): Shelf {
  return { ...createProject(FAVORITES_NAME, FAVORITES_ID), assembly: false };
}

function defaultCollection(): LibraryCollection {
  return { id: DEFAULT_COLLECTION_ID, name: DEFAULT_COLLECTION_NAME, createdAt: 0 };
}

/** A category as a part carries it in the document. */
function categoryFields(mark: CategoryMark | undefined): Pick<Part, 'category' | 'categoryAuto'> {
  if (!mark) return { category: undefined, categoryAuto: undefined };
  return { category: mark.category, categoryAuto: mark.auto ? true : undefined };
}

/**
 * The shelf as the window works with it: at least one collection, every part
 * in a collection that exists, and build categories that are well formed.
 * A shelf from before collections gets „Safnið mitt" with everything in it.
 */
export function normalizeShelf(shelf: Shelf): Shelf {
  const collections: LibraryCollection[] = [];
  for (const entry of Array.isArray(shelf.collections) ? shelf.collections : []) {
    if (!entry || typeof entry.id !== 'string' || typeof entry.name !== 'string') continue;
    if (collections.some((kept) => kept.id === entry.id)) continue;
    const sections: LibrarySection[] = [];
    for (const section of Array.isArray(entry.sections) ? entry.sections : []) {
      if (!section || typeof section.id !== 'string' || typeof section.name !== 'string') continue;
      if (sections.some((kept) => kept.id === section.id)) continue;
      sections.push({
        id: section.id,
        name: section.name,
        kind: section.kind === 'board' ? 'board' : 'parts',
        createdAt: Number(section.createdAt) || 0,
      });
    }
    collections.push({ id: entry.id, name: entry.name, createdAt: Number(entry.createdAt) || 0, ...(sections.length ? { sections } : {}) });
  }
  if (collections.length === 0) collections.push(defaultCollection());
  const ids = new Set(collections.map((entry) => entry.id));
  const fallback = ids.has(DEFAULT_COLLECTION_ID) ? DEFAULT_COLLECTION_ID : collections[0].id;

  const buildCategories: Record<string, BuildCategoryRecord> = {};
  for (const [key, record] of Object.entries(shelf.buildCategories ?? {})) {
    const mark = readMark(record?.category, record?.auto);
    if (!mark) continue;
    buildCategories[key] = { ...mark, name: String(record.name ?? ''), triangles: Number(record.triangles) || 0 };
  }

  const boards: Record<string, BoardPin[]> = {};
  for (const [key, pins] of Object.entries(shelf.boards ?? {})) {
    if (!Array.isArray(pins)) continue;
    boards[key] = pins.filter(
      (pin) => pin && typeof pin.id === 'string' && (pin.kind === 'image' || pin.kind === 'note') && Number.isFinite(pin.x)
    );
  }
  // A part's sub-category belongs to its collection; one that is not there any more is dropped.
  const sectionsOf = new Map(collections.map((entry) => [entry.id, new Set((entry.sections ?? []).map((s) => s.id))]));

  return {
    ...shelf,
    collections,
    buildCategories,
    boards,
    parts: shelf.parts.map((part) => {
      const collectionId = part.collectionId && ids.has(part.collectionId) ? part.collectionId : fallback;
      const sectionId = part.sectionId && sectionsOf.get(collectionId)?.has(part.sectionId) ? part.sectionId : undefined;
      return { ...part, collectionId, sectionId };
    }),
  };
}

/** The shelf's part for a card and its mesh, in the part's own coordinates. */
export function shelfPart(card: FavoriteCard, soup: Float32Array, now = Date.now()): Part {
  const triangles = Math.floor(soup.length / 9);
  const versionId = shelfId('ver');
  return {
    id: shelfId('part'),
    name: card.name,
    fileName: '',
    slotId: '',
    color: card.color,
    finishId: card.finishId,
    visible: true,
    transform: identityTransform(),
    triangles,
    materialId: card.materialId,
    notes: '',
    versions: [
      { id: versionId, label: 'v1 favorite', note: 'Saved to favorites', triangles, createdAt: now },
    ],
    activeVersionId: versionId,
    thumbnail: card.thumbnail,
    starred: card.starred ?? false,
    collectionId: card.collectionId,
    sectionId: card.sectionId,
    ...categoryFields(card.category),
    addedAt: now,
  };
}

/** The cards on the shelf, newest first; one taken off the shelf is skipped. */
export function favoritesOf(shelf: Shelf): Favorite[] {
  return shelf.parts
    .filter((part) => part.visible)
    .map((part) => ({
      id: part.id,
      name: part.name,
      color: part.color,
      triangles: part.triangles,
      thumbnail: part.thumbnail,
      versionId: part.activeVersionId,
      materialId: part.materialId,
      finishId: part.finishId,
      // Saved before the library had stars: those were all favourites.
      starred: part.starred ?? true,
      collectionId: part.collectionId ?? DEFAULT_COLLECTION_ID,
      sectionId: part.sectionId,
      status: isPartStatus(part.status) ? part.status : undefined,
      category: readMark(part.category, part.categoryAuto),
      addedAt: part.addedAt,
    }))
    .sort((a, b) => b.addedAt - a.addedAt);
}

export function librarySnapshot(shelf: Shelf): LibrarySnapshot {
  const normal = normalizeShelf(shelf);
  return {
    favorites: favoritesOf(normal),
    collections: normal.collections ?? [],
    buildCategories: normal.buildCategories ?? {},
    boards: Object.fromEntries(
      Object.entries(normal.boards ?? {}).map(([key, pins]) => [key, pins.filter((pin) => !pin.hidden)])
    ),
  };
}

// ── Changes to the shelf, pure, so they can be tested without Supabase ─────

/** A new collection on the shelf. */
export function withNewCollection(
  shelf: Shelf,
  name: string,
  id = shelfId('col'),
  now = Date.now()
): { shelf: Shelf; collection: LibraryCollection } {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Safn þarf nafn.');
  const normal = normalizeShelf(shelf);
  const collection = { id, name: trimmed, createdAt: now };
  return { shelf: { ...normal, collections: [...(normal.collections ?? []), collection] }, collection };
}

export function withCollectionRenamed(shelf: Shelf, id: string, name: string): Shelf {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Safn þarf nafn.');
  const normal = normalizeShelf(shelf);
  return {
    ...normal,
    collections: (normal.collections ?? []).map((entry) => (entry.id === id ? { ...entry, name: trimmed } : entry)),
  };
}

/**
 * Remove a collection. Its parts go to `moveTo`, or — when null — are taken
 * off the shelf the way a single part is: hidden, not erased. Either way the
 * parts in the builds they came from are untouched. The last collection stays.
 */
export function withCollectionDeleted(shelf: Shelf, id: string, moveTo: string | null): Shelf {
  const normal = normalizeShelf(shelf);
  const collections = normal.collections ?? [];
  if (!collections.some((entry) => entry.id === id)) return normal;
  if (collections.length <= 1) throw new Error('Síðasta safninu er ekki hægt að eyða.');
  if (moveTo !== null && (moveTo === id || !collections.some((entry) => entry.id === moveTo))) {
    throw new Error('Safnið sem partarnir áttu að fara í er ekki til.');
  }
  return {
    ...normal,
    collections: collections.filter((entry) => entry.id !== id),
    parts: normal.parts.map((part) => {
      if (part.collectionId !== id) return part;
      return moveTo === null ? { ...part, visible: false } : { ...part, collectionId: moveTo, sectionId: undefined };
    }),
  };
}

export function withFavoriteMoved(shelf: Shelf, partId: string, collectionId: string): Shelf {
  const normal = normalizeShelf(shelf);
  if (!(normal.collections ?? []).some((entry) => entry.id === collectionId)) {
    throw new Error('Það safn er ekki til.');
  }
  return {
    ...normal,
    // Sub-categories are the collection's own, so a move leaves the old one behind.
    parts: normal.parts.map((part) =>
      part.id === partId
        ? { ...part, collectionId, sectionId: part.collectionId === collectionId ? part.sectionId : undefined }
        : part
    ),
  };
}

// ── Sub-categories (layers) and boards ──────────────────────────────────────

function mapCollection(shelf: Shelf, collectionId: string, change: (entry: LibraryCollection) => LibraryCollection): Shelf {
  const normal = normalizeShelf(shelf);
  if (!(normal.collections ?? []).some((entry) => entry.id === collectionId)) throw new Error('Það safn er ekki til.');
  return {
    ...normal,
    collections: (normal.collections ?? []).map((entry) => (entry.id === collectionId ? change(entry) : entry)),
  };
}

/** A new sub-category in a collection: for parts, or a board for pictures and notes. */
export function withSectionAdded(
  shelf: Shelf,
  collectionId: string,
  name: string,
  kind: LibrarySection['kind'],
  id = shelfId('sec'),
  now = Date.now()
): { shelf: Shelf; section: LibrarySection } {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Undirflokkur þarf nafn.');
  const section: LibrarySection = { id, name: trimmed, kind, createdAt: now };
  return {
    shelf: mapCollection(shelf, collectionId, (entry) => ({ ...entry, sections: [...(entry.sections ?? []), section] })),
    section,
  };
}

export function withSectionRenamed(shelf: Shelf, collectionId: string, sectionId: string, name: string): Shelf {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Undirflokkur þarf nafn.');
  return mapCollection(shelf, collectionId, (entry) => ({
    ...entry,
    sections: (entry.sections ?? []).map((section) => (section.id === sectionId ? { ...section, name: trimmed } : section)),
  }));
}

/** Remove a sub-category. Its parts stay in the collection, unsorted; a board's pins are kept in the document. */
export function withSectionDeleted(shelf: Shelf, collectionId: string, sectionId: string): Shelf {
  const next = mapCollection(shelf, collectionId, (entry) => ({
    ...entry,
    sections: (entry.sections ?? []).filter((section) => section.id !== sectionId),
  }));
  return { ...next, parts: next.parts.map((part) => (part.sectionId === sectionId ? { ...part, sectionId: undefined } : part)) };
}

/** Sort a saved part under a parts sub-category of its own collection, or take it out of one (null). */
export function withFavoriteSection(shelf: Shelf, partId: string, sectionId: string | null): Shelf {
  const normal = normalizeShelf(shelf);
  const part = normal.parts.find((entry) => entry.id === partId);
  if (!part) return normal;
  if (sectionId !== null) {
    const collection = (normal.collections ?? []).find((entry) => entry.id === part.collectionId);
    const section = collection?.sections?.find((entry) => entry.id === sectionId);
    if (!section || section.kind !== 'parts') throw new Error('Sá undirflokkur er ekki í safni partsins.');
  }
  return {
    ...normal,
    parts: normal.parts.map((entry) => (entry.id === partId ? { ...entry, sectionId: sectionId ?? undefined } : entry)),
  };
}

export function withPinAdded(shelf: Shelf, sectionId: string, pin: BoardPin): Shelf {
  const normal = normalizeShelf(shelf);
  const boards = normal.boards ?? {};
  return { ...normal, boards: { ...boards, [sectionId]: [...(boards[sectionId] ?? []), pin] } };
}

export function withPinChanged(shelf: Shelf, sectionId: string, pinId: string, change: Partial<BoardPin>): Shelf {
  const normal = normalizeShelf(shelf);
  const boards = normal.boards ?? {};
  return {
    ...normal,
    boards: {
      ...boards,
      [sectionId]: (boards[sectionId] ?? []).map((pin) =>
        pin.id === pinId ? { ...pin, ...change, id: pin.id, kind: pin.kind } : pin
      ),
    },
  };
}

/** One category to set: on a saved part, or on a part in a build. No mark clears it. */
export type CategoryUpdate =
  | { kind: 'library'; id: string; mark?: CategoryMark }
  | { kind: 'build'; key: string; name: string; triangles: number; mark?: CategoryMark };

/** The updates split: marks for saved parts by id, and the build categories with the rest applied. */
function splitUpdates(
  records: Record<string, BuildCategoryRecord>,
  updates: CategoryUpdate[]
): { library: Map<string, CategoryMark | undefined>; buildCategories: Record<string, BuildCategoryRecord> } {
  const library = new Map<string, CategoryMark | undefined>();
  const buildCategories = { ...records };
  for (const update of updates) {
    if (update.kind === 'library') {
      library.set(update.id, update.mark);
    } else if (update.mark) {
      buildCategories[update.key] = {
        category: update.mark.category,
        ...(update.mark.auto ? { auto: true } : {}),
        name: update.name,
        triangles: update.triangles,
      };
    } else {
      delete buildCategories[update.key];
    }
  }
  return { library, buildCategories };
}

export function withCategories(shelf: Shelf, updates: CategoryUpdate[]): Shelf {
  const normal = normalizeShelf(shelf);
  const { library, buildCategories } = splitUpdates(normal.buildCategories ?? {}, updates);
  return {
    ...normal,
    buildCategories,
    parts: normal.parts.map((part) => (library.has(part.id) ? { ...part, ...categoryFields(library.get(part.id)) } : part)),
  };
}

/** The same change on what the window holds, so it shows at once while the write goes out. */
export function snapshotWithCategories(snapshot: LibrarySnapshot, updates: CategoryUpdate[]): LibrarySnapshot {
  const { library, buildCategories } = splitUpdates(snapshot.buildCategories, updates);
  return {
    ...snapshot,
    buildCategories,
    favorites: snapshot.favorites.map((favorite) =>
      library.has(favorite.id) ? { ...favorite, category: library.get(favorite.id) } : favorite
    ),
  };
}

/**
 * Finds the category of a part in a build: by its own key first, then — for
 * the same part in another build, or a build saved again — by name and size.
 */
export function buildCategoryLookup(
  records: Record<string, BuildCategoryRecord>
): (part: { key: string; name: string; triangles: number }) => CategoryMark | undefined {
  const byIdentity = new Map<string, BuildCategoryRecord>();
  for (const record of Object.values(records)) {
    const identity = `${record.name}\u0000${record.triangles}`;
    if (!byIdentity.has(identity)) byIdentity.set(identity, record);
  }
  return (part) => {
    const record = records[part.key] ?? byIdentity.get(`${part.name}\u0000${part.triangles}`);
    return record ? readMark(record.category, record.auto) : undefined;
  };
}

// ── Supabase ────────────────────────────────────────────────────────────────

function client() {
  const sb = getWork3dSupabase();
  if (!sb) throw new Error('Favorites are only available in the browser.');
  return sb;
}

async function fetchShelf(): Promise<{ shelf: Shelf; manifest: CloudManifest }> {
  const { data, error } = await client()
    .from(WORK3D_TABLE)
    .select('project, manifest')
    .eq('id', FAVORITES_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const shelf: Shelf = data
    ? { ...emptyShelf(), ...(data.project as Shelf), id: FAVORITES_ID, name: FAVORITES_NAME }
    : emptyShelf();
  return { shelf: normalizeShelf(shelf), manifest: (data?.manifest as CloudManifest | null) ?? {} };
}

async function storeShelf(shelf: Shelf, manifest: CloudManifest): Promise<void> {
  const document = { ...shelf, updatedAt: Date.now() };
  if (JSON.stringify(document).length > SHELF_LIMIT) {
    throw new Error('The favorites shelf is full — take a few favorites off it first.');
  }
  const { error } = await client()
    .from(WORK3D_TABLE)
    .upsert({
      id: FAVORITES_ID,
      name: FAVORITES_NAME,
      project: document,
      manifest,
      part_count: shelf.parts.filter((part) => part.visible).length,
      deleted: false,
      updated_at: new Date(document.updatedAt).toISOString(),
    });
  if (error) throw new Error(error.message);
}

/** Read the shelf as it is now, change it, store it back — one change per round, so two devices do not undo each other. */
async function changeShelf(change: (shelf: Shelf) => Shelf): Promise<Shelf> {
  const { shelf, manifest } = await fetchShelf();
  const next = change(shelf);
  await storeShelf(next, manifest);
  return next;
}

export async function loadLibrary(): Promise<LibrarySnapshot> {
  const { shelf } = await fetchShelf();
  return librarySnapshot(shelf);
}

export async function listFavorites(): Promise<Favorite[]> {
  return (await loadLibrary()).favorites;
}

/** Put a part on the shelf: its mesh into the bucket, its card into the document. */
export async function addFavorite(card: FavoriteCard, soup: Float32Array): Promise<Favorite> {
  const { shelf: fetched, manifest } = await fetchShelf();
  let shelf = fetched;
  let collectionId = card.collectionId;
  if (card.newCollectionName?.trim()) {
    const made = withNewCollection(shelf, card.newCollectionName);
    shelf = made.shelf;
    collectionId = made.collection.id;
  }
  if (!collectionId || !(shelf.collections ?? []).some((entry) => entry.id === collectionId)) {
    collectionId = (shelf.collections ?? []).some((entry) => entry.id === DEFAULT_COLLECTION_ID)
      ? DEFAULT_COLLECTION_ID
      : shelf.collections?.[0]?.id;
  }
  const part = shelfPart({ ...card, collectionId }, soup);
  const { error } = await client()
    .storage.from(WORK3D_BUCKET)
    .upload(`${FAVORITES_ID}/${part.activeVersionId}.bin`, soup.slice().buffer, {
      contentType: 'application/octet-stream',
      upsert: true,
    });
  if (error) throw new Error(error.message);
  await storeShelf(
    { ...shelf, parts: [...shelf.parts, part] },
    { ...manifest, ...buildManifest([[part.activeVersionId, soup]]) }
  );
  return favoritesOf({ ...shelf, parts: [part] })[0];
}

/**
 * A saved part changed on the bench: its new mesh becomes a new version (the
 * old one stays in the bucket and in the part's version list), with a fresh picture.
 */
export async function updateFavoriteMesh(id: string, soup: Float32Array, thumbnail?: string): Promise<void> {
  const { shelf, manifest } = await fetchShelf();
  const part = shelf.parts.find((entry) => entry.id === id);
  if (!part) throw new Error('Sá partur er ekki lengur í Partasafninu.');
  const versionId = shelfId('ver');
  const triangles = Math.floor(soup.length / 9);
  const { error } = await client()
    .storage.from(WORK3D_BUCKET)
    .upload(`${FAVORITES_ID}/${versionId}.bin`, soup.slice().buffer, { contentType: 'application/octet-stream', upsert: true });
  if (error) throw new Error(error.message);
  const version = { id: versionId, label: `v${part.versions.length + 1} breytt`, note: 'Breytt á bekknum', triangles, createdAt: Date.now() };
  await storeShelf(
    {
      ...shelf,
      parts: shelf.parts.map((entry) =>
        entry.id === id
          ? { ...entry, versions: [...entry.versions, version], activeVersionId: versionId, triangles, thumbnail: thumbnail ?? entry.thumbnail }
          : entry
      ),
    },
    { ...manifest, ...buildManifest([[versionId, soup]]) }
  );
}

/** Change one part on the shelf and store it back. */
async function changeOnShelf(id: string, change: (part: Part) => Part): Promise<void> {
  await changeShelf((shelf) => ({ ...shelf, parts: shelf.parts.map((part) => (part.id === id ? change(part) : part)) }));
}

/** Take a favourite off the shelf. It is hidden, not erased, so a slip loses nothing. */
export function removeFavorite(id: string): Promise<void> {
  return changeOnShelf(id, (part) => ({ ...part, visible: false }));
}

/** Give a part in the library a name of its own. */
export function renameFavorite(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return Promise.reject(new Error('A part needs a name.'));
  return changeOnShelf(id, (part) => ({ ...part, name: trimmed }));
}

/** Mark a saved part printed, made or bought — or clear it (null). */
export function setFavoriteStatus(id: string, status: PartStatus | null): Promise<void> {
  return changeOnShelf(id, (part) => ({ ...part, status: status ?? undefined }));
}

/** Put a part in the library under Uppáhalds, or take it out of there. */
export function starFavorite(id: string, starred: boolean): Promise<void> {
  return changeOnShelf(id, (part) => ({ ...part, starred }));
}

export async function createCollection(name: string): Promise<LibraryCollection> {
  let made: LibraryCollection | undefined;
  await changeShelf((shelf) => {
    const result = withNewCollection(shelf, name);
    made = result.collection;
    return result.shelf;
  });
  return made!;
}

export async function renameCollection(id: string, name: string): Promise<void> {
  await changeShelf((shelf) => withCollectionRenamed(shelf, id, name));
}

/** Remove a collection; its parts move to `moveTo`, or are taken off the shelf when it is null. */
export async function deleteCollection(id: string, moveTo: string | null): Promise<void> {
  await changeShelf((shelf) => withCollectionDeleted(shelf, id, moveTo));
}

export async function moveFavorite(id: string, collectionId: string): Promise<void> {
  await changeShelf((shelf) => withFavoriteMoved(shelf, id, collectionId));
}

/** Set categories — one part or a whole run of the auto-sorter — in one write. */
export async function setCategories(updates: CategoryUpdate[]): Promise<void> {
  if (updates.length === 0) return;
  await changeShelf((shelf) => withCategories(shelf, updates));
}

export async function createSection(
  collectionId: string,
  name: string,
  kind: LibrarySection['kind']
): Promise<LibrarySection> {
  let made: LibrarySection | undefined;
  await changeShelf((shelf) => {
    const result = withSectionAdded(shelf, collectionId, name, kind);
    made = result.section;
    return result.shelf;
  });
  return made!;
}

export async function renameSection(collectionId: string, sectionId: string, name: string): Promise<void> {
  await changeShelf((shelf) => withSectionRenamed(shelf, collectionId, sectionId, name));
}

export async function deleteSection(collectionId: string, sectionId: string): Promise<void> {
  await changeShelf((shelf) => withSectionDeleted(shelf, collectionId, sectionId));
}

export async function moveFavoriteToSection(id: string, sectionId: string | null): Promise<void> {
  await changeShelf((shelf) => withFavoriteSection(shelf, id, sectionId));
}

/** Pin a picture on a board: its bytes into the bucket (as octet-stream, like the meshes), the pin into the document. */
export async function addBoardPicture(
  sectionId: string,
  picture: Blob,
  size: { width: number; height: number },
  place: { x: number; y: number; width: number },
  text = ''
): Promise<BoardPin> {
  const image = shelfId('ver');
  const { error } = await client()
    .storage.from(WORK3D_BUCKET)
    .upload(`${FAVORITES_ID}/${image}.bin`, await picture.arrayBuffer(), {
      contentType: 'application/octet-stream',
      upsert: true,
    });
  if (error) throw new Error(error.message);
  const pin: BoardPin = {
    id: shelfId('pin'),
    kind: 'image',
    image,
    mime: picture.type || 'image/webp',
    naturalWidth: size.width,
    naturalHeight: size.height,
    text,
    ...place,
    createdAt: Date.now(),
  };
  await changeShelf((shelf) => withPinAdded(shelf, sectionId, pin));
  return pin;
}

export async function addBoardNote(
  sectionId: string,
  text: string,
  place: { x: number; y: number; width: number },
  color = '#fde68a'
): Promise<BoardPin> {
  const pin: BoardPin = { id: shelfId('pin'), kind: 'note', text, color, ...place, createdAt: Date.now() };
  await changeShelf((shelf) => withPinAdded(shelf, sectionId, pin));
  return pin;
}

export async function changeBoardPin(sectionId: string, pinId: string, change: Partial<BoardPin>): Promise<void> {
  await changeShelf((shelf) => withPinChanged(shelf, sectionId, pinId, change));
}

/** Take a pin off the board: hidden, not erased. */
export function removeBoardPin(sectionId: string, pinId: string): Promise<void> {
  return changeBoardPin(sectionId, pinId, { hidden: true });
}

/** A board picture from the bucket, as a Blob of its own type. */
export async function loadBoardPicture(pin: BoardPin): Promise<Blob | null> {
  if (!pin.image) return null;
  const { data, error } = await client().storage.from(WORK3D_BUCKET).download(`${FAVORITES_ID}/${pin.image}.bin`);
  if (error || !data) return null;
  return new Blob([await data.arrayBuffer()], { type: pin.mime || 'image/webp' });
}

/** The mesh of a favourite, from the bucket; null when the bucket has no such file. */
export function loadFavoriteGeometry(versionId: string): Promise<Float32Array | null> {
  return loadCloudGeometry(FAVORITES_ID, versionId);
}
