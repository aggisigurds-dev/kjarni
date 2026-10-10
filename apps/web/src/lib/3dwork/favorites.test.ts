import { describe, expect, it } from 'vitest';
import {
  buildCategoryLookup,
  DEFAULT_COLLECTION_ID,
  DEFAULT_COLLECTION_NAME,
  emptyShelf,
  favoritesOf,
  FAVORITES_NAME,
  librarySnapshot,
  normalizeShelf,
  shelfPart,
  snapshotWithCategories,
  withCategories,
  withCollectionDeleted,
  withCollectionRenamed,
  withFavoriteMoved,
  withNewCollection,
} from './favorites';
import { FAVORITES_ID } from './supabase-sync';

const card = { name: 'Grip', color: '#f97316', materialId: 'pla', thumbnail: 'data:image/png;base64,x' };
const soup = new Float32Array(9 * 12);

describe('shelfPart', () => {
  it('makes a part the bucket policy and the bench both accept', () => {
    const part = shelfPart(card, soup, 1000);

    expect(part.id).toMatch(/^part_[0-9a-z_]+$/);
    expect(part.activeVersionId).toMatch(/^ver_[0-9a-z_]+$/);
    expect(part.versions[0].id).toBe(part.activeVersionId);
    expect(part.triangles).toBe(12);
    expect(part.visible).toBe(true);
    expect(part.thumbnail).toBe(card.thumbnail);
    expect(part.transform.rotation).toEqual({ x: 0, y: 0, z: 0 });
    expect(part.addedAt).toBe(1000);
  });
});

describe('favoritesOf', () => {
  it('lists the cards newest first and skips one taken off the shelf', () => {
    const shelf = emptyShelf();
    const older = shelfPart({ ...card, name: 'Older' }, soup, 1000);
    const newer = shelfPart({ ...card, name: 'Newer' }, soup, 2000);
    const gone = { ...shelfPart({ ...card, name: 'Gone' }, soup, 3000), visible: false };
    shelf.parts = [older, gone, newer];

    const cards = favoritesOf(shelf);
    expect(cards.map((entry) => entry.name)).toEqual(['Newer', 'Older']);
    expect(cards[0].versionId).toBe(newer.activeVersionId);
    expect(cards[0].thumbnail).toBe(card.thumbnail);
  });

  it('starts from an empty shelf with the fixed id', () => {
    const shelf = emptyShelf();
    expect(shelf.id).toBe(FAVORITES_ID);
    expect(shelf.name).toBe(FAVORITES_NAME);
    expect(favoritesOf(shelf)).toEqual([]);
  });
});

