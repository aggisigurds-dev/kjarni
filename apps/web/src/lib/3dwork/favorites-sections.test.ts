import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COLLECTION_ID,
  emptyShelf,
  librarySnapshot,
  normalizeShelf,
  shelfPart,
  withCollectionDeleted,
  withFavoriteMoved,
  withFavoriteSection,
  withNewCollection,
  withPinAdded,
  withPinChanged,
  withSectionAdded,
  withSectionDeleted,
  withSectionRenamed,
  withBuildPartsHidden,
  type BoardPin,
  type Shelf,
} from './favorites';

const soup = new Float32Array(9 * 4);

/** A shelf with an "Iron wolf" collection holding Innvols, Bodyparts and an Íhlutir board, and two parts. */
function ironWolf(): { shelf: Shelf; collection: string; innvols: string; body: string; board: string; a: string; b: string } {
  const made = withNewCollection(normalizeShelf(emptyShelf()), 'Iron wolf', 'col_iron', 1);
  let shelf = made.shelf;
  const innvols = withSectionAdded(shelf, 'col_iron', 'Innvols', 'parts', 'sec_innvols', 2);
  shelf = innvols.shelf;
  const body = withSectionAdded(shelf, 'col_iron', 'Bodyparts', 'parts', 'sec_body', 3);
  shelf = body.shelf;
  const board = withSectionAdded(shelf, 'col_iron', 'Íhlutir', 'board', 'sec_board', 4);
  shelf = board.shelf;
  const a = shelfPart({ name: 'Hamar', color: '#f00', materialId: 'pla', collectionId: 'col_iron', sectionId: 'sec_innvols' }, soup, 10);
  const b = shelfPart({ name: 'Grip', color: '#0f0', materialId: 'pla', collectionId: 'col_iron' }, soup, 11);
  shelf = { ...shelf, parts: [a, b] };
  return { shelf, collection: 'col_iron', innvols: 'sec_innvols', body: 'sec_body', board: 'sec_board', a: a.id, b: b.id };
}

describe('sub-categories (layers) in a collection', () => {
  it('keeps each collection its own named sub-categories, parts and boards', () => {
    const { shelf } = ironWolf();
    const iron = librarySnapshot(shelf).collections.find((entry) => entry.id === 'col_iron');
    expect(iron?.sections?.map((section) => `${section.name}:${section.kind}`)).toEqual([
      'Innvols:parts',
      'Bodyparts:parts',
      'Íhlutir:board',
    ]);
    const favorites = librarySnapshot(shelf).favorites;
    expect(favorites.find((entry) => entry.name === 'Hamar')?.sectionId).toBe('sec_innvols');
    expect(favorites.find((entry) => entry.name === 'Grip')?.sectionId).toBeUndefined();
  });

  it('sorts a part under a parts sub-category of its own collection only', () => {
    const { shelf, b, body, board } = ironWolf();
    const sorted = withFavoriteSection(shelf, b, body);
    expect(sorted.parts.find((part) => part.id === b)?.sectionId).toBe(body);
    expect(() => withFavoriteSection(shelf, b, board)).toThrow();
    expect(() => withFavoriteSection(shelf, b, 'sec_nowhere')).toThrow();
    expect(withFavoriteSection(sorted, b, null).parts.find((part) => part.id === b)?.sectionId).toBeUndefined();
  });

  it('renames and deletes a sub-category; its parts stay in the collection, unsorted', () => {
    const { shelf, a, innvols } = ironWolf();
    const renamed = withSectionRenamed(shelf, 'col_iron', innvols, 'Innvols v2');
    expect(renamed.collections?.find((entry) => entry.id === 'col_iron')?.sections?.[0].name).toBe('Innvols v2');
    expect(() => withSectionRenamed(shelf, 'col_iron', innvols, '  ')).toThrow();
    const gone = withSectionDeleted(shelf, 'col_iron', innvols);
    expect(gone.collections?.find((entry) => entry.id === 'col_iron')?.sections?.map((section) => section.id)).not.toContain(innvols);
    const part = gone.parts.find((entry) => entry.id === a);
    expect(part?.collectionId).toBe('col_iron');
    expect(part?.sectionId).toBeUndefined();
    expect(part?.visible).toBe(true);
  });

  it('leaves the old sub-category behind when a part moves to another collection', () => {
    const { shelf, a } = ironWolf();
    const moved = withFavoriteMoved(shelf, a, DEFAULT_COLLECTION_ID);
    const part = moved.parts.find((entry) => entry.id === a);
    expect(part?.collectionId).toBe(DEFAULT_COLLECTION_ID);
    expect(part?.sectionId).toBeUndefined();
  });

  it('drops a sub-category its collection no longer has, and keeps old shelves exactly as they were', () => {
    const { shelf, a } = ironWolf();
    const broken: Shelf = { ...shelf, parts: shelf.parts.map((part) => (part.id === a ? { ...part, sectionId: 'sec_gone' } : part)) };
    expect(normalizeShelf(broken).parts.find((part) => part.id === a)?.sectionId).toBeUndefined();
    // A collection without sub-categories is stored without the field.
    const plain = normalizeShelf(emptyShelf());
    expect(plain.collections?.[0]).not.toHaveProperty('sections');
  });

  it('moves parts out of a deleted collection without keeping its sub-categories', () => {
    const { shelf, a } = ironWolf();
    const gone = withCollectionDeleted(shelf, 'col_iron', DEFAULT_COLLECTION_ID);
    expect(gone.parts.find((part) => part.id === a)?.sectionId).toBeUndefined();
  });
});

