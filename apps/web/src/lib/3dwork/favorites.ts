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
}

/** The category of a part in a build, kept in the library; name and size find it again in another build. */
export interface BuildCategoryRecord extends CategoryMark {
  name: string;
  triangles: number;
}

/** The library's document: a project whose parts are the saved parts, plus the collections and build categories. */
export interface Shelf extends Project {
  collections?: LibraryCollection[];
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
  category?: CategoryMark;
  addedAt: number;
}

/** Everything the Partasafn window shows from the library's document. */
export interface LibrarySnapshot {
  favorites: Favorite[];
  collections: LibraryCollection[];
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
    collections.push({ id: entry.id, name: entry.name, createdAt: Number(entry.createdAt) || 0 });
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

  return {
    ...shelf,
    collections,
    buildCategories,
    parts: shelf.parts.map((part) =>
      part.collectionId && ids.has(part.collectionId) ? part : { ...part, collectionId: fallback }
    ),
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
      return moveTo === null ? { ...part, visible: false } : { ...part, collectionId: moveTo };
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
    parts: normal.parts.map((part) => (part.id === partId ? { ...part, collectionId } : part)),
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

/** The mesh of a favourite, from the bucket; null when the bucket has no such file. */
export function loadFavoriteGeometry(versionId: string): Promise<Float32Array | null> {
  return loadCloudGeometry(FAVORITES_ID, versionId);
}