describe('collections — a shelf from before there were several', () => {
  const legacy = () => {
    const shelf = emptyShelf();
    shelf.parts = [
      { ...shelfPart({ ...card, name: 'Grip vinna 13' }, soup, 1000), starred: undefined },
      shelfPart({ ...card, name: 'Mag adapter', starred: true }, soup, 2000),
      { ...shelfPart({ ...card, name: 'Gone' }, soup, 3000), visible: false },
    ];
    // Saved before collections and categories existed: no such fields at all.
    for (const part of shelf.parts) delete part.collectionId;
    return shelf;
  };

  it('reads every saved part into one default collection, Safnið mitt', () => {
    const shelf = normalizeShelf(legacy());
    expect(shelf.collections).toEqual([{ id: DEFAULT_COLLECTION_ID, name: DEFAULT_COLLECTION_NAME, createdAt: 0 }]);
    expect(DEFAULT_COLLECTION_NAME).toBe('Safnið mitt');
    expect(shelf.parts.map((part) => part.collectionId)).toEqual([
      DEFAULT_COLLECTION_ID,
      DEFAULT_COLLECTION_ID,
      DEFAULT_COLLECTION_ID,
    ]);
    const snapshot = librarySnapshot(legacy());
    expect(snapshot.favorites.map((entry) => [entry.name, entry.collectionId])).toEqual([
      ['Mag adapter', DEFAULT_COLLECTION_ID],
      ['Grip vinna 13', DEFAULT_COLLECTION_ID],
    ]);
    // Nothing lost on the way: the star of an old favourite still holds, the hidden one stays hidden.
    expect(snapshot.favorites.every((entry) => entry.starred)).toBe(true);
    expect(snapshot.buildCategories).toEqual({});
  });

  it('stores the move on the next write, and reads the same again', () => {
    const stored = withCategories(legacy(), []);
    expect(stored.collections).toHaveLength(1);
    expect(stored.parts.every((part) => part.collectionId === DEFAULT_COLLECTION_ID)).toBe(true);
    expect(normalizeShelf(stored)).toEqual(stored);
  });

  it('puts a part of a collection that is gone into the default one, and drops a doubled collection', () => {
    const shelf = legacy();
    shelf.collections = [
      { id: DEFAULT_COLLECTION_ID, name: 'Safnið mitt', createdAt: 0 },
      { id: 'col_b', name: 'AK', createdAt: 5 },
      { id: 'col_b', name: 'AK again', createdAt: 6 },
    ];
    shelf.parts[0].collectionId = 'col_b';
    shelf.parts[1].collectionId = 'col_gone';
    const normal = normalizeShelf(shelf);
    expect(normal.collections?.map((entry) => entry.name)).toEqual(['Safnið mitt', 'AK']);
    expect(normal.parts.map((part) => part.collectionId)).toEqual(['col_b', DEFAULT_COLLECTION_ID, DEFAULT_COLLECTION_ID]);
  });
});

describe('collections — make, rename, move, delete', () => {
  const start = () => {
    const shelf = emptyShelf();
    shelf.parts = [shelfPart({ ...card, name: 'A' }, soup, 1000), shelfPart({ ...card, name: 'B' }, soup, 2000)];
    return normalizeShelf(shelf);
  };

  it('makes a collection under a name, and refuses an empty name', () => {
    const { shelf, collection } = withNewCollection(start(), '  AK-verkefni ', 'col_ak', 50);
    expect(collection).toEqual({ id: 'col_ak', name: 'AK-verkefni', createdAt: 50 });
    expect(shelf.collections?.map((entry) => entry.id)).toEqual([DEFAULT_COLLECTION_ID, 'col_ak']);
    expect(() => withNewCollection(start(), '   ')).toThrow();
    expect(withCollectionRenamed(shelf, 'col_ak', 'AK 47').collections?.[1].name).toBe('AK 47');
    expect(() => withCollectionRenamed(shelf, 'col_ak', '')).toThrow();
  });

  it('moves a part between collections, only into one that exists', () => {
    const { shelf } = withNewCollection(start(), 'AK', 'col_ak');
    const id = shelf.parts[0].id;
    const moved = withFavoriteMoved(shelf, id, 'col_ak');
    expect(favoritesOf(moved).find((entry) => entry.id === id)?.collectionId).toBe('col_ak');
    expect(() => withFavoriteMoved(shelf, id, 'col_nope')).toThrow();
  });

  it('deletes a collection with its parts moved, or with its parts taken off the shelf — hidden, not erased', () => {
    const made = withNewCollection(start(), 'AK', 'col_ak').shelf;
    const shelf = withFavoriteMoved(made, made.parts[0].id, 'col_ak');

    const movedAway = withCollectionDeleted(shelf, 'col_ak', DEFAULT_COLLECTION_ID);
    expect(movedAway.collections?.map((entry) => entry.id)).toEqual([DEFAULT_COLLECTION_ID]);
    expect(favoritesOf(movedAway)).toHaveLength(2);

    const dropped = withCollectionDeleted(shelf, 'col_ak', null);
    expect(favoritesOf(dropped).map((entry) => entry.name)).toEqual(['B']);
    expect(dropped.parts).toHaveLength(2);
    expect(dropped.parts.find((part) => part.name === 'A')?.visible).toBe(false);
  });

  it('keeps the last collection, and will not move parts into the one being deleted', () => {
    expect(() => withCollectionDeleted(start(), DEFAULT_COLLECTION_ID, null)).toThrow();
    const { shelf } = withNewCollection(start(), 'AK', 'col_ak');
    expect(() => withCollectionDeleted(shelf, 'col_ak', 'col_ak')).toThrow();
    // The default one can go too once there is another; its parts then land in the one left.
    const gone = withCollectionDeleted(shelf, DEFAULT_COLLECTION_ID, 'col_ak');
    expect(normalizeShelf(gone).parts.every((part) => part.collectionId === 'col_ak')).toBe(true);
  });

  it('saves a new part into the collection and category it was given', () => {
    const part = shelfPart({ ...card, collectionId: 'col_ak', category: { category: 'grip', auto: true } }, soup, 1);
    expect(part.collectionId).toBe('col_ak');
    expect(part.category).toBe('grip');
    expect(part.categoryAuto).toBe(true);
    const shelf = emptyShelf();
    shelf.collections = [{ id: 'col_ak', name: 'AK', createdAt: 0 }];
    shelf.parts = [part];
    expect(favoritesOf(shelf)[0].category).toEqual({ category: 'grip', auto: true });
  });
});

