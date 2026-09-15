import { describe, expect, it } from 'vitest';
import { emptyShelf, favoritesOf, FAVORITES_NAME, shelfPart } from './favorites';
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