describe('boards', () => {
  const pin = (id: string, x = 10): BoardPin => ({
    id,
    kind: 'image',
    image: 'ver_img_1',
    mime: 'image/webp',
    naturalWidth: 800,
    naturalHeight: 600,
    text: 'G1/4 fitting',
    x,
    y: 20,
    width: 240,
    createdAt: 5,
  });

  it('pins pictures and notes on a board and moves them', () => {
    const { shelf, board } = ironWolf();
    let next = withPinAdded(shelf, board, pin('pin_1'));
    next = withPinAdded(next, board, { id: 'pin_2', kind: 'note', text: 'Panta 2 stk', x: 300, y: 40, width: 180, createdAt: 6 });
    next = withPinChanged(next, board, 'pin_1', { x: 120, y: 80, width: 300, status: 'bought', kind: 'note', id: 'pin_x' });
    const pins = librarySnapshot(next).boards[board];
    expect(pins.map((entry) => entry.id)).toEqual(['pin_1', 'pin_2']);
    // Position, size and status change; id and kind stay what they were.
    expect(pins[0]).toMatchObject({ id: 'pin_1', kind: 'image', x: 120, y: 80, width: 300, status: 'bought' });
  });

  it('takes a pin off the board by hiding it: the window stops showing it, the document keeps it', () => {
    const { shelf, board } = ironWolf();
    const next = withPinChanged(withPinAdded(shelf, board, pin('pin_1')), board, 'pin_1', { hidden: true });
    expect(librarySnapshot(next).boards[board]).toEqual([]);
    expect(normalizeShelf(next).boards?.[board]).toHaveLength(1);
  });

  it('drops malformed pins when it reads a shelf', () => {
    const { shelf, board } = ironWolf();
    const junk = { ...shelf, boards: { [board]: [pin('pin_1'), { id: 3 }, { id: 'p', kind: 'video', x: 1 }] as unknown as BoardPin[] } };
    expect(normalizeShelf(junk).boards?.[board].map((entry) => entry.id)).toEqual(['pin_1']);
  });
});

describe('part status', () => {
  it('reads printed / made / bought and ignores anything else', () => {
    const { shelf, a, b } = ironWolf();
    const marked: Shelf = {
      ...shelf,
      parts: shelf.parts.map((part) =>
        part.id === a ? { ...part, status: 'printed' } : part.id === b ? { ...part, status: 'lost' as never } : part
      ),
    };
    const favorites = librarySnapshot(marked).favorites;
    expect(favorites.find((entry) => entry.id === a)?.status).toBe('printed');
    expect(favorites.find((entry) => entry.id === b)?.status).toBeUndefined();
  });
});

describe('build parts taken off „Allir partar"', () => {
  const box = { name: 'Box 30 mm', triangles: 12 };
  const test = { name: 'grip-test', triangles: 4 };

  it('lists them by name and size, once each, and the snapshot shows them', () => {
    let shelf = withBuildPartsHidden(normalizeShelf(emptyShelf()), [box, box], true, 5);
    shelf = withBuildPartsHidden(shelf, [test], true, 6);
    expect(shelf.hiddenBuildParts).toEqual([
      { name: 'Box 30 mm', triangles: 12, hiddenAt: 5 },
      { name: 'grip-test', triangles: 4, hiddenAt: 6 },
    ]);
    expect(librarySnapshot(shelf).hiddenBuildParts.map((entry) => entry.name)).toEqual(['Box 30 mm', 'grip-test']);
  });

  it('puts one back, and drops the list when it is empty', () => {
    const shelf = withBuildPartsHidden(normalizeShelf(emptyShelf()), [box, test], true, 5);
    const back = withBuildPartsHidden(shelf, [box], false);
    expect(back.hiddenBuildParts?.map((entry) => entry.name)).toEqual(['grip-test']);
    const none = withBuildPartsHidden(back, [test], false);
    expect('hiddenBuildParts' in none).toBe(false);
    expect(librarySnapshot(none).hiddenBuildParts).toEqual([]);
  });

  it('keeps the saved parts and collections as they were, and drops malformed entries', () => {
    const { shelf, a, b } = ironWolf();
    const hidden = withBuildPartsHidden(shelf, [box], true, 5);
    expect(hidden.parts.map((part) => part.id)).toEqual([a, b]);
    expect(hidden.collections).toEqual(normalizeShelf(shelf).collections);
    const messy = normalizeShelf({ ...shelf, hiddenBuildParts: [null, { name: 3 }, { name: 'x', triangles: 'y' }] as never });
    expect('hiddenBuildParts' in messy).toBe(false);
  });
});