describe('categories on the shelf', () => {
  it('sets, confirms and clears the category of saved parts and of build parts', () => {
    const shelf = emptyShelf();
    shelf.parts = [shelfPart({ ...card, name: 'A' }, soup, 1)];
    const id = shelf.parts[0].id;

    const suggested = withCategories(shelf, [
      { kind: 'library', id, mark: { category: 'body', auto: true } },
      { kind: 'build', key: 'prj_a/p1', name: 'Gikkur', triangles: 12, mark: { category: 'triggerbody', auto: true } },
    ]);
    expect(favoritesOf(suggested)[0].category).toEqual({ category: 'body', auto: true });
    expect(suggested.buildCategories?.['prj_a/p1']).toEqual({
      category: 'triggerbody',
      auto: true,
      name: 'Gikkur',
      triangles: 12,
    });

    const confirmed = withCategories(suggested, [{ kind: 'library', id, mark: { category: 'body' } }]);
    expect(confirmed.parts[0].category).toBe('body');
    expect(confirmed.parts[0].categoryAuto).toBeUndefined();

    const cleared = withCategories(confirmed, [
      { kind: 'library', id },
      { kind: 'build', key: 'prj_a/p1', name: 'Gikkur', triangles: 12 },
    ]);
    expect(favoritesOf(cleared)[0].category).toBeUndefined();
    expect(cleared.buildCategories).toEqual({});
  });

  it('shows the same change in the window as it stores', () => {
    const shelf = emptyShelf();
    shelf.parts = [shelfPart({ ...card, name: 'A' }, soup, 1)];
    const updates = [
      { kind: 'library' as const, id: shelf.parts[0].id, mark: { category: 'grip' as const } },
      { kind: 'build' as const, key: 'prj_a/p1', name: 'Gikkur', triangles: 12, mark: { category: 'none' as const } },
    ];
    expect(snapshotWithCategories(librarySnapshot(shelf), updates)).toEqual(librarySnapshot(withCategories(shelf, updates)));
  });

  it('finds a build part by its own key, or by name and size in another build', () => {
    const lookup = buildCategoryLookup({
      'prj_a/p1': { category: 'grip', name: 'Grip vinna 13', triangles: 100 },
      'prj_b/p9': { category: 'body', auto: true, name: 'Neðri', triangles: 7 },
    });
    expect(lookup({ key: 'prj_a/p1', name: 'renamed', triangles: 1 })).toEqual({ category: 'grip' });
    expect(lookup({ key: 'prj_c/p2', name: 'Grip vinna 13', triangles: 100 })).toEqual({ category: 'grip' });
    expect(lookup({ key: 'prj_c/p3', name: 'Neðri', triangles: 7 })).toEqual({ category: 'body', auto: true });
    expect(lookup({ key: 'prj_c/p4', name: 'Grip vinna 13', triangles: 101 })).toBeUndefined();
  });
});
